/**
 * Utility functions for refreshing user permissions when roles are updated
 */

import { supabase } from "./supabaseClient";
import { normalizePermissions, type ResolvedPermissions } from "./permissions";
import { permissionEvents, PERMISSION_EVENTS } from "./permissionEvents";

/**
 * Refresh user permissions from the database and update localStorage
 * This should be called when a role is updated to ensure all users with that role
 * get the updated permissions without requiring a logout/login
 */
export async function refreshUserPermissions(userId: string): Promise<ResolvedPermissions | null> {
  try {
    // Fetch current user data
    const { data: user, error: userError } = await supabase
      .from("system_users")
      .select("user_id, email, full_name, role_id, status")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      console.error("Error fetching user:", userError);
      return null;
    }

    // Check if user is inactive
    if (user.status !== "active") {
      // User is inactive, clear auth and return null
      localStorage.removeItem("auth_user");
      return null;
    }

    // Fetch role permissions
    let rolePermissions: any = null;
    let roleName: string | undefined;

    if (user.role_id) {
      const { data: role, error: roleError } = await supabase
        .from("roles")
        .select("role_name, permissions")
        .eq("role_id", user.role_id)
        .single();

      if (roleError) {
        console.error("Error fetching role:", roleError);
        // Handle case where role is not found (PGRST116)
        if (roleError.code === 'PGRST116') {
          console.warn(`Role with ID ${user.role_id} not found for user ${userId}`);
          // Set default permissions for users with missing roles
          roleName = "user";
          rolePermissions = null;
        } else {
          return null;
        }
      } else {
        roleName = role?.role_name;
        rolePermissions = role?.permissions ?? null;
      }
    }

    // Normalize permissions
    const resolvedPermissions = normalizePermissions(rolePermissions);

    // Update localStorage
    const authData = {
      user_id: user.user_id,
      email: user.email,
      full_name: user.full_name,
      role_id: user.role_id,
      role_name: roleName ?? "",
      role_permissions: rolePermissions,
    };

    localStorage.setItem("auth_user", JSON.stringify(authData));

    // Emit global event that permissions have been updated
    permissionEvents.emit(PERMISSION_EVENTS.PERMISSIONS_UPDATED, {
      userId,
      permissions: resolvedPermissions,
      rolePermissions,
      roleName,
    });

    return resolvedPermissions;
  } catch (error) {
    console.error("Error refreshing permissions:", error);
    return null;
  }
}

/**
 * Refresh permissions for all users with a specific role
 * This is called when a role is updated
 */
export async function refreshPermissionsForRole(roleId: string): Promise<void> {
  try {
    // Get all active users with this role
    const { data: users, error } = await supabase
      .from("system_users")
      .select("user_id")
      .eq("role_id", roleId)
      .eq("status", "active");

    if (error) {
      console.error("Error fetching users for role:", error);
      return;
    }

    // Refresh permissions for each user
    // Use Promise.allSettled to handle errors gracefully
    const results = await Promise.allSettled(
      (users || []).map((user) => refreshUserPermissions(user.user_id))
    );

    // Emit role updated event with reload request
    permissionEvents.emit(PERMISSION_EVENTS.ROLE_UPDATED, {
      roleId,
      userCount: users?.length || 0,
      results: results.map(r => r.status === 'fulfilled' ? r.value : null),
      shouldReload: true, // Flag to indicate reload should be triggered
    });

    // Also emit broadcast reload event specifically for this role
    permissionEvents.emit(PERMISSION_EVENTS.BROADCAST_RELOAD, {
      roleId,
      userCount: users?.length || 0,
      reason: 'role-permissions-updated'
    });

    console.log(`Refreshed permissions for ${users?.length || 0} users with role ${roleId} and triggered reload`);
  } catch (error) {
    console.error("Error refreshing permissions for role:", error);
  }
}

/**
 * Check if current user is still active
 * Returns true if user is active, false if inactive or error
 */
export async function verifyUserStatus(userId: string): Promise<boolean> {
  try {
    const { data: user, error } = await supabase
      .from("system_users")
      .select("status")
      .eq("user_id", userId)
      .single();

    if (error || !user) {
      return false;
    }

    return user.status === "active";
  } catch (error) {
    console.error("Error verifying user status:", error);
    return false;
  }
}

/**
 * Force refresh permissions for all active users
 * This is useful for debugging or when you want to ensure all users have the latest permissions
 */
export async function refreshAllPermissions(): Promise<void> {
  try {
    // Get all active users
    const { data: users, error } = await supabase
      .from("system_users")
      .select("user_id")
      .eq("status", "active");

    if (error) {
      console.error("Error fetching all active users:", error);
      return;
    }

    console.log(`Refreshing permissions for all ${users?.length || 0} active users...`);
    
    // Refresh permissions for each user
    const results = await Promise.allSettled(
      (users || []).map((user) => refreshUserPermissions(user.user_id))
    );

    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    console.log(`Permission refresh completed: ${successful} successful, ${failed} failed`);

    // Emit global event for all permissions refresh
    permissionEvents.emit('all-permissions-refreshed', {
      totalUsers: users?.length || 0,
      successful,
      failed,
      results: results.map(r => r.status === 'fulfilled' ? r.value : null),
    });
  } catch (error) {
    console.error("Error refreshing all permissions:", error);
  }
}

