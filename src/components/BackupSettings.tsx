import { useEffect, useState, useRef } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Input } from "./ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Progress } from "./ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Database,
  HardDrive,
  X,
  Trash2,
  AlertTriangle,
  Mail,
  MessageCircle,
  Upload,
  FileText,
  Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  triggerBackup,
  getBackupStatus,
  getBackupSettings,
  updateBackupEnabled,
  getBackupHistory,
  generateSignedUrl,
  cancelBackup,
  deleteBackup,
  restoreBackup,
  shareBackup,
  updateBackup,
} from "../lib/backupApi";

interface BackupHistoryItem {
  id: string;
  s3_key: string | null;
  created_at: string;
  status: "success" | "failed" | "cancelled" | "in_progress";
  size_bytes: number | null;
  error_text: string | null;
  dispatch_id?: string | null;
}

// ✅ OPTIMIZED: Exponential backoff polling - starts fast, slows down
const INITIAL_POLL_INTERVAL_MS = 1000; // Start with 1 second
const MAX_POLL_INTERVAL_MS = 10000; // Max 10 seconds between polls
const MAX_POLL_ATTEMPTS = 300; // Reduced from 1200 - GitHub Actions completes in <1 min

interface BackupSettingsProps {
  autoBackup?: boolean;
  onAutoBackupChange?: (enabled: boolean) => void;
}

