export interface Contracts {
	contract_duration_interval: string;
	delegate_id: string | null; // uuid
	updated_at: string | null; // timestamptz
	updated_by: string | null; // uuid
	created_at: string | null; // timestamptz
	created_by: string | null; // uuid
	contract_status: string | null;
	location: string | null;
	notes: string | null;
	contract_amount: number;
	contract_start_date: string; // date
	contract_id: string; // uuid
	contract_end_date: string | null; // date
	contract_number: string;
	customer_id: string; // uuid
}

export type ContractsInsert = Omit<Contracts, 'contract_id' | 'created_at' | 'updated_at'> & {
	contract_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type ContractsUpdate = Partial<Contracts> & { contract_id: string };


