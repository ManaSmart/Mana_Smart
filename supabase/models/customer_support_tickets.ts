export interface CustomerSupportTickets {
	subject: string;
	assigned_to: string | null; // uuid
	priority: string;
	created_at: string | null; // timestamptz
	customer_id: string | null; // uuid
	ticket_id: string; // uuid
	description: string | null;
	status: string | null;
	notes?: string | null;
	resolution_notes?: string | null;
}

export type CustomerSupportTicketsInsert = Omit<CustomerSupportTickets, 'ticket_id' | 'created_at'> & {
	ticket_id?: string;
	created_at?: string | null;
};

export type CustomerSupportTicketsUpdate = Partial<CustomerSupportTickets> & { ticket_id: string };


