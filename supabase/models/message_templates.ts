export type MessageTemplateType = 'whatsapp' | 'email' | 'sms';

export type MessageTemplateCategory =
	| 'payment-reminder'
	| 'invoice'
	| 'contract'
	| 'welcome'
	| 'follow-up'
	| 'visit-reminder';

export interface MessageTemplateRow {
	template_id: string; // uuid
	name: string;
	template_type: MessageTemplateType;
	category: MessageTemplateCategory;
	subject: string | null;
	content: string;
	variables: string[] | null;
	created_at: string; // timestamptz
	updated_at: string; // timestamptz
}

export interface MessageTemplateInsert {
	name: string;
	template_type: MessageTemplateType;
	category: MessageTemplateCategory;
	subject?: string | null;
	content: string;
	variables?: string[] | null;
}

export type MessageTemplateUpdate = Partial<MessageTemplateInsert> & {
	template_id: string;
};


