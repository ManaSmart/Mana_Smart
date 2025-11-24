// Supabase Edge Function: backup-status
// Polls GitHub Actions workflow status and returns signed S3 URL when complete

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
const BACKUP_API_KEY = Deno.env.get("BACKUP_API_KEY") ?? "";

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

  // Verify user authentication
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let userId: string | null = null;
  let dispatchId: string | null = null;
  let body: any = {};
  
  try {
    // Support both GET (query param) and POST (body) for backward compatibility
    if (req.method === "GET") {
      const url = new URL(req.url);
      dispatchId = url.searchParams.get("dispatch_id");
      userId = url.searchParams.get("user_id");
    } else if (req.method === "POST") {
      body = await req.json();
      dispatchId = body.dispatch_id || null;
      userId = body.user_id || null;
    }

    // Require authentication for POST requests
    if (req.method === "POST" && !userId) {
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

    // Verify user if provided
    if (userId) {
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
    }
  } catch (parseError) {
    return new Response(
      JSON.stringify({ error: "Invalid request" }),
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
    if (!dispatchId) {
      return new Response(JSON.stringify({ error: "Missing dispatch_id parameter" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get backup_history entry
    const { data: backupEntry, error: backupError } = await supabase
      .from("backup_history")
      .select("*")
      .eq("dispatch_id", dispatchId)
      .single();

    if (backupError || !backupEntry) {
      return new Response(
        JSON.stringify({
          status: "pending",
          error: "Backup entry not found",
        }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    }

    // If backup is complete (success or failed), return status
    if (backupEntry.status === "success" || backupEntry.status === "failed") {
      // If successful and has S3 key, generate signed URL
      if (backupEntry.status === "success" && backupEntry.s3_key) {
        // Call generate-signed-url function internally
        const signedUrlResponse = await fetch(
          `${SUPABASE_URL}/functions/v1/generate-signed-url`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${BACKUP_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ s3_key: backupEntry.s3_key }),
          }
        );

        if (signedUrlResponse.ok) {
          const { signed_url } = await signedUrlResponse.json();
          return new Response(
            JSON.stringify({
              status: "success",
              signed_url,
              backup_id: backupEntry.id,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                ...getCorsHeaders(req),
              },
            }
          );
        }
      }

      // Return status without signed URL (failed or no S3 key)
      return new Response(
        JSON.stringify({
          status: backupEntry.status,
          error: backupEntry.error_text || undefined,
          backup_id: backupEntry.id,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    }

    // If still in progress, check GitHub Actions status
    if (backupEntry.workflow_run_id) {
      const workflowUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${backupEntry.workflow_run_id}`;

      try {
        const workflowResponse = await fetch(workflowUrl, {
          headers: {
            "Authorization": `token ${GITHUB_TOKEN}`,
            "Accept": "application/vnd.github.v3+json",
          },
        });

        if (workflowResponse.ok) {
          const workflowData = await workflowResponse.json();
          const workflowStatus = workflowData.status; // queued, in_progress, completed
          // Note: workflowConclusion (success, failure, cancelled) is checked via backup_history status

          if (workflowStatus === "completed") {
            // Workflow finished - re-check backup_history as it should be updated now
            const { data: updatedEntry, error: refreshError } = await supabase
              .from("backup_history")
              .select("*")
              .eq("dispatch_id", dispatchId)
              .single();

            if (!refreshError && updatedEntry) {
              // If backup_history was updated, return the actual status
              if (updatedEntry.status === "success" || updatedEntry.status === "failed") {
                // If successful and has S3 key, generate signed URL
                if (updatedEntry.status === "success" && updatedEntry.s3_key) {
                  const signedUrlResponse = await fetch(
                    `${SUPABASE_URL}/functions/v1/generate-signed-url`,
                    {
                      method: "POST",
                      headers: {
                        "Authorization": `Bearer ${BACKUP_API_KEY}`,
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({ s3_key: updatedEntry.s3_key }),
                    }
                  );

                  if (signedUrlResponse.ok) {
                    const { signed_url } = await signedUrlResponse.json();
                    return new Response(
                      JSON.stringify({
                        status: "success",
                        signed_url,
                        backup_id: updatedEntry.id,
                      }),
                      {
                        status: 200,
                        headers: {
                          "Content-Type": "application/json",
                          ...getCorsHeaders(req),
                        },
                      }
                    );
                  }
                }

                // Return status (success or failed)
                return new Response(
                  JSON.stringify({
                    status: updatedEntry.status,
                    error: updatedEntry.error_text || undefined,
                    backup_id: updatedEntry.id,
                  }),
                  {
                    status: 200,
                    headers: {
                      "Content-Type": "application/json",
                      ...getCorsHeaders(req),
                    },
                  }
                );
              }
            }

            // Workflow completed but backup_history not updated yet - wait a bit
            return new Response(
              JSON.stringify({
                status: "in_progress",
                message: "Workflow completed, waiting for database update...",
                backup_id: backupEntry.id,
              }),
              {
                status: 200,
                headers: {
                  "Content-Type": "application/json",
                  ...getCorsHeaders(req),
                },
              }
            );
          }

          return new Response(
            JSON.stringify({
              status: workflowStatus === "in_progress" || workflowStatus === "queued" ? "in_progress" : "pending",
              message: `Workflow status: ${workflowStatus}`,
              backup_id: backupEntry.id,
            }),
            {
              status: 200,
              headers: {
                "Content-Type": "application/json",
                ...getCorsHeaders(req),
              },
            }
          );
        }
      } catch (error) {
        console.error("Error checking GitHub workflow:", error);
        // Continue to return backup_history status
      }
    }

    // Return current status from backup_history
    return new Response(
      JSON.stringify({
        status: backupEntry.status === "in_progress" ? "in_progress" : "pending",
        message: "Backup in progress",
        backup_id: backupEntry.id,
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      }
    );
  } catch (error) {
    console.error("Error getting backup status:", error);
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

