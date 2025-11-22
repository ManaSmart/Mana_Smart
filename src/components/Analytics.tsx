import { useCallback, useEffect, useMemo, useState } from "react";
import {
  TrendingUp,
  DollarSign,
  Users,
  FileText,
  ShoppingBag,
  Calendar,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Progress } from "./ui/progress";
import { Button } from "./ui/button";
import { supabase } from "../lib/supabaseClient";
import { 
  BarChart, 
  Bar, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
} from "recharts";

import type { Payments } from "../../supabase/models/payments";
import type { Expenses as ExpenseRow } from "../../supabase/models/expenses";
import type { Customers as CustomerRow } from "../../supabase/models/customers";
import type { Invoices as InvoiceRow } from "../../supabase/models/invoices";
import type { Contracts as ContractRow } from "../../supabase/models/contracts";
import type { MonthlyVisits as MonthlyVisitRow } from "../../supabase/models/monthly_visits";
import type { Leads as LeadRow } from "../../supabase/models/leads";
import type { CustomerSupportTickets as TicketRow } from "../../supabase/models/customer_support_tickets";

const numberFormatter = new Intl.NumberFormat("en-SA", { maximumFractionDigits: 0 });

const monthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const safeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

const accumulateByMonth = (container: Map<string, number>, date: Date | null, amount: number) => {
  if (!date || !Number.isFinite(amount)) return;
  const key = monthKey(date);
  container.set(key, (container.get(key) ?? 0) + amount);
};

const clampPercent = (value: number) => {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
};

const computeGrowthPercent = (current: number, previous: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) return 0;
  if (previous === 0) {
    if (current === 0) return 0;
    return 100;
  }
  return ((current - previous) / previous) * 100;
};

const computeGrowthPercentOrNull = (current: number, previous: number) => {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous <= 0) return null;
  return ((current - previous) / previous) * 100;
};

const formatCurrencySar = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "--";
  return `${numberFormatter.format(Math.round(value))} ر.س`;
};

const formatPercentValue = (value: number | null | undefined, fractionDigits = 1) => {
  if (value == null || Number.isNaN(value)) return "--";
  return `${Number(value).toFixed(fractionDigits)}%`;
};

const formatCount = (value: number | null | undefined) => {
  if (value == null || Number.isNaN(value)) return "--";
  return numberFormatter.format(Math.round(value));
};

const formatSignedNumber = (
  value: number | null | undefined,
  {
    fractionDigits = 1,
    suffix = "%",
    fallback = "--",
  }: { fractionDigits?: number; suffix?: string; fallback?: string } = {},
) => {
  if (value == null || Number.isNaN(value)) return fallback;
  const normalized = Number(value.toFixed(fractionDigits));
  const sign = normalized > 0 ? "+" : normalized < 0 ? "-" : "";
  const absolute = Math.abs(normalized).toFixed(fractionDigits);
  return `${sign}${absolute}${suffix}`;
};

const resolvedTicketStatuses = new Set(["resolved", "closed", "completed", "done", "approved"]);

const normalizeInvoiceStatus = (status?: string | null) => {
  const normalized = (status ?? "").toLowerCase();
  if (["paid", "settled", "completed", "closed"].includes(normalized)) return "paid";
  if (["partial", "partially paid", "partial payment"].includes(normalized)) return "partial";
  if (["overdue"].includes(normalized)) return "overdue";
  return "pending";
};

const normalizeVisitStatus = (status?: string | null) => {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled") return "cancelled";
  return "scheduled";
};

interface ValueDelta {
  value: number | null;
  change: number | null;
}

interface AnalyticsSnapshot {
  totalRevenue: number;
  revenueGrowthPercent: number;
  totalExpenses: number;
  expenseGrowthPercent: number;
  netProfit: number;
  profitMarginPercent: number;
  customerStats: {
    active: number;
    newThisMonth: number;
    growthPercent: number;
  };
  salesSeries: { month: string; sales: number }[];
  financeSeries: { month: string; revenue: number; expenses: number }[];
  invoiceStats: {
    total: number;
    paid: number;
    pending: number;
    paidPercent: number;
  };
  contractStats: {
    active: number;
    monthly: number;
    annual: number;
  };
  visitStats: {
    total: number;
    completed: number;
    scheduled: number;
    cancelled: number;
    completionRate: number;
    growthPercent: number;
    visitsByMonth: { month: string; total: number; completed: number; scheduled: number; cancelled: number }[];
  };
  quickSummary: {
    averageDealSize: ValueDelta;
    customerSatisfaction: ValueDelta;
    conversionRate: ValueDelta;
    renewalRate: ValueDelta;
  };
}

