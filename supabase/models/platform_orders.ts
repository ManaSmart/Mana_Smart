export interface PlatformOrders {
	order_items: any; // jsonb
	order_shipping_cost: number | null;
	platform_id: string | null; // uuid
	order_items_subtotal: number;
	notes: string | null;
	order_status: string | null;
	order_total_amount: number | null;
	order_created_date: string | null; // date
	order_last_modified: string | null; // timestamptz
	payment_status: string | null;
	order_platform_reference: string | null;
	order_id: string; // uuid
	customer_id: string | null; // uuid
}

export type PlatformOrdersInsert = Omit<PlatformOrders, 'order_id'> & { order_id?: string };

export type PlatformOrdersUpdate = Partial<PlatformOrders> & { order_id: string };


