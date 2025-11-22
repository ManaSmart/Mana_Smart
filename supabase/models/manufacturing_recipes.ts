export interface ManufacturingRecipes {
	recipe_sku: string;
	recipe_en_name: string | null;
	recipe_ar_name: string | null;
	prod_output_quantity: number | null;
	prod_output_unit: string | null;
	mfg_labour_cost: number | null;
	mfg_overhead_cost: number | null;
	raw_materials_used: unknown; // jsonb
	total_material_cost: number | null;
	total_cost: number | null;
	cost_per_unit: number | null;
	recipe_notes: string | null;
	created_at: string | null; // timestamptz
	updated_at: string | null; // timestamptz
}

export type ManufacturingRecipesInsert = Omit<
	ManufacturingRecipes,
	'created_at' | 'updated_at'
> & {
	created_at?: string | null;
	updated_at?: string | null;
};

export type ManufacturingRecipesUpdate = Partial<ManufacturingRecipes> & { recipe_sku: string };


