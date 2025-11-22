export type VatQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export type VatStatus = 'draft' | 'pending' | 'submitted' | 'paid';

export interface VatReturnRow {
	vat_return_id: string; // uuid
	quarter: VatQuarter;
	year: number;
	period_start_date: string; // date
	period_end_date: string; // date
	sales_inc_vat: number;
	sales_exc_vat: number;
	vat_on_sales: number;
	purchases_inc_vat: number;
	purchases_exc_vat: number;
	input_vat: number;
	net_vat_payable: number;
	status: VatStatus | null;
	submission_date: string | null; // date
	payment_date: string | null; // date
	notes: string | null;
	created_at: string; // timestamptz
}

export interface VatReturnInsert {
	quarter: VatQuarter;
	year: number;
	period_start_date: string;
	period_end_date: string;
	sales_inc_vat: number;
	sales_exc_vat: number;
	vat_on_sales: number;
	purchases_inc_vat: number;
	purchases_exc_vat: number;
	input_vat: number;
	net_vat_payable: number;
	status?: VatStatus;
	submission_date?: string | null;
	payment_date?: string | null;
	notes?: string | null;
}

export type VatReturnUpdate = Partial<VatReturnInsert> & {
	vat_return_id: string;
};

