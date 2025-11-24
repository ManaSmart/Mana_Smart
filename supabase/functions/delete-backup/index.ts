// Supabase Edge Function: delete-backup
// Deletes a backup history record

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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        ...getCorsHeaders(req),
      },
    });
  }

  // Verify user authentication and authorization
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

    // Check for admin role (delete is critical operation)
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
        JSON.stringify({ error: "Admin access required for delete operations" }),
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

  try {
    const { backup_id } = body;

    if (!backup_id) {
      return new Response(
        JSON.stringify({ error: "Missing backup_id" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    }

    // Validate backup_id format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(backup_id)) {
      return new Response(
        JSON.stringify({ error: "Invalid backup_id format" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...getCorsHeaders(req),
          },
        }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { error } = await supabase
      .from("backup_history")
      .delete()
      .eq("id", backup_id);

    if (error) {
      console.error("Error deleting backup:", error);
      throw error;
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Backup deleted successfully",
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
    console.error("Error deleting backup:", error);
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

