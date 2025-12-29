import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

interface ApiError {
  status?: number;
  message?: string;
  code?: string;
  details?: any;
}

interface SecureApiClient {
  get: <T>(url: string, options?: RequestInit) => Promise<T>;
  post: <T>(url: string, data?: any, options?: RequestInit) => Promise<T>;
  put: <T>(url: string, data?: any, options?: RequestInit) => Promise<T>;
  delete: <T>(url: string, options?: RequestInit) => Promise<T>;
  rpc: <T>(functionName: string, params?: any) => Promise<T>;
}

export function useSecureApiClient(): SecureApiClient {
  const handleAuthError = useCallback((error: ApiError) => {
    const stored = localStorage.getItem('auth_user');
    if (!stored) return;

    // Handle different types of authentication errors
    switch (error.status) {
      case 401:
        // Unauthorized - session expired or invalid
        toast.error('Session expired', {
          description: 'Please log in again',
          duration: 5000
        });
        localStorage.removeItem('auth_user');
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
        break;

      case 403:
        // Forbidden - insufficient permissions
        toast.error('Access denied', {
          description: 'You do not have permission to perform this action',
          duration: 5000
        });
        break;

      case 425:
        // Too Early - role version mismatch
        toast.warning('Permissions updated', {
          description: 'Your session is being refreshed with new permissions',
          duration: 3000
        });
        // Trigger role verification
        window.dispatchEvent(new CustomEvent('forceRoleVerification'));
        break;

      default:
        // Other errors
        if (error.message?.includes('JWT') || error.message?.includes('token')) {
          toast.error('Authentication error', {
            description: 'Please log in again',
            duration: 5000
          });
          localStorage.removeItem('auth_user');
          setTimeout(() => {
            window.location.href = '/login';
          }, 2000);
        }
        break;
    }
  }, []);

  const makeRequest = useCallback(async <T>(
    requestFn: () => Promise<T>,
    options?: { skipAuthHandling?: boolean }
  ): Promise<T> => {
    try {
      return await requestFn();
    } catch (error: any) {
      const apiError: ApiError = {
        status: error.status,
        message: error.message,
        code: error.code,
        details: error.details
      };

      // Log error for debugging
      console.error('API Error:', {
        status: apiError.status,
        message: apiError.message,
        code: apiError.code,
        details: apiError.details
      });

      // Handle authentication errors
      if (!options?.skipAuthHandling) {
        handleAuthError(apiError);
      }

      throw apiError;
    }
  }, [handleAuthError]);

  const get = useCallback(async <T>(
    url: string
  ): Promise<T> => {
    return makeRequest(async () => {
      const { data, error } = await supabase
        .from(url.startsWith('/') ? url.substring(1) : url)
        .select('*')
        .eq('user_id', (JSON.parse(localStorage.getItem('auth_user') || '{}').user_id));

      if (error) throw error;
      return data as T;
    });
  }, [makeRequest]);

  const post = useCallback(async <T>(
    url: string, 
    data?: any
  ): Promise<T> => {
    return makeRequest(async () => {
      const stored = localStorage.getItem('auth_user');
      const currentUser = stored ? JSON.parse(stored) : {};
      
      const { data: result, error } = await supabase
        .from(url.startsWith('/') ? url.substring(1) : url)
        .insert({
          ...data,
          created_by: currentUser.user_id,
          updated_by: currentUser.user_id
        })
        .select()
        .single();

      if (error) throw error;
      return result as T;
    });
  }, [makeRequest]);

  const put = useCallback(async <T>(
    url: string, 
    data?: any
  ): Promise<T> => {
    return makeRequest(async () => {
      const stored = localStorage.getItem('auth_user');
      const currentUser = stored ? JSON.parse(stored) : {};
      
      const { data: result, error } = await supabase
        .from(url.startsWith('/') ? url.substring(1) : url)
        .update({
          ...data,
          updated_by: currentUser.user_id,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;
      return result as T;
    });
  }, [makeRequest]);

  const deleteItem = useCallback(async <T>(
    url: string
  ): Promise<T> => {
    return makeRequest(async () => {
      const { data, error } = await supabase
        .from(url.startsWith('/') ? url.substring(1) : url)
        .delete()
        .select()
        .single();

      if (error) throw error;
      return data as T;
    });
  }, [makeRequest]);

  const rpc = useCallback(async <T>(
    functionName: string, 
    params?: any
  ): Promise<T> => {
    return makeRequest(async () => {
      const { data, error } = await supabase.rpc(functionName, params);
      
      if (error) throw error;
      return data as T;
    });
  }, [makeRequest]);

  return {
    get,
    post,
    put,
    delete: deleteItem,
    rpc
  };
}

// Global error boundary for unhandled promise rejections
export function setupGlobalErrorHandling() {
  window.addEventListener('unhandledrejection', (event) => {
    const error = event.reason as ApiError;
    
    // Handle authentication-related errors globally
    if (error?.status === 401 || error?.status === 403) {
      const stored = localStorage.getItem('auth_user');
      if (stored) {
        console.error('Global auth error:', error);
        localStorage.removeItem('auth_user');
        window.location.href = '/login';
      }
    }
  });

  // Handle custom role verification events
  window.addEventListener('forceRoleVerification', async () => {
    try {
      const stored = localStorage.getItem('auth_user');
      if (!stored) return;

      const currentUser = JSON.parse(stored);
      
      const { data: verification, error } = await supabase.rpc('verify_user_session', {
        p_user_id: currentUser.user_id,
        p_current_role_id: currentUser.role_id || null,
        p_current_role_version: currentUser.role_version || null
      });

      if (error) {
        console.error('Role verification failed:', error);
        return;
      }

      if (verification[0]?.role_changed && verification[0]?.latest_user_data) {
        const updatedUser = {
          ...currentUser,
          ...verification[0].latest_user_data
        };
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        
        toast.info('Permissions refreshed', {
          description: 'Your access permissions have been updated',
          duration: 3000
        });

        window.dispatchEvent(new CustomEvent('roleChanged', { 
          detail: { user: updatedUser } 
        }));
      }
    } catch (error) {
      console.error('Error in global role verification:', error);
    }
  });
}
