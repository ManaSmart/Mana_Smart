import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { RootState } from '../store';
import { createRow, deleteRow, getRows, updateRow } from '../../supabase/operations/crud';

export interface CrudState<T> {
	items: T[];
	loading: boolean;
	error: string | null;
}

export function createCrudThunks<T extends { [k: string]: unknown }>(table: string, idColumn: keyof T) {
	const fetchAll = createAsyncThunk<T[], Record<string, unknown> | undefined>(`${table}/fetchAll`, async (filters) => {
		return await getRows<T>(table, filters ?? {});
	});

	const createOne = createAsyncThunk<T, Partial<T>>(`${table}/createOne`, async (values) => {
		return await createRow<T>(table, values);
	});

	const updateOne = createAsyncThunk<T, { id: string; values: Partial<T> }>(
		`${table}/updateOne`,
		async ({ id, values }) => {
			return await updateRow<T>(table, idColumn as string, id, values);
		}
	);

	const deleteOne = createAsyncThunk<string, string>(`${table}/deleteOne`, async (id) => {
		await deleteRow(table, idColumn as string, id);
		return id;
	});

	return { fetchAll, createOne, updateOne, deleteOne };
}

export function createCrudSlice<T extends { [k: string]: unknown }>(
	options: {
		table: string;
		idColumn: keyof T;
		initialState?: Partial<CrudState<T>>;
	}
) {
	const { table, idColumn } = options;
	const thunks = createCrudThunks<T>(table, idColumn);

	const initialState: CrudState<T> = {
		items: [],
		loading: false,
		error: null,
		...options.initialState,
	};

	const slice = createSlice({
		name: table,
		initialState,
		reducers: {},
		extraReducers: (builder) => {
			builder
				.addCase(thunks.fetchAll.pending, (state) => {
					state.loading = true;
					state.error = null;
				})
				.addCase(thunks.fetchAll.fulfilled, (state, action: PayloadAction<T[]>) => {
					state.loading = false;
					state.items = action.payload;
				})
				.addCase(thunks.fetchAll.rejected, (state, action) => {
					state.loading = false;
					state.error = action.error.message ?? 'Failed to fetch';
				})
				.addCase(thunks.createOne.pending, (state) => {
					state.loading = true;
					state.error = null;
				})
				.addCase(thunks.createOne.fulfilled, (state, action: PayloadAction<T>) => {
					state.loading = false;
					state.items.unshift(action.payload);
				})
				.addCase(thunks.createOne.rejected, (state, action) => {
					state.loading = false;
					state.error = action.error.message ?? 'Failed to create';
				})
				.addCase(thunks.updateOne.pending, (state) => {
					state.loading = true;
					state.error = null;
				})
				.addCase(thunks.updateOne.fulfilled, (state, action: PayloadAction<T>) => {
					state.loading = false;
					const id = action.payload[idColumn as string];
					const idx = state.items.findIndex((i) => i[idColumn as string] === id);
					if (idx >= 0) state.items[idx] = action.payload;
				})
				.addCase(thunks.updateOne.rejected, (state, action) => {
					state.loading = false;
					state.error = action.error.message ?? 'Failed to update';
				})
				.addCase(thunks.deleteOne.pending, (state) => {
					state.loading = true;
					state.error = null;
				})
				.addCase(thunks.deleteOne.fulfilled, (state, action: PayloadAction<string>) => {
					state.loading = false;
					state.items = state.items.filter((i) => i[idColumn as string] !== action.payload);
				})
				.addCase(thunks.deleteOne.rejected, (state, action) => {
					state.loading = false;
					state.error = action.error.message ?? 'Failed to delete';
				});
		},
	});

	const selectAll = (state: RootState) => (state as any)[table].items as T[];
	const selectLoading = (state: RootState) => (state as any)[table].loading as boolean;
	const selectError = (state: RootState) => (state as any)[table].error as string | null;

	return { slice, thunks, selectors: { selectAll, selectLoading, selectError } };
}


