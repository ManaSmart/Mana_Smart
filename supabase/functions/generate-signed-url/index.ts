// Supabase Edge Function: generate-signed-url
// Generates a pre-signed S3 URL for downloading backups

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { S3Client, GetObjectCommand } from "https://esm.sh/@aws-sdk/client-s3@3";
import { getSignedUrl } from "https://esm.sh/@aws-sdk/s3-request-presigner@3";

const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const AWS_S3_REGION = Deno.env.get("AWS_S3_REGION") ?? "us-east-1";
const AWS_S3_BUCKET = Deno.env.get("AWS_S3_BUCKET") ?? "";
const BACKUP_API_KEY = Deno.env.get("BACKUP_API_KEY") ?? "";

const s3Client = new S3Client({
  region: AWS_S3_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

serve(async (req) => {
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
    const body = await req.json();
    const { s3_key } = body;

    if (!s3_key) {
      return new Response(JSON.stringify({ error: "Missing s3_key parameter" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
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
          "Access-Control-Allow-Origin": "*",
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
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

