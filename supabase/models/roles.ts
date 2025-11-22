export interface Roles {
	role_id: string; // uuid
	updated_at: string | null; // timestamptz
	created_at: string | null; // timestamptz
	permissions: any | null; // jsonb
	users_count: number | null;
	role_name: string;
}

export type RolesInsert = Omit<Roles, 'role_id' | 'created_at' | 'updated_at'> & {
	role_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type RolesUpdate = Partial<Roles> & { role_id: string };


