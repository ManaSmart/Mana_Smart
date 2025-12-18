import { useState, useRef, useEffect, useMemo } from "react";
import { Plus, Search, Printer, Download, Eye, X, Trash2, Upload, DollarSign, CreditCard, Wallet, Settings, Calendar } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import QRCode from "qrcode";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { Skeleton } from "./ui/skeleton";
import type { InventoryItem } from "./Inventory";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { CustomerSelector } from "./CustomerSelector";
import type { Customer } from "./CustomerSelector";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Customers } from "../../supabase/models/customers";
import type { Invoices as InvoicesRow } from "../../supabase/models/invoices";
import type { Payments as PaymentRow } from "../../supabase/models/payments";
import { getPrintLogo } from "../lib/getPrintLogo";

interface InvoiceItem {
  id: number;
  inventoryItem?: InventoryItem;
  isManual: boolean;
  image?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  priceAfterDiscount: number;
  subtotal: number;
  vat: number;
  total: number;
}

type InvoiceType = "normal" | "monthly_visit";

interface Invoice {
  id: number;
  dbInvoiceId?: string;
  invoiceNumber: string;
  date: string;
  customerName: string;
  mobile: string;
  location: string;
  commercialRegister: string;
  taxNumber: string;
  qrCode?: string;
  companyLogo?: string;
  stamp?: string;
  stampPosition?: { x: number; y: number };
  notes?: string;
  termsAndConditions?: string;
  items: InvoiceItem[];
  totalBeforeDiscount: number;
  totalDiscount: number;
  totalAfterDiscount: number;
  totalVAT: number;
  grandTotal: number;
  paidAmount: number;
  remainingAmount: number;
  status: "paid" | "partial" | "draft";
  invoiceType: InvoiceType;
  contractId?: string | null;
  visitId?: string | null;
  visitDate?: string | null; // Date of the monthly visit
  paymentHistory?: Array<{
    id: number;
    date: string;
    amount: number;
    method: string;
    methodValue?: string;
  }>;
}

const VAT_RATE = 0.15;

interface InvoicesProps {
  pendingQuotationData?: any;
  onQuotationDataConsumed?: () => void;
}

const PAYMENT_METHOD_OPTIONS = [
  { value: "cash", label: "💵 Cash - نقدي" },
  { value: "bank_transfer", label: "🏦 Bank Transfer - تحويل بنكي" },
  { value: "credit_card", label: "💳 Credit Card - بطاقة ائتمان" },
  { value: "cheque", label: "📝 Cheque - شيك" },
] as const;

const PAYMENT_METHOD_VALUES = new Set<string>(PAYMENT_METHOD_OPTIONS.map((option) => option.value));

const PAYMENT_METHOD_LABELS = PAYMENT_METHOD_OPTIONS.reduce<Record<string, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

// Automatic invoicing settings keys
const AUTO_INVOICE_ENABLED_KEY = 'autoInvoiceEnabled';
const AUTO_INVOICE_TIMING_KEY = 'autoInvoiceTiming'; // 'visit_date' or '7_days_before'

