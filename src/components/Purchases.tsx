import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Download, FileText, DollarSign, Package, Filter, Tag, Trash2, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Checkbox } from "./ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { SupplierSelector } from "./SupplierSelector";
import type { Supplier as SupplierOption } from "./SupplierSelector";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Suppliers as SupplierRow } from "../../supabase/models/suppliers";
import type { PurchaseOrders } from "../../supabase/models/purchase_orders";

const createItemId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);

interface PurchaseReturnHistoryEntry {
  returnId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  createdAt: string | null;
}

interface PurchaseItem {
  id: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  total: number;
  returnedQuantity?: number;
  returnedAmount?: number;
  returnHistory?: PurchaseReturnHistoryEntry[];
}

interface Purchase {
  id: string;
  purchaseNumber: string;
  date: string;
  supplierId: string | null;
  supplier: string;
  category: string;
  items: PurchaseItem[];
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  taxRate: number;
  paidAmount: number;
  remainingAmount: number;
  paymentStatus: "unpaid" | "partial" | "paid";
  deliveryStatus: "pending" | "in-transit" | "delivered";
  paymentMethod?: string;
  deliveryDate?: string;
  notes?: string;
  invoiceNumber?: string;
}

const categoryColors: { [key: string]: string } = {
  "Scent Products": "bg-purple-100 text-purple-700 border-purple-200",
  "Equipment": "bg-blue-100 text-blue-700 border-blue-200",
  "Office Supplies": "bg-green-100 text-green-700 border-green-200",
  "Packaging": "bg-orange-100 text-orange-700 border-orange-200",
  "Maintenance": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Other": "bg-gray-100 text-gray-700 border-gray-200",
};

const paymentStatusColors = {
  unpaid: "bg-red-100 text-red-700 border-red-200",
  partial: "bg-yellow-100 text-yellow-700 border-yellow-200",
  paid: "bg-green-100 text-green-700 border-green-200",
};

const deliveryStatusColors = {
  pending: "bg-gray-100 text-gray-700 border-gray-200",
  "in-transit": "bg-blue-100 text-blue-700 border-blue-200",
  delivered: "bg-green-100 text-green-700 border-green-200",
};

const defaultPurchaseCategories = [
  "Scent Products",
  "Equipment",
  "Office Supplies",
  "Packaging",
  "Maintenance",
  "Other",
];

const paymentMethodLabels: Record<string, string> = {
  cash: "Cash",
  "bank-transfer": "Bank Transfer",
  "credit-card": "Credit Card",
  check: "Check",
};

const formatPaymentMethod = (method?: string) => {
  if (!method) return undefined;
  return paymentMethodLabels[method] ?? method;
};

