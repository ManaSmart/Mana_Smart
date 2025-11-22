import { useEffect, useMemo, useState, useCallback } from "react";
import { Search, Calendar, FileText, DollarSign, Users, Clock, RefreshCcw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Input } from "./ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { supabase } from "../lib/supabaseClient";
import { toast } from "sonner";

type ModuleKey =
  | "customers"
  | "contracts"
  | "invoices"
  | "payments"
  | "monthly_visits"
  | "employees"
  | "payrolls"
  | "leads"
  | "platform_orders";

interface ActivityEntry {
  id: string;
  module: ModuleKey;
  action: string;
  entity: string;
  entityId: string;
  details: string;
  timestamp: string;
  user: string;
}

const MODULE_LABELS: Record<ModuleKey, string> = {
  customers: "Customers",
  contracts: "Contracts",
  invoices: "Invoices",
  payments: "Payments",
  monthly_visits: "Monthly Visits",
  employees: "Employees",
  payrolls: "Payroll",
  leads: "Leads",
  platform_orders: "Platform Orders",
};

const MODULE_OPTIONS = ["All Modules", ...Object.values(MODULE_LABELS)];

const ACTION_OPTIONS = [
  "All Actions",
  "Created",
  "Updated",
  "Completed",
  "Converted",
  "Paid",
  "Recorded",
  "Assigned",
];

