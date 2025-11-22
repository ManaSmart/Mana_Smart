export interface Permissions {
	permission_id: string; // uuid
	permission_name: string;
	permission_description: string | null;
}

export type PermissionsInsert = Omit<Permissions, 'permission_id'> & { permission_id?: string };

export type PermissionsUpdate = Partial<Permissions> & { permission_id: string };


