export interface FixedAssetsManagement {
	asset_purchase_date: string; // date
	asset_id: string; // uuid
	asset_department: string | null;
	asset_category: string;
	asset_location: string | null;
	asset_notes: string | null;
	asset_manufacturer_name: string | null;
	asset_image: string | null;
	asset_model: string | null;
	asset_serial_number: string | null;
	asset_condition: string | null;
	asset_status: string | null;
	asset_desc_ar: string | null;
	asset_desc_en: string | null;
	updated_at: string | null; // timestamptz
	created_at: string | null; // timestamptz
	asset_next_maintenance_date: string | null; // date
	asset_last_maintenance_date: string | null; // date
	asset_warranty_exp: string | null; // date
	asset_supplier_id: string | null; // uuid
	asset_useful_lifespan: number | null;
	asset_depreciation_rate: number | null;
	asset_current_value: number | null;
	asset_purchase_price: number;
	asset_en_name: string;
	asset_ar_name: string | null;
}

export type FixedAssetsManagementInsert = Omit<FixedAssetsManagement, 'asset_id' | 'created_at' | 'updated_at'> & {
	asset_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type FixedAssetsManagementUpdate = Partial<FixedAssetsManagement> & { asset_id: string };


