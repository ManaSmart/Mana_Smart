// Supabase Edge Function: export-database
// Exports database schema and data as SQL via Supabase API
// This bypasses IP restrictions by running inside Supabase infrastructure

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
import { encode as base64Encode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

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

/**
 * Get all table names from the database
 * Uses a comprehensive list of tables and verifies they exist
 */
async function getAllTables(supabase: any): Promise<string[]> {
  // Comprehensive list of tables in your schema
  // This list includes all tables from your Supabase database
  const allPossibleTables = [
    // System & Settings
    'backup_history',
    'company_branding',
    'system_settings',
    'system_settings_kv',
    'system_users',
    
    // Roles & Permissions
    'roles',
    'permissions',
    'role_permissions',
    
    // HR & Employees
    'employees',
    'employee_attendance',
    'employee_custody_items',
    'employee_requests',
    'leaves',
    'payrolls',
    
    // Customers & Sales
    'customers',
    'platform_customers',
    'leads',
    'contracts',
    'invoices',
    'quotations',
    'price_quotations',
    'payments',
    
    // Inventory & Manufacturing
    'inventory',
    'manufacturing_orders',
    'manufacturing_raw_materials',
    'manufacturing_recipes',
    
    // Purchasing
    'suppliers',
    'purchase_orders',
    'purchase_payments',
    'returns_management',
    
    // Operations & Visits
    'monthly_visits',
    'manual_visits',
    'customer_support_tickets',
    'delegates',
    
    // Marketing
    'marketing_campaigns',
    'message_templates',
    
    // Platforms & Orders
    'platforms',
    'platform_orders',
    
    // Financial
    'expenses',
    'expense_payments',
    'expenses_management',
    'vat_returns',
    'zakat_records',
    
    // Assets
    'fixed_assets_management',
    
    // Calendar & Reminders
    'reminders',
    
    // Reports
    'reports',
    
    // File metadata
    'file_metadata',
  ];

  // Try to verify which tables actually exist by attempting to query them
  const existingTables: string[] = [];
  
  console.log(`Checking ${allPossibleTables.length} possible tables...`);
  
  for (const tableName of allPossibleTables) {
    try {
      // Try to query the table (limit 1 to be fast)
      const { error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .limit(1);
      
      // If no error, table exists
      if (!error) {
        existingTables.push(tableName);
        console.log(`  ✓ Found table: ${tableName}`);
      } else {
        console.log(`  ✗ Table ${tableName} not accessible: ${error.message}`);
      }
    } catch (err) {
      // Table doesn't exist or not accessible, skip it
      console.log(`  ✗ Table ${tableName} error: ${err instanceof Error ? err.message : 'Unknown'}`);
    }
  }

  if (existingTables.length > 0) {
    console.log(`Found ${existingTables.length} accessible tables`);
    return existingTables;
  }

  // Fallback: return all possible tables (user should update the list)
  console.log('Warning: Could not verify tables, using default list');
  return allPossibleTables;
}

/**
 * Export table data as SQL INSERT statements
 * Optimized for memory efficiency with row limits and smaller batches
 */
async function exportTableData(supabase: any, tableName: string): Promise<string> {
  const sql: string[] = [];
  
  // Get table schema
  sql.push(`\n-- Table: ${tableName}`);
  sql.push(`-- Data export for table: ${tableName}\n`);

  // ✅ OPTIMIZATION: Use smaller batches and limit total rows to prevent memory issues
  let offset = 0;
  const limit = 500; // Reduced from 1000 to 500 for better memory management
  const maxRowsPerTable = 50000; // Maximum rows per table to prevent timeout
  let hasMore = true;
  let totalRows = 0;
  let sqlLength = 0;
  const maxSqlLength = 10 * 1024 * 1024; // 10MB max SQL per table

  while (hasMore && totalRows < maxRowsPerTable) {
    const { data, error } = await supabase
      .from(tableName)
      .select('*')
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(`Error fetching data from ${tableName}:`, error);
      sql.push(`-- ERROR: Could not export data from ${tableName}: ${error.message}\n`);
      break;
    }

    if (!data || data.length === 0) {
      hasMore = false;
      break;
    }

    // Generate INSERT statements with memory-efficient string building
    for (const row of data) {
      if (totalRows >= maxRowsPerTable) {
        sql.push(`-- WARNING: Reached maximum row limit (${maxRowsPerTable}) for table ${tableName}\n`);
        hasMore = false;
        break;
      }

      const columns = Object.keys(row).filter(key => row[key] !== undefined).join(', ');
      if (!columns) continue; // Skip rows with no valid columns
      
      const values = Object.keys(row)
        .filter(key => row[key] !== undefined)
        .map((key) => {
          const val = row[key];
          if (val === null || val === undefined) return 'NULL';
          if (typeof val === 'string') {
            // Escape single quotes and wrap in quotes
            // ✅ OPTIMIZATION: Truncate very long strings to prevent memory issues
            const maxStringLength = 10000; // Max 10KB per field
            let escaped = val.replace(/'/g, "''").replace(/\\/g, '\\\\');
            if (escaped.length > maxStringLength) {
              escaped = escaped.substring(0, maxStringLength) + '...[truncated]';
            }
            return `'${escaped}'`;
          }
          if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
          if (typeof val === 'number') return String(val);
          if (val instanceof Date) return `'${val.toISOString()}'`;
          if (typeof val === 'object') {
            // Handle JSONB and objects
            try {
              let jsonStr = JSON.stringify(val);
              // ✅ OPTIMIZATION: Truncate large JSON objects
              const maxJsonLength = 50000; // Max 50KB per JSON field
              if (jsonStr.length > maxJsonLength) {
                jsonStr = jsonStr.substring(0, maxJsonLength) + '...[truncated]';
              }
              jsonStr = jsonStr.replace(/'/g, "''").replace(/\\/g, '\\\\');
              return `'${jsonStr}'::jsonb`;
            } catch {
              return `'${String(val).replace(/'/g, "''")}'`;
            }
          }
          return `'${String(val).replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
        }).join(', ');

      const insertStatement = `INSERT INTO ${tableName} (${columns}) VALUES (${values}) ON CONFLICT DO NOTHING;`;
      sql.push(insertStatement);
      sqlLength += insertStatement.length;
      totalRows++;

      // ✅ OPTIMIZATION: Check SQL size and stop if too large
      if (sqlLength > maxSqlLength) {
        sql.push(`-- WARNING: Reached maximum SQL size limit for table ${tableName}\n`);
        hasMore = false;
        break;
      }
    }

    offset += limit;
    hasMore = hasMore && data.length === limit;
    
    // ✅ OPTIMIZATION: Log progress for large tables
    if (totalRows % 5000 === 0) {
      console.log(`  Exported ${totalRows} rows from ${tableName}...`);
    }
  }

  if (totalRows >= maxRowsPerTable) {
    sql.push(`-- WARNING: Export truncated at ${maxRowsPerTable} rows for table ${tableName}\n`);
  }
  
  sql.push(`-- Total rows exported: ${totalRows}\n`);
  return sql.join('\n');
}

/**
 * Export database schema header
 */
async function exportSchema(tables: string[]): Promise<string> {
  const sql: string[] = [];
  
  sql.push('-- ============================================');
  sql.push('-- Database Backup Export');
  sql.push('-- Generated via Supabase Edge Function');
  sql.push(`-- Date: ${new Date().toISOString()}`);
  sql.push(`-- Tables to export: ${tables.length}`);
  sql.push('-- ============================================');
  sql.push('');
  sql.push('-- ⚠️ IMPORTANT NOTES:');
  sql.push('-- 1. This is a DATA-ONLY export (INSERT statements)');
  sql.push('-- 2. Schema (CREATE TABLE, functions, triggers) is NOT included');
  sql.push('-- 3. For complete backup with schema, use pg_dump');
  sql.push('-- 4. This export works with Supabase Free Plan (no IP restrictions)');
  sql.push('-- 5. To restore: Run these INSERT statements on target database');
  sql.push('');
  sql.push('-- Begin transaction');
  sql.push('BEGIN;');
  sql.push('');
  sql.push('-- Disable triggers temporarily for faster import');
  sql.push('SET session_replication_role = replica;');
  sql.push('');

  return sql.join('\n');
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

  // Verify user authentication
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

    // Check for admin role (database export is critical operation)
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
        JSON.stringify({ error: "Admin access required for database export" }),
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
    console.log("Starting database export via API...");
    
    // Get all tables
    const tables = await getAllTables(supabase);
    console.log(`Found ${tables.length} tables to export`);

    // Export schema (simplified)
    const schemaSQL = await exportSchema(tables);
    
    // ✅ OPTIMIZATION: Build SQL incrementally to reduce memory usage
    // Start with schema, then append table data one at a time
    const dataSQL: string[] = [schemaSQL];
    
    let totalTablesExported = 0;
    let totalRowsExported = 0;
    const startTime = Date.now();
    const maxExecutionTime = 50 * 1000; // 50 seconds max (Edge Functions have ~60s timeout)
    
    for (const tableName of tables) {
      // ✅ OPTIMIZATION: Check execution time and stop if approaching timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > maxExecutionTime) {
        console.log(`⚠️ Approaching timeout (${elapsed}ms), stopping export...`);
        dataSQL.push(`\n-- WARNING: Export stopped due to timeout after ${totalTablesExported} tables\n`);
        break;
      }
      
      console.log(`Exporting table: ${tableName}...`);
      try {
        const tableData = await exportTableData(supabase, tableName);
        if (tableData && tableData.includes('INSERT INTO')) {
          dataSQL.push(tableData);
          totalTablesExported++;
          // Count rows from the SQL
          const rowCount = (tableData.match(/INSERT INTO/g) || []).length;
          totalRowsExported += rowCount;
          console.log(`  ✓ Exported ${rowCount} rows from ${tableName}`);
        } else {
          console.log(`  No data in table ${tableName}`);
          dataSQL.push(`\n-- Table: ${tableName} (empty)\n`);
        }
      } catch (tableError) {
        console.error(`Error exporting table ${tableName}:`, tableError);
        dataSQL.push(`\n-- ERROR exporting ${tableName}: ${tableError instanceof Error ? tableError.message : 'Unknown error'}\n`);
        // Continue with next table instead of failing completely
      }
    }

    // Add footer
    dataSQL.push('\n-- Re-enable triggers');
    dataSQL.push('SET session_replication_role = DEFAULT;');
    dataSQL.push('');
    dataSQL.push('-- Commit transaction');
    dataSQL.push('COMMIT;');
    dataSQL.push('');
    dataSQL.push(`-- Export Summary:`);
    dataSQL.push(`-- Tables exported: ${totalTablesExported}/${tables.length}`);
    dataSQL.push(`-- Total rows: ${totalRowsExported}`);
    dataSQL.push(`-- Export completed: ${new Date().toISOString()}`);

    const fullSQL = dataSQL.join('\n');
    
    // ✅ OPTIMIZATION: Check total SQL size and truncate if too large
    const maxTotalSize = 20 * 1024 * 1024; // 20MB max total SQL
    let finalSQL = fullSQL;
    if (finalSQL.length > maxTotalSize) {
      console.log(`⚠️ SQL output too large (${finalSQL.length} bytes), truncating...`);
      finalSQL = finalSQL.substring(0, maxTotalSize);
      finalSQL += '\n\n-- WARNING: Export truncated due to size limits\n';
      finalSQL += `-- Original size: ${fullSQL.length} bytes\n`;
      finalSQL += `-- Truncated to: ${maxTotalSize} bytes\n`;
    }
    
    // Convert to base64 for JSON response
    // ✅ FIX: Use UTF-8 compatible base64 encoding (btoa only works with Latin1)
    // Convert UTF-8 string to bytes, then encode to base64 using Deno's standard library
    const encoder = new TextEncoder();
    const utf8Bytes = encoder.encode(finalSQL);
    const base64SQL = base64Encode(utf8Bytes);
    
    return new Response(
      JSON.stringify({
        success: true,
        sql_base64: base64SQL,
        tables_exported: totalTablesExported,
        tables_total: tables.length,
        sql_size: finalSQL.length,
        original_sql_size: fullSQL.length,
        message: `Database export completed: ${totalTablesExported} tables, ${totalRowsExported} rows`,
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
    console.error("Error exporting database:", error);
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

