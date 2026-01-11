import { combineReducers } from '@reduxjs/toolkit';
import { createCrudSlice } from './crudSliceFactory';

// Import models
import type { Customers } from '../../../supabase/models/customers';
import type { Suppliers } from '../../../supabase/models/suppliers';
import type { Invoices } from '../../../supabase/models/invoices';
import type { Employees } from '../../../supabase/models/employees';
import type { Payrolls } from '../../../supabase/models/payrolls';
import type { Leaves } from '../../../supabase/models/leaves';
import type { Expenses } from '../../../supabase/models/expenses';
import type { Inventory } from '../../../supabase/models/inventory';
import type { Contracts } from '../../../supabase/models/contracts';
import type { Payments } from '../../../supabase/models/payments';
import type { PlatformOrders } from '../../../supabase/models/platform_orders';
import type { PlatformCustomers } from '../../../supabase/models/platform_customers';
import type { MonthlyVisits } from '../../../supabase/models/monthly_visits';
import type { Leads } from '../../../supabase/models/leads';
import type { Quotations } from '../../../supabase/models/quotations';
import type { PriceQuotations } from '../../../supabase/models/price_quotations';
import type { SystemUsers } from '../../../supabase/models/system_users';
import type { Roles } from '../../../supabase/models/roles';
import type { Delegates } from '../../../supabase/models/delegates';
import type { EmployeeAttendance } from '../../../supabase/models/employee_attendance';
import type { EmployeeRequests } from '../../../supabase/models/employee_requests';
import type { CustomerSupportTickets } from '../../../supabase/models/customer_support_tickets';
import type { PurchaseOrders } from '../../../supabase/models/purchase_orders';
import type { PurchasePayments } from '../../../supabase/models/purchase_payments';
import type { ReturnsManagement } from '../../../supabase/models/returns_management';
import type { ExpensePayments } from '../../../supabase/models/expense_payments';
import type { ManufacturingRawMaterials } from '../../../supabase/models/manufacturing_raw_materials';
import type { ManufacturingRecipes } from '../../../supabase/models/manufacturing_recipes';
import type { ManufacturingOrders } from '../../../supabase/models/manufacturing_orders';
import type { FixedAssetsManagement } from '../../../supabase/models/fixed_assets_management';
import type { EmployeeCustodyItems } from '../../../supabase/models/employee_custody_items';

