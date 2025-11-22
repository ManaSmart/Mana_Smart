export type ZakatStatus = 'draft' | 'pending' | 'submitted' | 'paid';

export interface ZakatRecordRow {
	zakat_record_id: string; // uuid
	year: number;
	total_assets: number;
	total_liabilities: number;
	net_assets: number;
	zakatable_amount: number;
	zakat_due: number;
	status: ZakatStatus | null;
	submission_date: string | null; // date
	payment_date: string | null; // date
	notes: string | null;
	created_at: string; // timestamptz
}

export interface ZakatRecordInsert {
	year: number;
	total_assets: number;
	total_liabilities: number;
	net_assets: number;
	zakatable_amount: number;
	zakat_due: number;
	status?: ZakatStatus;
	submission_date?: string | null;
	payment_date?: string | null;
	notes?: string | null;
}

export type ZakatRecordUpdate = Partial<ZakatRecordInsert> & {
	zakat_record_id: string;
};

