/**
 * API helper for backup-related Edge Function calls
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const BACKUP_API_KEY = import.meta.env.VITE_BACKUP_API_KEY as string;

if (!SUPABASE_URL) {
  throw new Error('VITE_SUPABASE_URL is required');
}

/**
 * Call a Supabase Edge Function with authentication
 */
async function callEdgeFunction(
  functionName: string,
  options: {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<Response> {
  const { method = 'GET', body, headers = {} } = options;

  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;

  const requestHeaders: HeadersInit = {
    'Content-Type': 'application/json',
    ...headers,
  };

  // Add authentication header if API key is available
  if (BACKUP_API_KEY) {
    requestHeaders['Authorization'] = `Bearer ${BACKUP_API_KEY}`;
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (fetchError) {
    // Handle network errors (function not deployed, CORS, etc.)
    if (fetchError instanceof TypeError && fetchError.message.includes('Failed to fetch')) {
      throw new Error(
        `Edge Function '${functionName}' not found or not accessible. Please ensure it is deployed.`
      );
    }
    throw fetchError;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Edge Function ${functionName} failed: ${response.status} ${response.statusText} - ${errorText}`
    );
  }

  return response;
}

/**
 * Trigger a manual backup
 * @returns Dispatch ID for polling status
 */
export async function triggerBackup(): Promise<{ dispatch_id: string; status_url: string }> {
  const response = await callEdgeFunction('trigger-backup', {
    method: 'POST',
  });

  const data = await response.json();
  return data;
}

/**
 * Poll backup status
 * @param dispatchId The dispatch ID from triggerBackup
 * @returns Status information including signed S3 URL when complete
 */
export async function getBackupStatus(
  dispatchId: string
): Promise<{
  status: 'pending' | 'in_progress' | 'success' | 'failed';
  signed_url?: string;
  error?: string;
  backup_id?: string;
}> {
  const url = `${SUPABASE_URL}/functions/v1/backup-status?dispatch_id=${encodeURIComponent(dispatchId)}`;
  
  const statusResponse = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(BACKUP_API_KEY ? { Authorization: `Bearer ${BACKUP_API_KEY}` } : {}),
    },
  });

  if (!statusResponse.ok) {
    const errorText = await statusResponse.text();
    throw new Error(`Failed to get backup status: ${statusResponse.statusText} - ${errorText}`);
  }

  return await statusResponse.json();
}

/**
 * Get backup settings (backup_enabled, last_backup_at)
 */
export async function getBackupSettings(): Promise<{
  backup_enabled: boolean;
  last_backup_at: string | null;
}> {
  const response = await callEdgeFunction('settings-toggle', {
    method: 'GET',
  });

  return await response.json();
}

/**
 * Update backup enabled setting
 */
export async function updateBackupEnabled(enabled: boolean): Promise<void> {
  await callEdgeFunction('settings-toggle', {
    method: 'POST',
    body: { backup_enabled: enabled },
  });
}

/**
 * Get backup history (last N entries)
 */
export async function getBackupHistory(limit: number = 5): Promise<
  Array<{
    id: string;
    s3_key: string | null;
    created_at: string;
    status: 'success' | 'failed' | 'cancelled' | 'in_progress';
    size_bytes: number | null;
    error_text: string | null;
    dispatch_id?: string | null;
  }>
> {
  const url = `${SUPABASE_URL}/functions/v1/backup-history?limit=${limit}`;
  
  const historyResponse = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(BACKUP_API_KEY ? { Authorization: `Bearer ${BACKUP_API_KEY}` } : {}),
    },
  });

  if (!historyResponse.ok) {
    const errorText = await historyResponse.text();
    throw new Error(`Failed to get backup history: ${historyResponse.statusText} - ${errorText}`);
  }

  return await historyResponse.json();
}

/**
 * Cancel a stuck backup (or multiple backups)
 * @param backupId Single backup ID to cancel
 * @param backupIds Array of backup IDs to cancel
 * @returns Success message and count of cancelled backups
 */
export async function cancelBackup(
  backupId?: string,
  backupIds?: string[]
): Promise<{ success: boolean; message: string; cancelled_count: number }> {
  const response = await callEdgeFunction('cancel-backup', {
    method: 'POST',
    body: backupIds 
      ? { backup_ids: backupIds }
      : { backup_id: backupId },
  });

  return await response.json();
}

/**
 * Delete a backup history record
 * @param backupId The backup ID to delete
 * @returns Success message
 */
export async function deleteBackup(
  backupId: string
): Promise<{ success: boolean; message: string }> {
  const response = await callEdgeFunction('delete-backup', {
    method: 'POST',
    body: { backup_id: backupId },
  });

  return await response.json();
}

/**
 * Generate a signed S3 URL for downloading a backup
 * @param s3Key The S3 key from backup_history
 * @returns Pre-signed URL valid for 15 minutes
 */
export async function generateSignedUrl(s3Key: string): Promise<{ signed_url: string }> {
  const response = await callEdgeFunction('generate-signed-url', {
    method: 'POST',
    body: { s3_key: s3Key },
  });

  return await response.json();
}

/**
 * Restore a backup file by merging data with existing data (no overwrites)
 * @param backupFile The backup ZIP file to restore
 * @returns Restore results including status for database, auth users, and storage
 */
export async function restoreBackup(
  backupFile: File
): Promise<{
  success: boolean;
  message: string;
  results: {
    database: {
      restored: boolean;
      message?: string;
      sql_converted?: boolean;
      sql_size?: number;
      note?: string;
      rows_affected?: number;
    };
    auth_users: {
      restored: boolean;
      users_merged: number;
      users_skipped?: number;
    };
    storage: {
      restored: boolean;
      files_uploaded: number;
      files_skipped?: number;
    };
  };
}> {
  const formData = new FormData();
  formData.append('backup_file', backupFile);

  const url = `${SUPABASE_URL}/functions/v1/restore-backup`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...(BACKUP_API_KEY ? { Authorization: `Bearer ${BACKUP_API_KEY}` } : {}),
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to restore backup: ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

