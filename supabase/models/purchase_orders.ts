export interface PurchaseOrders {
	payment_status: string | null;
	updated_at: string | null; // timestamptz
	created_at: string | null; // timestamptz
	purchase_remaining_amount: number;
	purchase_paid_amount: number;
	purchase_order_items: any; // jsonb
	purchase_date: string; // date
	supplier_id: string; // uuid
	purchase_id: string; // uuid
	purchase_category: string | null;
	payment_method: string | null;
	purchase_invoice_number: string | null;
	reference_number: string | null;
	notes: string | null;
	delivery_status: string | null;
}

export type PurchaseOrdersInsert = Omit<PurchaseOrders, 'purchase_id' | 'created_at' | 'updated_at'> & {
	purchase_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type PurchaseOrdersUpdate = Partial<PurchaseOrders> & { purchase_id: string };


