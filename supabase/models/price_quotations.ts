export interface PriceQuotations {
	phone_number: string | null;
	updated_at: string | null; // timestamptz
	created_at: string | null; // timestamptz
	subtotal: number | null;
	quotation_items: any; // jsonb
	quotation_validity: number | null;
	customer_id: string | null; // uuid
	quotation_id: string; // uuid
	company_stamp: string | null;
	company_logo: string | null;
	quotation_notes: string | null;
	quotation_summary: string | null;
	location: string | null;
	customer_name: string;
}

export type PriceQuotationsInsert = Omit<PriceQuotations, 'quotation_id' | 'created_at' | 'updated_at'> & {
	quotation_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type PriceQuotationsUpdate = Partial<PriceQuotations> & { quotation_id: string };


