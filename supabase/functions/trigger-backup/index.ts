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
const BACKUP_API_KEY = Deno.env.get("BACKUP_API_KEY") ?? "";

serve(async (req: Request) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  // Verify authentication
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid authorization header" }),
      {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  if (token !== BACKUP_API_KEY) {
    return new Response(JSON.stringify({ error: "Invalid API key" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    // Generate a unique dispatch ID
    const dispatchId = crypto.randomUUID();

    // Trigger GitHub Actions workflow
    const workflowUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/workflows/${GITHUB_WORKFLOW_ID}/dispatches`;

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
      console.error("GitHub API error:", errorText);
      return new Response(
        JSON.stringify({
          error: "Failed to trigger backup workflow",
          details: errorText,
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    // Create a backup_history entry with "in_progress" status
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
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
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Error triggering backup:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

