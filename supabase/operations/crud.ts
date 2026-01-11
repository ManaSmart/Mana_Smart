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
	filters?: Record<string, unknown> | { limit?: number; orderBy?: string },
	options?: PaginationOptions
): Promise<T[]> {
	let query = sbClient.from(table).select('*');
	
	// Handle both old format (filters + options) and new format (combined filters)
	let actualFilters: Record<string, unknown> = {};
	let actualOptions: PaginationOptions | undefined = undefined;
	
	if (filters) {
		if ('limit' in filters || 'orderBy' in filters) {
			// New format: filters contains pagination info
			actualOptions = {};
			if ('limit' in filters && typeof filters.limit === 'number') {
				actualOptions.limit = filters.limit;
			}
			if ('orderBy' in filters && typeof filters.orderBy === 'string') {
				// Parse orderBy string like "created_at.desc"
				const [column, direction] = filters.orderBy.split('.');
				if (column) {
					actualOptions.orderBy = {
						column,
						ascending: direction !== 'desc'
					};
				}
			}
		} else {
			// Old format: filters is just filters
			actualFilters = filters;
		}
	}
	
	// Apply filters
	if (actualFilters) {
		Object.entries(actualFilters).forEach(([key, value]) => {
			if (value === undefined || value === null) return;
			if (key === 'or') {
				// Handle OR filters
				query = query.or(value as string);
			} else {
				// Handle regular equality filters
				query = query.eq(key, value as never);
			}
		});
	}
	
	// Apply options (either from options parameter or from filters)
	const finalOptions = actualOptions || options;
	if (finalOptions?.orderBy) {
		query = query.order(finalOptions.orderBy.column, { ascending: finalOptions.orderBy.ascending !== false });
	}
	if (finalOptions?.limit !== undefined || finalOptions?.offset !== undefined) {
		const from = finalOptions?.offset ?? 0;
		const to = finalOptions?.limit ? from + finalOptions.limit - 1 : undefined;
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


