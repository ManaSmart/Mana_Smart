export interface Customers {
	quick_actions: string | null;
	updated_at: string | null; // timestamptz
	created_at: string | null; // timestamptz
	created_by: string | null; // uuid
	updated_by: string | null; // uuid
	comments: string | null;
	status: string | null;
	contract_type: string | null;
	customer_city_of_residence: string | null;
	customer_address: string | null;
	customer_email: string | null;
	contact_num: string | null;
	company: string | null;
	customer_name: string;
	customer_last_visit: string | null; // date
	representative_id: string | null; // uuid
	monthly_amount: number | null;
	customer_id: string; // uuid
	delegate_id: string | null; // uuid
}

export type CustomersInsert = Omit<Customers, 'customer_id' | 'created_at' | 'updated_at'> & {
	customer_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type CustomersUpdate = Partial<Customers> & { customer_id: string };


