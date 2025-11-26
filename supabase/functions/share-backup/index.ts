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
    // Pass user_id to generate-signed-url function for authentication
    const signedUrlResponse = await fetch(`${SUPABASE_URL}/functions/v1/generate-signed-url`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        s3_key: backup.s3_key,
        user_id: userId 
      }),
    });

    if (!signedUrlResponse.ok) {
      const errorText = await signedUrlResponse.text();
      console.error("Failed to generate signed URL:", errorText);
      return new Response(
        JSON.stringify({ 
          error: "Failed to generate download URL",
          details: errorText 
        }), 
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    const signedUrlData = await signedUrlResponse.json();
    const { signed_url } = signedUrlData;

    if (!signed_url) {
      console.error("No signed_url in response:", signedUrlData);
      return new Response(
        JSON.stringify({ 
          error: "Invalid response from generate-signed-url",
          details: signedUrlData 
        }), 
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
        }
      );
    }

    if (method === "email") {
      // Email sharing using Supabase Edge Function or external service
      const EMAIL_SERVICE_URL = Deno.env.get("EMAIL_SERVICE_URL") ?? "";
      const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";
      const AWS_SES_REGION = Deno.env.get("AWS_SES_REGION") ?? "";
      const AWS_SES_ACCESS_KEY = Deno.env.get("AWS_SES_ACCESS_KEY") ?? "";
      const AWS_SES_SECRET_KEY = Deno.env.get("AWS_SES_SECRET_KEY") ?? "";
      const FROM_EMAIL = Deno.env.get("FROM_EMAIL") ?? "noreply@console-mana.com";

      let emailSent = false;
      let emailError: string | null = null;

      // Try SendGrid if configured
      if (SENDGRID_API_KEY) {
        try {
          const sendGridResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${SENDGRID_API_KEY}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              personalizations: [
                {
                  to: [{ email: recipient }],
                },
              ],
              from: { email: FROM_EMAIL },
              subject: "Your Backup is Ready",
              content: [
                {
                  type: "text/html",
                  value: `
                    <html>
                      <body>
                        <h2>Your Backup is Ready</h2>
                        <p>Your backup file from ${new Date(backup.created_at).toLocaleDateString()} is ready for download.</p>
                        <p><a href="${signed_url}" style="background-color: #4CAF50; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Download Backup</a></p>
                        <p><small>This link will expire in 15 minutes.</small></p>
                      </body>
                    </html>
                  `,
                },
              ],
            }),
          });

          if (sendGridResponse.ok) {
            emailSent = true;
          } else {
            const errorText = await sendGridResponse.text();
            emailError = `SendGrid error: ${sendGridResponse.status} - ${errorText}`;
          }
        } catch (error) {
          emailError = error instanceof Error ? error.message : "Unknown error";
        }
      }
      // Try AWS SES if configured
      else if (AWS_SES_ACCESS_KEY && AWS_SES_SECRET_KEY) {
        try {
          // AWS SES requires AWS SDK - for now, log that it needs implementation
          console.log("AWS SES email sending requires AWS SDK implementation");
          emailError = "AWS SES integration requires additional setup";
        } catch (error) {
          emailError = error instanceof Error ? error.message : "Unknown error";
        }
      }
      // Try custom email service URL
      else if (EMAIL_SERVICE_URL) {
        try {
          const emailServiceResponse = await fetch(EMAIL_SERVICE_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: recipient,
              subject: "Your Backup is Ready",
              html: `
                <h2>Your Backup is Ready</h2>
                <p>Your backup file from ${new Date(backup.created_at).toLocaleDateString()} is ready for download.</p>
                <p><a href="${signed_url}">Download Backup</a></p>
                <p><small>This link will expire in 15 minutes.</small></p>
              `,
            }),
          });

          if (emailServiceResponse.ok) {
            emailSent = true;
          } else {
            emailError = `Email service error: ${emailServiceResponse.status}`;
          }
        } catch (error) {
          emailError = error instanceof Error ? error.message : "Unknown error";
        }
      }

      if (emailSent) {
        return new Response(
          JSON.stringify({
            success: true,
            message: "Email sent successfully",
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
          }
        );
      } else {
        return new Response(
          JSON.stringify({
            success: false,
            error: emailError || "Email service not configured. Please configure SENDGRID_API_KEY, AWS SES, or EMAIL_SERVICE_URL.",
            message: "To enable email sharing, configure one of: SENDGRID_API_KEY, AWS SES credentials, or EMAIL_SERVICE_URL",
          }),
          {
            status: 500,
            headers: { "Content-Type": "application/json", ...getCorsHeaders(req) },
          }
        );
      }
    } else if (method === "whatsapp") {
      // WhatsApp sharing using Twilio if configured, otherwise use WhatsApp web link
      const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
      const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
      const TWILIO_WHATSAPP_FROM = Deno.env.get("TWILIO_WHATSAPP_FROM") ?? "whatsapp:+14155238886";

      let whatsappSent = false;
      let whatsappError: string | null = null;
      let whatsappUrl = "";

      // Try Twilio WhatsApp if configured
      if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN) {
        try {
          const phoneNumber = recipient.replace(/[^0-9+]/g, "");
          const formattedPhone = phoneNumber.startsWith("+") ? phoneNumber : `+${phoneNumber}`;
          const toNumber = `whatsapp:${formattedPhone}`;

          const message = `Your backup file from ${new Date(backup.created_at).toLocaleDateString()} is ready.\nDownload: ${signed_url}\n\nThis link expires in 15 minutes.`;

          const twilioResponse = await fetch(
            `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
            {
              method: "POST",
              headers: {
                "Authorization": `Basic ${btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`)}`,
                "Content-Type": "application/x-www-form-urlencoded",
              },
              body: new URLSearchParams({
                From: TWILIO_WHATSAPP_FROM,
                To: toNumber,
                Body: message,
              }),
            }
          );

          if (twilioResponse.ok) {
            whatsappSent = true;
            const twilioData = await twilioResponse.json();
            console.log("WhatsApp message sent via Twilio:", twilioData);
          } else {
            const errorText = await twilioResponse.text();
            whatsappError = `Twilio error: ${twilioResponse.status} - ${errorText}`;
          }
        } catch (error) {
          whatsappError = error instanceof Error ? error.message : "Unknown error";
        }
      }

      // Fallback to WhatsApp web link
      if (!whatsappSent) {
        const message = encodeURIComponent(
          `Your backup file from ${new Date(backup.created_at).toLocaleDateString()} is ready.\nDownload: ${signed_url}\n\nThis link expires in 15 minutes.`
        );
        const phoneNumber = recipient.replace(/[^0-9]/g, "");
        whatsappUrl = `https://wa.me/${phoneNumber}?text=${message}`;
      }

      return new Response(
        JSON.stringify({
          success: whatsappSent || !!whatsappUrl,
          whatsapp_url: whatsappUrl,
          message: whatsappSent 
            ? "WhatsApp message sent successfully" 
            : whatsappError 
            ? `WhatsApp sending failed: ${whatsappError}. Share link generated instead.`
            : "WhatsApp share link generated",
          note: whatsappSent 
            ? undefined 
            : "To enable direct WhatsApp sending, configure TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN",
        }),
        {
          status: whatsappSent || whatsappUrl ? 200 : 500,
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

