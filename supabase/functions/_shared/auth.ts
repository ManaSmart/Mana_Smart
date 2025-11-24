// Shared authentication and authorization utilities for Edge Functions

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export interface AuthResult {
  success: boolean;
  user?: {
    user_id: string;
    status: string;
    role_id: string | null;
    role_name?: string | null;
    permissions?: any;
  };
  error?: string;
  statusCode?: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Verify user authentication from request body
 */
export async function verifyAuth(
  supabase: any,
  userId: string | null | undefined
): Promise<AuthResult> {
  if (!userId) {
    return {
      success: false,
      error: "Authentication required. Please log in.",
      statusCode: 401,
    };
  }

  // Verify user exists and is active
  const { data: user, error: userError } = await supabase
    .from("system_users")
    .select("user_id, status, role_id")
    .eq("user_id", userId)
    .single();

  if (userError || !user) {
    return {
      success: false,
      error: "User not found or invalid",
      statusCode: 403,
    };
  }

  if (user.status !== "active") {
    return {
      success: false,
      error: "User account is not active",
      statusCode: 403,
    };
  }

  // Get role information
  let roleName: string | null = null;
  let permissions: any = null;

  if (user.role_id) {
    const { data: role } = await supabase
      .from("roles")
      .select("role_name, permissions")
      .eq("role_id", user.role_id)
      .single();

    roleName = role?.role_name || null;
    permissions = role?.permissions || null;
  }

  return {
    success: true,
    user: {
      user_id: user.user_id,
      status: user.status,
      role_id: user.role_id,
      role_name: roleName,
      permissions: permissions,
    },
  };
}

/**
 * Check if user has admin privileges
 * Admin = role with permissions === "all" OR role_name contains "admin" (case-insensitive)
 */
export function isAdmin(user: AuthResult["user"]): boolean {
  if (!user) return false;

  // Check if permissions is "all"
  if (user.permissions === "all" || user.permissions === "ALL") {
    return true;
  }

  // Check if role_name contains "admin" (case-insensitive)
  const roleName = (user.role_name || "").toLowerCase();
  if (roleName.includes("admin") || roleName.includes("super")) {
    return true;
  }

  return false;
}

/**
 * Simple in-memory rate limiter (for single function instance)
 * For production, consider using Redis or Supabase Edge Config
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  userId: string,
  maxRequests: number,
  windowMs: number
): RateLimitResult {
  const key = userId;
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    // Create new window
    rateLimitStore.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });
    return {
      allowed: true,
      remaining: maxRequests - 1,
      resetAt: now + windowMs,
    };
  }

  if (record.count >= maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: record.resetAt,
    };
  }

  // Increment count
  record.count++;
  rateLimitStore.set(key, record);

  return {
    allowed: true,
    remaining: maxRequests - record.count,
    resetAt: record.resetAt,
  };
}

/**
 * Clean up expired rate limit entries (call periodically)
 */
export function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, record] of rateLimitStore.entries()) {
    if (now > record.resetAt) {
      rateLimitStore.delete(key);
    }
  }
}

