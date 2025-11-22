export interface ExpensesManagement {
	status: string | null;
	employee_id: string | null; // uuid
	expense_date: string; // date
	payment_method: string;
	receipt_url: string | null;
	expense_id: string; // uuid
	delegate_id: string | null; // uuid
	customer_id: string | null; // uuid
	amount: number;
	expense_category: string;
	description: string | null;
	created_at: string | null; // timestamptz
}

export type ExpensesManagementInsert = Omit<ExpensesManagement, 'expense_id' | 'created_at'> & {
	expense_id?: string;
	created_at?: string | null;
};

export type ExpensesManagementUpdate = Partial<ExpensesManagement> & { expense_id: string };


