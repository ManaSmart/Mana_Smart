export interface Inventory {
	current_stock: number | null;
	minimum_stock_alert: number | null;
	prod_selling_price: number | null;
	prod_cost_price: number | null;
	product_code: string; // uuid
	prod_status: string | null;
	prod_supplier: string | null;
	measuring_unit: string | null;
	prod_img: string | null;
	prod_ar_description: string | null;
	prod_en_description: string | null;
	ar_prod_name: string | null;
	en_prod_name: string | null;
	category: string | null;
	prod_margin: number | null;
}

export type InventoryInsert = Omit<Inventory, 'product_code'> & { product_code?: string };

export type InventoryUpdate = Partial<Inventory> & { product_code: string };