// Create slices per table relevant to existing components
const customers = createCrudSlice<Customers>({ table: 'customers', idColumn: 'customer_id' });
const suppliers = createCrudSlice<Suppliers>({ table: 'suppliers', idColumn: 'supplier_id' });
const invoices = createCrudSlice<Invoices>({ table: 'invoices', idColumn: 'invoice_id' });
const employees = createCrudSlice<Employees>({ table: 'employees', idColumn: 'employee_id' });
const payrolls = createCrudSlice<Payrolls>({ table: 'payrolls', idColumn: 'payroll_id' });
const leaves = createCrudSlice<Leaves>({ table: 'leaves', idColumn: 'leave_id' });
const expenses = createCrudSlice<Expenses>({ table: 'expenses', idColumn: 'expense_id' });
const inventory = createCrudSlice<Inventory>({ table: 'inventory', idColumn: 'product_code' });
const contracts = createCrudSlice<Contracts>({ table: 'contracts', idColumn: 'contract_id' });
const payments = createCrudSlice<Payments>({ table: 'payments', idColumn: 'payment_id' });
const platform_orders = createCrudSlice<PlatformOrders>({ table: 'platform_orders', idColumn: 'order_id' });
const platform_customers = createCrudSlice<PlatformCustomers>({ table: 'platform_customers', idColumn: 'customer_id' });
const monthly_visits = createCrudSlice<MonthlyVisits>({ table: 'monthly_visits', idColumn: 'visit_id' });
const leads = createCrudSlice<Leads>({ table: 'leads', idColumn: 'lead_id' });
const quotations = createCrudSlice<Quotations>({ table: 'quotations', idColumn: 'quotation_id' });
const price_quotations = createCrudSlice<PriceQuotations>({ table: 'price_quotations', idColumn: 'quotation_id' });
const system_users = createCrudSlice<SystemUsers>({ table: 'system_users', idColumn: 'user_id' });
const roles = createCrudSlice<Roles>({ table: 'roles', idColumn: 'role_id' });
const delegates = createCrudSlice<Delegates>({ table: 'delegates', idColumn: 'delegate_id' });
const employee_attendance = createCrudSlice<EmployeeAttendance>({ table: 'employee_attendance', idColumn: 'attendance_id' });
const employee_requests = createCrudSlice<EmployeeRequests>({ table: 'employee_requests', idColumn: 'request_id' });
const customer_support_tickets = createCrudSlice<CustomerSupportTickets>({ table: 'customer_support_tickets', idColumn: 'ticket_id' });
const purchase_orders = createCrudSlice<PurchaseOrders>({ table: 'purchase_orders', idColumn: 'purchase_id' });
const purchase_payments = createCrudSlice<PurchasePayments>({ table: 'purchase_payments', idColumn: 'payment_id' });
const returns_management = createCrudSlice<ReturnsManagement>({ table: 'returns_management', idColumn: 'return_id' });
const expense_payments = createCrudSlice<ExpensePayments>({ table: 'expense_payments', idColumn: 'expense_payment_id' });
const manufacturing_raw_materials = createCrudSlice<ManufacturingRawMaterials>({ table: 'manufacturing_raw_materials', idColumn: 'material_id' });
const manufacturing_recipes = createCrudSlice<ManufacturingRecipes>({ table: 'manufacturing_recipes', idColumn: 'recipe_sku' });
const manufacturing_orders = createCrudSlice<ManufacturingOrders>({ table: 'manufacturing_orders', idColumn: 'mfg_order_id' });
const fixed_assets_management = createCrudSlice<FixedAssetsManagement>({ table: 'fixed_assets_management', idColumn: 'asset_id' });
const employee_custody_items = createCrudSlice<EmployeeCustodyItems>({ table: 'employee_custody_items', idColumn: 'custody_id' });

export const slices = {
	customers: customers.slice,
	suppliers: suppliers.slice,
	invoices: invoices.slice,
	employees: employees.slice,
	expenses: expenses.slice,
	inventory: inventory.slice,
	payrolls: payrolls.slice,
	leaves: leaves.slice,
	contracts: contracts.slice,
	payments: payments.slice,
	platform_orders: platform_orders.slice,
	platform_customers: platform_customers.slice,
	monthly_visits: monthly_visits.slice,
	leads: leads.slice,
	quotations: quotations.slice,
	price_quotations: price_quotations.slice,
	system_users: system_users.slice,
	roles: roles.slice,
	delegates: delegates.slice,
	employee_attendance: employee_attendance.slice,
	employee_requests: employee_requests.slice,
	customer_support_tickets: customer_support_tickets.slice,
	purchase_orders: purchase_orders.slice,
	purchase_payments: purchase_payments.slice,
	returns_management: returns_management.slice,
	expense_payments: expense_payments.slice,
	manufacturing_raw_materials: manufacturing_raw_materials.slice,
	manufacturing_recipes: manufacturing_recipes.slice,
	manufacturing_orders: manufacturing_orders.slice,
	fixed_assets_management: fixed_assets_management.slice,
	employee_custody_items: employee_custody_items.slice,
};

