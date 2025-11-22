export interface Employees {
	employee_id: string; // uuid
	profile_image: string | null;
	name_en: string;
	name_ar: string | null;
	email: string | null;
	phone_number: string | null;
	national_id: string | null;
	address: string | null;
	position: string | null;
	department: string | null;
	contract_type: string | null;
	hiring_date: string | null; // date
	job_start_date: string | null; // date
	base_salary: number | null;
	housing_allowance: number | null;
	transport_allowance: number | null;
	other_allowances: number | null;
	social_insurance_number: string | null;
	social_insurance_amount: number | null;
	bank_name: string | null;
	bank_iban: string | null;
	emergency_contact_name: string | null;
	emergency_contact_phone: string | null;
	status: "active" | "on-leave" | "terminated" | null;
	attendance_calendar: unknown | null; // jsonb
	created_at: string | null; // timestamptz
	created_by: string | null; // uuid
	updated_at: string | null; // timestamptz
	updated_by: string | null; // uuid
}

export type EmployeesInsert = Omit<Employees, 'employee_id' | 'created_at' | 'updated_at'> & {
	employee_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type EmployeesUpdate = Partial<Employees> & { employee_id: string };


