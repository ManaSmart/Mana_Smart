// Supabase Edge Function: generate-signed-url
// Generates a pre-signed S3 URL for downloading backups

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
// @ts-ignore - Deno handles URL-based imports at runtime
import { S3Client, GetObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3";
// @ts-ignore - Deno handles URL-based imports at runtime
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3";

const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const AWS_S3_REGION = Deno.env.get("AWS_S3_REGION") ?? "us-east-1";
const AWS_S3_BUCKET = Deno.env.get("AWS_S3_BUCKET") ?? "";

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

const s3Client = new S3Client({
  region: AWS_S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

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
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  let body: any = {};
  let userId: string | null = null;
  
  try {
    body = await req.json();
    userId = body.user_id || null;
    const { s3_key } = body;
    
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

    if (!s3_key) {
      return new Response(JSON.stringify({ error: "Missing s3_key parameter" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          ...getCorsHeaders(req),
        },
      });
    }

    // Generate pre-signed URL (valid for 15 minutes)
    const command = new GetObjectCommand({
      Bucket: AWS_S3_BUCKET,
      Key: s3_key,
    });

    const signedUrl = await getSignedUrl(s3Client, command, {
      expiresIn: 900, // 15 minutes
    });

    return new Response(
      JSON.stringify({
        signed_url: signedUrl,
        expires_in: 900,
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
    console.error("Error generating signed URL:", error);
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

