import { useCallback } from 'react';
import { supabase } from '../lib/supabaseClient';
import { toast } from 'sonner';

interface AdminRoleActions {
  updateUserRole: (userId: string, newRoleId: string | null, reason?: string) => Promise<boolean>;
  updateRolePermissions: (roleId: string, permissions: any, reason?: string) => Promise<boolean>;
  deactivateRole: (roleId: string, reason?: string) => Promise<boolean>;
  forceLogoutUser: (userId: string, reason?: string) => Promise<boolean>;
  forceLogoutRoleUsers: (roleId: string, reason?: string) => Promise<boolean>;
}

export function useAdminRoleActions(): AdminRoleActions {
  const getCurrentUserId = useCallback(() => {
    const stored = localStorage.getItem('auth_user');
    if (!stored) return null;
    try {
      const parsed = JSON.parse(stored);
      return parsed.user_id;
    } catch {
      return null;
    }
  }, []);

  const updateUserRole = useCallback(async (
    userId: string, 
    newRoleId: string | null, 
    reason?: string
  ): Promise<boolean> => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      toast.error('Authentication required');
      return false;
    }

    try {
      // Update user role and increment version
      const { error: updateError } = await supabase.rpc('update_user_role_secure', {
        p_target_user_id: userId,
        p_new_role_id: newRoleId,
        p_updated_by: currentUserId,
        p_reason: reason || 'Role updated by administrator'
      });

      if (updateError) {
        console.error('Error updating user role:', updateError);
        toast.error('Failed to update user role');
        return false;
      }

      // Force logout the affected user to refresh their session
      if (userId !== currentUserId) {
        await supabase.rpc('force_logout_user', {
          p_target_user_id: userId,
          p_reason: reason || 'Role updated - session refresh required',
          p_created_by: currentUserId
        });
      }

      toast.success('User role updated successfully', {
        description: userId === currentUserId 
          ? 'Your session will refresh to apply changes'
          : 'User will need to refresh their session'
      });

      // If updating own role, trigger page reload after delay
      if (userId === currentUserId) {
        setTimeout(() => {
          window.location.reload();
        }, 3000);
      }

      return true;
    } catch (error) {
      console.error('Error in updateUserRole:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  }, [getCurrentUserId]);

  const updateRolePermissions = useCallback(async (
    roleId: string, 
    permissions: any, 
    reason?: string
  ): Promise<boolean> => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      toast.error('Authentication required');
      return false;
    }

    try {
      // Update role permissions (this will auto-increment version via trigger)
      const { error: updateError } = await supabase
        .from('roles')
        .update({ 
          permissions,
          updated_by: currentUserId
        })
        .eq('role_id', roleId);

      if (updateError) {
        console.error('Error updating role permissions:', updateError);
        toast.error('Failed to update role permissions');
        return false;
      }

      // Force logout all users with this role
      const { data: logoutResult } = await supabase.rpc('force_logout_role_users', {
        p_role_id: roleId,
        p_reason: reason || 'Role permissions updated - session refresh required',
        p_created_by: currentUserId
      });

      toast.success('Role permissions updated successfully', {
        description: `${logoutResult || 0} user(s) will be notified to refresh their session`
      });

      return true;
    } catch (error) {
      console.error('Error in updateRolePermissions:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  }, [getCurrentUserId]);

  const deactivateRole = useCallback(async (
    roleId: string, 
    reason?: string
  ): Promise<boolean> => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      toast.error('Authentication required');
      return false;
    }

    try {
      // Deactivate the role
      const { error: updateError } = await supabase
        .from('roles')
        .update({ 
          is_active: false,
          updated_by: currentUserId
        })
        .eq('role_id', roleId);

      if (updateError) {
        console.error('Error deactivating role:', updateError);
        toast.error('Failed to deactivate role');
        return false;
      }

      // Force logout all users with this role
      const { data: logoutResult } = await supabase.rpc('force_logout_role_users', {
        p_role_id: roleId,
        p_reason: reason || 'Role deactivated - access revoked',
        p_created_by: currentUserId
      });

      toast.success('Role deactivated successfully', {
        description: `${logoutResult || 0} user(s) lost access to this role`
      });

      return true;
    } catch (error) {
      console.error('Error in deactivateRole:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  }, [getCurrentUserId]);

  const forceLogoutUser = useCallback(async (
    userId: string, 
    reason?: string
  ): Promise<boolean> => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      toast.error('Authentication required');
      return false;
    }

    try {
      const { error } = await supabase.rpc('force_logout_user', {
        p_target_user_id: userId,
        p_reason: reason || 'Session terminated by administrator',
        p_created_by: currentUserId
      });

      if (error) {
        console.error('Error forcing logout:', error);
        toast.error('Failed to terminate user session');
        return false;
      }

      toast.success('User session terminated', {
        description: 'User will be logged out immediately'
      });

      return true;
    } catch (error) {
      console.error('Error in forceLogoutUser:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  }, [getCurrentUserId]);

  const forceLogoutRoleUsers = useCallback(async (
    roleId: string, 
    reason?: string
  ): Promise<boolean> => {
    const currentUserId = getCurrentUserId();
    if (!currentUserId) {
      toast.error('Authentication required');
      return false;
    }

    try {
      const { data: affectedUsers, error } = await supabase.rpc('force_logout_role_users', {
        p_role_id: roleId,
        p_reason: reason || 'Role users logged out by administrator',
        p_created_by: currentUserId
      });

      if (error) {
        console.error('Error forcing logout for role users:', error);
        toast.error('Failed to terminate user sessions');
        return false;
      }

      toast.success('Sessions terminated', {
        description: `${affectedUsers || 0} user(s) with this role were logged out`
      });

      return true;
    } catch (error) {
      console.error('Error in forceLogoutRoleUsers:', error);
      toast.error('An unexpected error occurred');
      return false;
    }
  }, [getCurrentUserId]);

  return {
    updateUserRole,
    updateRolePermissions,
    deactivateRole,
    forceLogoutUser,
    forceLogoutRoleUsers
  };
}
