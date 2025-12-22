/**
 * Utility functions for permission management and validation
 * These functions help ensure permission consistency and provide debugging tools
 */

import { supabase } from "./supabaseClient";
import { normalizePermissions, type ResolvedPermissions } from "./permissions";
import { refreshUserPermissions } from "./permissionRefresh";

/**
 * Validate that localStorage permissions match database permissions
 * Returns true if they match, false otherwise
 */
export async function validatePermissionConsistency(userId: string): Promise<{
  isConsistent: boolean;
  localPermissions: ResolvedPermissions;
  dbPermissions: ResolvedPermissions;
  details: string;
}> {
  try {
    // Get permissions from localStorage
    const stored = localStorage.getItem('auth_user');
    let localPermissions: ResolvedPermissions = {} as ResolvedPermissions;
    
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (parsed.user_id === userId) {
          localPermissions = normalizePermissions(parsed.role_permissions);
        }
      } catch (e) {
        console.error('Error parsing localStorage permissions:', e);
      }
    }

    // Get permissions from database
    const { data: user, error: userError } = await supabase
      .from("system_users")
      .select("role_id")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return {
        isConsistent: false,
        localPermissions,
        dbPermissions: {} as ResolvedPermissions,
        details: `Error fetching user from database: ${userError?.message || 'User not found'}`
      };
    }

    let dbPermissions: ResolvedPermissions = {} as ResolvedPermissions;
    
    if (user.role_id) {
      const { data: role, error: roleError } = await supabase
        .from("roles")
        .select("permissions")
        .eq("role_id", user.role_id)
        .single();

      if (roleError) {
        return {
          isConsistent: false,
          localPermissions,
          dbPermissions: {} as ResolvedPermissions,
          details: `Error fetching role from database: ${roleError?.message}`
        };
      }

      dbPermissions = normalizePermissions(role?.permissions);
    }

    // Compare permissions
    const isConsistent = JSON.stringify(localPermissions) === JSON.stringify(dbPermissions);
    
    return {
      isConsistent,
      localPermissions,
      dbPermissions,
      details: isConsistent ? 'Permissions are consistent' : 'Permissions mismatch between localStorage and database'
    };
  } catch (error) {
    console.error('Error validating permission consistency:', error);
    return {
      isConsistent: false,
      localPermissions: {} as ResolvedPermissions,
      dbPermissions: {} as ResolvedPermissions,
      details: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Fix permission inconsistencies by refreshing from database
 */
export async function fixPermissionInconsistencies(userId: string): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const validation = await validatePermissionConsistency(userId);
    
    if (validation.isConsistent) {
      return {
        success: true,
        message: 'Permissions are already consistent'
      };
    }

    // Refresh permissions from database
    const refreshedPermissions = await refreshUserPermissions(userId);
    
    if (refreshedPermissions) {
      return {
        success: true,
        message: 'Permissions have been refreshed and are now consistent'
      };
    } else {
      return {
        success: false,
        message: 'Failed to refresh permissions from database'
      };
    }
  } catch (error) {
    console.error('Error fixing permission inconsistencies:', error);
    return {
      success: false,
      message: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`
    };
  }
}

/**
 * Get permission audit information for debugging
 */
export async function getPermissionAudit(userId: string): Promise<{
  userId: string;
  localStorageData: any;
  databaseUser: any;
  databaseRole: any;
  validation: any;
} | null> {
  try {
    // Get localStorage data
    const stored = localStorage.getItem('auth_user');
    let localStorageData = null;
    
    if (stored) {
      try {
        localStorageData = JSON.parse(stored);
      } catch (e) {
        console.error('Error parsing localStorage:', e);
      }
    }

    // Get database user
    const { data: dbUser } = await supabase
      .from("system_users")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Get database role
    let dbRole = null;
    if (dbUser?.role_id) {
      const { data: role, error: roleError } = await supabase
        .from("roles")
        .select("*")
        .eq("role_id", dbUser.role_id)
        .single();
      
      if (!roleError) {
        dbRole = role;
      }
    }

    // Get validation
    const validation = await validatePermissionConsistency(userId);

    return {
      userId,
      localStorageData,
      databaseUser: dbUser,
      databaseRole: dbRole,
      validation
    };
  } catch (error) {
    console.error('Error getting permission audit:', error);
    return null;
  }
}

/**
 * Check if user has been deactivated and clean up if necessary
 */
export async function handleUserDeactivation(userId: string): Promise<{
  wasDeactivated: boolean;
  action: 'none' | 'logout_required' | 'permissions_cleared';
}> {
  try {
    const { data: user, error } = await supabase
      .from("system_users")
      .select("status")
      .eq("user_id", userId)
      .single();

    if (error || !user) {
      return {
        wasDeactivated: false,
        action: 'none'
      };
    }

    if (user.status !== 'active') {
      // User is deactivated, clear localStorage
      localStorage.removeItem('auth_user');
      localStorage.removeItem('current_page');
      
      return {
        wasDeactivated: true,
        action: 'logout_required'
      };
    }

    return {
      wasDeactivated: false,
      action: 'none'
    };
  } catch (error) {
    console.error('Error handling user deactivation:', error);
    return {
      wasDeactivated: false,
      action: 'none'
    };
  }
}
