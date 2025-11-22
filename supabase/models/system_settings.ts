export interface SystemSettings {
	setting_id: string; // uuid
	email_notifications: boolean;
	sms_notifications: boolean;
	auto_backup: boolean;
	two_factor_auth: boolean;
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
	created_by: string | null; // uuid
	updated_by: string | null; // uuid
}

export type SystemSettingsInsert = Omit<SystemSettings, 'setting_id' | 'created_at' | 'updated_at' | 'created_by' | 'updated_by'>;
export type SystemSettingsUpdate = Partial<Omit<SystemSettings, 'setting_id' | 'created_at' | 'created_by'>>;

