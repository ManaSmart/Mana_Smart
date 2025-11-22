import { useEffect, useState } from "react";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Progress } from "./ui/progress";
import {
  Download,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Database,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";
import {
  triggerBackup,
  getBackupStatus,
  getBackupSettings,
  updateBackupEnabled,
  getBackupHistory,
  generateSignedUrl,
} from "../lib/backupApi";

interface BackupHistoryItem {
  id: string;
  s3_key: string | null;
  created_at: string;
  status: "success" | "failed" | "cancelled" | "in_progress";
  size_bytes: number | null;
  error_text: string | null;
}

const POLL_INTERVAL_MS = 3000; // Poll every 3 seconds
const MAX_POLL_ATTEMPTS = 120; // Max 6 minutes of polling

export function BackupSettings() {
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [lastBackupAt, setLastBackupAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isToggling, setIsToggling] = useState(false);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [manualBackupProgress, setManualBackupProgress] = useState<{
    isRunning: boolean;
    progress: number;
    dispatchId: string | null;
  }>({
    isRunning: false,
    progress: 0,
    dispatchId: null,
  });

  // Load initial settings and history
  useEffect(() => {
    loadSettings();
    loadHistory();
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

  const handleToggleBackup = async (enabled: boolean) => {
    setIsToggling(true);
    try {
      await updateBackupEnabled(enabled);
      setBackupEnabled(enabled);
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

  const handleDownloadNow = async () => {
    setIsLoading(true);
    setManualBackupProgress({
      isRunning: true,
      progress: 0,
      dispatchId: null,
    });

    try {
      // Trigger backup
      const { dispatch_id, status_url } = await triggerBackup();
      setManualBackupProgress((prev) => ({
        ...prev,
        dispatchId: dispatch_id,
        progress: 10,
      }));

      toast.info("Backup started. This may take a few minutes...");

      // Poll for status
      let pollAttempts = 0;
      const pollStatus = async (): Promise<string | null> => {
        if (pollAttempts >= MAX_POLL_ATTEMPTS) {
          throw new Error("Backup timed out. Please check the backup history.");
        }

        pollAttempts++;
        setManualBackupProgress((prev) => ({
          ...prev,
          progress: Math.min(10 + (pollAttempts * 5), 90),
        }));

        try {
          const status = await getBackupStatus(dispatch_id);

          if (status.status === "success" && status.signed_url) {
            setManualBackupProgress((prev) => ({
              ...prev,
              progress: 100,
            }));
            return status.signed_url;
          } else if (status.status === "failed") {
            throw new Error(status.error || "Backup failed");
          } else if (status.status === "in_progress" || status.status === "pending") {
            // Continue polling
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            return pollStatus();
          } else {
            throw new Error("Unknown backup status");
          }
        } catch (error) {
          if (error instanceof Error && error.message.includes("Failed to get backup status")) {
            // Retry on transient errors
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
            return pollStatus();
          }
          throw error;
        }
      };

      const signedUrl = await pollStatus();

      if (signedUrl) {
        // Open download in new tab
        window.open(signedUrl, "_blank");
        toast.success("Backup completed! Download started.");
        // Refresh history and settings
        await Promise.all([loadHistory(), loadSettings()]);
      }
    } catch (error) {
      console.error("Backup failed:", error);
      toast.error(
        error instanceof Error ? error.message : "Failed to create backup. Please try again."
      );
    } finally {
      setIsLoading(false);
      setManualBackupProgress({
        isRunning: false,
        progress: 0,
        dispatchId: null,
      });
    }
  };

  const handleDownloadFromHistory = async (s3Key: string | null) => {
    if (!s3Key) {
      toast.error("No backup file available");
      return;
    }

    try {
      const { signed_url } = await generateSignedUrl(s3Key);
      window.open(signed_url, "_blank");
      toast.success("Download started");
    } catch (error) {
      console.error("Failed to generate download URL:", error);
      toast.error("Failed to generate download URL");
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Never";
    try {
      const date = new Date(dateString);
      return date.toLocaleString("en-US", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
    } catch {
      return dateString;
    }
  };

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return "-";
    const mb = bytes / (1024 * 1024);
    if (mb < 1) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${mb.toFixed(2)} MB`;
  };

  const getStatusBadge = (status: BackupHistoryItem["status"]) => {
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
          <Badge variant="secondary">
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            In Progress
          </Badge>
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
            <Button
              onClick={handleDownloadNow}
              disabled={isLoading || manualBackupProgress.isRunning}
              className="w-full"
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

            {/* Progress Bar */}
            {manualBackupProgress.isRunning && (
              <div className="space-y-2">
                <Progress value={manualBackupProgress.progress} className="w-full" />
                <p className="text-xs text-center text-muted-foreground">
                  {manualBackupProgress.progress < 100
                    ? `Backup in progress... ${manualBackupProgress.progress}%`
                    : "Backup complete!"}
                </p>
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
                    <TableCell>{getStatusBadge(item.status)}</TableCell>
                    <TableCell>{formatFileSize(item.size_bytes)}</TableCell>
                    <TableCell>
                      {item.status === "success" && item.s3_key ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownloadFromHistory(item.s3_key)}
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </Button>
                      ) : item.status === "failed" && item.error_text ? (
                        <span className="text-xs text-destructive" title={item.error_text}>
                          {item.error_text.substring(0, 50)}
                          {item.error_text.length > 50 ? "..." : ""}
                        </span>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

