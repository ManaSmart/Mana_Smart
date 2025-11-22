import { supabase as sbClient } from '../../src/lib/supabaseClient';

export type UUID = string;

export interface PaginationOptions {
	limit?: number;
	offset?: number;
	orderBy?: { column: string; ascending?: boolean };
}

export async function createRow<T>(table: string, values: Partial<T>): Promise<T> {
	const { data, error } = await sbClient.from(table).insert(values).select().single();
	if (error) throw error;
	return data as T;
}

export async function getRows<T>(
	table: string,
	filters?: Record<string, unknown>,
	options?: PaginationOptions
): Promise<T[]> {
	let query = sbClient.from(table).select('*');
	if (filters) {
		Object.entries(filters).forEach(([key, value]) => {
			if (value === undefined || value === null) return;
			query = query.eq(key, value as never);
		});
	}
	if (options?.orderBy) {
		query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
	}
	if (options?.limit !== undefined || options?.offset !== undefined) {
		const from = options?.offset ?? 0;
		const to = options?.limit ? from + options.limit - 1 : undefined;
		// @ts-expect-error supabase types accept undefined to
		query = query.range(from, to);
	}
	const { data, error } = await query;
	if (error) throw error;
	return (data as T[]) ?? [];
}

export async function updateRow<T>(table: string, idColumn: string, id: UUID, values: Partial<T>): Promise<T> {
	const { data, error } = await sbClient.from(table).update(values).eq(idColumn, id).select().single();
	if (error) throw error;
	return data as T;
}

export async function deleteRow(table: string, idColumn: string, id: UUID): Promise<void> {
	const { error } = await sbClient.from(table).delete().eq(idColumn, id);
	if (error) throw error;
}


