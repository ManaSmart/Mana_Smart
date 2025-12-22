export interface Invoices {
	invoice_items: any; // jsonb
	due_date: string; // date
	customer_id: string; // uuid
	invoice_id: string; // uuid
	delegate_id: string | null; // uuid
	invoice_notes: string | null;
	payment_status: string | null;
	contract_id: string | null; // uuid
	invoice_date: string; // date
	subtotal: number;
	total_amount: number;
	tax_amount: number;
	tax_rate: number;
	paid_amount: number | null;
	created_at: string | null; // timestamptz
	created_by: string | null; // uuid
	updated_at: string | null; // timestamptz
	updated_by: string | null; // uuid
	remaining_amount: number | null;
	discount_type: string | null;
	discount_amount: number | null;
}

export type InvoicesInsert = Omit<Invoices, 'invoice_id' | 'created_at' | 'updated_at'> & {
	invoice_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type InvoicesUpdate = Partial<Invoices> & { invoice_id: string };


