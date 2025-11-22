import { useEffect, useMemo, useState } from "react";
import { Users, Search, Mail, Phone, MapPin, Package, DollarSign, Calendar, Eye, FileSpreadsheet, MessageSquare } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { PlatformCustomers as PlatformCustomersRecord } from "../../supabase/models/platform_customers";
import type { PlatformOrders as PlatformOrdersRecord } from "../../supabase/models/platform_orders";

const normalizePhone = (value?: string | null) => (value ? value.replace(/\D+/g, "") : "");
const normalizeEmail = (value?: string | null) => (value ? value.trim().toLowerCase() : "");

const toIsoString = (value?: string | null) => {
  if (!value) return null;
  const date = value.includes("T") ? new Date(value) : new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const formatDate = (value?: string | null) => {
  const iso = toIsoString(value ?? undefined);
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-GB");
};

const getPlatformBadge = (platform: string) => {
  const badges = {
    amazon: { color: "bg-orange-100 text-orange-700 border-orange-200", label: "Amazon" },
    noon: { color: "bg-yellow-100 text-yellow-700 border-yellow-200", label: "Noon" },
    website: { color: "bg-blue-100 text-blue-700 border-blue-200", label: "Website" },
    "golden-scent": { color: "bg-amber-100 text-amber-700 border-amber-200", label: "Golden Scent" },
    trendyol: { color: "bg-purple-100 text-purple-700 border-purple-200", label: "Trendyol" },
    "sales-rep": { color: "bg-green-100 text-green-700 border-green-200", label: "Sales Rep" },
    other: { color: "bg-gray-100 text-gray-700 border-gray-200", label: "Other" },
  } as const;
  return badges[platform as keyof typeof badges] ?? badges.other;
};

interface PlatformCustomerView {
  record: PlatformCustomersRecord;
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  city: string;
  platform: string;
  platformLabel: string;
  totalOrders: number;
  totalSpent: number;
  lastOrderDate: string | null;
  firstOrderDate: string | null;
  status: "active" | "inactive";
}

const parseOrderMeta = (raw: PlatformOrdersRecord["order_items"]) => {
  if (!raw || typeof raw !== "object") return {} as any;
  if (Array.isArray(raw)) return { items: raw };
  return raw as any;
};

export function PlatformCustomers() {
  const dispatch = useAppDispatch();
  const customerRecords = useAppSelector(selectors.platform_customers.selectAll) as PlatformCustomersRecord[];
  const customersLoading = useAppSelector(selectors.platform_customers.selectLoading);
  const orderRecords = useAppSelector(selectors.platform_orders.selectAll) as PlatformOrdersRecord[];

  useEffect(() => {
    dispatch(thunks.platform_customers.fetchAll(undefined));
    dispatch(thunks.platform_orders.fetchAll(undefined));
  }, [dispatch]);

  const customerPlatformMap = useMemo(() => {
    const map = new Map<string, { platform: string; timestamp: number }>();
    orderRecords.forEach((record) => {
      const meta = parseOrderMeta(record.order_items);
      const phone = normalizePhone(meta.customer?.phone);
      const email = normalizeEmail(meta.customer?.email);
      const identifier = phone || email;
      if (!identifier) return;
      const iso = toIsoString(meta.summary?.orderDate ?? record.order_last_modified ?? record.order_created_date);
      if (!iso) return;
      const timestamp = new Date(iso).getTime();
      if (!Number.isFinite(timestamp)) return;
      const current = map.get(identifier);
      if (!current || timestamp > current.timestamp) {
        map.set(identifier, { platform: meta.platform ?? "other", timestamp });
      }
    });
    return map;
  }, [orderRecords]);

  const customers = useMemo<PlatformCustomerView[]>(() => {
    return customerRecords.map((record) => {
      const phone = normalizePhone(record.customer_phone);
      const email = normalizeEmail(record.customer_email);
      const identifier = phone || email;
      const platformInfo = identifier ? customerPlatformMap.get(identifier) : undefined;
      const platformKey = platformInfo?.platform ?? "other";
      const badge = getPlatformBadge(platformKey);

      return {
        record,
        id: record.customer_id,
        customerName: record.customer_name ?? "Platform Customer",
        customerPhone: record.customer_phone ?? "",
        customerEmail: record.customer_email ?? "",
        shippingAddress: record.customer_address ?? "",
        city: record.customer_city ?? "",
        platform: platformKey,
        platformLabel: badge.label,
        totalOrders: Number(record.total_orders ?? 0),
        totalSpent: Number(record.total_spent ?? 0),
        lastOrderDate: record.last_order_date ?? null,
        firstOrderDate: record.created_at ?? null,
        status: (record.customer_status as "active" | "inactive" | null) ?? "active",
      };
    });
  }, [customerRecords, customerPlatformMap]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterCity, setFilterCity] = useState<string>("all");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);

  const selectedCustomer = useMemo(
    () => (selectedCustomerId ? customers.find((customer) => customer.id === selectedCustomerId) ?? null : null),
    [customers, selectedCustomerId]
  );

  const cities = useMemo(() => Array.from(new Set(customers.map((c) => c.city).filter(Boolean))).sort(), [customers]);
  const platforms = useMemo(
    () => Array.from(new Set(customers.map((c) => c.platform))).sort(),
    [customers]
  );

  const filteredCustomers = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return customers.filter((customer) => {
      const matchesSearch =
        customer.customerName.toLowerCase().includes(query) ||
        customer.customerPhone.includes(searchQuery) ||
        customer.customerEmail.toLowerCase().includes(query);
      const matchesPlatform = filterPlatform === "all" || customer.platform === filterPlatform;
      const matchesCity = filterCity === "all" || customer.city === filterCity;
      return matchesSearch && matchesPlatform && matchesCity;
    });
  }, [customers, searchQuery, filterPlatform, filterCity]);

  const totalCustomers = customers.length;
  const activeCustomers = customers.filter((c) => c.status === "active").length;
  const totalRevenue = customers.reduce((sum, c) => sum + c.totalSpent, 0);
  const totalOrdersCount = customers.reduce((sum, c) => sum + c.totalOrders, 0);
  const averageOrderValue = totalOrdersCount > 0 ? totalRevenue / totalOrdersCount : 0;

  const exportToExcel = () => {
    try {
      const exportData = filteredCustomers.map((customer) => ({
        "Customer Name": customer.customerName,
        Phone: customer.customerPhone,
        Email: customer.customerEmail,
        City: customer.city,
        Address: customer.shippingAddress,
        Platform: customer.platformLabel,
        "Total Orders": customer.totalOrders,
        "Total Spent (SAR)": customer.totalSpent.toFixed(2),
        "First Order": formatDate(customer.firstOrderDate),
        "Last Order": formatDate(customer.lastOrderDate),
        Status: customer.status,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 20 },
        { wch: 15 },
        { wch: 25 },
        { wch: 15 },
        { wch: 30 },
        { wch: 15 },
        { wch: 12 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 10 },
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Platform Customers");
      const fileName = `platform_customers_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl mb-1">Platform Customers</h1>
          <p className="text-sm text-muted-foreground">Manage customers from all sales platforms</p>
        </div>
        <Button onClick={exportToExcel} className="gap-2 bg-green-600 hover:bg-green-700" disabled={customersLoading}>
          <FileSpreadsheet className="w-4 h-4" />
          Export to Excel
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Total Customers</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{totalCustomers}</div>
            <p className="text-xs text-muted-foreground">{activeCustomers} active</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">SAR {totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">From all platforms</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Avg Order Value</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">SAR {averageOrderValue.toFixed(0)}</div>
            <p className="text-xs text-muted-foreground">Per order average</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Total Orders</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">{totalOrdersCount}</div>
            <p className="text-xs text-muted-foreground">All platforms combined</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Search by name, phone, or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterPlatform} onValueChange={setFilterPlatform}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Platform" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Platforms</SelectItem>
                {platforms.map((platform) => {
                  const badge = getPlatformBadge(platform);
                  return (
                    <SelectItem key={platform} value={platform}>
                      {badge.label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <Select value={filterCity} onValueChange={setFilterCity}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="City" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cities</SelectItem>
                {cities.map((city) => (
                  <SelectItem key={city} value={city}>
                    {city}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Customers ({filteredCustomers.length})</CardTitle>
          <CardDescription>View and manage customers from all sales platforms</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Customer</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Total Spent</TableHead>
                  <TableHead>Last Order</TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCustomers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      {customersLoading ? "Loading customers..." : "No customers found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCustomers.map((customer) => {
                    const platformBadge = getPlatformBadge(customer.platform);
                    return (
                      <TableRow key={customer.id}>
                        <TableCell>
                          <div>
                            <div className="font-medium">{customer.customerName}</div>
                            <div className="text-xs text-muted-foreground">ID: {customer.id}</div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="space-y-1">
                            <div className="flex items-center gap-1 text-xs">
                              <Phone className="w-3 h-3" />
                              <span>{customer.customerPhone || "-"}</span>
                            </div>
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              <span className="truncate max-w-[150px]">{customer.customerEmail || "-"}</span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-muted-foreground" />
                            <span>{customer.city || "-"}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`${platformBadge.color} border`}>
                            {platformBadge.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="secondary">{customer.totalOrders}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <span className="font-medium">SAR {customer.totalSpent.toLocaleString()}</span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-xs">
                            <Calendar className="w-3 h-3 text-muted-foreground" />
                            <span>{formatDate(customer.lastOrderDate)}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge
                            variant={customer.status === "active" ? "default" : "secondary"}
                            className={customer.status === "active" ? "bg-green-100 text-green-700" : ""}
                          >
                            {customer.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedCustomerId(customer.id);
                              setIsDetailsOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Customer Details</DialogTitle>
            <DialogDescription>Complete information about this customer</DialogDescription>
          </DialogHeader>

          {selectedCustomer && (
            <div className="space-y-6">
              <div>
                <h4 className="font-semibold mb-3">Personal Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Full Name</label>
                    <p className="font-medium">{selectedCustomer.customerName}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Customer ID</label>
                    <p className="font-medium">#{selectedCustomer.id}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Phone Number</label>
                    <p className="font-medium">{selectedCustomer.customerPhone || "-"}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Email Address</label>
                    <p className="font-medium">{selectedCustomer.customerEmail || "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-muted-foreground">City</label>
                    <p className="font-medium">{selectedCustomer.city || "-"}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="text-sm text-muted-foreground">Shipping Address</label>
                    <p className="font-medium">{selectedCustomer.shippingAddress || "-"}</p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Order Statistics</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm text-muted-foreground">Platform</label>
                    <div className="mt-1">
                      <Badge variant="outline" className={`${getPlatformBadge(selectedCustomer.platform).color} border`}>
                        {selectedCustomer.platformLabel}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Status</label>
                    <div className="mt-1">
                      <Badge
                        variant={selectedCustomer.status === "active" ? "default" : "secondary"}
                        className={selectedCustomer.status === "active" ? "bg-green-100 text-green-700" : ""}
                      >
                        {selectedCustomer.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Total Orders</label>
                    <p className="font-medium text-xl">{selectedCustomer.totalOrders}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Total Spent</label>
                    <p className="font-medium text-xl">SAR {selectedCustomer.totalSpent.toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">First Order</label>
                    <p className="font-medium">{formatDate(selectedCustomer.firstOrderDate)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Last Order</label>
                    <p className="font-medium">{formatDate(selectedCustomer.lastOrderDate)}</p>
                  </div>
                  <div>
                    <label className="text-sm text-muted-foreground">Average Order Value</label>
                    <p className="font-medium">
                      SAR {selectedCustomer.totalOrders > 0 ? (selectedCustomer.totalSpent / selectedCustomer.totalOrders).toFixed(2) : "0.00"}
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Quick Actions</h4>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      if (!selectedCustomer.customerPhone) return;
                      window.location.href = `tel:${selectedCustomer.customerPhone}`;
                    }}
                  >
                    <Phone className="w-4 h-4" />
                    Call
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      if (!selectedCustomer.customerEmail) return;
                      window.location.href = `mailto:${selectedCustomer.customerEmail}`;
                    }}
                  >
                    <Mail className="w-4 h-4" />
                    Email
                  </Button>
                  <Button
                    variant="outline"
                    className="gap-2"
                    onClick={() => {
                      if (!selectedCustomer.customerPhone) return;
                      const message = `Hello ${selectedCustomer.customerName}, thank you for being our valued customer!`;
                      window.open(
                        `https://wa.me/${selectedCustomer.customerPhone.replace(/\s+/g, "")}?text=${encodeURIComponent(message)}`,
                        "_blank"
                      );
                    }}
                  >
                    <MessageSquare className="w-4 h-4" />
                    WhatsApp
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
