export interface Leads {
	phone_number: string | null;
	updated_at: string | null; // timestamptz
	updated_by: string | null; // uuid
	created_at: string | null; // timestamptz
	created_by: string | null; // uuid
	delegate_id: string | null; // uuid
	contact_email: string | null;
	lead_source: string | null;
	estimated_value: number | null;
	lead_id: string; // uuid
	company_name: string;
	notes: string | null;
	status: string | null;
	interest_level: string | null;
	contact_person: string;
}

export type LeadsInsert = Omit<Leads, 'lead_id' | 'created_at' | 'updated_at'> & {
	lead_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type LeadsUpdate = Partial<Leads> & { lead_id: string };


