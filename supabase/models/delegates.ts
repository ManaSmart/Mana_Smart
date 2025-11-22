export interface Delegates {
	delegate_name: string;
	created_at: string | null; // timestamptz
	delegate_region: string | null;
	status: string | null;
	delegate_email: string | null;
	delegate_id: string; // uuid
	delegate_phone: string | null;
}

export type DelegatesInsert = Omit<Delegates, 'delegate_id' | 'created_at'> & {
	delegate_id?: string;
	created_at?: string | null;
};

export type DelegatesUpdate = Partial<Delegates> & { delegate_id: string };