export function Purchases() {
  const dispatch = useAppDispatch();
  const dbSuppliers = useAppSelector(selectors.suppliers.selectAll) as SupplierRow[];
  const suppliersLoading = useAppSelector(selectors.suppliers.selectLoading);
  const suppliersError = useAppSelector(selectors.suppliers.selectError);
  const dbPurchaseOrders = useAppSelector(selectors.purchase_orders.selectAll) as PurchaseOrders[];
  const purchaseOrdersLoading = useAppSelector(selectors.purchase_orders.selectLoading);
  const purchaseOrdersError = useAppSelector(selectors.purchase_orders.selectError);

  useEffect(() => {
    dispatch(thunks.purchase_orders.fetchAll(undefined));
    dispatch(thunks.suppliers.fetchAll(undefined));
  }, [dispatch]);

  const supplierFinancials = useMemo(() => {
    const outstandingMap = new Map<string, number>();

    dbPurchaseOrders.forEach((order) => {
      if (!order.supplier_id) return;
      const remaining = Number(order.purchase_remaining_amount ?? 0);
      const previous = outstandingMap.get(order.supplier_id) ?? 0;
      outstandingMap.set(order.supplier_id, Number((previous + remaining).toFixed(2)));
    });

    const financials = new Map<
      string,
      {
        currentBalance: number;
        creditBalance: number;
        payableBalance: number;
        persistedBalance: number;
      }
    >();

    dbSuppliers.forEach((supplier) => {
      const outstanding = outstandingMap.get(supplier.supplier_id) ?? 0;
      const persisted = Number(supplier.supplier_balance ?? 0);
      const currentBalance = Number((outstanding + persisted).toFixed(2));

      financials.set(supplier.supplier_id, {
        currentBalance,
        creditBalance: currentBalance < 0 ? Math.abs(currentBalance) : 0,
        payableBalance: currentBalance > 0 ? currentBalance : 0,
        persistedBalance: persisted,
      });
    });

    return financials;
  }, [dbPurchaseOrders, dbSuppliers]);

  const supplierOptions = useMemo<SupplierOption[]>(() => {
    return dbSuppliers.map((supplier, idx) => {
      const financial = supplierFinancials.get(supplier.supplier_id);
      return {
        id: idx + 1,
        name: supplier.supplier_en_name ?? supplier.supplier_ar_name ?? "Unnamed Supplier",
        mobile: supplier.supplier_phone_num ?? undefined,
        email: supplier.supplier_email ?? undefined,
        location: [supplier.supplier_address, supplier.supplier_city, supplier.supplier_country].filter(Boolean).join(", "),
        dbId: supplier.supplier_id,
        creditBalance: financial?.creditBalance ?? 0,
        payableBalance: financial?.payableBalance ?? 0,
        currentBalance: financial?.currentBalance ?? 0,
        persistedBalance: financial?.persistedBalance ?? 0,
      };
    });
  }, [dbSuppliers, supplierFinancials]);

  const supplierMap = useMemo(() => {
    const map = new Map<string, SupplierOption>();
    supplierOptions.forEach((option) => {
      if (option.dbId) {
        map.set(option.dbId, option);
      }
    });
    return map;
  }, [supplierOptions]);

  const [pendingSupplierId, setPendingSupplierId] = useState<string | null>(null);
  const [selectedSupplierOption, setSelectedSupplierOption] = useState<SupplierOption | null>(null);

  useEffect(() => {
    if (!pendingSupplierId) return;
    const match = supplierOptions.find((option) => option.dbId === pendingSupplierId);
    if (match) {
      setSelectedSupplierOption(match);
      setPendingSupplierId(null);
    }
  }, [pendingSupplierId, supplierOptions]);

  useEffect(() => {
    if (!selectedSupplierOption?.dbId) return;
    const updated = supplierMap.get(selectedSupplierOption.dbId);
    if (updated && updated !== selectedSupplierOption) {
      setSelectedSupplierOption(updated);
    }
  }, [supplierMap, selectedSupplierOption]);

  const purchases = useMemo<Purchase[]>(() => {
    return dbPurchaseOrders
      .map((order) => {
        const payload = (order.purchase_order_items ?? {}) as any;
        const rawItems = Array.isArray(payload?.items) ? payload.items : [];
        const returnedItemsRaw = Array.isArray(payload?.returned_items) ? payload.returned_items : [];
        const returnedMap = new Map<string, any>(
          returnedItemsRaw.map((entry: any) => [
            String(entry?.sourceItemId ?? entry?.id ?? entry?.item_id ?? ""),
            entry
          ])
        );
        const items: PurchaseItem[] = rawItems.map((item: any, index: number) => {
          const quantity = Number(item?.quantity ?? 0);
          const unitPrice = Number(item?.unitPrice ?? item?.price ?? 0);
          const total = Number(item?.total ?? quantity * unitPrice);
          const fallbackId = `${order.purchase_id}-${index}`;
          const id =
            item?.id ??
            item?.item_id ??
            item?.line_id ??
            item?.sku ??
            fallbackId;
          const returnedInfo = returnedMap.get(String(id));
          return {
            id: String(id),
            itemName: item?.itemName ?? item?.name ?? "",
            quantity,
            unitPrice,
            total,
            returnedQuantity: Number(returnedInfo?.totalQuantity ?? returnedInfo?.quantity ?? 0),
            returnedAmount: Number(returnedInfo?.totalAmount ?? 0),
            returnHistory: Array.isArray(returnedInfo?.history)
              ? (returnedInfo.history as PurchaseReturnHistoryEntry[])
              : []
          };
        });

        const subtotal = typeof payload?.subtotal === "number"
          ? payload.subtotal
          : items.reduce((sum, item) => sum + item.total, 0);

        const taxRate = (() => {
          const rawRate = payload?.tax_rate ?? payload?.taxRate;
          return typeof rawRate === "number" ? rawRate : Number(rawRate ?? 0);
        })();

        const taxAmount = typeof payload?.tax_amount === "number"
          ? payload.tax_amount
          : Number(((subtotal * taxRate) / 100).toFixed(2));

        const totalAmount = typeof payload?.total_amount === "number"
          ? payload.total_amount
          : Number((subtotal + taxAmount).toFixed(2));

        const paidAmount = Number(order.purchase_paid_amount ?? 0);
        const remainingAmount = Number(
          (order.purchase_remaining_amount ?? Math.max(0, totalAmount - paidAmount)).toFixed(2)
        );

        const normalizePaymentStatus = (value: string | null | undefined): Purchase["paymentStatus"] => {
          switch ((value ?? "").toLowerCase()) {
            case "paid":
              return "paid";
            case "partial":
            case "partially_paid":
              return "partial";
            case "unpaid":
            default:
              return "unpaid";
          }
        };

        const normalizeDeliveryStatus = (value: string | null | undefined): Purchase["deliveryStatus"] => {
          switch ((value ?? "").toLowerCase()) {
            case "in-transit":
            case "in_transit":
              return "in-transit";
            case "delivered":
              return "delivered";
            default:
              return "pending";
          }
        };

        let paymentStatus = normalizePaymentStatus(order.payment_status);
        if (paymentStatus === "unpaid" && remainingAmount <= 0) {
          paymentStatus = "paid";
        } else if (paymentStatus === "unpaid" && paidAmount > 0 && remainingAmount > 0) {
          paymentStatus = "partial";
        }

        const supplierInfo = order.supplier_id ? supplierMap.get(order.supplier_id) : undefined;
        const category = order.purchase_category ?? payload?.category ?? "Other";

        return {
          id: order.purchase_id,
          purchaseNumber: payload?.purchase_number ?? payload?.purchaseNumber ?? `PUR-${order.purchase_id.slice(0, 8).toUpperCase()}`,
          date: order.purchase_date,
          supplierId: order.supplier_id,
          supplier: supplierInfo?.name ?? "Unknown Supplier",
          category,
          items,
          subtotal,
          taxAmount,
          totalAmount,
          taxRate,
          paidAmount,
          remainingAmount,
          paymentStatus,
          deliveryStatus: normalizeDeliveryStatus(order.delivery_status),
          paymentMethod: order.payment_method ?? undefined,
          deliveryDate: payload?.delivery_date ?? undefined,
          notes: order.notes ?? payload?.notes ?? undefined,
          invoiceNumber: order.purchase_invoice_number ?? payload?.invoice_number ?? undefined,
        };
      })
      .sort((a, b) => {
        const dateA = a.date ? new Date(a.date).getTime() : 0;
        const dateB = b.date ? new Date(b.date).getTime() : 0;
        return dateB - dateA;
      });
  }, [dbPurchaseOrders, supplierMap]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterPaymentStatus, setFilterPaymentStatus] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedPurchase, setSelectedPurchase] = useState<Purchase | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false);

  // Form states
  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [items, setItems] = useState<PurchaseItem[]>([
    { id: createItemId(), itemName: "", quantity: 1, unitPrice: 0, total: 0 }
  ]);
  const [taxRate, setTaxRate] = useState("15");
  const [paidAmount, setPaidAmount] = useState("");
  const [useSupplierBalance, setUseSupplierBalance] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [notes, setNotes] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const categoriesFromOrders = useMemo(() => {
    return Array.from(new Set(purchases.map((purchase) => purchase.category))).filter(Boolean);
  }, [purchases]);

  const allCategories = useMemo(() => {
    return Array.from(new Set([...defaultPurchaseCategories, ...categoriesFromOrders, ...customCategories]));
  }, [categoriesFromOrders, customCategories]);

  const filteredPurchases = useMemo(() => {
    const normalizedSearch = searchQuery.trim().toLowerCase();
    return purchases.filter((purchase) => {
      const matchesSearch =
        normalizedSearch.length === 0 ||
        purchase.purchaseNumber.toLowerCase().includes(normalizedSearch) ||
        purchase.supplier.toLowerCase().includes(normalizedSearch) ||
        (purchase.invoiceNumber ?? "").toLowerCase().includes(normalizedSearch) ||
        purchase.id.toLowerCase().includes(normalizedSearch);
      const matchesCategory = filterCategory === "all" || purchase.category === filterCategory;
      const matchesPayment = filterPaymentStatus === "all" || purchase.paymentStatus === filterPaymentStatus;
      return matchesSearch && matchesCategory && matchesPayment;
    });
  }, [purchases, searchQuery, filterCategory, filterPaymentStatus]);

  const exportToExcel = () => {
    try {
      const exportData: any[] = [];
      filteredPurchases.forEach((purchase) => {
        // Add main purchase row
        exportData.push({
          "Purchase Number": purchase.purchaseNumber,
          "Date": purchase.date,
          "Supplier": purchase.supplier,
          "Category": purchase.category,
          "Items Count": purchase.items.length,
          "Items Details": purchase.items.map(i => `${i.itemName} (Qty: ${i.quantity}, Price: ${i.unitPrice})`).join("; "),
          "Subtotal (SAR)": purchase.subtotal,
          "Tax Amount (SAR)": purchase.taxAmount,
          "Total Amount (SAR)": purchase.totalAmount,
          "Paid Amount (SAR)": purchase.paidAmount,
          "Remaining Amount (SAR)": purchase.remainingAmount,
          "Payment Status": purchase.paymentStatus,
          "Delivery Status": purchase.deliveryStatus,
          "Payment Method": purchase.paymentMethod || "",
          "Delivery Date": purchase.deliveryDate || "",
          "Invoice Number": purchase.invoiceNumber || "",
          "Notes": purchase.notes || "",
        });
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 10 },
        { wch: 50 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 15 },
        { wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
        { wch: 18 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Purchases");
      const fileName = `purchases_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  const subtotal = useMemo(() => {
    return items.reduce((sum, item) => sum + Number(item.total ?? 0), 0);
  }, [items]);

  const taxRateNumber = useMemo(() => {
    const parsed = Number(taxRate);
    return Number.isFinite(parsed) ? parsed : 0;
  }, [taxRate]);

  const taxAmount = useMemo(() => {
    return Number(((subtotal * taxRateNumber) / 100).toFixed(2));
  }, [subtotal, taxRateNumber]);

  const totalAmount = useMemo(() => {
    return Number((subtotal + taxAmount).toFixed(2));
  }, [subtotal, taxAmount]);

  const availableSupplierCredit = selectedSupplierOption?.creditBalance ?? 0;
  const existingPayableBalance = selectedSupplierOption?.payableBalance ?? 0;

  const manualPaidAmountNumber = useMemo(() => {
    if (paidAmount === "") return 0;
    const parsed = Number(paidAmount);
    if (!Number.isFinite(parsed)) return 0;
    return Math.max(0, parsed);
  }, [paidAmount]);

  const appliedSupplierBalance = useSupplierBalance ? Math.min(availableSupplierCredit, totalAmount) : 0;
  const effectiveManualPayment = useSupplierBalance ? 0 : Math.min(totalAmount, manualPaidAmountNumber);
  const effectivePaidAmount = Number((appliedSupplierBalance + effectiveManualPayment).toFixed(2));
  const remainingAmount = Number(Math.max(0, totalAmount - effectivePaidAmount).toFixed(2));

  const projectedCreditBalance = useSupplierBalance
    ? Number(Math.max(0, availableSupplierCredit - appliedSupplierBalance).toFixed(2))
    : availableSupplierCredit;

  const projectedPayableBalance = Number((existingPayableBalance + remainingAmount).toFixed(2));
  const projectedNetBalance = Number((projectedPayableBalance - projectedCreditBalance).toFixed(2));
  const paidAmountInputValue = useSupplierBalance ? appliedSupplierBalance.toFixed(2) : paidAmount;
  const canUseSupplierBalance = Boolean(selectedSupplierOption?.dbId) && availableSupplierCredit > 0;

  useEffect(() => {
    if (useSupplierBalance) {
      const formatted = appliedSupplierBalance.toFixed(2);
      setPaidAmount((prev) => (prev === formatted ? prev : formatted));
    }
  }, [useSupplierBalance, appliedSupplierBalance]);

  useEffect(() => {
    if (useSupplierBalance && !canUseSupplierBalance) {
      setUseSupplierBalance(false);
      setPaidAmount("");
    }
  }, [useSupplierBalance, canUseSupplierBalance]);

  const addItemRow = () => {
    setItems((prev) => [
      ...prev,
      { id: createItemId(), itemName: "", quantity: 1, unitPrice: 0, total: 0 }
    ]);
  };

  const removeItemRow = (index: number) => {
    setItems((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateItem = (index: number, field: keyof PurchaseItem, value: any) => {
    setItems((prev) => {
      const newItems = [...prev];
      newItems[index] = { ...newItems[index], [field]: value };

      if (field === "quantity" || field === "unitPrice") {
        const quantity = Number(newItems[index].quantity) || 0;
        const unitPrice = Number(newItems[index].unitPrice) || 0;
        newItems[index].total = Number((quantity * unitPrice).toFixed(2));
        newItems[index].quantity = quantity;
        newItems[index].unitPrice = unitPrice;
      }

      return newItems;
    });
  };

  const handleQuickPaymentFill = useCallback((mode: "half" | "full") => {
    if (useSupplierBalance) return;
    const baseAmount = mode === "half" ? totalAmount / 2 : totalAmount;
    const normalized = Number.isFinite(baseAmount) ? baseAmount : 0;
    setPaidAmount(normalized.toFixed(2));
  }, [totalAmount, useSupplierBalance]);

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast.error("Please enter category name");
      return;
    }
    if (allCategories.includes(trimmed)) {
      toast.error("Category already exists");
      return;
    }
    setCustomCategories([...customCategories, trimmed]);
    categoryColors[trimmed] = "bg-gray-100 text-gray-700 border-gray-200";
    setIsAddCategoryDialogOpen(false);
    setNewCategoryName("");
    toast.success("Category added successfully!");
  };

  const handleSupplierSelect = useCallback((supplier: SupplierOption) => {
    if (supplier?.dbId) {
      setSelectedSupplierOption(supplier);
    } else {
      setSelectedSupplierOption(null);
    }
    setUseSupplierBalance(false);
    setPaidAmount("");
  }, []);

  const handleSupplierQuickAdd = useCallback((supplier: SupplierOption) => {
    const values: Partial<SupplierRow> = {
      supplier_en_name: supplier.name,
      supplier_contact_person: supplier.name,
      supplier_phone_num: supplier.mobile ?? null,
      supplier_email: supplier.email ?? null,
      supplier_address: supplier.location ?? null,
      supplier_category: "other",
      supplier_status: "active",
      supplier_payment_terms: "Net 30",
      supplier_balance: 0,
    };

    dispatch(thunks.suppliers.createOne(values as any))
      .unwrap()
      .then((created: SupplierRow) => {
        setPendingSupplierId(created.supplier_id);
        toast.success("Supplier added successfully");
      })
      .catch((error: any) => {
        toast.error(error?.message ?? "Failed to add supplier");
      });
  }, [dispatch]);

  const resetForm = useCallback(() => {
    setDate("");
    setSelectedSupplierOption(null);
    setCategory("");
    setItems([{ id: createItemId(), itemName: "", quantity: 1, unitPrice: 0, total: 0 }]);
    setTaxRate("15");
    setPaidAmount("");
    setUseSupplierBalance(false);
    setPaymentMethod("");
    setNotes("");
    setInvoiceNumber("");
  }, []);

  const handleAddPurchase = async () => {
    if (!date || !selectedSupplierOption?.dbId || !category || items.some((item) => !item.itemName.trim())) {
      toast.error("Please fill all required fields");
      return;
    }

    const normalizedItems = items.map((item, index) => {
      const quantity = Number(item.quantity) || 0;
      const unitPrice = Number(item.unitPrice) || 0;
      return {
        id: item.id || `${selectedSupplierOption.dbId ?? "item"}-${index}`,
        itemName: item.itemName.trim(),
        quantity,
        unitPrice,
        total: Number((quantity * unitPrice).toFixed(2)),
      };
    });

    const subtotalValue = normalizedItems.reduce((sum, item) => Number((sum + item.total).toFixed(2)), 0);
    const taxRateValue = Number.isFinite(taxRateNumber) ? taxRateNumber : 0;
    const taxAmountValue = Number(((subtotalValue * taxRateValue) / 100).toFixed(2));
    const totalAmountValue = Number((subtotalValue + taxAmountValue).toFixed(2));
    const appliedBalanceValue = useSupplierBalance ? Math.min(availableSupplierCredit, totalAmountValue) : 0;
    const manualPaidValue = useSupplierBalance ? 0 : Math.min(totalAmountValue, manualPaidAmountNumber);
    const paid = Number((appliedBalanceValue + manualPaidValue).toFixed(2));
    const remaining = Number(Math.max(0, totalAmountValue - paid).toFixed(2));

    let paymentStatus: Purchase["paymentStatus"] = "unpaid";
    if (remaining <= 0) {
      paymentStatus = "paid";
    } else if (paid > 0) {
      paymentStatus = "partial";
    }

    const purchaseNumber = `PUR-${new Date().getFullYear()}-${String(dbPurchaseOrders.length + 1).padStart(3, "0")}`;

    const payload: Partial<PurchaseOrders> = {
      supplier_id: selectedSupplierOption.dbId,
      purchase_date: date,
      purchase_category: category,
      payment_method: paymentMethod || null,
      purchase_invoice_number: invoiceNumber || null,
      purchase_order_items: {
        purchase_number: purchaseNumber,
        items: normalizedItems,
        subtotal: subtotalValue,
        tax_rate: taxRateValue,
        tax_amount: taxAmountValue,
        total_amount: totalAmountValue,
        notes: notes || null,
      },
      purchase_paid_amount: paid,
      purchase_remaining_amount: remaining,
      payment_status: paymentStatus,
      delivery_status: "pending",
      notes: notes || null,
    };

    try {
      await dispatch(thunks.purchase_orders.createOne(payload as any)).unwrap();

      if (useSupplierBalance && appliedBalanceValue > 0 && selectedSupplierOption?.dbId) {
        const supplierRow = dbSuppliers.find((row) => row.supplier_id === selectedSupplierOption.dbId);
        if (supplierRow) {
          const currentPersisted = Number(supplierRow.supplier_balance ?? 0);
          const updatedPersisted = Number((currentPersisted + appliedBalanceValue).toFixed(2));
          if (updatedPersisted !== currentPersisted) {
            await dispatch(
              thunks.suppliers.updateOne({
                id: supplierRow.supplier_id,
                values: { supplier_balance: updatedPersisted } as any,
              })
            ).unwrap();
          }
        }
      }

      toast.success("Purchase order created successfully!");
      setIsAddDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to create purchase order");
    }
  };

  const totalPurchases = purchases.reduce((sum, p) => sum + p.totalAmount, 0);
  const totalPaidAmount = purchases
    .filter(p => p.paymentStatus === "paid")
    .reduce((sum, p) => sum + p.totalAmount, 0);
  const unpaidAmount = purchases
    .filter(p => (p.paymentStatus === "unpaid" || p.paymentStatus === "partial"))
    .reduce((sum, p) => sum + p.remainingAmount, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Purchases Management</h2>
          <p className="text-muted-foreground mt-1">Track and manage all purchase orders and inventory</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Dialog open={isAddCategoryDialogOpen} onOpenChange={setIsAddCategoryDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Tag className="h-4 w-4" />
                Add Category
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Add New Category</DialogTitle>
                <DialogDescription>Create a custom purchase category</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="categoryName">Category Name</Label>
                  <Input 
                    id="categoryName" 
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Enter category name"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => {
                  setIsAddCategoryDialogOpen(false);
                  setNewCategoryName("");
                }}>Cancel</Button>
                <Button onClick={handleAddCategory}>Add Category</Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="h-4 w-4" />
                New Purchase Order
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl">
              <DialogHeader>
                <DialogTitle>Create Purchase Order</DialogTitle>
                <DialogDescription>Enter purchase order details and items</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="date">Date *</Label>
                    <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                  </div>
                  <div className="col-span-2">
                    <SupplierSelector
                      suppliers={supplierOptions}
                      selectedSupplierId={selectedSupplierOption?.id}
                      onSupplierSelect={handleSupplierSelect}
                      onSupplierAdd={handleSupplierQuickAdd}
                      label="Supplier"
                      placeholder="Search supplier by name or mobile..."
                      required
                    />
                    {suppliersLoading && (
                      <p className="mt-2 text-xs text-muted-foreground">Loading suppliers...</p>
                    )}
                    {suppliersError && (
                      <p className="mt-2 text-xs text-destructive">Failed to load suppliers: {suppliersError}</p>
                    )}
                    {selectedSupplierOption && (
                      <div className="mt-3 space-y-1 text-sm">
                        {availableSupplierCredit > 0 && (
                          <div className="flex items-center justify-between text-green-600 font-medium">
                            <span>Supplier Balance (credit)</span>
                            <span>{availableSupplierCredit.toLocaleString()} ر.س</span>
                          </div>
                        )}
                        {existingPayableBalance > 0 && (
                          <div className="flex items-center justify-between text-red-600 font-medium">
                            <span>Amount Due to Supplier</span>
                            <span>{existingPayableBalance.toLocaleString()} ر.س</span>
                          </div>
                        )}
                        {availableSupplierCredit <= 0 && existingPayableBalance <= 0 && (
                          <div className="text-xs text-muted-foreground">Balance is currently settled</div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="category">Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger id="category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        {allCategories.map((cat) => (
                          <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label>Items *</Label>
                    <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add Item
                    </Button>
                  </div>
                  
                  <div className="border rounded-lg p-4 space-y-3">
                    {items.map((item, index) => (
                      <div key={item.id} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-5 space-y-1">
                          <Label className="text-xs">Item Name</Label>
                          <Input 
                            value={item.itemName}
                            onChange={(e) => updateItem(index, "itemName", e.target.value)}
                            placeholder="Item description"
                            className="h-9"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Quantity</Label>
                          <Input 
                            type="number"
                            value={item.quantity}
                            onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 0)}
                            className="h-9"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Unit Price</Label>
                          <Input 
                            type="number"
                            value={item.unitPrice}
                            onChange={(e) => updateItem(index, "unitPrice", parseFloat(e.target.value) || 0)}
                            className="h-9"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label className="text-xs">Total</Label>
                          <Input 
                            value={item.total.toFixed(2)}
                            disabled
                            className="h-9 bg-muted"
                          />
                        </div>
                        <div className="col-span-1">
                          {items.length > 1 && (
                            <Button 
                              type="button"
                              variant="ghost" 
                              size="icon"
                              className="h-9 w-9"
                              onClick={() => removeItemRow(index)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                    
                    <div className="pt-3 border-t space-y-2">
                      <div className="flex justify-between items-center text-sm">
                        <span className="text-muted-foreground">Subtotal</span>
                        <span className="font-medium">
                          {subtotal.toLocaleString()} ر.س
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">Tax</span>
                          <Input 
                            type="number" 
                            value={taxRate} 
                            onChange={(e) => setTaxRate(e.target.value)}
                            className="w-16 h-6 text-xs"
                            placeholder="15"
                          />
                          <span className="text-muted-foreground">%</span>
                        </div>
                        <span className="font-medium">
                          {taxAmount.toLocaleString()} ر.س
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-2 border-t">
                        <span className="font-medium">Total Amount</span>
                        <span className="text-xl font-bold text-primary">
                          {totalAmount.toLocaleString()} ر.س
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="paidAmount">Paid Amount (SAR)</Label>
                    <Input 
                      id="paidAmount" 
                      type="number"
                      value={paidAmountInputValue} 
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder="0.00"
                      disabled={useSupplierBalance}
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox
                        id="useSupplierBalance"
                        checked={useSupplierBalance}
                        onCheckedChange={(checked) => setUseSupplierBalance(Boolean(checked))}
                        disabled={!canUseSupplierBalance}
                      />
                      <Label
                        htmlFor="useSupplierBalance"
                        className="text-sm font-normal text-muted-foreground"
                      >
                        Use Supplier Balance
                      </Label>
                    </div>
                    {selectedSupplierOption && (
                      <div className="space-y-1 pt-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-muted-foreground">Projected balance after order</span>
                          <span
                            className={
                              projectedNetBalance > 0
                                ? "text-red-600 font-medium"
                                : projectedNetBalance < 0
                                  ? "text-green-600 font-medium"
                                  : "text-muted-foreground font-medium"
                            }
                          >
                            {Math.abs(projectedNetBalance).toLocaleString()} ر.س{" "}
                            {projectedNetBalance > 0 ? "(due)" : projectedNetBalance < 0 ? "(credit)" : "(settled)"}
                          </span>
                        </div>
                        {!canUseSupplierBalance && availableSupplierCredit <= 0 && (
                          <p className="text-muted-foreground">
                            No supplier credit available to apply.
                          </p>
                        )}
                      </div>
                    )}
                    <div className="flex items-center gap-2 pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickPaymentFill("half")}
                        disabled={useSupplierBalance || totalAmount === 0}
                      >
                        50%
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleQuickPaymentFill("full")}
                        disabled={useSupplierBalance || totalAmount === 0}
                      >
                        Full Amount
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Remaining Amount (SAR)</Label>
                    <Input 
                      value={remainingAmount.toFixed(2)}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="paymentMethod">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger id="paymentMethod">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="credit-card">Credit Card</SelectItem>
                        <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                        <SelectItem value="check">Check</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="invoiceNumber">Invoice Number</Label>
                    <Input 
                      id="invoiceNumber" 
                      value={invoiceNumber} 
                      onChange={(e) => setInvoiceNumber(e.target.value)}
                      placeholder="INV-1234"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea 
                    id="notes" 
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes"
                    rows={2}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleAddPurchase} className="bg-purple-600 hover:bg-purple-700 text-white">Create Purchase Order</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Purchases</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPurchases.toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{totalPaidAmount.toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">Completed payments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Unpaid</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{unpaidAmount.toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">Pending payments</p>
          </CardContent>
        </Card>
      </div>

      {/* Purchases Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Purchase Orders</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[180px]">
                  <Package className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {allCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterPaymentStatus} onValueChange={setFilterPaymentStatus}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="partial">Partial</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search purchases..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {purchaseOrdersLoading && (
            <div className="mb-4 text-sm text-muted-foreground">Loading purchase orders...</div>
          )}
          {purchaseOrdersError && (
            <div className="mb-4 text-sm text-destructive">{purchaseOrdersError}</div>
          )}
          {!purchaseOrdersLoading && !purchaseOrdersError && filteredPurchases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No purchases found. Create your first purchase order!</p>
            </div>
          ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Purchase #</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Subtotal</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPurchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span className="font-mono text-sm">{purchase.purchaseNumber}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {new Date(purchase.date).toLocaleDateString('en-GB', { 
                        month: 'short', 
                        day: 'numeric', 
                        year: 'numeric' 
                      })}
                    </TableCell>
                    <TableCell>{purchase.supplier}</TableCell>
                    <TableCell>
                      <Badge className={categoryColors[purchase.category] || categoryColors.Other}>
                        {purchase.category}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">{purchase.items.length} items</div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {purchase.subtotal.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {purchase.taxAmount.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="font-semibold">
                      {purchase.totalAmount.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className="text-green-600">
                      {purchase.paidAmount.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell className={purchase.remainingAmount > 0 ? "text-orange-600 font-medium" : "text-muted-foreground"}>
                      {purchase.remainingAmount.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell>
                      <Badge className={paymentStatusColors[purchase.paymentStatus]}>
                        {purchase.paymentStatus}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={deliveryStatusColors[purchase.deliveryStatus]}>
                        {purchase.deliveryStatus}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedPurchase(purchase);
                            setIsDetailsDialogOpen(true);
                          }}
                        >
                          <FileText className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        <Button variant="ghost" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Purchase Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="w-full sm:max-w-[95vw] lg:max-w-5xl xl:max-w-6xl max-h-[90vh] overflow-hidden">
          <DialogHeader className="px-2 sm:px-4">
            <DialogTitle>Purchase Order Details - {selectedPurchase?.purchaseNumber}</DialogTitle>
            <DialogDescription>Complete purchase order information</DialogDescription>
          </DialogHeader>

          {selectedPurchase && (
            <div className="flex flex-col gap-6 px-2 sm:px-4 pb-4 lg:pb-6 overflow-y-auto max-h-[calc(90vh-6rem)]">
              <Card>
                <CardHeader>
                  <CardTitle>Order Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Purchase Number</Label>
                      <p className="font-mono break-all">{selectedPurchase.purchaseNumber}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Date</Label>
                      <p>{new Date(selectedPurchase.date).toLocaleDateString('en-GB')}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Supplier</Label>
                      <p className="font-medium break-words">{selectedPurchase.supplier}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Category</Label>
                      <Badge className={categoryColors[selectedPurchase.category]}>
                        {selectedPurchase.category}
                      </Badge>
                    </div>
                    {selectedPurchase.invoiceNumber && (
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">Invoice Number</Label>
                        <p className="font-mono break-all">{selectedPurchase.invoiceNumber}</p>
                      </div>
                    )}
                    {selectedPurchase.paymentMethod && (
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">Payment Method</Label>
                        <p>{formatPaymentMethod(selectedPurchase.paymentMethod)}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Name</TableHead>
                          <TableHead>Quantity</TableHead>
                          <TableHead>Returned Qty</TableHead>
                          <TableHead>Unit Price</TableHead>
                          <TableHead>Total</TableHead>
                          <TableHead>Returned Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedPurchase.items.map((item, index) => (
                          <TableRow key={index}>
                            <TableCell>{item.itemName}</TableCell>
                            <TableCell>{item.quantity}</TableCell>
                            <TableCell>
                              {item.returnedQuantity ? item.returnedQuantity.toLocaleString() : "0"}
                            </TableCell>
                            <TableCell>{item.unitPrice.toLocaleString()} ر.س</TableCell>
                            <TableCell className="font-medium">{item.total.toLocaleString()} ر.س</TableCell>
                            <TableCell className="font-medium">
                              {item.returnedAmount ? item.returnedAmount.toLocaleString() : "0"} ر.س
                            </TableCell>
                          </TableRow>
                        ))}
                        <TableRow className="border-t-2">
                          <TableCell colSpan={5} className="text-right font-medium">Subtotal</TableCell>
                          <TableCell className="font-medium">{selectedPurchase.subtotal.toLocaleString()} ر.س</TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell colSpan={5} className="text-right text-muted-foreground">Tax (15%)</TableCell>
                          <TableCell className="text-muted-foreground">{selectedPurchase.taxAmount.toLocaleString()} ر.س</TableCell>
                        </TableRow>
                        <TableRow className="border-t">
                          <TableCell colSpan={5} className="text-right font-bold">Total Amount</TableCell>
                          <TableCell className="font-bold text-primary">{selectedPurchase.totalAmount.toLocaleString()} ر.س</TableCell>
                        </TableRow>
                        <TableRow className="bg-green-50">
                          <TableCell colSpan={5} className="text-right font-medium text-green-700">Paid Amount</TableCell>
                          <TableCell className="font-medium text-green-700">{selectedPurchase.paidAmount.toLocaleString()} ر.س</TableCell>
                        </TableRow>
                        <TableRow className="bg-orange-50">
                          <TableCell colSpan={5} className="text-right font-medium text-orange-700">Remaining Amount</TableCell>
                          <TableCell className="font-medium text-orange-700">{selectedPurchase.remainingAmount.toLocaleString()} ر.س</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Status Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Payment Status</Label>
                      <Badge className={paymentStatusColors[selectedPurchase.paymentStatus]}>
                        {selectedPurchase.paymentStatus}
                      </Badge>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground">Delivery Status</Label>
                      <Badge className={deliveryStatusColors[selectedPurchase.deliveryStatus]}>
                        {selectedPurchase.deliveryStatus}
                      </Badge>
                    </div>
                    {selectedPurchase.deliveryDate && (
                      <div className="space-y-1">
                        <Label className="text-muted-foreground">Delivery Date</Label>
                        <p>{new Date(selectedPurchase.deliveryDate).toLocaleDateString('en-GB')}</p>
                      </div>
                    )}
                    {selectedPurchase.notes && (
                      <div className="md:col-span-2 space-y-1">
                        <Label className="text-muted-foreground">Notes</Label>
                        <p>{selectedPurchase.notes}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
