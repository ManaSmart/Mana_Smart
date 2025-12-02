/**
 * Utility function to get the logo for printing documents
 * Loads logo from Settings (company_branding table) with all fallbacks
 */

import { supabase } from './supabaseClient';
import type { CompanyBranding } from '../../supabase/models/company_branding';
import { loadLogoWithAllFallbacks } from './logoManager';

/**
 * Get the logo URL for printing documents
 * Returns the logo from Settings (company_branding) with all fallbacks
 */
export async function getPrintLogo(): Promise<string | null> {
  try {
    // Get the latest branding record
    const { data, error } = await supabase
      .from("company_branding")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<CompanyBranding>();

    if (error) {
      // PGRST116 means no rows found - this is expected if branding hasn't been set up yet
      if (error.code !== "PGRST116") {
        console.error('Error loading branding for print:', error);
      }
      return null;
    }

    if (!data) {
      return null;
    }

    // Try to load logo with all fallbacks (S3 → Local Backup → Public Folder)
    const logoResult = await loadLogoWithAllFallbacks(data.branding_id);
    
    if (logoResult.success && logoResult.url) {
      return logoResult.url;
    }

    // Fallback to database stored value if available
    const logoValue = data.system_logo ?? "";
    if (logoValue && (logoValue.startsWith('http') || logoValue.startsWith('https') || logoValue.startsWith('data:'))) {
      return logoValue;
    }

    return null;
  } catch (error: any) {
    console.error('Error getting print logo:', error);
    return null;
  }
}

