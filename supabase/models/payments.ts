export interface Payments {
	payment_id: string; // uuid
	payment_date: string; // date
	paid_amount: number;
	reference_number: string | null;
	created_at: string | null; // timestamptz
	created_by: string | null; // uuid
	notes: string | null;
	payment_method: string | null;
	invoice_id: string; // uuid
}

export type PaymentsInsert = Omit<Payments, 'payment_id' | 'created_at'> & {
	payment_id?: string;
	created_at?: string | null;
};

export type PaymentsUpdate = Partial<Payments> & { payment_id: string };


