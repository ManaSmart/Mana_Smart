// Supabase Edge Function: backup-history
// Returns backup history entries

// Deno types are provided at runtime - these declarations are for TypeScript IDE support
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// @ts-ignore - Deno handles URL-based imports at runtime
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore - Deno handles URL-based imports at runtime
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const allowedOrigins = [
  "http://localhost:5173",
  "https://console-mana.com",
  "https://www.console-mana.com",
  "https://mana-smart-scent.vercel.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isAllowed = allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowedOrigins[0] || "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { 
      status: 200,
      headers: getCorsHeaders(req) 
    });
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req),
      },
    });
  }

  // Verify user authentication for POST requests
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let userId: string | null = null;
  let body: any = {};
  let limit = 5;

  if (req.method === "POST") {
    try {
      body = await req.json();
      userId = body.user_id || null;
      limit = parseInt(body.limit || "5", 10);
      
      if (!userId) {
        return new Response(
          JSON.stringify({ error: "Authentication required. Please log in." }),
          {
            status: 401,
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeaders(req),
            },
          }
        );
      }

      // Verify user exists and is active
      const { data: user, error: userError } = await supabase
        .from("system_users")
        .select("user_id, status")
        .eq("user_id", userId)
        .single();

      if (userError || !user || user.status !== "active") {
        return new Response(
          JSON.stringify({ error: "User not found or account is not active" }),
          {
            status: 403,
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeaders(req),
            },
          }
        );
      }
    } catch (parseError) {
      return new Response(
        JSON.stringify({ error: "Invalid request body" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    }
  } else {
    // GET request - less strict, but still verify if user_id provided
    const url = new URL(req.url);
    limit = parseInt(url.searchParams.get("limit") || "5", 10);
    userId = url.searchParams.get("user_id");
    
    // If user_id provided in GET, verify it
    if (userId) {
      const { data: user } = await supabase
        .from("system_users")
        .select("user_id, status")
        .eq("user_id", userId)
        .single();
      
      // Don't fail if user not found in GET, just ignore user_id
      if (!user || user.status !== "active") {
        userId = null;
      }
    }
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ✅ NEW: Get filter parameters
    const statusFilter = body.status || url.searchParams.get("status");
    const startDate = body.start_date || url.searchParams.get("start_date");
    const endDate = body.end_date || url.searchParams.get("end_date");
    const searchQuery = body.search || url.searchParams.get("search"); // For filename search

    // Build query - ✅ FIXED: Get all columns including workflow_run_id
    let query = supabase
      .from("backup_history")
      .select("id, s3_key, created_at, status, size_bytes, error_text, dispatch_id, workflow_run_id")
      .order("created_at", { ascending: false });

    // ✅ NEW: Apply status filter
    if (statusFilter && statusFilter !== "all") {
      query = query.eq("status", statusFilter);
    }

    // ✅ NEW: Apply date filters
    if (startDate) {
      query = query.gte("created_at", startDate);
    }
    if (endDate) {
      // Add 23:59:59 to end date to include the full day
      const endDateTime = new Date(endDate);
      endDateTime.setHours(23, 59, 59, 999);
      query = query.lte("created_at", endDateTime.toISOString());
    }

    // Apply limit (increase if filtering to show more results)
    const queryLimit = statusFilter || startDate || endDate ? Math.min(limit * 3, 100) : limit;
    query = query.limit(queryLimit);

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    let results = data || [];

    // ✅ NEW: Apply search filter (filename search) on client side for flexibility
    if (searchQuery && searchQuery.trim()) {
      const searchLower = searchQuery.toLowerCase();
      results = results.filter((item) => {
        // Search in S3 key (filename)
        if (item.s3_key && item.s3_key.toLowerCase().includes(searchLower)) {
          return true;
        }
        // Search in error text
        if (item.error_text && item.error_text.toLowerCase().includes(searchLower)) {
          return true;
        }
        // Search in dispatch_id
        if (item.dispatch_id && item.dispatch_id.toLowerCase().includes(searchLower)) {
          return true;
        }
        return false;
      });
    }

    // ✅ NEW: Limit results after filtering
    results = results.slice(0, limit);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req),
      },
    });
  } catch (error) {
    console.error("Error getting backup history:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      }
    );
  }
});

