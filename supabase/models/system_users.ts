export interface SystemUsers {
	created_at: string | null; // timestamptz
	status: string | null;
	password_hash: string;
	phone_number: string | null;
	email: string;
	full_name: string;
	last_login: string | null; // timestamptz
	employee_id: string | null; // uuid
	updated_at: string | null; // timestamptz
	role_id: string | null; // uuid
	user_id: string; // uuid
}

export type SystemUsersInsert = Omit<SystemUsers, 'user_id' | 'created_at' | 'updated_at'> & {
	user_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type SystemUsersUpdate = Partial<SystemUsers> & { user_id: string };


