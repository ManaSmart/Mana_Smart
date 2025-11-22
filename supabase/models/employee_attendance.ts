export interface EmployeeAttendance {
	attendance_id: string; // uuid
	employee_id: string; // uuid
	attendance_month: string; // date
	status_by_day: Record<string, string>;
	total_present: number | null;
	total_absent: number | null;
	total_leave: number | null;
	total_holiday: number | null;
	total_weekend: number | null;
	notes: string | null;
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
}

export type EmployeeAttendanceInsert = Omit<EmployeeAttendance, 'attendance_id' | 'created_at' | 'updated_at'> & {
	attendance_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type EmployeeAttendanceUpdate = Partial<EmployeeAttendance> & { attendance_id: string };


