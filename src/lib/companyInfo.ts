import { supabase } from './supabaseClient';
import type { CompanyBranding } from '../../supabase/models/company_branding';

let companyInfoCache: CompanyBranding | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getCompanyInfo(): Promise<CompanyBranding | null> {
  const now = Date.now();
  
  // Return cached data if still valid
  if (companyInfoCache && (now - cacheTimestamp) < CACHE_DURATION) {
    return companyInfoCache;
  }

  try {
    const { data, error } = await supabase
      .from("company_branding")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<CompanyBranding>();

    if (error) {
      console.error('Error fetching company info:', error);
      return null;
    }

    if (data) {
      companyInfoCache = data;
      cacheTimestamp = now;
      return data;
    }

    return null;
  } catch (error) {
    console.error('Error fetching company info:', error);
    return null;
  }
}

export function getCompanyName(companyInfo: CompanyBranding | null): string {
  if (!companyInfo) {
    return "Mana Smart Trading Company"; // fallback
  }
  
  // Return English name if available, otherwise fallback to a default
  return companyInfo.company_name_en || companyInfo.company_name_ar || "Mana Smart Trading Company";
}

export function getCompanyNameArabic(companyInfo: CompanyBranding | null): string {
  if (!companyInfo) {
    return "شركة مانا الذكية للتجارة"; // fallback
  }
  
  return companyInfo.company_name_ar || companyInfo.company_name_en || "شركة مانا الذكية للتجارة";
}

export function getCompanyFullName(companyInfo: CompanyBranding | null): string {
  const en = getCompanyName(companyInfo);
  const ar = getCompanyNameArabic(companyInfo);
  return `${en} | ${ar}`;
}
