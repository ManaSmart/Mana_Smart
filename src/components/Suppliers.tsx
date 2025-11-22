import { useMemo, useState, useEffect } from "react";
import { Plus, Search, Edit, Trash2, Building2, DollarSign, FileText, Eye, TrendingDown, User, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { thunks, selectors } from "../redux-toolkit/slices";
import { ScrollArea } from "./ui/scroll-area";
import type { Suppliers as SupplierRow } from "../../supabase/models/suppliers";
import type { PurchaseOrders } from "../../supabase/models/purchase_orders";
import type { PurchasePayments } from "../../supabase/models/purchase_payments";

interface Supplier {
  id: number;
  dbId: string;
  supplierCode: string;
  nameEn: string;
  nameAr: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  country: string;
  category: "raw-materials" | "packaging" | "equipment" | "services" | "other";
  taxNumber: string;
  paymentTerms: string;
  creditLimit: number;
  currentBalance: number;
  totalPurchases: number;
  status: "active" | "inactive" | "blocked";
  createdAt: string;
  notes: string;
}

type PaymentMethodCode = "cash" | "bank-transfer" | "check" | "credit-card";

interface Payment {
  id: string;
  paymentNumber: string;
  supplierId: string | null;
  supplierName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: PaymentMethodCode;
  referenceNumber: string;
  description?: string;
  status: "pending" | "completed" | "cancelled";
}


export function Suppliers() {
  const dispatch = useAppDispatch();
  const dbSuppliers = useAppSelector(selectors.suppliers.selectAll) as SupplierRow[];
  const suppliersLoading = useAppSelector(selectors.suppliers.selectLoading);
  const suppliersError = useAppSelector(selectors.suppliers.selectError);
  const dbPurchaseOrders = useAppSelector(selectors.purchase_orders.selectAll) as PurchaseOrders[];
  const dbPurchasePayments = useAppSelector(selectors.purchase_payments.selectAll) as PurchasePayments[];
  const purchasePaymentsLoading = useAppSelector(selectors.purchase_payments.selectLoading);
  const purchasePaymentsError = useAppSelector(selectors.purchase_payments.selectError);

  useEffect(() => {
    dispatch(thunks.suppliers.fetchAll(undefined));
    dispatch(thunks.purchase_orders.fetchAll(undefined));
    dispatch(thunks.purchase_payments.fetchAll(undefined));
  }, [dispatch]);

  const outstandingBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    dbPurchaseOrders.forEach((order) => {
      if (!order.supplier_id) return;
      const remaining = Number(order.purchase_remaining_amount ?? 0);
      const previous = map.get(order.supplier_id) ?? 0;
      map.set(order.supplier_id, Number((previous + remaining).toFixed(2)));
    });
    return map;
  }, [dbPurchaseOrders]);

  const totalsBySupplier = useMemo(() => {
    const map = new Map<string, number>();
    dbPurchaseOrders.forEach((order) => {
      if (!order.supplier_id) return;
      const payload = (order.purchase_order_items ?? {}) as any;
      const totalFromPayload = typeof payload?.total_amount === "number" ? payload.total_amount : undefined;
      const computedTotal = Number(order.purchase_paid_amount ?? 0) + Number(order.purchase_remaining_amount ?? 0);
      const total = totalFromPayload ?? computedTotal;
      const previous = map.get(order.supplier_id) ?? 0;
      map.set(order.supplier_id, Number((previous + total).toFixed(2)));
    });
    return map;
  }, [dbPurchaseOrders]);

  const suppliers: Supplier[] = useMemo(() => {
    return dbSuppliers.map((supplier, idx) => {
      const outstanding = outstandingBySupplier.get(supplier.supplier_id) ?? 0;
      const persistedBalance = Number(supplier.supplier_balance ?? 0);
      const balance = Number((outstanding + persistedBalance).toFixed(2));
      return {
        id: idx + 1,
        dbId: supplier.supplier_id,
        supplierCode: supplier.supplier_id?.slice(0, 8) ?? `SUP-${String(idx + 1).padStart(3, "0")}`,
        nameEn: supplier.supplier_en_name ?? "",
        nameAr: supplier.supplier_ar_name ?? "",
        contactPerson: supplier.supplier_contact_person ?? "",
        phone: supplier.supplier_phone_num ?? "",
        email: supplier.supplier_email ?? "",
        address: supplier.supplier_address ?? "",
        city: supplier.supplier_city ?? "",
        country: supplier.supplier_country ?? "",
        category: (supplier.supplier_category ?? "other") as Supplier["category"],
        taxNumber: supplier.supplier_tax_number ?? "",
        paymentTerms: supplier.supplier_payment_terms ?? "",
        creditLimit: Number(supplier.credit_balance_limit ?? 0),
        currentBalance: balance,
        totalPurchases: totalsBySupplier.get(supplier.supplier_id) ?? 0,
        status: (supplier.supplier_status ?? "active") as Supplier["status"],
        createdAt: (supplier.created_at ?? "").slice(0, 10),
        notes: supplier.supplier_notes ?? "",
      };
    });
  }, [dbSuppliers, outstandingBySupplier, totalsBySupplier]);

  const normalizePaymentMethod = (value: string | null | undefined): PaymentMethodCode => {
    if (!value) return "bank-transfer";
    const cleaned = value.toLowerCase().replace(/_/g, "-");
    switch (cleaned) {
      case "cash":
        return "cash";
      case "bank-transfer":
        return "bank-transfer";
      case "check":
        return "check";
      case "credit-card":
        return "credit-card";
      default:
        return "bank-transfer";
    }
  };

  const payments = useMemo<Payment[]>(() => {
    return dbPurchasePayments
      .map((payment) => {
        const supplierInfo = suppliers.find((supplier) => supplier.dbId === payment.supplier_id);
        return {
          id: payment.payment_id,
          paymentNumber: `PAY-${payment.payment_id.slice(0, 8).toUpperCase()}`,
          supplierId: payment.supplier_id ?? null,
          supplierName: supplierInfo?.nameEn ?? "Unknown Supplier",
          amount: Number(payment.payment_amount ?? 0),
          paymentDate: payment.payment_date,
          paymentMethod: normalizePaymentMethod(payment.payment_method),
          referenceNumber: payment.reference_number ?? "",
          description: payment.payment_notes ?? "",
          status: "completed" as Payment["status"],
        };
      })
      .sort((a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime());
  }, [dbPurchasePayments, suppliers]);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterCategory, setFilterCategory] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);

  // Form state for new/edit supplier
  const [formData, setFormData] = useState<Partial<Supplier>>({
    nameEn: "",
    nameAr: "",
    contactPerson: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    country: "Saudi Arabia",
    category: "raw-materials",
    taxNumber: "",
    paymentTerms: "Net 30",
    creditLimit: 0,
    status: "active",
    notes: ""
  });

  // Payment form state
  const [paymentForm, setPaymentForm] = useState({
    supplierId: "",
    amount: 0,
    paymentDate: new Date().toISOString().split('T')[0],
    paymentMethod: "bank-transfer" as PaymentMethodCode,
    referenceNumber: "",
    description: ""
  });
  const selectedPaymentSupplier = useMemo(
    () => suppliers.find((supplier) => supplier.dbId === paymentForm.supplierId) ?? null,
    [suppliers, paymentForm.supplierId]
  );
  const remainingBalance = selectedPaymentSupplier?.currentBalance ?? 0;
  const remainingBalanceColor =
    remainingBalance < 0 ? "text-red-600" : "text-green-600";
  const remainingBalanceLabel =
    remainingBalance < 0 ? "Supplier Credit" : "Remaining Balance";
  const displayedBalance = Math.abs(remainingBalance);

  const handleQuickPaymentFill = (mode: "half" | "full") => {
    const base = Math.max(0, remainingBalance);
    if (base <= 0) {
      setPaymentForm((prev) => ({ ...prev, amount: 0 }));
      return;
    }
    const value = mode === "half" ? base / 2 : base;
    setPaymentForm((prev) => ({ ...prev, amount: Number(value.toFixed(2)) }));
  };

  // Statistics
  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter(s => s.status === "active").length;
  const totalPayable = suppliers.reduce((sum, s) => sum + Math.max(0, s.currentBalance), 0);
  const monthlyPayments = payments.filter(p => {
    const paymentDate = new Date(p.paymentDate);
    const now = new Date();
    return paymentDate.getMonth() === now.getMonth() && paymentDate.getFullYear() === now.getFullYear() && p.status === "completed";
  }).reduce((sum, p) => sum + p.amount, 0);

  // Filter suppliers
  const filteredSuppliers = suppliers.filter(supplier => {
    const matchesSearch = 
      supplier.nameEn.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.nameAr.includes(searchTerm) ||
      supplier.supplierCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      supplier.contactPerson.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === "all" || supplier.category === filterCategory;
    const matchesStatus = filterStatus === "all" || supplier.status === filterStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const handleAddSupplier = () => {
    if (!formData.nameEn || !formData.nameAr || !formData.phone) {
      toast.error("Please fill all required fields");
      return;
    }
    const values: any = {
      supplier_en_name: formData.nameEn,
      supplier_ar_name: formData.nameAr,
      supplier_contact_person: formData.contactPerson,
      supplier_phone_num: formData.phone,
      supplier_email: formData.email,
      supplier_address: formData.address,
      supplier_city: formData.city,
      supplier_country: formData.country,
      supplier_category: formData.category,
      supplier_tax_number: formData.taxNumber,
      supplier_payment_terms: formData.paymentTerms,
      credit_balance_limit: formData.creditLimit,
      supplier_status: formData.status,
      supplier_notes: formData.notes,
      supplier_balance: 0,
    };
    dispatch(thunks.suppliers.createOne(values))
      .unwrap()
      .then(() => {
        toast.success("Supplier added successfully");
        setIsAddDialogOpen(false);
        resetForm();
      })
      .catch((e: any) => toast.error(e.message || 'Failed to add supplier'));
  };

  const handleEditSupplier = () => {
    if (!editingSupplier?.dbId || !formData.nameEn || !formData.nameAr || !formData.phone) {
      toast.error("Please fill all required fields");
      return;
    }
    const values: any = {
      supplier_en_name: formData.nameEn,
      supplier_ar_name: formData.nameAr,
      supplier_contact_person: formData.contactPerson,
      supplier_phone_num: formData.phone,
      supplier_email: formData.email,
      supplier_address: formData.address,
      supplier_city: formData.city,
      supplier_country: formData.country,
      supplier_category: formData.category,
      supplier_tax_number: formData.taxNumber,
      supplier_payment_terms: formData.paymentTerms,
      credit_balance_limit: formData.creditLimit,
      supplier_status: formData.status,
      supplier_notes: formData.notes,
      supplier_balance: editingSupplier?.currentBalance ?? 0,
    };
    dispatch(thunks.suppliers.updateOne({ id: editingSupplier.dbId, values }))
      .unwrap()
      .then(() => {
        toast.success("Supplier updated successfully");
        setIsAddDialogOpen(false);
        setEditingSupplier(null);
        resetForm();
      })
      .catch((e: any) => toast.error(e.message || 'Failed to update supplier'));
  };

  const handleDeleteSupplier = (id: number) => {
    const target = suppliers.find(s => s.id === id);
    if (!target?.dbId) return;
    if (confirm("Are you sure you want to delete this supplier?")) {
      dispatch(thunks.suppliers.deleteOne(target.dbId))
        .unwrap()
        .then(() => toast.success("Supplier deleted successfully"))
        .catch((e: any) => toast.error(e.message || 'Failed to delete'));
    }
  };

  const handleAddPayment = async () => {
    if (!paymentForm.supplierId || !paymentForm.amount || !paymentForm.referenceNumber) {
      toast.error("Please fill all required fields");
      return;
    }

    const supplier = suppliers.find((item) => item.dbId === paymentForm.supplierId);
    if (!supplier) {
      toast.error("Supplier not found");
      return;
    }

    const paymentPayload: Partial<PurchasePayments> = {
      supplier_id: supplier.dbId,
      purchase_id: null,
      payment_amount: paymentForm.amount,
      payment_date: paymentForm.paymentDate,
      payment_method: paymentForm.paymentMethod,
      reference_number: paymentForm.referenceNumber,
      payment_notes: paymentForm.description || null,
    };

    try {
      await dispatch(thunks.purchase_payments.createOne(paymentPayload as any)).unwrap();

      const supplierRow = dbSuppliers.find((row) => row.supplier_id === supplier.dbId);
      const persistedBalance = Number(supplierRow?.supplier_balance ?? 0);

      let remainingPayment = paymentForm.amount;
      const supplierOrders = dbPurchaseOrders
        .filter((order) => order.supplier_id === supplier.dbId)
        .sort((a, b) => new Date(a.purchase_date).getTime() - new Date(b.purchase_date).getTime());

      for (const order of supplierOrders) {
        if (remainingPayment <= 0) break;
        const orderRemaining = Number(order.purchase_remaining_amount ?? 0);
        if (orderRemaining <= 0) continue;

        const applied = Math.min(orderRemaining, remainingPayment);
        const updatedRemaining = Number((orderRemaining - applied).toFixed(2));
        const updatedPaid = Number(((order.purchase_paid_amount ?? 0) + applied).toFixed(2));

        const newStatus =
          updatedRemaining <= 0 ? "paid" : updatedPaid > 0 ? "partial" : "unpaid";

        await dispatch(
          thunks.purchase_orders.updateOne({
            id: order.purchase_id,
            values: {
              purchase_remaining_amount: updatedRemaining,
              purchase_paid_amount: updatedPaid,
              payment_status: newStatus,
            } as any,
          })
        ).unwrap();

        remainingPayment = Number((remainingPayment - applied).toFixed(2));
      }

      const creditDelta = Math.max(0, remainingPayment);
      const newSupplierBalance = Number((persistedBalance - creditDelta).toFixed(2));

      await dispatch(
        thunks.suppliers.updateOne({
          id: supplier.dbId,
          values: { supplier_balance: newSupplierBalance } as any,
        })
      ).unwrap();

    toast.success("Payment recorded successfully");
    setIsPaymentDialogOpen(false);
    setPaymentForm({
        supplierId: "",
      amount: 0,
        paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "bank-transfer",
      referenceNumber: "",
        description: "",
    });
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record payment");
    }
  };

  const openEditDialog = (supplier: Supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      nameEn: supplier.nameEn,
      nameAr: supplier.nameAr,
      contactPerson: supplier.contactPerson,
      phone: supplier.phone,
      email: supplier.email,
      address: supplier.address,
      city: supplier.city,
      country: supplier.country,
      category: supplier.category,
      taxNumber: supplier.taxNumber,
      paymentTerms: supplier.paymentTerms,
      creditLimit: supplier.creditLimit,
      status: supplier.status,
      notes: supplier.notes
    });
    setIsAddDialogOpen(true);
  };

  const resetForm = () => {
    setFormData({
      nameEn: "",
      nameAr: "",
      contactPerson: "",
      phone: "",
      email: "",
      address: "",
      city: "",
      country: "Saudi Arabia",
      category: "raw-materials",
      taxNumber: "",
      paymentTerms: "Net 30",
      creditLimit: 0,
      status: "active",
      notes: ""
    });
    setEditingSupplier(null);
  };

  const getCategoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      "raw-materials": "Raw Materials",
      "packaging": "Packaging",
      "equipment": "Equipment",
      "services": "Services",
      "other": "Other"
    };
    return labels[category] || category;
  };

  const getPaymentMethodLabel = (method: PaymentMethodCode) => {
    const labels: Record<PaymentMethodCode, string> = {
      cash: "Cash",
      "bank-transfer": "Bank Transfer",
      check: "Check",
      "credit-card": "Credit Card",
    };
    return labels[method];
  };

  const getSupplierPayments = (supplierId: string) => {
    return payments.filter(p => p.supplierId === supplierId);
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredSuppliers.map((supplier) => ({
        "Supplier Code": supplier.supplierCode,
        "Name (EN)": supplier.nameEn,
        "Name (AR)": supplier.nameAr,
        "Contact Person": supplier.contactPerson,
        "Phone": supplier.phone,
        "Email": supplier.email,
        "Address": supplier.address,
        "City": supplier.city,
        "Country": supplier.country,
        "Category": supplier.category,
        "Tax Number": supplier.taxNumber,
        "Payment Terms": supplier.paymentTerms,
        "Credit Limit (SAR)": supplier.creditLimit,
        "Current Balance (SAR)": supplier.currentBalance,
        "Total Purchases (SAR)": supplier.totalPurchases,
        "Status": supplier.status,
        "Created At": supplier.createdAt,
        "Notes": supplier.notes,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
        { wch: 25 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 15 }, { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
        { wch: 12 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Suppliers");
      const fileName = `suppliers_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Suppliers Management</h2>
        <p className="text-muted-foreground mt-1">Manage suppliers and track payments</p>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Suppliers</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSuppliers}</div>
            <p className="text-xs text-muted-foreground">
              {activeSuppliers} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payable</CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">
              {totalPayable.toLocaleString()} ر.س
            </div>
            <p className="text-xs text-muted-foreground">
              Outstanding balance
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Monthly Payments</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {monthlyPayments.toLocaleString()} ر.س
            </div>
            <p className="text-xs text-muted-foreground">
              This month
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payments.length}</div>
            <p className="text-xs text-muted-foreground">
              All time
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs defaultValue="suppliers" className="space-y-4">
        <TabsList>
          <TabsTrigger value="suppliers">Suppliers</TabsTrigger>
          <TabsTrigger value="payments">Payments</TabsTrigger>
        </TabsList>

        {/* Suppliers Tab */}
        <TabsContent value="suppliers" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <CardTitle>Suppliers List</CardTitle>
                  <CardDescription>View and manage all suppliers</CardDescription>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={exportToExcel} variant="outline" className="gap-2">
                    <Download className="h-4 w-4" />
                    Export Excel
                  </Button>
                  <Button onClick={() => { resetForm(); setIsAddDialogOpen(true); }} className="bg-purple-600 hover:bg-purple-700 text-white">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Supplier
                  </Button>
                  <Button variant="outline" onClick={() => setIsPaymentDialogOpen(true)}>
                    <DollarSign className="mr-2 h-4 w-4" />
                    Add Payment
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Filters */}
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search suppliers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger className="w-full md:w-[200px]">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="raw-materials">Raw Materials</SelectItem>
                    <SelectItem value="packaging">Packaging</SelectItem>
                    <SelectItem value="equipment">Equipment</SelectItem>
                    <SelectItem value="services">Services</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-full md:w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                    <SelectItem value="blocked">Blocked</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Table */}
              {suppliersLoading && <div>Loading suppliers...</div>}
              {suppliersError && <div className="text-red-500">{suppliersError}</div>}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Supplier Name</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Balance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredSuppliers.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                      <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
                          No suppliers found
                        </TableCell>
                      </TableRow>
                      
                    ) : (
                      filteredSuppliers.map((supplier) => (
                        <TableRow key={supplier.id}>
                          <TableCell className="font-medium">{supplier.supplierCode}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{supplier.nameEn}</div>
                              <div className="text-sm text-muted-foreground">{supplier.nameAr}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div>{supplier.contactPerson}</div>
                              <div className="text-muted-foreground">{supplier.phone}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{getCategoryLabel(supplier.category)}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className={supplier.currentBalance < 0 ? "text-red-600 font-semibold" : "text-green-600 font-semibold"}>
                                {Math.abs(supplier.currentBalance).toLocaleString()} ر.س
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {supplier.currentBalance < 0 ? "Credit" : "Due"}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              supplier.status === "active" ? "default" : 
                              supplier.status === "inactive" ? "secondary" : 
                              "destructive"
                            }>
                              {supplier.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setSelectedSupplier(supplier);
                                  setIsViewDialogOpen(true);
                                }}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openEditDialog(supplier)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteSupplier(supplier.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Payments Tab */}
        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div>
                  <CardTitle>Payment History</CardTitle>
                  <CardDescription>Track all supplier payments</CardDescription>
                </div>
                <Button onClick={() => setIsPaymentDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Record Payment
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {purchasePaymentsLoading && <div>Loading payments...</div>}
              {purchasePaymentsError && <div className="text-red-500">{purchasePaymentsError}</div>}
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment #</TableHead>
                      <TableHead>Supplier</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No payments recorded
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className="font-medium">{payment.paymentNumber}</TableCell>
                          <TableCell>{payment.supplierName}</TableCell>
                          <TableCell className="font-medium">
                            {payment.amount.toLocaleString()} ر.س
                          </TableCell>
                          <TableCell>{new Date(payment.paymentDate).toLocaleDateString('en-GB')}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{getPaymentMethodLabel(payment.paymentMethod)}</Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{payment.referenceNumber}</TableCell>
                          <TableCell>
                            <Badge variant={
                              payment.status === "completed" ? "default" :
                              payment.status === "pending" ? "secondary" :
                              "destructive"
                            }>
                              {payment.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add/Edit Supplier Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{editingSupplier ? "Edit Supplier" : "Add New Supplier"}</DialogTitle>
            <DialogDescription>
              {editingSupplier ? "Update supplier information" : "Enter supplier details"}
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh] pr-4">
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nameEn">Name (English) *</Label>
                  <Input
                    id="nameEn"
                    value={formData.nameEn}
                    onChange={(e) => setFormData({ ...formData, nameEn: e.target.value })}
                    placeholder="Supplier name in English"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nameAr">Name (Arabic) *</Label>
                  <Input
                    id="nameAr"
                    value={formData.nameAr}
                    onChange={(e) => setFormData({ ...formData, nameAr: e.target.value })}
                    placeholder="اسم المورد بالعربي"
                    dir="rtl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactPerson">Contact Person</Label>
                  <Input
                    id="contactPerson"
                    value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })}
                    placeholder="Contact person name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone *</Label>
                  <Input
                    id="phone"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+966 XX XXX XXXX"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="email@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="taxNumber">Tax Number</Label>
                  <Input
                    id="taxNumber"
                    value={formData.taxNumber}
                    onChange={(e) => setFormData({ ...formData, taxNumber: e.target.value })}
                    placeholder="300XXXXXXXXXXX"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="Street address"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    placeholder="City"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="country">Country</Label>
                  <Input
                    id="country"
                    value={formData.country}
                    onChange={(e) => setFormData({ ...formData, country: e.target.value })}
                    placeholder="Country"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(value) => setFormData({ ...formData, category: value as Supplier['category'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raw-materials">Raw Materials</SelectItem>
                      <SelectItem value="packaging">Packaging</SelectItem>
                      <SelectItem value="equipment">Equipment</SelectItem>
                      <SelectItem value="services">Services</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formData.status}
                    onValueChange={(value) => setFormData({ ...formData, status: value as Supplier['status'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="blocked">Blocked</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="paymentTerms">Payment Terms</Label>
                  <Input
                    id="paymentTerms"
                    value={formData.paymentTerms}
                    onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                    placeholder="e.g., Net 30"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="creditLimit">Credit Limit (SAR)</Label>
                  <Input
                    id="creditLimit"
                    type="number"
                    value={formData.creditLimit}
                    onChange={(e) => setFormData({ ...formData, creditLimit: Number(e.target.value) })}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes..."
                  rows={3}
                />
              </div>
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsAddDialogOpen(false); resetForm(); }}>
              Cancel
            </Button>
            <Button onClick={editingSupplier ? handleEditSupplier : handleAddSupplier} className="bg-purple-600 hover:bg-purple-700 text-white">
              {editingSupplier ? "Update" : "Add"} Supplier
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Payment Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Payment</DialogTitle>
            <DialogDescription>Add a new supplier payment</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paymentSupplier">Supplier *</Label>
              <Select
                value={paymentForm.supplierId}
                onValueChange={(value) => setPaymentForm({ ...paymentForm, supplierId: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.dbId} value={supplier.dbId}>
                      {supplier.nameEn} - {supplier.currentBalance < 0 ? "Credit" : "Due"}: {Math.abs(supplier.currentBalance).toLocaleString()} ر.س
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentAmount">Amount (SAR) *</Label>
                <Input
                  id="paymentAmount"
                  type="number"
                  value={paymentForm.amount || ""}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: Number(e.target.value) })}
                  placeholder="0.00"
                />
                <div className="flex items-start justify-between text-xs text-muted-foreground">
                  <span>
                    {remainingBalanceLabel}:&nbsp;
                    <span className={`font-semibold ${remainingBalanceColor}`}>
                      {displayedBalance.toLocaleString()} ر.س
                    </span>
                  </span>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs"
                      onClick={() => handleQuickPaymentFill("half")}
                      disabled={!selectedPaymentSupplier || remainingBalance <= 0}
                    >
                      50%
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 px-3 text-xs"
                      onClick={() => handleQuickPaymentFill("full")}
                      disabled={!selectedPaymentSupplier || remainingBalance <= 0}
                    >
                      Full Amount
                    </Button>
                  </div>
                </div>
                {remainingBalance < 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Future purchase orders will automatically consume this credit.
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentDate">Payment Date *</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) => setPaymentForm({ ...paymentForm, paymentDate: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentMethod">Payment Method *</Label>
              <Select
                value={paymentForm.paymentMethod}
                onValueChange={(value) => setPaymentForm({ ...paymentForm, paymentMethod: value as PaymentMethodCode })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="bank-transfer">Bank Transfer</SelectItem>
                  <SelectItem value="check">Check</SelectItem>
                  <SelectItem value="credit-card">Credit Card</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="referenceNumber">Reference Number *</Label>
              <Input
                id="referenceNumber"
                value={paymentForm.referenceNumber}
                onChange={(e) => setPaymentForm({ ...paymentForm, referenceNumber: e.target.value })}
                placeholder="TRF-XXXX or CHK-XXXX"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentDescription">Description</Label>
              <Textarea
                id="paymentDescription"
                value={paymentForm.description}
                onChange={(e) => setPaymentForm({ ...paymentForm, description: e.target.value })}
                placeholder="Payment details..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPaymentDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddPayment}>
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Supplier Details Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Supplier Details</DialogTitle>
          </DialogHeader>
          {selectedSupplier && (
            <ScrollArea className="max-h-[70vh]">
              <div className="space-y-6">
                {/* Supplier Info */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Supplier Code</Label>
                    <p className="font-medium">{selectedSupplier.supplierCode}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <div className="mt-1">
                      <Badge variant={selectedSupplier.status === "active" ? "default" : "secondary"}>
                        {selectedSupplier.status}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Name (English)</Label>
                    <p className="font-medium">{selectedSupplier.nameEn}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Name (Arabic)</Label>
                    <p className="font-medium" dir="rtl">{selectedSupplier.nameAr}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Contact Person</Label>
                    <p className="font-medium">{selectedSupplier.contactPerson}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Category</Label>
                    <p className="font-medium">{getCategoryLabel(selectedSupplier.category)}</p>
                  </div>
                </div>

                {/* Contact Info */}
                <div>
                  <h4 className="font-semibold mb-3">Contact Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Phone</Label>
                      <p className="font-medium">{selectedSupplier.phone}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Email</Label>
                      <p className="font-medium">{selectedSupplier.email}</p>
                    </div>
                    <div className="col-span-2">
                      <Label className="text-muted-foreground">Address</Label>
                      <p className="font-medium">{selectedSupplier.address}, {selectedSupplier.city}, {selectedSupplier.country}</p>
                    </div>
                  </div>
                </div>

                {/* Financial Info */}
                <div>
                  <h4 className="font-semibold mb-3">Financial Information</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground">Current Balance</Label>
                      <p className={`font-bold text-lg ${selectedSupplier.currentBalance < 0 ? "text-red-600" : "text-green-600"}`}>
                        {Math.abs(selectedSupplier.currentBalance).toLocaleString()} ر.س
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {selectedSupplier.currentBalance < 0 ? "Supplier credit" : "Amount due"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Credit Limit</Label>
                      <p className="font-medium">{selectedSupplier.creditLimit.toLocaleString()} ر.س</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Total Purchases</Label>
                      <p className="font-medium">{selectedSupplier.totalPurchases.toLocaleString()} ر.س</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Payment Terms</Label>
                      <p className="font-medium">{selectedSupplier.paymentTerms}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Tax Number</Label>
                      <p className="font-medium">{selectedSupplier.taxNumber}</p>
                    </div>
                  </div>
                </div>

                {/* Payment History */}
                <div>
                  <h4 className="font-semibold mb-3">Recent Payments</h4>
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Method</TableHead>
                          <TableHead>Reference</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getSupplierPayments(selectedSupplier.dbId).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center py-4 text-muted-foreground">
                              No payments recorded
                            </TableCell>
                          </TableRow>
                        ) : (
                          getSupplierPayments(selectedSupplier.dbId).slice(0, 5).map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell>{new Date(payment.paymentDate).toLocaleDateString('en-GB')}</TableCell>
                              <TableCell className="font-medium">{payment.amount.toLocaleString()} ر.س</TableCell>
                              <TableCell>{getPaymentMethodLabel(payment.paymentMethod)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground">{payment.referenceNumber}</TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>

                {/* Notes */}
                {selectedSupplier.notes && (
                  <div>
                    <Label className="text-muted-foreground">Notes</Label>
                    <p className="mt-1 text-sm">{selectedSupplier.notes}</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