export function BackupSettings({ autoBackup, onAutoBackupChange }: BackupSettingsProps = {}) {
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [inProgressProgress, setInProgressProgress] = useState<Record<string, number>>({});
  
  // ✅ NEW: Filter state
  const [statusFilter, setStatusFilter] = useState<'all' | 'success' | 'failed' | 'cancelled' | 'in_progress'>('all');
  const [dateFilter, setDateFilter] = useState<{
    start?: string;
    end?: string;
  }>({});
  const [searchQuery, setSearchQuery] = useState('');
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedPollingRef = useRef(false);
  const cancelPollingRef = useRef(false);
  const lastHistoryRefreshRef = useRef(0);
  const finalizationAttemptsRef = useRef<Record<string, number>>({});
  const backgroundMonitoringStartedRef = useRef<Record<string, boolean>>({});
  const FINALIZATION_THRESHOLD = 2;
  const [manualBackupProgress, setManualBackupProgress] = useState<{
    isRunning: boolean;
    progress: number;
    dispatchId: string | null;
    backupId?: string | null;
    isTimedOut?: boolean;
    currentStep?: string; // ✅ NEW: Current workflow step
  }>({
    isRunning: false,
    progress: 0,
    dispatchId: null,
    backupId: null,
    isTimedOut: false,
    currentStep: undefined,
  });
  
  // Ref to track cancellation
  
  // Dialog state for cancel confirmation
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [cancelTargetId, setCancelTargetId] = useState<string | null>(null);
  const [cancelAllDialogOpen, setCancelAllDialogOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  
  // Dialog state for delete confirmation
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteTargetDate, setDeleteTargetDate] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Dialog state for restore
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreResults, setRestoreResults] = useState<any>(null);
  
  // ✅ NEW: File upload tracking
  const [uploadFiles, setUploadFiles] = useState<Array<{
    id: string;
    name: string;
    size: number;
    progress: number;
    status: 'uploading' | 'completed' | 'error';
    error?: string;
  }>>([]);
  
  // ✅ NEW: Sharing configuration
  const [sharingConfig, setSharingConfig] = useState({
    emailEnabled: false,
    whatsappEnabled: false,
    emailRecipient: '',
    whatsappRecipient: '',
    autoDownload: false,
  });
  
  // ✅ NEW: Share dialog state - separate for email and WhatsApp
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [whatsappDialogOpen, setWhatsappDialogOpen] = useState(false);
  const [shareBackupId, setShareBackupId] = useState<string | null>(null);
  const [emailRecipient, setEmailRecipient] = useState("");
  const [whatsappRecipient, setWhatsappRecipient] = useState("");
  const [isSharing, setIsSharing] = useState(false);

  // Load initial settings and history
  useEffect(() => {
    loadSettings();
    loadHistory();
  }, []);

  // Poll for in-progress backups in history (update progress only, don't refresh history)
  useEffect(() => {
    // Clean up any existing interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    const inProgressItems = history.filter(item => item.status === "in_progress");
    
    if (inProgressItems.length === 0) {
      hasStartedPollingRef.current = false;
      return;
    }

    // Only log once when polling starts
    if (!hasStartedPollingRef.current) {
      console.log(`[Backup] Found ${inProgressItems.length} in-progress backup(s), starting progress updates...`);
      hasStartedPollingRef.current = true;
    }

    const updateProgressForBackups = async () => {
      const currentInProgress = history.filter(item => item.status === "in_progress");
      
      // ✅ FIX: Track if any backup status actually changed to completed/failed (not just progress)
      let shouldRefreshHistory = false;
      
      for (const item of currentInProgress) {
        // ✅ NEW FIX: Check if backup has S3 key but status is still in_progress (workflow completed)
        // This handles the case where workflow finished but DB update is delayed
        if (item.s3_key) {
          console.log(`[Backup] Backup ${item.id} has S3 key but status is still in_progress. Workflow completed, refreshing history...`);
          shouldRefreshHistory = true;
          setInProgressProgress(prev => ({
            ...prev,
            [item.id]: 100, // Set to 100% since S3 key exists
          }));
          continue; // Skip API call since we know it's done
        }
        
        // ✅ FIXED: Get real progress from API instead of estimating
        if (item.dispatch_id) {
          try {
            const status = await getBackupStatus(item.dispatch_id);
            
            // ✅ FIX: Only refresh history when status actually changes (success/failed), not just when progress is 100%
            if (status.status === "success" || status.status === "failed") {
              setInProgressProgress(prev => ({
                ...prev,
                [item.id]: 100, // Set to 100% when complete
              }));
              shouldRefreshHistory = true; // Only refresh when status actually changes
            } else if (status.progress !== undefined) {
              // ✅ FIX: Update progress for in-progress backups
              // Also check if progress is 100% - if so, check history for S3 key
              setInProgressProgress(prev => {
                const currentProgress = prev[item.id] || 10;
                const newProgress = status.progress!;
                
                // If progress reached 100%, check if backup has S3 key in history
                if (newProgress >= 100) {
                  // Check current history item for S3 key
                  const historyItem = history.find(h => h.id === item.id);
                  if (historyItem?.s3_key) {
                    // S3 key exists - workflow completed, refresh history to get updated status
                    shouldRefreshHistory = true;
                  }
                  return {
                    ...prev,
                    [item.id]: 100,
                  };
                }
                
                // Only update if progress changed significantly (avoid unnecessary re-renders)
                if (Math.abs(currentProgress - newProgress) >= 1) {
                  return {
                    ...prev,
                    [item.id]: newProgress,
                  };
                }
                return prev;
              });
            }
          } catch (error) {
            // Fallback to time-based estimate if API call fails
            const createdAt = new Date(item.created_at).getTime();
            const now = Date.now();
            const elapsedMinutes = (now - createdAt) / (1000 * 60);
            const estimatedProgress = Math.min(10 + Math.floor((elapsedMinutes / 15) * 85), 95);
            
            setInProgressProgress(prev => {
              const currentProgress = prev[item.id] || 10;
              if (Math.abs(currentProgress - estimatedProgress) >= 1) {
                return {
                  ...prev,
                  [item.id]: estimatedProgress,
                };
              }
              return prev;
            });
          }
        }
      }

      // ✅ FIX: Refresh history if any backup completed/failed (throttled)
      // Also refresh if any backup has S3 key (workflow completed)
      if (shouldRefreshHistory) {
        const now = Date.now();
        // Reduce throttle time to 2 seconds for faster updates when backups complete
        if (now - lastHistoryRefreshRef.current > 2000) {
          console.log("[Backup] Backup status changed or S3 key detected, refreshing history...");
          await loadHistory();
          lastHistoryRefreshRef.current = now;
        }
      }

      // ✅ FIX: Clear progress for items that are no longer in progress (completed/failed/cancelled)
      const allBackupIds = new Set(history.map(item => item.id));
      const completedBackupIds = new Set(
        history
          .filter(item => item.status === "success" || item.status === "failed" || item.status === "cancelled")
          .map(item => item.id)
      );
      
      setInProgressProgress(prev => {
        const updated = { ...prev };
        // Remove progress for completed/failed/cancelled backups
        completedBackupIds.forEach(id => {
          delete updated[id];
        });
        // Also remove progress for backups that no longer exist in history
        Object.keys(updated).forEach(id => {
          if (!allBackupIds.has(id)) {
            delete updated[id];
          }
        });
        return updated;
      });

      // If no more in-progress items, stop polling
      if (currentInProgress.length === 0) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          hasStartedPollingRef.current = false;
        }
      }
    };

    // Update progress immediately
    updateProgressForBackups();
    
    // ✅ FIX: Update progress more frequently for real-time updates (especially when backup is fast)
    // Update every 2 seconds to catch fast backups (like 1-minute backups)
    pollingIntervalRef.current = setInterval(() => {
      updateProgressForBackups();
    }, 2000);

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [history]);

  // Cleanup: reset cancellation flag when component unmounts
  useEffect(() => {
    return () => {
      cancelPollingRef.current = false;
    };
  }, []);

  const loadSettings = async () => {
    try {
      const settings = await getBackupSettings();
      setBackupEnabled(settings.backup_enabled);
      setLastBackupAt(settings.last_backup_at);
    } catch (error) {
      console.error("Failed to load backup settings:", error);
      toast.error("Failed to load backup settings");
    }
  };

  const loadHistory = async () => {
    setIsLoadingHistory(true);
    try {
      // ✅ NEW: Apply filters when loading history
      const historyData = await getBackupHistory(50, {
        status: statusFilter === 'all' ? undefined : statusFilter,
        start_date: dateFilter.start,
        end_date: dateFilter.end,
        search: searchQuery || undefined,
      });
      setHistory(historyData);
    } catch (error) {
      console.error("Failed to load backup history:", error);
      toast.error("Failed to load backup history");
    } finally {
      setIsLoadingHistory(false);
    }
  };
  
  // ✅ NEW: Reload history when filters change
  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, dateFilter.start, dateFilter.end, searchQuery]);

  // Background monitoring for timed-out backups
  const startBackgroundMonitoring = (dispatchId: string, backupId?: string | null) => {
    console.log(`[Backup] Starting background monitoring for dispatch_id: ${dispatchId}, backup_id: ${backupId || 'not available'}`);
    
    let checkCount = 0;
    const MAX_BACKGROUND_CHECKS = 120; // 1 hour (120 * 30s = 3600s)
    let monitoringStopped = false; // ✅ FIX: Track if monitoring was stopped to prevent multiple stops
    
    const stopMonitoring = () => {
      if (monitoringStopped) return; // Prevent multiple stops
      monitoringStopped = true;
      clearInterval(checkInterval);
      console.log(`[Backup] Background monitoring stopped for dispatch_id: ${dispatchId}`);
    };
    
    const checkInterval = setInterval(async () => {
      if (monitoringStopped) {
        clearInterval(checkInterval);
        return;
      }
      
      checkCount++;
      // ✅ FIX: Only log every 5th check to reduce console spam
      if (checkCount % 5 === 0 || checkCount === 1) {
        console.log(`[Backup] Background check ${checkCount}/${MAX_BACKGROUND_CHECKS}...`);
      }
      
      try {
        // First, try to check via backup_id in history (faster and more reliable)
        if (backupId) {
          const history = await getBackupHistory(10);
          const backup = history.find(b => b.id === backupId);
          
          if (backup) {
            if (backup.status === "success" && backup.s3_key) {
              // Backup completed!
              stopMonitoring();
              // ✅ FIX: Reset all state when backup completes
              setIsLoading(false);
              setManualBackupProgress((prev) => ({
                ...prev,
                progress: 100,
                isRunning: false,
                isTimedOut: false,
              }));
              try {
                const { signed_url } = await generateSignedUrl(backup.s3_key);
                toast.success("Backup completed! Opening download...");
                window.open(signed_url, "_blank");
              } catch (downloadError) {
                console.error("[Backup] Failed to generate download URL:", downloadError);
                toast.success("Backup completed! Check the backup history to download.");
              }
              await loadHistory();
              return;
            } else if (backup.status === "failed") {
              // Backup failed
              stopMonitoring();
              setIsLoading(false);
              setManualBackupProgress((prev) => ({
                ...prev,
                isRunning: false,
                isTimedOut: false,
              }));
              toast.error(`Backup failed: ${backup.error_text || "Unknown error"}`);
              await loadHistory();
              return;
            } else if (backup.status === "cancelled") {
              // Backup was cancelled
              stopMonitoring();
              setIsLoading(false);
              setManualBackupProgress((prev) => ({
                ...prev,
                isRunning: false,
                isTimedOut: false,
              }));
              await loadHistory();
              return;
            }
            // ✅ FIX: Check if backup has S3 key even if status is still "in_progress"
            // This handles the case where workflow completed but DB update step failed/delayed
            // Check immediately - if S3 key exists, workflow is done
            if (backup.status === "in_progress" && backup.s3_key) {
              // Workflow completed (has S3 key) but status not updated - treat as success immediately
              console.log("[Backup] Backup has S3 key but status still in_progress. Workflow completed, treating as success.");
              stopMonitoring();
              setIsLoading(false);
              setManualBackupProgress((prev) => ({
                ...prev,
                progress: 100,
                isRunning: false,
                isTimedOut: false,
              }));
              try {
                const { signed_url } = await generateSignedUrl(backup.s3_key);
                toast.success("Backup completed! Opening download...");
                window.open(signed_url, "_blank");
              } catch (downloadError) {
                console.error("[Backup] Failed to generate download URL:", downloadError);
                toast.success("Backup completed! Check the backup history to download.");
              }
              await loadHistory();
              return;
            }
            
            // Still in progress, continue monitoring (only log every 5th check)
            if (checkCount % 5 === 0) {
              console.log(`[Backup] Background check: backup still ${backup.status}${backup.s3_key ? ' (has S3 key)' : ''}`);
            }
          }
        }
        
        // Also check via status API as fallback
        const status = await getBackupStatus(dispatchId);
        
        if (status.status === "success" && status.signed_url) {
          // Backup completed!
          stopMonitoring();
          // ✅ FIX: Reset all state when backup completes
          setIsLoading(false);
          setManualBackupProgress((prev) => ({
            ...prev,
            progress: 100,
            isRunning: false,
            isTimedOut: false,
          }));
          toast.success("Backup completed! Opening download...");
          window.open(status.signed_url, "_blank");
          await loadHistory();
        } else if (status.status === "failed") {
          // Backup failed
          stopMonitoring();
          setIsLoading(false);
          setManualBackupProgress((prev) => ({
            ...prev,
            isRunning: false,
            isTimedOut: false,
          }));
          toast.error(`Backup failed: ${status.error || "Unknown error"}`);
          await loadHistory();
        } else if (status.progress === 100 && status.status === "in_progress") {
          // ✅ FIX: Workflow completed (progress 100%) but DB hasn't updated yet
          // Check if backup has S3 key in history (workflow might have completed but DB update delayed)
          // Check immediately - if S3 key exists, workflow is done
          const history = await getBackupHistory(10);
          const backup = history.find(b => 
            b.dispatch_id === dispatchId || 
            (backupId && b.id === backupId)
          );
          
          if (backup && backup.s3_key && backup.status === "in_progress") {
            // ✅ FALLBACK: Workflow completed, S3 key exists, but status not updated
            // This means the workflow finished but the DB update step might have failed
            // Treat as success and allow download
            console.log("[Backup] Workflow completed but status not updated. S3 key exists, treating as success.");
            stopMonitoring();
            setIsLoading(false);
            setManualBackupProgress((prev) => ({
              ...prev,
              progress: 100,
              isRunning: false,
              isTimedOut: false,
            }));
            try {
              const { signed_url } = await generateSignedUrl(backup.s3_key);
              toast.success("Backup completed! Opening download...");
              window.open(signed_url, "_blank");
            } catch (downloadError) {
              console.error("[Backup] Failed to generate download URL:", downloadError);
              toast.success("Backup completed! Check the backup history to download.");
            }
            await loadHistory();
            return;
          }
          
          // ✅ FALLBACK: After 10 checks (30 seconds), try to manually trigger DB update
          // This handles the case where GitHub Actions workflow completed but DB update step failed
          if (checkCount >= 10 && checkCount % 10 === 0) {
            console.log(`[Backup] Workflow completed but DB not updated after ${checkCount} checks. Attempting manual update...`);
            
            try {
              // Try to get the backup from history to see if it has an s3_key
              const history = await getBackupHistory(10);
              const backup = history.find(b => 
                b.dispatch_id === dispatchId || 
                (backupId && b.id === backupId)
              );
              
              if (backup) {
                // If backup has s3_key but status is still in_progress, try to update it
                if (backup.s3_key && backup.status === "in_progress") {
                  console.log("[Backup] Found backup with s3_key but status still in_progress. Attempting to update via API...");
                  
                  try {
                    // Try to call the update-backup API
                    await updateBackup(
                      backup.id,
                      dispatchId,
                      backup.s3_key,
                      "success",
                      backup.size_bytes || null,
                      null
                    );
                    console.log("[Backup] Successfully updated backup status via API");
                    await loadHistory();
                    return; // Exit monitoring, update should be reflected
                  } catch (updateError) {
                    console.warn("[Backup] Failed to update backup via API:", updateError);
                    // Continue monitoring
                  }
                }
              }
            } catch (error) {
              console.warn("[Backup] Error attempting manual update:", error);
            }
          }
          
          // Still waiting for DB update (only log every 5th check)
          if (checkCount % 5 === 0) {
            console.log(`[Backup] Background check: workflow completed (100%) but status still in_progress, waiting for DB update... (check ${checkCount})`);
          }
        } else {
          // Still in progress, continue monitoring (only log every 5th check)
          if (checkCount % 5 === 0) {
            console.log(`[Backup] Background check: still ${status.status} (progress: ${status.progress ?? 'N/A'}%)`);
          }
        }
      } catch (error) {
        console.warn("[Backup] Background monitoring error:", error);
        // Continue monitoring on error
      }
    }, 30000); // Check every 30 seconds
    
    // Stop monitoring after 1 hour (120 checks)
    setTimeout(() => {
      if (!monitoringStopped) {
        stopMonitoring();
        console.log("[Backup] Background monitoring stopped after 1 hour");
        setManualBackupProgress((prev) => ({
          ...prev,
          isTimedOut: false,
        }));
      }
    }, 60 * 60 * 1000); // 1 hour
  };

  const handleToggleBackup = async (enabled: boolean) => {
    setIsToggling(true);
    try {
      await updateBackupEnabled(enabled);
      setBackupEnabled(enabled);
      // Sync with Settings.tsx auto backup setting
      if (onAutoBackupChange) {
        onAutoBackupChange(enabled);
      }
      toast.success(`Backup ${enabled ? "enabled" : "disabled"}`);
    } catch (error) {
      console.error("Failed to update backup setting:", error);
      toast.error("Failed to update backup setting");
      // Revert toggle on error
      setBackupEnabled(!enabled);
    } finally {
      setIsToggling(false);
    }
  };

  // Sync backupEnabled with autoBackup prop from Settings
  useEffect(() => {
    if (autoBackup !== undefined && autoBackup !== backupEnabled) {
      setBackupEnabled(autoBackup);
    }
  }, [autoBackup]);

  const handleCancelBackup = async () => {
    cancelPollingRef.current = true;
    
    // If we have a backup_id, cancel it in the database
    if (manualBackupProgress.backupId) {
      try {
        console.log("[Backup] Cancelling backup in database:", manualBackupProgress.backupId);
        await cancelBackup(manualBackupProgress.backupId);
        toast.success("Backup cancelled successfully");
      } catch (error) {
        console.error("[Backup] Failed to cancel backup:", error);
        toast.error("Failed to cancel backup in database. It may still be running.");
      }
    } else if (manualBackupProgress.dispatchId) {
      // If we don't have backup_id yet, try to find it from history
      try {
        const history = await getBackupHistory(10);
        const matchingBackup = history.find(b => b.dispatch_id === manualBackupProgress.dispatchId);
        if (matchingBackup && matchingBackup.status === "in_progress") {
          console.log("[Backup] Found matching backup, cancelling:", matchingBackup.id);
          await cancelBackup(matchingBackup.id);
          toast.success("Backup cancelled successfully");
        } else {
          toast.info("Backup polling cancelled. The backup may still be running in the background.");
        }
      } catch (error) {
        console.error("[Backup] Failed to find and cancel backup:", error);
        toast.info("Backup polling cancelled. The backup may still be running in the background.");
      }
    } else {
      toast.info("Backup polling cancelled. The backup may still be running in the background.");
    }
    
    setIsLoading(false);
    setManualBackupProgress({
      isRunning: false,
      progress: 0,
      dispatchId: null,
      backupId: null,
      isTimedOut: false,
    });
    
    // Refresh history to see updated status
    await loadHistory();
  };

  const handleDownloadNow = async () => {
    // Reset cancellation flag
    cancelPollingRef.current = false;
    finalizationAttemptsRef.current = {};
    backgroundMonitoringStartedRef.current = {};
    
    setIsLoading(true);
    setManualBackupProgress({
      isRunning: true,
      progress: 0,
      dispatchId: null,
      backupId: null,
      isTimedOut: false,
    });

    try {
      // Trigger backup
      const { dispatch_id } = await triggerBackup();
      setManualBackupProgress((prev) => ({
        ...prev,
        dispatchId: dispatch_id,
        progress: 10,
      }));

      toast.info("Backup started. This may take several minutes for large databases...");

      // Poll for status
      let pollAttempts = 0;
      const pollStatus = async (): Promise<string | null> => {
        // Check if cancelled
        if (cancelPollingRef.current) {
          console.log("[Backup] Polling cancelled by user");
          throw new Error("Backup polling cancelled");
        }

        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
          // Before timing out, do multiple final checks with delays
          console.warn(`[Backup] Polling timeout reached (${MAX_POLL_ATTEMPTS} attempts). Doing extended final checks...`);
          
          // Do 3 final checks with 5 second delays (total 15 seconds of extra checking)
          for (let finalCheck = 1; finalCheck <= 3; finalCheck++) {
            try {
              await new Promise((resolve) => setTimeout(resolve, 5000));
              console.log(`[Backup] Final check ${finalCheck}/3...`);
              const finalStatus = await getBackupStatus(dispatch_id);
              
              console.log(`[Backup] Final check ${finalCheck}/3 result:`, finalStatus);
              
              // Store backup_id if we get it
              if (finalStatus.backup_id && !manualBackupProgress.backupId) {
                setManualBackupProgress((prev) => ({
                  ...prev,
                  backupId: finalStatus.backup_id,
                }));
              }
              
              if (finalStatus.status === "success" && finalStatus.signed_url) {
                // Backup actually completed!
                setManualBackupProgress((prev) => ({
                  ...prev,
                  progress: 100,
                }));
                console.log("[Backup] Backup completed on final check!");
                return finalStatus.signed_url;
              } else if (finalStatus.status === "failed") {
                throw new Error(finalStatus.error || "Backup failed");
              } else if (finalStatus.status === "in_progress" || finalStatus.status === "pending") {
                // Still in progress, continue checking
                console.log(`[Backup] Still in progress on final check ${finalCheck}/3, continuing...`);
              }
            } catch (finalCheckError) {
              // If it's a failure error, throw it
              if (finalCheckError instanceof Error && finalCheckError.message.includes("Backup failed")) {
                throw finalCheckError;
              }
              // Otherwise, continue to next check
              console.warn(`[Backup] Final check ${finalCheck}/3 failed:`, finalCheckError);
            }
          }
          
          // Backup still not complete after all final checks
          console.warn(`[Backup] Backup still in progress after extended timeout. Will continue checking history in background.`);
          setManualBackupProgress((prev) => ({
            ...prev,
            progress: 95, // Show 95% to indicate it's almost done
            isTimedOut: true, // Mark as timed out but still monitoring
          }));
          throw new Error(
            `Backup is taking longer than expected (over 20 minutes). The backup is still running in the background. ` +
            `The system will continue checking automatically. You can close this dialog and check the backup history.`
          );
        }

        pollAttempts++;
        
        // ✅ FIXED: Progress is now updated from API response above
        // Only use fallback progress if API doesn't provide it
        // (This fallback should rarely be needed now)

        try {
          // Check cancellation before making API call
          if (cancelPollingRef.current) {
            throw new Error("Backup polling cancelled");
          }

          console.log(`[Backup] Polling attempt ${pollAttempts}/${MAX_POLL_ATTEMPTS} for dispatch_id: ${dispatch_id}`);
          const status = await getBackupStatus(dispatch_id);
          
          console.log(`[Backup] Poll attempt ${pollAttempts}/${MAX_POLL_ATTEMPTS} result:`, {
            status: status.status,
            hasSignedUrl: !!status.signed_url,
            error: status.error,
            backupId: status.backup_id,
            progress: status.progress,
            currentStep: status.current_step,
          });
          
          const workflowComplete = status.progress !== undefined && status.progress >= 100;
          
          // ✅ FIXED: Use real progress from API if available
          if (status.progress !== undefined || status.current_step) {
            const newProgress = status.progress !== undefined ? status.progress : manualBackupProgress.progress;
            setManualBackupProgress((prev) => ({
              ...prev,
              progress: newProgress,
              currentStep: status.current_step || prev.currentStep,
            }));
            
            if (workflowComplete) {
              finalizationAttemptsRef.current[dispatch_id] = (finalizationAttemptsRef.current[dispatch_id] || 0) + 1;
              if (status.status === "in_progress") {
                console.log("[Backup] Progress reached 100% - workflow completed, waiting for final status...");
              }
            } else {
              delete finalizationAttemptsRef.current[dispatch_id];
            }
          }
          
          // Store backup_id when we get it
          if (status.backup_id && !manualBackupProgress.backupId) {
            setManualBackupProgress((prev) => ({
              ...prev,
              backupId: status.backup_id,
            }));
          }

          // Check cancellation after API call
          if (cancelPollingRef.current) {
            throw new Error("Backup polling cancelled");
          }

          if (status.status === "success") {
            setManualBackupProgress((prev) => ({
              ...prev,
              progress: 100,
            }));
            console.log("[Backup] Backup completed successfully!");
            
            // If signed_url is provided, use it
            if (status.signed_url) {
              return status.signed_url;
            }
            
            // Otherwise, try to get it from backup_history using backup_id
            if (status.backup_id) {
              try {
                console.log("[Backup] No signed_url in status, fetching from backup_history...");
                const historyData = await getBackupHistory(10);
                const completedBackup = historyData.find(b => b.id === status.backup_id);
                
                if (completedBackup && completedBackup.s3_key) {
                  console.log("[Backup] Found backup in history, generating signed URL...");
                  const { signed_url } = await generateSignedUrl(completedBackup.s3_key);
                  return signed_url;
                } else {
                  console.warn("[Backup] Backup found in history but no s3_key available yet");
                  // Refresh history and try one more time
                  await loadHistory();
                  const refreshedHistory = await getBackupHistory(10);
                  const refreshedBackup = refreshedHistory.find(b => b.id === status.backup_id);
                  
                  if (refreshedBackup && refreshedBackup.s3_key) {
                    const { signed_url } = await generateSignedUrl(refreshedBackup.s3_key);
                    return signed_url;
                  }
                }
              } catch (urlError) {
                console.error("[Backup] Failed to generate signed URL from backup_history:", urlError);
                // Continue to show success message even if URL generation fails
              }
            }
            
            // If we still don't have a URL, return null to indicate success but no download URL yet
            console.log("[Backup] Backup completed successfully but no download URL available yet");
            toast.success("Backup completed successfully! Check the backup history to download.");
            setIsLoading(false);
            setManualBackupProgress((prev) => ({
              ...prev,
              isRunning: false,
            }));
            await loadHistory();
            return null;
          } else if (status.status === "failed") {
            console.error("[Backup] Backup failed:", status.error);
            // Get more details from backup_history if available
            if (status.backup_id) {
              try {
                const historyData = await getBackupHistory(10);
                const failedBackup = historyData.find(b => b.id === status.backup_id);
                if (failedBackup && failedBackup.error_text) {
                  throw new Error(`Backup failed: ${failedBackup.error_text}`);
                }
              } catch (historyError) {
                console.warn("[Backup] Could not fetch backup history for error details:", historyError);
              }
            }
            throw new Error(status.error || "Backup failed. Check GitHub Actions logs for details.");
          } else if (status.status === "in_progress" || status.status === "pending") {
            const finalizationAttempts = finalizationAttemptsRef.current[dispatch_id] || 0;
            
            // ✅ OPTIMIZED: Exponential backoff - start fast, slow down over time
            // If progress is 100%, use shorter delay initially, then slow down as we wait
            let pollDelay = workflowComplete ? 1500 : INITIAL_POLL_INTERVAL_MS;
            
            if (!workflowComplete) {
              if (pollAttempts > 20) {
                pollDelay = 2000;
              }
              if (pollAttempts > 50) {
                pollDelay = 5000;
              }
              if (pollAttempts > 100) {
                pollDelay = MAX_POLL_INTERVAL_MS;
              }
            } else if (finalizationAttempts > 10) {
              // Slow down if we've already polled multiple times at 100%
              pollDelay = Math.min(MAX_POLL_INTERVAL_MS, 3000 + (finalizationAttempts - 10) * 1000);
            }
            
            // If workflow is done but DB hasn't updated after multiple attempts, switch to background monitoring
            if (workflowComplete && finalizationAttempts >= FINALIZATION_THRESHOLD) {
              console.warn("[Backup] Workflow finished but status still in progress after multiple attempts. Monitoring in background.");
              const backupIdToMonitor = status.backup_id || manualBackupProgress.backupId || null;
              if (!backgroundMonitoringStartedRef.current[dispatch_id]) {
                backgroundMonitoringStartedRef.current[dispatch_id] = true;
                startBackgroundMonitoring(dispatch_id, backupIdToMonitor);
              }
              
              // ✅ FIX: Reset both isLoading and isRunning so button becomes enabled
              setIsLoading(false);
              setManualBackupProgress((prev) => ({
                ...prev,
                isRunning: false,
                isTimedOut: true,
                currentStep: "Finalizing backup (monitoring in background)",
              }));
              
              // ✅ FIX: Refresh history one more time to check if status updated
              await loadHistory();
              
              toast.info("Backup finished. Waiting for Supabase to finalize — monitoring in background.");
              cancelPollingRef.current = true;
              return null;
            }
            
            console.log(`[Backup] Still in progress (${status.status}, progress: ${status.progress ?? 'N/A'}%), polling again in ${pollDelay}ms... (attempt ${pollAttempts})`);
            await new Promise((resolve) => setTimeout(resolve, pollDelay));
            return pollStatus();
          } else {
            console.error("[Backup] Unknown status:", status);
            throw new Error(`Unknown backup status: ${status.status}`);
          }
        } catch (error) {
          // Check if cancelled
          if (cancelPollingRef.current) {
            throw new Error("Backup polling cancelled");
          }

          if (error instanceof Error && error.message.includes("Failed to get backup status")) {
            // Retry on transient errors with exponential backoff
            const retryDelay = Math.min(INITIAL_POLL_INTERVAL_MS * Math.pow(2, Math.floor(pollAttempts / 10)), MAX_POLL_INTERVAL_MS);
            console.warn(`[Backup] Transient error, retrying in ${retryDelay}ms... (attempt ${pollAttempts})`);
            await new Promise((resolve) => setTimeout(resolve, retryDelay));
            return pollStatus();
          }
          console.error("[Backup] Polling error:", error);
          throw error;
        }
      };

      const signedUrl = await pollStatus();

      if (signedUrl && !cancelPollingRef.current) {
        // Open download in new tab
        window.open(signedUrl, "_blank");
        toast.success("Backup completed! Download started.");
        // ✅ FIX: Reset loading state
        setIsLoading(false);
        setManualBackupProgress((prev) => ({
          ...prev,
          isRunning: false,
        }));
        // Refresh history and settings
        await Promise.all([loadHistory(), loadSettings()]);
      } else if (signedUrl === null && !cancelPollingRef.current) {
        // ✅ FIX: pollStatus returned null (switched to background monitoring)
        // State is already reset in the pollStatus function, just ensure isLoading is false
        setIsLoading(false);
      }
    } catch (error) {
      if (cancelPollingRef.current) {
        // User cancelled - don't show error, but reset state
        setIsLoading(false);
        setManualBackupProgress((prev) => ({
          ...prev,
          isRunning: false,
        }));
        return;
      }
      console.error("Backup failed:", error);
      
      // ✅ FIX: Always reset loading state on error
      setIsLoading(false);
      
      // If timeout occurred, refresh history to check if backup actually completed
      if (error instanceof Error && error.message.includes("taking longer than expected")) {
        // Refresh history to see if backup completed in the background
        await loadHistory();
        
        // Check if any backup just completed
        const latestHistory = await getBackupHistory(1);
        const latestBackup = latestHistory[0];
        
        if (latestBackup && latestBackup.status === "success" && latestBackup.s3_key) {
          // Backup actually completed! Generate signed URL and download
          try {
            const { signed_url } = await generateSignedUrl(latestBackup.s3_key);
            window.open(signed_url, "_blank");
            toast.success("Backup completed! Download started.");
            setManualBackupProgress((prev) => ({
              ...prev,
              progress: 100,
              isTimedOut: false,
            }));
            await loadHistory();
            return; // Exit early since backup completed
          } catch (downloadError) {
            console.error("[Backup] Failed to generate download URL:", downloadError);
          }
        }
        
        // Start background monitoring for this backup
        // Use backup_id if available (from final checks), otherwise use dispatchId
        const backupIdToMonitor = manualBackupProgress.backupId || 
          (latestBackup && latestBackup.status === "in_progress" ? latestBackup.id : undefined);
        
        if (manualBackupProgress.dispatchId) {
          console.log(`[Backup] Starting background monitoring with dispatchId: ${manualBackupProgress.dispatchId}, backupId: ${backupIdToMonitor || 'not available'}`);
          startBackgroundMonitoring(
            manualBackupProgress.dispatchId,
            backupIdToMonitor
          );
        }
        
        toast.info(
          "Backup is still running. The system will continue checking automatically. You can check the backup history for updates.",
          { duration: 8000 } // Show for 8 seconds
        );
      } else {
        // For other errors, extract detailed error message
        let errorMessage = error instanceof Error ? error.message : "Failed to create backup. Please try again.";
        
        // Extract the actual error from Edge Function response
        if (errorMessage.includes("Edge Function trigger-backup failed:")) {
          const match = errorMessage.match(/Edge Function trigger-backup failed: (.+)/);
          if (match && match[1]) {
            errorMessage = match[1];
          }
        }
        
        // Log full error for debugging
        console.error("[Backup] Full error details:", {
          error,
          errorMessage,
          errorType: error instanceof Error ? error.constructor.name : typeof error,
        });
        
        try {
          // Refresh history to get latest error details
          await loadHistory();
          const latestHistory = await getBackupHistory(1);
          const latestBackup = latestHistory[0];
          
          if (latestBackup && latestBackup.status === "failed" && latestBackup.error_text) {
            // Use error from history if available and more detailed
            if (latestBackup.error_text.length > errorMessage.length) {
              errorMessage = latestBackup.error_text;
            }
          }
        } catch (historyError) {
          console.warn("[Backup] Could not fetch error details from history:", historyError);
        }
        
        // Show error with longer duration for detailed messages
        toast.error(errorMessage, { 
          duration: 20000, // Show for 20 seconds to read detailed error
          description: "Check Supabase Edge Function logs for more details if needed.",
        });
        
        setManualBackupProgress((prev) => ({
          ...prev,
          status: "failed",
          error: errorMessage,
        }));
      }
    } finally {
      if (!cancelPollingRef.current) {
        setIsLoading(false);
        setManualBackupProgress({
          isRunning: false,
          progress: 0,
          dispatchId: null,
        });
      }
    }
  };

  const handleDownloadFromHistory = async (s3Key: string | null) => {
    if (!s3Key) {
      toast.error("No backup file available");
      return;
    }

    // Validate S3 key format (basic validation)
    if (typeof s3Key !== 'string' || s3Key.length === 0 || s3Key.length > 1024) {
      toast.error("Invalid backup file reference");
      return;
    }

    // Sanitize S3 key (remove potentially dangerous characters)
    const sanitizedKey = s3Key.replace(/[<>"']/g, '');
    if (sanitizedKey !== s3Key) {
      toast.error("Invalid backup file reference");
      return;
    }

    try {
      const { signed_url } = await generateSignedUrl(sanitizedKey);
      // Validate URL before opening
      if (signed_url && (signed_url.startsWith('http://') || signed_url.startsWith('https://'))) {
        window.open(signed_url, "_blank");
        toast.success("Download started");
      } else {
        throw new Error("Invalid download URL received");
      }
    } catch (error) {
      console.error("Failed to generate download URL:", error);
      toast.error("Failed to generate download URL");
    }
  };

  const handleCancelStuckBackupClick = (backupId: string) => {
    setCancelTargetId(backupId);
    setCancelDialogOpen(true);
  };

  const handleCancelStuckBackup = async () => {
    if (!cancelTargetId) return;

    // Validate backup ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(cancelTargetId)) {
      toast.error("Invalid backup ID format");
      setCancelDialogOpen(false);
      setCancelTargetId(null);
      return;
    }

    setIsCancelling(true);
    try {
      console.log("[Backup] Attempting to cancel backup:", cancelTargetId);
      
      const result = await cancelBackup(cancelTargetId);

      if (!result.success) {
        throw new Error(result.message || "Failed to cancel backup");
      }

      console.log("[Backup] Backup cancelled successfully:", result);
      toast.success(`Backup marked as cancelled (${result.cancelled_count} backup(s) cancelled)`);
      
      // Close dialog and reset
      setCancelDialogOpen(false);
      setCancelTargetId(null);
      
      // Refresh history to show updated status
      await loadHistory();
    } catch (error) {
      console.error("[Backup] Failed to cancel backup:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel backup"
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleCancelAllStuckBackupsClick = () => {
    const stuckBackups = history.filter((item) => item.status === "in_progress");
    
    if (stuckBackups.length === 0) {
      toast.info("No stuck backups found");
      return;
    }
    
    setCancelAllDialogOpen(true);
  };

  const handleCancelAllStuckBackups = async () => {
    const stuckBackups = history.filter((item) => item.status === "in_progress");
    
    if (stuckBackups.length === 0) {
      setCancelAllDialogOpen(false);
      return;
    }

    setIsCancelling(true);
    try {
      // Validate all backup IDs before sending
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const stuckBackupIds = stuckBackups
        .map((item) => item.id)
        .filter((id) => uuidRegex.test(id)); // Filter out invalid IDs
      
      if (stuckBackupIds.length === 0) {
        toast.error("No valid backup IDs to cancel");
        setIsCancelling(false);
        setCancelAllDialogOpen(false);
        return;
      }
      
      console.log("[Backup] Attempting to cancel backups:", stuckBackupIds);
      
      const result = await cancelBackup(undefined, stuckBackupIds);

      if (!result.success) {
        throw new Error(result.message || "Failed to cancel backups");
      }

      console.log("[Backup] Backups cancelled successfully:", result);
      toast.success(`${result.cancelled_count} backup(s) marked as cancelled`);
      
      // Close dialog
      setCancelAllDialogOpen(false);
      
      // Refresh history to show updated status
      await loadHistory();
    } catch (error) {
      console.error("[Backup] Failed to cancel stuck backups:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to cancel stuck backups"
      );
    } finally {
      setIsCancelling(false);
    }
  };

  const handleDeleteBackupClick = (backupId: string, backupDate: string) => {
    setDeleteTargetId(backupId);
    setDeleteTargetDate(backupDate);
    setDeleteDialogOpen(true);
  };

  const handleDeleteBackup = async () => {
    if (!deleteTargetId) return;

    // Validate backup ID format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(deleteTargetId)) {
      toast.error("Invalid backup ID format");
      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
      setDeleteTargetDate(null);
      return;
    }

    setIsDeleting(true);
    try {
      console.log("[Backup] Attempting to delete backup:", deleteTargetId);
      
      const result = await deleteBackup(deleteTargetId);

      if (!result.success) {
        throw new Error(result.message || "Failed to delete backup");
      }

      console.log("[Backup] Backup deleted successfully:", result);
      toast.success("Backup deleted successfully");
      
      // Close dialog and reset
      setDeleteDialogOpen(false);
      setDeleteTargetId(null);
      setDeleteTargetDate(null);
      
      // Refresh history to show updated list
      await loadHistory();
    } catch (error) {
      console.error("[Backup] Failed to delete backup:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to delete backup"
      );
    } finally {
      setIsDeleting(false);
    }
  };

  // ✅ FIXED: Format date with hours, minutes, seconds in AM/PM format
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      const date = new Date(dateString);
      // Validate date is valid
      if (isNaN(date.getTime())) {
        return "Invalid date";
      }
      
      // Format: Jan 14, 2025 – 03:27:18 PM
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const month = months[date.getMonth()];
      const day = date.getDate();
      const year = date.getFullYear();
      
      // Format time in 12-hour format with AM/PM
      let hours = date.getHours();
      const minutes = String(date.getMinutes()).padStart(2, "0");
      const seconds = String(date.getSeconds()).padStart(2, "0");
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12;
      hours = hours ? hours : 12; // 0 should be 12
      const hoursStr = String(hours).padStart(2, "0");
      
      return `${month} ${day}, ${year} – ${hoursStr}:${minutes}:${seconds} ${ampm}`;
    } catch {
      return "Invalid date";
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${mb.toFixed(2)} MB`;
  };

  const handleRestoreClick = () => {
    setRestoreDialogOpen(true);
    setRestoreFile(null);
    setRestoreResults(null);
  };

  const handleRestoreFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    // Validate file type
    const validTypes = ['application/zip', 'application/x-zip-compressed', 'application/x-zip'];
    const isValidType = validTypes.includes(file.type) || file.name.toLowerCase().endsWith('.zip');
    
    if (!isValidType) {
      toast.error("Invalid file type. Please select a ZIP file.");
      event.target.value = ''; // Clear the input
      return;
    }

    // Validate file size (max 500MB for backup files)
    const maxSize = 500 * 1024 * 1024; // 500MB
    if (file.size > maxSize) {
      toast.error("File size exceeds 500MB limit. Please select a smaller backup file.");
      event.target.value = ''; // Clear the input
      return;
    }

    // Additional security: check file name for suspicious patterns
    const suspiciousPatterns = [/\.\./, /[<>:"|?*]/, /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i];
    if (suspiciousPatterns.some(pattern => pattern.test(file.name))) {
      toast.error("Invalid file name. Please use a valid filename.");
      event.target.value = ''; // Clear the input
      return;
    }

    setRestoreFile(file);
    setRestoreResults(null);
  };

  const handleRestore = async () => {
    if (!restoreFile) {
      toast.error("Please select a backup file to restore");
      return;
    }

    // Re-validate file before restore (defense in depth)
    const validTypes = ['application/zip', 'application/x-zip-compressed', 'application/x-zip'];
    const isValidType = validTypes.includes(restoreFile.type) || restoreFile.name.toLowerCase().endsWith('.zip');
    
    if (!isValidType) {
      toast.error("Invalid file type. Please select a ZIP file.");
      setRestoreFile(null);
      return;
    }

    const maxSize = 500 * 1024 * 1024; // 500MB
    if (restoreFile.size > maxSize) {
      toast.error("File size exceeds 500MB limit. Please select a smaller backup file.");
      setRestoreFile(null);
      return;
    }

    // ✅ NEW: Track file upload
    const fileId = handleFileUploadStart(restoreFile);
    setIsRestoring(true);
    setRestoreResults(null);

    try {
      console.log("[Backup] Starting restore for file:", restoreFile.name);
      
      // Simulate upload progress (since restore uses base64, we'll show progress)
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += 10;
        if (progress < 90) {
          handleFileUploadProgress(fileId, progress);
        }
      }, 200);
      
      const results = await restoreBackup(restoreFile);
      
      clearInterval(progressInterval);
      handleFileUploadComplete(fileId);
      
      setRestoreResults(results);
      
      if (results.success) {
        toast.success("Backup restore completed successfully! Data has been merged with existing data.");
        // Refresh history and settings
        await Promise.all([loadHistory(), loadSettings()]);
      } else {
        toast.error("Restore completed with warnings. Check the results for details.");
      }
    } catch (error) {
      handleFileUploadError(fileId, error instanceof Error ? error.message : "Upload failed");
      console.error("[Backup] Restore failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to restore backup"
      );
    } finally {
      setIsRestoring(false);
    }
  };

  // Circular progress component
  const CircularProgress = ({ percentage, size = 32 }: { percentage: number; size?: number }) => {
    const radius = (size - 4) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (percentage / 100) * circumference;
    
    return (
      <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <svg
          className="transform -rotate-90"
          width={size}
          height={size}
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            className="text-muted"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="text-blue-600 transition-all duration-300"
            strokeLinecap="round"
          />
        </svg>
        <span className="absolute text-xs font-semibold text-blue-600">
          {Math.round(percentage)}%
        </span>
      </div>
    );
  };

  // ✅ NEW: Handle file upload tracking for restore
  const handleFileUploadStart = (file: File) => {
    const fileId = crypto.randomUUID();
    setUploadFiles(prev => [...prev, {
      id: fileId,
      name: file.name,
      size: file.size,
      progress: 0,
      status: 'uploading',
    }]);
    return fileId;
  };

  const handleFileUploadProgress = (fileId: string, progress: number) => {
    setUploadFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, progress } : f
    ));
  };

  const handleFileUploadComplete = (fileId: string) => {
    setUploadFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, progress: 100, status: 'completed' } : f
    ));
  };

  const handleFileUploadError = (fileId: string, error: string) => {
    setUploadFiles(prev => prev.map(f => 
      f.id === fileId ? { ...f, status: 'error', error } : f
    ));
  };

  // ✅ NEW: Handle sharing - separate handlers for email and WhatsApp
  const handleEmailShareClick = (backupId: string) => {
    setShareBackupId(backupId);
    setEmailRecipient(sharingConfig.emailRecipient || "");
    setEmailDialogOpen(true);
  };

  const handleWhatsAppShareClick = (backupId: string) => {
    setShareBackupId(backupId);
    setWhatsappRecipient(sharingConfig.whatsappRecipient || "");
    setWhatsappDialogOpen(true);
  };

  const handleEmailShare = async () => {
    if (!shareBackupId || !emailRecipient.trim()) {
      toast.error('Please enter an email address');
      return;
    }
    
    setIsSharing(true);
    try {
      const result = await shareBackup(shareBackupId, 'email', emailRecipient.trim());
      
      if (result.success) {
        toast.success(result.message || 'Email sent successfully');
        setEmailDialogOpen(false);
        setEmailRecipient("");
        // Update saved email recipient
        setSharingConfig((prev) => ({ ...prev, emailRecipient: emailRecipient.trim() }));
      } else {
        toast.error(result.message || 'Failed to send email');
      }
    } catch (error) {
      console.error('Email share error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to send email');
    } finally {
      setIsSharing(false);
    }
  };

  const handleWhatsAppShare = async () => {
    if (!shareBackupId || !whatsappRecipient.trim()) {
      toast.error('Please enter a phone number');
      return;
    }
    
    setIsSharing(true);
    try {
      const result = await shareBackup(shareBackupId, 'whatsapp', whatsappRecipient.trim());
      
      if (result.success) {
        if (result.whatsapp_url) {
          window.open(result.whatsapp_url, '_blank');
          toast.success('WhatsApp share link opened');
        } else {
          toast.success(result.message || 'WhatsApp message sent successfully');
        }
        setWhatsappDialogOpen(false);
        setWhatsappRecipient("");
        // Update saved WhatsApp recipient
        setSharingConfig((prev) => ({ ...prev, whatsappRecipient: whatsappRecipient.trim() }));
      } else {
        toast.error(result.message || 'Failed to share via WhatsApp');
      }
    } catch (error) {
      console.error('WhatsApp share error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to share via WhatsApp');
    } finally {
      setIsSharing(false);
    }
  };

  // ✅ NEW: Auto-download handler for automatic backups
  const handleAutoDownload = async (_backupId: string, s3Key: string | null) => {
    if (!s3Key || !sharingConfig.autoDownload) return;
    
    try {
      const { signed_url } = await generateSignedUrl(s3Key);
      // Trigger download
      const link = document.createElement('a');
      link.href = signed_url;
      link.download = `backup-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Backup automatically downloaded');
    } catch (error) {
      console.error('Auto-download error:', error);
    }
  };

  // ✅ NEW: Monitor automatic backups for auto-download
  useEffect(() => {
    if (!sharingConfig.autoDownload) return;
    
    const checkAutoBackups = async () => {
      const latestHistory = await getBackupHistory(1);
      const latestBackup = latestHistory[0];
      
      if (latestBackup && latestBackup.status === 'success' && latestBackup.s3_key) {
        // Check if this backup was automatic (created more than 1 hour ago, likely scheduled)
        const backupDate = new Date(latestBackup.created_at);
        const now = new Date();
        const hoursSinceBackup = (now.getTime() - backupDate.getTime()) / (1000 * 60 * 60);
        
        // If backup is recent (within last hour) and we haven't downloaded it yet
        if (hoursSinceBackup < 1) {
          // Check localStorage to see if we've already downloaded this backup
          const downloadedBackups = JSON.parse(localStorage.getItem('downloaded_backups') || '[]');
          if (!downloadedBackups.includes(latestBackup.id)) {
            await handleAutoDownload(latestBackup.id, latestBackup.s3_key);
            // Mark as downloaded
            downloadedBackups.push(latestBackup.id);
            localStorage.setItem('downloaded_backups', JSON.stringify(downloadedBackups.slice(-10))); // Keep last 10
          }
        }
      }
    };
    
    // Check every 5 minutes for new automatic backups
    const interval = setInterval(checkAutoBackups, 5 * 60 * 1000);
    checkAutoBackups(); // Check immediately
    
    return () => clearInterval(interval);
  }, [sharingConfig.autoDownload]);

  const getStatusBadge = (status: BackupHistoryItem["status"], backupId?: string) => {
    // ✅ SYNCED: Use same progress calculation as manual backup (only for in_progress)
    // For completed/failed backups, progress is not shown (they show status badges instead)
    const progress = (status === "in_progress" && backupId) 
      ? (inProgressProgress[backupId] || (manualBackupProgress.backupId === backupId ? manualBackupProgress.progress : 10)) 
      : 10;
    
    switch (status) {
      case "success":
        return (
          <Badge variant="default" className="bg-green-500">
            <CheckCircle2 className="w-3 h-3 mr-1" />
            Success
          </Badge>
        );
      case "failed":
        return (
          <Badge variant="destructive">
            <XCircle className="w-3 h-3 mr-1" />
            Failed
          </Badge>
        );
      case "in_progress":
        return (
          <div className="flex items-center gap-2">
            <CircularProgress percentage={progress} size={32} />
            <Badge variant="outline" className="border-blue-500 text-blue-600">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              In Progress ({Math.round(progress)}%)
            </Badge>
          </div>
        );
      case "cancelled":
        return (
          <Badge variant="outline">
            <XCircle className="w-3 h-3 mr-1" />
            Cancelled
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Backup Configuration
          </CardTitle>
          <CardDescription>
            Configure automatic daily backups and create manual backups on demand
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Toggle Backup */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="backup-toggle" className="text-base">
                Enable Automatic Daily Backups
              </Label>
              <p className="text-sm text-muted-foreground">
                Backups will run automatically once per day at the scheduled time
              </p>
            </div>
            <Switch
              id="backup-toggle"
              checked={backupEnabled}
              onCheckedChange={handleToggleBackup}
              disabled={isToggling}
            />
          </div>

          {/* Last Backup Display */}
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Last backup:</span>
              <span className="text-sm text-muted-foreground">
                {formatDate(lastBackupAt)}
              </span>
            </div>
          </div>

          {/* Manual Backup Button */}
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                onClick={handleDownloadNow}
                disabled={isLoading || manualBackupProgress.isRunning}
                className="flex-1"
              >
                {isLoading || manualBackupProgress.isRunning ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating Backup...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Download Backup Now
                  </>
                )}
              </Button>
              
              <Button
                onClick={handleRestoreClick}
                variant="outline"
                className="flex-shrink-0"
              >
                <Database className="w-4 h-4 mr-2" />
                Restore Backup
              </Button>
              
              {manualBackupProgress.isRunning && (
                <Button
                  onClick={handleCancelBackup}
                  variant="destructive"
                  className="flex-shrink-0"
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel
                </Button>
              )}
            </div>

            {/* ✅ SYNCED: Progress Bar - matches history progress with real-time updates */}
            {manualBackupProgress.isRunning && (
              <div className="space-y-2">
                <Progress value={manualBackupProgress.progress} className="w-full" />
                <div className="text-xs text-center space-y-1">
                  <p className="text-muted-foreground">
                    {manualBackupProgress.progress < 100
                      ? manualBackupProgress.isTimedOut
                        ? `Backup taking longer than expected (${manualBackupProgress.progress}%). Still monitoring in background...`
                        : `Backup in progress... ${manualBackupProgress.progress}%`
                      : "Backup complete!"}
                  </p>
                  {manualBackupProgress.currentStep && manualBackupProgress.progress < 100 && (
                    <p className="text-xs text-blue-600 font-medium">
                      Current step: {manualBackupProgress.currentStep}
                    </p>
                  )}
                </div>
                {manualBackupProgress.isTimedOut && (
                  <p className="text-xs text-center text-blue-600">
                    The system is checking the backup history automatically. You can close this and check the history tab.
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ✅ NEW: File Upload Tracking */}
          {uploadFiles.length > 0 && (
            <div className="space-y-2 p-4 border rounded-lg bg-muted/50">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-semibold flex items-center gap-2">
                  <Upload className="w-4 h-4" />
                  Upload History
                </Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setUploadFiles([])}
                  className="h-6 px-2 text-xs"
                >
                  Clear
                </Button>
              </div>
              <div className="space-y-2">
                {uploadFiles.map((file) => (
                  <div key={file.id} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-xs text-muted-foreground flex-shrink-0">
                          ({(file.size / (1024 * 1024)).toFixed(2)} MB)
                        </span>
                      </div>
                      <Badge
                        variant={
                          file.status === 'completed'
                            ? 'default'
                            : file.status === 'error'
                            ? 'destructive'
                            : 'outline'
                        }
                        className="ml-2 flex-shrink-0"
                      >
                        {file.status === 'completed' && <CheckCircle2 className="w-3 h-3 mr-1" />}
                        {file.status === 'error' && <XCircle className="w-3 h-3 mr-1" />}
                        {file.status === 'uploading' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                        {file.status === 'completed' ? 'Completed' : file.status === 'error' ? 'Error' : 'Uploading'}
                      </Badge>
                    </div>
                    {file.status === 'uploading' && (
                      <Progress value={file.progress} className="h-1" />
                    )}
                    {file.status === 'error' && file.error && (
                      <p className="text-xs text-destructive">{file.error}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ✅ NEW: Sharing Configuration */}
          <div className="space-y-4 p-4 border rounded-lg">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold flex items-center gap-2">
                <SettingsIcon className="w-4 h-4" />
                Backup Sharing & Auto-Download
              </Label>
            </div>
            
            <div className="space-y-4">
              {/* Auto-Download */}
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label htmlFor="auto-download" className="text-sm">
                    Auto-Download Automatic Backups
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Automatically download backups when they complete
                  </p>
                </div>
                <Switch
                  id="auto-download"
                  checked={sharingConfig.autoDownload}
                  onCheckedChange={(checked) =>
                    setSharingConfig((prev) => ({ ...prev, autoDownload: checked }))
                  }
                />
              </div>

              {/* Email Sharing */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="email-sharing" className="text-sm flex items-center gap-2">
                      <Mail className="w-4 h-4" />
                      Email Sharing
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically send backups via email
                    </p>
                  </div>
                  <Switch
                    id="email-sharing"
                    checked={sharingConfig.emailEnabled}
                    onCheckedChange={(checked) =>
                      setSharingConfig((prev) => ({ ...prev, emailEnabled: checked }))
                    }
                  />
                </div>
                {sharingConfig.emailEnabled && (
                  <Input
                    type="email"
                    placeholder="recipient@example.com"
                    value={sharingConfig.emailRecipient}
                    onChange={(e) =>
                      setSharingConfig((prev) => ({ ...prev, emailRecipient: e.target.value }))
                    }
                    className="text-sm"
                  />
                )}
              </div>

              {/* WhatsApp Sharing */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="whatsapp-sharing" className="text-sm flex items-center gap-2">
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp Sharing
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Automatically share backups via WhatsApp
                    </p>
                  </div>
                  <Switch
                    id="whatsapp-sharing"
                    checked={sharingConfig.whatsappEnabled}
                    onCheckedChange={(checked) =>
                      setSharingConfig((prev) => ({ ...prev, whatsappEnabled: checked }))
                    }
                  />
                </div>
                {sharingConfig.whatsappEnabled && (
                  <Input
                    type="tel"
                    placeholder="+1234567890"
                    value={sharingConfig.whatsappRecipient}
                    onChange={(e) =>
                      setSharingConfig((prev) => ({ ...prev, whatsappRecipient: e.target.value }))
                    }
                    className="text-sm"
                  />
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Backup History */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <HardDrive className="w-5 h-5" />
                Backup History
              </CardTitle>
              <CardDescription>Recent backup operations</CardDescription>
            </div>
            <div className="flex gap-2">
              {history.some((item) => item.status === "in_progress") && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleCancelAllStuckBackupsClick}
                  disabled={isLoadingHistory}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancel All Stuck
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={loadHistory}
                disabled={isLoadingHistory}
              >
                <RefreshCw
                  className={`w-4 h-4 mr-2 ${isLoadingHistory ? "animate-spin" : ""}`}
                />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* ✅ NEW: Filters */}
          <div className="space-y-4 mb-6 p-4 border rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-semibold">Filters:</Label>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Status Filter */}
              <div className="space-y-2">
                <Label className="text-xs">Status</Label>
                <Select
                  value={statusFilter}
                  onValueChange={(value: any) => setStatusFilter(value)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="success">Successful</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                    <SelectItem value="in_progress">In Progress</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Start Date Filter */}
              <div className="space-y-2">
                <Label className="text-xs">Start Date</Label>
                <Input
                  type="date"
                  value={dateFilter.start || ''}
                  onChange={(e) =>
                    setDateFilter((prev) => ({ ...prev, start: e.target.value || undefined }))
                  }
                  className="h-9"
                />
              </div>

              {/* End Date Filter */}
              <div className="space-y-2">
                <Label className="text-xs">End Date</Label>
                <Input
                  type="date"
                  value={dateFilter.end || ''}
                  onChange={(e) =>
                    setDateFilter((prev) => ({ ...prev, end: e.target.value || undefined }))
                  }
                  className="h-9"
                />
              </div>

              {/* Search Filter */}
              <div className="space-y-2">
                <Label className="text-xs">Search (Filename)</Label>
                <Input
                  type="text"
                  placeholder="Search backups..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
              </div>
            </div>

            {/* Clear Filters Button */}
            {(statusFilter !== 'all' || dateFilter.start || dateFilter.end || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter('all');
                  setDateFilter({});
                  setSearchQuery('');
                }}
                className="mt-2"
              >
                <X className="w-4 h-4 mr-2" />
                Clear Filters
              </Button>
            )}
          </div>
          {isLoadingHistory ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No backup history available
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{formatDate(item.created_at)}</TableCell>
                    <TableCell>{getStatusBadge(item.status, item.id)}</TableCell>
                    <TableCell>{formatFileSize(item.size_bytes)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {item.status === "success" && item.s3_key ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownloadFromHistory(item.s3_key)}
                            >
                              <Download className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                            {/* ✅ NEW: Separate Email and WhatsApp share buttons */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEmailShareClick(item.id)}
                              title="Share via Email"
                            >
                              <Mail className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleWhatsAppShareClick(item.id)}
                              title="Share via WhatsApp"
                            >
                              <MessageCircle className="w-4 h-4" />
                            </Button>
                          </>
                        ) : item.status === "in_progress" ? (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleCancelStuckBackupClick(item.id)}
                          >
                            <X className="w-4 h-4 mr-1" />
                            Cancel
                          </Button>
                        ) : item.status === "failed" ? (
                          <div className="flex items-center gap-2">
                            {item.error_text ? (
                              <>
                                {/* Sanitize error text for display (prevent XSS) */}
                                <span 
                                  className="text-xs text-destructive" 
                                  title={item.error_text.replace(/[<>]/g, '')}
                                >
                                  {item.error_text.substring(0, 40).replace(/[<>]/g, '')}
                                  {item.error_text.length > 40 ? "..." : ""}
                                </span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    // Sanitize error text before displaying
                                    const sanitizedError = item.error_text?.replace(/[<>]/g, '') || "Check GitHub Actions logs for details";
                                    toast.error("Backup Failed", {
                                      description: sanitizedError,
                                      duration: 15000,
                                    });
                                  }}
                                  className="h-6 px-2 text-xs"
                                >
                                  Details
                                </Button>
                              </>
                            ) : (
                              <span className="text-xs text-destructive">Failed - No error details</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteBackupClick(item.id, item.created_at)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Cancel Single Backup Dialog */}
      <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel Backup</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this backup as cancelled? This will stop it from showing as 'in progress'.
              The backup workflow may still be running in the background.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialogOpen(false);
                setCancelTargetId(null);
              }}
              disabled={isCancelling}
            >
              No, Keep It
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelStuckBackup}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Yes, Cancel Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cancel All Stuck Backups Dialog */}
      <Dialog open={cancelAllDialogOpen} onOpenChange={setCancelAllDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cancel All Stuck Backups</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark all stuck backups as cancelled? This will stop them from showing as 'in progress'.
              The backup workflows may still be running in the background.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCancelAllDialogOpen(false)}
              disabled={isCancelling}
            >
              No, Keep Them
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelAllStuckBackups}
              disabled={isCancelling}
            >
              {isCancelling ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Cancelling...
                </>
              ) : (
                <>
                  <X className="w-4 h-4 mr-2" />
                  Yes, Cancel All
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Backup Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <DialogTitle>Delete Backup</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. The backup record will be permanently removed.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">
                  Backup Date: <span className="font-normal text-muted-foreground">{deleteTargetDate ? formatDate(deleteTargetDate) : "N/A"}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Are you sure you want to delete this backup record? This will remove it from the history permanently.
                </p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDeleteDialogOpen(false);
                setDeleteTargetId(null);
                setDeleteTargetDate(null);
              }}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBackup}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restore Backup Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Restore Backup
            </DialogTitle>
            <DialogDescription>
              Upload a backup file to restore data. The restore will merge data with existing records without overwriting them.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* File Input */}
            <div className="space-y-2">
              <Label htmlFor="restore-file">Backup File (ZIP)</Label>
              <input
                id="restore-file"
                type="file"
                accept=".zip"
                onChange={handleRestoreFileChange}
                className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-primary file:text-primary-foreground hover:file:bg-primary/90"
                disabled={isRestoring}
              />
              {restoreFile && (
                <p className="text-sm text-muted-foreground">
                  Selected: <span className="font-mono text-xs">{restoreFile.name.replace(/[<>]/g, '')}</span> ({(restoreFile.size / (1024 * 1024)).toFixed(2)} MB)
                </p>
              )}
            </div>

            {/* Warning */}
            <div className="p-4 border border-yellow-200 bg-yellow-50 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
                <div className="space-y-1 text-sm">
                  <p className="font-semibold text-yellow-900">Important Notes:</p>
                  <ul className="list-disc list-inside space-y-1 text-yellow-800">
                    <li>Data will be merged with existing records (no overwrites)</li>
                    <li>Auth users will be created only if they don't exist</li>
                    <li>Storage files will be uploaded only if they don't exist</li>
                    <li>Database SQL restore requires manual execution via Supabase SQL Editor or psql</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Restore Results */}
            {restoreResults && (
              <div className="space-y-3 p-4 border rounded-lg">
                <h4 className="font-semibold">Restore Results:</h4>
                
                {/* Database Results */}
                {restoreResults.results?.database && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Database:</p>
                    <p className="text-sm text-muted-foreground">
                      {restoreResults.results.database.restored ? (
                        <span className="text-green-600">✓ Restored ({restoreResults.results.database.rows_affected} rows)</span>
                      ) : (
                        <span className="text-yellow-600">
                          ⚠ {restoreResults.results.database.message || "Not restored"}
                        </span>
                      )}
                    </p>
                    {restoreResults.results.database.note && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {restoreResults.results.database.note}
                      </p>
                    )}
                  </div>
                )}

                {/* Auth Users Results */}
                {restoreResults.results?.auth_users && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Auth Users:</p>
                    <p className="text-sm text-muted-foreground">
                      {restoreResults.results.auth_users.restored ? (
                        <span className="text-green-600">
                          ✓ Merged {restoreResults.results.auth_users.users_merged} user(s)
                          {restoreResults.results.auth_users.users_skipped && restoreResults.results.auth_users.users_skipped > 0 && (
                            <span className="text-muted-foreground">, skipped {restoreResults.results.auth_users.users_skipped}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-yellow-600">⚠ Not restored</span>
                      )}
                    </p>
                  </div>
                )}

                {/* Storage Results */}
                {restoreResults.results?.storage && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Storage Files:</p>
                    <p className="text-sm text-muted-foreground">
                      {restoreResults.results.storage.restored ? (
                        <span className="text-green-600">
                          ✓ Uploaded {restoreResults.results.storage.files_uploaded} file(s)
                          {restoreResults.results.storage.files_skipped && restoreResults.results.storage.files_skipped > 0 && (
                            <span className="text-muted-foreground">, skipped {restoreResults.results.storage.files_skipped}</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-yellow-600">⚠ Not restored</span>
                      )}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setRestoreDialogOpen(false);
                setRestoreFile(null);
                setRestoreResults(null);
              }}
              disabled={isRestoring}
            >
              Close
            </Button>
            <Button
              onClick={handleRestore}
              disabled={!restoreFile || isRestoring}
            >
              {isRestoring ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Restoring...
                </>
              ) : (
                <>
                  <Database className="w-4 h-4 mr-2" />
                  Restore Backup
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ NEW: Email Share Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Share Backup via Email
            </DialogTitle>
            <DialogDescription>
              Enter the email address to send the backup download link
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="email-recipient">Email Address</Label>
              <Input
                id="email-recipient"
                type="email"
                placeholder="recipient@example.com"
                value={emailRecipient}
                onChange={(e) => setEmailRecipient(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && emailRecipient.trim()) {
                    handleEmailShare();
                  }
                }}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEmailDialogOpen(false);
                setShareBackupId(null);
                setEmailRecipient("");
              }}
              disabled={isSharing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleEmailShare}
              disabled={!emailRecipient.trim() || isSharing}
            >
              {isSharing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ✅ NEW: WhatsApp Share Dialog */}
      <Dialog open={whatsappDialogOpen} onOpenChange={setWhatsappDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5" />
              Share Backup via WhatsApp
            </DialogTitle>
            <DialogDescription>
              Enter the phone number (with country code) to share the backup
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="whatsapp-recipient">Phone Number</Label>
              <Input
                id="whatsapp-recipient"
                type="tel"
                placeholder="+1234567890"
                value={whatsappRecipient}
                onChange={(e) => setWhatsappRecipient(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && whatsappRecipient.trim()) {
                    handleWhatsAppShare();
                  }
                }}
              />
              <p className="text-xs text-muted-foreground">
                Include country code (e.g., +1 for US, +44 for UK)
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setWhatsappDialogOpen(false);
                setShareBackupId(null);
                setWhatsappRecipient("");
              }}
              disabled={isSharing}
            >
              Cancel
            </Button>
            <Button
              onClick={handleWhatsAppShare}
              disabled={!whatsappRecipient.trim() || isSharing}
            >
              {isSharing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sharing...
                </>
              ) : (
                <>
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Share via WhatsApp
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

