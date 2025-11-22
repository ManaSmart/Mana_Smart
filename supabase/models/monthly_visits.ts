export interface MonthlyVisits {
	customer_id: string; // uuid
	created_at: string | null; // timestamptz
	created_by: string | null; // uuid
	visit_time: string | null; // time
	visit_date: string; // date
	status: string | null;
	delegate_id: string | null; // uuid
	address: string | null;
	updated_at: string | null; // timestamptz
	updated_by: string | null; // uuid
	notes: string | null;
	contract_id: string; // uuid
	visit_id: string; // uuid
}

export type MonthlyVisitsInsert = Omit<MonthlyVisits, 'visit_id' | 'created_at' | 'updated_at'> & {
	visit_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type MonthlyVisitsUpdate = Partial<MonthlyVisits> & { visit_id: string };


