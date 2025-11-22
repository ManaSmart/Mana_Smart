export interface ManufacturingOrders {
	mfg_order_id: string; // uuid
	recipe_sku: string | null;
	order_number: string | null;
	mfg_order_batch_size: number | null;
	mfg_order_total_cost: number | null;
	mfg_order_status: string | null;
	mfg_order_start_date: string | null; // date
	mfg_order_completion_date: string | null; // date
	mfg_order_notes: string | null;
	created_by: string | null;
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
}

export type ManufacturingOrdersInsert = Omit<
	ManufacturingOrders,
	'mfg_order_id' | 'created_at' | 'updated_at'
> & {
	mfg_order_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type ManufacturingOrdersUpdate = Partial<ManufacturingOrders> & { mfg_order_id: string };