const initialSnapshot: AnalyticsSnapshot = {
  totalRevenue: 0,
  revenueGrowthPercent: 0,
  totalExpenses: 0,
  expenseGrowthPercent: 0,
  netProfit: 0,
  profitMarginPercent: 0,
  customerStats: {
    active: 0,
    newThisMonth: 0,
    growthPercent: 0,
  },
  salesSeries: [],
  financeSeries: [],
  invoiceStats: {
    total: 0,
    paid: 0,
    pending: 0,
    paidPercent: 0,
  },
  contractStats: {
    active: 0,
    monthly: 0,
    annual: 0,
  },
  visitStats: {
    total: 0,
    completed: 0,
    scheduled: 0,
    cancelled: 0,
    completionRate: 0,
    growthPercent: 0,
    visitsByMonth: [],
  },
  quickSummary: {
    averageDealSize: { value: null, change: null },
    customerSatisfaction: { value: null, change: null },
    conversionRate: { value: null, change: null },
    renewalRate: { value: null, change: null },
  },
};

export function Analytics() {
  const [data, setData] = useState<AnalyticsSnapshot>(initialSnapshot);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAnalytics = useCallback(
    async (mode: "initial" | "refresh" = "initial") => {
      if (mode === "initial") {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      const now = new Date();
      const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const startOfWindow = new Date(now.getFullYear(), now.getMonth() - 5, 1);
      const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
      const startOfPreviousQuarter = new Date(startOfQuarter.getFullYear(), startOfQuarter.getMonth() - 3, 1);
      const endOfPreviousQuarter = new Date(startOfQuarter.getFullYear(), startOfQuarter.getMonth(), 0);

      const windowIso = startOfWindow.toISOString().slice(0, 10);

      try {
        const [
          paymentsRes,
          expensesRes,
          customersRes,
          invoicesRes,
          contractsRes,
          visitsRes,
          leadsRes,
          ticketsRes,
        ] = await Promise.all([
          supabase
            .from("payments")
            .select("paid_amount,payment_date,created_at")
            .or(`payment_date.gte.${windowIso},created_at.gte.${windowIso}`),
          supabase
            .from("expenses")
            .select("total_amount,paid_amount,base_amount,expense_date,created_at,status")
            .or(`expense_date.gte.${windowIso},created_at.gte.${windowIso}`),
          supabase.from("customers").select("status,created_at"),
          supabase
            .from("invoices")
            .select("payment_status,total_amount,paid_amount,remaining_amount,invoice_date,created_at"),
          supabase
            .from("contracts")
            .select(
              "contract_amount,contract_status,contract_start_date,contract_duration_interval,created_at,updated_at",
            ),
          supabase
            .from("monthly_visits")
            .select("status,visit_date,created_at,customer_id,delegate_id"),
          supabase.from("leads").select("created_at"),
          supabase.from("customer_support_tickets").select("status,created_at"),
        ]);

        const errors = [
          paymentsRes.error,
          expensesRes.error,
          customersRes.error,
          invoicesRes.error,
          contractsRes.error,
          visitsRes.error,
          leadsRes.error,
          ticketsRes.error,
        ].filter(Boolean);

        if (errors.length > 0) {
          throw errors[0]!;
        }

        const payments = (paymentsRes.data ?? []) as Partial<Payments>[];
        const expenses = (expensesRes.data ?? []) as Partial<ExpenseRow>[];
        const customers = (customersRes.data ?? []) as Partial<CustomerRow>[];
        const invoices = (invoicesRes.data ?? []) as Partial<InvoiceRow>[];
        const contracts = (contractsRes.data ?? []) as Partial<ContractRow>[];
        const visits = (visitsRes.data ?? []) as Partial<MonthlyVisitRow>[];
        const leads = (leadsRes.data ?? []) as Partial<LeadRow>[];
        const tickets = (ticketsRes.data ?? []) as Partial<TicketRow>[];

        const revenueByMonth = new Map<string, number>();
        const expenseByMonth = new Map<string, number>();

        let totalRevenue = 0;
        payments.forEach((payment) => {
          const amount = Number(payment.paid_amount ?? 0);
          if (!Number.isFinite(amount)) return;
          totalRevenue += amount;
          const date = safeDate(payment.payment_date) ?? safeDate(payment.created_at);
          accumulateByMonth(revenueByMonth, date, amount);
        });

        let totalExpenses = 0;
        expenses.forEach((expense) => {
          const amount =
            expense.paid_amount != null
              ? Number(expense.paid_amount)
              : expense.total_amount != null
              ? Number(expense.total_amount)
              : expense.base_amount != null
              ? Number(expense.base_amount)
              : 0;
          if (!Number.isFinite(amount)) return;
          totalExpenses += amount;
          const date = safeDate(expense.expense_date) ?? safeDate(expense.created_at);
          accumulateByMonth(expenseByMonth, date, amount);
        });

        const salesSeries: { month: string; sales: number }[] = [];
        const financeSeries: { month: string; revenue: number; expenses: number }[] = [];
        for (let offset = 5; offset >= 0; offset--) {
          const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
          const key = monthKey(date);
          const revenue = Number((revenueByMonth.get(key) ?? 0).toFixed(2));
          const expense = Number((expenseByMonth.get(key) ?? 0).toFixed(2));
          salesSeries.push({
            month: date.toLocaleString("en-US", { month: "short" }),
            sales: revenue,
          });
          financeSeries.push({
            month: date.toLocaleString("en-US", { month: "short" }),
            revenue,
            expenses: expense,
          });
        }

        const currentRevenue = financeSeries[financeSeries.length - 1]?.revenue ?? 0;
        const previousRevenue = financeSeries[financeSeries.length - 2]?.revenue ?? 0;
        const currentExpenses = financeSeries[financeSeries.length - 1]?.expenses ?? 0;
        const previousExpenses = financeSeries[financeSeries.length - 2]?.expenses ?? 0;

  const netProfit = totalRevenue - totalExpenses;
        const profitMarginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

        const activeCustomers = customers.filter(
          (customer) => (customer.status ?? "").toLowerCase() === "active",
        ).length;

        const customersThisMonth = customers.filter((customer) => {
          const created = safeDate(customer.created_at);
          return created ? created >= startOfCurrentMonth && created < startOfNextMonth : false;
        }).length;

        const customersPreviousMonth = customers.filter((customer) => {
          const created = safeDate(customer.created_at);
          return created ? created >= startOfPreviousMonth && created < startOfCurrentMonth : false;
        }).length;

        let paidInvoices = 0;
        let partialInvoices = 0;
        invoices.forEach((invoice) => {
          const status = normalizeInvoiceStatus(invoice.payment_status);
          const isPaidByAmounts =
            (invoice.total_amount != null &&
              invoice.paid_amount != null &&
              invoice.paid_amount >= invoice.total_amount) ||
            Number(invoice.remaining_amount ?? 0) <= 0;

          if (status === "paid" || isPaidByAmounts) {
            paidInvoices += 1;
            return;
          }

          const isPartial =
            status === "partial" ||
            ((invoice.paid_amount ?? 0) > 0 && (invoice.remaining_amount ?? 0) > 0 && !isPaidByAmounts);

          if (isPartial) {
            partialInvoices += 1;
          }
        });

        const totalInvoices = invoices.length;
        const pendingInvoices = Math.max(0, totalInvoices - paidInvoices - partialInvoices);
        const invoicePaidPercent = totalInvoices > 0 ? (paidInvoices / totalInvoices) * 100 : 0;

        let activeContracts = 0;
        let monthlyContracts = 0;
        let annualContracts = 0;
        let renewedContractsOverall = 0;

        const contractAmountsAll: number[] = [];
        const contractAmountsThisMonth: number[] = [];
        const contractAmountsPreviousMonth: number[] = [];

        let contractsThisQuarter = 0;
        let renewedThisQuarter = 0;
        let contractsPreviousQuarter = 0;
        let renewedPreviousQuarter = 0;

        contracts.forEach((contract) => {
          const amount = Number(contract.contract_amount ?? 0);
          if (Number.isFinite(amount) && amount > 0) {
            contractAmountsAll.push(amount);
          }

          const startDate = safeDate(contract.contract_start_date) ?? safeDate(contract.created_at);
          const updatedDate = safeDate(contract.updated_at) ?? startDate;

          if (startDate && amount > 0) {
            if (startDate >= startOfCurrentMonth && startDate < startOfNextMonth) {
              contractAmountsThisMonth.push(amount);
            } else if (startDate >= startOfPreviousMonth && startDate < startOfCurrentMonth) {
              contractAmountsPreviousMonth.push(amount);
            }
          }

          const status = (contract.contract_status ?? "").toLowerCase();
          const duration = (contract.contract_duration_interval ?? "").toLowerCase();
          const isActive = status === "active";

          if (isActive) {
            activeContracts += 1;
            if (duration.includes("month")) {
              monthlyContracts += 1;
            } else if (duration.includes("year")) {
              annualContracts += 1;
            }
          }

          const isRenewed = status.includes("renew");
          if (isRenewed) {
            renewedContractsOverall += 1;
          }

          if (updatedDate) {
            if (updatedDate >= startOfQuarter) {
              contractsThisQuarter += 1;
              if (isRenewed) {
                renewedThisQuarter += 1;
              }
            } else if (updatedDate >= startOfPreviousQuarter && updatedDate <= endOfPreviousQuarter) {
              contractsPreviousQuarter += 1;
              if (isRenewed) {
                renewedPreviousQuarter += 1;
              }
            }
          }
        });

        const average = (values: number[]) =>
          values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

        const averageDealSizeCurrent = average(contractAmountsThisMonth);
        const averageDealSizePrevious = average(contractAmountsPreviousMonth);
        const averageDealSizeValue =
          averageDealSizeCurrent > 0 ? averageDealSizeCurrent : average(contractAmountsAll);
        const averageDealSizeChangePercent = computeGrowthPercentOrNull(
          averageDealSizeCurrent,
          averageDealSizePrevious,
        );

        const renewalRateCurrent =
          contractsThisQuarter > 0 ? (renewedThisQuarter / contractsThisQuarter) * 100 : null;
        const renewalRatePrevious =
          contractsPreviousQuarter > 0 ? (renewedPreviousQuarter / contractsPreviousQuarter) * 100 : null;
        const renewalRateOverall = contracts.length > 0 ? (renewedContractsOverall / contracts.length) * 100 : null;
        const renewalRateValue = renewalRateCurrent ?? renewalRateOverall;
        const renewalRateChange =
          renewalRateCurrent != null && renewalRatePrevious != null ? renewalRateCurrent - renewalRatePrevious : null;

        // Calculate visits by month for the last 6 months
        // Process ALL visits and group them by month for accurate chart data
        const visitsByMonthMap = new Map<string, { total: number; completed: number; scheduled: number; cancelled: number }>();
        
        visits.forEach((visit) => {
          const date = safeDate(visit.visit_date) ?? safeDate(visit.created_at);
          if (!date) return;
          
          // Only include visits from the last 6 months (including current month)
          // Create a date object for the first day of the visit's month for comparison
          const visitMonthStart = new Date(date.getFullYear(), date.getMonth(), 1);
          
          // Check if visit is within the 6-month window (from startOfWindow to end of current month)
          if (visitMonthStart < startOfWindow) {
            return; // Skip visits outside the window
          }
          
          const key = monthKey(date);
          const current = visitsByMonthMap.get(key) ?? { total: 0, completed: 0, scheduled: 0, cancelled: 0 };
          current.total += 1;
          
          const status = normalizeVisitStatus(visit.status);
          if (status === "completed") {
            current.completed += 1;
          } else if (status === "cancelled") {
            current.cancelled += 1;
          } else {
            current.scheduled += 1;
          }
          
          visitsByMonthMap.set(key, current);
        });

        // Build visits series for last 6 months
        const visitsByMonth: { month: string; total: number; completed: number; scheduled: number; cancelled: number }[] = [];
        for (let offset = 5; offset >= 0; offset--) {
          const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
          const key = monthKey(date);
          const monthData = visitsByMonthMap.get(key) ?? { total: 0, completed: 0, scheduled: 0, cancelled: 0 };
          visitsByMonth.push({
            month: date.toLocaleString("en-US", { month: "short" }),
            ...monthData,
          });
        }

        // Current month visits - include visits scheduled for current month (even if in the future)
        const visitsThisMonth = visits.filter((visit) => {
          const date = safeDate(visit.visit_date) ?? safeDate(visit.created_at);
          if (!date) return false;
          // Include visits that fall within the current month
          const visitMonth = date.getMonth();
          const visitYear = date.getFullYear();
          const currentMonth = now.getMonth();
          const currentYear = now.getFullYear();
          return visitMonth === currentMonth && visitYear === currentYear;
        });

        // Previous month visits
        const visitsPreviousMonth = visits.filter((visit) => {
          const date = safeDate(visit.visit_date) ?? safeDate(visit.created_at);
          if (!date) return false;
          const visitMonth = date.getMonth();
          const visitYear = date.getFullYear();
          const prevMonth = startOfPreviousMonth.getMonth();
          const prevYear = startOfPreviousMonth.getFullYear();
          return visitMonth === prevMonth && visitYear === prevYear;
        });

        let completedVisits = 0;
        let scheduledVisits = 0;
        let cancelledVisits = 0;

        visitsThisMonth.forEach((visit) => {
          const status = normalizeVisitStatus(visit.status);
          if (status === "completed") {
            completedVisits += 1;
          } else if (status === "cancelled") {
            cancelledVisits += 1;
          } else {
            scheduledVisits += 1;
          }
        });

        const totalVisitsThisMonth = visitsThisMonth.length;
        const totalVisitsPreviousMonth = visitsPreviousMonth.length;
        const visitCompletionRate =
          totalVisitsThisMonth > 0 ? (completedVisits / totalVisitsThisMonth) * 100 : 0;
        const visitGrowthPercent = computeGrowthPercent(totalVisitsThisMonth, totalVisitsPreviousMonth);

        const leadsThisMonth = leads.filter((lead) => {
          const created = safeDate(lead.created_at);
          return created ? created >= startOfCurrentMonth && created < startOfNextMonth : false;
        }).length;

        const leadsPreviousMonth = leads.filter((lead) => {
          const created = safeDate(lead.created_at);
          return created ? created >= startOfPreviousMonth && created < startOfCurrentMonth : false;
        }).length;

        const conversionRateCurrent =
          leadsThisMonth > 0 ? (customersThisMonth / leadsThisMonth) * 100 : null;
        const conversionRatePrevious =
          leadsPreviousMonth > 0 ? (customersPreviousMonth / leadsPreviousMonth) * 100 : null;
        const conversionRateOverall =
          leads.length > 0 ? (customers.length / leads.length) * 100 : null;
        const conversionRateValue = conversionRateCurrent ?? conversionRateOverall;
        const conversionRateChange =
          conversionRateCurrent != null && conversionRatePrevious != null
            ? conversionRateCurrent - conversionRatePrevious
            : null;

        const ticketsThisMonth = tickets.filter((ticket) => {
          const created = safeDate(ticket.created_at);
          return created ? created >= startOfCurrentMonth && created < startOfNextMonth : false;
        });

        const ticketsPreviousMonth = tickets.filter((ticket) => {
          const created = safeDate(ticket.created_at);
          return created ? created >= startOfPreviousMonth && created < startOfCurrentMonth : false;
        });

        const resolvedThisMonth = ticketsThisMonth.filter((ticket) =>
          resolvedTicketStatuses.has((ticket.status ?? "").toLowerCase()),
        ).length;
        const resolvedPreviousMonth = ticketsPreviousMonth.filter((ticket) =>
          resolvedTicketStatuses.has((ticket.status ?? "").toLowerCase()),
        ).length;
        const resolvedOverall = tickets.filter((ticket) =>
          resolvedTicketStatuses.has((ticket.status ?? "").toLowerCase()),
        ).length;

        const satisfactionCurrent =
          ticketsThisMonth.length > 0 ? (resolvedThisMonth / ticketsThisMonth.length) * 100 : null;
        const satisfactionPrevious =
          ticketsPreviousMonth.length > 0 ? (resolvedPreviousMonth / ticketsPreviousMonth.length) * 100 : null;
        const satisfactionOverall =
          tickets.length > 0 ? (resolvedOverall / tickets.length) * 100 : null;
        const satisfactionValue = satisfactionCurrent ?? satisfactionOverall;
        const satisfactionChange =
          satisfactionCurrent != null && satisfactionPrevious != null
            ? satisfactionCurrent - satisfactionPrevious
            : null;

        setData({
          totalRevenue,
          revenueGrowthPercent: computeGrowthPercent(currentRevenue, previousRevenue),
          totalExpenses,
          expenseGrowthPercent: computeGrowthPercent(currentExpenses, previousExpenses),
          netProfit,
          profitMarginPercent: Number.isFinite(profitMarginPercent) ? profitMarginPercent : 0,
          salesSeries,
          financeSeries,
          customerStats: {
            active: activeCustomers,
            newThisMonth: customersThisMonth,
            growthPercent: computeGrowthPercent(customersThisMonth, customersPreviousMonth),
          },
          invoiceStats: {
            total: totalInvoices,
            paid: paidInvoices,
            pending: pendingInvoices + partialInvoices,
            paidPercent: clampPercent(invoicePaidPercent),
          },
          contractStats: {
            active: activeContracts,
            monthly: monthlyContracts,
            annual: annualContracts,
          },
          visitStats: {
            total: totalVisitsThisMonth,
            completed: completedVisits,
            scheduled: scheduledVisits,
            cancelled: cancelledVisits,
            completionRate: clampPercent(visitCompletionRate),
            growthPercent: visitGrowthPercent,
            visitsByMonth,
          },
          quickSummary: {
            averageDealSize: {
              value: Number.isFinite(averageDealSizeValue) && averageDealSizeValue > 0 ? averageDealSizeValue : null,
              change: averageDealSizeChangePercent,
            },
            customerSatisfaction: {
              value: satisfactionValue,
              change: satisfactionChange,
            },
            conversionRate: {
              value: conversionRateValue,
              change: conversionRateChange,
            },
            renewalRate: {
              value: renewalRateValue,
              change: renewalRateChange,
            },
          },
        });
      } catch (caughtError) {
        console.error(caughtError);
        const message =
          caughtError && typeof caughtError === "object" && "message" in caughtError
            ? String((caughtError as { message?: string }).message)
            : "Failed to load analytics data";
        setError(message);
      } finally {
        if (mode === "initial") {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    void loadAnalytics("initial");
  }, [loadAnalytics]);

  const handleRefresh = () => {
    void loadAnalytics("refresh");
  };

  const quickMetrics = useMemo(
    () => [
      {
        title: "Average Deal Size",
        value: loading ? null : data.quickSummary.averageDealSize.value,
        valueFormatter: (value: number | null) => formatCurrencySar(value),
        change: loading ? null : data.quickSummary.averageDealSize.change,
        changeFormatter: (change: number | null) => formatSignedNumber(change, { suffix: "%", fractionDigits: 1 }),
        changeSuffix: "vs last month",
        positiveColor: "text-green-600",
        negativeColor: "text-orange-600",
      },
      {
        title: "Customer Satisfaction",
        value: loading ? null : data.quickSummary.customerSatisfaction.value,
        valueFormatter: (value: number | null) => formatPercentValue(value, 1),
        change: loading ? null : data.quickSummary.customerSatisfaction.change,
        changeFormatter: (change: number | null) =>
          formatSignedNumber(change, { suffix: " pts", fractionDigits: 1 }),
        changeSuffix: "vs last month",
        positiveColor: "text-green-600",
        negativeColor: "text-orange-600",
      },
      {
        title: "Conversion Rate",
        value: loading ? null : data.quickSummary.conversionRate.value,
        valueFormatter: (value: number | null) => formatPercentValue(value, 1),
        change: loading ? null : data.quickSummary.conversionRate.change,
        changeFormatter: (change: number | null) =>
          formatSignedNumber(change, { suffix: " pts", fractionDigits: 1 }),
        changeSuffix: "vs last month",
        positiveColor: "text-green-600",
        negativeColor: "text-orange-600",
      },
      {
        title: "Renewal Rate",
        value: loading ? null : data.quickSummary.renewalRate.value,
        valueFormatter: (value: number | null) => formatPercentValue(value, 1),
        change: loading ? null : data.quickSummary.renewalRate.change,
        changeFormatter: (change: number | null) =>
          formatSignedNumber(change, { suffix: " pts", fractionDigits: 1 }),
        changeSuffix: "vs last quarter",
        positiveColor: "text-green-600",
        negativeColor: "text-orange-600",
      },
    ],
    [data.quickSummary, loading],
  );

  const revenueTrendUp = !loading && data.revenueGrowthPercent >= 0;
  const RevenueTrendIcon = revenueTrendUp ? ArrowUpRight : ArrowDownRight;
  const revenueTrendColor = revenueTrendUp ? "text-green-600" : "text-orange-600";

  const expensesTrendIncrease = !loading && data.expenseGrowthPercent > 0;
  const ExpensesTrendIcon = expensesTrendIncrease ? ArrowUpRight : ArrowDownRight;
  const expensesTrendColor = expensesTrendIncrease ? "text-orange-600" : "text-green-600";

  const customersTrendDown = !loading && data.customerStats.growthPercent < 0;
  const CustomersTrendIcon = customersTrendDown ? ArrowDownRight : ArrowUpRight;
  const customersTrendColor = customersTrendDown ? "text-orange-600" : "text-green-600";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Analytics & KPIs</h2>
        <p className="text-muted-foreground mt-1">Track your business performance and key metrics</p>
          {loading && <p className="text-xs text-muted-foreground mt-1">Loading real-time insights...</p>}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={loading || refreshing}
            className="gap-2"
          >
            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {loading ? "--" : formatCurrencySar(data.totalRevenue)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {!loading && <RevenueTrendIcon className={`h-3 w-3 ${revenueTrendColor}`} />}
              <p className={`text-xs ${loading ? "text-muted-foreground" : revenueTrendColor}`}>
                {loading
                  ? "Loading..."
                  : `${formatSignedNumber(data.revenueGrowthPercent, { fractionDigits: 1 })} vs last month`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {loading ? "--" : formatCurrencySar(data.netProfit)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {loading ? "Calculating margin..." : `${formatPercentValue(data.profitMarginPercent, 1)} profit margin`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Customers</CardTitle>
            <Users className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {loading ? "--" : formatCount(data.customerStats.active)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {!loading && <CustomersTrendIcon className={`h-3 w-3 ${customersTrendColor}`} />}
              <p className={`text-xs ${loading ? "text-muted-foreground" : customersTrendColor}`}>
                {loading
                  ? "Loading..."
                  : `${formatSignedNumber(data.customerStats.newThisMonth, { fractionDigits: 0, suffix: "" })} new this month`}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <ShoppingBag className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {loading ? "--" : formatCurrencySar(data.totalExpenses)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {!loading && <ExpensesTrendIcon className={`h-3 w-3 ${expensesTrendColor}`} />}
              <p className={`text-xs ${loading ? "text-muted-foreground" : expensesTrendColor}`}>
                {loading
                  ? "Loading..."
                  : `${formatSignedNumber(data.expenseGrowthPercent, { fractionDigits: 1 })} vs last month`}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Monthly Sales</CardTitle>
            <CardDescription>Sales performance over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading sales data...</div>
            ) : data.salesSeries.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No sales data available</div>
            ) : (
            <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.salesSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                <Tooltip 
                    formatter={(value: number) => formatCurrencySar(value)}
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                />
                <Bar dataKey="sales" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
            <CardDescription>Financial comparison over 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading financial data...</div>
            ) : data.financeSeries.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">No financial data available</div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={data.financeSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <Tooltip
                    formatter={(value: number) => formatCurrencySar(value)}
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={2} name="Revenue" />
                  <Line type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} name="Expenses" />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Monthly Visits Trend</CardTitle>
            <CardDescription>Visit performance over the last 6 months</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="py-12 text-center text-muted-foreground text-sm">Loading visits data...</div>
            ) : !data.visitStats.visitsByMonth || data.visitStats.visitsByMonth.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No visits data available for the last 6 months
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={data.visitStats.visitsByMonth}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                  <XAxis dataKey="month" stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <YAxis stroke="#6b7280" style={{ fontSize: "12px" }} />
                  <Tooltip
                    formatter={(value: number, name: string) => {
                      if (name === "Total Visits") return `${formatCount(value)} total`;
                      if (name === "Completed") return `${formatCount(value)} completed`;
                      if (name === "Scheduled") return `${formatCount(value)} scheduled`;
                      if (name === "Cancelled") return `${formatCount(value)} cancelled`;
                      return formatCount(value);
                    }}
                    labelFormatter={(label) => `Month: ${label}`}
                    contentStyle={{
                      backgroundColor: "#fff",
                      border: "1px solid #e5e7eb",
                      borderRadius: "8px",
                    }}
                  />
                  <Legend />
                  <Bar dataKey="total" fill="#3b82f6" radius={[8, 8, 0, 0]} name="Total Visits" />
                  <Bar dataKey="completed" fill="#10b981" radius={[8, 8, 0, 0]} name="Completed" />
                  <Bar dataKey="scheduled" fill="#6366f1" radius={[8, 8, 0, 0]} name="Scheduled" />
                  {data.visitStats.visitsByMonth.some(v => v.cancelled > 0) && (
                    <Bar dataKey="cancelled" fill="#ef4444" radius={[8, 8, 0, 0]} name="Cancelled" />
                  )}
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoices</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "--" : formatCount(data.invoiceStats.total)}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium text-green-600">
                  {loading ? "--" : formatCount(data.invoiceStats.paid)}
                </span>
              </div>
              <Progress value={loading ? 0 : clampPercent(data.invoiceStats.paidPercent)} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Pending</span>
                <span className="font-medium text-yellow-600">
                  {loading ? "--" : formatCount(data.invoiceStats.pending)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Contracts</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "--" : formatCount(data.contractStats.active)}
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Monthly</span>
                <span className="font-medium">
                  {loading ? "--" : formatCount(data.contractStats.monthly)}
                </span>
              </div>
              <Progress
                value={
                  loading
                    ? 0
                    : clampPercent(
                        data.contractStats.active > 0
                          ? (data.contractStats.monthly / data.contractStats.active) * 100
                          : 0,
                      )
                }
                className="h-2"
              />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Annual</span>
                <span className="font-medium">
                  {loading ? "--" : formatCount(data.contractStats.annual)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Visits</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {loading ? "--" : formatCount(data.visitStats.total)}
            </div>
            <div className="flex items-center gap-1 mt-1">
              {!loading && data.visitStats.growthPercent !== 0 && (
                <>
                  {data.visitStats.growthPercent >= 0 ? (
                    <ArrowUpRight className="h-3 w-3 text-green-600" />
                  ) : (
                    <ArrowDownRight className="h-3 w-3 text-orange-600" />
                  )}
                </>
              )}
              <p className={`text-xs ${loading ? "text-muted-foreground" : data.visitStats.growthPercent >= 0 ? "text-green-600" : "text-orange-600"}`}>
                {loading
                  ? "Loading..."
                  : `${formatSignedNumber(data.visitStats.growthPercent, { fractionDigits: 1 })} vs last month`}
              </p>
            </div>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Completed</span>
                <span className="font-medium text-green-600">
                  {loading ? "--" : formatCount(data.visitStats.completed)}
                </span>
              </div>
              <Progress value={loading ? 0 : clampPercent(data.visitStats.completionRate)} className="h-2" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Scheduled</span>
                <span className="font-medium text-blue-600">
                  {loading ? "--" : formatCount(data.visitStats.scheduled)}
                </span>
              </div>
              {!loading && data.visitStats.cancelled > 0 && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Cancelled</span>
                  <span className="font-medium text-red-600">
                    {formatCount(data.visitStats.cancelled)}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick Summary</CardTitle>
          <CardDescription>Key performance indicators at a glance</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {quickMetrics.map((metric) => {
              const hasChange = metric.change != null && !Number.isNaN(metric.change);
              const trendDirection =
                hasChange && metric.change! !== 0 ? (metric.change! < 0 ? "down" : "up") : "flat";
              const TrendIcon = trendDirection === "down" ? ArrowDownRight : ArrowUpRight;
              const trendColor =
                trendDirection === "down"
                  ? metric.negativeColor
                  : trendDirection === "up"
                  ? metric.positiveColor
                  : "text-muted-foreground";
              const changeLabel = loading
                ? "Loading..."
                : hasChange
                ? `${metric.changeFormatter(metric.change)} ${metric.changeSuffix}`
                : "No recent data";

              return (
                <div key={metric.title} className="space-y-2">
                  <p className="text-sm text-muted-foreground">{metric.title}</p>
                  <p className="text-2xl font-bold">
                    {loading ? "--" : metric.valueFormatter(metric.value)}
                  </p>
                  <div className={`flex items-center gap-1 text-xs ${trendColor}`}>
                    {trendDirection !== "flat" && <TrendIcon className="h-3 w-3" />}
                    <span>{changeLabel}</span>
              </div>
            </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}


