export interface CompanyBranding {
	system_logo: string | null;
	company_name_ar: string;
	company_name_en: string;
	system_sidebar_subtitle: string | null;
	system_sidebar_name: string;
	created_at: string | null; // timestamptz
	company_phone: string | null;
	company_email: string | null;
	branding_id: string; // uuid
	updated_at: string | null; // timestamptz
	company_address: string | null;
}

export type CompanyBrandingInsert = Omit<CompanyBranding, 'branding_id' | 'created_at' | 'updated_at'> & {
	branding_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type CompanyBrandingUpdate = Partial<CompanyBranding> & { branding_id: string };


