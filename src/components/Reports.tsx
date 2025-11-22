import { useEffect, useMemo, useState } from "react";
import { FileText, Download, Calendar, TrendingUp, DollarSign, Users, Package, Filter } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { supabase } from "../lib/supabaseClient";
import type { Payments } from "../../supabase/models/payments";
import type { Invoices } from "../../supabase/models/invoices";
import type { Customers } from "../../supabase/models/customers";
import type { Expenses as ExpensesRecord } from "../../supabase/models/expenses";
import type { Inventory as InventoryRecord } from "../../supabase/models/inventory";
import type { Payrolls } from "../../supabase/models/payrolls";
import * as XLSX from "@e965/xlsx";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

interface SalesRow {
  month: string;
  revenue: number;
  invoices: number;
  customers: number;
  avgPerInvoice: number | null;
}

interface ExpenseRow {
  category: string;
  amount: number;
  percentage: number;
}

interface CustomerRow {
  name: string;
  revenue: number;
  invoices: number;
  outstanding: number;
}

interface InventoryRow {
  item: string;
  stock: number;
  reorderPoint: number;
  value: number;
  status: string;
}

export function Reports() {
  // Set default date range to current year
  const currentYear = new Date().getFullYear();
  const [dateFrom, setDateFrom] = useState(`${currentYear}-01-01`);
  const [dateTo, setDateTo] = useState(new Date().toISOString().split('T')[0]);
  const [reportType, setReportType] = useState("all");
  const [filterApplied, setFilterApplied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [salesRows, setSalesRows] = useState<SalesRow[]>(
    MONTH_NAMES.map((month) => ({
      month,
      revenue: 0,
      invoices: 0,
      customers: 0,
      avgPerInvoice: null,
    })),
  );
  const [expensesRows, setExpensesRows] = useState<ExpenseRow[]>([]);
  const [customerRows, setCustomerRows] = useState<CustomerRow[]>([]);
  const [inventoryRows, setInventoryRows] = useState<InventoryRow[]>([]);
  const [totals, setTotals] = useState({
    totalRevenue: 0,
    totalExpenses: 0,
    netProfit: 0,
    profitMargin: 0,
  });

  useEffect(() => {
    const fetchReports = async () => {
      setLoading(true);
      setFetchError(null);

      // Parse date range
      const fromDate = new Date(dateFrom);
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999); // Include the entire end date
      
      // Validate dates
      if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        setFetchError("Invalid date range selected");
        setLoading(false);
        return;
      }

      // Build date filters for Supabase queries
      const fromDateStr = fromDate.toISOString().split('T')[0];
      const toDateStr = toDate.toISOString().split('T')[0];

      try {
        // Fetch payments - we'll filter by date in code since we need to check both payment_date and created_at
        const [paymentsRes, invoicesRes, customersRes, expensesRes, inventoryRes, payrollsRes] = await Promise.all([
          supabase.from("payments").select("paid_amount,payment_date,created_at,invoice_id"),
          supabase
            .from("invoices")
            .select("invoice_id,invoice_date,total_amount,customer_id,remaining_amount")
            .gte("invoice_date", fromDateStr).lte("invoice_date", toDateStr),
          supabase.from("customers").select("customer_id,customer_name"),
          supabase
            .from("expenses")
            .select("category,total_amount,base_amount,tax_amount,paid_amount,expense_date")
            .gte("expense_date", fromDateStr).lte("expense_date", toDateStr),
          supabase
            .from("inventory")
            .select("product_code,ar_prod_name,en_prod_name,current_stock,minimum_stock_alert,prod_cost_price,prod_status"),
          supabase.from("payrolls").select("payroll_id,total_amount,payroll_year,payroll_month,payroll_date")
            .gte("payroll_date", fromDateStr).lte("payroll_date", toDateStr),
        ]);

        const errors = [
          paymentsRes.error,
          invoicesRes.error,
          customersRes.error,
          expensesRes.error,
          inventoryRes.error,
          payrollsRes.error,
        ].filter(
          Boolean,
        );

        if (errors.length > 0) {
          throw errors[0];
        }

        const payments = (paymentsRes.data ?? []) as Partial<Payments>[];
        const invoices = (invoicesRes.data ?? []) as Partial<Invoices>[];
        const customers = (customersRes.data ?? []) as Partial<Customers>[];
        const expenses = (expensesRes.data ?? []) as Partial<ExpensesRecord>[];
        const inventory = (inventoryRes.data ?? []) as Partial<InventoryRecord>[];
        const payrolls = (payrollsRes.data ?? []) as Partial<Payrolls>[];

        const customerById = new Map<string, Partial<Customers>>();
        customers.forEach((customer) => {
          if (customer.customer_id) {
            customerById.set(customer.customer_id, customer);
          }
        });

        const invoicesById = new Map<string, Partial<Invoices>>();
        invoices.forEach((invoice) => {
          if (invoice.invoice_id) {
            invoicesById.set(invoice.invoice_id, invoice);
          }
        });

        const monthlyBuckets = MONTH_NAMES.map(() => ({
          revenue: 0,
          invoices: 0,
          customers: new Set<string>(),
        }));

        const revenueByCustomer = new Map<string, number>();
        const outstandingByCustomer = new Map<string, number>();

        // Filter invoices by date range
        invoices.forEach((invoice) => {
          if (!invoice.invoice_date) return;
          const invoiceDate = new Date(invoice.invoice_date);
          // Check if invoice date is within range
          if (invoiceDate < fromDate || invoiceDate > toDate) return;
          
          const monthIndex = invoiceDate.getMonth();
          const bucket = monthlyBuckets[monthIndex];
          bucket.invoices += 1;
          if (invoice.customer_id) {
            bucket.customers.add(invoice.customer_id);
            const currentOutstanding = outstandingByCustomer.get(invoice.customer_id) ?? 0;
            const remaining = Number(invoice.remaining_amount ?? 0);
            outstandingByCustomer.set(invoice.customer_id, currentOutstanding + Math.max(remaining, 0));
          }
        });

        let totalRevenue = 0;

        // Filter payments by date range
        payments.forEach((payment) => {
          const rawAmount = Number(payment.paid_amount ?? 0);
          if (!Number.isFinite(rawAmount) || rawAmount <= 0) return;

          const paymentDateCandidate = payment.payment_date ?? payment.created_at;
          if (!paymentDateCandidate) return;
          const paymentDate = new Date(paymentDateCandidate);
          // Check if payment date is within range
          if (paymentDate < fromDate || paymentDate > toDate) return;

          const monthIndex = paymentDate.getMonth();
          const bucket = monthlyBuckets[monthIndex];
          bucket.revenue += rawAmount;
          totalRevenue += rawAmount;

          if (payment.invoice_id) {
            const invoice = invoicesById.get(payment.invoice_id);
            const customerId = invoice?.customer_id;
            if (customerId) {
              const currentRevenue = revenueByCustomer.get(customerId) ?? 0;
              revenueByCustomer.set(customerId, currentRevenue + rawAmount);
            }
          }
        });

        // Only include months that are within the date range
        const computedSalesRows: SalesRow[] = MONTH_NAMES.map((month, index) => {
          const bucket = monthlyBuckets[index];
          const invoicesCount = bucket.invoices;
          const revenue = bucket.revenue;
          const customersCount = bucket.customers.size;
          
          // Check if this month is within the date range
          const monthStart = new Date(fromDate.getFullYear(), index, 1);
          const monthEnd = new Date(fromDate.getFullYear(), index + 1, 0, 23, 59, 59, 999);
          const isInRange = monthStart <= toDate && monthEnd >= fromDate;
          
          return {
            month,
            revenue: isInRange ? revenue : 0,
            invoices: isInRange ? invoicesCount : 0,
            customers: isInRange ? customersCount : 0,
            avgPerInvoice: isInRange && invoicesCount > 0 ? revenue / invoicesCount : null,
          };
        }).filter((_, index) => {
          // Filter out months that are completely outside the range
          const monthStart = new Date(fromDate.getFullYear(), index, 1);
          const monthEnd = new Date(fromDate.getFullYear(), index + 1, 0, 23, 59, 59, 999);
          return monthStart <= toDate && monthEnd >= fromDate;
        });

        const expenseTotals = new Map<string, number>();
        // Expenses are already filtered by date range in the query, but double-check
        expenses.forEach((expenseRecord) => {
          // Additional date check for safety
          if (expenseRecord.expense_date) {
            const expenseDate = new Date(expenseRecord.expense_date);
            if (expenseDate < fromDate || expenseDate > toDate) return;
          }
          
          const category = (expenseRecord.category ?? "Uncategorized").trim() || "Uncategorized";
          const amount =
            Number(expenseRecord.total_amount ?? 0) ||
            Number(expenseRecord.paid_amount ?? 0) ||
            Number(expenseRecord.base_amount ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) return;
          const current = expenseTotals.get(category) ?? 0;
          expenseTotals.set(category, current + amount);
        });

        let payrollTotal = 0;
        // Payrolls are already filtered by date range in the query, but double-check
        payrolls.forEach((payroll) => {
          const amount = Number(payroll.total_amount ?? 0);
          if (!Number.isFinite(amount) || amount <= 0) return;
          
          // Additional date check for safety
          if (payroll.payroll_date) {
            const payrollDate = new Date(payroll.payroll_date);
            if (payrollDate < fromDate || payrollDate > toDate) return;
          }
          
          payrollTotal += amount;
        });
        if (payrollTotal > 0) {
          const category = "Salaries";
          const current = expenseTotals.get(category) ?? 0;
          expenseTotals.set(category, current + payrollTotal);
        }

        const totalExpenses = Array.from(expenseTotals.values()).reduce((sum, amount) => sum + amount, 0);
        const computedExpensesRows: ExpenseRow[] = Array.from(expenseTotals.entries()).map(([category, amount]) => ({
          category,
          amount,
          percentage: totalExpenses > 0 ? Math.round((amount / totalExpenses) * 100) : 0,
        }));

        // Filter invoices by date range for customer report
        const filteredInvoicesForCustomers = invoices.filter((invoice) => {
          if (!invoice.invoice_date) return false;
          const invoiceDate = new Date(invoice.invoice_date);
          return invoiceDate >= fromDate && invoiceDate <= toDate;
        });
        
        const computedCustomerRows: CustomerRow[] = Array.from(revenueByCustomer.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([customerId, revenueAmount]) => {
            const customer = customerById.get(customerId);
            const name = customer?.customer_name ?? "Unknown Customer";
            const outstanding = outstandingByCustomer.get(customerId) ?? 0;
            const invoicesCount = filteredInvoicesForCustomers.filter((invoice) => invoice.customer_id === customerId).length;
            return {
              name,
              revenue: revenueAmount,
              invoices: invoicesCount,
              outstanding,
            };
          });

        const computedInventoryRows: InventoryRow[] = inventory.map((item) => {
          const stock = Number(item.current_stock ?? 0);
          const reorderPoint = Number(item.minimum_stock_alert ?? 0);
          const costPrice = Number(item.prod_cost_price ?? 0);
          const value = stock * costPrice;
          let status = item.prod_status ?? "";
          if (!status) {
            if (stock <= 0) {
              status = "Out of Stock";
            } else if (reorderPoint > 0 && stock <= reorderPoint) {
              status = "Low";
            } else {
              status = "Good";
            }
          }
          const name = item.en_prod_name ?? item.ar_prod_name ?? item.product_code ?? "Unnamed Item";
          return {
            item: name,
            stock,
            reorderPoint,
            value,
            status,
          };
        });

        setSalesRows(computedSalesRows);
        setExpensesRows(computedExpensesRows.sort((a, b) => b.amount - a.amount));
        setCustomerRows(computedCustomerRows);
        setInventoryRows(computedInventoryRows);

        const netProfit = totalRevenue - totalExpenses;
        const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        setTotals({
          totalRevenue,
          totalExpenses,
          netProfit,
          profitMargin,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to load report data. Please try again shortly.";
        setFetchError(message);
      } finally {
        setLoading(false);
      }
    };

    void fetchReports();
  }, [dateFrom, dateTo, filterApplied]);

  const filteredSalesData = useMemo(() => {
    // Sales rows are already filtered by date range in fetchReports
    // This just ensures we return the correct data based on filterApplied state
    if (!filterApplied) {
      // If filter not applied, show all data (but still respect date range from initial load)
      return salesRows;
    }
    // If filter applied, return the already filtered sales rows
    return salesRows;
  }, [filterApplied, salesRows]);

  const totalRevenue = useMemo(
    () => filteredSalesData.reduce((sum, row) => sum + row.revenue, 0),
    [filteredSalesData],
  );

  const totalInvoices = useMemo(
    () => filteredSalesData.reduce((sum, row) => sum + row.invoices, 0),
    [filteredSalesData],
  );

  const totalExpensesAmount = useMemo(
    () => expensesRows.reduce((sum, row) => sum + row.amount, 0),
    [expensesRows],
  );

  const netProfit = useMemo(() => totalRevenue - totalExpensesAmount, [totalRevenue, totalExpensesAmount]);
  const profitMargin = useMemo(
    () => (totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0),
    [netProfit, totalRevenue],
  );

  const applyFilters = () => {
    // Validate date range
    const from = new Date(dateFrom);
    const to = new Date(dateTo);
    
    if (isNaN(from.getTime()) || isNaN(to.getTime())) {
      toast.error("Please select valid dates");
      return;
    }
    
    if (from > to) {
      toast.error("From date cannot be after To date");
      return;
    }
    
    setFilterApplied(true);
    toast.success("Filters applied successfully!");
    // fetchReports will be triggered by useEffect when filterApplied changes
  };

  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  const sortedSalesData = useMemo(() => {
    if (!sortField) return filteredSalesData;
    const sorted = [...filteredSalesData];
    sorted.sort((a, b) => {
      let aVal: any = a[sortField as keyof SalesRow];
      let bVal: any = b[sortField as keyof SalesRow];
      if (sortField === "month") {
        const monthOrder = MONTH_NAMES.indexOf(aVal) - MONTH_NAMES.indexOf(bVal);
        return sortDirection === "asc" ? monthOrder : -monthOrder;
      }
      if (typeof aVal === "number" && typeof bVal === "number") {
        return sortDirection === "asc" ? aVal - bVal : bVal - aVal;
      }
      return sortDirection === "asc" 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return sorted;
  }, [filteredSalesData, sortField, sortDirection]);

  const exportToExcel = (data: any[], filename: string, sheetName: string) => {
    try {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
      XLSX.writeFile(wb, `${filename}_${new Date().toISOString().split("T")[0]}.xlsx`);
      toast.success(`${filename} exported successfully!`);
    } catch (error) {
      toast.error("Failed to export report");
    }
  };

  const generatePDF = (reportName: string, reportData?: any) => {
    if (reportData) {
      exportToExcel(reportData.data, reportName, reportData.sheetName);
    } else {
      toast.info("Preparing report for download...");
    }
  };

  const formatCurrency = (value: number, fractionDigits = 0) =>
    `${value.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })} ر.س`;

  const formatCurrencyOrDash = (value: number, fractionDigits = 0) =>
    value > 0 ? formatCurrency(value, fractionDigits) : "—";

  const formatNumberOrDash = (value: number) => (value > 0 ? value.toLocaleString() : "—");

  const formatAverageOrDash = (value: number | null) =>
    value && value > 0
      ? `${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ر.س`
      : "—";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Reports & Analytics</h2>
          <p className="text-muted-foreground mt-1">Generate and view comprehensive business reports</p>
        </div>
      </div>

      {fetchError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {fetchError}
        </div>
      )}
      {loading && (
        <div className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-primary">
          Loading the latest report data...
        </div>
      )}

      {/* Date Range Filter */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Report Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div className="space-y-2 flex-1">
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
            <div className="space-y-2 flex-1">
              <Label htmlFor="reportType">Report Type</Label>
              <Select value={reportType} onValueChange={setReportType}>
                <SelectTrigger id="reportType">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reports</SelectItem>
                  <SelectItem value="sales">Sales Only</SelectItem>
                  <SelectItem value="expenses">Expenses Only</SelectItem>
                  <SelectItem value="inventory">Inventory Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="gap-2" onClick={applyFilters}>
              <Filter className="h-4 w-4" />
              Apply Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Key Metrics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)}</div>
            <p className="text-xs text-muted-foreground mt-1">Year to date</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <TrendingUp className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalExpensesAmount)}</div>
            <p className="text-xs text-muted-foreground mt-1">All categories</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{formatCurrency(netProfit)}</div>
            <p className="text-xs text-muted-foreground mt-1">{profitMargin.toFixed(1)}% margin</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{customerRows.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Top performers</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="sales" className="space-y-4">
        <TabsList>
          <TabsTrigger value="sales">Sales Report</TabsTrigger>
          <TabsTrigger value="expenses">Expenses Report</TabsTrigger>
          <TabsTrigger value="customers">Customer Report</TabsTrigger>
          <TabsTrigger value="inventory">Inventory Report</TabsTrigger>
          <TabsTrigger value="profitloss">Profit & Loss</TabsTrigger>
        </TabsList>

        <TabsContent value="sales" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Monthly Sales Report</CardTitle>
                  <CardDescription>Sales performance by month</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    const exportData = sortedSalesData.map((row) => ({
                      Month: row.month,
                      Revenue: row.revenue,
                      Invoices: row.invoices,
                      Customers: row.customers,
                      "Avg per Invoice": row.avgPerInvoice ?? 0,
                    }));
                    generatePDF("Sales_Report", { data: exportData, sheetName: "Sales" });
                  }}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead 
                        className="cursor-pointer hover:bg-muted"
                        onClick={() => handleSort("month")}
                      >
                        Month {sortField === "month" && (sortDirection === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer hover:bg-muted"
                        onClick={() => handleSort("revenue")}
                      >
                        Revenue {sortField === "revenue" && (sortDirection === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer hover:bg-muted"
                        onClick={() => handleSort("invoices")}
                      >
                        Invoices {sortField === "invoices" && (sortDirection === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer hover:bg-muted"
                        onClick={() => handleSort("customers")}
                      >
                        Customers {sortField === "customers" && (sortDirection === "asc" ? "↑" : "↓")}
                      </TableHead>
                      <TableHead 
                        className="text-right cursor-pointer hover:bg-muted"
                        onClick={() => handleSort("avgPerInvoice")}
                      >
                        Avg per Invoice {sortField === "avgPerInvoice" && (sortDirection === "asc" ? "↑" : "↓")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedSalesData.map((row) => (
                      <TableRow key={row.month}>
                        <TableCell className="font-medium">{row.month}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatCurrencyOrDash(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{formatNumberOrDash(row.invoices)}</TableCell>
                        <TableCell className="text-right">{formatNumberOrDash(row.customers)}</TableCell>
                        <TableCell className="text-right">{formatAverageOrDash(row.avgPerInvoice)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrencyOrDash(totalRevenue)}
                      </TableCell>
                      <TableCell className="text-right">{formatNumberOrDash(totalInvoices)}</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">
                        {formatAverageOrDash(totalInvoices > 0 ? totalRevenue / totalInvoices : null)}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="expenses" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Expenses Breakdown</CardTitle>
                  <CardDescription>Expenses by category</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    const exportData = expensesRows.map((row) => ({
                      Category: row.category,
                      Amount: row.amount,
                      Percentage: `${row.percentage}%`,
                    }));
                    generatePDF("Expenses_Report", { data: exportData, sheetName: "Expenses" });
                  }}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Percentage</TableHead>
                      <TableHead>Distribution</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {expensesRows.map((row) => (
                      <TableRow key={row.category}>
                        <TableCell className="font-medium">{row.category}</TableCell>
                        <TableCell className="text-right font-semibold text-red-600">
                          {formatCurrencyOrDash(row.amount)}
                        </TableCell>
                        <TableCell className="text-right">{row.percentage}%</TableCell>
                        <TableCell>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-red-600 h-2 rounded-full"
                              style={{ width: `${row.percentage}%` }}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right text-red-600">
                        {formatCurrencyOrDash(totalExpensesAmount)}
                      </TableCell>
                      <TableCell className="text-right">100%</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="customers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Top Customers Report</CardTitle>
                  <CardDescription>Best performing customers</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    const exportData = customerRows.map((row) => ({
                      "Customer Name": row.name,
                      "Total Revenue": row.revenue,
                      Invoices: row.invoices,
                      Outstanding: row.outstanding,
                      "Avg per Invoice": row.invoices > 0 ? row.revenue / row.invoices : 0,
                    }));
                    generatePDF("Customer_Report", { data: exportData, sheetName: "Customers" });
                  }}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer Name</TableHead>
                      <TableHead className="text-right">Total Revenue</TableHead>
                      <TableHead className="text-right">Invoices</TableHead>
                      <TableHead className="text-right">Outstanding</TableHead>
                      <TableHead className="text-right">Avg per Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {customerRows.map((row) => (
                      <TableRow key={row.name}>
                        <TableCell className="font-medium">{row.name}</TableCell>
                        <TableCell className="text-right font-semibold text-green-600">
                          {formatCurrencyOrDash(row.revenue)}
                        </TableCell>
                        <TableCell className="text-right">{formatNumberOrDash(row.invoices)}</TableCell>
                        <TableCell className="text-right">
                          <span className={row.outstanding > 0 ? "text-yellow-600" : "text-green-600"}>
                            {formatCurrencyOrDash(row.outstanding)}
                          </span>
                        </TableCell>
                        <TableCell className="text-right">
                          {formatAverageOrDash(row.invoices > 0 ? row.revenue / row.invoices : null)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>Total</TableCell>
                      <TableCell className="text-right text-green-600">
                        {formatCurrencyOrDash(customerRows.reduce((sum, row) => sum + row.revenue, 0))}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatNumberOrDash(customerRows.reduce((sum, row) => sum + row.invoices, 0))}
                      </TableCell>
                      <TableCell className="text-right text-yellow-600">
                        {formatCurrencyOrDash(customerRows.reduce((sum, row) => sum + row.outstanding, 0))}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Inventory Status Report</CardTitle>
                  <CardDescription>Current stock levels and values</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    const exportData = inventoryRows.map((row) => ({
                      "Item Name": row.item,
                      "Current Stock": row.stock,
                      "Reorder Point": row.reorderPoint,
                      "Stock Value": row.value,
                      Status: row.status,
                    }));
                    generatePDF("Inventory_Report", { data: exportData, sheetName: "Inventory" });
                  }}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Item Name</TableHead>
                      <TableHead className="text-right">Current Stock</TableHead>
                      <TableHead className="text-right">Reorder Point</TableHead>
                      <TableHead className="text-right">Stock Value</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inventoryRows.map((row) => (
                      <TableRow key={row.item}>
                        <TableCell className="font-medium">{row.item}</TableCell>
                        <TableCell className="text-right">{formatNumberOrDash(row.stock)}</TableCell>
                        <TableCell className="text-right">{formatNumberOrDash(row.reorderPoint)}</TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatCurrencyOrDash(row.value)}
                        </TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-1 text-xs rounded-full ${
                              row.status.toLowerCase().includes("good")
                                ? "bg-green-100 text-green-700"
                                : row.status.toLowerCase().includes("low")
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {row.status}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/50 font-bold">
                      <TableCell>Total Value</TableCell>
                      <TableCell></TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right text-blue-600">
                        {formatCurrencyOrDash(inventoryRows.reduce((sum, row) => sum + row.value, 0))}
                      </TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profitloss" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Profit & Loss Statement</CardTitle>
                  <CardDescription>Comprehensive financial overview</CardDescription>
                </div>
                <Button
                  onClick={() => {
                    const exportData = [
                      { Category: "REVENUE", Item: "Sales Revenue", Amount: totals.totalRevenue * 0.85 },
                      { Category: "REVENUE", Item: "Service Revenue", Amount: totals.totalRevenue * 0.15 },
                      { Category: "REVENUE", Item: "Total Revenue", Amount: totals.totalRevenue },
                      { Category: "", Item: "", Amount: "" },
                      ...expensesRows.map((exp) => ({ Category: "EXPENSES", Item: exp.category, Amount: exp.amount })),
                      { Category: "EXPENSES", Item: "Total Expenses", Amount: totals.totalExpenses },
                      { Category: "", Item: "", Amount: "" },
                      { Category: "PROFIT", Item: "Net Profit", Amount: totals.netProfit },
                      { Category: "PROFIT", Item: "Profit Margin", Amount: `${totals.profitMargin.toFixed(1)}%` },
                    ];
                    generatePDF("Profit_Loss_Statement", { data: exportData, sheetName: "P&L" });
                  }}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Revenue</h3>
                  <div className="flex justify-between text-sm">
                    <span>Sales Revenue</span>
                    <span className="font-medium">{formatCurrency(totals.totalRevenue * 0.85)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span>Service Revenue</span>
                    <span className="font-medium">{formatCurrency(totals.totalRevenue * 0.15)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-green-600 pt-2 border-t">
                    <span>Total Revenue</span>
                    <span>{formatCurrency(totals.totalRevenue)}</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="font-semibold text-lg border-b pb-2">Expenses</h3>
                  {expensesRows.map((expense) => (
                    <div key={expense.category} className="flex justify-between text-sm">
                      <span>{expense.category}</span>
                      <span className="font-medium">{formatCurrency(expense.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between font-bold text-red-600 pt-2 border-t">
                    <span>Total Expenses</span>
                    <span>{formatCurrency(totals.totalExpenses)}</span>
                  </div>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-purple-50 p-6 rounded-lg border-2 border-blue-200">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="text-sm text-muted-foreground mb-1">Net Profit</div>
                      <div className="text-3xl font-bold text-blue-600">
                        {formatCurrency(totals.netProfit)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-muted-foreground mb-1">Profit Margin</div>
                      <div className="text-3xl font-bold text-purple-600">
                        {totals.profitMargin.toFixed(1)}%
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Quick Export Options</CardTitle>
          <CardDescription>Generate and download reports quickly</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <Button
              variant="outline"
              onClick={() => {
                const completeData = [
                  ...filteredSalesData.map((row) => ({
                    Type: "Sales",
                    Month: row.month,
                    Amount: row.revenue,
                    Details: `${row.invoices} invoices`,
                  })),
                  ...expensesRows.map((row) => ({
                    Type: "Expense",
                    Category: row.category,
                    Amount: row.amount,
                    Percentage: `${row.percentage}%`,
                  })),
                ];
                generatePDF("Complete_Financial_Report", { data: completeData, sheetName: "Financial" });
              }}
              className="gap-2 justify-start"
            >
              <FileText className="h-4 w-4" />
              Complete Financial Report
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const monthlySummary = filteredSalesData.map((row) => ({
                  Month: row.month,
                  Revenue: row.revenue,
                  Customers: row.customers,
                }));
                generatePDF("Monthly_Summary", { data: monthlySummary, sheetName: "Monthly" });
              }}
              className="gap-2 justify-start"
            >
              <Calendar className="h-4 w-4" />
              Monthly Summary
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const annualData = [
                  {
                    "Total Revenue": totals.totalRevenue,
                    "Total Expenses": totals.totalExpenses,
                    "Net Profit": totals.netProfit,
                    "Profit Margin": `${totals.profitMargin.toFixed(1)}%`,
                  },
                ];
                generatePDF("Annual_Report", { data: annualData, sheetName: "Annual" });
              }}
              className="gap-2 justify-start"
            >
              <TrendingUp className="h-4 w-4" />
              Annual Report
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const taxData = [
                  {
                    "Total Revenue": totals.totalRevenue,
                    "VAT 15%": totals.totalRevenue * 0.15,
                    "Net Revenue": totals.totalRevenue * 0.85,
                  },
                ];
                generatePDF("Tax_Report", { data: taxData, sheetName: "Tax" });
              }}
              className="gap-2 justify-start"
            >
              <DollarSign className="h-4 w-4" />
              Tax Report
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const customerAnalysis = customerRows.map((row) => ({
                  Customer: row.name,
                  Revenue: row.revenue,
                  Invoices: row.invoices,
                  Outstanding: row.outstanding,
                }));
                generatePDF("Customer_Analysis", { data: customerAnalysis, sheetName: "Customers" });
              }}
              className="gap-2 justify-start"
            >
              <Users className="h-4 w-4" />
              Customer Analysis
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const inventoryValuation = inventoryRows.map((row) => ({
                  Item: row.item,
                  Stock: row.stock,
                  Value: row.value,
                  Status: row.status,
                }));
                generatePDF("Inventory_Valuation", { data: inventoryValuation, sheetName: "Inventory" });
              }}
              className="gap-2 justify-start"
            >
              <Package className="h-4 w-4" />
              Inventory Valuation
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


