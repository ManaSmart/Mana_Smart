import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  FileText,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Clock,
  CheckCircle2,
  MapPin,
  Bell,
  Activity as ActivityIcon,
  UserCircle,
  Edit,
  Plus,
  Send,
  Trash2,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { ScrollArea } from "./ui/scroll-area";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Reminder, Activity } from "../types/activity";
import { Skeleton } from "./ui/skeleton";
import { supabase } from "../lib/supabaseClient";
import type { Payments } from "../../supabase/models/payments";
import type { Customers } from "../../supabase/models/customers";
import type { Contracts } from "../../supabase/models/contracts";
import type { MarketingCampaigns } from "../../supabase/models/marketing_campaigns";
import type { MonthlyVisits } from "../../supabase/models/monthly_visits";
import { Button } from "./ui/button";

interface DashboardProps {
  reminders: Reminder[];
  activities: Activity[];
}

interface DashboardMetrics {
  totalRevenue: number;
  revenueGrowthPercent: number;
  activeCustomers: number;
  newCustomersThisMonth: number;
  customerGrowthPercent: number;
  activeContracts: number;
  newContractsThisMonth: number;
  averageCtr: number;
  totalImpressions: number;
  totalClicks: number;
}

type ActivitySource = "payments" | "customers" | "contracts" | "marketing" | "visits";

const activityTypeFallback: Record<ActivitySource, Activity["type"]> = {
  payments: "payment",
  customers: "customer",
  contracts: "contract",
  marketing: "system",
  visits: "visit",
};

const activityActionFallback: Record<ActivitySource, Activity["action"]> = {
  payments: "received",
  customers: "created",
  contracts: "created",
  marketing: "updated",
  visits: "completed",
};

const typeColors = {
  visit: "bg-blue-100 text-blue-700 border-blue-200",
  payment: "bg-green-100 text-green-700 border-green-200",
  contract: "bg-purple-100 text-purple-700 border-purple-200",
  "follow-up": "bg-orange-100 text-orange-700 border-orange-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const typeIcons = {
  visit: MapPin,
  payment: DollarSign,
  contract: FileText,
  "follow-up": Bell,
  other: Calendar,
};

const activityTypeColors = {
  customer: "bg-blue-100 text-blue-700 border-blue-200",
  lead: "bg-purple-100 text-purple-700 border-purple-200",
  contract: "bg-green-100 text-green-700 border-green-200",
  visit: "bg-cyan-100 text-cyan-700 border-cyan-200",
  payment: "bg-emerald-100 text-emerald-700 border-emerald-200",
  quotation: "bg-orange-100 text-orange-700 border-orange-200",
  invoice: "bg-yellow-100 text-yellow-700 border-yellow-200",
  reminder: "bg-indigo-100 text-indigo-700 border-indigo-200",
  system: "bg-gray-100 text-gray-700 border-gray-200",
};

const activityActionIcons = {
  created: Plus,
  updated: Edit,
  deleted: Trash2,
  completed: CheckCircle2,
  approved: CheckCircle2,
  rejected: Trash2,
  sent: Send,
  received: ArrowDownRight,
};

const currencyFormatter = new Intl.NumberFormat("en-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

const formatPercentLabel = (value: number) => {
  if (!Number.isFinite(value)) return "0%";
  const rounded = value.toFixed(1);
  return `${value >= 0 ? "+" : ""}${rounded}%`;
};

const safeDate = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
};