export const thunks = {
	customers: customers.thunks,
	suppliers: suppliers.thunks,
	invoices: invoices.thunks,
	employees: employees.thunks,
	expenses: expenses.thunks,
	inventory: inventory.thunks,
	payrolls: payrolls.thunks,
	leaves: leaves.thunks,
	contracts: contracts.thunks,
	payments: payments.thunks,
	platform_orders: platform_orders.thunks,
	platform_customers: platform_customers.thunks,
	monthly_visits: monthly_visits.thunks,
	leads: leads.thunks,
	quotations: quotations.thunks,
	price_quotations: price_quotations.thunks,
	system_users: system_users.thunks,
	roles: roles.thunks,
	delegates: delegates.thunks,
	employee_attendance: employee_attendance.thunks,
	employee_requests: employee_requests.thunks,
	customer_support_tickets: customer_support_tickets.thunks,
	purchase_orders: purchase_orders.thunks,
	purchase_payments: purchase_payments.thunks,
	returns_management: returns_management.thunks,
	expense_payments: expense_payments.thunks,
	manufacturing_raw_materials: manufacturing_raw_materials.thunks,
	manufacturing_recipes: manufacturing_recipes.thunks,
	manufacturing_orders: manufacturing_orders.thunks,
	fixed_assets_management: fixed_assets_management.thunks,
	employee_custody_items: employee_custody_items.thunks,
};

export const selectors = {
	customers: customers.selectors,
	suppliers: suppliers.selectors,
	invoices: invoices.selectors,
	employees: employees.selectors,
	expenses: expenses.selectors,
	inventory: inventory.selectors,
	payrolls: payrolls.selectors,
	leaves: leaves.selectors,
	contracts: contracts.selectors,
	payments: payments.selectors,
	platform_orders: platform_orders.selectors,
	platform_customers: platform_customers.selectors,
	monthly_visits: monthly_visits.selectors,
	leads: leads.selectors,
	quotations: quotations.selectors,
	price_quotations: price_quotations.selectors,
	system_users: system_users.selectors,
	roles: roles.selectors,
	delegates: delegates.selectors,
	employee_attendance: employee_attendance.selectors,
	employee_requests: employee_requests.selectors,
	customer_support_tickets: customer_support_tickets.selectors,
	purchase_orders: purchase_orders.selectors,
	purchase_payments: purchase_payments.selectors,
	returns_management: returns_management.selectors,
	expense_payments: expense_payments.selectors,
	manufacturing_raw_materials: manufacturing_raw_materials.selectors,
	manufacturing_recipes: manufacturing_recipes.selectors,
	manufacturing_orders: manufacturing_orders.selectors,
	fixed_assets_management: fixed_assets_management.selectors,
	employee_custody_items: employee_custody_items.selectors,
};

const rootReducer = combineReducers({
	customers: customers.slice.reducer,
	suppliers: suppliers.slice.reducer,
	invoices: invoices.slice.reducer,
	employees: employees.slice.reducer,
	expenses: expenses.slice.reducer,
	inventory: inventory.slice.reducer,
	payrolls: payrolls.slice.reducer,
	leaves: leaves.slice.reducer,
	contracts: contracts.slice.reducer,
	payments: payments.slice.reducer,
	platform_orders: platform_orders.slice.reducer,
	platform_customers: platform_customers.slice.reducer,
	monthly_visits: monthly_visits.slice.reducer,
	leads: leads.slice.reducer,
	quotations: quotations.slice.reducer,
	price_quotations: price_quotations.slice.reducer,
	system_users: system_users.slice.reducer,
	roles: roles.slice.reducer,
	delegates: delegates.slice.reducer,
	employee_attendance: employee_attendance.slice.reducer,
	employee_requests: employee_requests.slice.reducer,
	customer_support_tickets: customer_support_tickets.slice.reducer,
	purchase_orders: purchase_orders.slice.reducer,
	purchase_payments: purchase_payments.slice.reducer,
	returns_management: returns_management.slice.reducer,
	expense_payments: expense_payments.slice.reducer,
	manufacturing_raw_materials: manufacturing_raw_materials.slice.reducer,
	manufacturing_recipes: manufacturing_recipes.slice.reducer,
	manufacturing_orders: manufacturing_orders.slice.reducer,
	fixed_assets_management: fixed_assets_management.slice.reducer,
	employee_custody_items: employee_custody_items.slice.reducer,
});

export default rootReducer;


