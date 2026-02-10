import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { Plus, Search, Printer, Download, Eye, X, Trash2, Upload, DollarSign, CreditCard, Wallet, Settings, Calendar, Copy, Edit, FileText } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import QRCode from "qrcode";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
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
import { getCompanyInfo, getCompanyName } from "../lib/companyInfo";
import { uploadFile, getFilesByOwner, getFileUrl } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";
import { supabase } from "../lib/supabaseClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface InvoiceItem {
  id: number;
  inventoryItem?: InventoryItem;
  isManual: boolean;
  image?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number; // Fixed discount amount for this item
  discountType: "percentage" | "fixed"; // Discount type for this item
  itemDiscount: number; // Calculated discount amount (in currency)
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
  logoFilename?: string | null;
  stampFilename?: string | null;
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
  discountType?: "percentage" | "fixed";
  discountAmount?: number;
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
  const dbInventory = useAppSelector(selectors.inventory.selectAll) as any[];
  const dbPayments = useAppSelector(selectors.payments.selectAll) as PaymentRow[];
  const paymentsLoading = useAppSelector(selectors.payments.selectLoading);

  // Automatic invoicing settings
  const [sortOrder, setSortOrder] = useState<"desc" | "asc">("desc"); // Default to descending (newest first)

  // Pagination state
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const ITEMS_PER_PAGE = 100;

  // TanStack Query for invoices with automatic caching
  const {
    data: dbInvoices = [],
    isLoading: invoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices
  } = useQuery({
    queryKey: ['invoices', sortOrder],
    queryFn: async () => {
      const result = await dispatch(thunks.invoices.fetchAll({
        limit: ITEMS_PER_PAGE,
        orderBy: sortOrder === 'desc' ? 'created_at.desc' : 'created_at.asc'
      })).unwrap();
      
      return result as InvoicesRow[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes (use gcTime instead of cacheTime)
  });

  const queryClient = useQueryClient();

  // Optimistic mutation for creating invoices
  const createInvoiceMutation = useMutation({
    mutationFn: async (invoiceData: any) => {
      const result = await dispatch(thunks.invoices.createOne(invoiceData)).unwrap();
      return result;
    },
    onMutate: async (newInvoice) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['invoices'] });
      
      // Snapshot the previous value
      const previousInvoices = queryClient.getQueryData(['invoices', sortOrder]);
      
      // Optimistically update to the new value
      const optimisticInvoice = {
        invoice_id: `temp-${Date.now()}`,
        customer_id: newInvoice.customer_id,
        invoice_number: newInvoice.invoice_number,
        invoice_date: newInvoice.invoice_date,
        due_date: newInvoice.due_date,
        total_amount: newInvoice.total_amount,
        paid_amount: newInvoice.paid_amount || 0,
        remaining_amount: newInvoice.total_amount - (newInvoice.paid_amount || 0),
        status: newInvoice.status || 'draft',
        tax_rate: newInvoice.tax_rate,
        tax_enabled: newInvoice.tax_enabled,
        discount_type: newInvoice.discount_type,
        discount_amount: newInvoice.discount_amount,
        notes: newInvoice.notes || null,
        terms_and_conditions: newInvoice.terms_and_conditions || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Add any other required fields
      } as unknown as InvoicesRow;
      
      queryClient.setQueryData(['invoices', sortOrder], (old: InvoicesRow[] = []) => {
        return sortOrder === 'desc' 
          ? [optimisticInvoice, ...old]
          : [...old, optimisticInvoice];
      });
      
      return { previousInvoices };
    },
    onError: (_err, _newInvoice, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousInvoices) {
        queryClient.setQueryData(['invoices', sortOrder], context.previousInvoices);
      }
      toast.error('Failed to create invoice');
    },
    onSettled: () => {
      // Always refetch after error or success to ensure server state
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  // Optimistic mutation for updating invoices
  const updateInvoiceMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const result = await dispatch(thunks.invoices.updateOne({ id, values: data })).unwrap();
      return result;
    },
    onMutate: async ({ id, data }) => {
      await queryClient.cancelQueries({ queryKey: ['invoices'] });
      const previousInvoices = queryClient.getQueryData(['invoices', sortOrder]);
      
      queryClient.setQueryData(['invoices', sortOrder], (old: InvoicesRow[] = []) => {
        return old.map(invoice => 
          invoice.invoice_id === id 
            ? { ...invoice, ...data, updated_at: new Date().toISOString() }
            : invoice
        );
      });
      
      return { previousInvoices };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousInvoices) {
        queryClient.setQueryData(['invoices', sortOrder], context.previousInvoices);
      }
      toast.error('Failed to update invoice');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const [autoInvoiceEnabled, setAutoInvoiceEnabled] = useState(() => {
    const stored = localStorage.getItem(AUTO_INVOICE_ENABLED_KEY);
    return stored === 'true';
  });
  const [autoInvoiceTiming, setAutoInvoiceTiming] = useState<'visit_date' | '7_days_before'>(() => {
    const stored = localStorage.getItem(AUTO_INVOICE_TIMING_KEY);
    return (stored === '7_days_before' ? '7_days_before' : 'visit_date') as 'visit_date' | '7_days_before';
  });

  // Update query when sort order changes
  useEffect(() => {
    // Reset pagination state when sort order changes
    setHasMore(true);
    setIsLoadingMore(false);
  }, [sortOrder]);

  // Load more invoices function
  const loadMoreInvoices = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;
    
    setIsLoadingMore(true);
    try {
      const result = await dispatch(thunks.invoices.fetchAll({
        limit: ITEMS_PER_PAGE,
        offset: dbInvoices.length,
        orderBy: sortOrder === 'desc' ? 'created_at.desc' : 'created_at.asc'
      })).unwrap();
      
      if (result.length < ITEMS_PER_PAGE) {
        setHasMore(false);
      }
    } catch (error) {
      console.error('Error loading more invoices:', error);
      toast.error('Failed to load more invoices');
    } finally {
      setIsLoadingMore(false);
    }
  }, [dbInvoices.length, hasMore, isLoadingMore, sortOrder, dispatch]);

  const invoiceNumberMap = useMemo(() => {
    const parse = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    // Sort by created_at ascending for consistent invoice numbering (independent of user sort order)
    const sorted = [...(dbInvoices || [])].sort((a, b) => {
      const timeA = parse(a.created_at);
      const timeB = parse(b.created_at);
      if (timeA !== timeB) return timeA - timeB; // Always ascending for numbering
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

  // Convert allInvoices to Invoice format
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

    // Sort by created_at first (based on sortOrder) then by invoice_id for consistent ordering
    const sortedInvoices = [...(dbInvoices || [])].sort((a, b) => {
      const timeA = parse(a.created_at);
      const timeB = parse(b.created_at);
      const sortMultiplier = sortOrder === "desc" ? -1 : 1; // -1 for desc, 1 for asc
      if (timeA !== timeB) return (timeA - timeB) * sortMultiplier;
      // If created_at is the same, sort by invoice_id for stable ordering
      return a.invoice_id.localeCompare(b.invoice_id);
    });

    return sortedInvoices.map((dbInv, idx) => {
      const customer = dbCustomers.find((c) => c.customer_id === dbInv.customer_id);
      const invoiceItems = Array.isArray(dbInv.invoice_items) ? dbInv.invoice_items : [];

      const vatRateFromDb =
        dbInv.vat_enabled === false
          ? 0
          : typeof dbInv.tax_rate === "number"
            ? dbInv.tax_rate
            : VAT_RATE;

      // Parse invoice items
      const items: InvoiceItem[] = invoiceItems.map((item: any, itemIdx: number) => {
        const qty = item.quantity || 1;
        const unit = item.unitPrice || 0;
        const discPercent = item.discountPercent || 0;
        const discAmount = item.discountAmount || 0;
        // Determine discount type: if discount_amount > 0, use fixed, otherwise use percentage
        const discType = discAmount > 0 ? "fixed" : "percentage";
        
        // Calculate item discount based on type
        let itemDiscount = 0;
        if (discType === "percentage") {
          itemDiscount = (unit * qty) * (Math.min(100, Math.max(0, discPercent)) / 100);
        } else {
          itemDiscount = Math.min(unit * qty, Math.max(0, discAmount));
        }
        
        const priceAfter = unit - (discType === "percentage" ? unit * (discPercent / 100) : Math.min(unit, discAmount));
        const itemSubtotal = priceAfter * qty;
        
        return {
          id: itemIdx + 1,
          inventoryItem: undefined,
          isManual: true,
          image: item.image,
          description: item.description || "",
          quantity: qty,
          unitPrice: unit,
          discountPercent: discPercent,
          discountAmount: discAmount,
          discountType: discType,
          itemDiscount: itemDiscount,
          priceAfterDiscount: priceAfter,
          subtotal: itemSubtotal,
          vat: itemSubtotal * vatRateFromDb,
          total: itemSubtotal + itemSubtotal * vatRateFromDb,
        };
      });

      // Calculate item-level totals
      const itemTotals = items.reduce((acc: any, it: any) => {
        const qty = Number(it.quantity || 0);
        const unit = Number(it.unitPrice || 0);
        const disc = Number(it.discountPercent || it.discount_percent || 0);
        const priceAfter = unit * (1 - disc / 100);
        const subtotal = priceAfter * qty;
        acc.totalBeforeDiscount += unit * qty;
        acc.totalAfterItemDiscounts += subtotal;
        acc.itemLevelDiscount = acc.totalBeforeDiscount - acc.totalAfterItemDiscounts;
        return acc;
      }, { totalBeforeDiscount: 0, totalAfterItemDiscounts: 0, itemLevelDiscount: 0 });

      // Apply invoice-level discount if exists
      let invoiceDiscount = 0;
      const discountType = dbInv.discount_type as "percentage" | "fixed" | undefined;
      const discountAmount = dbInv.discount_amount ?? 0;
      
      if (discountType && discountAmount > 0) {
        if (discountType === "percentage") {
          invoiceDiscount = itemTotals.totalAfterItemDiscounts * (Math.min(100, discountAmount) / 100);
        } else if (discountType === "fixed") {
          invoiceDiscount = Math.min(itemTotals.totalAfterItemDiscounts, discountAmount);
        }
      }
      
      const totalAfterDiscount = Math.max(0, itemTotals.totalAfterItemDiscounts - invoiceDiscount);
      const totalDiscount = itemTotals.itemLevelDiscount + invoiceDiscount;
      const totalVAT = totalAfterDiscount * vatRateFromDb;
      const grandTotal = Math.max(0, totalAfterDiscount + totalVAT);
      
      const totals = {
        totalBeforeDiscount: itemTotals.totalBeforeDiscount,
        totalDiscount,
        totalAfterDiscount,
        totalVAT,
        grandTotal
      };

      const subtotalPlusTax = Number(dbInv.subtotal ?? 0) + Number(dbInv.tax_amount ?? 0);
      let totalAmount = Number(dbInv.total_amount ?? 0);
      if (totalAmount <= 0) {
        if (subtotalPlusTax > 0) {
          totalAmount = subtotalPlusTax;
        } else if (totals.grandTotal > 0) {
          totalAmount = totals.grandTotal;
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
        logoFilename: (dbInv as any).company_logo ?? null,
        stampFilename: (dbInv as any).company_stamp ?? null,
        stampPosition: { x: 50, y: 50 },
        notes: dbInv.invoice_notes || "",
        termsAndConditions: "",
        items,
        totalBeforeDiscount: totals.totalBeforeDiscount,
        totalDiscount: totals.totalDiscount,
        totalAfterDiscount: totals.totalAfterDiscount,
        totalVAT: totals.totalVAT,
        grandTotal: totalAmount,
        paidAmount,
        remainingAmount: displayRemaining,
        status,
        invoiceType,
        contractId: dbInv.contract_id || null,
        visitId: null, // Can be extracted from notes if needed
        visitDate: extractedVisitDate,
        discountType: (dbInv.discount_type as "percentage" | "fixed" | undefined) || undefined,
        discountAmount: dbInv.discount_amount ?? undefined,
        paymentHistory,
      };
    });
  }, [dbInvoices, dbCustomers, dbPayments, sortOrder]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [isEditingInvoice, setIsEditingInvoice] = useState(false);
  const [editingInvoiceDate, setEditingInvoiceDate] = useState("");
  const isDataLoading = invoicesLoading || customersLoading || paymentsLoading;

  // Load secondary data (payments) when needed
  const loadSecondaryData = useCallback(async () => {
    try {
      await dispatch(thunks.payments.fetchAll(undefined)).unwrap();
    } catch (error) {
      console.error('Error loading payments data:', error);
      toast.error(`Failed to load payments data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }, [dispatch]);

  // Load secondary data when payment dialog opens
  useEffect(() => {
    if (isPaymentDialogOpen && dbPayments.length === 0) {
      void loadSecondaryData();
    }
  }, [isPaymentDialogOpen, dbPayments.length, loadSecondaryData]);

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

  // Form states
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("normal");
  const [selectedContractId, setSelectedContractId] = useState<string | null>(null);
  const [contractPlanAmount, setContractPlanAmount] = useState<number | null>(null); // Store contract plan amount for grand total
  const [visitDate, setVisitDate] = useState<string>(""); // Visit date for monthly visit invoices
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]); // Invoice date selector
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
  // Discount mode: "individual" for per-item discounts, "global" for applying to all items
  const [discountMode, setDiscountMode] = useState<"individual" | "global">("individual");
  // Global discount settings (only used when discountMode === "global")
  const [globalDiscountType, setGlobalDiscountType] = useState<"percentage" | "fixed">("percentage");
  const [globalDiscountAmount, setGlobalDiscountAmount] = useState("");
  const [companyLogo, setCompanyLogo] = useState("");
  const [stamp, setStamp] = useState("");
  const [isStampRemoved, setIsStampRemoved] = useState(false);
  const isStampRemovedRef = useRef(false);
  const [logoFilename, setLogoFilename] = useState<string | null>(null);
  const [stampFilename, setStampFilename] = useState<string | null>(null);
  const [defaultLogoUrl, setDefaultLogoUrl] = useState<string | null>(null);
  const [defaultStampUrl, setDefaultStampUrl] = useState<string | null>(null);
  const [isUsingDefaultLogo, setIsUsingDefaultLogo] = useState(true);
  const [isUsingDefaultStamp, setIsUsingDefaultStamp] = useState(true);

  useEffect(() => {
    isStampRemovedRef.current = isStampRemoved;
  }, [isStampRemoved]);
  const [tempBrandingOwnerId, setTempBrandingOwnerId] = useState<string | null>(null);
  const [stampPosition, setStampPosition] = useState({ x: 50, y: 50 });
  const [paidAmount, setPaidAmount] = useState("");
  const [vatEnabled, setVatEnabled] = useState(true);
  const [items, setItems] = useState<InvoiceItem[]>([{
    id: 1,
    isManual: true,
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    discountAmount: 0,
    discountType: "percentage",
    itemDiscount: 0,
    priceAfterDiscount: 0,
    subtotal: 0,
    vat: 0,
    total: 0
  }]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const generateUuid = () => {
    const cryptoObj = (globalThis as any)?.crypto as undefined | { randomUUID?: () => string };
    if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  };

  // Load default logo and stamp from Settings when dialog opens
  useEffect(() => {
    if (!isCreateDialogOpen) return;

    if (!tempBrandingOwnerId) {
      setTempBrandingOwnerId(generateUuid());
    }

    const loadDefaultBranding = async () => {
      try {
        const logoResult = await getPrintLogo();
        if (logoResult) {
          setDefaultLogoUrl(logoResult);
          if (isUsingDefaultLogo && !companyLogo) {
            setCompanyLogo(logoResult);
          }
        }

        const { data: brandingData } = await supabase
          .from("company_branding")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (brandingData?.branding_id) {
          const brandingFiles = await getFilesByOwner(brandingData.branding_id, 'branding');
          const stampFile = brandingFiles.find((f) => f.category === FILE_CATEGORIES.BRANDING_STAMP);
          if (stampFile) {
            const stampUrl = await getFileUrl(
              stampFile.bucket as any,
              stampFile.path,
              stampFile.is_public
            );
            if (stampUrl) {
              setDefaultStampUrl(stampUrl);
              if (!isStampRemovedRef.current && isUsingDefaultStamp && !stamp) {
                setStamp(stampUrl);
              }
            }
          }
        }
      } catch (error) {
        console.error('Error loading default branding:', error);
      }
    };

    void loadDefaultBranding();
  }, [isCreateDialogOpen]);

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
      if (pendingQuotationData.stampFilename === '__NO_STAMP__') {
        setIsStampRemoved(true);
        setStamp('');
        setStampFilename('__NO_STAMP__');
        setIsUsingDefaultStamp(false);
      } else {
        setIsStampRemoved(false);
        setStamp(pendingQuotationData.stamp || "");
      }
      
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

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const stored = localStorage.getItem('auth_user');
      let currentUserId: string | null = null;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          currentUserId = parsed.user_id || null;
        } catch (err) {
          console.error('Failed to parse auth_user', err);
        }
      }

      const ownerId = tempBrandingOwnerId || generateUuid();
      if (!tempBrandingOwnerId) setTempBrandingOwnerId(ownerId);

      const uploadResult = await uploadFile({
        file,
        category: FILE_CATEGORIES.BRANDING_LOGO,
        ownerId,
        ownerType: 'invoice',
        description: `Invoice-specific logo`,
        userId: currentUserId || undefined,
      });

      if (!uploadResult.success || !uploadResult.fileMetadata) {
        throw new Error(uploadResult.error || 'Failed to upload logo');
      }

      setLogoFilename(uploadResult.fileMetadata.file_name);
      setIsUsingDefaultLogo(false);

      const logoUrl = uploadResult.publicUrl || uploadResult.signedUrl || (await getFileUrl(
        uploadResult.fileMetadata.bucket as any,
        uploadResult.fileMetadata.path,
        uploadResult.fileMetadata.is_public
      ));

      if (logoUrl) {
        setCompanyLogo(logoUrl);
        toast.success("Logo uploaded successfully");
      } else {
        toast.error("Logo uploaded but URL retrieval failed");
      }
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error(error.message || 'Failed to upload logo');
    }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const stored = localStorage.getItem('auth_user');
      let currentUserId: string | null = null;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          currentUserId = parsed.user_id || null;
        } catch (err) {
          console.error('Failed to parse auth_user', err);
        }
      }

      const ownerId = tempBrandingOwnerId || generateUuid();
      if (!tempBrandingOwnerId) setTempBrandingOwnerId(ownerId);

      const uploadResult = await uploadFile({
        file,
        category: FILE_CATEGORIES.BRANDING_STAMP,
        ownerId,
        ownerType: 'invoice',
        description: `Invoice-specific stamp`,
        userId: currentUserId || undefined,
      });

      if (!uploadResult.success || !uploadResult.fileMetadata) {
        throw new Error(uploadResult.error || 'Failed to upload stamp');
      }

      setStampFilename(uploadResult.fileMetadata.file_name);
      setIsUsingDefaultStamp(false);

      const stampUrl = uploadResult.publicUrl || uploadResult.signedUrl || (await getFileUrl(
        uploadResult.fileMetadata.bucket as any,
        uploadResult.fileMetadata.path,
        uploadResult.fileMetadata.is_public
      ));

      if (stampUrl) {
        setStamp(stampUrl);
        setIsStampRemoved(false);
        toast.success("Stamp uploaded successfully");
      } else {
        toast.error("Stamp uploaded but URL retrieval failed");
      }
    } catch (error: any) {
      console.error('Error uploading stamp:', error);
      toast.error(error.message || 'Failed to upload stamp');
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

  const calculateItemTotals = (item: Partial<InvoiceItem>, vatEnabled: boolean = true) => {
    const quantity = item.quantity || 0;
    const unitPrice = item.unitPrice || 0;
    const discountType = item.discountType || "percentage";
    const discountPercent = item.discountPercent || 0;
    const discountAmount = item.discountAmount || 0;
    
    // Calculate subtotal = quantity × unit price
    const subtotal = quantity * unitPrice;
    
    // Calculate item discount based on type
    let itemDiscount = 0;
    if (discountType === "percentage") {
      // Percentage discount: discount is calculated from subtotal
      itemDiscount = subtotal * (Math.min(100, Math.max(0, discountPercent)) / 100);
    } else {
      // Fixed discount: cannot exceed subtotal
      itemDiscount = Math.min(subtotal, Math.max(0, discountAmount));
    }
    
    // Item total = subtotal - item discount
    const priceAfterDiscount = unitPrice - (discountType === "percentage" ? unitPrice * (discountPercent / 100) : Math.min(unitPrice, discountAmount));
    const finalSubtotal = priceAfterDiscount * quantity;
    const vat = vatEnabled ? finalSubtotal * VAT_RATE : 0;
    const total = finalSubtotal + vat;

    return {
      discountType,
      discountPercent,
      discountAmount,
      itemDiscount,
      priceAfterDiscount,
      subtotal: finalSubtotal,
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
      discountAmount: 0,
      discountType: "percentage",
      itemDiscount: 0,
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
      discountAmount: 0,
      discountType: "percentage",
      itemDiscount: 0,
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
        // If discount type changed, reset the other discount field
        if (field === "discountType") {
          if (value === "percentage") {
            updated.discountAmount = 0;
          } else {
            updated.discountPercent = 0;
          }
        }
        // In global mode, don't allow manual discount changes
        if (discountMode === "global" && (field === "discountPercent" || field === "discountAmount" || field === "discountType")) {
          return item; // Ignore manual discount changes in global mode
        }
        const totals = calculateItemTotals(updated, vatEnabled);
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
    const inventoryItem = dbInventory.find(item => item.id === parseInt(inventoryId));
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
        const totals = calculateItemTotals(updated, vatEnabled);
        return { ...updated, ...totals };
      }
      return item;
    }));
    toast.success("Product loaded from inventory");
  };

  const loadMoreInventory = (searchTerm: string) => {
    // This function can be used to filter inventory based on search term
    // For now, it's a placeholder since the inventory is already loaded from Redux store
    // You could implement filtering logic here if needed
    console.log('Searching inventory for:', searchTerm);
  };

  // Apply global discount to all items
  const applyGlobalDiscount = useCallback(() => {
    return () => {
      if (discountMode !== "global") return;
      
      const discountAmountNum = parseFloat(globalDiscountAmount) || 0;
      
      setItems(currentItems => {
        if (discountAmountNum <= 0) {
          // Clear all discounts
          return currentItems.map(item => {
            const updated = {
              ...item,
              discountPercent: 0,
              discountAmount: 0,
              discountType: "percentage" as const,
            };
            const totals = calculateItemTotals(updated, vatEnabled);
            return { ...updated, ...totals };
          });
        }
        
        const totalSubtotal = currentItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
        
        return currentItems.map(item => {
          const itemSubtotal = item.quantity * item.unitPrice;
          
          if (globalDiscountType === "percentage") {
            // Apply same percentage to each item's subtotal
            const validPercentage = Math.max(0, Math.min(100, discountAmountNum));
            const updated = {
              ...item,
              discountType: "percentage" as const,
              discountPercent: validPercentage,
              discountAmount: 0,
            };
            const totals = calculateItemTotals(updated, vatEnabled);
            return { ...updated, ...totals };
          } else {
            // Fixed amount: distribute proportionally
            const itemProportion = itemSubtotal / totalSubtotal;
            const itemDiscountAmount = discountAmountNum * itemProportion;
            
            // Validate: discount cannot exceed item subtotal
            const validDiscountAmount = Math.min(itemSubtotal, itemDiscountAmount);
            
            const updated = {
              ...item,
              discountType: "fixed" as const,
              discountPercent: 0,
              discountAmount: validDiscountAmount,
            };
            const totals = calculateItemTotals(updated, vatEnabled);
            return { ...updated, ...totals };
          }
        });
      });
    };
  }, [discountMode, globalDiscountType, globalDiscountAmount, vatEnabled]);

  // Apply global discount when mode, type, or amount changes
  useEffect(() => {
    if (discountMode === "global") {
      applyGlobalDiscount();
    }
  }, [discountMode, globalDiscountType, globalDiscountAmount, vatEnabled, applyGlobalDiscount]);
  
  // Track previous item values to detect changes (quantity/unitPrice)
  const prevItemsKeyRef = useRef<string>("");
  useEffect(() => {
    if (discountMode === "global" && globalDiscountAmount) {
      const currentItemsKey = items.map(i => `${i.id}-${i.quantity}-${i.unitPrice}`).join(',');
      if (currentItemsKey !== prevItemsKeyRef.current) {
        prevItemsKeyRef.current = currentItemsKey;
        applyGlobalDiscount();
      }
    }
  }, [items, discountMode, globalDiscountAmount, vatEnabled, applyGlobalDiscount]);

  // Recalculate all items when VAT toggle changes
  useEffect(() => {
    setItems(currentItems => currentItems.map(item => {
      const totals = calculateItemTotals(item, vatEnabled);
      return { ...item, ...totals };
    }));
  }, [vatEnabled]);

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
      const totalVAT = vatEnabled ? subtotal * VAT_RATE : 0;
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
    setInvoiceDate(new Date().toISOString().split('T')[0]);
    setCustomerName("");
    setMobile("");
    setLocation("");
    setCommercialRegister("");
    setTaxNumber("");
    setDiscountMode("individual");
    setGlobalDiscountType("percentage");
    setGlobalDiscountAmount("");
    setIsUsingDefaultLogo(true);
    setIsUsingDefaultStamp(true);
    setIsStampRemoved(false);
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
    setVatEnabled(true);
    setTempBrandingOwnerId(null);
    setItems([{
      id: 1,
      isManual: true,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      discountAmount: 0,
      discountType: "percentage",
      itemDiscount: 0,
      priceAfterDiscount: 0,
      subtotal: 0,
      vat: 0,
      total: 0
    }]);
  };

  const copyInvoice = (invoice: Invoice) => {
    // Find the customer in dbCustomers to get the correct IDs
    const customer = dbCustomers.find(c => c.customer_name === invoice.customerName);
    
    if (customer) {
      const customerIdx = dbCustomers.findIndex(c => c.customer_id === customer.customer_id);
      setSelectedCustomerId(customerIdx + 1);
      setSelectedCustomerDbId(customer.customer_id);
    } else {
      setSelectedCustomerId(undefined);
      setSelectedCustomerDbId(undefined);
    }
    
    // Set invoice type and contract info
    setInvoiceType(invoice.invoiceType);
    setSelectedContractId(invoice.contractId || null);
    setContractPlanAmount(null); // Will be recalculated if needed
    setVisitDate(invoice.visitDate || "");
    
    // Copy customer information
    setCustomerName(invoice.customerName);
    setMobile(invoice.mobile);
    setLocation(invoice.location);
    setCommercialRegister(invoice.commercialRegister);
    setTaxNumber(invoice.taxNumber);
    
    // Copy notes and terms
    setNotes(invoice.notes || "");
    setTermsAndConditions(invoice.termsAndConditions || "");
    
    // Copy branding
    setCompanyLogo(invoice.companyLogo || "");
    setStamp(invoice.stamp || "");
    setStampPosition(invoice.stampPosition || { x: 50, y: 50 });
    setIsStampRemoved(false);
    setIsUsingDefaultLogo(!invoice.companyLogo);
    setIsUsingDefaultStamp(!invoice.stamp);
    setLogoFilename(invoice.logoFilename || null);
    setStampFilename(invoice.stampFilename || null);
    
    // Copy items with new IDs
    setItems(invoice.items.map(item => ({
      ...item,
      id: Date.now() + Math.random(), // Generate new unique ID
      inventoryItem: undefined // Reset inventory item reference
    })));
    
    // Reset payment and status fields for new invoice
    setPaidAmount("");
    setVatEnabled(true);
    
    // Reset discount mode
    setDiscountMode("individual");
    setGlobalDiscountType("percentage");
    setGlobalDiscountAmount("");
    
    // Open the create dialog
    setIsCreateDialogOpen(true);
    
    toast.success(`Invoice ${invoice.invoiceNumber} copied. Review and create as new invoice.`);
  };

  const editInvoice = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setEditingInvoiceDate(invoice.date);
    setIsEditDialogOpen(true);
  };

  const updateInvoiceDate = async () => {
    if (!selectedInvoice || !editingInvoiceDate) {
      toast.error("Please select a valid date");
      return;
    }

    setIsEditingInvoice(true);

    try {
      const dbInvoice = dbInvoices.find(
        (inv) => inv.invoice_id === selectedInvoice.dbInvoiceId
      );

      if (!dbInvoice) {
        toast.error("Invoice not found");
        return;
      }

      // Update the invoice date in the database
      await updateInvoiceMutation.mutateAsync({
        id: dbInvoice.invoice_id,
        data: {
          invoice_date: editingInvoiceDate,
          due_date: editingInvoiceDate, // Also update due date to match
        },
      });

      // No need to refetch - optimistic mutation handles UI updates automatically
      toast.success("Invoice date updated successfully!");
      setIsEditDialogOpen(false);
      setSelectedInvoice(null);
      setEditingInvoiceDate("");
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Failed to update invoice date";
      toast.error(message);
    } finally {
      setIsEditingInvoice(false);
    }
  };

  const createInvoice = async () => {
    setIsCreatingInvoice(true);

    try {
      // Validation checks first
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

      // Additional validation before database operations
      const invoiceNumber = `INV-${new Date().getFullYear()}-${String(invoices.length + 1).padStart(3, '0')}`;
      
      const paid = parseFloat(paidAmount) || 0;
      
      // For monthly visit invoices, ensure grand total matches contract plan amount
      let finalGrandTotal = totals.grandTotal;
      if (invoiceType === "monthly_visit" && contractPlanAmount !== null) {
        const subtotal = contractPlanAmount;
        const totalVAT = vatEnabled ? subtotal * VAT_RATE : 0;
        finalGrandTotal = subtotal + totalVAT;
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

      // Validate discounts
      if (discountMode === "global") {
        const globalDiscountAmountNum = parseFloat(globalDiscountAmount) || 0;
        if (globalDiscountAmountNum < 0) {
          toast.error("Discount amount cannot be negative");
          return;
        }
        if (globalDiscountType === "percentage" && (globalDiscountAmountNum > 100 || globalDiscountAmountNum < 0)) {
          toast.error("Discount percentage must be between 0 and 100");
          return;
        }
        const totals = calculateInvoiceTotals();
        if (globalDiscountType === "fixed" && globalDiscountAmountNum > totals.totalBeforeDiscount) {
          toast.error("Fixed discount cannot exceed total subtotal");
          return;
        }
      } else {
        // Validate individual item discounts
        for (const item of items) {
          if (item.discountType === "percentage" && (item.discountPercent < 0 || item.discountPercent > 100)) {
            toast.error(`Item "${item.description || 'Untitled'}" has invalid discount percentage`);
            return;
          }
          if (item.discountType === "fixed") {
            const itemSubtotal = item.quantity * item.unitPrice;
            if (item.discountAmount < 0 || item.discountAmount > itemSubtotal) {
              toast.error(`Item "${item.description || 'Untitled'}" discount cannot exceed subtotal`);
              return;
            }
          }
        }
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

      // Generate QR code
      const qrData = `Invoice: ${invoiceNumber}\nCustomer: ${customerName.trim()}\nTotal: SAR ${finalGrandTotal.toFixed(2)}\nVAT: ${taxNumber}`;
      let qrCode = "";
      
      try {
        qrCode = await QRCode.toDataURL(qrData);
      } catch (err) {
        console.error("QR Code generation error:", err);
      }

    const newInvoice: Invoice = {
      id: invoices.length + 1,
      invoiceNumber,
      date: invoiceDate,
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
        discountPercent: item.discountType === "percentage" ? item.discountPercent : 0,
        discountAmount: item.discountType === "fixed" ? item.discountAmount : 0,
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
        invoice_date: invoiceDate,
        due_date: invoiceDate,
        tax_rate: vatEnabled ? VAT_RATE : 0,
        vat_enabled: vatEnabled,
        company_logo: logoFilename || null,
        company_stamp: isStampRemoved ? '__NO_STAMP__' : (stampFilename || null),
        subtotal: totals.totalBeforeDiscount,
        tax_amount: totals.totalVAT,
        total_amount: finalGrandTotal,
        paid_amount: paid,
        // remaining_amount is a computed/generated column - don't include it in insert
        invoice_notes: invoiceType === "monthly_visit" 
          ? `Monthly visit invoice${visitDate ? ` for visit on ${visitDate}` : ''}${notes.trim() ? ` - ${notes.trim()}` : ''}`
          : notes.trim() || null,
        payment_status,
        // Store discount info if applicable
        discount_type: discountMode === "global" ? globalDiscountType : null,
        discount_amount: discountMode === "global" && parseFloat(globalDiscountAmount) > 0 ? parseFloat(globalDiscountAmount) : null,
      };
      
      const created = await createInvoiceMutation.mutateAsync(insertPayload);
      const createdId = (created as any)?.invoice_id as string | undefined;
      if (createdId && tempBrandingOwnerId) {
        await supabase
          .from('file_metadata')
          .update({ owner_id: createdId })
          .eq('owner_type', 'invoice')
          .eq('owner_id', tempBrandingOwnerId);
      }
      // No need to refetch - optimistic mutation handles UI updates automatically

      resetForm();
      setIsCreateDialogOpen(false);

      toast.success(`Invoice ${invoiceNumber} created successfully!`);
    } catch (err: any) {
      console.error('Failed to persist invoice', err);
      const errorMessage = err?.message || err?.error?.message || 'Unknown error occurred';
      toast.error(`Failed to save invoice: ${errorMessage}`);
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  // // Print date selection state
  // const [printDateOption, setPrintDateOption] = useState<"invoice_date" | "today" | "custom">("invoice_date");
  // const [customPrintDate, setCustomPrintDate] = useState<string>(new Date().toISOString().split('T')[0]);

  const [printIncludeImages, setPrintIncludeImages] = useState(true);
  const [openPrintOptionsInvoiceId, setOpenPrintOptionsInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    if (openPrintOptionsInvoiceId === null) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('[data-invoice-print-options-root="true"]')) return;
      setOpenPrintOptionsInvoiceId(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openPrintOptionsInvoiceId]);

  const printInvoice = async (invoice: Invoice, includeImagesOverride?: boolean) => {
    const includeImages = includeImagesOverride ?? printIncludeImages;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print invoices");
      return;
    }

    // Get company info for dynamic company name
    const companyInfo = await getCompanyInfo();
    const companyName = getCompanyName(companyInfo); // English name only
    const companyNameAr = companyInfo?.company_name_ar || '';
    // Get additional company fields from localStorage (for tax number, commercial reg, etc.)
    const companyTaxNumber = localStorage.getItem('companyTaxNumber') || '';
    const companyCommercialReg = localStorage.getItem('companyCommercialReg') || '';
    const companyAddress = localStorage.getItem('companyAddress') || '';
    const companyCityPostal = localStorage.getItem('companyCityPostal') || '';

    const resolveOwnerFileUrl = async (
      ownerId: string | undefined,
      category: string,
      preferredFilename?: string | null
    ) => {
      if (!ownerId) return null;
      const files = await getFilesByOwner(ownerId, 'invoice', category as any);
      const match = preferredFilename
        ? files.find((f) => f.file_name === preferredFilename)
        : files[0];
      const chosen = match || files[0];
      if (!chosen) return null;
      const url = await getFileUrl(
        chosen.bucket as any,
        chosen.path,
        chosen.is_public
      );
      return url || null;
    };

    // Resolve logo: filename > URL > system default
    let logoToUse = invoice.companyLogo;
    if (!logoToUse) {
      logoToUse =
        (await resolveOwnerFileUrl(invoice.dbInvoiceId, FILE_CATEGORIES.BRANDING_LOGO, invoice.logoFilename)) ||
        (await getPrintLogo()) ||
        undefined;
    }

    // Resolve stamp: filename > URL > system default
    if (invoice.stampFilename === '__NO_STAMP__') {
      invoice = { ...invoice, stamp: '' };
    } else if (!invoice.stamp) {
      // First try to get invoice-specific stamp
      const stampUrl = await resolveOwnerFileUrl(
        invoice.dbInvoiceId,
        FILE_CATEGORIES.BRANDING_STAMP,
        invoice.stampFilename
      );
      if (stampUrl) {
        invoice = { ...invoice, stamp: stampUrl };
      } else {
        // Fall back to default stamp from Settings
        try {
          const { data: brandingData } = await supabase
            .from("company_branding")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (brandingData?.branding_id) {
            const brandingFiles = await getFilesByOwner(brandingData.branding_id, 'branding');
            const stampFile = brandingFiles.find((f) => f.category === FILE_CATEGORIES.BRANDING_STAMP);
            if (stampFile) {
              const defaultStampUrl = await getFileUrl(
                stampFile.bucket as any,
                stampFile.path,
                stampFile.is_public
              );
              if (defaultStampUrl) {
                invoice = { ...invoice, stamp: defaultStampUrl };
              }
            }
          }
        } catch (error) {
          console.warn('Failed to load default stamp from Settings:', error);
        }
      }
    }

    // Generate QR code with data URL
    let qrCode = "";
    try {
      // Use simple text data instead of HTML to avoid QR code size limits
      const simpleData = `Invoice: ${invoice.invoiceNumber}\nDate: ${new Date(invoice.date).toLocaleDateString('en-GB')}\nCustomer: ${invoice.customerName}\nTotal: SAR ${invoice.grandTotal.toFixed(2)}`;
      qrCode = await QRCode.toDataURL(simpleData, {
        errorCorrectionLevel: 'H',
        margin: 1,
        width: 300
      });
    } catch (err) {
      console.error("QR Code generation error:", err);
      // Fallback: generate an even simpler QR code
      try {
        const minimalData = `INV:${invoice.invoiceNumber}|${invoice.grandTotal.toFixed(2)}`;
        qrCode = await QRCode.toDataURL(minimalData);
      } catch (fallbackErr) {
        console.error("QR Code fallback generation error:", fallbackErr);
      }
    }

    // Generate HTML with logo and QR code - always use invoice date for printing
    const displayDate = invoice.date;
    const invoiceHTML = generateInvoiceHTML(
      invoice,
      logoToUse,
      qrCode,
      displayDate,
      includeImages,
      companyName,
      companyNameAr,
      companyTaxNumber,
      companyCommercialReg,
      companyAddress,
      companyCityPostal
    );
    
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


const generateInvoiceHTML = (
  invoice: Invoice,
  logoUrl?: string | null,
  qrCode?: string,
  displayDate?: string,
  includeImages: boolean = true,
  companyName?: string,
  companyNameAr?: string,
  companyTaxNumber?: string,
  companyCommercialReg?: string,
  companyAddress?: string,
  companyCityPostal?: string
) => {
    // Use provided logo or fall back to invoice logo
    const companyLogo = logoUrl || invoice.companyLogo;
    // Use provided display date or fall back to invoice date
    const dateToDisplay = displayDate || invoice.date;
    
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
          :root {
            --print-footer-height: 75mm;
          }
          @page { 
            size: A4; 
            margin: 0;
          }
          * { 
            margin: 0; 
            padding: 0; 
            box-sizing: border-box; 
          }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.4;
            color: #333;
            font-size: 12px;
            background: #eef2f5;
            -webkit-print-color-adjust: exact;
          }
          .invoice-container { 
            width: 210mm;
            min-height: 297mm;
            margin: 0 auto; 
            background: white; 
            position: relative;
          }
          
          /* Header Strip */
          .header-strip {
            background-color: #5d6d7e; /* Matches the slate blue in image */
            color: white;
            padding: 30px 40px;
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
          }
          .company-details-top {
            font-size: 11px;
            line-height: 1.6;
            color: white;
            /* Prevent iPhone from auto-detecting phone numbers */
            -webkit-text-size-adjust: 100%;
          }
          .company-details-top a,
          .company-details-top a[href^="tel:"] {
            color: white !important;
            text-decoration: none !important;
          }
          .company-name-top {
            font-weight: bold;
            font-size: 14px;
            margin-bottom: 5px;
          }
          .top-logo {
            max-width: 180px;
            max-height: 60px;
            height: auto;
            object-fit: contain;
          }
  
          /* Title Section */
          .title-section {
            text-align: center;
            padding: 20px 0;
            margin-top: 10px;
          }
          .title-ar {
            font-size: 18px;
            font-weight: bold;
            color: #333;
          }
          .title-en {
            font-size: 16px;
            font-weight: bold;
            color: #333;
            text-transform: uppercase;
          }
  
          /* Info Boxes */
          .info-grid {
            display: flex;
            justify-content: space-between;
            padding: 0 40px;
            margin-bottom: 25px;
            gap: 20px;
          }
          .info-box {
            border: 1px solid #e2e8f0;
            border-radius: 4px;
            padding: 0;
            flex: 1;
          }
          .info-box-header {
            padding: 8px 15px;
            border-bottom: 1px solid #e2e8f0;
            font-weight: 600;
            color: #555;
            display: flex;
            justify-content: space-between;
            background: #f8fafc;
            font-size: 11px;
          }
          .info-box-content {
            padding: 15px;
          }
          .customer-row {
            margin-bottom: 4px;
            font-weight: bold;
            font-size: 13px;
          }
          .detail-row {
            font-size: 12px;
            margin-bottom: 4px;
            color: #444;
          }
          .detail-row span {
             font-weight: 600;
          }
          .invoice-number-large {
             font-weight: bold;
             font-size: 14px;
             text-align: right;
          }
          .invoice-date-large {
             text-align: right;
             font-size: 12px;
          }
  
          /* Table */
          .table-container {
             padding: 0 40px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 20px;
            table-layout: fixed;
          }
          .items-table th {
            background-color: #5d6d7e; /* Matches header strip */
            color: white;
            padding: 10px 5px;
            text-align: left;
            font-size: 11px;
            font-weight: normal;
            word-wrap: break-word;
            overflow: hidden;
          }
          .items-table th.item-image-col { width: 50px; text-align: center; }
          .items-table th:not(.item-image-col):not(:last-child) { text-align: center; }
          .items-table th:last-child { text-align: right; }
          
          .items-table td {
            padding: 10px 5px;
            border-bottom: 1px solid #eee;
            vertical-align: middle;
            font-size: 11px;
            color: #333;
            word-wrap: break-word;
            overflow: hidden;
          }
          .items-table td.item-image-col { width: 50px; text-align: center; }
          .items-table td:not(.item-image-col):not(:last-child) { text-align: center; }
          .items-table td:last-child { text-align: right; font-weight: bold; }
          .item-image {
            width: 30px; 
            height: 30px; 
            object-fit: contain;
          }
  
          /* Bottom Section */
          .bottom-section {
            display: flex;
            justify-content: space-between;
            padding: 0 40px;
            margin-top: 10px;
          }
          .qr-container {
            width: 150px;
          }
          .qr-image {
            width: 120px;
            height: 120px;
            border: 1px solid #eee;
            padding: 5px;
          }
          
          .totals-container {
            width: 350px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 0;
            border-bottom: 1px solid #eee;
            font-size: 12px;
            font-weight: 600;
            color: #555;
          }
          .total-row.discount {
            color: #dc2626; /* Red for discount */
          }
          .grand-total {
            background-color: #5d6d7e;
            color: white;
            padding: 10px 15px;
            display: flex;
            justify-content: space-between;
            margin-top: 10px;
            font-weight: bold;
            font-size: 14px;
            border-radius: 4px;
          }
  
          /* Footer */
          .footer {
            margin-top: 40px;
            padding: 0 40px 40px 40px;
            text-align: center;
          }
          .company-footer-info {
            font-weight: bold;
            font-size: 12px;
            margin-bottom: 5px;
            color: #333;
          }
          .company-footer-details {
            font-size: 10px;
            color: #666;
            margin-bottom: 15px;
            line-height: 1.4;
          }
          .thank-you {
            font-size: 10px;
            color: #888;
            margin-bottom: 20px;
          }
          
          .bank-section {
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            text-align: left;
            margin-top: 30px;
          }
          .bank-title {
            font-weight: bold;
            margin-bottom: 5px;
            font-size: 11px;
          }
          .bank-text {
            font-size: 10px;
            color: #555;
            line-height: 1.5;
          }
          .stamp-container {
            width: 120px;
            height: 120px;
            display: flex;
            align-items: center;
            justify-content: center;
            position: relative;
          }
          .stamp-img {
            width: 120px;
            height: 120px;
            object-fit: contain;
            opacity: 0.85;
            border-radius: 4px;
          }
          }
  
          /* Sub-text inside th/td for Arabic */
          .sub-label {
             display: block;
             font-size: 9px;
             opacity: 0.8;
             margin-top: 2px;
          }
  
          @media print {
            body { 
              background: white; 
              padding: 0; 
            }
            .invoice-container {
              box-shadow: none;
              width: 100%;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
            }
            .table-container { 
              margin-bottom: 10px; 
            }
            .bottom-section {
              padding: 0 40px;
              margin-top: 8px;
            }
            .footer {
              position: static;
              margin-top: auto;
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .items-table thead { 
              display: table-header-group; 
            }
            .items-table tbody { 
              display: table-row-group; 
            }
            .items-table tr { 
              break-inside: avoid; 
              page-break-inside: avoid; 
            }
            .bottom-section, .footer {
              page-break-inside: avoid;
              break-inside: avoid;
            }
            .header-strip, .items-table th, .grand-total {
               print-color-adjust: exact;
               -webkit-print-color-adjust: exact;
            }
          }
        </style>
      </head>
      <body>
        <div class="invoice-container${includeImages ? '' : ' hide-item-images'}">
          
          <div class="header-strip">
            <div class="company-details-top">
              <div class="company-name-top">${companyName || 'Mana Smart Trading Company'} ${companyNameAr ? `| ${companyNameAr}` : '| شركة مانا الذكية للتجارة'}</div>
              <div>Tax Number / الرقم الضريبي: ${companyTaxNumber || invoice.taxNumber || '311510923100003'}</div>
              <div>Commercial Reg / السجل التجاري: ${companyCommercialReg || invoice.commercialRegister || '2051245473'}</div>
              <div>${[companyAddress, companyCityPostal].filter(Boolean).join(' | ') || 'Al-Khobar, Al-Jisr District 37417 | الخبر، حي الجسر 37417'}</div>
            </div>
            <div class="logo-wrapper">
               ${companyLogo ? `<img src="${companyLogo}" class="top-logo" alt="Logo">` : '<h1 style="color:white; font-weight:300; letter-spacing: 2px;">MĀNA</h1>'}
            </div>
          </div>
  
          <div class="title-section">
            <div class="title-ar">فاتورة ضريبية</div>
            <div class="title-en">TAX INVOICE</div>
          </div>
  
          <div class="info-grid">
            <div class="info-box">
              <div class="info-box-header">
                <span>BILL TO</span>
                <span>الفاتورة إلى</span>
              </div>
              <div class="info-box-content">
                <div class="customer-row">${escapeHtml(invoice.customerName)}</div>
                <div class="detail-row"><span>Mobile / الجوال:</span> ${escapeHtml(invoice.mobile)}</div>
                ${invoice.location ? `<div class="detail-row"><span>Location / الموقع:</span> ${escapeHtml(invoice.location)}</div>` : ''}
                ${invoice.commercialRegister ? `<div class="detail-row"><span>CR / السجل التجاري:</span> ${escapeHtml(invoice.commercialRegister)}</div>` : ''}
                ${invoice.taxNumber ? `<div class="detail-row"><span>Tax Number / الرقم الضريبي:</span> ${escapeHtml(invoice.taxNumber)}</div>` : ''}
              </div>
            </div>
  
            <div class="info-box">
              <div class="info-box-header">
                <span>INVOICE DETAILS</span>
                <span>تفاصيل الفاتورة</span>
              </div>
              <div class="info-box-content">
                 <div class="invoice-number-large">#${escapeHtml(invoice.invoiceNumber)}</div>
                 <div style="display:flex; justify-content:space-between; margin-top:10px;">
                    <span style="font-size:11px; color:#666;">Date / التاريخ</span>
                    <span style="font-weight:bold;">${new Date(dateToDisplay).toISOString().split('T')[0]}</span>
                 </div>
              </div>
            </div>
          </div>
  
          <div style="padding: 0 40px; margin-bottom: 0;">
             <div style="background: #e2e8f0; padding: 5px 10px; font-weight:bold; color: #5d6d7e; font-size: 11px;">
                INVOICE ITEMS / عناصر الفاتورة
             </div>
          </div>
  
          <div class="table-container">
            <table class="items-table">
              <thead>
                <tr>
                  <th class="item-image-col" style="width: 50px; text-align: center;">Image<br>صورة</th>
                  <th>Description<br>الوصف</th>
                  <th class="center" style="width: 50px;">Qty<br>الكمية</th>
                  <th class="center">Unit Price<br>سعر الوحدة</th>
                  <th class="center">Disc%<br>الخصم</th>
                  <th class="center">After Disc<br>بعد الخصم</th>
                  <th class="center">Subtotal<br>الفرعي</th>
                  <th class="center">VAT<br>الضريبة</th>
                  <th class="right">Total<br>المجموع</th>
                </tr>
              </thead>
              <tbody>
                ${invoice.items.map(item => `
                  <tr>
                    <td class="item-image-col" style="text-align: center;">
                       ${item.image ? `<img src="${item.image}" class="item-image">` : ''}
                    </td>
                    <td>${escapeHtml(item.description)}</td>
                    <td class="center">${item.quantity}</td>
                    <td class="center">${item.unitPrice.toFixed(2)}</td>
                    <td class="center">${item.discountPercent > 0 ? item.discountPercent + '%' : '-'}</td>
                    <td class="center">${(item.unitPrice * (1 - item.discountPercent/100)).toFixed(2)}</td>
                    <td class="center">${item.subtotal.toFixed(2)}</td>
                    <td class="center">${item.vat.toFixed(2)}</td>
                    <td class="right" style="font-weight:bold;">${item.total.toFixed(2)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
  
          <div class="bottom-section">
            <div class="qr-container">
              ${qrCode ? `<img src="${qrCode}" class="qr-image" alt="QR Code">` : ''}
            </div>
  
            <div class="totals-container">
              <div class="total-row">
                <span>Total Before Discount <span style="font-size:10px; color:#888;">/ قبل الخصم</span></span>
                <span>${invoice.totalBeforeDiscount.toFixed(2)} SAR</span>
              </div>
              <div class="total-row discount">
                <span>Total Discount <span style="font-size:10px; color:#faa;">/ الخصم</span></span>
                <span>-${invoice.totalDiscount.toFixed(2)} SAR</span>
              </div>
              <div class="total-row">
                <span>After Discount <span style="font-size:10px; color:#888;">/ بعد الخصم</span></span>
                <span>${invoice.totalAfterDiscount.toFixed(2)} SAR</span>
              </div>
              <div class="total-row">
                <span>VAT (15%) <span style="font-size:10px; color:#888;">/ الضريبة</span></span>
                <span>${invoice.totalVAT.toFixed(2)} SAR</span>
              </div>
              <div class="grand-total">
                <span>GRAND TOTAL / المجموع الإجمالي</span>
                <span>${invoice.grandTotal.toFixed(2)} SAR</span>
              </div>
            </div>
          </div>

  
            <div class="bank-section">
              <div>
                <div class="bank-title">💳 Bank Details / معلومات البنك</div>
                <div class="bank-title" style="color: #333;">${companyName || 'Mana Smart Trading Company'}${companyNameAr ? ` - ${companyNameAr}` : ' - شركة مانا الذكية للتجارة'}</div>
                <div class="bank-text">${companyNameAr ? ` - ${companyNameAr}` : ' - شركة مانا الذكية للتجارة'}</div>
                <div class="bank-text">مصرف الراجحي | Al Rajhi Bank</div>
                <div class="bank-text">Account Number: 301000010006080269328</div>
                <div class="bank-text">IBAN: SA2680000301608010269328</div>
              </div>
              <div class="stamp-container">
                 ${invoice.stamp ? `<img src="${invoice.stamp}" class="stamp-img" alt="Stamp">` : 
                   `<div style="width:120px; height:120px; border:2px dashed #ccc; border-radius:4px; display:flex; align-items:center; justify-content:center; color:#ccc; transform: rotate(-15deg); font-size:12px; text-align:center;">No Stamp</div>`}
              </div>
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

  const exportToPDF = () => {
    try {
      if (invoices.length === 0) {
        toast.error("No data to export.");
        return;
      }

      // Create HTML content for PDF
      let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Invoices Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            h1 { color: #333; text-align: center; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            .total-row { font-weight: bold; background-color: #f9f9f9; }
            .header-info { margin-bottom: 20px; }
          </style>
        </head>
        <body>
          <h1>Invoices Report</h1>
          <div class="header-info">
            <p><strong>Date:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Total Invoices:</strong> ${invoices.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Invoice Number</th>
                <th>Date</th>
                <th>Customer Name</th>
                <th>Mobile</th>
                <th>Location</th>
                <th>Total Amount (SAR)</th>
                <th>Paid Amount (SAR)</th>
                <th>Remaining Amount (SAR)</th>
                <th>Status</th>
                <th>Type</th>
              </tr>
            </thead>
            <tbody>
      `;

      let grandTotal = 0;
      invoices.forEach((invoice) => {
        grandTotal += invoice.grandTotal;
        htmlContent += `
          <tr>
            <td>${invoice.invoiceNumber}</td>
            <td>${invoice.date}</td>
            <td>${invoice.customerName}</td>
            <td>${invoice.mobile}</td>
            <td>${invoice.location}</td>
            <td>${invoice.grandTotal.toFixed(2)}</td>
            <td>${invoice.paidAmount.toFixed(2)}</td>
            <td>${invoice.remainingAmount.toFixed(2)}</td>
            <td>${invoice.status}</td>
            <td>${invoice.invoiceType === "monthly_visit" ? "Monthly Visit" : "Normal"}</td>
          </tr>
        `;
      });

      htmlContent += `
            </tbody>
            <tfoot>
              <tr class="total-row">
                <td colspan="6"><strong>Grand Total</strong></td>
                <td><strong>${grandTotal.toFixed(2)}</strong></td>
                <td colspan="3"></td>
              </tr>
            </tfoot>
          </table>
        </body>
        </html>
      `;

      // Create a new window and print
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.print();
        toast.success("PDF export ready for printing");
      } else {
        toast.error("Failed to open print window");
      }
    } catch (error) {
      console.error('PDF export error:', error);
      toast.error("Failed to export PDF");
    }
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
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={exportToExcel}>
                <Download className="h-4 w-4 mr-2" />
                Export as Excel
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportToPDF}>
                <FileText className="h-4 w-4 mr-2" />
                Export as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

                {/* Invoice Date */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Invoice Date</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="space-y-1">
                      <Label htmlFor="invoiceDate" className="text-xs">Select Invoice Date *</Label>
                      <Input 
                        id="invoiceDate" 
                        type="date"
                        value={invoiceDate} 
                        onChange={(e) => setInvoiceDate(e.target.value)}
                        className="h-8 text-sm cursor-pointer"
                      />
                      <p className="text-xs text-muted-foreground">
                        The date that will appear on the invoice
                      </p>
                    </div>
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
                            discountAmount: 0,
                            discountType: "percentage",
                            itemDiscount: 0,
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
                            discountAmount: 0,
                            discountType: "percentage",
                            itemDiscount: 0,
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
                                  const vat = vatEnabled ? subtotal * VAT_RATE : 0;
                                  const total = subtotal + vat;
                                  
                                  setItems([{
                                    id: Date.now(),
                                    isManual: true,
                                    description: itemDescription,
                                    quantity: 1,
                                    unitPrice: invoiceAmount,
                                    discountPercent: 0,
                                    discountAmount: 0,
                                    discountType: "percentage" as const,
                                    itemDiscount: 0,
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
                                discountAmount: 0,
                                discountType: "percentage",
                                itemDiscount: 0,
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
                  <CardContent className="space-y-3">
                    <div className="text-xs text-muted-foreground bg-blue-50 p-2 rounded">
                      Default logo and stamp from Settings are shown below. Upload custom assets to override for this quotation only.
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <div className="flex items-start gap-2">
                          <Label className="text-xs shrink-0">Company Logo</Label>
                          <div className="ml-auto flex flex-wrap items-center justify-end gap-1 min-w-0">
                            {isUsingDefaultLogo && defaultLogoUrl && (
                              <Badge variant="outline" className="text-xs whitespace-nowrap">System Default</Badge>
                            )}
                            {!isUsingDefaultLogo && (
                              <Badge variant="default" className="text-xs bg-green-600 whitespace-nowrap">Custom</Badge>
                            )}
                          </div>
                        </div>
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
                          {isUsingDefaultLogo ? "Override Logo" : "Change Logo"}
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
                              onClick={() => {
                                setCompanyLogo(defaultLogoUrl || "");
                                setLogoFilename(null);
                                setIsUsingDefaultLogo(true);
                              }}
                              title={isUsingDefaultLogo ? "Using system default" : "Reset to default"}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {!companyLogo && defaultLogoUrl && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Using system default logo
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-start gap-2">
                          <Label className="text-xs shrink-0">Stamp (Optional)</Label>
                          <div className="ml-auto flex flex-wrap items-center justify-end gap-1 min-w-0">
                            {isStampRemoved && (
                              <Badge variant="outline" className="text-xs whitespace-nowrap">Removed</Badge>
                            )}
                            {isUsingDefaultStamp && defaultStampUrl && (
                              <Badge variant="outline" className="text-xs whitespace-nowrap">System Default</Badge>
                            )}
                            {!isStampRemoved && !isUsingDefaultStamp && (
                              <Badge variant="default" className="text-xs bg-green-600 whitespace-nowrap">Custom</Badge>
                            )}
                          </div>
                        </div>
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
                          disabled={isStampRemoved && !defaultStampUrl}
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          {isStampRemoved ? "Upload Stamp" : (isUsingDefaultStamp ? "Override Stamp" : "Change Stamp")}
                        </Button>
                        {defaultStampUrl && (
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full h-8 text-xs"
                            onClick={() => {
                              setIsStampRemoved(false);
                              setStamp(defaultStampUrl || "");
                              setStampFilename(null);
                              setIsUsingDefaultStamp(true);
                            }}
                            disabled={!isStampRemoved && isUsingDefaultStamp}
                          >
                            Use Default
                          </Button>
                        )}
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
                              onClick={() => {
                                setIsStampRemoved(true);
                                setStamp('');
                                setStampFilename('__NO_STAMP__');
                                setIsUsingDefaultStamp(false);
                              }}
                              title="Remove stamp"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                        {!stamp && defaultStampUrl && (
                          <div className="text-xs text-muted-foreground mt-1">
                            Using system default stamp
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Items - Only show for normal invoices */}
                {invoiceType === "normal" && (
                <>
                {/* Global Discount Controls */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Discount Settings</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label className="text-xs">Discount Mode</Label>
                        <Select 
                          value={discountMode} 
                          onValueChange={(value: "individual" | "global") => {
                            setDiscountMode(value);
                            if (value === "individual") {
                              setGlobalDiscountAmount("");
                              // Reset all item discounts to 0
                              setItems(currentItems => currentItems.map(item => {
                                const updated = {
                                  ...item,
                                  discountPercent: 0,
                                  discountAmount: 0,
                                  discountType: "percentage" as const,
                                };
                                const totals = calculateItemTotals(updated, vatEnabled);
                                return { ...updated, ...totals };
                              }));
                            }
                          }}
                        >
                          <SelectTrigger className="h-8 text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="individual">Individual Items</SelectItem>
                            <SelectItem value="global">Global Discount</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label className="text-xs">VAT (15%)</Label>
                        <div className="flex items-center space-x-2">
                          <Switch
                            checked={vatEnabled}
                            onCheckedChange={setVatEnabled}
                          />
                          <span className="text-sm text-gray-600">
                            {vatEnabled ? "Enabled" : "Disabled"}
                          </span>
                        </div>
                      </div>
                      {discountMode === "global" && (
                        <>
                          <div className="space-y-2">
                            <Label className="text-xs">Global Discount Type</Label>
                            <Select 
                              value={globalDiscountType} 
                              onValueChange={(value: "percentage" | "fixed") => setGlobalDiscountType(value)}
                            >
                              <SelectTrigger className="h-8 text-sm">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="percentage">Percentage (%)</SelectItem>
                                <SelectItem value="fixed">Fixed (ر.س)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div className="space-y-2 col-span-2">
                            <Label className="text-xs">
                              Global Discount {globalDiscountType === "percentage" ? "(%)" : "(ر.س)"}
                            </Label>
                            <Input 
                              type="number" 
                              min="0"
                              max={globalDiscountType === "percentage" ? "100" : undefined}
                              step="0.01"
                              value={globalDiscountAmount} 
                              onChange={(e) => setGlobalDiscountAmount(e.target.value)}
                              placeholder={globalDiscountType === "percentage" ? "Enter percentage" : "Enter fixed amount"}
                              className="h-8 text-sm"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

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
                              <div className="relative">
                                <Search className="absolute left-2 top-2 h-3 w-3 text-muted-foreground" />
                                <Input
                                  placeholder="Search products..."
                                  className="pl-7 h-8 text-sm"
                                  onChange={(e) => {
                                    const searchTerm = e.target.value;
                                    loadMoreInventory(searchTerm);
                                  }}
                                />
                              </div>
                              <Select onValueChange={(value) => loadItemFromInventory(item.id, value)}>
                                <SelectTrigger className="h-8 text-sm w-full">
                                  <SelectValue placeholder="Select product..." />
                                </SelectTrigger>
                                <SelectContent>
                                  {dbInventory.map(inv => (
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
                              <Label className="text-xs">Discount Type</Label>
                              <Select 
                                value={item.discountType || "percentage"} 
                                onValueChange={(value: "percentage" | "fixed") => updateItem(item.id, "discountType", value)}
                                disabled={discountMode === "global"}
                              >
                                <SelectTrigger className="h-8 text-sm" disabled={discountMode === "global"}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="percentage">Percentage (%)</SelectItem>
                                  <SelectItem value="fixed">Fixed (ر.س)</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">
                                Discount {item.discountType === "percentage" ? "(%)" : "(ر.س)"}
                              </Label>
                              <Input 
                                type="number" 
                                min="0"
                                max={item.discountType === "percentage" ? "100" : undefined}
                                step="0.01"
                                value={item.discountType === "percentage" ? item.discountPercent : item.discountAmount} 
                                onChange={(e) => {
                                  const value = parseFloat(e.target.value) || 0;
                                  if (item.discountType === "percentage") {
                                    updateItem(item.id, "discountPercent", value);
                                  } else {
                                    updateItem(item.id, "discountAmount", value);
                                  }
                                }}
                                disabled={discountMode === "global"}
                                className="h-8 text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Discount</Label>
                              <div className="h-8 flex items-center">
                                <p className="text-sm text-muted-foreground">
                                  {item.discountType === "percentage" 
                                    ? `${item.discountPercent.toFixed(2)}%` 
                                    : `ر.س ${item.discountAmount.toFixed(2)}`}
                                </p>
                              </div>
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
                        disabled={dbInventory.length === 0}
                        className="w-full h-8 text-xs"
                        title={dbInventory.length === 0 ? "No items currently in inventory" : ""}
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {dbInventory.length === 0 ? "No items currently in inventory" : "Add from Inventory"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
                </>
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
                          {(() => {
                            const paid = parseFloat(paidAmount) || 0;
                            const total = totals.grandTotal;
                            // Round both values to 2 decimal places for comparison to avoid floating-point precision issues
                            const roundedPaid = Math.round(paid * 100) / 100;
                            const roundedTotal = Math.round(total * 100) / 100;
                            const remaining = Math.max(0, roundedTotal - roundedPaid);
                            
                            if (remaining <= 0.01) {
                              return <Badge className="bg-green-100 text-green-700 border-green-200 text-xs py-0">Paid - مدفوعة</Badge>;
                            } else if (roundedPaid > 0) {
                              return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs py-0">Partial - جزئي</Badge>;
                            } else {
                              return <Badge className="bg-gray-100 text-gray-700 border-gray-200 text-xs py-0">Draft - مسودة</Badge>;
                            }
                          })()}
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Settings Section - Only for monthly visit invoices */}
                {invoiceType === "monthly_visit" && (
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
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t mt-3 flex-shrink-0">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="h-9">
                Cancel
              </Button>
              <Button onClick={createInvoice} disabled={isCreatingInvoice} className="h-9 bg-purple-600 hover:bg-purple-700 text-white">
                {isCreatingInvoice ? "Creating..." : "Create Invoice"}
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
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex flex-col gap-2">
                <Label htmlFor="search">Search</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="search"
                    placeholder="Search invoices..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-8 w-full sm:w-[250px]"
                  />
                </div>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex flex-col gap-2">
                  <Label>Status</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="All statuses" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="partial">Partial</SelectItem>
                      <SelectItem value="draft">Draft</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label>Sort Order</Label>
                  <Select value={sortOrder} onValueChange={(value: "asc" | "desc") => setSortOrder(value)}>
                    <SelectTrigger className="w-[220px]">
                      <SelectValue placeholder="Sort order" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="desc">Newest First</SelectItem>
                      <SelectItem value="asc">Oldest First</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {invoicesError ? (
            <div className="text-center py-12">
              <div className="text-red-600 text-sm">
                Failed to load invoices. Please try again.
              </div>
              <Button 
                variant="outline" 
                onClick={() => refetchInvoices()} 
                className="mt-4"
              >
                Try Again
              </Button>
            </div>
          ) : isDataLoading ? (
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
                          className="gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200"
                          onClick={() => editInvoice(invoice)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
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
                          className="gap-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border-purple-200"
                          onClick={() => copyInvoice(invoice)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <div className="relative" data-invoice-print-options-root="true">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setOpenPrintOptionsInvoiceId((prev) =>
                                prev === invoice.id ? null : invoice.id
                              )
                            }
                          >
                            <Printer className="h-4 w-4" />
                          </Button>
                          {openPrintOptionsInvoiceId === invoice.id && (
                            <div className="absolute right-0 top-full mt-2 z-50 w-52 rounded-md border bg-white shadow-md flex flex-col">
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm"
                                onClick={() => {
                                  setPrintIncludeImages(true);
                                  setOpenPrintOptionsInvoiceId(null);
                                  void printInvoice(invoice, true);
                                }}
                              >
                                Print with images
                              </button>
                              <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm border-t"
                                onClick={() => {
                                  setPrintIncludeImages(false);
                                  setOpenPrintOptionsInvoiceId(null);
                                  void printInvoice(invoice, false);
                                }}
                              >
                                Print without images
                              </button>
                            </div>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            // Load logo for download
                            const logoForDownload = invoice.companyLogo || (await getPrintLogo()) || undefined;
                            const companyInfoForDownload = await getCompanyInfo();
                            const companyNameForDownload = getCompanyName(companyInfoForDownload); // English name only
                            const companyNameArForDownload = companyInfoForDownload?.company_name_ar || '';
                            const companyTaxNumberForDownload = localStorage.getItem('companyTaxNumber') || '';
                            const companyCommercialRegForDownload = localStorage.getItem('companyCommercialReg') || '';
                            const companyAddressForDownload = localStorage.getItem('companyAddress') || '';
                            const companyCityPostalForDownload = localStorage.getItem('companyCityPostal') || '';
                            const blob = new Blob([generateInvoiceHTML(
                              invoice,
                              logoForDownload,
                              undefined,
                              undefined,
                              true,
                              companyNameForDownload,
                              companyNameArForDownload,
                              companyTaxNumberForDownload,
                              companyCommercialRegForDownload,
                              companyAddressForDownload,
                              companyCityPostalForDownload
                            )], { type: 'text/html' });
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
          
          {/* Load More Invoices Button */}
          {hasMore && dbInvoices.length > 0 && (
            <div className="flex justify-center mt-4">
              <Button 
                variant="outline" 
                onClick={() => void loadMoreInvoices()}
                disabled={isLoadingMore || invoicesLoading}
                className="gap-2"
              >
                {isLoadingMore ? (
                  <>
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Loading...
                  </>
                ) : (
                  <>
                    Load More Invoices
                    <span className="text-muted-foreground">({dbInvoices.length} loaded)</span>
                  </>
                )}
              </Button>
            </div>
          )}
          
          {/* End of data message */}
          {!hasMore && dbInvoices.length > 0 && (
            <div className="text-center text-muted-foreground mt-4 text-sm">
              Showing all {dbInvoices.length} invoices
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Invoice Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Invoice</DialogTitle>
            <DialogDescription>Update invoice date and other details</DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="edit-invoice-number">Invoice Number</Label>
                <Input
                  id="edit-invoice-number"
                  value={selectedInvoice.invoiceNumber}
                  disabled
                  className="bg-muted"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-customer">Customer</Label>
                <Input
                  id="edit-customer"
                  value={selectedInvoice.customerName}
                  disabled
                  className="bg-muted"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="edit-date">Invoice Date</Label>
                <Input
                  id="edit-date"
                  type="date"
                  value={editingInvoiceDate}
                  onChange={(e) => setEditingInvoiceDate(e.target.value)}
                  className="cursor-pointer"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Current Total</Label>
                <Input
                  value={`${selectedInvoice.grandTotal.toFixed(2)} ر.س`}
                  disabled
                  className="bg-muted"
                />
              </div>
              
              <div className="space-y-2">
                <Label>Current Status</Label>
                <Badge className={
                  selectedInvoice.status === "paid" ? "bg-green-100 text-green-700 border-green-200" :
                  selectedInvoice.status === "partial" ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                  "bg-gray-100 text-gray-700 border-gray-200"
                }>
                  {selectedInvoice.status === "paid" ? "Paid" : selectedInvoice.status === "partial" ? "Partial" : "Draft"}
                </Badge>
              </div>
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setSelectedInvoice(null);
                setEditingInvoiceDate("");
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={updateInvoiceDate}
              disabled={isEditingInvoice}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isEditingInvoice ? "Updating..." : "Update Invoice"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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

              {/* Print Date Selection */}
              {/* <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Print Date Options</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Label className="text-xs">Choose date to display on printed invoice:</Label>
                    <Select 
                      value={printDateOption} 
                      onValueChange={(value: "invoice_date" | "today" | "custom") => setPrintDateOption(value)}
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="invoice_date">Invoice Date ({new Date(selectedInvoice.date).toLocaleDateString('en-GB')})</SelectItem>
                        <SelectItem value="today">Today's Date ({new Date().toLocaleDateString('en-GB')})</SelectItem>
                        <SelectItem value="custom">Custom Date</SelectItem>
                      </SelectContent>
                    </Select>
                    {printDateOption === "custom" && (
                      <div className="mt-2">
                        <Label className="text-xs">Select Custom Date:</Label>
                        <Input
                          type="date"
                          value={customPrintDate}
                          onChange={(e) => setCustomPrintDate(e.target.value)}
                          className="h-8 text-sm mt-1"
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card> */}

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
                  disabled={isProcessingPayment}
                  onClick={async () => {
                    setIsProcessingPayment(true);
                    
                    try {
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
                      
                      refetchInvoices(); // Refetch after payment update
                    } catch (error: any) {
                      const message =
                        error?.message || error?.error?.message || "Failed to update invoice";
                      toast.error(message);
                      return;
                    }

                    // No need to fetchAll since createOne and updateOne should optimistically update the Redux store

                    toast.success(`Payment of ${amount.toFixed(2)} ر.س collected successfully!`);
                    setIsPaymentDialogOpen(false);
                    setPaymentAmount("");
                    setPaymentMethod("");
                    setPaymentDate(new Date().toISOString().split("T")[0]);
                    } catch (error: any) {
                      const message =
                        error?.message || error?.error?.message || "Failed to process payment";
                      toast.error(message);
                    } finally {
                      setIsProcessingPayment(false);
                    }
                  }}
                >
                  <Wallet className="h-4 w-4" />
                  {isProcessingPayment ? "Processing..." : "Confirm Payment"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
