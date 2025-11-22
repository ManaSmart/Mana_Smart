export interface PurchasePayments {
	payment_method: string;
	purchase_id: string | null; // uuid
	supplier_id: string; // uuid
	payment_date: string; // date
	payment_amount: number;
	created_at: string | null; // timestamptz
	payment_id: string; // uuid
	payment_notes: string | null;
	reference_number: string | null;
}

export type PurchasePaymentsInsert = Omit<PurchasePayments, 'payment_id' | 'created_at'> & {
	payment_id?: string;
	created_at?: string | null;
};

export type PurchasePaymentsUpdate = Partial<PurchasePayments> & { payment_id: string };


