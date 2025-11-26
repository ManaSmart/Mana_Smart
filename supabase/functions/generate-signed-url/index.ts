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
// Using crypto for HMAC-SHA256 signing (built into Deno)
// We'll generate presigned URLs manually to avoid AWS SDK file system access issues

const AWS_ACCESS_KEY_ID = Deno.env.get("AWS_ACCESS_KEY_ID") ?? "";
const AWS_SECRET_ACCESS_KEY = Deno.env.get("AWS_SECRET_ACCESS_KEY") ?? "";
const AWS_S3_REGION = Deno.env.get("AWS_S3_REGION") ?? "us-east-1";
const AWS_S3_BUCKET = Deno.env.get("AWS_S3_BUCKET") ?? "";

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:5174",
  "https://console-mana.com",
  "https://www.console-mana.com",
  "https://mana-smart-scent.vercel.app",
];

function getCorsHeaders(req: Request) {
  const origin = req.headers.get("origin") || "";
  const isAllowed = allowedOrigins.includes(origin);
  
  // Always allow the requesting origin if it's in the list, otherwise use the first allowed origin
  const allowOrigin = isAllowed ? origin : (allowedOrigins[0] || "*");
  
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-requested-with",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400", // 24 hours
  };
}

// Generate presigned URL using AWS Signature Version 4 (without AWS SDK)
// This avoids file system access issues with the AWS SDK in Deno
async function generatePresignedUrl(
  bucket: string,
  key: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string,
  expiresIn: number = 900
): Promise<string> {
  const endpoint = `https://${bucket}.s3.${region}.amazonaws.com`;
  const now = new Date();
  const dateStamp = now.toISOString().slice(0, 10).replace(/-/g, '');
  const amzDate = dateStamp + 'T' + now.toISOString().slice(11, 19).replace(/[:-]/g, '') + 'Z';
  
  // Create the canonical request
  // For S3, the canonical URI should be the key path (not URL-encoded in canonical request)
  // But in the final URL, it should be URL-encoded
  const canonicalUri = `/${key}`;
  
  // Build query string parameters (must be sorted alphabetically)
  // In canonical request, values are URL-encoded
  const credential = `${accessKeyId}/${dateStamp}/${region}/s3/aws4_request`;
  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=${expiresIn}`,
    `X-Amz-SignedHeaders=host`
  ];
  const canonicalQueryString = queryParams.join('&');
  
  const canonicalHeaders = `host:${bucket}.s3.${region}.amazonaws.com\n`;
  const signedHeaders = 'host';
  // For presigned URLs, use UNSIGNED-PAYLOAD
  const payloadHash = 'UNSIGNED-PAYLOAD';
  
  const canonicalRequest = `GET\n${canonicalUri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${payloadHash}`;
  
  console.log('Canonical Request:', canonicalRequest);
  
  // Create the string to sign
  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;
  const hashedCanonicalRequest = await sha256(canonicalRequest);
  const stringToSign = `${algorithm}\n${amzDate}\n${credentialScope}\n${hashedCanonicalRequest}`;
  
  console.log('String to Sign:', stringToSign);
  
  // Calculate the signature (key derivation must use raw bytes)
  const kDate = await hmacSha256Raw(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = await hmacSha256Raw(kDate, region);
  const kService = await hmacSha256Raw(kRegion, 's3');
  const kSigning = await hmacSha256Raw(kService, 'aws4_request');
  const signature = await hmacSha256Hex(kSigning, stringToSign);
  
  console.log('Signature:', signature);
  
  // Build the presigned URL
  // In the final URL, the key should be URL-encoded
  const encodedKey = key.split('/').map(segment => encodeURIComponent(segment)).join('/');
  const presignedUrl = `${endpoint}/${encodedKey}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
  
  return presignedUrl;
}

// Helper function for HMAC-SHA256 - returns raw bytes for key derivation
async function hmacSha256Raw(key: string | Uint8Array, message: string): Promise<Uint8Array> {
  const keyData = typeof key === 'string' ? new TextEncoder().encode(key) : new Uint8Array(key);
  const messageData = new TextEncoder().encode(message);
  
  // Create a new ArrayBuffer to ensure type compatibility
  const keyBuffer = keyData.buffer.slice(0);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return new Uint8Array(signature);
}

// Helper function for HMAC-SHA256 - returns hex string for final signature
async function hmacSha256Hex(key: Uint8Array, message: string): Promise<string> {
  const messageData = new TextEncoder().encode(message);
  
  // Create a new ArrayBuffer to ensure type compatibility
  const keyBuffer = key.buffer.slice(0);
  
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBuffer as ArrayBuffer,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// Helper function for SHA-256
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

serve(async (req: Request) => {
  // Handle CORS preflight - must return 200 with proper headers
  // This MUST be the first thing checked and MUST return 200
  // Handle this BEFORE any other code that might fail
  if (req.method === "OPTIONS") {
    const corsHeaders = getCorsHeaders(req);
    return new Response(null, { 
      status: 200,
      statusText: "OK",
      headers: corsHeaders,
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

    // Validate AWS credentials are set
    if (!AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY || !AWS_S3_BUCKET) {
      console.error("AWS configuration missing:", {
        hasAccessKey: !!AWS_ACCESS_KEY_ID,
        hasSecretKey: !!AWS_SECRET_ACCESS_KEY,
        hasBucket: !!AWS_S3_BUCKET,
        region: AWS_S3_REGION,
      });
      return new Response(
        JSON.stringify({ 
          error: "AWS S3 configuration is missing",
          details: "Please ensure AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET are set as secrets"
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

    // Generate pre-signed URL (valid for 15 minutes) using manual signing
    // This avoids AWS SDK file system access issues in Deno
    console.log("Generating signed URL for:", { bucket: AWS_S3_BUCKET, key: s3_key, region: AWS_S3_REGION });
    
    let signedUrl: string;
    try {
      signedUrl = await generatePresignedUrl(
        AWS_S3_BUCKET,
        s3_key,
        AWS_S3_REGION,
        AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY,
        900 // 15 minutes
      );
      
      console.log("Signed URL generated successfully");
    } catch (urlError) {
      const errorMsg = urlError instanceof Error ? urlError.message : String(urlError);
      console.error("Error generating presigned URL:", errorMsg);
      throw new Error(`Failed to generate signed URL: ${errorMsg}`);
    }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error("Full error details:", {
      message: errorMessage,
      stack: errorStack,
      name: error instanceof Error ? error.name : undefined,
    });
    
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: errorMessage,
        // Include stack in development (you can remove this in production)
        ...(errorStack ? { stack: errorStack } : {}),
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

