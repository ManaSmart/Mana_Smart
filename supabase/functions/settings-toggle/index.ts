// Supabase Edge Function: settings-toggle
// Manages backup settings (backup_enabled, last_backup_at)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BACKUP_API_KEY = Deno.env.get("BACKUP_API_KEY") ?? "";

serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } else if (req.method === "POST") {
      // Update backup settings
      const body = await req.json();
      const { backup_enabled, last_backup_at } = body;

      if (typeof backup_enabled !== "undefined") {
        const { error } = await supabase
          .from("system_settings_kv")
          .upsert({
            key: "backup_enabled",
            value: { enabled: backup_enabled },
          });

        if (error) {
          throw error;
        }
      }

      if (typeof last_backup_at !== "undefined") {
        const { error } = await supabase
          .from("system_settings_kv")
          .upsert({
            key: "last_backup_at",
            value: last_backup_at ? last_backup_at : null,
          });

        if (error) {
          throw error;
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: "Settings updated" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    } else {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }
  } catch (error) {
    console.error("Error managing settings:", error);
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

