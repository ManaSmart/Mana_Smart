export interface ManufacturingRawMaterials {
	material_id: string; // uuid
	material_sku: string | null;
	material_en_name: string | null;
	material_ar_name: string | null;
	unit: string | null;
	cost_per_unit: number | null;
	current_stock: number | null;
	min_stock: number | null;
	category: string | null;
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
}

export type ManufacturingRawMaterialsInsert = Omit<
	ManufacturingRawMaterials,
	'material_id' | 'created_at' | 'updated_at'
> & {
	material_id?: string;
	created_at?: string | null;
	updated_at?: string | null;
};

export type ManufacturingRawMaterialsUpdate = Partial<ManufacturingRawMaterials> & { material_id: string };


