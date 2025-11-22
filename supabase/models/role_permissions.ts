export interface RolePermissions {
	role_permission_id: string; // uuid
	updated_at: string | null; // timestamptz
	created_at: string | null; // timestamptz
	role_id: string; // uuid
	permissions: any; // jsonb
}

export type RolePermissionsInsert = Omit<RolePermissions, 'role_permission_id' | 'created_at' | 'updated_at'> & {
	role_permission_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type RolePermissionsUpdate = Partial<RolePermissions> & { role_permission_id: string };


