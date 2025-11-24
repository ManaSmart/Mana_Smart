// Supabase Edge Function: trigger-backup
// Triggers a GitHub Actions workflow dispatch for manual backup

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
const GITHUB_TOKEN = Deno.env.get("GITHUB_TOKEN") ?? "";
const GITHUB_OWNER = Deno.env.get("GITHUB_OWNER") ?? "";
const GITHUB_REPO = Deno.env.get("GITHUB_REPO") ?? "";
const GITHUB_WORKFLOW_ID = Deno.env.get("GITHUB_WORKFLOW_ID") ?? "backup.yml";

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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req),
      },
    });
  }

  // Verify user authentication
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let body: any = {};
  let userId: string | null = null;
  
  try {
    body = await req.json();
    userId = body.user_id || null;
    
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
      .select("user_id, status, role_id")
      .eq("user_id", userId)
      .single();

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "User not found or invalid" }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    }

    if (user.status !== "active") {
      return new Response(
        JSON.stringify({ error: "User account is not active" }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    }

    // Check for admin role (trigger backup is critical operation)
    let isAdmin = false;
    if (user.role_id) {
      const { data: role } = await supabase
        .from("roles")
        .select("role_name, permissions")
        .eq("role_id", user.role_id)
        .single();

      if (role) {
        const permissions = role.permissions;
        const roleName = (role.role_name || "").toLowerCase();
        isAdmin = permissions === "all" || permissions === "ALL" || 
                  roleName.includes("admin") || roleName.includes("super");
      }
    }

    if (!isAdmin) {
      return new Response(
        JSON.stringify({ error: "Admin access required for backup operations" }),
        {
          status: 403,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    }

    // Rate limiting: Max 5 backups per hour per user
    const rateLimitKey = `trigger:${userId}`;
    const rateLimitStore = new Map<string, { count: number; resetAt: number }>();
    const now = Date.now();
    const windowMs = 60 * 60 * 1000; // 1 hour
    const maxRequests = 5;
    
    const record = rateLimitStore.get(rateLimitKey);
    if (record && now < record.resetAt) {
      if (record.count >= maxRequests) {
        const resetIn = Math.ceil((record.resetAt - now) / 1000 / 60);
        return new Response(
          JSON.stringify({ 
            error: `Rate limit exceeded. Maximum ${maxRequests} backup triggers per hour. Try again in ${resetIn} minutes.` 
          }),
          {
            status: 429,
            headers: {
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil((record.resetAt - now) / 1000)),
              ...getCorsHeaders(req),
            },
          }
        );
      }
      record.count++;
      rateLimitStore.set(rateLimitKey, record);
    } else {
      rateLimitStore.set(rateLimitKey, { count: 1, resetAt: now + windowMs });
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

  try {
    // Validate required environment variables
    if (!GITHUB_TOKEN) {
      console.error("GITHUB_TOKEN is not set");
      return new Response(
        JSON.stringify({
          error: "GitHub token not configured",
          message: "GITHUB_TOKEN environment variable is missing. Please configure it in Supabase Dashboard → Edge Functions → Secrets.",
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

    if (!GITHUB_OWNER || !GITHUB_REPO) {
      console.error("GITHUB_OWNER or GITHUB_REPO is not set");
      return new Response(
        JSON.stringify({
          error: "GitHub repository not configured",
          message: "GITHUB_OWNER and GITHUB_REPO environment variables are required. Please configure them in Supabase Dashboard → Edge Functions → Secrets.",
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

    // Generate a unique dispatch ID
    const dispatchId = crypto.randomUUID();

    // Trigger GitHub Actions workflow
    const workflowUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_ID}/dispatches`;

    console.log(`Triggering GitHub workflow: ${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_WORKFLOW_ID}`);

    const workflowResponse = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${GITHUB_TOKEN}`,
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        ref: "main", // or "master" depending on your default branch
        inputs: {
          dispatch_id: dispatchId,
          trigger_type: "manual",
        },
      }),
    });

    if (!workflowResponse.ok) {
      const errorText = await workflowResponse.text();
      let errorMessage = "Failed to trigger backup workflow";
      let errorDetails = errorText;

      // Parse GitHub API error for better messages
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.message) {
          errorMessage = errorJson.message;
        }
        if (errorJson.errors && Array.isArray(errorJson.errors)) {
          errorDetails = errorJson.errors.map((e: any) => e.message || e).join(", ");
        }
      } catch {
        // If parsing fails, use the raw error text
      }

      console.error("GitHub API error:", {
        status: workflowResponse.status,
        statusText: workflowResponse.statusText,
        error: errorText,
      });

      // Provide specific error messages based on status code
      if (workflowResponse.status === 401 || workflowResponse.status === 403) {
        errorMessage = "GitHub authentication failed. Please check GITHUB_TOKEN permissions.";
      } else if (workflowResponse.status === 404) {
        errorMessage = `Workflow not found. Please verify GITHUB_OWNER, GITHUB_REPO, and GITHUB_WORKFLOW_ID are correct.`;
      } else if (workflowResponse.status === 422) {
        errorMessage = "Workflow dispatch failed. The workflow file may not exist or may not be configured for manual triggers.";
      }

      return new Response(
        JSON.stringify({
          error: errorMessage,
          details: errorDetails,
          status_code: workflowResponse.status,
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

    // Create a backup_history entry with "in_progress" status
    const { error: historyError } = await supabase.from("backup_history").insert({
      dispatch_id: dispatchId,
      status: "in_progress",
      workflow_run_id: null, // Will be updated by the workflow
    });

    if (historyError) {
      console.error("Failed to create backup_history entry:", historyError);
      // Don't fail the request, just log it
    }

    // Return 202 Accepted with dispatch ID and status URL
    return new Response(
      JSON.stringify({
        dispatch_id: dispatchId,
        status_url: `/functions/v1/backup-status?dispatch_id=${dispatchId}`,
        message: "Backup workflow triggered successfully",
      }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      }
    );
  } catch (error) {
    console.error("Error triggering backup:", error);
    
    // Provide more detailed error information
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Check for common issues
    let userFriendlyMessage = "Internal server error";
    if (errorMessage.includes("fetch")) {
      userFriendlyMessage = "Failed to connect to GitHub API. Please check network connectivity and GitHub API status.";
    } else if (errorMessage.includes("JSON")) {
      userFriendlyMessage = "Failed to parse response from GitHub API.";
    }

    return new Response(
      JSON.stringify({
        error: userFriendlyMessage,
        message: errorMessage,
        details: process.env.DENO_ENV === "development" ? errorStack : undefined,
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

