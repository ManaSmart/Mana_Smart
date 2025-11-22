import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Package, ShoppingCart, Clock, Eye, CheckCircle, XCircle, Download, ExternalLink, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { ScrollArea } from "./ui/scroll-area";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { PlatformOrders as PlatformOrdersRecord, PlatformOrdersInsert } from "../../supabase/models/platform_orders";
import type { PlatformCustomers as PlatformCustomersRecord, PlatformCustomersInsert, PlatformCustomersUpdate } from "../../supabase/models/platform_customers";

const DEFAULT_ORDER_STATUS: OrderStatus = "pending";
const DEFAULT_PAYMENT_STATUS: OrderPaymentStatus = "pending";

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

const formatTime = (value?: string | null) => {
  const iso = toIsoString(value ?? undefined);
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
};

const formatCurrency = (value: number) => {
  if (!Number.isFinite(value)) return "0";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

type OrderPlatform = "amazon" | "noon" | "website" | "golden-scent" | "trendyol" | "sales-rep" | "other";
type OrderStatus = "pending" | "confirmed" | "processing" | "shipped" | "delivered" | "cancelled";
type OrderPaymentStatus = "pending" | "paid" | "refunded";
type OrderPaymentMethod = "cod" | "card" | "bank-transfer" | "apple-pay" | "tamara" | "tabby" | "online-payment" | "other";

interface OrderItemForm {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  price: number;
  total: number;
}

interface OrderMetaCustomer {
  name?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
}

interface OrderMetaSummary {
  tax?: number;
  shipping?: number;
  total?: number;
  orderDate?: string;
  paymentMethod?: OrderPaymentMethod;
  trackingNumber?: string | null;
  notes?: string | null;
}

interface OrderMeta {
  platform?: OrderPlatform;
  customer?: OrderMetaCustomer;
  items?: OrderItemForm[];
  summary?: OrderMetaSummary;
}

interface OrderView {
  record: PlatformOrdersRecord;
  id: string;
  orderNumber: string;
  platform: OrderPlatform;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  shippingAddress: string;
  city: string;
  items: OrderItemForm[];
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  status: OrderStatus;
  paymentStatus: OrderPaymentStatus;
  paymentMethod: OrderPaymentMethod;
  orderDate: string | null;
  createdAt: string | null;
  lastModified: string | null;
  notes?: string | null;
  trackingNumber?: string | null;
}

const parseOrderMeta = (raw: PlatformOrdersRecord["order_items"]): OrderMeta => {
  if (!raw || typeof raw !== "object") return {};
  if (Array.isArray(raw)) return { items: raw as OrderItemForm[] };
  return raw as OrderMeta;
};

const mapOrderRecordToView = (record: PlatformOrdersRecord): OrderView => {
  const meta = parseOrderMeta(record.order_items);
  const items = Array.isArray(meta.items) ? meta.items : [];
  const summary = meta.summary ?? {};
  const subtotal = Number(record.order_items_subtotal ?? items.reduce((sum, item) => sum + (item.total ?? item.price * item.quantity), 0));
  const shipping = Number(record.order_shipping_cost ?? summary.shipping ?? 0);
  const tax = Number(summary.tax ?? 0);
  const total = Number(record.order_total_amount ?? summary.total ?? subtotal + shipping + tax);
  const orderDateIso = summary.orderDate ?? record.order_last_modified ?? record.order_created_date ?? null;

  return {
    record,
    id: record.order_id,
    orderNumber: record.order_platform_reference ?? "",
    platform: meta.platform ?? "other",
    customerName: meta.customer?.name ?? "Customer",
    customerPhone: meta.customer?.phone ?? "",
    customerEmail: meta.customer?.email ?? "",
    shippingAddress: meta.customer?.address ?? "",
    city: meta.customer?.city ?? "",
    items,
    subtotal,
    shipping,
    tax,
    total,
    status: (record.order_status as OrderStatus) ?? DEFAULT_ORDER_STATUS,
    paymentStatus: (record.payment_status as OrderPaymentStatus) ?? DEFAULT_PAYMENT_STATUS,
    paymentMethod: summary.paymentMethod ?? "cod",
    orderDate: orderDateIso,
    createdAt: record.order_created_date ?? orderDateIso,
    lastModified: record.order_last_modified ?? orderDateIso,
    notes: summary.notes ?? record.notes ?? undefined,
    trackingNumber: summary.trackingNumber ?? null,
  };
};

const buildOrderMeta = (
  platform: OrderPlatform,
  customer: OrderMetaCustomer,
  items: OrderItemForm[],
  summary: Omit<OrderMetaSummary, "trackingNumber"> & { trackingNumber?: string | null }
): OrderMeta => ({
  platform,
  customer,
  items,
  summary,
});

const computeCustomerStatsFromOrders = (
  records: PlatformOrdersRecord[],
  identifier: { phone: string; email: string }
) => {
  const matches = records
    .map((rec) => ({ rec, meta: parseOrderMeta(rec.order_items) }))
    .filter(({ meta }) => {
      const phone = normalizePhone(meta.customer?.phone);
      const email = normalizeEmail(meta.customer?.email);
      if (identifier.phone && phone === identifier.phone) return true;
      if (identifier.email && email === identifier.email) return true;
      return false;
    })
    // Count all orders that are confirmed OR paid (not just confirmed)
    .filter(({ rec }) => {
      const status = ((rec.order_status ?? "") as string).toLowerCase();
      const paymentStatus = ((rec.payment_status ?? "") as string).toLowerCase();
      return status === "confirmed" || paymentStatus === "paid";
    });

  // Return stats even if no confirmed/paid orders (will show 0 orders, 0 spent)
  // This allows customers to be created/updated even with pending orders
  const totalOrders = matches.length;
  
  // Only count paid orders in total_spent
  const paidMatches = matches.filter(({ rec }) => ((rec.payment_status ?? "") as string).toLowerCase() === "paid");
  const totalSpent = paidMatches.reduce((sum, { rec, meta }) => {
    const total = Number(rec.order_total_amount ?? meta.summary?.total ?? 0);
    return sum + total;
  }, 0);

  const lastTimestamp = matches.reduce((latest, { rec, meta }) => {
    const candidate = toIsoString(meta.summary?.orderDate ?? rec.order_last_modified ?? rec.order_created_date);
    if (!candidate) return latest;
    const ts = new Date(candidate).getTime();
    return Number.isFinite(ts) ? Math.max(latest, ts) : latest;
  }, Number.NEGATIVE_INFINITY);

  const lastOrderDate = Number.isFinite(lastTimestamp) ? new Date(lastTimestamp).toISOString() : null;

  // Always return stats (even if 0) so customers can be created/updated
  return { totalOrders, totalSpent, lastOrderDate };
};

export function PlatformOrders() {
  const dispatch = useAppDispatch();
  const orderRecords = useAppSelector(selectors.platform_orders.selectAll) as PlatformOrdersRecord[];
  const ordersLoading = useAppSelector(selectors.platform_orders.selectLoading);
  const platformCustomersRecords = useAppSelector(selectors.platform_customers.selectAll) as PlatformCustomersRecord[];

  useEffect(() => {
    dispatch(thunks.platform_orders.fetchAll(undefined));
    dispatch(thunks.platform_customers.fetchAll(undefined));
  }, [dispatch]);

  const orders = useMemo(() => orderRecords.map(mapOrderRecordToView), [orderRecords]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterPlatform, setFilterPlatform] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isStatusDialogOpen, setIsStatusDialogOpen] = useState(false);
  const [statusDraft, setStatusDraft] = useState<OrderStatus>(DEFAULT_ORDER_STATUS);
  const [paymentStatusDraft, setPaymentStatusDraft] = useState<OrderPaymentStatus>(DEFAULT_PAYMENT_STATUS);

  const selectedOrder = useMemo(
    () => (selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : null),
    [orders, selectedOrderId]
  );

  const [newOrderForm, setNewOrderForm] = useState({
    platform: "website" as OrderPlatform,
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    shippingAddress: "",
    city: "",
    paymentMethod: "cod" as OrderPaymentMethod,
    shipping: 0,
    notes: "",
    status: DEFAULT_ORDER_STATUS,
    paymentStatus: DEFAULT_PAYMENT_STATUS,
  });

  const [orderItems, setOrderItems] = useState<OrderItemForm[]>([]);
  const [newItem, setNewItem] = useState({
    productName: "",
    sku: "",
    quantity: 1,
    price: 0,
  });

  useEffect(() => {
    if (selectedOrder && isStatusDialogOpen) {
      setStatusDraft(selectedOrder.status);
      setPaymentStatusDraft(selectedOrder.paymentStatus);
    }
  }, [selectedOrder, isStatusDialogOpen]);

  const filteredOrders = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return orders.filter((order) => {
      const matchesSearch =
        order.orderNumber.toLowerCase().includes(query) ||
        order.customerName.toLowerCase().includes(query) ||
        order.customerPhone.includes(searchQuery);
      const matchesPlatform = filterPlatform === "all" || order.platform === filterPlatform;
      const matchesStatus = filterStatus === "all" || order.status === filterStatus;
      return matchesSearch && matchesPlatform && matchesStatus;
    });
  }, [orders, searchQuery, filterPlatform, filterStatus]);

  const totalOrdersCount = orders.length;
  const pendingOrders = orders.filter((o) => o.status === "pending").length;
  const processingOrders = orders.filter((o) => o.status === "processing" || o.status === "confirmed").length;
  const totalRevenue = orders
    .filter((o) => o.paymentStatus === "paid")
    .reduce((sum, o) => sum + o.total, 0);

  const resetNewOrderForm = () => {
    setNewOrderForm({
      platform: "website",
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      shippingAddress: "",
      city: "",
      paymentMethod: "cod",
      shipping: 0,
      notes: "",
      status: DEFAULT_ORDER_STATUS,
      paymentStatus: DEFAULT_PAYMENT_STATUS,
    });
    setOrderItems([]);
    setNewItem({ productName: "", sku: "", quantity: 1, price: 0 });
  };

  const ensureCustomerForOrder = useCallback(
    async (record: PlatformOrdersRecord, ordersToUse?: PlatformOrdersRecord[]) => {
      const meta = parseOrderMeta(record.order_items);
      const identifier = {
        phone: normalizePhone(meta.customer?.phone),
        email: normalizeEmail(meta.customer?.email),
      };

      if (!identifier.phone && !identifier.email) return;

      // Use provided orders or fall back to current orderRecords
      const ordersForCalculation = ordersToUse ?? orderRecords;
      const stats = computeCustomerStatsFromOrders(
        ordersForCalculation,
        identifier
      );

      // Stats will always be returned (even if 0) - no need for fallback
      const finalStats = stats;

      const baseValues: PlatformCustomersInsert = {
        customer_name: meta.customer?.name ?? "Platform Customer",
        customer_phone: meta.customer?.phone ?? null,
        customer_email: meta.customer?.email ?? null,
        customer_address: meta.customer?.address ?? null,
        customer_city: meta.customer?.city ?? null,
        customer_status: "active",
        total_orders: finalStats.totalOrders,
        total_spent: finalStats.totalSpent,
        last_order_date: finalStats.lastOrderDate ? finalStats.lastOrderDate.substring(0, 10) : null,
        platform_id: record.platform_id,
      };

      const existing = platformCustomersRecords.find((customer) => {
        const customerPhone = normalizePhone(customer.customer_phone);
        const customerEmail = normalizeEmail(customer.customer_email);
        if (identifier.phone && customerPhone === identifier.phone) return true;
        if (identifier.email && customerEmail === identifier.email) return true;
        return false;
      });

      try {
        if (existing) {
          const updatePayload: PlatformCustomersUpdate = {
            customer_id: existing.customer_id,
            ...baseValues,
          };
          await dispatch(
            thunks.platform_customers.updateOne({
              id: existing.customer_id,
              values: updatePayload,
            })
          ).unwrap();
        } else {
          await dispatch(thunks.platform_customers.createOne(baseValues)).unwrap();
        }
      } catch (error: any) {
        const message = error?.message || error?.error?.message || "Failed to sync platform customer";
        toast.error(message);
      }
    },
    [dispatch, orderRecords, platformCustomersRecords]
  );

  // Sync all orders to create/update customers
  const syncAllCustomers = useCallback(async () => {
    try {
      toast.loading("Syncing customers from all orders...");
      // Get unique customer identifiers from all orders
      const customerMap = new Map<string, PlatformOrdersRecord>();
      
      orderRecords.forEach((record) => {
        const meta = parseOrderMeta(record.order_items);
        const phone = normalizePhone(meta.customer?.phone);
        const email = normalizeEmail(meta.customer?.email);
        const identifier = phone || email;
        
        if (!identifier) return;
        
        // Keep the most recent order for each customer
        const existing = customerMap.get(identifier);
        if (!existing) {
          customerMap.set(identifier, record);
        } else {
          const existingDate = toIsoString(existing.order_last_modified ?? existing.order_created_date);
          const currentDate = toIsoString(record.order_last_modified ?? record.order_created_date);
          if (currentDate && existingDate && currentDate > existingDate) {
            customerMap.set(identifier, record);
          }
        }
      });

      // Sync each unique customer
      let synced = 0;
      for (const record of customerMap.values()) {
        await ensureCustomerForOrder(record);
        synced++;
      }

      // Refetch customers to show updated list
      await dispatch(thunks.platform_customers.fetchAll(undefined));
      toast.dismiss();
      toast.success(`Synced ${synced} customers from ${orderRecords.length} orders`);
    } catch (error: any) {
      toast.dismiss();
      const message = error?.message || error?.error?.message || "Failed to sync customers";
      toast.error(message);
    }
  }, [orderRecords, ensureCustomerForOrder, dispatch]);

  const handleAddItem = () => {
    if (!newItem.productName || !newItem.sku || newItem.quantity <= 0 || newItem.price <= 0) {
      toast.error("Please fill all item fields");
      return;
    }

    const item: OrderItemForm = {
      productId: `item-${Date.now()}`,
      productName: newItem.productName,
      sku: newItem.sku,
      quantity: newItem.quantity,
      price: newItem.price,
      total: newItem.quantity * newItem.price,
    };

    setOrderItems((prev) => [...prev, item]);
    setNewItem({ productName: "", sku: "", quantity: 1, price: 0 });
    toast.success("Item added");
  };

  const handleRemoveItem = (index: number) => {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddOrder = async () => {
    if (!newOrderForm.customerName || !newOrderForm.customerPhone || !newOrderForm.city || orderItems.length === 0) {
      toast.error("Please fill all required fields and add at least one item");
      return;
    }

    const subtotal = orderItems.reduce((sum, item) => sum + item.total, 0);
    const tax = subtotal * 0.15;
    const total = subtotal + newOrderForm.shipping + tax;
    const now = new Date();
    const nowIso = now.toISOString();

    const platformPrefixes: Record<OrderPlatform, string> = {
      noon: "NOON",
      amazon: "AMZ",
      website: "WEB",
      "golden-scent": "GS",
      trendyol: "TY",
      "sales-rep": "SR",
      other: "OTH",
    };

    const prefix = platformPrefixes[newOrderForm.platform];
    const orderNumber = `${prefix}-${now.getFullYear()}-${String(orderRecords.length + 1).padStart(3, "0")}`;

    const payload: Omit<PlatformOrdersInsert, 'order_total_amount'> = {
      order_id: undefined,
      order_platform_reference: orderNumber,
      order_status: newOrderForm.status,
      payment_status: newOrderForm.paymentStatus,
      order_items_subtotal: subtotal,
      order_shipping_cost: newOrderForm.shipping,
      // order_total_amount is omitted - column has DEFAULT or is computed
      order_created_date: nowIso.substring(0, 10),
      order_last_modified: nowIso,
      notes: newOrderForm.notes || null,
      platform_id: null,
      customer_id: null,
      order_items: buildOrderMeta(
        newOrderForm.platform,
        {
          name: newOrderForm.customerName,
          phone: newOrderForm.customerPhone,
          email: newOrderForm.customerEmail,
          address: newOrderForm.shippingAddress,
          city: newOrderForm.city,
        },
        orderItems,
        {
          tax,
          shipping: newOrderForm.shipping,
          total,
          orderDate: nowIso,
          paymentMethod: newOrderForm.paymentMethod,
          notes: newOrderForm.notes || null,
          trackingNumber: null,
        }
      ),
    };

    try {
      const created = await dispatch(thunks.platform_orders.createOne(payload)).unwrap();
      toast.success("Order added successfully");
      setIsAddDialogOpen(false);
      resetNewOrderForm();
      // Always sync customer for all orders (stats will only count confirmed/paid)
      await ensureCustomerForOrder(created);
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to add order";
      toast.error(message);
    }
  };

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const updated = await dispatch(
        thunks.platform_orders.updateOne({
          id: orderId,
          values: {
            order_status: newStatus,
            order_last_modified: new Date().toISOString(),
          },
        })
      ).unwrap();
      toast.success("Order status updated");
      // Refetch orders to ensure we have latest data, then sync customer stats
      await dispatch(thunks.platform_orders.fetchAll(undefined));
      // Use updated record merged with existing orders for calculation
      const ordersForCalc = orderRecords.map(o => o.order_id === updated.order_id ? updated : o);
      await ensureCustomerForOrder(updated, ordersForCalc);
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to update status";
      toast.error(message);
    }
  };

  const handleUpdatePaymentStatus = async (orderId: string, newStatus: OrderPaymentStatus) => {
    try {
      const updated = await dispatch(
        thunks.platform_orders.updateOne({
          id: orderId,
          values: {
            payment_status: newStatus,
            order_last_modified: new Date().toISOString(),
          },
        })
      ).unwrap();
      toast.success("Payment status updated");
      // Refetch orders to ensure we have latest data, then sync customer stats
      await dispatch(thunks.platform_orders.fetchAll(undefined));
      // Use updated record merged with existing orders for calculation
      const ordersForCalc = orderRecords.map(o => o.order_id === updated.order_id ? updated : o);
      await ensureCustomerForOrder(updated, ordersForCalc);
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to update payment status";
      toast.error(message);
    }
  };

  const handleUpdateBothStatuses = async () => {
    if (!selectedOrderId || !selectedOrder) return;

    const updates: Partial<PlatformOrdersRecord> = {};
    if (statusDraft !== selectedOrder.status) updates.order_status = statusDraft;
    if (paymentStatusDraft !== selectedOrder.paymentStatus) updates.payment_status = paymentStatusDraft;

    if (Object.keys(updates).length === 0) {
      setIsStatusDialogOpen(false);
      return;
    }

    updates.order_last_modified = new Date().toISOString();

    try {
      const updated = await dispatch(
        thunks.platform_orders.updateOne({
          id: selectedOrderId,
          values: updates,
        })
      ).unwrap();
      toast.success("Order updated successfully");
      setIsStatusDialogOpen(false);
      // Refetch orders to ensure we have latest data, then sync customer stats
      await dispatch(thunks.platform_orders.fetchAll(undefined));
      // Use updated record merged with existing orders for calculation
      const ordersForCalc = orderRecords.map(o => o.order_id === updated.order_id ? updated : o);
      await ensureCustomerForOrder(updated, ordersForCalc);
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to update order";
      toast.error(message);
    }
  };

  const openStatusDialog = (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsStatusDialogOpen(true);
  };

  const openDetailsDialog = (orderId: string) => {
    setSelectedOrderId(orderId);
    setIsDetailsDialogOpen(true);
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

  const exportToExcel = () => {
    try {
      const exportData = filteredOrders.map((order) => ({
        "Order Number": order.orderNumber,
        "Platform": order.platform,
        "Customer Name": order.customerName,
        "Customer Phone": order.customerPhone,
        "Customer Email": order.customerEmail,
        "Shipping Address": order.shippingAddress,
        "City": order.city,
        "Items Count": order.items.length,
        "Items Details": order.items.map(i => `${i.productName} (Qty: ${i.quantity}, Price: ${i.price})`).join("; "),
        "Subtotal (SAR)": order.subtotal,
        "Shipping (SAR)": order.shipping,
        "Tax (SAR)": order.tax,
        "Total (SAR)": order.total,
        "Status": order.status,
        "Payment Status": order.paymentStatus,
        "Payment Method": order.paymentMethod,
        "Order Date": order.orderDate || "",
        "Created At": order.createdAt || "",
        "Last Modified": order.lastModified || "",
        "Tracking Number": order.trackingNumber || "",
        "Notes": order.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 18 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 25 },
        { wch: 30 }, { wch: 15 }, { wch: 10 }, { wch: 50 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 15 },
        { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
        { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Platform Orders");
      const fileName = `platform_orders_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      pending: { variant: "secondary" as const, label: "Pending" },
      confirmed: { variant: "default" as const, label: "Confirmed" },
      processing: { variant: "default" as const, label: "Processing" },
      shipped: { variant: "default" as const, label: "Shipped" },
      delivered: { variant: "default" as const, label: "Delivered" },
      cancelled: { variant: "destructive" as const, label: "Cancelled" },
    };
    return badges[status as keyof typeof badges] ?? badges.pending;
  };

  const getPaymentStatusBadge = (status: string) => {
    const badges = {
      pending: { color: "bg-gray-100 text-gray-700", label: "Pending" },
      paid: { color: "bg-green-100 text-green-700", label: "Paid" },
      refunded: { color: "bg-red-100 text-red-700", label: "Refunded" },
    };
    return badges[status as keyof typeof badges] ?? badges.pending;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Platform Orders</h2>
        <p className="text-muted-foreground mt-1">Manage orders from Amazon, Noon, and your website</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalOrdersCount}</div>
            <p className="text-xs text-muted-foreground">Across all platforms</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{pendingOrders}</div>
            <p className="text-xs text-muted-foreground">Awaiting confirmation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Processing</CardTitle>
            <Package className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{processingOrders}</div>
            <p className="text-xs text-muted-foreground">Being prepared</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <Package className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalRevenue)} ر.س</div>
            <p className="text-xs text-muted-foreground">Paid orders</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <CardTitle>Orders List</CardTitle>
              <CardDescription>View and manage all platform orders</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={syncAllCustomers} variant="outline" className="gap-2" disabled={ordersLoading}>
                <RefreshCcw className="h-4 w-4" />
                Sync Customers
              </Button>
              <Button onClick={exportToExcel} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export Excel
              </Button>
              <Button onClick={() => setIsAddDialogOpen(true)} disabled={ordersLoading}>
                <Plus className="mr-2 h-4 w-4" />
                Add New Order
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search orders..."
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
                <SelectItem value="noon">Noon</SelectItem>
                <SelectItem value="amazon">Amazon</SelectItem>
                <SelectItem value="website">Website</SelectItem>
                <SelectItem value="golden-scent">Golden Scent</SelectItem>
                <SelectItem value="trendyol">Trendyol</SelectItem>
                <SelectItem value="sales-rep">Sales Rep</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-[180px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="confirmed">Confirmed</SelectItem>
                <SelectItem value="processing">Processing</SelectItem>
                <SelectItem value="shipped">Shipped</SelectItem>
                <SelectItem value="delivered">Delivered</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order #</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Modified</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      {ordersLoading ? "Loading orders..." : "No orders found"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredOrders.map((order) => {
                    const platformBadge = getPlatformBadge(order.platform);
                    const statusBadge = getStatusBadge(order.status);
                    const paymentBadge = getPaymentStatusBadge(order.paymentStatus);

                    return (
                      <TableRow key={order.id}>
                        <TableCell className="font-medium">{order.orderNumber}</TableCell>
                        <TableCell>
                          <Badge className={platformBadge.color}>{platformBadge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium">{order.customerName}</div>
                            <div className="text-sm text-muted-foreground">{order.customerPhone}</div>
                          </div>
                        </TableCell>
                        <TableCell>{order.items.length} item(s)</TableCell>
                        <TableCell className="font-medium">{formatCurrency(order.total)} ر.س</TableCell>
                        <TableCell>
                          <Badge className={paymentBadge.color}>{paymentBadge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadge.variant}>{statusBadge.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDate(order.createdAt)}</div>
                          <div className="text-xs text-muted-foreground">{formatTime(order.createdAt)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDate(order.lastModified)}</div>
                          <div className="text-xs text-muted-foreground">{formatTime(order.lastModified)}</div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openStatusDialog(order.id)}
                              disabled={ordersLoading}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openDetailsDialog(order.id)}
                              disabled={ordersLoading}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </div>
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

      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Order Details</DialogTitle>
            <DialogDescription>View complete order information</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <ScrollArea className="max-h-[70vh] pr-4">
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Order Number</Label>
                    <p className="font-medium">{selectedOrder.orderNumber}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Platform</Label>
                    <div className="mt-1">
                      <Badge className={getPlatformBadge(selectedOrder.platform).color}>
                        {getPlatformBadge(selectedOrder.platform).label}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Order Date</Label>
                    <p className="font-medium">{formatDate(selectedOrder.orderDate)}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Payment Method</Label>
                    <p className="font-medium">{selectedOrder.paymentMethod}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Customer Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <p className="font-medium">{selectedOrder.customerName}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Phone</Label>
                      <p className="font-medium">{selectedOrder.customerPhone}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="font-medium">{selectedOrder.customerEmail || "-"}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Shipping Address</Label>
                      <p className="font-medium">{selectedOrder.shippingAddress}, {selectedOrder.city}</p>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Order Items</h4>
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedOrder.items.map((item) => (
                          <TableRow key={item.productId}>
                            <TableCell className="font-medium">{item.productName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.sku}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{formatCurrency(item.price)} ر.س</TableCell>
                            <TableCell className="font-medium">{formatCurrency(item.total)} ر.س</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold mb-3">Order Summary</h4>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-medium">{formatCurrency(selectedOrder.subtotal)} ر.س</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Shipping</span>
                      <span className="font-medium">{formatCurrency(selectedOrder.shipping)} ر.س</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax (15%)</span>
                      <span className="font-medium">{formatCurrency(selectedOrder.tax)} ر.س</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="font-semibold">Total</span>
                      <span className="font-bold text-lg">{formatCurrency(selectedOrder.total)} ر.س</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Order Status</Label>
                    <Select
                      value={selectedOrder.status}
                      onValueChange={(value) => handleUpdateStatus(selectedOrder.id, value as OrderStatus)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="confirmed">Confirmed</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="shipped">Shipped</SelectItem>
                        <SelectItem value="delivered">Delivered</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Payment Status</Label>
                    <Select
                      value={selectedOrder.paymentStatus}
                      onValueChange={(value) => handleUpdatePaymentStatus(selectedOrder.id, value as OrderPaymentStatus)}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                        <SelectItem value="refunded">Refunded</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedOrder.trackingNumber && (
                  <div>
                    <Label className="text-muted-foreground">Tracking Number</Label>
                    <div className="flex items-center gap-2 mt-1">
                      <p className="font-medium font-mono">{selectedOrder.trackingNumber}</p>
                      <Button variant="ghost" size="icon">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}

                {selectedOrder.notes && (
                  <div>
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="mt-1 text-sm">{selectedOrder.notes}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
              Close
            </Button>
            <Button>
              <Download className="mr-2 h-4 w-4" />
              Print Invoice
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isStatusDialogOpen} onOpenChange={setIsStatusDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Update Order Status</DialogTitle>
            <DialogDescription>Update both order and payment status</DialogDescription>
          </DialogHeader>
          {selectedOrder && (
            <div className="space-y-4 py-4">
              <div>
                <Label>Order Status</Label>
                <Select value={statusDraft} onValueChange={(value) => setStatusDraft(value as OrderStatus)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="shipped">Shipped</SelectItem>
                    <SelectItem value="delivered">Delivered</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Status</Label>
                <Select value={paymentStatusDraft} onValueChange={(value) => setPaymentStatusDraft(value as OrderPaymentStatus)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                    <SelectItem value="refunded">Refunded</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsStatusDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdateBothStatuses}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
        setIsAddDialogOpen(open);
        if (!open) resetNewOrderForm();
      }}>
        <DialogContent className="max-w-7xl max-h-[95vh] w-[95vw]">
          <DialogHeader>
            <DialogTitle>Add New Order</DialogTitle>
            <DialogDescription>Create a new order from platform</DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[75vh] pr-4">
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Platform *</Label>
                  <Select
                    value={newOrderForm.platform}
                    onValueChange={(value) => setNewOrderForm((prev) => ({ ...prev, platform: value as OrderPlatform }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="noon">Noon</SelectItem>
                      <SelectItem value="amazon">Amazon</SelectItem>
                      <SelectItem value="website">Website</SelectItem>
                      <SelectItem value="golden-scent">Golden Scent</SelectItem>
                      <SelectItem value="trendyol">Trendyol</SelectItem>
                      <SelectItem value="sales-rep">Sales Rep</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Payment Method *</Label>
                  <Select
                    value={newOrderForm.paymentMethod}
                    onValueChange={(value) => setNewOrderForm((prev) => ({ ...prev, paymentMethod: value as OrderPaymentMethod }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cod">Cash on Delivery</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                      <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                      <SelectItem value="apple-pay">Apple Pay</SelectItem>
                      <SelectItem value="tamara">Tamara</SelectItem>
                      <SelectItem value="tabby">Tabby</SelectItem>
                      <SelectItem value="online-payment">Online Payment</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Initial Order Status</Label>
                  <Select value={newOrderForm.status} onValueChange={(value) => setNewOrderForm((prev) => ({ ...prev, status: value as OrderStatus }))}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="confirmed">Confirmed</SelectItem>
                      <SelectItem value="processing">Processing</SelectItem>
                      <SelectItem value="shipped">Shipped</SelectItem>
                      <SelectItem value="delivered">Delivered</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Initial Payment Status</Label>
                  <Select
                    value={newOrderForm.paymentStatus}
                    onValueChange={(value) =>
                      setNewOrderForm((prev) => ({ ...prev, paymentStatus: value as OrderPaymentStatus }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="refunded">Refunded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Customer Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Customer Name *</Label>
                    <Input
                      value={newOrderForm.customerName}
                      onChange={(e) => setNewOrderForm((prev) => ({ ...prev, customerName: e.target.value }))}
                      placeholder="Enter customer name"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Phone *</Label>
                    <Input
                      value={newOrderForm.customerPhone}
                      onChange={(e) => setNewOrderForm((prev) => ({ ...prev, customerPhone: e.target.value }))}
                      placeholder="+966 50 123 4567"
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Email</Label>
                    <Input
                      value={newOrderForm.customerEmail}
                      onChange={(e) => setNewOrderForm((prev) => ({ ...prev, customerEmail: e.target.value }))}
                      placeholder="customer@email.com"
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Shipping Address</Label>
                    <Input
                      value={newOrderForm.shippingAddress}
                      onChange={(e) => setNewOrderForm((prev) => ({ ...prev, shippingAddress: e.target.value }))}
                      placeholder="Street address"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>City *</Label>
                    <Input
                      value={newOrderForm.city}
                      onChange={(e) => setNewOrderForm((prev) => ({ ...prev, city: e.target.value }))}
                      placeholder="City"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Shipping Cost (ر.س)</Label>
                    <Input
                      type="number"
                      value={newOrderForm.shipping}
                      onChange={(e) =>
                        setNewOrderForm((prev) => ({ ...prev, shipping: parseFloat(e.target.value) || 0 }))
                      }
                      placeholder="0"
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-semibold mb-3">Order Items</h4>
                <div className="border rounded-lg p-4 bg-muted/30 mb-3">
                  <div className="flex gap-4">
                    <div className="flex-1 grid grid-cols-2 gap-4">
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Product Name *</Label>
                        <Input
                          value={newItem.productName}
                          onChange={(e) => setNewItem((prev) => ({ ...prev, productName: e.target.value }))}
                          placeholder="e.g., Product ABC"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">SKU *</Label>
                        <Input
                          value={newItem.sku}
                          onChange={(e) => setNewItem((prev) => ({ ...prev, sku: e.target.value }))}
                          placeholder="e.g., SKU-12345"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Quantity *</Label>
                        <Input
                          type="number"
                          value={newItem.quantity}
                          onChange={(e) => setNewItem((prev) => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))}
                          placeholder="1"
                          min="1"
                          className="h-9"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground mb-1 block">Price (ر.س) *</Label>
                        <Input
                          type="number"
                          value={newItem.price}
                          onChange={(e) => setNewItem((prev) => ({ ...prev, price: parseFloat(e.target.value) || 0 }))}
                          placeholder="0.00"
                          min="0"
                          step="0.01"
                          className="h-9"
                        />
                      </div>
                    </div>
                    <div className="flex items-end">
                      <Button onClick={handleAddItem} type="button" className="h-[50px] min-w-[120px]">
                        <Plus className="h-4 w-4 mr-1" />
                        Add Item
                      </Button>
                    </div>
                  </div>
                  
                </div>

                {orderItems.length > 0 && (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead>SKU</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Price</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {orderItems.map((item, index) => (
                          <TableRow key={item.productId}>
                            <TableCell>{item.productName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{item.sku}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>{formatCurrency(item.price)} ر.س</TableCell>
                            <TableCell className="font-medium">{formatCurrency(item.total)} ر.س</TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon" onClick={() => handleRemoveItem(index)}>
                                <XCircle className="h-4 w-4 text-destructive" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    <div className="p-4 border-t bg-muted/30">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Subtotal</span>
                          <span className="font-medium">
                            {formatCurrency(orderItems.reduce((sum, item) => sum + item.total, 0))} ر.س
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Shipping</span>
                          <span className="font-medium">{formatCurrency(newOrderForm.shipping)} ر.س</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Tax (15%)</span>
                          <span className="font-medium">
                            {formatCurrency(orderItems.reduce((sum, item) => sum + item.total, 0) * 0.15)} ر.س
                          </span>
                        </div>
                        <div className="flex justify-between pt-2 border-t">
                          <span className="font-semibold">Total</span>
                          <span className="font-bold text-lg">
                            {formatCurrency(orderItems.reduce((sum, item) => sum + item.total, 0) * 1.15 + newOrderForm.shipping)} ر.س
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={newOrderForm.notes}
                  onChange={(e) => setNewOrderForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Additional notes..."
                  className="mt-1"
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddOrder} disabled={ordersLoading}>
              <Plus className="mr-2 h-4 w-4" />
              Create Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
