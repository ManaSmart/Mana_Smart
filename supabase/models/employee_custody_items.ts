export interface EmployeeCustodyItems {
	item_status: string | null;
	item_image: string | null;
	item_condition: string | null;
	item_desc_ar: string | null;
	item_desc_en: string | null;
	item_serial_number: string | null;
	employee_id: string | null; // uuid
	item_value: number | null;
	item_category: string;
	custody_id: string; // uuid
	item_en_name: string;
	created_at: string | null; // timestamptz
	item_ar_name: string | null;
	updated_at: string | null; // timestamptz
	item_warranty_expire: string | null; // date
	item_return_date: string | null; // date
	item_date_issued: string | null; // date
	item_notes: string | null;
	item_office_location: string | null;
}

export type EmployeeCustodyItemsInsert = Omit<EmployeeCustodyItems, 'custody_id' | 'created_at' | 'updated_at'> & {
	custody_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type EmployeeCustodyItemsUpdate = Partial<EmployeeCustodyItems> & { custody_id: string };


