export interface Leaves {
	leave_id: string; // uuid
	leave_number: string;
	employee_id: string;
	employee_name: string | null;
	employee_department: string | null;
	employee_position: string | null;
	leave_type: "annual" | "sick" | "emergency" | "unpaid" | "other";
	start_date: string; // date
	end_date: string; // date
	total_days: number;
	reason: string;
	status: "pending" | "approved" | "rejected";
	applied_date: string | null; // timestamptz
	approved_by: string | null;
	approved_date: string | null; // timestamptz
	notes: string | null;
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
}

export type LeavesInsert = Omit<Leaves, 'leave_id' | 'created_at' | 'updated_at'> & {
	leave_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type LeavesUpdate = Partial<Leaves> & { leave_id: string };



