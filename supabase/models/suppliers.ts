export interface Suppliers {
	supplier_id: string; // uuid
	supplier_en_name: string;
	supplier_payment_terms: string | null;
	supplier_status: string | null;
	supplier_notes: string | null;
	supplier_contact_person: string | null;
	supplier_phone_num: string | null;
	supplier_tax_number: string | null;
	supplier_city: string | null;
	supplier_country: string | null;
	supplier_ar_name: string | null;
	supplier_email: string | null;
	updated_at: string | null; // timestamptz
	supplier_category: string | null;
	created_at: string | null; // timestamptz
	credit_balance_limit: number | null;
	supplier_address: string | null;
	supplier_balance?: number | null;
}

export type SuppliersInsert = Omit<Suppliers, 'supplier_id' | 'created_at' | 'updated_at'> & {
	supplier_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type SuppliersUpdate = Partial<Suppliers> & { supplier_id: string };


