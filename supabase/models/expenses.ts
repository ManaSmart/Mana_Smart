export interface Expenses {
	category: string;
	notes: string | null;
	expense_date: string; // date
	expense_id: string; // uuid
	base_amount: number;
	receipt_number: string | null;
	paid_to: string | null;
	remaining_amount: number | null;
	paid_amount: number | null;
	total_amount: number | null;
	tax_amount: number | null;
	tax_rate: number | null;
	created_at: string | null; // timestamptz
	payment_method: string | null;
	status: string | null;
	description: string | null;
}

export type ExpensesInsert = Omit<Expenses, 'expense_id' | 'created_at'> & {
	expense_id?: string;
	created_at?: string | null;
};

export type ExpensesUpdate = Partial<Expenses> & { expense_id: string };


