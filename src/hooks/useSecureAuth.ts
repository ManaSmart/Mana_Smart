import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

interface AuthUser {
  user_id: string;
  email: string;
  full_name: string;
  role_id?: string;
  role_name?: string;
  role_permissions?: any;
  role_version?: number;
  has_valid_role?: boolean;
  role_assigned_at?: string;
}

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isVerified: boolean;
  lastVerification: Date;
}

export function useSecureAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    isLoading: true,
    isVerified: false,
    lastVerification: new Date(),
  });

  // Verify user role and session status
  const verifySession = useCallback(async (force = false) => {
    const stored = localStorage.getItem('auth_user');
    if (!stored) {
      setAuthState(prev => ({ ...prev, isLoading: false, user: null, isVerified: false }));
      return false;
    }

    try {
      const parsedUser: AuthUser = JSON.parse(stored);
      
      // Check if verification is needed (every 5 minutes or forced)
      const now = new Date();
      const timeSinceLastCheck = now.getTime() - authState.lastVerification.getTime();
      const shouldVerify = force || timeSinceLastCheck > 5 * 60 * 1000; // 5 minutes

      if (!shouldVerify) {
        setAuthState(prev => ({ 
          ...prev, 
          user: parsedUser, 
          isLoading: false, 
          isVerified: true 
        }));
        return true;
      }

      // Verify role version and session status
      const { data: verification, error } = await supabase.rpc('verify_user_session', {
        p_user_id: parsedUser.user_id,
        p_current_role_id: parsedUser.role_id || null,
        p_current_role_version: parsedUser.role_version || null
      });

      if (error) {
        console.error('Session verification failed:', error);
        handleSessionInvalidation('Session verification failed');
        return false;
      }

      const { is_valid, role_changed, session_invalidated, latest_user_data } = verification;

      if (!is_valid || session_invalidated) {
        handleSessionInvalidation('Session invalidated by administrator');
        return false;
      }

      if (role_changed && latest_user_data) {
        // Update local storage with new role data
        const updatedUser = {
          ...parsedUser,
          ...latest_user_data
        };
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        
        setAuthState(prev => ({
          ...prev,
          user: updatedUser,
          isVerified: true,
          lastVerification: now
        }));

        // Show notification about role change
        toast.warning('Your role permissions have been updated', {
          description: 'Some features may now be available or restricted.',
          duration: 5000
        });

        // Trigger app-wide refresh of permissions
        window.dispatchEvent(new CustomEvent('roleChanged', { 
          detail: { user: updatedUser } 
        }));
      } else {
        setAuthState(prev => ({
          ...prev,
          user: parsedUser,
          isVerified: true,
          lastVerification: now
        }));
      }

      return true;
    } catch (error) {
      console.error('Error verifying session:', error);
      handleSessionInvalidation('Session verification error');
      return false;
    }
  }, [authState.lastVerification]);

  // Handle session invalidation
  const handleSessionInvalidation = useCallback((reason: string) => {
    localStorage.removeItem('auth_user');
    setAuthState({
      user: null,
      isLoading: false,
      isVerified: false,
      lastVerification: new Date()
    });

    toast.error('Session ended', {
      description: reason,
      duration: 5000
    });

    // Redirect to login after a short delay
    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
  }, []);

  // Setup real-time session monitoring
  useEffect(() => {
    const channel = supabase
      .channel('session-monitor')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_invalidations',
          filter: `user_id=eq.${authState.user?.user_id}`
        },
        (payload) => {
          console.log('Session invalidation received:', payload);
          handleSessionInvalidation('Your session has been ended by an administrator');
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'system_users',
          filter: `user_id=eq.${authState.user?.user_id}`
        },
        async (payload) => {
          const newRecord = payload.new;
          const oldRecord = payload.old;
          
          // Check if role changed
          if (newRecord.role_id !== oldRecord.role_id || 
              newRecord.role_version !== oldRecord.role_version) {
            await verifySession(true); // Force verification
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [authState.user?.user_id, verifySession, handleSessionInvalidation]);

  // Periodic session verification
  useEffect(() => {
    if (!authState.user) return;

    const interval = setInterval(() => {
      verifySession();
    }, 5 * 60 * 1000); // Every 5 minutes

    return () => clearInterval(interval);
  }, [authState.user, verifySession]);

  // Initial verification
  useEffect(() => {
    verifySession();
  }, [verifySession]);

  // API call wrapper with automatic session verification
  const withAuthCheck = useCallback(async <T>(
    apiCall: () => Promise<T>,
    options?: { skipVerification?: boolean }
  ): Promise<T> => {
    if (!options?.skipVerification && authState.user) {
      const isValid = await verifySession();
      if (!isValid) {
        throw new Error('Session invalid');
      }
    }

    try {
      return await apiCall();
    } catch (error: any) {
      // Handle 401/403 responses
      if (error?.status === 401 || error?.status === 403) {
        handleSessionInvalidation('Access denied - session may have expired');
        throw error;
      }
      throw error;
    }
  }, [verifySession, handleSessionInvalidation, authState.user]);

  return {
    ...authState,
    verifySession,
    withAuthCheck,
    handleSessionInvalidation
  };
}
