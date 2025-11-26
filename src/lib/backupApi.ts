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
 * Uses direct fetch for better error handling to get full error messages
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
    // Use direct fetch to get better error messages
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration is missing. Please check your environment variables.');
    }

    const functionUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/${functionName}`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
        ...headers,
      },
      body: JSON.stringify(requestBody),
    });

    const responseText = await response.text();
    let responseData: any;
    
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      // If response is not JSON, use the text as error message
      throw new Error(`Edge Function ${functionName} returned invalid response: ${responseText}`);
    }

    if (!response.ok) {
      // Extract error message from response
      let errorMessage = 'Unknown error';
      
      if (responseData) {
        if (responseData.error) {
          errorMessage = responseData.error;
        }
        if (responseData.message && responseData.message !== responseData.error) {
          errorMessage += `: ${responseData.message}`;
        }
        if (responseData.details) {
          errorMessage += ` (${responseData.details})`;
        }
      } else {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      
      throw new Error(
        `Edge Function ${functionName} failed: ${errorMessage}`
      );
    }

    return responseData as T;
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
  progress?: number; // ✅ NEW: Real-time progress percentage
  current_step?: string; // ✅ NEW: Current workflow step
}> {
  return await callEdgeFunction<{
    status: 'pending' | 'in_progress' | 'success' | 'failed';
    signed_url?: string;
    error?: string;
    backup_id?: string;
    progress?: number;
    current_step?: string;
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
 * @param limit Maximum number of entries to return
 * @param filters Optional filters (status, start_date, end_date, search)
 */
export async function getBackupHistory(
  limit: number = 5,
  filters?: {
    status?: 'success' | 'failed' | 'cancelled' | 'in_progress' | 'all';
    start_date?: string; // ISO date string
    end_date?: string; // ISO date string
    search?: string; // Search query for filename
  }
): Promise<
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
    body: { 
      limit,
      ...(filters || {}),
    },
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
  const userId = getCurrentUserId();
  
  if (!userId) {
    throw new Error('Authentication required. Please log in.');
  }

  // Try direct fetch first (bypasses Supabase's invoke CORS issues)
  // This works better when CORS is configured at the function level
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
    
    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error('Supabase configuration is missing. Please check your environment variables.');
    }

    const functionUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/generate-signed-url`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseAnonKey}`,
        'apikey': supabaseAnonKey,
      },
      body: JSON.stringify({
        s3_key: s3Key,
        user_id: userId,
      }),
    });

    const responseText = await response.text();
    let responseData: any;
    
    try {
      responseData = responseText ? JSON.parse(responseText) : null;
    } catch (parseError) {
      throw new Error(`Edge Function generate-signed-url returned invalid response: ${responseText}`);
    }

    if (!response.ok) {
      let errorMessage = 'Unknown error';
      if (responseData) {
        errorMessage = responseData.error || responseData.message || `HTTP ${response.status}`;
      } else {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }
      throw new Error(`Failed to generate signed URL: ${errorMessage}`);
    }

    if (!responseData || !responseData.signed_url) {
      throw new Error('Invalid response from generate-signed-url function: missing signed_url');
    }

    return { signed_url: responseData.signed_url };
  } catch (error) {
    // If direct fetch fails with CORS, try using supabase.functions.invoke() as fallback
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      console.warn('Direct fetch failed (possibly CORS), trying supabase.functions.invoke()...');
      try {
        const { data, error: invokeError } = await supabase.functions.invoke('generate-signed-url', {
          body: { 
            s3_key: s3Key,
            user_id: userId,
          },
        });

        if (invokeError) {
          throw new Error(invokeError.message || 'Failed to generate signed URL via invoke');
        }

        if (!data || !data.signed_url) {
          throw new Error('Invalid response from generate-signed-url function');
        }

        return { signed_url: data.signed_url };
      } catch (invokeError) {
        // If both methods fail, provide a helpful error message
        throw new Error(
          `Failed to generate signed URL. The Edge Function may not be deployed or CORS is not configured. ` +
          `Please ensure the 'generate-signed-url' function is deployed and CORS is configured in Supabase Dashboard. ` +
          `Original error: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }
    throw error;
  }
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

/**
 * Share a backup via Email or WhatsApp
 * @param backupId The backup ID to share
 * @param method Sharing method: 'email' or 'whatsapp'
 * @param recipient Email address or WhatsApp number
 * @returns Success status and share URL (for WhatsApp)
 */
export async function shareBackup(
  backupId: string,
  method: 'email' | 'whatsapp',
  recipient: string
): Promise<{
  success: boolean;
  message: string;
  whatsapp_url?: string;
  note?: string;
}> {
  return await callEdgeFunction<{
    success: boolean;
    message: string;
    whatsapp_url?: string;
    note?: string;
  }>('share-backup', {
    body: {
      backup_id: backupId,
      method,
      recipient,
    },
  });
}

/**
 * Update backup history with s3_key, status, and finished_at
 * Called by GitHub Actions workflow after backup is uploaded to S3
 * @param backupId The backup ID (or dispatch_id)
 * @param s3Key The S3 key where the backup is stored
 * @param status The backup status ('success', 'failed', 'cancelled')
 * @param sizeBytes Optional file size in bytes
 * @param errorText Optional error message if failed
 * @returns Success status and updated backup
 */
export async function updateBackup(
  backupId: string | null,
  dispatchId: string | null,
  s3Key: string | null,
  status: 'success' | 'failed' | 'cancelled',
  sizeBytes?: number | null,
  errorText?: string | null
): Promise<{
  success: boolean;
  message: string;
  backup: any;
}> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const backupApiKey = import.meta.env.VITE_BACKUP_API_KEY as string;
  
  if (!supabaseUrl) {
    throw new Error('Supabase configuration is missing');
  }

  const functionUrl = `${supabaseUrl.replace(/\/$/, '')}/functions/v1/update-backup`;
  
  const response = await fetch(functionUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${backupApiKey || 'service-role-key'}`,
    },
    body: JSON.stringify({
      backup_id: backupId,
      dispatch_id: dispatchId,
      s3_key: s3Key,
      status,
      size_bytes: sizeBytes,
      error_text: errorText,
    }),
  });

  const responseText = await response.text();
  let responseData: any;
  
  try {
    responseData = responseText ? JSON.parse(responseText) : null;
  } catch (parseError) {
    throw new Error(`Update backup returned invalid response: ${responseText}`);
  }

  if (!response.ok) {
    throw new Error(responseData?.error || responseData?.message || 'Failed to update backup');
  }

  return responseData;
}

/**
 * Download a backup by backup ID
 * @param backupId The backup ID to download
 * @returns Download URL and expiration info
 */
export async function downloadBackup(backupId: string): Promise<{
  download_url: string;
  expires_in: number;
  backup_id: string;
  size_bytes?: number | null;
}> {
  return await callEdgeFunction<{
    download_url: string;
    expires_in: number;
    backup_id: string;
    size_bytes?: number | null;
  }>('download-backup', {
    body: {
      backup_id: backupId,
    },
  });
}