export function Dashboard({ reminders, activities }: DashboardProps) {
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    totalRevenue: 0,
    revenueGrowthPercent: 0,
    activeCustomers: 0,
    newCustomersThisMonth: 0,
    customerGrowthPercent: 0,
    activeContracts: 0,
    newContractsThisMonth: 0,
    averageCtr: 0,
    totalImpressions: 0,
    totalClicks: 0,
  });
  const [revenueSeries, setRevenueSeries] = useState<{ month: string; revenue: number }[]>([]);
  const [visitsSeries, setVisitsSeries] = useState<{ day: string; visits: number }[]>([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [dbActivities, setDbActivities] = useState<Activity[]>([]);
  const [activitiesLoading, setActivitiesLoading] = useState(true);
  const [activitiesError, setActivitiesError] = useState<string | null>(null);

  const todayIso = new Date().toISOString().split("T")[0];

  const loadDashboardData = useCallback(async () => {
    setMetricsLoading(true);
    setMetricsError(null);

    const now = new Date();
    const startOfCurrentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfPreviousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
    const sevenDaysAgoIso = sevenDaysAgo.toISOString().slice(0, 10);

    try {
      const [paymentsRes, customersRes, contractsRes, marketingRes, visitsRes] = await Promise.all([
        supabase.from("payments").select("paid_amount,payment_date,created_at"),
        supabase.from("customers").select("status,created_at"),
        supabase.from("contracts").select("contract_status,contract_start_date,created_at,contract_amount"),
        supabase.from("marketing_campaigns").select("status,performance,last_modified"),
        supabase
          .from("manual_visits")
          .select("visit_date,created_at")
          .gte("visit_date", sevenDaysAgoIso),
      ]);

      const errors = [
        paymentsRes.error,
        customersRes.error,
        contractsRes.error,
        marketingRes.error,
        visitsRes.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        throw errors[0];
      }

      const payments = (paymentsRes.data ?? []) as Partial<Payments>[];
      const customers = (customersRes.data ?? []) as Partial<Customers>[];
      const contracts = (contractsRes.data ?? []) as Partial<Contracts>[];
      const marketing = (marketingRes.data ?? []) as Partial<MarketingCampaigns>[];
      const visits = (visitsRes.data ?? []) as Partial<MonthlyVisits>[];

      const totalRevenue = payments.reduce((sum, payment) => sum + (payment.paid_amount ?? 0), 0);

      const monthMap = new Map<string, number>();
      payments.forEach((payment) => {
        const candidate = safeDate(payment.created_at) ?? safeDate(payment.payment_date);
        if (!candidate) return;
        const key = `${candidate.getFullYear()}-${String(candidate.getMonth() + 1).padStart(2, "0")}`;
        const current = monthMap.get(key) ?? 0;
        monthMap.set(key, current + (payment.paid_amount ?? 0));
      });

      const revenueSeriesData: { month: string; revenue: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
        revenueSeriesData.push({
          month: date.toLocaleString("en-US", { month: "short" }),
          revenue: Number((monthMap.get(key) ?? 0).toFixed(2)),
        });
      }

      const currentRevenue = revenueSeriesData[revenueSeriesData.length - 1]?.revenue ?? 0;
      const previousRevenue = revenueSeriesData[revenueSeriesData.length - 2]?.revenue ?? 0;
      const revenueGrowthPercent = previousRevenue === 0
        ? currentRevenue > 0
          ? 100
          : 0
        : ((currentRevenue - previousRevenue) / previousRevenue) * 100;

      const activeCustomers = customers.filter(
        (customer) => (customer.status ?? "").toLowerCase() === "active"
      ).length;

      const newCustomersThisMonth = customers.filter((customer) => {
        const created = safeDate(customer.created_at);
        return created ? created >= startOfCurrentMonth : false;
      }).length;

      const previousMonthCustomers = customers.filter((customer) => {
        const created = safeDate(customer.created_at);
        return created ? created >= startOfPreviousMonth && created < startOfCurrentMonth : false;
      }).length;

      const customerGrowthPercent = previousMonthCustomers === 0
        ? newCustomersThisMonth > 0
          ? 100
          : 0
        : ((newCustomersThisMonth - previousMonthCustomers) / previousMonthCustomers) * 100;

      const activeContracts = contracts.filter(
        (contract) => (contract.contract_status ?? "").toLowerCase() === "active"
      ).length;

      const newContractsThisMonth = contracts.filter((contract) => {
        const startDate = safeDate(contract.contract_start_date) ?? safeDate(contract.created_at);
        return startDate ? startDate >= startOfCurrentMonth : false;
      }).length;

      let totalImpressions = 0;
      let totalClicks = 0;
      marketing.forEach((campaign) => {
        const performance = (campaign.performance ?? {}) as { impressions?: number; clicks?: number };
        totalImpressions += performance.impressions ?? 0;
        totalClicks += performance.clicks ?? 0;
      });
      const averageCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;

      const visitsMap = new Map<string, number>();
      visits.forEach((visit) => {
        const visitDate = visit.visit_date ?? visit.created_at;
        if (!visitDate) return;
        // Normalize to YYYY-MM-DD format for consistent key matching
        const dateObj = safeDate(visitDate);
        if (!dateObj) return;
        const key = dateObj.toISOString().slice(0, 10);
        const current = visitsMap.get(key) ?? 0;
        visitsMap.set(key, current + 1);
      });

      const visitsSeriesData: { day: string; visits: number }[] = [];
      for (let i = 6; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const key = date.toISOString().slice(0, 10);
        visitsSeriesData.push({
          day: date.toLocaleDateString("en-GB", {
            weekday: "short",
            month: "short",
            day: "numeric",
          }),
          visits: visitsMap.get(key) ?? 0,
        });
      }

      setRevenueSeries(revenueSeriesData);
      setVisitsSeries(visitsSeriesData);
      setMetrics({
        totalRevenue,
        revenueGrowthPercent,
        activeCustomers,
        newCustomersThisMonth,
        customerGrowthPercent,
        activeContracts,
        newContractsThisMonth,
        averageCtr,
        totalImpressions,
        totalClicks,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load dashboard data";
      setMetricsError(message);
    } finally {
      setMetricsLoading(false);
    }
  }, []);

  const loadActivities = useCallback(async () => {
    setActivitiesLoading(true);
    setActivitiesError(null);

    try {
      const [paymentsRes, customersRes, contractsRes, marketingRes, visitsRes] = await Promise.all([
        supabase
          .from("payments")
          .select("payment_id, paid_amount, payment_method, invoice_id, created_at, payment_date")
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("customers")
          .select("customer_id, customer_name, status, created_at")
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("contracts")
          .select("contract_id, contract_number, contract_status, contract_amount, created_at, contract_start_date")
          .order("created_at", { ascending: false })
          .limit(25),
        supabase
          .from("marketing_campaigns")
          .select("campaign_id, campaign_name, status, last_modified, performance")
          .order("last_modified", { ascending: false })
          .limit(25),
        supabase
          .from("manual_visits")
          .select("visit_id, visit_date, created_at, status, address")
          .order("created_at", { ascending: false })
          .limit(25),
      ]);

      const errors = [
        paymentsRes.error,
        customersRes.error,
        contractsRes.error,
        marketingRes.error,
        visitsRes.error,
      ].filter(Boolean);

      if (errors.length > 0) {
        throw errors[0];
      }

      const collected: Activity[] = [];
      let idCounter = 1;
      const nextId = () => idCounter++;

      (paymentsRes.data ?? []).forEach((payment) => {
        const timestamp =
          safeDate(payment.created_at)?.toISOString() ??
          safeDate(payment.payment_date)?.toISOString() ??
          new Date().toISOString();
        collected.push({
          id: nextId(),
          type: activityTypeFallback.payments,
          action: activityActionFallback.payments,
          title: "Payment recorded",
          description: `Payment of ${currencyFormatter.format(payment.paid_amount ?? 0)} received` +
            (payment.payment_method ? ` via ${payment.payment_method}` : ""),
          user: "System",
          userRole: "automation",
          timestamp,
          relatedEntity: payment.invoice_id ? `Invoice ${payment.invoice_id}` : undefined,
          details: {
            amount: currencyFormatter.format(payment.paid_amount ?? 0),
            status: payment.payment_method ?? undefined,
          },
        });
      });

      (customersRes.data ?? []).forEach((customer) => {
        const created = safeDate(customer.created_at)?.toISOString();
        if (!created) return;
        collected.push({
          id: nextId(),
          type: activityTypeFallback.customers,
          action: activityActionFallback.customers,
          title: "New customer added",
          description: `${customer.customer_name}`,
          user: "System",
          userRole: "automation",
          timestamp: created,
          relatedEntity: customer.customer_id,
          details: {
            status: customer.status ?? "Active",
          },
        });
      });

      (contractsRes.data ?? []).forEach((contract) => {
        const created = safeDate(contract.created_at) ?? safeDate(contract.contract_start_date);
        if (!created) return;
        collected.push({
          id: nextId(),
          type: activityTypeFallback.contracts,
          action: activityActionFallback.contracts,
          title: "Contract created",
          description: `${contract.contract_number ?? contract.contract_id}`,
          user: "System",
          userRole: "automation",
          timestamp: created.toISOString(),
          relatedEntity: contract.contract_id,
          details: {
            amount: currencyFormatter.format(contract.contract_amount ?? 0),
            status: contract.contract_status ?? "active",
          },
        });
      });

      (marketingRes.data ?? []).forEach((campaign) => {
        const modified = safeDate(campaign.last_modified);
        if (!modified) return;
        collected.push({
          id: nextId(),
          type: activityTypeFallback.marketing,
          action: activityActionFallback.marketing,
          title: `Campaign ${campaign.status ? campaign.status.toLowerCase() : "updated"}`,
          description: campaign.campaign_name,
          user: "System",
          userRole: "automation",
          timestamp: modified.toISOString(),
          relatedEntity: campaign.campaign_id,
          details: {
            status: campaign.status ?? undefined,
          },
        });
      });

      (visitsRes.data ?? []).forEach((visit) => {
        const created = safeDate(visit.created_at) ?? safeDate(visit.visit_date);
        if (!created) return;
        collected.push({
          id: nextId(),
          type: activityTypeFallback.visits,
          action: activityActionFallback.visits,
          title: "Visit logged",
          description: visit.address ?? "Scheduled visit",
          user: "System",
          userRole: "automation",
          timestamp: created.toISOString(),
          relatedEntity: visit.visit_id,
          details: {
            status: visit.status ?? undefined,
          },
        });
      });

      collected.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
      setDbActivities(collected);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to load system activities";
      setActivitiesError(message);
    } finally {
      setActivitiesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    void loadActivities();
  }, [loadActivities]);

  const activityFeed = dbActivities.length > 0 ? dbActivities : activities;
  const activityFeedToday = useMemo(
    () => activityFeed.filter((activity) => activity.timestamp.startsWith(todayIso)),
    [activityFeed, todayIso]
  );
  const todayActivitiesCount = activityFeedToday.length;

  const activityDistribution = useMemo(() => {
    const distribution = activityFeedToday.reduce((acc, activity) => {
      acc[activity.type] = (acc[activity.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return Object.entries(distribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);
  }, [activityFeedToday]);

  const today = todayIso;
  
  const todayCompletedReminders = reminders.filter(
    (reminder) =>
      reminder.status === "completed" &&
      reminder.completedAt &&
      reminder.completedAt.startsWith(today)
  );

  const todayPendingReminders = reminders.filter(
    (reminder) => reminder.status === "pending" && reminder.date === today
  );

  const upcomingReminders = reminders
    .filter((reminder) => reminder.status === "pending" && reminder.date > today)
    .slice(0, 3);

  const recentActivities = activityFeed.slice(0, 10);

  const statsCards = useMemo(
    () => [
      {
        title: "Total Revenue",
        value: currencyFormatter.format(metrics.totalRevenue),
        changeLabel: formatPercentLabel(metrics.revenueGrowthPercent),
        trend: metrics.revenueGrowthPercent >= 0 ? "up" : "down",
        icon: DollarSign,
        description: "vs previous month revenue",
      },
      {
        title: "Active Customers",
        value: metrics.activeCustomers.toLocaleString(),
        changeLabel: `${metrics.newCustomersThisMonth.toLocaleString()} new this month`,
        trend: metrics.customerGrowthPercent >= 0 ? "up" : "down",
        icon: Users,
        description: "Customers marked as active",
      },
      {
        title: "Active Contracts",
        value: metrics.activeContracts.toLocaleString(),
        changeLabel: `${metrics.newContractsThisMonth.toLocaleString()} new this month`,
        trend: metrics.newContractsThisMonth >= 0 ? "up" : "down",
        icon: FileText,
        description: "Contracts with status active",
      },
      {
        title: "Avg Campaign CTR",
        value: `${metrics.averageCtr.toFixed(2)}%`,
        changeLabel: `${metrics.totalClicks.toLocaleString()} clicks`,
        trend: "up" as const,
        icon: TrendingUp,
        description: `${metrics.totalImpressions.toLocaleString()} impressions total`,
      },
    ],
    [metrics]
  );

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const nowDate = new Date();
    const diffMs = nowDate.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min${diffMins > 1 ? "s" : ""} ago`;
    if (diffHours < 24) return`${diffHours} hour${diffHours > 1 ? "s" : ""} ago`;
    if (diffDays < 7) return`${diffDays} day${diffDays > 1 ? "s" : ""} ago`;

    return date.toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const renderStatsSkeleton = () => (
    <>
      {Array.from({ length: 4 }).map((_, index) => (
        <Card key={`stat-skeleton-${index}`}>
          <CardHeader className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-32" />
          </CardHeader>
          <CardContent className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-32" />
          </CardContent>
        </Card>
      ))}
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Dashboard Overview</h2>
        <p className="text-muted-foreground mt-1">
          Welcome back! Here's what's happening with your business today.
        </p>
      </div>

      {metricsError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {metricsError}
        </div>
      )}
      {activitiesError && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
          {activitiesError}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {metricsLoading ? (
          renderStatsSkeleton()
        ) : (
          statsCards.map((stat) => {
          const Icon = stat.icon;
          const TrendIcon = stat.trend === "up" ? ArrowUpRight : ArrowDownRight;
          return (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <div className="flex items-center gap-1 mt-1">
                    {stat.changeLabel && (
                      <div
                        className={`flex items-center gap-0.5 text-xs font-medium ${
                          stat.trend === "down" ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {stat.trend && <TrendIcon className="h-3 w-3" />}
                        {stat.changeLabel}
                  </div>
                    )}
                  <span className="text-xs text-muted-foreground">{stat.description}</span>
                </div>
              </CardContent>
            </Card>
          );
          })
        )}
        
        <Card className="hover:shadow-md transition-shadow bg-gradient-to-br from-blue-50 to-white border-blue-100">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Today's Activities
            </CardTitle>
            <div className="h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center">
              <ActivityIcon className="h-4 w-4 text-blue-600" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-700">{todayActivitiesCount}</div>
            <div className="flex items-center gap-1 mt-1">
              <div className="flex items-center gap-0.5 text-xs font-medium text-blue-600">
                <TrendingUp className="h-3 w-3" />
                Active
              </div>
              <span className="text-xs text-muted-foreground">system events</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4 hover:shadow-md transition-shadow">
          <CardHeader className="flex items-center justify-between">
            <div>
            <CardTitle>Revenue Overview</CardTitle>
              <CardDescription>Monthly revenue for the last 6 months</CardDescription>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => void loadDashboardData()}
              disabled={metricsLoading}
              title="Refresh revenue data"
            >
              {metricsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </CardHeader>
          <CardContent>
            {revenueSeries.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No revenue data available
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={revenueSeries}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="month"
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                    }}
                    formatter={(value: number) => currencyFormatter.format(value)}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#2563eb"
                    strokeWidth={2}
                    fill="url(#colorRevenue)"
                  />
              </AreaChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3 hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Activity by Type</CardTitle>
            <CardDescription>Distribution of activities today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {activitiesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-52" />
                </div>
              ) : activityDistribution.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ActivityIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activities today</p>
                </div>
              ) : (
                activityDistribution.map(([type, count]) => {
                  const colorClass = activityTypeColors[type as keyof typeof activityTypeColors];
                  const progressClass = colorClass?.replace("text-", "bg-")?.split(" ")[0] ?? "bg-primary";
                  const denominator = todayActivitiesCount === 0 ? 1 : todayActivitiesCount;

                  return (
                <div key={type} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                          <div className={`h-3 w-3 rounded-full ${progressClass}`}></div>
                      <span className="font-medium capitalize">{type}</span>
                    </div>
                    <span className="font-semibold">{count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div 
                          className={`h-full ${progressClass}`}
                          style={{ width: `${((count / denominator) * 100).toFixed(0)}%` }}
                    />
                  </div>
                </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Today's Pending Reminders</CardTitle>
            <CardDescription>Tasks scheduled for today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {todayPendingReminders.length > 0 ? (
                todayPendingReminders.map((reminder) => {
                  const Icon = typeIcons[reminder.type];
                  return (
                    <div
                      key={reminder.id}
                      className="flex items-center justify-between p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start gap-3 flex-1">
                        <div className={`p-2 rounded-lg ${typeColors[reminder.type]}`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="space-y-1 flex-1">
                          <p className="font-medium">{reminder.title}</p>
                          <div className="flex items-center gap-4 text-sm text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="h-4 w-4" />
                              {reminder.time}
                            </span>
                            {reminder.customer && (
                              <span className="flex items-center gap-1">
                                <Users className="h-4 w-4" />
                                {reminder.customer}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <Badge
                        variant={
                          reminder.priority === "high"
                            ? "destructive"
                            : reminder.priority === "medium"
                            ? "secondary"
                            : "outline"
                        }
                      >
                        {reminder.priority}
                      </Badge>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No pending reminders for today</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Completed Today</CardTitle>
            <CardDescription>Tasks completed today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {todayCompletedReminders.length > 0 ? (
                todayCompletedReminders.map((reminder) => {
                  const Icon = typeIcons[reminder.type];
                  return (
                    <div
                      key={reminder.id}
                      className="flex items-start gap-4 p-4 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                    >
                      <div className={`p-2 rounded-lg ${typeColors[reminder.type]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{reminder.title}</p>
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                        </div>
                        <p className="text-xs text-muted-foreground">{reminder.description}</p>
                        {reminder.completedAt && (
                          <p className="text-xs text-green-600 font-medium">
                            ✓ Completed at
                            {" "}
                            {new Date(reminder.completedAt).toLocaleTimeString("en-US", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                        {reminder.customer && (
                          <p className="text-xs text-muted-foreground">Customer: {reminder.customer}</p>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No tasks completed yet today</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {upcomingReminders.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Upcoming Reminders</CardTitle>
            <CardDescription>Next scheduled tasks</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {upcomingReminders.map((reminder) => {
                const Icon = typeIcons[reminder.type];
                return (
                  <div
                    key={reminder.id}
                    className="flex items-center gap-4 p-3 rounded-lg border bg-card hover:shadow-sm transition-shadow"
                  >
                    <div className={`p-2 rounded-lg ${typeColors[reminder.type]}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{reminder.title}</p>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(reminder.date).toLocaleDateString("en-GB", {
                            month: "short",
                            day: "numeric",
                          })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {reminder.time}
                        </span>
                        {reminder.customer && (
                          <span className="flex items-center gap-1">
                            <Users className="h-3 w-3" />
                            {reminder.customer}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge
                      variant={
                        reminder.priority === "high"
                          ? "destructive"
                          : reminder.priority === "medium"
                          ? "secondary"
                          : "outline"
                      }
                      className="text-xs"
                    >
                      {reminder.priority}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">System Activity Log</CardTitle>
              <CardDescription className="text-xs">Recent system activities</CardDescription>
            </div>
            <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <ActivityIcon className="h-3 w-3" />
                {activityFeed.length}
            </Badge>
              <Button
                variant="outline"
                size="icon"
                onClick={() => void loadActivities()}
                disabled={activitiesLoading}
                title="Refresh activities"
              >
                {activitiesLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[280px] pr-3">
            <div className="space-y-2">
              {activitiesLoading && dbActivities.length === 0 ? (
                <div className="space-y-3">
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                  <Skeleton className="h-14" />
                </div>
              ) : activityFeed.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  No activity records available
                </div>
              ) : (
                activityFeed.slice(0, 25).map((activity) => {
                const ActionIcon = activityActionIcons[activity.action];
                  const colorClass =
                    activityTypeColors[activity.type as keyof typeof activityTypeColors] ??
                    "bg-gray-100 text-gray-700 border-gray-200";
                return (
                    <div
                      key={activity.id}
                      className="border rounded-lg p-3 hover:bg-muted/50 transition-all text-sm"
                    >
                    <div className="flex items-start gap-3">
                        <div className={`p-1.5 rounded-md ${colorClass}`}>
                        <ActionIcon className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-sm leading-tight">{activity.title}</p>
                              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                                {activity.description}
                              </p>
                          </div>
                          <Badge variant="outline" className="text-xs px-1.5 py-0">
                            {activity.type}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <UserCircle className="h-3 w-3" />
                            <span className="font-medium text-foreground">{activity.user}</span>
                          </div>
                          <div className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="h-3 w-3" />
                            <span>{formatTimestamp(activity.timestamp)}</span>
                          </div>
                          {activity.relatedEntity && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <FileText className="h-3 w-3" />
                              <span className="font-medium text-foreground">{activity.relatedEntity}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
                })
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <CardTitle>Weekly Visits</CardTitle>
            <CardDescription>Number of customer visits this week</CardDescription>
          </CardHeader>
          <CardContent>
            {visitsSeries.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground text-sm">
                No visit data available
              </div>
            ) : (
            <ResponsiveContainer width="100%" height={280}>
                <BarChart data={visitsSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="day"
                    tick={{ fill: "#64748b", fontSize: 12 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip 
                  contentStyle={{ 
                      backgroundColor: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "8px",
                      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1)",
                  }}
                />
                <Bar dataKey="visits" fill="#2563eb" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Activities</CardTitle>
                <CardDescription>Latest system activities</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{todayActivitiesCount} Today</Badge>
                <ActivityIcon className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {activitiesLoading && activityFeed.length === 0 ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </div>
                ) : activityFeed.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm">
                    No system activities recorded yet
                  </div>
                ) : (
                  recentActivities.map((activity) => {
                  const ActionIcon = activityActionIcons[activity.action];
                    const colorClass =
                      activityTypeColors[activity.type as keyof typeof activityTypeColors] ??
                      "bg-gray-100 text-gray-700 border-gray-200";
                  return (
                      <div
                        key={activity.id}
                        className="group relative border rounded-lg p-3 hover:bg-muted/50 transition-all hover:shadow-sm"
                      >
                      <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${colorClass}`}>
                          <ActionIcon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="font-semibold text-sm">{activity.title}</p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {activity.description}
                                </p>
                            </div>
                            <Badge variant="outline" className="text-xs whitespace-nowrap">
                              {activity.type}
                            </Badge>
                          </div>
                          
                          {activity.details && (
                            <div className="text-xs text-muted-foreground space-y-0.5 mt-2">
                              {activity.details.amount && (
                                  <p className="font-medium text-green-600">
                                    Amount: {activity.details.amount}
                                  </p>
                              )}
                              {activity.details.status && (
                                  <p>
                                    Status: <span className="font-medium">{activity.details.status}</span>
                                  </p>
                              )}
                              {activity.details.oldValue && activity.details.newValue && (
                                  <p>
                                    Changed from <span className="line-through">{activity.details.oldValue}</span> to{" "}
                                    <span className="font-medium">{activity.details.newValue}</span>
                                  </p>
                              )}
                            </div>
                          )}

                          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground flex-wrap">
                            <div className="flex items-center gap-1">
                              <UserCircle className="h-3 w-3" />
                              <span className="font-medium">{activity.user}</span>
                              <span className="text-[10px]">({activity.userRole})</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>{formatTimestamp(activity.timestamp)}</span>
                            </div>
                            {activity.relatedEntity && (
                              <div className="flex items-center gap-1">
                                <FileText className="h-3 w-3" />
                                <span>{activity.relatedEntity}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                  })
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
