export interface Quotations {
	company_stamp: string | null; // Filename only (not full URL)
	company_logo: string | null; // Filename only (not full URL)
	quotation_notes: string | null;
	quotation_summary: string | null;
	location: string | null;
	customer_name: string | null;
	quotation_id: string; // uuid
	customer_id: string | null; // uuid
	phone_number: number | null;
	quotation_validity: number | null;
	discount_type: "percentage" | "fixed" | null;
	discount_amount: number | null;
	updated_at: string | null; // timestamptz
	created_at: string | null; // timestamptz
	quotation_items: any; // jsonb
}

export type QuotationsInsert = Omit<Quotations, 'quotation_id' | 'created_at' | 'updated_at'> & {
	quotation_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type QuotationsUpdate = Partial<Quotations> & { quotation_id: string };


