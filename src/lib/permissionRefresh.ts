/**
 * Utility functions for refreshing user permissions when roles are updated
 */

import { supabase } from "./supabaseClient";
import { normalizePermissions, type ResolvedPermissions } from "./permissions";

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
        return null;
      }

      roleName = role?.role_name;
      rolePermissions = role?.permissions ?? null;
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
    await Promise.allSettled(
      (users || []).map((user) => refreshUserPermissions(user.user_id))
    );
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