const formatDateLabel = (timestamp: string) => {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;

  return date.toLocaleString("en-SA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatCurrency = (value: number | null | undefined) => {
  if (!value || Number.isNaN(value)) return "—";
  return `${value.toLocaleString()} ر.س`;
};

const getModuleIcon = (module: string) => {
  switch (module) {
    case "Customers":
    case "Employees":
    case "Leads":
      return <Users className="h-4 w-4" />;
    case "Contracts":
    case "Platform Orders":
      return <FileText className="h-4 w-4" />;
    case "Invoices":
    case "Payments":
    case "Payroll":
      return <DollarSign className="h-4 w-4" />;
    default:
      return <FileText className="h-4 w-4" />;
  }
};

const getActionBadgeClass = (action: string) => {
  switch (action) {
    case "Created":
      return "bg-green-100 text-green-700 border-green-200";
    case "Updated":
      return "bg-blue-100 text-blue-700 border-blue-200";
    case "Completed":
    case "Paid":
      return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "Assigned":
    case "Converted":
      return "bg-purple-100 text-purple-700 border-purple-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const normalizeString = (value: string | null | undefined, fallback: string) =>
  (value ?? fallback).trim() || fallback;

export function HistoryLog() {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [moduleFilter, setModuleFilter] = useState<string>("All Modules");
  const [actionFilter, setActionFilter] = useState<string>("All Actions");
  const [dateFilter, setDateFilter] = useState<string>("all");

  const fetchHistory = useCallback(async () => {
      setLoading(true);
      setError(null);

      try {
        // First, fetch all system users to create a lookup map
        const { data: systemUsers, error: usersError } = await supabase
          .from("system_users")
          .select("user_id, full_name, email")
          .order("full_name", { ascending: true });

        if (usersError) {
          console.error("Error fetching users:", usersError);
        }

        // Create a user lookup map
        const userMap = new Map<string, string>();
        (systemUsers || []).forEach((user: any) => {
          if (user.user_id) {
            userMap.set(user.user_id, user.full_name || user.email || "Unknown User");
          }
        });

        // Helper function to get user name
        const getUserName = (userId: string | null | undefined): string => {
          if (!userId) return "System";
          return userMap.get(userId) || "Unknown User";
        };

        const [
          customersRes,
          contractsRes,
          invoicesRes,
          paymentsRes,
          leadsRes,
          visitsRes,
          employeesRes,
          payrollsRes,
          platformOrdersRes,
        ] = await Promise.all([
          supabase
            .from("customers")
            .select("customer_id, customer_name, created_at, updated_at, created_by, updated_by")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("contracts")
            .select("contract_id, contract_number, contract_status, created_at, updated_at, created_by, updated_by")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("invoices")
            .select("invoice_id, customer_id, total_amount, payment_status, created_at, updated_at, created_by, updated_by")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("payments")
            .select("payment_id, paid_amount, payment_method, invoice_id, created_at, created_by")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("leads")
            .select("lead_id, company_name, status, created_at, updated_at, created_by, updated_by")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("monthly_visits")
            .select("visit_id, status, created_at, updated_at, visit_date, created_by, updated_by")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("employees")
            .select("employee_id, name_en, position, created_at, updated_at, created_by, updated_by")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("payrolls")
            .select("payroll_id, payroll_month, payroll_year, status, total_amount, created_at, updated_at, created_by, updated_by")
            .order("created_at", { ascending: false })
            .limit(200),
          supabase
            .from("platform_orders")
            .select("order_id, order_platform_reference, order_status, order_created_date, order_last_modified")
            .order("order_created_date", { ascending: false })
            .limit(200),
        ]);

        const errors = [
          customersRes.error,
          contractsRes.error,
          invoicesRes.error,
          paymentsRes.error,
          leadsRes.error,
          visitsRes.error,
          employeesRes.error,
          payrollsRes.error,
          platformOrdersRes.error,
        ].filter(Boolean);

        if (errors.length > 0) {
          throw errors[0];
        }

        const allEntries: ActivityEntry[] = [];

        (customersRes.data ?? []).forEach((row: any) => {
          if (!row.customer_id || !row.created_at) return;
          allEntries.push({
            id: `customer-${row.customer_id}-created`,
            module: "customers",
            action: "Created",
            entity: "Customer",
            entityId: row.customer_id,
            details: `Customer "${normalizeString(row.customer_name, "Unnamed Customer")}" added`,
            timestamp: row.created_at,
            user: getUserName(row.created_by),
          });

          if (row.updated_at && row.updated_at !== row.created_at) {
            allEntries.push({
              id: `customer-${row.customer_id}-updated`,
              module: "customers",
              action: "Updated",
              entity: "Customer",
              entityId: row.customer_id,
              details: `Customer "${normalizeString(row.customer_name, "Unnamed Customer")}" updated`,
              timestamp: row.updated_at,
              user: getUserName(row.updated_by ?? row.created_by),
            });
          }
        });

        (contractsRes.data ?? []).forEach((row: any) => {
          if (!row.contract_id || !row.created_at) return;
          allEntries.push({
            id: `contract-${row.contract_id}-created`,
            module: "contracts",
            action: "Created",
            entity: "Contract",
            entityId: row.contract_number ?? row.contract_id,
            details: `Contract created with status ${normalizeString(row.contract_status, "Unknown")}`,
            timestamp: row.created_at,
            user: getUserName(row.created_by),
          });
          if (row.updated_at && row.updated_at !== row.created_at) {
            allEntries.push({
              id: `contract-${row.contract_id}-updated`,
              module: "contracts",
              action: "Updated",
              entity: "Contract",
              entityId: row.contract_number ?? row.contract_id,
              details: `Contract status updated to ${normalizeString(row.contract_status, "Unknown")}`,
              timestamp: row.updated_at,
              user: getUserName(row.updated_by ?? row.created_by),
            });
          }
        });

        (invoicesRes.data ?? []).forEach((row: any) => {
          if (!row.invoice_id || !row.created_at) return;
          allEntries.push({
            id: `invoice-${row.invoice_id}-created`,
            module: "invoices",
            action: "Created",
            entity: "Invoice",
            entityId: row.invoice_id,
            details: `Invoice issued for ${formatCurrency(row.total_amount)}`,
            timestamp: row.created_at,
            user: getUserName(row.created_by),
          });
          if (row.updated_at && row.updated_at !== row.created_at) {
            allEntries.push({
              id: `invoice-${row.invoice_id}-updated`,
              module: "invoices",
              action: normalizeString(row.payment_status, "Updated"),
              entity: "Invoice",
              entityId: row.invoice_id,
              details: `Invoice status set to ${normalizeString(row.payment_status, "Updated")}`,
              timestamp: row.updated_at,
              user: getUserName(row.updated_by ?? row.created_by),
            });
          }
        });

        (paymentsRes.data ?? []).forEach((row: any) => {
          if (!row.payment_id || !row.created_at) return;
          allEntries.push({
            id: `payment-${row.payment_id}`,
            module: "payments",
            action: "Recorded",
            entity: "Payment",
            entityId: row.payment_id,
            details: `Payment ${formatCurrency(row.paid_amount)} via ${normalizeString(row.payment_method, "N/A")}`,
            timestamp: row.created_at,
            user: getUserName(row.created_by),
          });
        });

        (leadsRes.data ?? []).forEach((row: any) => {
          if (!row.lead_id || !row.created_at) return;
          allEntries.push({
            id: `lead-${row.lead_id}-created`,
            module: "leads",
            action: "Created",
            entity: "Lead",
            entityId: row.lead_id,
            details: `Lead "${normalizeString(row.company_name, "Unnamed Lead")}" added`,
            timestamp: row.created_at,
            user: getUserName(row.created_by),
          });
          if (row.updated_at && row.updated_at !== row.created_at) {
            allEntries.push({
              id: `lead-${row.lead_id}-updated`,
              module: "leads",
              action: row.status?.toLowerCase().includes("convert") ? "Converted" : "Updated",
              entity: "Lead",
              entityId: row.lead_id,
              details: `Lead status changed to ${normalizeString(row.status, "Updated")}`,
              timestamp: row.updated_at,
              user: getUserName(row.updated_by ?? row.created_by),
            });
          }
        });

        (visitsRes.data ?? []).forEach((row: any) => {
          if (!row.visit_id || !row.created_at) return;
          allEntries.push({
            id: `visit-${row.visit_id}-created`,
            module: "monthly_visits",
            action: "Created",
            entity: "Visit",
            entityId: row.visit_id,
            details: `Visit scheduled for ${row.visit_date ?? "unspecified date"}`,
            timestamp: row.created_at,
            user: getUserName(row.created_by),
          });
          if (row.updated_at && row.updated_at !== row.created_at) {
            allEntries.push({
              id: `visit-${row.visit_id}-updated`,
              module: "monthly_visits",
              action: "Completed",
              entity: "Visit",
              entityId: row.visit_id,
              details: `Visit status updated to ${normalizeString(row.status, "updated")}`,
              timestamp: row.updated_at,
              user: getUserName(row.updated_by ?? row.created_by),
            });
          }
        });

        (employeesRes.data ?? []).forEach((row: any) => {
          if (!row.employee_id || !row.created_at) return;
          allEntries.push({
            id: `employee-${row.employee_id}-created`,
            module: "employees",
            action: "Created",
            entity: "Employee",
            entityId: row.employee_id,
            details: `Employee "${normalizeString(row.name_en, "New Employee")}" onboarded`,
            timestamp: row.created_at,
            user: getUserName(row.created_by),
          });
          if (row.updated_at && row.updated_at !== row.created_at) {
            allEntries.push({
              id: `employee-${row.employee_id}-updated`,
              module: "employees",
              action: "Updated",
              entity: "Employee",
              entityId: row.employee_id,
              details: `Employee record updated${row.position ? ` (position: ${normalizeString(row.position, "N/A")})` : ""}`,
              timestamp: row.updated_at,
              user: getUserName(row.updated_by ?? row.created_by),
            });
          }
        });

        (payrollsRes.data ?? []).forEach((row: any) => {
          if (!row.payroll_id || !row.created_at) return;
          allEntries.push({
            id: `payroll-${row.payroll_id}`,
            module: "payrolls",
            action: "Generated",
            entity: "Payroll",
            entityId: row.payroll_id,
            details: `Payroll ${row.payroll_month}/${row.payroll_year} generated (${formatCurrency(row.total_amount)})`,
            timestamp: row.created_at,
            user: getUserName(row.created_by),
          });
          // Add update entry if payroll was updated
          if (row.updated_at && row.updated_at !== row.created_at) {
            allEntries.push({
              id: `payroll-${row.payroll_id}-updated`,
              module: "payrolls",
              action: row.status === "paid" ? "Paid" : "Updated",
              entity: "Payroll",
              entityId: row.payroll_id,
              details: `Payroll ${row.payroll_month}/${row.payroll_year} ${row.status === "paid" ? "marked as paid" : "updated"} (${formatCurrency(row.total_amount)})`,
              timestamp: row.updated_at,
              user: getUserName(row.updated_by ?? row.created_by),
            });
          }
        });

        (platformOrdersRes.data ?? []).forEach((row: any) => {
          if (!row.order_id || !row.order_created_date) return;
          const createdAt = new Date(row.order_created_date).toISOString();
          allEntries.push({
            id: `platform-order-${row.order_id}`,
            module: "platform_orders",
            action: "Received",
            entity: "Platform Order",
            entityId: row.order_id,
            details: `Platform order received (status ${normalizeString(row.order_status, "unknown")})`,
            timestamp: createdAt,
            user: "System",
          });
          if (row.order_last_modified) {
            allEntries.push({
              id: `platform-order-${row.order_id}-updated`,
              module: "platform_orders",
              action: "Updated",
              entity: "Platform Order",
              entityId: row.order_id,
              details: `Order status changed to ${normalizeString(row.order_status, "updated")}`,
              timestamp: row.order_last_modified,
              user: "System",
            });
          }
        });

        allEntries.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
        setEntries(allEntries);
      } catch (err) {
        const message =
          err && typeof err === "object" && "message" in err
            ? String((err as { message?: string }).message)
            : "Failed to load history. Please try again.";
        setError(message);
        toast.error(message);
      } finally {
        setLoading(false);
      }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  const filteredEntries = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const moduleLabel = moduleFilter;
    const actionLabel = actionFilter;

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastMonth = new Date(now);
    lastMonth.setMonth(lastMonth.getMonth() - 1);

    return entries.filter((entry) => {
      const matchesSearch =
        query.length === 0 ||
        entry.entity.toLowerCase().includes(query) ||
        entry.entityId.toLowerCase().includes(query) ||
        entry.details.toLowerCase().includes(query) ||
        entry.user.toLowerCase().includes(query);

      const matchesModule =
        moduleLabel === "All Modules" ||
        MODULE_LABELS[entry.module].toLowerCase() === moduleLabel.toLowerCase();

      const matchesAction = actionLabel === "All Actions" || entry.action === actionLabel;

      let matchesDate = true;
      if (dateFilter !== "all") {
        const entryDate = new Date(entry.timestamp);
        if (Number.isNaN(entryDate.getTime())) {
          matchesDate = false;
        } else {
          switch (dateFilter) {
            case "today":
              matchesDate = entryDate.toDateString() === now.toDateString();
              break;
            case "yesterday":
              matchesDate = entryDate.toDateString() === yesterday.toDateString();
              break;
            case "last-7":
              matchesDate = entryDate >= lastWeek;
              break;
            case "last-30":
              matchesDate = entryDate >= lastMonth;
              break;
            default:
              matchesDate = true;
              break;
          }
        }
      }

      return matchesSearch && matchesModule && matchesAction && matchesDate;
    });
  }, [entries, searchQuery, moduleFilter, actionFilter, dateFilter]);

  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const todayCount = entries.filter(
      (entry) => new Date(entry.timestamp).toDateString() === todayStr,
    ).length;

    const thisWeekCount = entries.filter((entry) => new Date(entry.timestamp) >= weekAgo).length;

    return {
      total: entries.length,
      today: todayCount,
      thisWeek: thisWeekCount,
    };
  }, [entries]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">System History Log</h2>
          <p className="text-muted-foreground mt-1">Audit trail of recent system activities</p>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => void fetchHistory()}
          disabled={loading}
        >
          <RefreshCcw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Events</CardTitle>
            <FileText className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-xs text-muted-foreground mt-1">All tracked modules</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today's Activity
            </CardTitle>
            <Clock className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{stats.today}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 24 hours</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Week</CardTitle>
            <Calendar className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.thisWeek}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 7 days</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filter History</CardTitle>
          <CardDescription>Search and filter system activities</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search by entity, ID, user, or details..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Module</label>
              <Select value={moduleFilter} onValueChange={setModuleFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Modules" />
                </SelectTrigger>
                <SelectContent>
                  {MODULE_OPTIONS.map((module) => (
                    <SelectItem key={module} value={module}>
                      {module}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Action</label>
              <Select value={actionFilter} onValueChange={setActionFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Actions" />
                </SelectTrigger>
                <SelectContent>
                  {ACTION_OPTIONS.map((action) => (
                    <SelectItem key={action} value={action}>
                      {action}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Date Range</label>
              <Select value={dateFilter} onValueChange={setDateFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All Time" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="yesterday">Yesterday</SelectItem>
                  <SelectItem value="last-7">Last 7 Days</SelectItem>
                  <SelectItem value="last-30">Last 30 Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log ({filteredEntries.length} entries)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Loading activity history...
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No history entries found for the selected filters.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Module</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Entity</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead className="font-semibold">User</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                            {getModuleIcon(MODULE_LABELS[entry.module])}
                          </span>
                          <div>
                            <div className="font-medium">{MODULE_LABELS[entry.module]}</div>
                            <div className="text-xs text-muted-foreground">{entry.entityId}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${getActionBadgeClass(entry.action)}`}>
                          {entry.action}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.entity}</div>
                        <div className="text-xs text-muted-foreground">{entry.entityId}</div>
                      </TableCell>
                      <TableCell className="text-sm">{entry.details}</TableCell>
                      <TableCell className="text-sm font-medium">
                        <span className={entry.user === "System" ? "text-muted-foreground" : "text-foreground"}>
                          {entry.user}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {formatDateLabel(entry.timestamp)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}


