// Supabase Edge Function: restore-backup
// Restores a backup file by merging data with existing data (no overwrites)

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
import { ZipReader, BlobReader, BlobWriter } from "https://deno.land/x/zipjs@v2.7.29/index.js";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DATABASE_URL = Deno.env.get("DATABASE_URL") ?? "";
const BACKUP_API_KEY = Deno.env.get("BACKUP_API_KEY") ?? "";

// Helper to convert INSERT statements to use ON CONFLICT DO NOTHING
function convertInsertsToMerge(sql: string): string {
  // Pattern to match INSERT INTO statements
  // This is a simplified approach - for production, consider using a proper SQL parser
  const lines = sql.split('\n');
  const converted: string[] = [];
  let inInsert = false;
  let insertBuffer: string[] = [];
  let tableName = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Detect INSERT INTO statement
    if (line.match(/^INSERT INTO/i)) {
      inInsert = true;
      insertBuffer = [line];
      // Extract table name
      const match = line.match(/INSERT INTO\s+([^\s(]+)/i);
      if (match) {
        tableName = match[1].replace(/"/g, '');
      }
      continue;
    }

    if (inInsert) {
      insertBuffer.push(line);
      
      // Detect end of INSERT (semicolon or new INSERT)
      if (line.endsWith(';') || line.match(/^INSERT INTO/i)) {
        const insertStatement = insertBuffer.join('\n');
        
        // Check if it already has ON CONFLICT
        if (!insertStatement.match(/ON CONFLICT/i)) {
          // Add ON CONFLICT DO NOTHING before semicolon
          const modified = insertStatement.replace(
            /;\s*$/,
            ' ON CONFLICT DO NOTHING;'
          );
          converted.push(modified);
        } else {
          converted.push(insertStatement);
        }
        
        insertBuffer = [];
        inInsert = false;
        
        // If this line starts a new INSERT, process it
        if (line.match(/^INSERT INTO/i)) {
          i--; // Reprocess this line
        }
        continue;
      }
    } else {
      converted.push(lines[i]);
    }
  }

  // Handle any remaining buffer
  if (insertBuffer.length > 0) {
    const insertStatement = insertBuffer.join('\n');
    if (!insertStatement.match(/ON CONFLICT/i)) {
      const modified = insertStatement.replace(
        /;\s*$/,
        ' ON CONFLICT DO NOTHING;'
      );
      converted.push(modified);
    } else {
      converted.push(insertStatement);
    }
  }

  return converted.join('\n');
}

serve(async (req: Request) => {
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
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }

  const token = authHeader.replace("Bearer ", "");
  if (token !== BACKUP_API_KEY) {
    return new Response(JSON.stringify({ error: "Invalid API key" }), {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    // Get the backup file from request
    const formData = await req.formData();
    const backupFile = formData.get("backup_file") as File;

    if (!backupFile) {
      return new Response(
        JSON.stringify({ error: "Missing backup_file in form data" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    console.log(`[RESTORE] Starting restore for file: ${backupFile.name}, size: ${backupFile.size}`);

    // Read the file as ArrayBuffer
    const fileBuffer = await backupFile.arrayBuffer();
    const fileBytes = new Uint8Array(fileBuffer);

    // Extract ZIP file
    const zipReader = new ZipReader(new BlobReader(new Blob([fileBytes])));
    const entries = await zipReader.getEntries();

    console.log(`[RESTORE] Extracted ${entries.length} entries from backup ZIP`);

    let sqlContent: string | null = null;
    let usersJson: any = null;
    const storageFiles: Array<{ bucket: string; path: string; data: Uint8Array }> = [];

    // Process each entry in the ZIP
    for (const entry of entries) {
      if (!entry) continue;

      const entryName = entry.filename;

      // Extract SQL dump
      if (entryName === "db/backup.sql" || entryName.endsWith("/backup.sql")) {
        const sqlBlob = await entry.getData(new BlobWriter());
        const sqlText = await sqlBlob.text();
        sqlContent = sqlText;
        console.log(`[RESTORE] Found SQL dump, size: ${sqlText.length} bytes`);
      }
      // Extract auth users
      else if (entryName === "auth/users.json" || entryName.endsWith("/users.json")) {
        const usersBlob = await entry.getData(new BlobWriter());
        const usersText = await usersBlob.text();
        usersJson = JSON.parse(usersText);
        console.log(`[RESTORE] Found ${usersJson.length} auth users`);
      }
      // Extract storage files
      else if (entryName.startsWith("storage/")) {
        const fileBlob = await entry.getData(new BlobWriter());
        const fileData = new Uint8Array(await fileBlob.arrayBuffer());
        
        // Parse bucket and path from entry name (format: storage/bucket-name/path/to/file)
        const parts = entryName.replace("storage/", "").split("/");
        if (parts.length >= 2) {
          const bucket = parts[0];
          const path = parts.slice(1).join("/");
          storageFiles.push({ bucket, path, data: fileData });
        }
      }
    }

    await zipReader.close();

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const results: any = {
      database: { restored: false, rows_affected: 0 },
      auth_users: { restored: false, users_merged: 0 },
      storage: { restored: false, files_uploaded: 0 },
    };

    // Restore database (merge mode)
    if (sqlContent) {
      console.log(`[RESTORE] Converting SQL to merge mode...`);
      const mergedSql = convertInsertsToMerge(sqlContent);
      
      // Note: Full SQL restore requires direct database access
      // The SQL has been converted to use ON CONFLICT DO NOTHING for merge mode
      // In production, execute this via psql, pgAdmin, or Supabase SQL editor
      results.database = {
        restored: false,
        message: "SQL restore requires direct database connection. The SQL has been converted to use ON CONFLICT DO NOTHING for merge mode. Please execute it manually using psql, pgAdmin, or Supabase SQL editor.",
        sql_converted: true,
        sql_size: mergedSql.length,
        note: "To restore SQL data, connect to your database and execute the converted SQL. All INSERT statements have been modified to use ON CONFLICT DO NOTHING to prevent overwriting existing data.",
      };
    }

    // Restore auth users (merge mode - skip if exists)
    if (usersJson && Array.isArray(usersJson)) {
      console.log(`[RESTORE] Merging ${usersJson.length} auth users...`);
      let merged = 0;
      
      for (const user of usersJson) {
        try {
          // Check if user exists
          const { data: existingUser } = await supabase.auth.admin.getUserById(user.id);
          
          if (!existingUser?.user) {
            // User doesn't exist, create it
            const { data, error } = await supabase.auth.admin.createUser({
              email: user.email,
              email_confirm: !!user.email_confirmed_at,
              user_metadata: user.user_metadata || {},
              app_metadata: user.app_metadata || {},
            });
            
            if (!error) {
              merged++;
            } else {
              console.warn(`[RESTORE] Failed to create user ${user.email}: ${error.message}`);
            }
          } else {
            // User exists, skip (merge mode)
            console.log(`[RESTORE] User ${user.email} already exists, skipping`);
          }
        } catch (err) {
          console.warn(`[RESTORE] Error processing user ${user.email}: ${err}`);
        }
      }
      
      results.auth_users = {
        restored: true,
        users_merged: merged,
        users_skipped: usersJson.length - merged,
      };
    }

    // Restore storage files (merge mode - skip if exists)
    if (storageFiles.length > 0) {
      console.log(`[RESTORE] Uploading ${storageFiles.length} storage files...`);
      let uploaded = 0;
      
      for (const file of storageFiles) {
        try {
          // Check if file exists
          const { data: existingFiles } = await supabase.storage
            .from(file.bucket)
            .list(file.path.split('/').slice(0, -1).join('/') || '', {
              limit: 1,
              search: file.path.split('/').pop(),
            });

          if (!existingFiles || existingFiles.length === 0) {
            // File doesn't exist, upload it
            const { error: uploadError } = await supabase.storage
              .from(file.bucket)
              .upload(file.path, file.data, {
                upsert: false, // Don't overwrite
              });

            if (!uploadError) {
              uploaded++;
            } else {
              console.warn(`[RESTORE] Failed to upload ${file.path}: ${uploadError.message}`);
            }
          } else {
            console.log(`[RESTORE] File ${file.path} already exists, skipping`);
          }
        } catch (err) {
          console.warn(`[RESTORE] Error processing file ${file.path}: ${err}`);
        }
      }
      
      results.storage = {
        restored: true,
        files_uploaded: uploaded,
        files_skipped: storageFiles.length - uploaded,
      };
    }

    console.log(`[RESTORE] Restore completed:`, results);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Backup restore completed (merge mode)",
        results,
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
    console.error("[RESTORE] Error restoring backup:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

