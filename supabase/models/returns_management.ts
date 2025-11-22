export interface ReturnsManagement {
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
	expense_id: string | null; // uuid
	purchase_id: string | null; // uuid
	return_id: string; // uuid
	return_status: string | null;
	return_reason: string | null;
	supplier_id: string | null; // uuid
	return_items: any | null; // jsonb
	return_type: string;
	total_return_amount: number;
	refund_amount: number | null;
	remaining_amount: number | null;
	affects_inventory: boolean;
}

export type ReturnsManagementInsert = Omit<ReturnsManagement, 'return_id' | 'created_at' | 'updated_at'> & {
	return_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type ReturnsManagementUpdate = Partial<ReturnsManagement> & { return_id: string };


