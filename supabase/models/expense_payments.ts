export interface ExpensePayments {
	expense_payment_id: string; // uuid
	expense_id: string;
	payment_amount: number;
	payment_date: string; // date
	payment_method: string | null;
	reference_number: string | null;
	notes: string | null;
	created_at: string | null; // timestamptz
}

export type ExpensePaymentsInsert = Omit<ExpensePayments, 'expense_payment_id' | 'created_at'> & {
	expense_payment_id?: string;
	created_at?: string | null;
};

export type ExpensePaymentsUpdate = Partial<ExpensePayments> & { expense_payment_id: string };


