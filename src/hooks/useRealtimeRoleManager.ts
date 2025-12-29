import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

interface RealtimeRoleManager {
  isConnected: boolean;
  lastEvent: Date | null;
  subscribeToRoleChanges: (userId: string) => void;
  unsubscribe: () => void;
  forceRefresh: () => Promise<void>;
}

export function useRealtimeRoleManager(): RealtimeRoleManager {
  const channelRef = useRef<any>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<Date | null>(null);

  const handleRoleChange = useCallback(async (payload: any) => {
    console.log('Realtime role change event:', payload);
    
    const stored = localStorage.getItem('auth_user');
    if (!stored) return;

    try {
      const currentUser = JSON.parse(stored);
      
      // Only process if this affects the current user
      if (payload.new?.user_id === currentUser.user_id) {
        const { new: newRecord, old: oldRecord } = payload;
        
        // Check if role actually changed
        const roleChanged = newRecord.role_id !== oldRecord.role_id ||
                          newRecord.role_version !== oldRecord.role_version;
        
        if (roleChanged) {
          // Refresh user data from server
          const { data: freshUserData, error } = await supabase.rpc('get_user_permissions', {
            p_user_id: currentUser.user_id
          });

          if (error) {
            console.error('Error fetching fresh user data:', error);
            return;
          }

          const userRecord = freshUserData[0];
          if (!userRecord) {
            // User might have been deactivated
            localStorage.removeItem('auth_user');
            toast.error('Your account has been deactivated', {
              description: 'Please contact an administrator',
              duration: 5000
            });
            setTimeout(() => {
              window.location.href = '/login';
            }, 2000);
            return;
          }

          // Update local storage with fresh data
          const updatedUser = {
            ...currentUser,
            role_id: userRecord.role_id,
            role_name: userRecord.role_name,
            role_version: userRecord.role_version,
            role_permissions: userRecord.permissions,
            has_valid_role: userRecord.is_active && userRecord.role_id !== null
          };

          localStorage.setItem('auth_user', JSON.stringify(updatedUser));
          setLastEvent(new Date());

          // Show appropriate notification
          if (!userRecord.is_active) {
            toast.error('Your account has been deactivated', {
              description: 'Please contact an administrator',
              duration: 5000
            });
            setTimeout(() => {
              window.location.href = '/login';
            }, 2000);
          } else if (!userRecord.role_id) {
            toast.warning('Your role has been removed', {
              description: 'You now have limited access to the system',
              duration: 5000
            });
          } else {
            toast.info('Your permissions have been updated', {
              description: 'Some features may now be available or restricted',
              duration: 5000
            });
          }

          // Trigger app-wide refresh
          window.dispatchEvent(new CustomEvent('roleChanged', { 
            detail: { user: updatedUser } 
          }));
        }
      }
    } catch (error) {
      console.error('Error handling role change event:', error);
    }
  }, []);

  const handleSessionInvalidation = useCallback((payload: any) => {
    console.log('Realtime session invalidation:', payload);
    
    const stored = localStorage.getItem('auth_user');
    if (!stored) return;

    try {
      const currentUser = JSON.parse(stored);
      
      if (payload.new?.user_id === currentUser.user_id) {
        localStorage.removeItem('auth_user');
        setLastEvent(new Date());
        
        toast.error('Session terminated by administrator', {
          description: payload.new?.reason || 'Please log in again',
          duration: 5000
        });
        
        setTimeout(() => {
          window.location.href = '/login';
        }, 2000);
      }
    } catch (error) {
      console.error('Error handling session invalidation:', error);
    }
  }, []);

  const subscribeToRoleChanges = useCallback((userId: string) => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase
      .channel(`role-changes-${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'system_users',
          filter: `user_id=eq.${userId}`
        },
        handleRoleChange
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_invalidations',
          filter: `user_id=eq.${userId}`
        },
        handleSessionInvalidation
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'roles',
          filter: `is_active=eq.false`
        },
        async (payload) => {
          // Handle role deactivation
          const stored = localStorage.getItem('auth_user');
          if (!stored) return;

          try {
            const currentUser = JSON.parse(stored);
            if (currentUser.role_id === payload.new?.role_id) {
              // User's role was deactivated
              handleRoleChange({
                new: { user_id: currentUser.user_id, role_id: null, role_version: null },
                old: { user_id: currentUser.user_id, role_id: currentUser.role_id, role_version: currentUser.role_version }
              });
            }
          } catch (error) {
            console.error('Error handling role deactivation:', error);
          }
        }
      )
      .subscribe((status) => {
        console.log('Realtime subscription status:', status);
        setIsConnected(status === 'SUBSCRIBED');
      });

    channelRef.current = channel;
  }, [handleRoleChange, handleSessionInvalidation]);

  const unsubscribe = useCallback(() => {
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const forceRefresh = useCallback(async () => {
    const stored = localStorage.getItem('auth_user');
    if (!stored) return;

    try {
      const currentUser = JSON.parse(stored);
      
      // Trigger manual verification
      const { data: verification, error } = await supabase.rpc('verify_user_session', {
        p_user_id: currentUser.user_id,
        p_current_role_id: currentUser.role_id || null,
        p_current_role_version: currentUser.role_version || null
      });

      if (error) {
        console.error('Error in force refresh:', error);
        return;
      }

      if (verification[0]?.role_changed && verification[0]?.latest_user_data) {
        // Update with fresh data
        const updatedUser = {
          ...currentUser,
          ...verification[0].latest_user_data
        };
        localStorage.setItem('auth_user', JSON.stringify(updatedUser));
        setLastEvent(new Date());

        toast.info('Permissions refreshed', {
          description: 'Your access permissions have been updated',
          duration: 3000
        });

        window.dispatchEvent(new CustomEvent('roleChanged', { 
          detail: { user: updatedUser } 
        }));
      }
    } catch (error) {
      console.error('Error in force refresh:', error);
    }
  }, []);

  // Auto-subscribe when user is available
  useEffect(() => {
    const stored = localStorage.getItem('auth_user');
    if (stored) {
      try {
        const currentUser = JSON.parse(stored);
        subscribeToRoleChanges(currentUser.user_id);
      } catch (error) {
        console.error('Error parsing auth_user for realtime subscription:', error);
      }
    }

    return unsubscribe;
  }, [subscribeToRoleChanges, unsubscribe]);

  // Cleanup on unmount
  useEffect(() => {
    return unsubscribe;
  }, [unsubscribe]);

  return {
    isConnected,
    lastEvent,
    subscribeToRoleChanges,
    unsubscribe,
    forceRefresh
  };
}
