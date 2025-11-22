import type { PageId } from "./page-map";

export type AccessAction =
  | "view"
  | "create"
  | "update"
  | "delete"
  | "approve"
  | "export"
  | "assign";

export interface AccessArea {
  id: PageId;
  label: string;
  description?: string;
  category: string;
  actions: AccessAction[];
}

export const ACCESS_AREAS: AccessArea[] = [
  {
    id: "dashboard",
    label: "Dashboard Overview",
    category: "Dashboard & Analytics",
    actions: ["view"],
  },
  {
    id: "myworkspace",
    label: "My Workspace",
    category: "Dashboard & Analytics",
    actions: ["view", "update"],
  },
  {
    id: "analytics",
    label: "Analytics & KPIs",
    category: "Dashboard & Analytics",
    actions: ["view", "export"],
  },
  {
    id: "calendar",
    label: "Calendar & Reminders",
    category: "Dashboard & Analytics",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "customers",
    label: "Customers",
    category: "Sales & Customers",
    actions: ["view", "create", "update", "delete", "export"],
  },
  {
    id: "leads",
    label: "Leads",
    category: "Sales & Customers",
    actions: ["view", "create", "update", "delete", "assign"],
  },
  {
    id: "quotations",
    label: "Quotations",
    category: "Sales & Customers",
    actions: ["view", "create", "update", "delete", "export"],
  },
  {
    id: "invoices",
    label: "Invoices",
    category: "Sales & Customers",
    actions: ["view", "create", "update", "delete", "export"],
  },
  {
    id: "contracts",
    label: "Contracts",
    category: "Sales & Customers",
    actions: ["view", "create", "update", "delete", "approve"],
  },
  {
    id: "statements",
    label: "Customer Statements",
    category: "Sales & Customers",
    actions: ["view", "export"],
  },
  {
    id: "visits",
    label: "Scheduled Visits",
    category: "Operations",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "monthlyVisits",
    label: "Monthly Visits",
    category: "Operations",
    actions: ["view", "update"],
  },
  {
    id: "payments",
    label: "Payments",
    category: "Operations",
    actions: ["view", "create", "update", "delete", "export"],
  },
  {
    id: "representatives",
    label: "Field Representatives",
    category: "Operations",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "support",
    label: "Customer Support",
    category: "Operations",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "employees",
    label: "Employees",
    category: "HR & Employees",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "attendanceSheet",
    label: "Attendance Sheet",
    category: "HR & Employees",
    actions: ["view", "update", "export"],
  },
  {
    id: "payroll",
    label: "Payroll",
    category: "HR & Employees",
    actions: ["view", "create", "update", "approve", "export"],
  },
  {
    id: "leaves",
    label: "Leave Management",
    category: "HR & Employees",
    actions: ["view", "create", "update", "approve"],
  },
  {
    id: "employeeRequests",
    label: "Employee Requests",
    category: "HR & Employees",
    actions: ["view", "create", "update", "approve"],
  },
  {
    id: "inventory",
    label: "Inventory",
    category: "Inventory & Manufacturing",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "purchases",
    label: "Purchases",
    category: "Inventory & Manufacturing",
    actions: ["view", "create", "update", "delete", "approve"],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    category: "Inventory & Manufacturing",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "manufacturing",
    label: "Manufacturing Orders",
    category: "Inventory & Manufacturing",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "returns",
    label: "Returns Management",
    category: "Inventory & Manufacturing",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "assets",
    label: "Fixed Assets",
    category: "Assets & Custody",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "custody",
    label: "Employee Custody",
    category: "Assets & Custody",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "platformOrders",
    label: "Platform Orders",
    category: "E-Commerce Platforms",
    actions: ["view", "update", "export"],
  },
  {
    id: "platformCustomers",
    label: "Platform Customers",
    category: "E-Commerce Platforms",
    actions: ["view", "update"],
  },
  {
    id: "marketing",
    label: "Campaigns & Marketing",
    category: "Marketing",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "expenses",
    label: "Expenses",
    category: "Finance & Accounting",
    actions: ["view", "create", "update", "delete", "export"],
  },
  {
    id: "vat",
    label: "VAT & Zakat",
    category: "Finance & Accounting",
    actions: ["view", "create", "update", "export"],
  },
  {
    id: "reports",
    label: "Reports & Analytics",
    category: "Finance & Accounting",
    actions: ["view", "export"],
  },
  {
    id: "templates",
    label: "Message Templates",
    category: "Templates & Communication",
    actions: ["view", "create", "update", "delete"],
  },
  {
    id: "historyLog",
    label: "History Log",
    category: "System Settings",
    actions: ["view", "export"],
  },
  {
    id: "settings",
    label: "System Settings & Permissions",
    category: "System Settings",
    actions: ["view", "update"],
  },
  {
    id: "profile",
    label: "My Profile",
    category: "User",
    actions: ["view", "update"],
  },
];

export const ACCESS_AREA_MAP: Record<PageId, AccessArea> = ACCESS_AREAS.reduce(
  (acc, area) => {
    acc[area.id] = area;
    return acc;
  },
  {} as Record<PageId, AccessArea>,
);

export const DEFAULT_ACCESS_ACTION: AccessAction = "view";


