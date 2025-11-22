export type EmployeeRequestType = "leave" | "advance" | "loan" | "overtime" | "other";
export type EmployeeRequestStatus = "pending" | "approved" | "rejected" | "completed";

export interface EmployeeRequests {
	request_id: string; // uuid
	request_number: string;
	employee_id: string;
	employee_name: string | null;
	employee_department: string | null;
	employee_position: string | null;
	request_type: EmployeeRequestType;
	amount: number | null;
	repayment_months: number | null;
	monthly_deduction: number | null;
	leave_start_date: string | null; // date
	leave_end_date: string | null; // date
	leave_days: number | null;
	description: string;
	status: EmployeeRequestStatus;
	requested_date: string | null; // timestamptz
	approved_by: string | null;
	approved_date: string | null; // timestamptz
	notes: string | null;
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
}

export type EmployeeRequestsInsert = Omit<EmployeeRequests, 'request_id' | 'created_at' | 'updated_at'> & {
	request_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type EmployeeRequestsUpdate = Partial<EmployeeRequests> & { request_id: string };



