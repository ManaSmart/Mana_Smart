import { combineReducers } from '@reduxjs/toolkit';
import { createCrudSlice } from './crudSliceFactory';

// Import model interfaces for type safety
import type { Customers } from '../../supabase/models/customers';
import type { Delegates } from '../../supabase/models/delegates';
import type { Invoices } from '../../supabase/models/invoices';
import type { Employees } from '../../supabase/models/employees';
import type { Expenses } from '../../supabase/models/expenses';
import type { Inventory } from '../../supabase/models/inventory';
import type { Contracts } from '../../supabase/models/contracts';
import type { CustomerSupportTickets } from '../../supabase/models/customer_support_tickets';
import type { FixedAssetsManagement } from '../../supabase/models/fixed_assets_management';

// Create slices per table (extend with all tables following the same pattern)
const customers = createCrudSlice<Customers>({ table: 'customers', idColumn: 'customer_id' });
const delegates = createCrudSlice<Delegates>({ table: 'delegates', idColumn: 'delegate_id' });
const invoices = createCrudSlice<Invoices>({ table: 'invoices', idColumn: 'invoice_id' });
const employees = createCrudSlice<Employees>({ table: 'employees', idColumn: 'employee_id' });
const expenses = createCrudSlice<Expenses>({ table: 'expenses', idColumn: 'expense_id' });
const inventory = createCrudSlice<Inventory>({ table: 'inventory', idColumn: 'product_code' });
const contracts = createCrudSlice<Contracts>({ table: 'contracts', idColumn: 'contract_id' });
const customer_support_tickets = createCrudSlice<CustomerSupportTickets>({ table: 'customer_support_tickets', idColumn: 'ticket_id' });
const fixed_assets_management = createCrudSlice<FixedAssetsManagement>({ table: 'fixed_assets_management', idColumn: 'asset_id' });

export const thunks = {
	customers: customers.thunks,
	delegates: delegates.thunks,
	invoices: invoices.thunks,
	employees: employees.thunks,
	expenses: expenses.thunks,
	inventory: inventory.thunks,
	contracts: contracts.thunks,
	customer_support_tickets: customer_support_tickets.thunks,
	fixed_assets_management: fixed_assets_management.thunks,
};

export const selectors = {
	customers: customers.selectors,
	delegates: delegates.selectors,
	invoices: invoices.selectors,
	employees: employees.selectors,
	expenses: expenses.selectors,
	inventory: inventory.selectors,
	contracts: contracts.selectors,
	customer_support_tickets: customer_support_tickets.selectors,
	fixed_assets_management: fixed_assets_management.selectors,
};

const rootReducer = combineReducers({
	customers: customers.slice.reducer,
	delegates: delegates.slice.reducer,
	invoices: invoices.slice.reducer,
	employees: employees.slice.reducer,
	expenses: expenses.slice.reducer,
	inventory: inventory.slice.reducer,
	contracts: contracts.slice.reducer,
	customer_support_tickets: customer_support_tickets.slice.reducer,
	fixed_assets_management: fixed_assets_management.slice.reducer,
});

export default rootReducer;


