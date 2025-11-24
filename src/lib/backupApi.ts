/**
 * API helper for backup-related Edge Function calls
 * Uses Supabase client's functions.invoke() for proper authentication and CORS handling
 */

import { supabase } from './supabaseClient';

/**
 * Get current user ID from localStorage (custom auth system)
 */
function getCurrentUserId(): string | null {
  try {
    const stored = localStorage.getItem('auth_user');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return parsed?.user_id || null;
  } catch (error) {
    console.error('Failed to get user ID from localStorage:', error);
    return null;
  }
}

/**
 * Call a Supabase Edge Function with authentication
 * Uses supabase.functions.invoke() which automatically handles:
 * - User session authentication
 * - CORS headers
 * - Proper error handling
 * 
 * Automatically includes user_id for authentication verification
 */
async function callEdgeFunction<T = any>(
  functionName: string,
  options: {
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Promise<T> {
  const { body, headers = {} } = options;
  
  // Get current user ID and include it in the request
  const userId = getCurrentUserId();
  const requestBody = {
    ...(body as Record<string, unknown> || {}),
    ...(userId ? { user_id: userId } : {}), // Include user_id for authentication
  };

  try {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: requestBody as any,
      headers,
    });

    if (error) {
      throw new Error(
        `Edge Function ${functionName} failed: ${error.message || 'Unknown error'}`
      );
    }

    return data as T;
  } catch (error) {
    // Handle network errors (function not deployed, CORS, etc.)
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      throw new Error(
        `Edge Function '${functionName}' not found or not accessible. Please ensure it is deployed and CORS is configured.`
      );
    }
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unknown error calling Edge Function ${functionName}`);
  }
}

/**
 * Trigger a manual backup
 * @returns Dispatch ID for polling status
 */
export async function triggerBackup(): Promise<{ dispatch_id: string; status_url: string }> {
  return await callEdgeFunction<{ dispatch_id: string; status_url: string }>('trigger-backup', {
    body: {},
  });
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
  return await callEdgeFunction<{
    status: 'pending' | 'in_progress' | 'success' | 'failed';
    signed_url?: string;
    error?: string;
    backup_id?: string;
  }>('backup-status', {
    body: { dispatch_id: dispatchId },
  });
}

/**
 * Get backup settings (backup_enabled, last_backup_at)
 */
export async function getBackupSettings(): Promise<{
  backup_enabled: boolean;
  last_backup_at: string | null;
}> {
  return await callEdgeFunction<{
    backup_enabled: boolean;
    last_backup_at: string | null;
  }>('settings-toggle', {
    body: {},
  });
}

/**
 * Update backup enabled setting
 */
export async function updateBackupEnabled(enabled: boolean): Promise<void> {
  await callEdgeFunction('settings-toggle', {
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
  return await callEdgeFunction<
    Array<{
      id: string;
      s3_key: string | null;
      created_at: string;
      status: 'success' | 'failed' | 'cancelled' | 'in_progress';
      size_bytes: number | null;
      error_text: string | null;
      dispatch_id?: string | null;
    }>
  >('backup-history', {
    body: { limit },
  });
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
  return await callEdgeFunction<{ success: boolean; message: string; cancelled_count: number }>(
    'cancel-backup',
    {
      body: backupIds 
        ? { backup_ids: backupIds }
        : { backup_id: backupId },
    }
  );
}

/**
 * Delete a backup history record
 * @param backupId The backup ID to delete
 * @returns Success message
 */
export async function deleteBackup(
  backupId: string
): Promise<{ success: boolean; message: string }> {
  return await callEdgeFunction<{ success: boolean; message: string }>('delete-backup', {
    body: { backup_id: backupId },
  });
}

/**
 * Generate a signed S3 URL for downloading a backup
 * @param s3Key The S3 key from backup_history
 * @returns Pre-signed URL valid for 15 minutes
 */
export async function generateSignedUrl(s3Key: string): Promise<{ signed_url: string }> {
  return await callEdgeFunction<{ signed_url: string }>('generate-signed-url', {
    body: { s3_key: s3Key },
  });
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
  // Convert File to base64 for JSON transmission
  // Note: For large files, you might want to use direct fetch with FormData
  // but supabase.functions.invoke() works better for authentication
  const arrayBuffer = await backupFile.arrayBuffer();
  const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));

  return await callEdgeFunction<{
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
  }>('restore-backup', {
    body: {
      backup_file: base64,
      file_name: backupFile.name,
      file_type: backupFile.type,
    },
  });
}

