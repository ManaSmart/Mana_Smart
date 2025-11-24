// Supabase Edge Function: settings-toggle
// Manages backup settings (backup_enabled, last_backup_at)

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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Verify user authentication for POST requests
  let userId: string | null = null;
  let body: any = {};

  if (req.method === "POST") {
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

      // Check for admin role (settings modification requires admin)
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
          JSON.stringify({ error: "Admin access required for settings modification" }),
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
  }

  try {
    if (req.method === "GET") {
      // Get backup settings
      const { data: backupEnabled, error: error1 } = await supabase
        .from("system_settings_kv")
        .select("value")
        .eq("key", "backup_enabled")
        .single();

      const { data: lastBackupAt, error: error2 } = await supabase
        .from("system_settings_kv")
        .select("value")
        .eq("key", "last_backup_at")
        .single();

      if (error1 && error1.code !== "PGRST116") {
        throw error1;
      }
      if (error2 && error2.code !== "PGRST116") {
        throw error2;
      }

      return new Response(
        JSON.stringify({
          backup_enabled: backupEnabled?.value?.enabled ?? false,
          last_backup_at: lastBackupAt?.value || null,
        }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
            } else if (req.method === "POST") {
              // Update backup settings (body already parsed in auth section)
              const { backup_enabled, last_backup_at } = body;

      if (typeof backup_enabled !== "undefined") {
        const { error } = await supabase
          .from("system_settings_kv")
          .upsert(
            {
              key: "backup_enabled",
              value: { enabled: backup_enabled },
            },
            {
              onConflict: "key",
            }
          );

        if (error) {
          console.error("Error upserting backup_enabled:", error);
          throw error;
        }
      }

      if (typeof last_backup_at !== "undefined") {
        const { error } = await supabase
          .from("system_settings_kv")
          .upsert(
            {
              key: "last_backup_at",
              value: last_backup_at ? last_backup_at : null,
            },
            {
              onConflict: "key",
            }
          );

        if (error) {
          console.error("Error upserting last_backup_at:", error);
          throw error;
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Settings updated" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    } else {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }
  } catch (error) {
    console.error("Error managing settings:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorDetails = error instanceof Error ? error.stack : String(error);
    console.error("Error details:", errorDetails);
    
    // If it's a Supabase error, include more details
    const supabaseError = error as any;
    if (supabaseError?.code || supabaseError?.message) {
      console.error("Supabase error code:", supabaseError.code);
      console.error("Supabase error message:", supabaseError.message);
      console.error("Supabase error details:", supabaseError.details);
      console.error("Supabase error hint:", supabaseError.hint);
    }
    
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
        details: process.env.DENO_ENV === "development" ? errorDetails : undefined,
        code: supabaseError?.code,
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

