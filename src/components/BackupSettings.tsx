import { useEffect, useState, useRef } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Progress } from "./ui/progress";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
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

const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 1200; // Max 60 minutes of polling (1200 * 3s = 3600s = 60min) - matches workflow timeout

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
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const hasStartedPollingRef = useRef(false);
  const [manualBackupProgress, setManualBackupProgress] = useState<{
    isRunning: boolean;
    progress: number;
    dispatchId: string | null;
    backupId?: string | null;
    isTimedOut?: boolean;
  }>({
    isRunning: false,
    progress: 0,
    dispatchId: null,
    backupId: null,
    isTimedOut: false,
  });
  
  // Ref to track cancellation
  const cancelPollingRef = useRef(false);
  
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

    const updateProgressForBackups = () => {
      const currentInProgress = history.filter(item => item.status === "in_progress");
      
      for (const item of currentInProgress) {
        // Estimate progress based on time elapsed
        const createdAt = new Date(item.created_at).getTime();
        const now = Date.now();
        const elapsedMinutes = (now - createdAt) / (1000 * 60);
        
        // Estimate progress: assume backup takes ~15 minutes max
        // Start at 10%, reach 95% at 15 minutes
        const estimatedProgress = Math.min(10 + Math.floor((elapsedMinutes / 15) * 85), 95);
        
        setInProgressProgress(prev => {
          // Only update if progress changed significantly (avoid unnecessary re-renders)
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

      // If no more in-progress items, stop polling and clear progress
      if (currentInProgress.length === 0) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
          hasStartedPollingRef.current = false;
        }
        // Clear progress for items that are no longer in progress
        setInProgressProgress(prev => {
          const updated = { ...prev };
          const inProgressIds = new Set(currentInProgress.map(item => item.id));
          Object.keys(updated).forEach(id => {
            if (!inProgressIds.has(id)) {
              delete updated[id];
            }
          });
          return updated;
        });
      }
    };

    // Update progress immediately
    updateProgressForBackups();
    
    // Then update progress every 5 seconds (without refreshing history)
    pollingIntervalRef.current = setInterval(() => {
      updateProgressForBackups();
    }, 5000);

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
      const historyData = await getBackupHistory(5);
      setHistory(historyData);
    } catch (error) {
      console.error("Failed to load backup history:", error);
      toast.error("Failed to load backup history");
    } finally {
      setIsLoadingHistory(false);
    }
  };

  // Background monitoring for timed-out backups
  const startBackgroundMonitoring = (dispatchId: string, backupId?: string | null) => {
    console.log(`[Backup] Starting background monitoring for dispatch_id: ${dispatchId}, backup_id: ${backupId || 'not available'}`);
    
    let checkCount = 0;
    const MAX_BACKGROUND_CHECKS = 120; // 1 hour (120 * 30s = 3600s)
    
    const checkInterval = setInterval(async () => {
      checkCount++;
      console.log(`[Backup] Background check ${checkCount}/${MAX_BACKGROUND_CHECKS}...`);
      
      try {
        // First, try to check via backup_id in history (faster and more reliable)
        if (backupId) {
          const history = await getBackupHistory(10);
          const backup = history.find(b => b.id === backupId);
          
          if (backup) {
            if (backup.status === "success" && backup.s3_key) {
              // Backup completed!
              clearInterval(checkInterval);
              setManualBackupProgress((prev) => ({
                ...prev,
                progress: 100,
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
              clearInterval(checkInterval);
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
              clearInterval(checkInterval);
              setManualBackupProgress((prev) => ({
                ...prev,
                isRunning: false,
                isTimedOut: false,
              }));
              await loadHistory();
              return;
            }
            // Still in progress, continue monitoring
            console.log(`[Backup] Background check: backup still ${backup.status}`);
          }
        }
        
        // Also check via status API as fallback
        const status = await getBackupStatus(dispatchId);
        
        if (status.status === "success" && status.signed_url) {
          // Backup completed!
          clearInterval(checkInterval);
          setManualBackupProgress((prev) => ({
            ...prev,
            progress: 100,
            isTimedOut: false,
          }));
          toast.success("Backup completed! Opening download...");
          window.open(status.signed_url, "_blank");
          await loadHistory();
        } else if (status.status === "failed") {
          // Backup failed
          clearInterval(checkInterval);
          setManualBackupProgress((prev) => ({
            ...prev,
            isRunning: false,
            isTimedOut: false,
          }));
          toast.error(`Backup failed: ${status.error || "Unknown error"}`);
          await loadHistory();
        } else {
          // Still in progress, continue monitoring
          console.log(`[Backup] Background check: still ${status.status}`);
        }
      } catch (error) {
        console.warn("[Backup] Background monitoring error:", error);
        // Continue monitoring on error
      }
    }, 30000); // Check every 30 seconds
    
    // Stop monitoring after 1 hour (120 checks)
    setTimeout(() => {
      clearInterval(checkInterval);
      console.log("[Backup] Background monitoring stopped after 1 hour");
      setManualBackupProgress((prev) => ({
        ...prev,
        isTimedOut: false,
      }));
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
        
        // Better progress calculation with faster initial progress
        // Use exponential curve: fast at start, slower as we approach completion
        // First 50 attempts: 10% -> 60% (fast initial progress)
        // Next 150 attempts: 60% -> 85% (moderate progress)
        // Remaining attempts: 85% -> 95% (slow progress, waiting for completion)
        let progressPercent: number;
        if (pollAttempts <= 50) {
          // Fast initial progress: 10% to 60% in first 50 attempts
          progressPercent = 10 + Math.floor((pollAttempts / 50) * 50);
        } else if (pollAttempts <= 200) {
          // Moderate progress: 60% to 85% in next 150 attempts
          const remainingAttempts = pollAttempts - 50;
          progressPercent = 60 + Math.floor((remainingAttempts / 150) * 25);
        } else {
          // Slow progress: 85% to 95% for remaining attempts
          const remainingAttempts = pollAttempts - 200;
          const maxRemaining = MAX_POLL_ATTEMPTS - 200;
          progressPercent = 85 + Math.floor((remainingAttempts / maxRemaining) * 10);
        }
        progressPercent = Math.min(progressPercent, 95);
        setManualBackupProgress((prev) => ({
          ...prev,
          progress: progressPercent,
        }));

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
          });
          
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

          if (status.status === "success" && status.signed_url) {
            setManualBackupProgress((prev) => ({
              ...prev,
              progress: 100,
            }));
            console.log("[Backup] Backup completed successfully!");
            return status.signed_url;
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
            // Continue polling
            console.log(`[Backup] Still in progress (${status.status}), polling again in ${POLL_INTERVAL_MS}ms...`);
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
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
            // Retry on transient errors
            console.warn(`[Backup] Transient error, retrying... (attempt ${pollAttempts})`);
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
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
        // Refresh history and settings
        await Promise.all([loadHistory(), loadSettings()]);
      }
    } catch (error) {
      if (cancelPollingRef.current) {
        // User cancelled - don't show error
        return;
      }
      console.error("Backup failed:", error);
      
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      const date = new Date(dateString);
      // Validate date is valid
      if (isNaN(date.getTime())) {
        return "Invalid date";
      }
      const day = String(date.getDate()).padStart(2, "0");
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const year = date.getFullYear();
      const hours = String(date.getHours()).padStart(2, "0");
      const minutes = String(date.getMinutes()).padStart(2, "0");
      return `${day}/${month}/${year} ${hours}:${minutes}`;
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

    setIsRestoring(true);
    setRestoreResults(null);

    try {
      console.log("[Backup] Starting restore for file:", restoreFile.name);
      const results = await restoreBackup(restoreFile);
      
      setRestoreResults(results);
      
      if (results.success) {
        toast.success("Backup restore completed successfully! Data has been merged with existing data.");
        // Refresh history and settings
        await Promise.all([loadHistory(), loadSettings()]);
      } else {
        toast.error("Restore completed with warnings. Check the results for details.");
      }
    } catch (error) {
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

  const getStatusBadge = (status: BackupHistoryItem["status"], backupId?: string) => {
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
        const progress = backupId ? (inProgressProgress[backupId] || 10) : 10;
        return (
          <div className="flex items-center gap-2">
            <CircularProgress percentage={progress} size={32} />
            <Badge variant="outline" className="border-blue-500 text-blue-600">
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              In Progress
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

            {/* Progress Bar */}
            {manualBackupProgress.isRunning && (
              <div className="space-y-2">
                <Progress value={manualBackupProgress.progress} className="w-full" />
                <p className="text-xs text-center text-muted-foreground">
                  {manualBackupProgress.progress < 100
                    ? manualBackupProgress.isTimedOut
                      ? `Backup taking longer than expected (${manualBackupProgress.progress}%). Still monitoring in background...`
                      : `Backup in progress... ${manualBackupProgress.progress}%`
                    : "Backup complete!"}
                </p>
                {manualBackupProgress.isTimedOut && (
                  <p className="text-xs text-center text-blue-600">
                    The system is checking the backup history automatically. You can close this and check the history tab.
                  </p>
                )}
              </div>
            )}
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
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDownloadFromHistory(item.s3_key)}
                          >
                            <Download className="w-4 h-4 mr-1" />
                            Download
                          </Button>
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
    </div>
  );
}

