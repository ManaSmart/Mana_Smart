export interface PlatformCustomers {
	total_orders: number | null;
	customer_id: string; // uuid
	platform_id: string | null; // uuid
	total_spent: number | null;
	last_order_date: string | null; // date
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
	customer_name: string;
	customer_phone: string | null;
	customer_email: string | null;
	customer_address: string | null;
	customer_city: string | null;
	customer_status: string | null;
}

export type PlatformCustomersInsert = Omit<PlatformCustomers, 'customer_id' | 'created_at' | 'updated_at'> & {
	customer_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type PlatformCustomersUpdate = Partial<PlatformCustomers> & { customer_id: string };


