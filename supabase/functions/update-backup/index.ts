// Supabase Edge Function: update-backup
// Updates backup_history table with s3_key, status, and finished_at
// Called by GitHub Actions workflow after backup is uploaded to S3
//
// Requirements:
// 1. Accept backup_id, s3_key, size_bytes, workflow_run_id
// 2. Validate backup_id exists and s3_key is never empty
// 3. Only update if status is "in_progress"
// 4. Set status to "completed", s3_key, size_bytes, finished_at, clear error_text
// 5. If backup not found or invalid, mark as "failed" with error message
// 6. Ensure idempotency - safe to re-run

// Deno types are provided at runtime
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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

  try {
    // Verify API key (for GitHub Actions workflow authentication)
    const authHeader = req.headers.get("authorization");
    const apiKey = authHeader?.replace("Bearer ", "") || "";
    
    if (apiKey !== BACKUP_API_KEY && BACKUP_API_KEY) {
      return new Response(JSON.stringify({ error: "Invalid API key" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }

    const body = await req.json();
    const { backup_id, dispatch_id, s3_key, size_bytes, workflow_run_id } = body;

    // ✅ REQUIREMENT 1: Accept backup_id (or dispatch_id as fallback)
    if (!backup_id && !dispatch_id) {
      return new Response(JSON.stringify({ 
        error: "Missing backup_id or dispatch_id",
        details: "Either backup_id or dispatch_id must be provided"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }

    // ✅ REQUIREMENT 2: Validate s3_key is never empty
    if (!s3_key || s3_key.trim() === "") {
      return new Response(JSON.stringify({ 
        error: "s3_key is required and cannot be empty",
        details: "The S3 key where the backup file is stored must be provided"
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }

    // Validate s3_key format (should start with "backups/")
    if (!s3_key.startsWith("backups/")) {
      console.warn(`Warning: s3_key does not start with "backups/": ${s3_key}`);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ✅ REQUIREMENT 2: Validate backup_id exists in backup_history table
    let query = supabase.from("backup_history").select("*");
    
    if (backup_id) {
      query = query.eq("id", backup_id);
    } else {
      query = query.eq("dispatch_id", dispatch_id);
    }

    const { data: backupEntry, error: findError } = await query.single();

    // ✅ REQUIREMENT 5: If backup not found, mark as failed
    if (findError || !backupEntry) {
      console.error("Backup entry not found:", { backup_id, dispatch_id, error: findError });
      
      // Try to find by dispatch_id if backup_id was provided but not found
      if (backup_id && dispatch_id) {
        const { data: backupByDispatch, error: dispatchError } = await supabase
          .from("backup_history")
          .select("*")
          .eq("dispatch_id", dispatch_id)
          .single();

        if (!dispatchError && backupByDispatch) {
          // Found by dispatch_id, use it
          const { data: updatedBackup, error: updateError } = await supabase
            .from("backup_history")
            .update({
              status: "failed",
              error_text: `Backup ID mismatch: provided backup_id (${backup_id}) not found, but found by dispatch_id. Original error: ${findError?.message || "Not found"}`,
              finished_at: new Date().toISOString(),
            })
            .eq("id", backupByDispatch.id)
            .select()
            .single();

          if (updateError) {
            console.error("Failed to mark backup as failed:", updateError);
          }

          return new Response(JSON.stringify({ 
            success: false,
            error: "Backup ID mismatch",
            message: `Backup with backup_id ${backup_id} not found, but found by dispatch_id. Marked as failed.`,
            backup: updatedBackup
          }), {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeaders(req),
            },
          });
        }
      }

      // Backup truly not found - cannot mark as failed without an ID
      return new Response(JSON.stringify({ 
        success: false,
        error: "Backup entry not found",
        details: findError?.message || "No backup found with the provided backup_id or dispatch_id",
        message: "Cannot update backup - entry does not exist in backup_history table"
      }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }

    // ✅ REQUIREMENT 6: Idempotency - if already completed, return success without updating
    if (backupEntry.status === "success") {
      // Already completed - check if s3_key matches
      if (backupEntry.s3_key === s3_key) {
        console.log("Backup already completed with matching s3_key - idempotent call, returning success");
        return new Response(
          JSON.stringify({
            success: true,
            message: "Backup already completed (idempotent call)",
            backup: backupEntry,
            idempotent: true,
          }),
          {
            status: 200,
            headers: {
              "Content-Type": "application/json",
              ...getCorsHeaders(req),
            },
          }
        );
      } else {
        // Completed but different s3_key - this is suspicious, log warning but don't update
        console.warn(`Backup already completed but s3_key differs. Existing: ${backupEntry.s3_key}, New: ${s3_key}`);
        return new Response(
          JSON.stringify({
            success: true,
            message: "Backup already completed with different s3_key - not updating (idempotent call)",
            backup: backupEntry,
            idempotent: true,
            warning: "s3_key mismatch - backup already completed",
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

    // ✅ REQUIREMENT 3: Only update if status is "in_progress"
    if (backupEntry.status !== "in_progress") {
      const errorMessage = `Cannot update backup - current status is "${backupEntry.status}", expected "in_progress". Only in_progress backups can be updated.`;
      console.error(errorMessage, { backup_id: backupEntry.id, current_status: backupEntry.status });

      // Mark as failed with meaningful error
      const { data: failedBackup, error: failError } = await supabase
        .from("backup_history")
        .update({
          status: "failed",
          error_text: errorMessage,
          finished_at: new Date().toISOString(),
        })
        .eq("id", backupEntry.id)
        .select()
        .single();

      if (failError) {
        console.error("Failed to mark backup as failed:", failError);
      }

      return new Response(JSON.stringify({ 
        success: false,
        error: "Invalid backup status",
        message: errorMessage,
        backup: failedBackup || backupEntry,
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }

    // ✅ REQUIREMENT 4: Update the row with all required fields
    const updateData: any = {
      s3_key: s3_key, // Always set (validated above)
      status: "success", // Set to "success" (matches database constraint)
      finished_at: new Date().toISOString(),
      error_text: null, // Clear any previous errors
    };

    // Set size_bytes if provided
    if (size_bytes !== undefined && size_bytes !== null) {
      const sizeInt = typeof size_bytes === "string" ? parseInt(size_bytes, 10) : size_bytes;
      if (!isNaN(sizeInt) && sizeInt >= 0) {
        updateData.size_bytes = sizeInt;
      }
    }

    // Update workflow_run_id if provided
    if (workflow_run_id) {
      updateData.workflow_run_id = workflow_run_id;
    }

    // Update backup_history
    const { data: updatedBackup, error: updateError } = await supabase
      .from("backup_history")
      .update(updateData)
      .eq("id", backupEntry.id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to update backup_history:", updateError);
      
      // ✅ REQUIREMENT 5: Mark as failed if update fails
      const { error: failError } = await supabase
        .from("backup_history")
        .update({
          status: "failed",
          error_text: `Failed to update backup: ${updateError.message}`,
          finished_at: new Date().toISOString(),
        })
        .eq("id", backupEntry.id);

      if (failError) {
        console.error("Failed to mark backup as failed after update error:", failError);
      }

      return new Response(JSON.stringify({ 
        success: false,
        error: "Failed to update backup history",
        details: updateError.message,
        message: "Database update failed - backup marked as failed"
      }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }

    console.log("Backup updated successfully:", {
      backup_id: updatedBackup.id,
      s3_key: updatedBackup.s3_key,
      status: updatedBackup.status,
      size_bytes: updatedBackup.size_bytes,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Backup updated successfully",
        backup: updatedBackup,
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
    console.error("Error updating backup:", error);
    return new Response(
      JSON.stringify({
        success: false,
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
