// Supabase Edge Function: share-backup
// Shares backup files via Email or WhatsApp

// Deno types are provided at runtime
declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
};

// @ts-ignore
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
// @ts-ignore
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: getCorsHeaders(req) });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
    });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let body: any = {};
  let userId: string | null = null;

  try {
    body = await req.json();
    userId = body.user_id || null;

    if (!userId) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    // Verify user
    const { data: user, error: userError } = await supabase
      .from("system_users")
      .select("user_id, status")
      .eq("user_id", userId)
      .single();

    if (userError || !user || user.status !== "active") {
      return new Response(JSON.stringify({ error: "User not found or inactive" }), {
        status: 403,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const { backup_id, method, recipient } = body;

    if (!backup_id || !method || !recipient) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    // Get backup info
    const { data: backup, error: backupError } = await supabase
      .from("backup_history")
      .select("*")
      .eq("id", backup_id)
      .single();

    if (backupError || !backup || backup.status !== "success" || !backup.s3_key) {
      return new Response(JSON.stringify({ error: "Backup not found or not available" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    // Generate signed URL
    const signedUrlResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-signed-url`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ s3_key: backup.s3_key }),
    });

    if (!signedUrlResponse.ok) {
      return new Response(JSON.stringify({ error: "Failed to generate download URL" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }

    const { signed_url } = await signedUrlResponse.json();

    if (method === "email") {
      // Email sharing - would need email service integration (SendGrid, AWS SES, etc.)
      // For now, return success with instructions
      return new Response(
        JSON.stringify({
          success: true,
          message: "Email sharing configured. Integration with email service required.",
          note: "To enable email sharing, integrate with an email service provider (SendGrid, AWS SES, etc.)",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    } else if (method === "whatsapp") {
      // WhatsApp sharing - create WhatsApp share link
      const message = encodeURIComponent(
        `Backup file from ${new Date(backup.created_at).toLocaleDateString()}\nDownload: ${signed_url}`
      );
      const whatsappUrl = `https://wa.me/${recipient.replace(/[^0-9]/g, "")}?text=${message}`;

      return new Response(
        JSON.stringify({
          success: true,
          whatsapp_url: whatsappUrl,
          message: "WhatsApp share link generated",
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    } else {
      return new Response(JSON.stringify({ error: "Invalid sharing method" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      });
    }
  } catch (error) {
    console.error("Error sharing backup:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
      }
    );
  }
});