export function Invoices({ pendingQuotationData, onQuotationDataConsumed }: InvoicesProps) {
  const dispatch = useAppDispatch();
  const dbCustomers = useAppSelector(selectors.customers.selectAll) as Customers[];
  const customersLoading = useAppSelector(selectors.customers.selectLoading);
  const dbInvoices = useAppSelector(selectors.invoices.selectAll) as InvoicesRow[];
  const invoicesLoading = useAppSelector(selectors.invoices.selectLoading);
  const dbInventory = useAppSelector(selectors.inventory.selectAll) as any[];
  const dbPayments = useAppSelector(selectors.payments.selectAll) as PaymentRow[];
  const paymentsLoading = useAppSelector(selectors.payments.selectLoading);

  // Automatic invoicing settings
  const [autoInvoiceEnabled, setAutoInvoiceEnabled] = useState(() => {
    const stored = localStorage.getItem(AUTO_INVOICE_ENABLED_KEY);
    return stored === 'true';
  });
  const [autoInvoiceTiming, setAutoInvoiceTiming] = useState<'visit_date' | '7_days_before'>(() => {
    const stored = localStorage.getItem(AUTO_INVOICE_TIMING_KEY);
    return (stored === '7_days_before' ? '7_days_before' : 'visit_date') as 'visit_date' | '7_days_before';
  });

  const invoiceNumberMap = useMemo(() => {
    const parse = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    // Sort by created_at first (stable, never changes) then by invoice_id for consistent ordering
    const sorted = [...dbInvoices].sort((a, b) => {
      const timeA = parse(a.created_at);
      const timeB = parse(b.created_at);
      if (timeA !== timeB) return timeA - timeB;
      // If created_at is the same, sort by invoice_id for stable ordering
      return a.invoice_id.localeCompare(b.invoice_id);
    });

    const map = new Map<
      string,
      {
        invoiceNumber: string;
        sequence: number;
        invoiceYear: number;
      }
    >();

    sorted.forEach((invoice, index) => {
      const invoiceDate = invoice.invoice_date ?? invoice.created_at ?? null;
      const year = invoiceDate ? new Date(invoiceDate).getFullYear() : new Date().getFullYear();
      map.set(invoice.invoice_id, {
        invoiceNumber: `INV-${year}-${String(index + 1).padStart(3, "0")}`,
        sequence: index + 1,
        invoiceYear: year,
      });
    });

    return map;
  }, [dbInvoices]);

  useEffect(() => {
    dispatch(thunks.customers.fetchAll(undefined));
    dispatch(thunks.invoices.fetchAll(undefined));
    dispatch(thunks.inventory.fetchAll(undefined));
    dispatch(thunks.payments.fetchAll(undefined));
  }, [dispatch]);

  // Convert inventory from database to InventoryItem format
  const inventory: InventoryItem[] = useMemo(() => {
    return dbInventory.map((p, idx) => ({
      id: idx + 1,
      sku: p.product_code?.slice(0,8) ?? `SKU-${idx+1}`,
      name: p.en_prod_name ?? p.ar_prod_name ?? '',
      nameAr: p.ar_prod_name ?? '',
      category: p.category ?? '',
      productType: 'simple' as const,
      description: p.prod_en_description ?? '',
      descriptionAr: p.prod_ar_description ?? '',
      image: p.prod_img ?? undefined,
      unitPrice: Number(p.prod_selling_price ?? 0),
      costPrice: Number(p.prod_cost_price ?? 0),
      stock: Number(p.current_stock ?? 0),
      minStock: Number(p.minimum_stock_alert ?? 0),
      maxStock: Number(p.minimum_stock_alert ?? 0) * 10,
      unit: p.measuring_unit ?? '',
      status: (p.prod_status ?? 'in-stock') as any,
      supplier: p.prod_supplier ?? undefined,
      location: undefined,
      barcode: undefined,
      taxable: true,
      weight: undefined,
      dimensions: undefined,
      expiryDate: undefined,
      createdDate: new Date().toISOString().split('T')[0],
      lastUpdated: new Date().toISOString().split('T')[0],
      notes: undefined,
    }));
  }, [dbInventory]);

  // Convert dbInvoices to Invoice format
  const invoices: Invoice[] = useMemo(() => {
    const paymentsByInvoice = dbPayments.reduce<Map<string, PaymentRow[]>>((acc, payment) => {
      if (!payment.invoice_id) return acc;
      const existing = acc.get(payment.invoice_id) ?? [];
      existing.push(payment);
      acc.set(payment.invoice_id, existing);
      return acc;
    }, new Map());

    const parse = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    // Sort by created_at first (stable, never changes) then by invoice_id for consistent ordering
    const sortedInvoices = [...dbInvoices].sort((a, b) => {
      const timeA = parse(a.created_at);
      const timeB = parse(b.created_at);
      if (timeA !== timeB) return timeA - timeB;
      // If created_at is the same, sort by invoice_id for stable ordering
      return a.invoice_id.localeCompare(b.invoice_id);
    });

    return sortedInvoices.map((dbInv, idx) => {
      const customer = dbCustomers.find((c) => c.customer_id === dbInv.customer_id);
      const invoiceItems = Array.isArray(dbInv.invoice_items) ? dbInv.invoice_items : [];

      // Parse invoice items
      const items: InvoiceItem[] = invoiceItems.map((item: any, itemIdx: number) => ({
        id: itemIdx + 1,
        inventoryItem: undefined,
        isManual: true,
        image: item.image,
        description: item.description || "",
        quantity: item.quantity || 1,
        unitPrice: item.unitPrice || 0,
        discountPercent: item.discountPercent || 0,
        priceAfterDiscount: (item.unitPrice || 0) * (1 - (item.discountPercent || 0) / 100),
        subtotal: ((item.unitPrice || 0) * (1 - (item.discountPercent || 0) / 100)) * (item.quantity || 1),
        vat: ((item.unitPrice || 0) * (1 - (item.discountPercent || 0) / 100)) * (item.quantity || 1) * VAT_RATE,
        total: ((item.unitPrice || 0) * (1 - (item.discountPercent || 0) / 100)) * (item.quantity || 1) * (1 + VAT_RATE),
      }));

      const totalBeforeDiscount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
      const totalAfterDiscount = items.reduce((sum, item) => sum + item.subtotal, 0);
      const totalDiscount = totalBeforeDiscount - totalAfterDiscount;
      const totalVAT = items.reduce((sum, item) => sum + item.vat, 0);
      const calculatedGrandTotal = items.reduce((sum, item) => sum + item.total, 0);

      const subtotalPlusTax = Number(dbInv.subtotal ?? 0) + Number(dbInv.tax_amount ?? 0);
      let totalAmount = Number(dbInv.total_amount ?? 0);
      if (totalAmount <= 0) {
        if (subtotalPlusTax > 0) {
          totalAmount = subtotalPlusTax;
        } else if (calculatedGrandTotal > 0) {
          totalAmount = calculatedGrandTotal;
        }
      }

      const relatedPayments = paymentsByInvoice.get(dbInv.invoice_id) ?? [];
      relatedPayments.sort(
        (a, b) => new Date(a.payment_date).getTime() - new Date(b.payment_date).getTime()
      );
      const paymentsSum = relatedPayments.reduce(
        (sum, payment) => sum + Number(payment.paid_amount ?? 0),
        0
      );
      let paidAmount =
        paymentsSum > 0 ? paymentsSum : Number(dbInv.paid_amount ?? 0);
      if (totalAmount > 0 && paidAmount - totalAmount > 0.0001) {
        paidAmount = totalAmount;
      }
      const remainingAmount = Math.max(0, totalAmount - paidAmount);
      // Round remaining amount to 2 decimal places and treat very small amounts as 0
      const roundedRemaining = Number(remainingAmount.toFixed(2));
      const displayRemaining = roundedRemaining <= 0.01 ? 0 : roundedRemaining;

      let status: "paid" | "partial" | "draft" = "draft";
      // Use same threshold for consistency - 0.01 to handle floating point precision
      if (displayRemaining <= 0.01 || paidAmount >= totalAmount - 0.01) {
        status = "paid";
      } else if (paidAmount > 0) {
        status = "partial";
      }

      const paymentHistory =
        relatedPayments.length > 0
          ? relatedPayments.map((payment, paymentIdx) => {
              const methodValue = payment.payment_method ?? "";
              const methodLabel =
                methodValue.length > 0
                  ? PAYMENT_METHOD_LABELS[methodValue] ?? methodValue
                  : "Unknown";
              return {
                id: paymentIdx + 1,
                date: payment.payment_date,
                amount: Number(payment.paid_amount ?? 0),
                method: methodLabel,
                methodValue,
              };
            })
          : [];

      const invoiceDate = dbInv.invoice_date ?? dbInv.created_at ?? new Date().toISOString();
      const invoiceMeta = invoiceNumberMap.get(dbInv.invoice_id);
      const invoiceYear = invoiceMeta?.invoiceYear ?? new Date(invoiceDate).getFullYear();

      // Determine invoice type: if contract_id exists, it's a monthly visit invoice
      const invoiceType: InvoiceType = dbInv.contract_id ? "monthly_visit" : "normal";

      // Extract visit date from invoice notes if it's a monthly visit invoice
      let extractedVisitDate: string | null = null;
      if (invoiceType === "monthly_visit" && dbInv.invoice_notes) {
        const visitDateMatch = dbInv.invoice_notes.match(/for visit on (\d{4}-\d{2}-\d{2})/);
        if (visitDateMatch) {
          extractedVisitDate = visitDateMatch[1];
        }
      }

      return {
        id: invoiceMeta?.sequence ?? idx + 1,
        dbInvoiceId: dbInv.invoice_id,
        invoiceNumber:
          invoiceMeta?.invoiceNumber ?? `INV-${invoiceYear}-${String(idx + 1).padStart(3, "0")}`,
        date: invoiceDate,
        customerName: customer?.customer_name || "Unknown Customer",
        mobile: customer?.contact_num || "",
        location: customer?.customer_address || "",
        commercialRegister: customer?.commercial_register || "",
        taxNumber: customer?.vat_number || "",
        qrCode: "",
        companyLogo: "",
        stamp: "",
        stampPosition: { x: 50, y: 50 },
        notes: dbInv.invoice_notes || "",
        termsAndConditions: "",
        items,
        totalBeforeDiscount,
        totalDiscount,
        totalAfterDiscount,
        totalVAT,
        grandTotal: totalAmount,
        paidAmount,
        remainingAmount: displayRemaining,
        status,
        invoiceType,
        contractId: dbInv.contract_id || null,
        visitId: null, // Can be extracted from notes if needed
        visitDate: extractedVisitDate,
        paymentHistory,
      };
    });
  }, [dbInvoices, dbCustomers, dbPayments]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const isDataLoading = invoicesLoading || customersLoading || paymentsLoading;

  // Customer management
  const customers: Customer[] = useMemo(() => {
    return dbCustomers.map((c, idx) => ({
      id: idx + 1,
      name: c.customer_name,
      company: c.company ?? "",
      mobile: c.contact_num ?? "",
      email: c.customer_email ?? "",
      location: c.customer_address ?? "",
      commercialRegister: c.commercial_register ?? "",
      taxNumber: c.vat_number ?? "",
      status: (c.status as any) ?? "active",
    }));
  }, [dbCustomers]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>();
  const [selectedCustomerDbId, setSelectedCustomerDbId] = useState<string | undefined>();

  // Fetch contracts for monthly visit invoices
  const dbContracts = useAppSelector(selectors.contracts.selectAll) as any[];
  useEffect(() => {
    dispatch(thunks.contracts.fetchAll(undefined));
  }, [dispatch]);

  // Form states
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("normal");
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [contractPlanAmount, setContractPlanAmount] = useState<number | null>(null); // Store contract plan amount for grand total
  const [visitDate, setVisitDate] = useState<string>(""); // Visit date for monthly visit invoices
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [location, setLocation] = useState("");
  const [commercialRegister, setCommercialRegister] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState(
    "• All prices include 15% VAT\n" +
    "• Payment terms: 50% advance, 50% upon completion\n" +
    "• Delivery within 7-10 business days\n" +
    "• Prices subject to change after expiry\n" +
    "• Installation and setup included\n" +
    "• One year warranty on all devices"
  );
  const [companyLogo, setCompanyLogo] = useState("");
  const [stamp, setStamp] = useState("");
  const [stampPosition, setStampPosition] = useState({ x: 50, y: 50 });
  const [paidAmount, setPaidAmount] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([{
    id: 1,
    isManual: true,
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    priceAfterDiscount: 0,
    subtotal: 0,
    vat: 0,
    total: 0
  }]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  // Handle pending quotation data from conversion
  useEffect(() => {
    if (pendingQuotationData) {
      // Fill form with quotation data
      setCustomerName(pendingQuotationData.customerName || "");
      setMobile(pendingQuotationData.mobile || "");
      setLocation(pendingQuotationData.location || "");
      setCommercialRegister(pendingQuotationData.commercialRegister || "");
      setTaxNumber(pendingQuotationData.taxNumber || "");
      setNotes(pendingQuotationData.notes || "");
      setCompanyLogo(pendingQuotationData.companyLogo || "");
      setStamp(pendingQuotationData.stamp || "");
      
      // Set items from quotation
      if (pendingQuotationData.items && pendingQuotationData.items.length > 0) {
        setItems(pendingQuotationData.items.map((item: any) => ({
          ...item,
          id: item.id || Date.now() + Math.random()
        })));
      }
      
      // Open create dialog
      setIsCreateDialogOpen(true);
      
      // Show success message
      toast.success(`Quotation ${pendingQuotationData.quotationNumber} loaded. Complete invoice details below.`);
      
      // Clear the pending data
      if (onQuotationDataConsumed) {
        onQuotationDataConsumed();
      }
    }
  }, [pendingQuotationData, onQuotationDataConsumed]);

  const filteredInvoices = invoices.filter(invoice => {
    const matchesSearch = 
      invoice.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      invoice.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || invoice.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCompanyLogo(reader.result as string);
        toast.success("Logo uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setStamp(reader.result as string);
        toast.success("Stamp uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleItemImageUpload = (itemId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateItemImage(itemId, reader.result as string);
        toast.success("Image uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  const calculateItemTotals = (item: Partial<InvoiceItem>) => {
    const quantity = item.quantity || 0;
    const unitPrice = item.unitPrice || 0;
    const discountPercent = item.discountPercent || 0;
    
    const priceAfterDiscount = unitPrice * (1 - discountPercent / 100);
    const subtotal = priceAfterDiscount * quantity;
    const vat = subtotal * VAT_RATE;
    const total = subtotal + vat;

    return {
      priceAfterDiscount,
      subtotal,
      vat,
      total
    };
  };

  const addManualItem = () => {
    setItems([...items, {
      id: Date.now(),
      isManual: true,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      priceAfterDiscount: 0,
      subtotal: 0,
      vat: 0,
      total: 0
    }]);
    toast.success("Manual item added");
  };

  const addInventoryItem = () => {
    setItems([...items, {
      id: Date.now(),
      isManual: false,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      priceAfterDiscount: 0,
      subtotal: 0,
      vat: 0,
      total: 0
    }]);
    toast.success("Inventory item added - please select from dropdown");
  };

  const removeItem = (id: number) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id: number, field: string, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        const totals = calculateItemTotals(updated);
        return { ...updated, ...totals };
      }
      return item;
    }));
  };

  const updateItemImage = (id: number, imageUrl: string) => {
    setItems(items.map(item => {
      if (item.id === id) {
        return { ...item, image: imageUrl };
      }
      return item;
    }));
  };

  const loadItemFromInventory = (id: number, inventoryId: string) => {
    const inventoryItem = inventory.find(item => item.id === parseInt(inventoryId));
    if (!inventoryItem) return;

    setItems(items.map(item => {
      if (item.id === id) {
        const updated = {
          ...item,
          inventoryItem,
          isManual: false,
          image: inventoryItem.image,
          description: inventoryItem.name,
          unitPrice: inventoryItem.unitPrice
        };
        const totals = calculateItemTotals(updated);
        return { ...updated, ...totals };
      }
      return item;
    }));
    toast.success("Product loaded from inventory");
  };

  const handleCustomerSelect = (customer: Customer) => {
    if (customer.id) {
      setSelectedCustomerId(customer.id);
      setCustomerName(customer.name);
      setMobile(customer.mobile);
      setLocation(customer.location || "");
      setCommercialRegister(customer.commercialRegister || "");
      setTaxNumber(customer.taxNumber || "");
      // Map back to DB id
      const original = dbCustomers[customer.id - 1];
      setSelectedCustomerDbId(original?.customer_id);
    } else {
      // Clear selection
      setSelectedCustomerId(undefined);
      setSelectedCustomerDbId(undefined);
      setCustomerName("");
      setMobile("");
      setLocation("");
      setCommercialRegister("");
      setTaxNumber("");
    }
  };

  // Note: adding new customers from this screen has been disabled; use the main customers module instead.

  const calculateInvoiceTotals = () => {
    // For monthly visit invoices, use contract plan amount as grand total
    if (invoiceType === "monthly_visit" && contractPlanAmount !== null) {
      const subtotal = contractPlanAmount;
      const totalVAT = subtotal * VAT_RATE;
      const grandTotal = subtotal + totalVAT;
      
      return {
        totalBeforeDiscount: subtotal,
        totalDiscount: 0,
        totalAfterDiscount: subtotal,
        totalVAT: totalVAT,
        grandTotal: grandTotal,
      };
    }
    
    // For normal invoices, calculate from items
    const totalBeforeDiscount = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const totalAfterDiscount = items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalDiscount = totalBeforeDiscount - totalAfterDiscount;
    const totalVAT = items.reduce((sum, item) => sum + item.vat, 0);
    const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

    return { totalBeforeDiscount, totalDiscount, totalAfterDiscount, totalVAT, grandTotal };
  };

  const totals = calculateInvoiceTotals();

  const resetForm = () => {
    setSelectedCustomerId(undefined);
    setSelectedCustomerDbId(undefined);
    setInvoiceType("normal");
    setSelectedContractId(null);
    setContractPlanAmount(null);
    setVisitDate("");
    setCustomerName("");
    setMobile("");
    setLocation("");
    setCommercialRegister("");
    setTaxNumber("");
    setCompanyLogo("");
    setStamp("");
    setStampPosition({ x: 50, y: 50 });
    setNotes("");
    setTermsAndConditions(
      "• All prices include 15% VAT\n" +
      "• Payment terms: 50% advance, 50% upon completion\n" +
      "• Delivery within 7-10 business days\n" +
      "• Prices subject to change after expiry\n" +
      "• Installation and setup included\n" +
      "• One year warranty on all devices"
    );
    setPaidAmount("");
    setItems([{
      id: 1,
      isManual: true,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      priceAfterDiscount: 0,
      subtotal: 0,
      vat: 0,
      total: 0
    }]);
  };

  const createInvoice = async () => {
    if (!customerName.trim()) {
      toast.error("Please enter customer name");
      return;
    }
    if (!mobile.trim()) {
      toast.error("Please enter mobile number");
      return;
    }
    // Validate items - for monthly visit invoices, items are auto-created from contract
    if (invoiceType === "normal" && items.every(item => !item.description.trim())) {
      toast.error("Please add at least one item with description");
      return;
    }
    
    // For monthly visit invoices, ensure we have items (should be auto-created from contract)
    if (invoiceType === "monthly_visit" && items.every(item => !item.description.trim())) {
      toast.error("Please select a contract to generate invoice items");
      return;
    }

    const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`;
    const today = new Date();
    
    const paid = parseFloat(paidAmount) || 0;
    
    // For monthly visit invoices, ensure grand total matches contract plan amount
    let finalGrandTotal = totals.grandTotal;
    if (invoiceType === "monthly_visit" && contractPlanAmount !== null) {
      const subtotal = contractPlanAmount;
      const totalVAT = subtotal * VAT_RATE;
      finalGrandTotal = subtotal + totalVAT;
    }
    
    // Generate QR code
    const qrData = `Invoice: ${invoiceNumber}\nCustomer: ${customerName.trim()}\nTotal: SAR ${finalGrandTotal.toFixed(2)}\nVAT: ${taxNumber}`;
    let qrCode = "";
    
    try {
      qrCode = await QRCode.toDataURL(qrData);
    } catch (err) {
      console.error("QR Code generation error:", err);
    }
    
    // Validate paid amount doesn't exceed grand total
    if (paid > finalGrandTotal) {
      toast.error(`Paid amount cannot exceed grand total of ${finalGrandTotal.toFixed(2)} ر.س`);
      return;
    }
    
    // Remaining amount = grandTotal (after discount and VAT) - paid amount
    const remaining = Math.max(0, finalGrandTotal - paid);
    
    // Auto-determine status based on payment
    let status: "paid" | "partial" | "draft" = "draft";
    if (paid >= finalGrandTotal) {
      status = "paid";
    } else if (paid > 0) {
      status = "partial";
    }

    // Validate contract selection and visit date for monthly visit invoices
    if (invoiceType === "monthly_visit") {
      if (!selectedContractId) {
        toast.error("Please select a contract for monthly visit invoice");
        return;
      }
      if (!visitDate) {
        toast.error("Please select the visit date for monthly visit invoice");
        return;
      }
    }

    const newInvoice: Invoice = {
      id: invoices.length + 1,
      invoiceNumber,
      date: today.toISOString().split('T')[0],
      customerName: customerName.trim(),
      mobile: mobile.trim(),
      location: location.trim(),
      commercialRegister: commercialRegister.trim(),
      taxNumber: taxNumber.trim(),
      companyLogo,
      stamp,
      stampPosition,
      qrCode,
      notes: notes.trim(),
      termsAndConditions: termsAndConditions.trim(),
      items: items.filter(item => item.description.trim()),
      totalBeforeDiscount: totals.totalBeforeDiscount,
      totalDiscount: totals.totalDiscount,
      totalAfterDiscount: totals.totalAfterDiscount,
      totalVAT: totals.totalVAT,
      grandTotal: finalGrandTotal,
      paidAmount: paid,
      remainingAmount: remaining,
      status,
      invoiceType,
      contractId: invoiceType === "monthly_visit" ? selectedContractId : null,
      visitId: null,
      visitDate: invoiceType === "monthly_visit" ? visitDate || null : null,
    };

    // Note: invoices are now managed via Redux, so we don't need to update local state
    // The list will refresh automatically when dbInvoices changes
    // Persist to Supabase
    try {
      // Validate customer_id is present
      if (!selectedCustomerDbId && (!dbCustomers || dbCustomers.length === 0)) {
        toast.error("Please select a customer before creating an invoice");
        return;
      }

      const customerId = selectedCustomerDbId || dbCustomers[0]?.customer_id;
      if (!customerId) {
        toast.error("Customer ID is required");
        return;
      }

      const payment_status = status === 'paid' ? 'paid' : status === 'partial' ? 'partial' : 'draft';
      
      // Clean invoice items - remove non-serializable properties and only keep what's needed
      const cleanedItems = newInvoice.items.map(item => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discountPercent: item.discountPercent,
        priceAfterDiscount: item.priceAfterDiscount,
        subtotal: item.subtotal,
        vat: item.vat,
        total: item.total,
        image: item.image || null,
      }));

      const insertPayload: Partial<InvoicesRow> = {
        customer_id: customerId,
        contract_id: invoiceType === "monthly_visit" ? selectedContractId : null,
        invoice_items: cleanedItems,
        invoice_date: today.toISOString().split('T')[0],
        due_date: today.toISOString().split('T')[0],
        tax_rate: VAT_RATE,
        subtotal: totals.totalBeforeDiscount,
        tax_amount: totals.totalVAT,
        total_amount: finalGrandTotal,
        paid_amount: paid,
        // remaining_amount is a computed/generated column - don't include it in insert
        invoice_notes: invoiceType === "monthly_visit" 
          ? `Monthly visit invoice${visitDate ? ` for visit on ${visitDate}` : ''}${notes.trim() ? ` - ${notes.trim()}` : ''}`
          : notes.trim() || null,
        payment_status,
      };
      
      await dispatch(thunks.invoices.createOne(insertPayload)).unwrap();
      dispatch(thunks.invoices.fetchAll(undefined));
    } catch (err: any) {
      console.error('Failed to persist invoice', err);
      const errorMessage = err?.message || err?.error?.message || 'Unknown error occurred';
      toast.error(`Failed to save invoice: ${errorMessage}`);
      return; // Don't close dialog or reset form on error
    }
    resetForm();
    setIsCreateDialogOpen(false);
    
    toast.success(`Invoice ${invoiceNumber} created successfully!`);
  };

  const printInvoice = async (invoice: Invoice) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print invoices");
      return;
    }

    // Load logo from Settings if not provided in invoice
    let logoToUse = invoice.companyLogo;
    if (!logoToUse) {
      logoToUse = (await getPrintLogo()) || undefined;
    }

    // Generate a compact preview HTML for QR code (same style as print but optimized for QR code size limits)
    const escapeHtml = (text: string) => {
      if (!text) return '';
      return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    };
    
    const previewHTML = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);min-height:100vh;padding:20px}.container{max-width:800px;margin:0 auto;background:#fff;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden}.header{background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);color:#fff;padding:30px;text-align:center}.header h1{font-size:32px;margin-bottom:10px}.invoice-num{font-size:24px;font-weight:600;opacity:.9}.content{padding:30px}.section{margin-bottom:25px;padding:20px;background:#f8f9fa;border-radius:8px;border-left:4px solid #667eea}.section-title{font-size:18px;font-weight:600;color:#333;margin-bottom:15px}.info-grid{display:grid;grid-template-columns:1fr 1fr;gap:15px}.info-item{display:flex;flex-direction:column}.info-label{font-size:12px;color:#666;margin-bottom:5px;text-transform:uppercase;letter-spacing:.5px}.info-value{font-size:16px;font-weight:600;color:#333}.items-table{width:100%;border-collapse:collapse;margin-top:15px}.items-table th{background:#667eea;color:#fff;padding:12px;text-align:left;font-size:14px}.items-table td{padding:12px;border-bottom:1px solid #e0e0e0;font-size:14px}.totals{margin-top:20px;text-align:right}.total-row{display:flex;justify-content:space-between;padding:10px 0;font-size:16px}.total-row.grand{font-size:24px;font-weight:bold;color:#667eea;border-top:2px solid #667eea;padding-top:15px;margin-top:10px}.badge{display:inline-block;padding:6px 12px;border-radius:20px;font-size:12px;font-weight:600;margin-top:10px}.badge.paid{background:#10b981;color:#fff}.badge.partial{background:#f59e0b;color:#fff}.badge.draft{background:#6b7280;color:#fff}</style></head><body><div class="container"><div class="header"><h1>INVOICE</h1><div class="invoice-num">${escapeHtml(invoice.invoiceNumber)}</div><span class="badge ${invoice.status}">${invoice.status.toUpperCase()}</span></div><div class="content"><div class="section"><div class="section-title">Invoice Information</div><div class="info-grid"><div class="info-item"><span class="info-label">Date</span><span class="info-value">${new Date(invoice.date).toLocaleDateString('en-GB')}</span></div><div class="info-item"><span class="info-label">Type</span><span class="info-value">${invoice.invoiceType === 'monthly_visit' ? 'Monthly Visit' : 'Normal'}</span></div></div></div><div class="section"><div class="section-title">Customer</div><div class="info-grid"><div class="info-item"><span class="info-label">Name</span><span class="info-value">${escapeHtml(invoice.customerName)}</span></div><div class="info-item"><span class="info-label">Mobile</span><span class="info-value">${escapeHtml(invoice.mobile)}</span></div>${invoice.location ? `<div class="info-item"><span class="info-label">Location</span><span class="info-value">${escapeHtml(invoice.location)}</span></div>` : ''}</div></div><div class="section"><div class="section-title">Items</div><table class="items-table"><thead><tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead><tbody>${invoice.items.map(item => `<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>SAR ${item.unitPrice.toFixed(2)}</td><td>SAR ${item.total.toFixed(2)}</td></tr>`).join('')}</tbody></table></div><div class="section"><div class="totals"><div class="total-row"><span>Subtotal:</span><span>SAR ${invoice.totalBeforeDiscount.toFixed(2)}</span></div>${invoice.totalDiscount > 0 ? `<div class="total-row"><span>Discount:</span><span>- SAR ${invoice.totalDiscount.toFixed(2)}</span></div>` : ''}<div class="total-row"><span>VAT (15%):</span><span>SAR ${invoice.totalVAT.toFixed(2)}</span></div><div class="total-row grand"><span>GRAND TOTAL:</span><span>SAR ${invoice.grandTotal.toFixed(2)}</span></div>${invoice.paidAmount > 0 ? `<div class="total-row"><span>Paid:</span><span style="color:#10b981">SAR ${invoice.paidAmount.toFixed(2)}</span></div>` : ''}${invoice.remainingAmount > 0 ? `<div class="total-row"><span>Remaining:</span><span style="color:#ef4444">SAR ${invoice.remainingAmount.toFixed(2)}</span></div>` : ''}</div></div></div></div></body></html>`;
    
    // Generate QR code with data URL
    let qrCode = "";
    try {
      const qrDataUrl = `data:text/html;charset=utf-8,${encodeURIComponent(previewHTML)}`;
      qrCode = await QRCode.toDataURL(qrDataUrl, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300
      });
    } catch (err) {
      console.error("QR Code generation error:", err);
      // Fallback: generate a simple text QR code
      try {
        const simpleData = `Invoice: ${invoice.invoiceNumber}\nDate: ${new Date(invoice.date).toLocaleDateString('en-GB')}\nCustomer: ${invoice.customerName}\nTotal: SAR ${invoice.grandTotal.toFixed(2)}`;
        qrCode = await QRCode.toDataURL(simpleData);
      } catch (fallbackErr) {
        console.error("QR Code fallback generation error:", fallbackErr);
      }
    }

    // Generate HTML with logo and QR code
    const invoiceHTML = generateInvoiceHTML(invoice, logoToUse, qrCode);
    
    // Write HTML to print window
    printWindow.document.open();
    printWindow.document.write(invoiceHTML);
    printWindow.document.close();
    
    // Wait for window to be ready and images to load
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (printWindow.document.readyState === 'complete') {
          const images = printWindow.document.querySelectorAll('img');
          if (images.length === 0) {
            resolve();
            return;
          }
          
          let loadedCount = 0;
          const totalImages = images.length;
          
          const checkComplete = () => {
            loadedCount++;
            if (loadedCount >= totalImages) {
              resolve();
            }
          };
          
          images.forEach((img: HTMLImageElement) => {
            if (img.complete && img.naturalHeight !== 0) {
              checkComplete();
            } else {
              img.onload = checkComplete;
              img.onerror = checkComplete;
            }
          });
          
          // Fallback timeout
          setTimeout(() => resolve(), 2000);
        } else {
          setTimeout(checkReady, 100);
        }
      };
      
      checkReady();
    });
    
    // Small delay to ensure everything is rendered
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Trigger print
    printWindow.focus();
    printWindow.print();
  };

  const generateInvoiceHTML = (invoice: Invoice, logoUrl?: string | null, qrCode?: string) => {
    // Use provided logo or fall back to invoice logo
    const companyLogo = logoUrl || invoice.companyLogo;
    // Escape HTML special characters in text content
    const escapeHtml = (text: string) => {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };
    
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Invoice ${escapeHtml(invoice.invoiceNumber)}</title>
        <style>
          @page { 
            size: A4; 
            margin: 15mm;
          }
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
          }
          html, body {
            width: 100%;
            height: 100%;
          }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, Arial, Helvetica;
            line-height: 1.6;
            color: #333;
            font-size: 14px;
            background: #ffffff;
            position: relative;
            padding: 0;
            margin: 0;
          }
          .invoice-container { 
            max-width: 800px; 
            margin: 0 auto; 
            padding: 20px; 
            position: relative; 
            background: white; 
            min-height: 100vh;
          }
          ${invoice.stamp ? `
          .stamp {
            position: absolute;
            top: ${invoice.stampPosition?.y || 50}%;
            left: ${invoice.stampPosition?.x || 50}%;
            transform: translate(-50%, -50%) rotate(-15deg);
            opacity: 0.12;
            z-index: 0;
            max-width: 80px;
            pointer-events: none;
          }
          ` : ''}
          ${invoice.status === 'paid' ? `
          .paid-stamp {
            position: absolute;
            top: 120px;
            right: 80px;
            width: 220px;
            height: 220px;
            border: 10px solid #22c55e;
            border-radius: 16px;
            transform: rotate(-18deg);
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            opacity: 0.3;
            z-index: 5;
            pointer-events: none;
            box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.1);
          }
          .paid-stamp-text {
            font-size: 48px;
            font-weight: 900;
            color: #22c55e;
            letter-spacing: 6px;
            text-align: center;
            line-height: 1.1;
            text-transform: uppercase;
          }
          .paid-stamp-ar {
            font-size: 40px;
            font-weight: 900;
            color: #22c55e;
            margin-top: 10px;
            letter-spacing: 2px;
          }
          @media print {
            .paid-stamp {
              opacity: 0.35;
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
          }
          ` : ''}
          .content { position: relative; z-index: 1; }
          .header { 
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            padding-bottom: 20px;
            border-bottom: 3px solid #cbd5e1;
            margin-bottom: 20px;
          }
          .company-info { text-align: left; }
          .company-logo { 
            max-width: 180px;
            height: auto;
            margin-bottom: 10px;
          }
          .company-name {
            font-size: 22px; 
            font-weight: bold; 
            color: #475569;
            margin-bottom: 5px;
          }
          .invoice-info { text-align: right; }
          .invoice-number {
            font-size: 22px;
            font-weight: bold;
            color: #475569;
            margin-bottom: 10px;
          }
          .invoice-badge {
            background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
            color: white;
            padding: 8px 16px;
            border-radius: 6px;
            display: inline-block;
            margin-top: 10px;
            font-weight: 600;
          }
          .customer-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin: 20px 0;
            padding: 15px;
            background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
            border-radius: 8px;
          }
          .section-title {
            font-weight: 600;
            color: #64748b;
            margin-bottom: 10px;
            font-size: 16px;
          }
          .info-row {
            margin: 5px 0;
            font-size: 13px;
          }
          .label { 
            font-weight: 600; 
            color: #94a3b8;
            display: inline-block;
            min-width: 100px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .items-table th {
            background: linear-gradient(135deg, #64748b 0%, #475569 100%);
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-size: 13px;
            font-weight: 600;
          }
          .items-table th:first-child { border-radius: 8px 0 0 0; }
          .items-table th:last-child { border-radius: 0 8px 0 0; }
          .items-table td {
            padding: 10px 8px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
          }
          .items-table tr:hover {
            background: linear-gradient(135deg, #f8fafc 0%, #ffffff 100%);
          }
          .item-image {
            width: 50px;
            height: 50px;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            display: block;
            max-width: 100%;
            height: auto;
          }
          @media print {
            .item-image {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
              max-width: 50px;
              max-height: 50px;
            }
          }
          .item-desc {
            font-weight: 500;
          }
          .totals-section {
            float: right;
            width: 350px;
            margin-top: 20px;
            margin-bottom: 20px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 15px;
            border-bottom: 1px solid #e2e8f0;
          }
          .total-row.grand {
            background: linear-gradient(135deg, #64748b 0%, #475569 100%);
            color: white;
            font-size: 18px;
            font-weight: bold;
            border-radius: 8px;
            margin-top: 10px;
          }
          .totals-wrapper {
            overflow: hidden;
            margin-bottom: 30px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .footer {
            clear: both;
            margin-top: 60px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 20px;
            align-items: center;
          }
          .terms {
            clear: both;
            background: #374151;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
            border-left: 4px solid #1f2937;
            max-height: none;
            overflow: visible;
            page-break-inside: avoid;
            page-break-after: avoid;
          }
          .terms-title {
            font-weight: 600;
            color: #f3f4f6;
            margin-bottom: 8px;
          }
          .terms-content {
            color: #e5e7eb;
            font-size: 13px;
            white-space: pre-wrap;
            overflow: visible;
            max-height: none;
          }
          .qr-section {
            text-align: center;
          }
          .qr-code {
            width: 120px;
            height: 120px;
            border: 2px solid #e2e8f0;
            border-radius: 8px;
            padding: 5px;
          }
          @media print {
            @page {
              size: A4;
              margin: 15mm;
            }
            html, body {
              width: 100%;
              height: auto;
              margin: 0;
              padding: 0;
              background: white !important;
            }
            body { 
              print-color-adjust: exact; 
              -webkit-print-color-adjust: exact; 
              background: white !important;
              font-size: 12px;
            }
            .invoice-container {
              max-width: 100%;
              margin: 0;
              padding: 15mm;
              box-shadow: none;
              border-radius: 0;
            }
            .stamp, .paid-stamp {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .items-table th {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .total-row.grand {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .terms {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .invoice-badge {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            /* Prevent page breaks inside important sections */
            .header, .customer-section, .totals-wrapper, .totals-section {
              page-break-inside: avoid;
            }
            .items-table tbody tr {
              page-break-inside: avoid;
            }
            /* Ensure footer stays together */
            .footer {
              page-break-inside: avoid;
            }
            /* Ensure notes don't overlap with totals */
            .totals-wrapper {
              clear: both;
              margin-bottom: 30px;
            }
            .terms {
              clear: both;
              margin-top: 30px;
            }
            /* Keep totals/terms together when possible */
            .totals-wrapper {
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .terms {
              page-break-inside: avoid;
              break-inside: avoid;
              page-break-after: auto;
              orphans: 3;
              widows: 3;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          ${invoice.stamp ? `<img src="${invoice.stamp}" class="stamp" alt="Stamp">` : ''}
          ${invoice.status === 'paid' ? `
          <div class="paid-stamp">
            <div class="paid-stamp-text">✓ PAID</div>
            <div class="paid-stamp-ar">مدفوعة ✓</div>
          </div>
          ` : ''}
          
          <div class="content">
            <div class="header">
              <div class="company-info">
                ${companyLogo ? `<img src="${companyLogo}" class="company-logo" alt="Company Logo">` : 
                  '<div class="company-name">🌸 Mana Smart Trading</div>'}
                <div style="color: #64748b; font-size: 13px;">
                  Khobar, Saudi Arabia<br>
                  VAT: 311234567800003 | C.R.: 2051245473<br>
                  Email: sales@mana.sa | Phone: +966 556 292 500
                </div>
              </div>
              <div class="invoice-info">
                <div class="invoice-number">INVOICE</div>
                <div style="font-size: 16px; color: #64748b; margin-bottom: 5px;">${invoice.invoiceNumber}</div>
                <div style="font-size: 13px; color: #94a3b8;">Date: ${new Date(invoice.date).toLocaleDateString('en-GB')}</div>
                ${invoice.invoiceType === 'monthly_visit' && invoice.visitDate ? `
                <div style="font-size: 13px; color: #3b82f6; font-weight: 600; margin-top: 5px;">
                  For Monthly Visit: ${new Date(invoice.visitDate).toLocaleDateString('en-GB')}
                </div>
                <div style="font-size: 12px; color: #64748b; margin-top: 2px;">
                  Invoice for ${new Date(invoice.visitDate).toLocaleDateString('en-GB')} monthly visit
                </div>
                ` : ''}
                <div class="invoice-badge">TAX INVOICE</div>
              </div>
            </div>

            <div class="customer-section">
              <div>
                <div class="section-title">Bill To</div>
                <div class="info-row"><span class="label">Name:</span> ${invoice.customerName}</div>
                <div class="info-row"><span class="label">Mobile:</span> ${invoice.mobile}</div>
                ${invoice.location ? `<div class="info-row"><span class="label">Location:</span> ${invoice.location}</div>` : ''}
              </div>
              <div>
                <div class="section-title">Tax Information</div>
                ${invoice.commercialRegister ? `<div class="info-row"><span class="label">C.R.:</span> ${invoice.commercialRegister}</div>` : ''}
                ${invoice.taxNumber ? `<div class="info-row"><span class="label">VAT:</span> ${invoice.taxNumber}</div>` : ''}
              </div>
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 60px;">Image</th>
                  <th>Description</th>
                  <th style="width: 80px; text-align: center;">Qty</th>
                  <th style="width: 100px; text-align: right;">Price</th>
                  <th style="width: 80px; text-align: center;">Disc. %</th>
                  <th style="width: 100px; text-align: right;">Subtotal</th>
                  <th style="width: 80px; text-align: right;">VAT 15%</th>
                  <th style="width: 100px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map(item => `
                  <tr>
                    <td>
                      ${item.image ? `<img src="${item.image}" class="item-image" alt="${item.description}">` : 
                        '<div style="width: 50px; height: 50px; background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 20px;">📦</div>'}
                    </td>
                    <td>
                      <div class="item-desc">${item.description}</div>
                    </td>
                    <td style="text-align: center;">${item.quantity}</td>
                    <td style="text-align: right;">SAR ${item.unitPrice.toFixed(2)}</td>
                    <td style="text-align: center;">${item.discountPercent}%</td>
                    <td style="text-align: right;">SAR ${item.subtotal.toFixed(2)}</td>
                    <td style="text-align: right;">SAR ${item.vat.toFixed(2)}</td>
                    <td style="text-align: right; font-weight: 600;">SAR ${item.total.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>

            <div class="totals-wrapper">
              <div class="totals-section">
                <div class="total-row">
                  <span>Subtotal:</span>
                  <span>SAR ${invoice.totalBeforeDiscount.toFixed(2)}</span>
                </div>
                ${invoice.totalDiscount > 0 ? `
                <div class="total-row">
                  <span>Discount:</span>
                  <span>- SAR ${invoice.totalDiscount.toFixed(2)}</span>
                </div>
                ` : ''}
                <div class="total-row">
                  <span>After Discount:</span>
                  <span>SAR ${invoice.totalAfterDiscount.toFixed(2)}</span>
                </div>
                <div class="total-row">
                  <span>VAT (15%):</span>
                  <span>SAR ${invoice.totalVAT.toFixed(2)}</span>
                </div>
                <div class="total-row grand">
                  <span>GRAND TOTAL:</span>
                  <span>SAR ${invoice.grandTotal.toFixed(2)}</span>
                </div>
                ${invoice.paidAmount > 0 ? `
                <div class="total-row" style="color: #16a34a;">
                  <span>PAID AMOUNT:</span>
                  <span>SAR ${invoice.paidAmount.toFixed(2)}</span>
                </div>
                ` : ''}
                ${invoice.remainingAmount > 0 ? `
                <div class="total-row" style="color: #ea580c;">
                  <span>REMAINING:</span>
                  <span>SAR ${invoice.remainingAmount.toFixed(2)}</span>
                </div>
                ` : ''}
              </div>
            </div>

            ${invoice.notes ? `
            <div class="terms">
              <div class="terms-title">Notes</div>
              <div class="terms-content">${invoice.notes}</div>
            </div>
            ` : ''}

            <div class="terms">
              <div class="terms-title">Terms & Conditions</div>
              <div class="terms-content">${invoice.termsAndConditions || `• Payment is due within 30 days from the invoice date
• All prices include 15% VAT
• Bank transfer details will be provided separately
• Late payments subject to additional charges
• Please reference invoice number in payment`}</div>
            </div>

            <div style="margin-top: 20px; padding: 15px 0; border-top: 1px solid #e2e8f0; font-size: 13px; color: #333; line-height: 1.6;">
              <div>Mana Smart Trading Company</div>
              <div>Al Rajhi Bank</div>
              <div>A.N.: 301000010006080269328</div>
              <div>IBAN No.: SA2680000301608010269328</div>
            </div>

            <div class="footer">
              <div style="color: #64748b; font-size: 12px;">
                <div style="font-weight: 600; color: #475569; margin-bottom: 5px;">Thank You for Your Business!</div>
                If you have any questions about this invoice, please contact us at:<br>
                Email: sales@mana.sa | Phone: +966 556 292 500
              </div>
              ${qrCode ? `
              <div class="qr-section">
                <img src="${qrCode}" class="qr-code" alt="QR Code">
                <div style="font-size: 11px; color: #94a3b8; margin-top: 5px;">Scan for details</div>
              </div>
              ` : ''}
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  };



  // Save settings when they change
  useEffect(() => {
    localStorage.setItem(AUTO_INVOICE_ENABLED_KEY, autoInvoiceEnabled.toString());
  }, [autoInvoiceEnabled]);

  useEffect(() => {
    localStorage.setItem(AUTO_INVOICE_TIMING_KEY, autoInvoiceTiming);
  }, [autoInvoiceTiming]);

  const stats = {
    total: invoices.length,
    paid: invoices.filter(inv => inv.status === "paid").length,
    partial: invoices.filter(inv => inv.status === "partial").length,
    draft: invoices.filter(inv => inv.status === "draft").length,
    totalRevenue: invoices.reduce((sum, inv) => sum + inv.paidAmount, 0),
    pendingAmount: invoices.reduce((sum, inv) => sum + inv.remainingAmount, 0),
  };

  const exportToExcel = () => {
    try {
      const exportData = invoices.map((invoice) => ({
        "Invoice Number": invoice.invoiceNumber,
        Date: invoice.date,
        "Customer Name": invoice.customerName,
        Mobile: invoice.mobile,
        Location: invoice.location,
        "Total Amount (SAR)": invoice.grandTotal,
        "Paid Amount (SAR)": invoice.paidAmount,
        "Remaining Amount (SAR)": invoice.remainingAmount,
        Status: invoice.status,
        Type: invoice.invoiceType === "monthly_visit" ? "Monthly Visit" : "Normal",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Invoices");
      const fileName = `invoices_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Invoices</h2>
          <p className="text-muted-foreground mt-1">Create and manage customer invoices</p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white" disabled={customersLoading}>
              <Plus className="h-4 w-4" />
              New Invoice
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-lg">Create New Invoice</DialogTitle>
              <DialogDescription className="text-sm">Fill in customer details and add items</DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto overflow-x-hidden flex-1 pr-2">
              <div className="space-y-3 px-1 py-2">
                {/* Customer Information */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Customer Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="col-span-2">
                      <CustomerSelector
                        customers={customers}
                        selectedCustomerId={selectedCustomerId}
                        onCustomerSelect={handleCustomerSelect}
                        hideQuickAdd
                        label="Select Customer"
                        placeholder="Search customer by name, company, or mobile..."
                        required
                      />
                    </div>
                    
                    {selectedCustomerId && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                        <div className="space-y-1">
                          <Label htmlFor="customerName" className="text-xs">Customer Name</Label>
                          <Input 
                            id="customerName" 
                            value={customerName} 
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Customer Name"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="mobile" className="text-xs">Mobile Number</Label>
                          <Input 
                            id="mobile" 
                            value={mobile} 
                            onChange={(e) => setMobile(e.target.value)}
                            placeholder="0501234567"
                            className="h-8 text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="location" className="text-xs">Location</Label>
                          <Input 
                            id="location" 
                            value={location} 
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="Riyadh, Al Malaz District"
                            className="h-8 text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="commercialRegister" className="text-xs">Commercial Register</Label>
                          <Input 
                            id="commercialRegister" 
                            value={commercialRegister} 
                            onChange={(e) => setCommercialRegister(e.target.value)}
                            placeholder="1010123456"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="col-span-2 space-y-1">
                          <Label htmlFor="taxNumber" className="text-xs">VAT Number</Label>
                          <Input 
                            id="taxNumber" 
                            value={taxNumber} 
                            onChange={(e) => setTaxNumber(e.target.value)}
                            placeholder="300159475400003"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Invoice Type Selection */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Invoice Type</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-2">
                      <Label htmlFor="invoiceType" className="text-xs">Select Invoice Type *</Label>
                      <Select value={invoiceType} onValueChange={(value: InvoiceType) => {
                        setInvoiceType(value);
                        if (value === "normal") {
                          setSelectedContractId(null);
                          setContractPlanAmount(null);
                          setPaidAmount("");
                          // Reset to default empty item
                          setItems([{
                            id: 1,
                            isManual: true,
                            description: "",
                            quantity: 1,
                            unitPrice: 0,
                            discountPercent: 0,
                            priceAfterDiscount: 0,
                            subtotal: 0,
                            vat: 0,
                            total: 0
                          }]);
                        } else {
                          // When switching to monthly_visit, clear items and paid amount until contract is selected
                          setContractPlanAmount(null);
                          setVisitDate("");
                          setPaidAmount("");
                          setItems([{
                            id: 1,
                            isManual: true,
                            description: "",
                            quantity: 1,
                            unitPrice: 0,
                            discountPercent: 0,
                            priceAfterDiscount: 0,
                            subtotal: 0,
                            vat: 0,
                            total: 0
                          }]);
                        }
                      }}>
                        <SelectTrigger id="invoiceType" className="h-8 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="normal">Normal Invoice - فاتورة عادية</SelectItem>
                          <SelectItem value="monthly_visit">Monthly Visit Invoice - فاتورة زيارة شهرية</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">
                        {invoiceType === "normal" 
                          ? "Regular invoice for item purchases"
                          : "Recurring invoice for monthly service visits"}
                      </p>
                    </div>

                    {invoiceType === "monthly_visit" && (
                      <div className="space-y-2 pt-2 border-t">
                        <Label htmlFor="contractId" className="text-xs">Link to Contract *</Label>
                        <Select 
                          value={selectedContractId || ""} 
                          onValueChange={(value) => {
                            setSelectedContractId(value || null);
                            // Prefill paid amount based on contract payment plan
                            if (value) {
                              const contract = dbContracts.find(c => c.contract_id === value);
                              if (contract && contract.notes) {
                                try {
                                  const contractData = JSON.parse(contract.notes);
                                  const paymentPlan = contractData.paymentPlan || "monthly";
                                  const monthlyAmount = contractData.monthlyAmount || 0;
                                  const semiAnnualAmount = contractData.semiAnnualAmount || 0;
                                  const annualAmount = contractData.annualAmount || 0;
                                  
                                  // Calculate monthly invoice amount based on payment plan
                                  let invoiceAmount = 0;
                                  if (paymentPlan === "monthly") {
                                    invoiceAmount = monthlyAmount;
                                  } else if (paymentPlan === "semi-annual") {
                                    invoiceAmount = semiAnnualAmount / 6;
                                  } else if (paymentPlan === "annual") {
                                    invoiceAmount = annualAmount / 12;
                                  }
                                  
                                  // Store contract plan amount for grand total calculation
                                  setContractPlanAmount(invoiceAmount);
                                  
                                  // Don't prefill paid amount - let user enter it
                                  setPaidAmount("");
                                  
                                  // Auto-create invoice item for monthly visit (for display/record keeping)
                                  const itemDescription = `Monthly service payment - ${paymentPlan === 'monthly' ? 'Monthly' : paymentPlan === 'semi-annual' ? 'Semi-Annual' : 'Annual'} plan`;
                                  const subtotal = invoiceAmount;
                                  const vat = subtotal * VAT_RATE;
                                  const total = subtotal + vat;
                                  
                                  setItems([{
                                    id: Date.now(),
                                    isManual: true,
                                    description: itemDescription,
                                    quantity: 1,
                                    unitPrice: invoiceAmount,
                                    discountPercent: 0,
                                    priceAfterDiscount: invoiceAmount,
                                    subtotal: subtotal,
                                    vat: vat,
                                    total: total,
                                  }]);
                                } catch (error) {
                                  console.error("Failed to parse contract data:", error);
                                }
                              }
                            } else {
                              // Reset items and paid amount when contract is cleared
                              setContractPlanAmount(null);
                              setVisitDate("");
                              setPaidAmount("");
                              setItems([{
                                id: 1,
                                isManual: true,
                                description: "",
                                quantity: 1,
                                unitPrice: 0,
                                discountPercent: 0,
                                priceAfterDiscount: 0,
                                subtotal: 0,
                                vat: 0,
                                total: 0
                              }]);
                            }
                          }}
                        >
                          <SelectTrigger id="contractId" className="h-8 text-sm">
                            <SelectValue placeholder="Select contract..." />
                          </SelectTrigger>
                          <SelectContent>
                            {selectedCustomerDbId ? (
                              (() => {
                                const activeContracts = dbContracts.filter(
                                  c => c.customer_id === selectedCustomerDbId && c.contract_status?.toLowerCase() === 'active'
                                );
                                return activeContracts.length > 0 ? (
                                  activeContracts.map(contract => (
                                    <SelectItem key={contract.contract_id} value={contract.contract_id}>
                                      {contract.contract_number || contract.contract_id.slice(0, 8)} - {contract.contract_status}
                                    </SelectItem>
                                  ))
                                ) : (
                                  <div className="px-2 py-1.5 text-sm text-muted-foreground">No active contracts found</div>
                                );
                              })()
                            ) : (
                              <div className="px-2 py-1.5 text-sm text-muted-foreground">Please select a customer first</div>
                            )}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Select the active contract for this monthly visit invoice
                        </p>
                        
                        <div className="space-y-1">
                          <Label htmlFor="visitDate" className="text-xs">Visit Date - تاريخ الزيارة *</Label>
                          <Input
                            id="visitDate"
                            type="date"
                            value={visitDate}
                            onChange={(e) => setVisitDate(e.target.value)}
                            className="h-8 text-sm"
                            required={invoiceType === "monthly_visit"}
                          />
                          <p className="text-xs text-muted-foreground">
                            Select the date of the monthly visit this invoice is for
                          </p>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Branding */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Branding & Customization</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Company Logo</Label>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => logoInputRef.current?.click()}
                          className="w-full h-8 text-xs"
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Upload Logo
                        </Button>
                        {companyLogo && (
                          <div className="relative">
                            <ImageWithFallback 
                              src={companyLogo} 
                              alt="Company Logo" 
                              className="h-16 w-auto object-contain border rounded"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-0 right-0 h-6 w-6"
                              onClick={() => setCompanyLogo("")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Stamp (Optional)</Label>
                        <input
                          ref={stampInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleStampUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => stampInputRef.current?.click()}
                          className="w-full h-8 text-xs"
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Upload Stamp
                        </Button>
                        {stamp && (
                          <div className="relative">
                            <ImageWithFallback 
                              src={stamp} 
                              alt="Stamp" 
                              className="h-16 w-auto object-contain border rounded"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-0 right-0 h-6 w-6"
                              onClick={() => setStamp("")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Items - Only show for normal invoices */}
                {invoiceType === "normal" && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Invoice Items</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {items.map((item, index) => (
                      <div key={item.id} className="space-y-2 p-2 border rounded-lg bg-muted/30">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-xs">Item {index + 1}</span>
                            <Badge variant={item.isManual ? "default" : "secondary"} className="text-xs">
                              {item.isManual ? "Manual" : "From Inventory"}
                            </Badge>
                          </div>
                          {items.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => removeItem(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>

                        <div className="space-y-2 w-full">
                          {!item.isManual && (
                            <div className="space-y-1 w-full">
                              <Label className="text-xs">Load from Inventory *</Label>
                              <Select onValueChange={(value) => loadItemFromInventory(item.id, value)}>
                                <SelectTrigger className="h-8 text-sm w-full">
                                  <SelectValue placeholder="Select product..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {inventory.map(inv => (
                                    <SelectItem key={inv.id} value={inv.id.toString()}>
                                      {inv.name} - SAR {inv.unitPrice.toFixed(2)}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          )}

                          <div className="space-y-1 w-full">
                            <Label className="text-xs">Item Image</Label>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => handleItemImageUpload(item.id, e)}
                              className="hidden"
                              id={`item-image-${item.id}`}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => document.getElementById(`item-image-${item.id}`)?.click()}
                              className="w-full h-7 text-xs"
                            >
                              <Upload className="h-3 w-3 mr-1" />
                              Upload Image
                            </Button>
                            {item.image && (
                              <div className="relative inline-block">
                                <ImageWithFallback 
                                  src={item.image} 
                                  alt="Item" 
                                  className="h-16 w-16 object-cover border rounded"
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="absolute -top-2 -right-2 h-5 w-5"
                                  onClick={() => updateItemImage(item.id, "")}
                                >
                                  <X className="h-3 w-3" />
                                </Button>
                              </div>
                            )}
                          </div>

                          <div className="space-y-1 w-full">
                            <Label className="text-xs">Description *</Label>
                            <Input
                              value={item.description}
                              onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                              placeholder="Item description"
                              className="h-8 text-sm w-full"
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Quantity</Label>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateItem(item.id, 'quantity', parseInt(e.target.value) || 1)}
                                className="h-8 text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">Unit Price</Label>
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.unitPrice}
                                onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">Discount %</Label>
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                value={item.discountPercent}
                                onChange={(e) => updateItem(item.id, 'discountPercent', parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">Total</Label>
                              <Input
                                type="text"
                                value={item.total.toFixed(2)}
                                disabled
                                className="bg-muted h-8 text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addManualItem}
                        className="w-full h-8 text-xs"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Add Manual Item
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addInventoryItem}
                        disabled={inventory.length === 0}
                        className="w-full h-8 text-xs"
                        title={inventory.length === 0 ? "No items currently in inventory" : ""}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {inventory.length === 0 ? "No items currently in inventory" : "Add from Inventory"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                )}

                {/* Totals Summary */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Invoice Summary</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span>SAR {totals.totalBeforeDiscount.toFixed(2)}</span>
                    </div>
                    {totals.totalDiscount > 0 && (
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Discount:</span>
                        <span className="text-destructive">- SAR {totals.totalDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">After Discount:</span>
                      <span>SAR {totals.totalAfterDiscount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">VAT (15%):</span>
                      <span>SAR {totals.totalVAT.toFixed(2)}</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between font-semibold text-sm">
                      <span>
                        Grand Total:
                        {invoiceType === "monthly_visit" && contractPlanAmount !== null && (
                          <span className="text-xs text-muted-foreground font-normal ml-2">
                            (Based on contract plan)
                          </span>
                        )}
                      </span>
                      <span className="text-primary">SAR {totals.grandTotal.toFixed(2)}</span>
                    </div>
                    {invoiceType === "monthly_visit" && contractPlanAmount !== null && (
                      <p className="text-xs text-muted-foreground italic">
                        Grand total is calculated from the selected contract's payment plan amount
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Additional Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Enter any additional notes..."
                      rows={2}
                      className="text-sm"
                    />
                  </CardContent>
                </Card>

                {/* Terms & Conditions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Terms & Conditions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 rounded-lg" style={{ backgroundColor: '#f3f4f6' }}>
                      <Textarea
                        value={termsAndConditions}
                        onChange={(e) => setTermsAndConditions(e.target.value)}
                        placeholder="Enter terms and conditions..."
                        rows={6}
                        className="text-sm resize-none border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Payment Information */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Payment Information - معلومات الدفع</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="space-y-1">
                      <Label htmlFor="paidAmount" className="text-xs">Paid Amount - المبلغ المدفوع (SAR) *</Label>
                      <Input 
                        id="paidAmount"
                        type="number"
                        step="0.01"
                        min="0"
                        max={totals.grandTotal}
                        value={paidAmount} 
                        onChange={(e) => {
                          const value = e.target.value;
                          const numValue = parseFloat(value);
                          // Prevent negative values and values exceeding grand total
                          if (value === '' || isNaN(numValue)) {
                            setPaidAmount(value);
                          } else if (numValue < 0) {
                            setPaidAmount('0');
                          } else if (numValue > totals.grandTotal) {
                            setPaidAmount(totals.grandTotal.toFixed(2));
                            toast.warning(`Paid amount cannot exceed grand total of ${totals.grandTotal.toFixed(2)} ر.س`);
                          } else {
                            setPaidAmount(value);
                          }
                        }}
                        placeholder="0.00"
                        className="h-8 text-sm"
                      />
                      <p className="text-xs text-muted-foreground">
                        {invoiceType === "monthly_visit" 
                          ? `Enter amount paid (max: ${totals.grandTotal.toFixed(2)} ر.س). Status will be automatically set.`
                          : "Enter amount paid. Status will be automatically set."}
                      </p>
                    </div>
                    
                    <div className="bg-muted/50 p-2 rounded-lg space-y-1.5">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Total Amount:</span>
                        <span className="font-semibold">{totals.grandTotal.toFixed(2)} ر.س</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Paid Amount:</span>
                        <span className="font-semibold text-green-600">{(parseFloat(paidAmount) || 0).toFixed(2)} ر.س</span>
                      </div>
                      <div className="flex justify-between text-xs border-t pt-1.5">
                        <span className="text-muted-foreground">Remaining:</span>
                        <span className="font-semibold text-orange-600">
                          {Math.max(0, totals.grandTotal - (parseFloat(paidAmount) || 0)).toFixed(2)} ر.س
                        </span>
                      </div>
                      <div className="flex justify-between text-xs border-t pt-1.5">
                        <span className="text-muted-foreground">Status:</span>
                        <span>
                          {(parseFloat(paidAmount) || 0) >= totals.grandTotal ? (
                            <Badge className="bg-green-100 text-green-700 border-green-200 text-xs py-0">Paid - مدفوعة</Badge>
                          ) : (parseFloat(paidAmount) || 0) > 0 ? (
                            <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs py-0">Partial - جزئي</Badge>
                          ) : (
                            <Badge className="bg-gray-100 text-gray-700 border-gray-200 text-xs py-0">Draft - مسودة</Badge>
                          )}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Settings Section */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Automatic Invoicing Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5 flex-1">
                        <Label htmlFor="autoInvoiceEnabled" className="text-xs">Enable Automatic Invoicing</Label>
                        <p className="text-xs text-muted-foreground">
                          Automatically create invoices when monthly visits are generated
                        </p>
                      </div>
                      <Switch
                        id="autoInvoiceEnabled"
                        checked={autoInvoiceEnabled}
                        onCheckedChange={setAutoInvoiceEnabled}
                      />
                    </div>
                    {autoInvoiceEnabled && (
                      <div className="space-y-2 pt-2 border-t">
                        <Label htmlFor="autoInvoiceTiming" className="text-xs">Invoice Generation Timing</Label>
                        <Select value={autoInvoiceTiming} onValueChange={(value: 'visit_date' | '7_days_before') => setAutoInvoiceTiming(value)}>
                          <SelectTrigger id="autoInvoiceTiming" className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="visit_date">On Visit Date</SelectItem>
                            <SelectItem value="7_days_before">7 Days Before Visit Date</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {autoInvoiceTiming === 'visit_date' 
                            ? 'Invoice will be generated on the same day as the monthly visit'
                            : 'Invoice will be generated 7 days before the monthly visit date'}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t mt-3 flex-shrink-0">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="h-9">
                Cancel
              </Button>
              <Button onClick={createInvoice} className="h-9 bg-purple-600 hover:bg-purple-700 text-white">
                Create Invoice
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoices</CardTitle>
            <DollarSign className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <>
                <Skeleton className="h-9 w-16 mb-2" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-blue-600">{stats.total}</div>
                <p className="text-xs text-muted-foreground mt-1">All invoices</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
            <Wallet className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <>
                <Skeleton className="h-9 w-16 mb-2" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-green-600">{stats.paid}</div>
                <p className="text-xs text-muted-foreground mt-1">Fully paid</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Partial</CardTitle>
            <CreditCard className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <>
                <Skeleton className="h-9 w-16 mb-2" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-yellow-600">{stats.partial}</div>
                <p className="text-xs text-muted-foreground mt-1">Partially paid</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
            <DollarSign className="h-5 w-5 text-gray-500" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <>
                <Skeleton className="h-9 w-16 mb-2" />
                <Skeleton className="h-4 w-20" />
              </>
            ) : (
              <>
                <div className="text-3xl font-bold text-gray-600">{stats.draft}</div>
                <p className="text-xs text-muted-foreground mt-1">Unpaid</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Revenue</CardTitle>
            <Wallet className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <>
                <Skeleton className="h-9 w-20 mb-2" />
                <Skeleton className="h-4 w-24" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-purple-600">{stats.totalRevenue.toFixed(0)}</div>
                <p className="text-xs text-muted-foreground mt-1">SAR collected</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <CreditCard className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            {isDataLoading ? (
              <>
                <Skeleton className="h-9 w-20 mb-2" />
                <Skeleton className="h-4 w-24" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-orange-600">{stats.pendingAmount.toFixed(0)}</div>
                <p className="text-xs text-muted-foreground mt-1">SAR pending</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search invoices by number or customer..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Invoices</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="paid">✅ Paid</SelectItem>
                  <SelectItem value="partial">💰 Partial</SelectItem>
                  <SelectItem value="draft">📝 Draft</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isDataLoading ? (
            <div className="space-y-3">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead><Skeleton className="h-4 w-24" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-28" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-16" /></TableHead>
                      <TableHead><Skeleton className="h-4 w-20" /></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : filteredInvoices.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground text-sm">
                {searchQuery ? "No invoices found matching your search" : "No invoices created yet. Create your first invoice to get started!"}
              </div>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                    <TableCell>
                      <Badge className={
                        invoice.invoiceType === "monthly_visit" 
                          ? "bg-blue-100 text-blue-700 border-blue-200" 
                          : "bg-gray-100 text-gray-700 border-gray-200"
                      }>
                        {invoice.invoiceType === "monthly_visit" ? "Monthly Visit" : "Normal"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>{invoice.customerName}</div>
                      <div className="text-xs text-muted-foreground">{invoice.mobile}</div>
                    </TableCell>
                    <TableCell>{new Date(invoice.date).toLocaleDateString('en-GB')}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {invoice.grandTotal.toFixed(2)} ر.س
                    </TableCell>
                    <TableCell className="text-right text-green-600 font-medium">
                      {invoice.paidAmount.toFixed(2)} ر.س
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      <span className={invoice.remainingAmount > 0 ? "text-orange-600" : "text-muted-foreground"}>
                        {invoice.remainingAmount.toFixed(2)} ر.س
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge className={
                        invoice.status === "paid" ? "bg-green-100 text-green-700 border-green-200" :
                        invoice.status === "partial" ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                        "bg-gray-100 text-gray-700 border-gray-200"
                      }>
                        {invoice.status === "paid" ? "Paid" : invoice.status === "partial" ? "Partial" : "Draft"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        {invoice.invoiceType === "monthly_visit" && invoice.contractId && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                            onClick={async () => {
                              // Renew monthly visit invoice - create a new one with same contract
                              try {
                                const contract = dbContracts.find(c => c.contract_id === invoice.contractId);
                                if (!contract) {
                                  toast.error("Contract not found");
                                  return;
                                }

                                // Pre-fill form with same customer and contract
                                const customer = dbCustomers.find(c => c.customer_id === contract.customer_id);
                                if (customer) {
                                  const customerIdx = dbCustomers.findIndex(c => c.customer_id === customer.customer_id);
                                  setSelectedCustomerId(customerIdx + 1);
                                  setSelectedCustomerDbId(customer.customer_id);
                                  setCustomerName(customer.customer_name || "");
                                  setMobile(customer.contact_num || "");
                                  setLocation(customer.customer_address || "");
                                  setCommercialRegister(customer.customer_city_of_residence || "");
                                  setInvoiceType("monthly_visit");
                                  setSelectedContractId(invoice.contractId || null);
                                  
                                  // Copy items from previous invoice
                                  setItems(invoice.items.map(item => ({
                                    ...item,
                                    id: Date.now() + Math.random()
                                  })));
                                  
                                  setIsCreateDialogOpen(true);
                                  toast.success("Monthly visit invoice form pre-filled. Review and create.");
                                } else {
                                  toast.error("Customer not found");
                                }
                              } catch (error) {
                                toast.error("Failed to renew invoice");
                                console.error(error);
                              }
                            }}
                          >
                            <Calendar className="h-4 w-4" />
                            Renew
                          </Button>
                        )}
                        {invoice.remainingAmount > 0.01 && (
                          <Button
                            variant="default"
                            size="sm"
                            className="gap-2 bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              setSelectedInvoice(invoice);
                              setPaymentAmount(invoice.remainingAmount.toString());
                              setPaymentDate(new Date().toISOString().split('T')[0]);
                              setPaymentMethod("");
                              setIsPaymentDialogOpen(true);
                            }}
                          >
                            <Wallet className="h-4 w-4" />
                            Collect
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInvoice(invoice);
                            setIsViewDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void printInvoice(invoice)}
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            // Load logo for download
                            const logoForDownload = invoice.companyLogo || (await getPrintLogo()) || undefined;
                            const blob = new Blob([generateInvoiceHTML(invoice, logoForDownload)], { type: 'text/html' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${invoice.invoiceNumber}.html`;
                            a.click();
                            toast.success("Invoice downloaded successfully");
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Invoice Preview</DialogTitle>
            <DialogDescription>Preview invoice before printing or downloading</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4 overflow-y-auto max-h-[calc(90vh-200px)] p-1">
              {/* Invoice Header */}
              <div className="border rounded-lg p-4 bg-gradient-to-br from-purple-50 to-blue-50">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-xl font-bold text-purple-900">منى سمارت - Mana Smart</h3>
                    <p className="text-sm text-muted-foreground">Khobar, Saudi Arabia</p>
                  </div>
                  <div className="text-right">
                    <h2 className="text-2xl font-bold text-purple-600">INVOICE</h2>
                    <p className="text-sm font-mono">{selectedInvoice.invoiceNumber}</p>
                    <Badge className="mt-1 bg-green-600 text-white">TAX INVOICE</Badge>
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>VAT: 311234567800003 | C.R.: 2051245473</p>
                  <p>Date: {new Date(selectedInvoice.date).toLocaleDateString('en-GB')}</p>
                </div>
              </div>

              {/* Customer Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Bill To</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Name:</Label>
                    <p className="font-medium">{selectedInvoice.customerName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">C.R.:</Label>
                    <p className="font-medium">{selectedInvoice.commercialRegister}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Mobile:</Label>
                    <p className="font-medium">{selectedInvoice.mobile}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">VAT:</Label>
                    <p className="font-medium">{selectedInvoice.taxNumber}</p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground">Location:</Label>
                    <p className="font-medium">{selectedInvoice.location}</p>
                  </div>
                </CardContent>
              </Card>

              {/* Items */}
              <Card>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-center">Disc%</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedInvoice.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">{item.unitPrice.toFixed(2)} ر.س</TableCell>
                          <TableCell className="text-center">{item.discountPercent}%</TableCell>
                          <TableCell className="text-right font-medium">{item.total.toFixed(2)} ر.س</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card className="bg-gray-50">
                <CardContent className="pt-6">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal:</span>
                      <span>{selectedInvoice.totalBeforeDiscount.toFixed(2)} ر.س</span>
                    </div>
                    {selectedInvoice.totalDiscount > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Discount:</span>
                        <span className="text-red-600">- {selectedInvoice.totalDiscount.toFixed(2)} ر.س</span>
                      </div>
                    )}
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">After Discount:</span>
                      <span>{selectedInvoice.totalAfterDiscount.toFixed(2)} ر.س</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">VAT (15%):</span>
                      <span>{selectedInvoice.totalVAT.toFixed(2)} ر.س</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-lg font-bold">
                      <span>Grand Total:</span>
                      <span className="text-purple-600">{selectedInvoice.grandTotal.toFixed(2)} ر.س</span>
                    </div>
                    <Separator />
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-green-600">Paid:</span>
                      <span className="text-green-600">{selectedInvoice.paidAmount.toFixed(2)} ر.س</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold">
                      <span className="text-orange-600">Remaining:</span>
                      <span className="text-orange-600">{selectedInvoice.remainingAmount.toFixed(2)} ر.س</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  void printInvoice(selectedInvoice);
                  setIsViewDialogOpen(false);
                }}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Payment Collection Dialog */}
      <Dialog open={isPaymentDialogOpen} onOpenChange={setIsPaymentDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-green-600" />
              Collect Payment - تحصيل الدفعة
            </DialogTitle>
            <DialogDescription>
              Record payment for invoice {selectedInvoice?.invoiceNumber}
            </DialogDescription>
          </DialogHeader>

          {selectedInvoice && (
            <div className="space-y-6 py-4">
              {/* Invoice Summary */}
              <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-2">
                <CardContent className="pt-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-sm text-muted-foreground">Customer</Label>
                      <p className="font-semibold">{selectedInvoice.customerName}</p>
                      <p className="text-sm text-muted-foreground">{selectedInvoice.mobile}</p>
                    </div>
                    <div>
                      <Label className="text-sm text-muted-foreground">Invoice Number</Label>
                      <p className="font-semibold">{selectedInvoice.invoiceNumber}</p>
                      <p className="text-sm text-muted-foreground">{new Date(selectedInvoice.date).toLocaleDateString('en-GB')}</p>
                    </div>
                  </div>
                  <Separator className="my-4" />
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center p-3 bg-white rounded-lg border">
                      <Label className="text-xs text-muted-foreground">Total Amount</Label>
                      <p className="text-2xl font-bold text-blue-600">{selectedInvoice.grandTotal.toFixed(2)} ر.س</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border">
                      <Label className="text-xs text-muted-foreground">Paid Amount</Label>
                      <p className="text-2xl font-bold text-green-600">{selectedInvoice.paidAmount.toFixed(2)} ر.س</p>
                    </div>
                    <div className="text-center p-3 bg-white rounded-lg border">
                      <Label className="text-xs text-muted-foreground">Remaining</Label>
                      <p className="text-2xl font-bold text-orange-600">{selectedInvoice.remainingAmount.toFixed(2)} ر.س</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Payment Form */}
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="paymentAmount">Payment Amount (ر.س) *</Label>
                    <Input
                      id="paymentAmount"
                      type="number"
                      step="0.01"
                      min="0"
                      max={selectedInvoice.remainingAmount}
                      value={paymentAmount}
                      onChange={(e) => {
                        const value = e.target.value;
                        const numValue = parseFloat(value);
                        // Prevent negative values and values exceeding remaining amount
                        if (value === '' || isNaN(numValue)) {
                          setPaymentAmount(value);
                        } else if (numValue < 0) {
                          setPaymentAmount('0');
                        } else {
                          // Round both values to 2 decimal places for comparison to avoid floating-point precision issues
                          const roundedValue = Math.round(numValue * 100) / 100;
                          const roundedRemainingInput = Math.round(selectedInvoice.remainingAmount * 100) / 100;
                          if (roundedValue > roundedRemainingInput + 0.01) {
                            setPaymentAmount(selectedInvoice.remainingAmount.toFixed(2));
                            toast.warning(`Payment amount cannot exceed remaining amount of ${selectedInvoice.remainingAmount.toFixed(2)} ر.س`);
                          } else {
                            setPaymentAmount(value);
                          }
                        }
                      }}
                      placeholder="0.00"
                      className="text-lg font-semibold"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const halfAmount = Math.min(selectedInvoice.remainingAmount / 2, selectedInvoice.remainingAmount);
                          setPaymentAmount(halfAmount.toFixed(2));
                        }}
                      >
                        50%
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setPaymentAmount(selectedInvoice.remainingAmount.toFixed(2))}
                      >
                        Full Amount
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="paymentDate">Payment Date *</Label>
                    <Input
                      id="paymentDate"
                      type="date"
                      value={paymentDate}
                      onChange={(e) => setPaymentDate(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="paymentMethod">Payment Method *</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger id="paymentMethod">
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_METHOD_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Payment History */}
                {selectedInvoice.paymentHistory && selectedInvoice.paymentHistory.length > 0 && (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Wallet className="h-5 w-5 text-green-600" />
                        Payment History - سجل المدفوعات
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {selectedInvoice.paymentHistory.map((payment, index) => (
                          <div key={payment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                                <span className="text-xs font-bold text-green-700">#{index + 1}</span>
                              </div>
                              <div>
                                <p className="font-medium">{payment.amount.toFixed(2)} ر.س</p>
                                <p className="text-xs text-muted-foreground">
                                  {new Date(payment.date).toLocaleDateString('en-GB')} • {payment.method}
                                </p>
                              </div>
                            </div>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Paid
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {parseFloat(paymentAmount) > 0 && (
                  <Card className="bg-blue-50 border-blue-200">
                    <CardContent className="pt-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <Label className="text-sm text-muted-foreground">New Paid Amount</Label>
                          <p className="text-xl font-bold text-green-600">
                            {(selectedInvoice.paidAmount + parseFloat(paymentAmount || "0")).toFixed(2)} ر.س
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">New Remaining</Label>
                          <p className="text-xl font-bold text-orange-600">
                            {Math.max(0, selectedInvoice.remainingAmount - parseFloat(paymentAmount || "0")).toFixed(2)} ر.س
                          </p>
                        </div>
                        <div>
                          <Label className="text-sm text-muted-foreground">New Status</Label>
                          <Badge className={
                            Math.max(0, selectedInvoice.remainingAmount - parseFloat(paymentAmount || "0")) <= 0
                              ? "bg-green-100 text-green-700 border-green-200"
                              : "bg-yellow-100 text-yellow-700 border-yellow-200"
                          }>
                            {Math.max(0, selectedInvoice.remainingAmount - parseFloat(paymentAmount || "0")) <= 0
                              ? "✅ Paid"
                              : "💰 Partial"}
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button
                  variant="outline"
                  onClick={() => setIsPaymentDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="gap-2 bg-green-600 hover:bg-green-700"
                  onClick={async () => {
                    if (!selectedInvoice) {
                      toast.error("No invoice selected");
                      return;
                    }

                    const amount = parseFloat(paymentAmount);

                    if (!paymentAmount || Number.isNaN(amount) || amount <= 0) {
                      toast.error("Please enter a valid payment amount");
                      return;
                    }

                    if (!paymentMethod) {
                      toast.error("Please select a payment method");
                      return;
                    }

                    if (!PAYMENT_METHOD_VALUES.has(paymentMethod)) {
                      toast.error("Selected payment method is not supported. Please choose another method.");
                      return;
                    }

                    const dbInvoice = dbInvoices.find(
                      (inv) => inv.invoice_id === selectedInvoice.dbInvoiceId
                    );
                    if (!dbInvoice) {
                      toast.error("Invoice not found");
                      return;
                    }

                    const invoiceItems = Array.isArray(dbInvoice.invoice_items) ? dbInvoice.invoice_items : [];
                    const calculatedItemsTotal = invoiceItems.reduce((sum, item) => {
                      const quantity = Number(item?.quantity ?? 1);
                      const unit = Number(item?.unitPrice ?? 0);
                      const discount = Number(item?.discountPercent ?? 0);
                      const subtotal =
                        Number(item?.total ?? 0) ||
                        Number(item?.subtotal ?? 0) ||
                        unit * quantity * (1 - discount / 100);
                      return sum + subtotal;
                    }, 0);

                    const subtotalPlusTax = Number(dbInvoice.subtotal ?? 0) + Number(dbInvoice.tax_amount ?? 0);
                    let totalAmount = Number(dbInvoice.total_amount ?? 0);
                    if (totalAmount <= 0 && selectedInvoice.grandTotal > 0) {
                      totalAmount = selectedInvoice.grandTotal;
                    }
                    if (totalAmount <= 0 && subtotalPlusTax > 0) {
                      totalAmount = subtotalPlusTax;
                    }
                    if (totalAmount <= 0 && calculatedItemsTotal > 0) {
                      totalAmount = calculatedItemsTotal;
                    }

                    const relatedPayments = dbPayments.filter(
                      (payment) => payment.invoice_id === dbInvoice.invoice_id
                    );
                    const currentPaidFromPayments = relatedPayments.reduce(
                      (sum, payment) => sum + Number(payment.paid_amount ?? 0),
                      0
                    );
                    
                    // Calculate current paid amount: use sum of payments if available, otherwise use invoice's paid_amount
                    // The sum of payments is the source of truth, but if no payments exist yet, use the invoice's paid_amount
                    // This handles the case where an invoice was created with an initial paid_amount but no payment records
                    // Priority: 1) Sum of payment records, 2) selectedInvoice.paidAmount (current display value), 3) dbInvoice.paid_amount
                    let currentPaid = currentPaidFromPayments;
                    if (currentPaidFromPayments <= 0 && relatedPayments.length === 0) {
                      // No payment records exist yet, prefer selectedInvoice.paidAmount (what user sees) over dbInvoice.paid_amount
                      // This ensures we use the correct value even if dbInvoice is stale
                      currentPaid = Number(selectedInvoice.paidAmount ?? dbInvoice.paid_amount ?? 0);
                    } else if (currentPaidFromPayments > 0) {
                      // We have payment records, but also check if selectedInvoice shows a different (higher) value
                      // This can happen if invoice was created with initial paid_amount but no payment record
                      const displayedPaid = Number(selectedInvoice.paidAmount ?? 0);
                      if (displayedPaid > currentPaidFromPayments) {
                        // The displayed paid amount is higher, meaning there's an initial paid_amount without a payment record
                        // Use the displayed value as it represents the true current state
                        currentPaid = displayedPaid;
                      }
                    }
                    // Ensure we don't exceed total amount
                    if (totalAmount > 0 && currentPaid - totalAmount > 0.0001) {
                      currentPaid = totalAmount;
                    }

                    let remainingBefore = Math.max(0, totalAmount - currentPaid);
                    if (totalAmount <= 0 && selectedInvoice.remainingAmount >= 0) {
                      remainingBefore = selectedInvoice.remainingAmount;
                      if (totalAmount <= 0 && selectedInvoice.grandTotal > 0) {
                        totalAmount = selectedInvoice.grandTotal;
                      }
                    }

                    // Round both values to 2 decimal places to avoid floating-point precision issues
                    const roundedAmount = Math.round(amount * 100) / 100;
                    const roundedRemaining = Math.round(remainingBefore * 100) / 100;

                    if (roundedAmount > roundedRemaining + 0.01) {
                      toast.error("Payment amount cannot exceed remaining amount");
                      return;
                    }

                    try {
                      await dispatch(
                        thunks.payments.createOne({
                          invoice_id: dbInvoice.invoice_id,
                          payment_date: paymentDate,
                          paid_amount: amount,
                          payment_method: paymentMethod,
                          reference_number: null,
                          notes: null,
                        } as any)
                      ).unwrap();
                    } catch (error: any) {
                      const message =
                        error?.message || error?.error?.message || "Failed to record payment";
                      toast.error(message);
                      return;
                    }

                    // Calculate new paid amount by adding the new payment to the current paid amount
                    // We use currentPaid (calculated before payment creation) + the new payment amount
                    // This is more reliable than recalculating from dbPayments which may not be updated yet
                    // Round the amount to 2 decimal places to avoid precision issues
                    const roundedPaymentAmount = Math.round(amount * 100) / 100;
                    const uncappedNewPaid = currentPaid + roundedPaymentAmount;
                    const newPaidAmount =
                      totalAmount > 0 ? Math.min(uncappedNewPaid, totalAmount) : uncappedNewPaid;
                    const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
                    
                    // Round to 2 decimal places to avoid floating point precision issues
                    const roundedNewRemaining = Number(newRemainingAmount.toFixed(2));
                    const roundedPaid = Number(newPaidAmount.toFixed(2));
                    
                    // Debug: Log the calculation to help identify issues
                    // console.log('Payment calculation:', {
                    //   currentPaid,
                    //   roundedAmount,
                    //   uncappedNewPaid,
                    //   newPaidAmount,
                    //   roundedPaid,
                    //   totalAmount,
                    //   newRemainingAmount,
                    //   roundedNewRemaining
                    // });
                    
                    // Determine status: if remaining is 0 or very small (<= 0.01), mark as paid
                    // Also check if paid amount equals or exceeds total amount
                    const paymentStatus = (roundedNewRemaining <= 0.01 || roundedPaid >= totalAmount - 0.01) ? "paid" : "partial";

                    try {
                      await dispatch(
                        thunks.invoices.updateOne({
                          id: dbInvoice.invoice_id,
                          values: {
                            paid_amount: roundedPaid,
                            payment_status: paymentStatus,
                          } as any,
                        })
                      ).unwrap();
                    } catch (error: any) {
                      const message =
                        error?.message || error?.error?.message || "Failed to update invoice";
                      toast.error(message);
                      return;
                    }

                    await Promise.all([
                      dispatch(thunks.invoices.fetchAll(undefined)),
                      dispatch(thunks.payments.fetchAll(undefined)),
                    ]);

                    toast.success(`Payment of ${amount.toFixed(2)} ر.س collected successfully!`);
                    setIsPaymentDialogOpen(false);
                    setPaymentAmount("");
                    setPaymentMethod("");
                    setPaymentDate(new Date().toISOString().split("T")[0]);
                  }}
                >
                  <Wallet className="h-4 w-4" />
                  Confirm Payment
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
