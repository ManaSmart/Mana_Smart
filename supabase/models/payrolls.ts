export interface Payrolls {
	payroll_id: string; // uuid
	payroll_number: string;
	payroll_month: string;
	payroll_year: number;
	payroll_date: string; // date
	status: "draft" | "approved" | "paid";
	total_amount: number;
	notes: string | null;
	attached_details: unknown | null; // jsonb
	created_by: string | null;
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
	updated_by: string | null; // uuid
	paid_at: string | null; // timestamptz
}

export type PayrollsInsert = Omit<Payrolls, 'payroll_id' | 'created_at' | 'updated_at' | 'paid_at'> & {
	payroll_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
	paid_at?: string | null;
};

export type PayrollsUpdate = Partial<Payrolls> & { payroll_id: string };


