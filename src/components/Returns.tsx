const createId = () =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  DollarSign,
  AlertCircle,
  CheckCircle,
  XCircle,
  RefreshCcw,
  Download,
  Eye,
  Edit,
  Trash2,
  ChevronsUpDown,
  Check,
  Undo2
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Alert, AlertDescription } from "./ui/alert";
import { Separator } from "./ui/separator";
import { Switch } from "./ui/switch";
import { Checkbox } from "./ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "./ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "./ui/command";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { ReturnsManagement } from "../../supabase/models/returns_management";
import type { PurchaseOrders } from "../../supabase/models/purchase_orders";
import type { Expenses as ExpenseRow } from "../../supabase/models/expenses";
import type { Suppliers } from "../../supabase/models/suppliers";

type ReturnType = "purchase" | "expense";
type ReturnStatus = "Pending" | "Approved" | "Rejected" | "Completed";

interface ReturnItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  originalQuantity?: number | null;
}

interface ReturnRecord {
  id: string;
  createdAt: string | null;
  type: ReturnType;
  status: ReturnStatus;
  reason: string;
  notes?: string | null;
  supplierId?: string | null;
  supplierName?: string;
  purchaseId?: string | null;
  purchaseNumber?: string | null;
  purchaseDate?: string | null;
  expenseId?: string | null;
  expenseNumber?: string | null;
  expenseDate?: string | null;
  manualReference?: string;
  manualDate?: string;
  manualSupplierId?: string | null;
  isManual?: boolean;
  totalAmount: number;
  baseAmount: number;
  taxAmount: number;
  remainingAmount?: number;
  items: ReturnItem[];
  searchTokens: string[];
}

interface ReturnMetadata {
  manualReference?: string;
  manualDate?: string;
  manualSupplierId?: string | null;
  isManual?: boolean;
  sourceType?: ReturnType;
  expenseReference?: string;
}

interface FormItemState {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  originalQuantity?: number | null;
  sourceItemId?: string;
}

const RETURN_REASONS = [
  "Defective products",
  "Wrong items delivered",
  "Poor quality",
  "Damaged during shipping",
  "Not as described",
  "Duplicate order",
  "Other"
];

const RETURN_STATUSES: ReturnStatus[] = ["Pending", "Approved", "Rejected", "Completed"];

interface PurchaseOrderItemInfo {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  total: number;
  returnedQuantity: number;
  remainingQuantity: number;
  totalReturnedAmount: number;
}

interface PurchaseReturnHistoryEntry {
  returnId: string;
  quantity: number;
  unitPrice: number;
  total: number;
  createdAt: string | null;
}

interface PurchaseReturnedItemSummary {
  sourceItemId: string;
  description: string;
  totalQuantity: number;
  totalAmount: number;
  history: PurchaseReturnHistoryEntry[];
}

interface PurchaseOrderAdjustmentResult {
  payload: Record<string, unknown>;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  remainingAmount: number;
  totalReturnedAmount: number;
}

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function titleCaseStatus(value: string | null | undefined): ReturnStatus {
  switch ((value ?? "").toLowerCase()) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "completed":
    case "complete":
      return "Completed";
    case "pending":
    default:
      return "Pending";
  }
}

const STATUS_TO_DB_VALUE: Record<ReturnStatus, string> = {
  Pending: "pending",
  Approved: "approved",
  Rejected: "rejected",
  Completed: "complete"
};

function toDbStatus(value: ReturnStatus) {
  return STATUS_TO_DB_VALUE[value] ?? "pending";
}

function parseReturnPayload(
  raw: unknown
): { items: ReturnItem[]; notes?: string | null; metadata?: ReturnMetadata } {
  if (!raw) return { items: [], notes: undefined, metadata: undefined };
  let parsed: any = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { items: [], notes: undefined, metadata: undefined };
    }
  }
  let notes: string | null | undefined;
  let metadata: ReturnMetadata | undefined;
  let itemsSource = parsed;
  if (!Array.isArray(parsed) && Array.isArray(parsed?.items)) {
    itemsSource = parsed.items;
    notes = parsed.notes ?? parsed.metadata?.notes ?? null;
    metadata = parsed.metadata as ReturnMetadata | undefined;
  }
  if (!Array.isArray(itemsSource)) return { items: [], notes, metadata };
  const items = itemsSource.flatMap((entry, index) => {
    if (!entry) return [];
    const description = entry.description ?? entry.itemName ?? entry.name ?? `Item ${index + 1}`;
    const quantity = Number(entry.quantity ?? entry.returnedQuantity ?? 0);
    const unitPrice = Number(entry.unitPrice ?? entry.price ?? 0);
    const total = Number(entry.total ?? quantity * unitPrice);
    return [
      {
        id: entry.id ?? `${Date.now()}-${index}`,
        description: String(description),
        quantity,
        unitPrice,
        total,
        originalQuantity: entry.originalQuantity ?? entry.quantity ?? null
      }
    ];
  });
  return { items, notes, metadata };
}

function createEmptyItem(): FormItemState {
  return {
    id: createId(),
    description: "",
    quantity: "0",
    unitPrice: "0",
    sourceItemId: undefined
  };
}

function normalizeSearchValue(value: unknown) {
  if (value === null || value === undefined) return "";
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function buildSearchTokens(...values: (string | number | null | undefined)[]) {
  return values
    .map(normalizeSearchValue)
    .filter((token) => token.length > 0);
}

function fromDbReturnType(value: string | null | undefined): ReturnType {
  const normalized = normalizeSearchValue(value);
  if (["purchase", "purchase_return", "purchase-order", "purchase_order", "po"].includes(normalized)) {
    return "purchase";
  }
  return "expense";
}

function toDbReturnType(value: ReturnType): string {
  return value === "purchase" ? "purchase_return" : "expense_return";
}

function formatPurchaseIdentifier(purchase: PurchaseOrders | undefined, fallbackId?: string | null) {
  if (!purchase) {
    return fallbackId ?? undefined;
  }
  const invoiceNumber = purchase.purchase_invoice_number?.trim();
  if (invoiceNumber) {
    return invoiceNumber.toUpperCase();
  }
  const reference = purchase.reference_number?.trim();
  if (reference) {
    return reference.toUpperCase();
  }
  if (purchase.purchase_date) {
    const year = new Date(purchase.purchase_date).getFullYear();
    const shortId = (purchase.purchase_id ?? fallbackId ?? "").slice(0, 4).toUpperCase();
    return `PUR-${year}-${shortId}`;
  }
  if (purchase.purchase_id) {
    return `PUR-${purchase.purchase_id.slice(0, 8).toUpperCase()}`;
  }
  return fallbackId ?? undefined;
}

function formatExpenseIdentifier(expense: ExpenseRow | undefined, fallback?: string | null) {
  const receipt = expense?.receipt_number?.trim();
  if (receipt) {
    return receipt.toUpperCase();
  }
  const descriptor = expense?.description?.trim();
  if (descriptor) {
    return descriptor;
  }
  if (expense?.expense_id) {
    return `EXP-${expense.expense_id.slice(0, 8).toUpperCase()}`;
  }
  return fallback ?? undefined;
}

function resolvePurchaseItemId(item: any, fallback: string) {
  return (
    item.id ??
    item.item_id ??
    item.product_id ??
    item.material_id ??
    item.sku ??
    item.line_id ??
    fallback
  );
}

function parsePurchaseOrderItems(
  raw: unknown,
  purchaseId?: string,
  returnedSummaryMap?: Map<string, PurchaseReturnedItemSummary>
): PurchaseOrderItemInfo[] {
  if (!raw) return [];
  let payload = raw as any;
  if (typeof raw === "string") {
    try {
      payload = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  let itemsSource = payload;
  if (!Array.isArray(itemsSource) && Array.isArray(itemsSource?.items)) {
    itemsSource = itemsSource.items;
  }
  if (!Array.isArray(itemsSource)) return [];
  return itemsSource.flatMap((item: any, index: number) => {
    if (!item) return [];
    const fallbackId = purchaseId ? `${purchaseId}-${index}` : `${Date.now()}-${index}`;
    const id = resolvePurchaseItemId(item, fallbackId);
    const description =
      item.description ??
      item.item_name ??
      item.name ??
      item.product_name ??
      `Item ${index + 1}`;
    const originalQuantityValue =
      item.originalQuantity ??
      item.original_quantity ??
      item.orderedQuantity ??
      item.ordered_quantity ??
      item.quantity ??
      item.qty ??
      item.item_quantity ??
      item.count ??
      0;
    const quantity = Number(originalQuantityValue);
    const unitPrice = Number(item.unitPrice ?? item.unit_price ?? item.price ?? item.cost ?? 0);
    const normalizedQuantity = Number.isFinite(quantity) ? quantity : 0;
    const normalizedPrice = Number.isFinite(unitPrice) ? unitPrice : 0;
    const total = Number(item.total ?? normalizedQuantity * normalizedPrice);
    const summary = returnedSummaryMap?.get(String(id));
    const returnedQuantity = Number(
      summary?.totalQuantity ??
        item.returnedQuantity ??
        item.returned_quantity ??
        item.returned_qty ??
        0
    );
    const payloadRemaining =
      item.remainingQuantity ?? item.remaining_quantity ?? item.available_quantity ?? null;
    const remainingFromPayload =
      payloadRemaining !== null && payloadRemaining !== undefined
        ? Number(payloadRemaining)
        : null;
    const remainingQuantity =
      remainingFromPayload !== null && Number.isFinite(remainingFromPayload)
        ? Math.max(0, remainingFromPayload)
        : Math.max(0, normalizedQuantity - returnedQuantity);
    const totalReturnedAmount = Number(summary?.totalAmount ?? 0);
    return [
      {
        id: String(id),
        description: String(description),
        quantity: normalizedQuantity,
        unitPrice: normalizedPrice,
        total: Number.isFinite(total) ? total : normalizedQuantity * normalizedPrice,
        returnedQuantity,
        remainingQuantity,
        totalReturnedAmount
      }
    ];
  });
}

function normalizePurchaseOrderItemsPayload(raw: unknown) {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        return { ...parsed };
      }
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") {
    return { ...(raw as Record<string, unknown>) };
  }
  return {};
}

function buildReturnedItemSummaries(records: ReturnRecord[]): PurchaseReturnedItemSummary[] {
  const aggregate = new Map<string, PurchaseReturnedItemSummary>();

  records.forEach((record) => {
    record.items.forEach((item) => {
      const sourceId = String(item.id ?? "");
      if (!sourceId) return;
      const historyEntry: PurchaseReturnHistoryEntry = {
        returnId: record.id,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.total,
        createdAt: record.createdAt ?? null
      };
      if (!aggregate.has(sourceId)) {
        aggregate.set(sourceId, {
          sourceItemId: sourceId,
          description: item.description,
          totalQuantity: 0,
          totalAmount: 0,
          history: []
        });
      }
      const entry = aggregate.get(sourceId)!;
      entry.totalQuantity = Number((entry.totalQuantity + item.quantity).toFixed(3));
      entry.totalAmount = Number((entry.totalAmount + item.total).toFixed(2));
      entry.history.push(historyEntry);
    });
  });

  return Array.from(aggregate.values()).map((entry) => ({
    ...entry,
    history: entry.history.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA;
    })
  }));
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundTo(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

function firstAvailable(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }
  return undefined;
}

function deepClone<T>(value: T): T {
  if (value === null || value === undefined) return value;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return value;
  }
}

function cloneWithQuantityMetadata(
  rawItem: Record<string, unknown>,
  {
    originalQuantity,
    remainingQuantity,
    returnedQuantity,
    returnedAmount,
    unitPrice
  }: {
    originalQuantity: number;
    remainingQuantity: number;
    returnedQuantity: number;
    returnedAmount: number;
    unitPrice: number;
  }
) {
  const lineTotal = roundTo(remainingQuantity * unitPrice);
  const baseClone: Record<string, unknown> = {
    ...rawItem,
    quantity: remainingQuantity,
    remainingQuantity,
    returnedQuantity,
    returnedAmount: roundTo(returnedAmount),
    unitPrice: unitPrice,
    total: lineTotal,
    originalQuantity
  };

  // Preserve snake_case variants if they existed previously or consumers expect them.
  baseClone.remaining_quantity = remainingQuantity;
  baseClone.returned_quantity = returnedQuantity;
  baseClone.returned_amount = roundTo(returnedAmount);
  baseClone.original_quantity = originalQuantity;

  if ("unit_price" in rawItem) {
    baseClone.unit_price = unitPrice;
  }

  if ("line_total" in rawItem) {
    baseClone.line_total = lineTotal;
  }

  return baseClone;
}

function buildPurchaseOrderAdjustment(
  purchase: PurchaseOrders,
  returnRecords: ReturnRecord[]
): PurchaseOrderAdjustmentResult | null {
  const normalizedPayload = normalizePurchaseOrderItemsPayload(purchase.purchase_order_items) as Record<string, unknown>;
  const rawItemsSource = normalizedPayload?.items;
  const rawItems: Record<string, unknown>[] = Array.isArray(rawItemsSource)
    ? [...(rawItemsSource as Record<string, unknown>[])]
    : [];

  if (!rawItems.length && returnRecords.length === 0) {
    return null;
  }

  const summaries = buildReturnedItemSummaries(returnRecords);
  const fallbackPrefix = purchase.purchase_id ?? "purchase-item";
  const rawItemIdentifiers = rawItems.map((rawItem, index) =>
    String(resolvePurchaseItemId(rawItem, `${fallbackPrefix}-${index}`))
  );
  const rawItemIdentifierSet = new Set(rawItemIdentifiers);
  const summaryMap = new Map<string, PurchaseReturnedItemSummary>(
    summaries.map((summary) => [String(summary.sourceItemId), summary])
  );

  let subtotalAccumulator = 0;
  const updatedItems = rawItems.map((rawItem, index) => {
    const sourceId = rawItemIdentifiers[index];
    const summary = summaryMap.get(sourceId);
    const originalQuantity = toFiniteNumber(
      firstAvailable(rawItem, [
        "quantity",
        "qty",
        "item_quantity",
        "count",
        "originalQuantity",
        "original_quantity"
      ]),
      0
    );
    const unitPrice = toFiniteNumber(
      firstAvailable(rawItem, ["unitPrice", "unit_price", "price", "cost", "unit_cost"]),
      0
    );
    const returnedQuantity = summary ? toFiniteNumber(summary.totalQuantity, 0) : 0;
    const remainingQuantity = Math.max(0, originalQuantity - returnedQuantity);
    const returnedAmount = summary ? toFiniteNumber(summary.totalAmount, 0) : 0;

    subtotalAccumulator += roundTo(remainingQuantity * unitPrice);

    return cloneWithQuantityMetadata(rawItem, {
      originalQuantity,
      remainingQuantity,
      returnedQuantity,
      returnedAmount,
      unitPrice
    });
  });

  // Include items that were not part of the original payload but exist in return history.
  summaries.forEach((summary) => {
    if (rawItemIdentifierSet.has(String(summary.sourceItemId))) {
      return;
    }
    const fallbackUnitPrice = summary.totalQuantity > 0 ? roundTo(summary.totalAmount / summary.totalQuantity, 2) : 0;
    subtotalAccumulator += 0;
    updatedItems.push(
      cloneWithQuantityMetadata(
        {
          id: summary.sourceItemId,
          description: summary.description ?? `Item ${summary.sourceItemId}`
        },
        {
          originalQuantity: summary.totalQuantity,
          remainingQuantity: 0,
          returnedQuantity: summary.totalQuantity,
          returnedAmount: summary.totalAmount,
          unitPrice: fallbackUnitPrice
        }
      )
    );
  });

  const originalSubtotal = toFiniteNumber(
    firstAvailable(normalizedPayload, ["subtotal", "sub_total"]),
    rawItems.reduce((sum, rawItem) => {
      const quantity = toFiniteNumber(
        firstAvailable(rawItem, [
          "quantity",
          "qty",
          "item_quantity",
          "count",
          "originalQuantity",
          "original_quantity"
        ]),
        0
      );
      const unitPrice = toFiniteNumber(
        firstAvailable(rawItem, ["unitPrice", "unit_price", "price", "cost", "unit_cost"]),
        0
      );
      const total = toFiniteNumber(firstAvailable(rawItem, ["total", "line_total"]), quantity * unitPrice);
      return sum + total;
    }, 0)
  );

  const declaredTaxRate = (() => {
    const raw = firstAvailable(normalizedPayload, ["tax_rate", "taxRate"]);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  })();

  const declaredTaxAmount = toFiniteNumber(firstAvailable(normalizedPayload, ["tax_amount", "taxAmount"]), 0);
  const subtotal = roundTo(subtotalAccumulator);

  let taxAmount = 0;
  if (declaredTaxRate !== null) {
    taxAmount = roundTo((subtotal * declaredTaxRate) / 100);
  } else if (originalSubtotal > 0 && declaredTaxAmount > 0) {
    const ratio = declaredTaxAmount / originalSubtotal;
    taxAmount = roundTo(subtotal * ratio);
  } else {
    taxAmount = roundTo(declaredTaxAmount);
  }

  const totalAmount = roundTo(subtotal + taxAmount);
  const paidAmount = toFiniteNumber(purchase.purchase_paid_amount, 0);
  const remainingAmount = Math.max(0, roundTo(totalAmount - paidAmount));
  const totalReturnedAmount = roundTo(
    summaries.reduce((sum, summary) => sum + toFiniteNumber(summary.totalAmount, 0), 0)
  );

  const nextPayload: Record<string, unknown> = {
    ...normalizedPayload,
    items: updatedItems
  };

  if (summaries.length > 0) {
    nextPayload.returned_items = summaries;
    nextPayload.total_returned_amount = totalReturnedAmount;
    nextPayload.totalReturnedAmount = totalReturnedAmount;
  } else {
    delete nextPayload.returned_items;
    delete nextPayload.total_returned_amount;
    delete nextPayload.totalReturnedAmount;
  }

  // Persist both snake_case and camelCase variants if the original payload relied on them.
  if ("subtotal" in normalizedPayload || !("sub_total" in normalizedPayload)) {
    nextPayload.subtotal = subtotal;
  }
  if ("sub_total" in normalizedPayload) {
    nextPayload.sub_total = subtotal;
  }

  if ("tax_amount" in normalizedPayload || !("taxAmount" in normalizedPayload)) {
    nextPayload.tax_amount = taxAmount;
  }
  if ("taxAmount" in normalizedPayload) {
    nextPayload.taxAmount = taxAmount;
  }

  if ("total_amount" in normalizedPayload || !("totalAmount" in normalizedPayload)) {
    nextPayload.total_amount = totalAmount;
  }
  if ("totalAmount" in normalizedPayload) {
    nextPayload.totalAmount = totalAmount;
  }

  if (declaredTaxRate !== null) {
    if ("tax_rate" in normalizedPayload || !("taxRate" in normalizedPayload)) {
      nextPayload.tax_rate = declaredTaxRate;
    }
    if ("taxRate" in normalizedPayload) {
      nextPayload.taxRate = declaredTaxRate;
    }
  }

  return {
    payload: nextPayload,
    subtotal,
    taxAmount,
    totalAmount,
    remainingAmount,
    totalReturnedAmount
  };
}

function buildDbPayloadFromRecord(record: ReturnRecord): Partial<ReturnsManagement> {
  const itemsPayload =
    record.items?.length > 0
      ? record.items.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total,
          originalQuantity: item.originalQuantity ?? null
        }))
      : [];

  const metadata: ReturnMetadata = {
    isManual: record.isManual ?? false,
    manualReference: record.manualReference ?? undefined,
    manualDate: record.manualDate ?? undefined,
    manualSupplierId: record.manualSupplierId ?? null,
    sourceType: record.type,
    expenseReference:
      record.type === "expense"
        ? record.manualReference ?? record.expenseNumber ?? undefined
        : undefined
  };

  const hasMetadata =
    metadata.isManual ||
    Boolean(metadata.manualReference) ||
    Boolean(metadata.manualDate) ||
    Boolean(metadata.manualSupplierId) ||
    Boolean(metadata.expenseReference);

  const returnItems =
    itemsPayload.length > 0 || record.notes || hasMetadata
      ? {
          items: itemsPayload,
          notes: record.notes ?? null,
          metadata
        }
      : null;

  return {
    return_id: record.id,
    return_type: toDbReturnType(record.type),
    return_reason: record.reason,
    return_status: toDbStatus(record.status),
    return_items: returnItems,
    refund_amount: record.baseAmount,
    total_return_amount: record.totalAmount,
    affects_inventory: record.type === "purchase",
    purchase_id: record.type === "purchase" ? record.purchaseId ?? null : null,
    expense_id: record.type === "expense" ? record.expenseId ?? null : null,
    supplier_id: record.type === "purchase" ? record.supplierId ?? null : null
  };
}

function mapRowToRecord(
  row: ReturnsManagement,
  supplierMap: Map<string, Suppliers>,
  purchaseMap: Map<string, PurchaseOrders>,
  expenseMap: Map<string, ExpenseRow>
): ReturnRecord {
  const supplier = row.supplier_id ? supplierMap.get(row.supplier_id) : undefined;
  const purchase = row.purchase_id ? purchaseMap.get(row.purchase_id) : undefined;
  const expense = row.expense_id ? expenseMap.get(row.expense_id) : undefined;
  const { items, notes, metadata } = parseReturnPayload(row.return_items);
  const manualSupplier =
    metadata?.manualSupplierId ? supplierMap.get(metadata.manualSupplierId) : undefined;
  const resolvedSupplier = manualSupplier ?? supplier;
  const supplierName =
    resolvedSupplier?.supplier_en_name ?? resolvedSupplier?.supplier_ar_name ?? undefined;
  const baseAmount = Number(row.refund_amount ?? row.total_return_amount ?? 0);
  const taxAmount = Number(row.total_return_amount ?? 0) - Number(row.refund_amount ?? 0);
  const type = fromDbReturnType(row.return_type) ?? (metadata?.sourceType ?? "purchase");
  const manualReference =
    metadata?.manualReference ?? metadata?.expenseReference ?? undefined;
  const purchaseIdentifier = formatPurchaseIdentifier(purchase, row.purchase_id);
  const expenseIdentifier =
    metadata?.expenseReference ??
    formatExpenseIdentifier(expense, row.expense_id ?? undefined);
  const supplierIdValue =
    metadata?.manualSupplierId ?? row.supplier_id ?? undefined;
  const searchTokens = buildSearchTokens(
    row.return_id,
    purchaseIdentifier,
    manualReference,
    supplierName,
    expenseIdentifier,
    metadata?.expenseReference,
    row.return_reason
  );
  return {
    id: row.return_id,
    createdAt: row.created_at,
    type,
    status: titleCaseStatus(row.return_status),
    reason: row.return_reason ?? "",
    notes: notes ?? undefined,
    supplierId: supplierIdValue ?? undefined,
    supplierName,
    purchaseId: row.purchase_id ?? undefined,
    purchaseNumber: purchaseIdentifier ?? undefined,
    purchaseDate: purchase?.purchase_date ?? undefined,
    expenseId: row.expense_id ?? undefined,
    expenseNumber: expenseIdentifier ?? undefined,
    expenseDate: expense?.expense_date ?? metadata?.manualDate ?? undefined,
    manualReference,
    manualDate: metadata?.manualDate ?? undefined,
    manualSupplierId: metadata?.manualSupplierId ?? null,
    isManual: metadata?.isManual ?? false,
    totalAmount: Number(row.total_return_amount ?? 0),
    baseAmount: Math.max(baseAmount, 0),
    taxAmount: Math.max(taxAmount, 0),
    remainingAmount: Math.max(Number(row.remaining_amount ?? row.total_return_amount ?? 0), 0),
    items,
    searchTokens
  };
}

interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
  searchValue?: string;
  keywords?: string[];
  meta?: Record<string, unknown>;
}

function RecordCombobox({
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={disabled}
            className="w-full justify-between"
          >
            {selected ? selected.label : placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[var(--radix-popover-trigger-width)] min-w-[280px]">
          <Command>
            <CommandInput placeholder="Search..." />
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.searchValue ?? option.value}
                  keywords={option.keywords}
                  onSelect={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className="flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2">
                    <Check
                      className={`h-4 w-4 ${option.value === value ? "opacity-100" : "opacity-0"}`}
                    />
                    <span>{option.label}</span>
                  </div>
                  {option.description && (
                    <span className="text-xs text-muted-foreground">{option.description}</span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function Returns() {
  const dispatch = useAppDispatch();

  const returnRows = useAppSelector(selectors.returns_management.selectAll) as ReturnsManagement[];
  const returnsLoading = useAppSelector(selectors.returns_management.selectLoading);
  const returnsError = useAppSelector(selectors.returns_management.selectError);

  const purchaseOrders = useAppSelector(selectors.purchase_orders.selectAll) as PurchaseOrders[];
  const purchaseLoading = useAppSelector(selectors.purchase_orders.selectLoading);
  const purchaseError = useAppSelector(selectors.purchase_orders.selectError);

  const expenses = useAppSelector(selectors.expenses.selectAll) as ExpenseRow[];
  const expensesLoading = useAppSelector(selectors.expenses.selectLoading);
  const expensesError = useAppSelector(selectors.expenses.selectError);

  const suppliers = useAppSelector(selectors.suppliers.selectAll) as Suppliers[];
  const suppliersLoading = useAppSelector(selectors.suppliers.selectLoading);
  const suppliersError = useAppSelector(selectors.suppliers.selectError);

  useEffect(() => {
    dispatch(thunks.returns_management.fetchAll(undefined));
    dispatch(thunks.purchase_orders.fetchAll(undefined));
    dispatch(thunks.expenses.fetchAll(undefined));
    dispatch(thunks.suppliers.fetchAll(undefined));
  }, [dispatch]);

  const supplierMap = useMemo(() => {
    return new Map(suppliers.map((supplier) => [supplier.supplier_id, supplier]));
  }, [suppliers]);

  const purchaseMap = useMemo(() => {
    return new Map(purchaseOrders.map((purchase) => [purchase.purchase_id, purchase]));
  }, [purchaseOrders]);

  const expenseMap = useMemo(() => {
    return new Map(expenses.map((expense) => [expense.expense_id, expense]));
  }, [expenses]);

const supplierOptions = useMemo<ComboboxOption[]>(() => {
  return suppliers.map((supplier) => ({
    value: supplier.supplier_id,
    label: supplier.supplier_en_name ?? supplier.supplier_ar_name ?? supplier.supplier_id,
    description: supplier.supplier_city ?? undefined,
    searchValue: [
      supplier.supplier_id,
      supplier.supplier_en_name,
      supplier.supplier_ar_name,
      supplier.supplier_city
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase(),
    keywords: [
      supplier.supplier_id,
      supplier.supplier_en_name ?? "",
      supplier.supplier_ar_name ?? "",
      supplier.supplier_city ?? ""
    ]
  }));
}, [suppliers]);

  const returns = useMemo<ReturnRecord[]>(() => {
    return returnRows.map((row) => mapRowToRecord(row, supplierMap, purchaseMap, expenseMap));
  }, [returnRows, supplierMap, purchaseMap, expenseMap]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingReturn, setEditingReturn] = useState<ReturnRecord | null>(null);
  const [viewReturn, setViewReturn] = useState<ReturnRecord | null>(null);

  const [formType, setFormType] = useState<ReturnType>("purchase");
  const [formPurchaseId, setFormPurchaseId] = useState<string>("");
  const [formExpenseId, setFormExpenseId] = useState<string>("");
  const [formReason, setFormReason] = useState<string>("");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formItems, setFormItems] = useState<FormItemState[]>([]);
  const [formAmount, setFormAmount] = useState<string>("0");
  const [formTaxAmount, setFormTaxAmount] = useState<string>("0");
  const [formStatus, setFormStatus] = useState<ReturnStatus>("Pending");
const [useManualReference, setUseManualReference] = useState(false);
const [manualReference, setManualReference] = useState("");
const [manualDate, setManualDate] = useState(() => new Date().toISOString().split("T")[0]);
const [manualSupplierId, setManualSupplierId] = useState("");

  const resetForm = () => {
    setFormType("purchase");
    setFormPurchaseId("");
    setFormExpenseId("");
    setFormReason("");
    setFormNotes("");
    setFormItems([]);
    setFormAmount("0");
    setFormTaxAmount("0");
    setFormStatus("Pending");
    setEditingReturn(null);
  setUseManualReference(false);
  setManualReference("");
  setManualDate(new Date().toISOString().split("T")[0]);
  setManualSupplierId("");
  };

  const startCreate = () => {
    resetForm();
    setFormMode("create");
    setIsDialogOpen(true);
  };

  const startEdit = (record: ReturnRecord) => {
    setEditingReturn(record);
    setFormMode("edit");
    setFormType(record.type);
    const manual = record.isManual || (!record.purchaseId && !!record.manualReference);
    setUseManualReference(Boolean(manual));
    setManualReference(record.manualReference ?? "");
    setManualDate(record.manualDate ?? new Date().toISOString().split("T")[0]);
    setManualSupplierId(record.manualSupplierId ?? "");
    setFormPurchaseId(manual ? "" : record.purchaseId ?? "");
    setFormExpenseId(manual ? "" : record.expenseId ?? "");
    setFormReason(record.reason ?? "");
    setFormNotes(record.notes ?? "");
    setFormItems(
      record.items.map((item) => ({
        id: item.id ?? createId(),
        description: item.description,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        originalQuantity: item.originalQuantity ?? null,
        sourceItemId: item.id ? String(item.id) : undefined
      }))
    );
    setFormAmount(record.baseAmount.toString());
    setFormTaxAmount(record.taxAmount.toString());
    setFormStatus(record.status);
    setIsDialogOpen(true);
  };

  const filteredReturns = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(searchQuery);
    return returns.filter((record) => {
      const matchesSearch =
        normalizedQuery.length === 0 ||
        record.searchTokens.some((token) => token.includes(normalizedQuery));
      const matchesType = filterType === "all" || record.type === filterType;
      const matchesStatus =
        filterStatus === "all" ||
        record.status.toLowerCase() === filterStatus.toLowerCase();
    return matchesSearch && matchesType && matchesStatus;
  });
  }, [returns, searchQuery, filterType, filterStatus]);

  const totalReturns = returns.length;
  const pendingReturns = returns.filter((ret) => ret.status === "Pending").length;
  const approvedReturns = returns.filter(
    (ret) => ret.status === "Approved" || ret.status === "Completed"
  ).length;
  const totalReturnAmount = returns.reduce((sum, ret) => sum + ret.totalAmount, 0);

  const purchaseOptions: ComboboxOption[] = useMemo(() => {
    return purchaseOrders.map((purchase) => {
      const supplier = supplierMap.get(purchase.supplier_id);
      const identifier = formatPurchaseIdentifier(purchase, purchase.purchase_id);
      const descriptionParts = [
        supplier?.supplier_en_name ?? supplier?.supplier_ar_name ?? undefined,
        purchase.purchase_date
          ? new Date(purchase.purchase_date).toLocaleDateString("en-GB")
          : undefined
      ].filter(Boolean);
      return {
        value: purchase.purchase_id,
        label: identifier ?? purchase.purchase_id,
        description: descriptionParts.join(" • ") || undefined,
        meta: {
          supplierId: purchase.supplier_id,
          identifier
        },
        searchValue: [
          purchase.purchase_id,
          identifier,
          purchase.purchase_invoice_number,
          supplier?.supplier_en_name,
          supplier?.supplier_ar_name,
          purchase.reference_number,
          purchase.purchase_order_items?.purchase_number
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        keywords: [
          purchase.purchase_id,
          identifier ?? "",
          purchase.purchase_invoice_number ?? "",
          supplier?.supplier_en_name ?? "",
          supplier?.supplier_ar_name ?? "",
          purchase.reference_number ?? ""
        ]
      };
    });
  }, [purchaseOrders, supplierMap]);

  const expenseOptions: ComboboxOption[] = useMemo(() => {
    return expenses.map((expense) => {
      const identifier = formatExpenseIdentifier(expense, expense.expense_id);
      const extraParts = [
        expense.paid_to ?? undefined,
        expense.expense_date
          ? new Date(expense.expense_date).toLocaleDateString("en-GB")
          : undefined
      ].filter(Boolean);
      return {
        value: expense.expense_id,
        label: identifier ?? expense.expense_id,
        description: extraParts.join(" • ") || undefined,
        meta: { identifier },
        searchValue: [
          expense.expense_id,
          identifier,
          expense.receipt_number,
          expense.paid_to,
          expense.description
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase(),
        keywords: [
          expense.expense_id,
          identifier ?? "",
          expense.receipt_number ?? "",
          expense.paid_to ?? "",
          expense.description ?? ""
        ]
      };
    });
  }, [expenses]);

  const selectedPurchase = useMemo(() => {
    if (formType !== "purchase" || useManualReference) return undefined;
    if (!formPurchaseId) return undefined;
    return purchaseMap.get(formPurchaseId);
  }, [formType, useManualReference, formPurchaseId, purchaseMap]);

  const selectedPurchaseReturnSummaryMap = useMemo(() => {
    if (!selectedPurchase) return new Map<string, PurchaseReturnedItemSummary>();
    const relatedRows = returnRows.filter((row) => row.purchase_id === selectedPurchase.purchase_id);
    const filteredRows =
      formMode === "edit" && editingReturn
        ? relatedRows.filter((row) => row.return_id !== editingReturn.id)
        : relatedRows;
    if (filteredRows.length === 0) {
      return new Map<string, PurchaseReturnedItemSummary>();
    }
    const records = filteredRows.map((row) =>
      mapRowToRecord(row, supplierMap, purchaseMap, expenseMap)
    );
    const completedRecords = records.filter((record) => record.status === "Completed");
    const summaries = buildReturnedItemSummaries(completedRecords);
    return new Map<string, PurchaseReturnedItemSummary>(
      summaries.map((summary) => [summary.sourceItemId, summary])
    );
  }, [
    selectedPurchase,
    returnRows,
    formMode,
    editingReturn,
    supplierMap,
    purchaseMap,
    expenseMap
  ]);

  const selectedPurchaseSupplier = useMemo(() => {
    if (!selectedPurchase) return undefined;
    return supplierMap.get(selectedPurchase.supplier_id);
  }, [selectedPurchase, supplierMap]);

  const selectedPurchaseItems = useMemo(() => {
    if (!selectedPurchase) return [];
    return parsePurchaseOrderItems(
      selectedPurchase.purchase_order_items,
      selectedPurchase.purchase_id,
      selectedPurchaseReturnSummaryMap
    );
  }, [selectedPurchase, selectedPurchaseReturnSummaryMap]);

  const selectedPurchaseTotals = useMemo(() => {
    if (!selectedPurchase) {
      return { subtotal: 0, paid: 0, remaining: 0, total: 0, tax: 0 };
    }
    const payload = normalizePurchaseOrderItemsPayload(
      selectedPurchase.purchase_order_items
    ) as Record<string, unknown>;
    const subtotalFallback = selectedPurchaseItems.reduce((sum, item) => sum + item.total, 0);
    const subtotal = roundTo(
      toFiniteNumber(firstAvailable(payload, ["subtotal", "sub_total"]), subtotalFallback)
    );
    const taxAmount = roundTo(
      toFiniteNumber(firstAvailable(payload, ["tax_amount", "taxAmount"]), 0)
    );
    const total = roundTo(
      toFiniteNumber(firstAvailable(payload, ["total_amount", "totalAmount"]), subtotal + taxAmount)
    );
    const paid = roundTo(Number(selectedPurchase.purchase_paid_amount ?? 0));
    const remaining =
      selectedPurchase.purchase_remaining_amount !== undefined &&
      selectedPurchase.purchase_remaining_amount !== null
        ? roundTo(Number(selectedPurchase.purchase_remaining_amount))
        : Math.max(0, roundTo(total - paid));
    return {
      subtotal,
      paid,
      remaining,
      total,
      tax: taxAmount
    };
  }, [selectedPurchase, selectedPurchaseItems]);

  const selectedExpense = useMemo(() => {
    if (formType !== "expense" || useManualReference) return undefined;
    if (!formExpenseId) return undefined;
    return expenseMap.get(formExpenseId);
  }, [formType, useManualReference, formExpenseId, expenseMap]);

  const selectedExpenseTotals = useMemo(() => {
    if (!selectedExpense) {
      return {
        base: 0,
        tax: 0,
        total: 0,
        paid: 0,
        remaining: 0
      };
    }
    const base = Number(selectedExpense.base_amount ?? 0);
    const tax = Number(selectedExpense.tax_amount ?? 0);
    const total = Number(selectedExpense.total_amount ?? base + tax);
    const paid = Number(selectedExpense.paid_amount ?? 0);
    const remaining =
      selectedExpense.remaining_amount !== undefined && selectedExpense.remaining_amount !== null
        ? Number(selectedExpense.remaining_amount)
        : Math.max(0, total - paid);
    return { base, tax, total, paid, remaining };
  }, [selectedExpense]);

  const purchaseLinkedItems = useMemo(
    () => formItems.filter((item) => item.sourceItemId),
    [formItems]
  );

  const purchaseLinkedItemMap = useMemo(() => {
    const map = new Map<string, FormItemState>();
    purchaseLinkedItems.forEach((item) => {
      if (item.sourceItemId) {
        map.set(item.sourceItemId, item);
      }
    });
    return map;
  }, [purchaseLinkedItems]);

  const allPurchaseItemsSelected =
    selectedPurchaseItems.length > 0 &&
    selectedPurchaseItems.every((item) => purchaseLinkedItemMap.has(String(item.id)));

  const somePurchaseItemsSelected =
    selectedPurchaseItems.length > 0 &&
    selectedPurchaseItems.some((item) => purchaseLinkedItemMap.has(String(item.id)));

  const manualFormItems = useMemo(
    () => formItems.filter((item) => !item.sourceItemId),
    [formItems]
  );

  const syncPurchaseOrderReturns = useCallback(
    async (purchaseId: string, rowsSnapshot: ReturnsManagement[]) => {
      if (!purchaseId) return;
      const purchase = purchaseMap.get(purchaseId);
      if (!purchase) return;
      const relatedRecords = rowsSnapshot
        .filter((row) => row.purchase_id === purchaseId)
        .map((row) => mapRowToRecord(row, supplierMap, purchaseMap, expenseMap));
      const completedRecords = relatedRecords.filter((record) => record.status === "Completed");
      const adjustment = buildPurchaseOrderAdjustment(purchase, completedRecords);
      if (!adjustment) {
        return;
      }
      try {
        await dispatch(
          thunks.purchase_orders.updateOne({
            id: purchaseId,
            values: {
              purchase_order_items: adjustment.payload,
              purchase_remaining_amount: adjustment.remainingAmount,
              purchase_paid_amount: purchase.purchase_paid_amount
            }
          })
        ).unwrap();
      } catch (error: any) {
        toast.error(error?.message ?? "Failed to sync purchase order return items");
        throw error;
      }
    },
    [dispatch, purchaseMap, supplierMap, expenseMap]
  );

  const totals = useMemo(() => {
    const itemsSubtotal = formItems.reduce((sum, item) => {
      const quantity = parseFloat(item.quantity || "0");
      const unitPrice = parseFloat(item.unitPrice || "0");
      return sum + quantity * unitPrice;
    }, 0);
    const manualAmount = parseFloat(formAmount || "0");
    const baseAmount =
      formType === "purchase" ? (itemsSubtotal > 0 ? itemsSubtotal : manualAmount) : manualAmount;
    const taxAmount = parseFloat(formTaxAmount || "0");
    const total = baseAmount + taxAmount;
    return { baseAmount, taxAmount, total };
  }, [formItems, formAmount, formTaxAmount, formType]);

  useEffect(() => {
    if (formType !== "purchase" || useManualReference) return;
    setFormItems((prev) => prev.filter((item) => !item.sourceItemId));
  }, [formPurchaseId, formType, useManualReference]);

  const handleTogglePurchaseItem = (purchaseItem: PurchaseOrderItemInfo, nextValue: boolean | "indeterminate") => {
    const sourceId = String(purchaseItem.id);
    const availableQuantity = Math.max(0, purchaseItem.remainingQuantity ?? purchaseItem.quantity ?? 0);
    setFormItems((prev) => {
      const existingIndex = prev.findIndex((item) => item.sourceItemId === sourceId);
      if (nextValue === true) {
        if (availableQuantity <= 0) {
          toast.error("All quantities for this item have already been returned.");
          return prev;
        }
        if (existingIndex >= 0) {
          return prev;
        }
        const nextItem: FormItemState = {
          id: `po-${sourceId}`,
          sourceItemId: sourceId,
          description: purchaseItem.description,
          quantity: availableQuantity.toString(),
          unitPrice: purchaseItem.unitPrice.toString(),
          originalQuantity: availableQuantity
        };
        return [...prev, nextItem];
      }
      if (existingIndex === -1) return prev;
      const next = [...prev];
      next.splice(existingIndex, 1);
      return next;
    });
  };

  const handlePurchaseItemQuantityChange = (
    sourceId: string,
    field: "quantity" | "unitPrice",
    value: string
  ) => {
    setFormItems((prev) =>
      prev.map((item) => {
        if (item.sourceItemId !== sourceId) return item;
        if (field === "quantity") {
          if (value === "") {
            return { ...item, quantity: "" };
          }
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) {
            return item;
          }
          const max = item.originalQuantity ?? parsed;
          const clamped = Math.max(0, Math.min(parsed, max));
          return { ...item, quantity: clamped.toString() };
        }
        if (field === "unitPrice") {
          if (value === "") {
            return { ...item, unitPrice: "" };
          }
          const parsed = Number(value);
          if (!Number.isFinite(parsed)) {
            return item;
          }
          const normalized = Math.max(0, parsed);
          return { ...item, unitPrice: normalized.toString() };
        }
        return { ...item, [field]: value };
      })
    );
  };

  const handleToggleAllPurchaseItems = useCallback(
    (shouldSelect: boolean) => {
      if (!selectedPurchaseItems.length) return;
      setFormItems((prev) => {
        const manualItems = prev.filter((item) => !item.sourceItemId);
        if (!shouldSelect) {
          return manualItems;
        }
        const existingBySource = new Map<string, FormItemState>();
        prev.forEach((item) => {
          if (item.sourceItemId) {
            existingBySource.set(item.sourceItemId, item);
          }
        });
        const purchaseItems: FormItemState[] = [];
        selectedPurchaseItems.forEach((purchaseItem, index) => {
          const sourceId = String(purchaseItem.id);
          const availableQuantity = Math.max(
            0,
            purchaseItem.remainingQuantity ?? purchaseItem.quantity ?? 0
          );
          if (availableQuantity <= 0) {
            return;
          }
          const existing = existingBySource.get(sourceId);
          if (existing) {
            purchaseItems.push(existing);
            return;
          }
          purchaseItems.push({
            id: `po-${sourceId}-${index}`,
            sourceItemId: sourceId,
            description: purchaseItem.description,
            quantity: availableQuantity.toString(),
            unitPrice: purchaseItem.unitPrice.toString(),
            originalQuantity: availableQuantity
          });
        });
        return [...manualItems, ...purchaseItems];
      });
    },
    [selectedPurchaseItems]
  );

  const handleAddItemRow = () => {
    setFormItems((prev) => [...prev, createEmptyItem()]);
  };

  const updateItemRow = (id: string, field: keyof FormItemState, value: string) => {
    setFormItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const removeItemRow = (id: string) => {
    setFormItems((prev) => prev.filter((item) => item.id !== id));
  };

  const adjustSupplierBalance = async (
    supplierId: string,
    delta: number,
    options?: { silent?: boolean }
  ) => {
    if (!delta) return;
    const supplier = supplierMap.get(supplierId);
    const currentBalance = Number(supplier?.supplier_balance ?? 0);
    const nextBalance = Number((currentBalance + delta).toFixed(2));
    try {
      await dispatch(
        thunks.suppliers.updateOne({
          id: supplierId,
          values: { supplier_balance: nextBalance }
        })
      ).unwrap();
    } catch (error: any) {
      if (!options?.silent) {
        toast.error(error?.message ?? "Failed to update supplier balance");
      }
      throw error;
    }
  };

  const handleSaveReturn = async () => {
    if (formType === "purchase") {
      if (useManualReference) {
        if (!manualReference.trim()) {
          toast.error("Please enter the supplier invoice number");
      return;
    }
        if (!manualSupplierId) {
          toast.error("Please select the supplier for this return");
      return;
    }
      } else if (!formPurchaseId) {
        toast.error("Please select a purchase order");
      return;
    }
    } else {
      if (useManualReference) {
        if (!manualReference.trim()) {
          toast.error("Please enter the expense reference number");
          return;
        }
      } else if (!formExpenseId) {
        toast.error("Please select an expense");
        return;
      }
    }
    if (!formReason) {
      toast.error("Please select a reason");
      return;
    }
    const baseAmount = totals.baseAmount;
    const totalAmount = totals.total;
    if (totalAmount <= 0) {
      toast.error("Return amount must be greater than zero");
      return;
    }
    const purchase =
      formType === "purchase" && !useManualReference && formPurchaseId
        ? purchaseMap.get(formPurchaseId)
        : undefined;
    const expense =
      formType === "expense" && !useManualReference && formExpenseId
        ? expenseMap.get(formExpenseId)
        : undefined;
    const supplierId =
      formType === "purchase"
        ? useManualReference
          ? manualSupplierId || undefined
          : purchase?.supplier_id
        : undefined;
    const itemsPayload =
      formItems.length > 0
        ? formItems.map((item) => ({
            id: item.sourceItemId ?? item.id,
            description: item.description,
            quantity: parseFloat(item.quantity || "0"),
            unitPrice: parseFloat(item.unitPrice || "0"),
            total: parseFloat(item.quantity || "0") * parseFloat(item.unitPrice || "0"),
            originalQuantity: item.originalQuantity ?? null
          }))
        : [];
    const metadata: ReturnMetadata = {
      isManual: useManualReference,
      sourceType: formType
    };
    if (useManualReference) {
      metadata.manualReference = manualReference.trim();
      metadata.manualDate = manualDate;
      if (formType === "purchase") {
        metadata.manualSupplierId = manualSupplierId || null;
      } else {
        metadata.expenseReference = manualReference.trim();
      }
    } else if (formType === "expense") {
      metadata.expenseReference = expense?.receipt_number ?? expense?.expense_id ?? undefined;
    }
    const hasMetadata =
      metadata.isManual ||
      Boolean(metadata.manualReference) ||
      Boolean(metadata.manualDate) ||
      Boolean(metadata.manualSupplierId) ||
      Boolean(metadata.expenseReference);
    const payloadReturnItems =
      itemsPayload.length > 0 || formNotes || hasMetadata
        ? {
            items: itemsPayload,
            notes: formNotes || null,
            metadata
          }
        : null;

    const payload: Partial<ReturnsManagement> = {
      return_type: toDbReturnType(formType),
      return_reason: formReason,
      return_status: toDbStatus(formStatus),
      return_items: payloadReturnItems,
      refund_amount: baseAmount,
      total_return_amount: totalAmount,
      affects_inventory: formType === "purchase"
    };
    if (formType === "purchase") {
      payload.purchase_id = useManualReference ? null : formPurchaseId || null;
      payload.expense_id = null;
      payload.supplier_id = supplierId ?? null;
    } else {
      payload.purchase_id = null;
      payload.expense_id = useManualReference ? null : formExpenseId || null;
      payload.supplier_id = null;
    }
    const isPurchaseReturn = formType === "purchase";
    const currentPurchaseId =
      isPurchaseReturn && !useManualReference ? formPurchaseId ?? null : null;
    const previousPurchaseId =
      formMode === "edit" && editingReturn && editingReturn.type === "purchase"
        ? editingReturn.purchaseId ?? null
        : null;

    const purchaseSnapshots = new Map<
      string,
      { items: any; remaining: number; paid: number }
    >();
    const captureSnapshot = (purchaseId: string | null) => {
      if (!purchaseId) return;
      if (purchaseSnapshots.has(purchaseId)) return;
      const purchaseRow = purchaseMap.get(purchaseId);
      if (!purchaseRow) return;
      purchaseSnapshots.set(purchaseId, {
        items: deepClone(purchaseRow.purchase_order_items),
        remaining: Number(purchaseRow.purchase_remaining_amount ?? 0),
        paid: Number(purchaseRow.purchase_paid_amount ?? 0)
      });
    };

    captureSnapshot(currentPurchaseId);
    captureSnapshot(previousPurchaseId);

    const supplierAdjustmentPlan: Array<{ supplierId: string; delta: number }> = [];
    if (formMode === "create") {
      if (isPurchaseReturn && supplierId && totalAmount) {
        supplierAdjustmentPlan.push({ supplierId, delta: totalAmount });
      }
    } else if (editingReturn) {
      const previousSupplierId =
        editingReturn.type === "purchase" ? editingReturn.supplierId ?? undefined : undefined;
      const previousTotal = editingReturn.totalAmount ?? 0;
      if (previousSupplierId && previousTotal) {
        supplierAdjustmentPlan.push({ supplierId: previousSupplierId, delta: -previousTotal });
      }
      if (isPurchaseReturn && supplierId && totalAmount) {
        supplierAdjustmentPlan.push({ supplierId, delta: totalAmount });
      }
    }

    const appliedSupplierAdjustments: Array<{ supplierId: string; delta: number }> = [];
    const syncedPurchaseIds: string[] = [];
    let persistedRow: ReturnsManagement | null = null;

    try {
      if (formMode === "create") {
        persistedRow = await dispatch(thunks.returns_management.createOne(payload)).unwrap();
      } else if (editingReturn) {
        const updatePayload: Partial<ReturnsManagement> = {
          ...payload,
          return_id: editingReturn.id
        };
        persistedRow = await dispatch(
          thunks.returns_management.updateOne({
            id: editingReturn.id,
            values: updatePayload
          })
        ).unwrap();
      }

      for (const adjustment of supplierAdjustmentPlan) {
        if (!adjustment.supplierId || !adjustment.delta) continue;
        await adjustSupplierBalance(adjustment.supplierId, adjustment.delta);
        appliedSupplierAdjustments.push(adjustment);
      }

      if (isPurchaseReturn && persistedRow) {
        if (formMode === "create" && currentPurchaseId) {
          const nextRows = [...returnRows, persistedRow];
          await syncPurchaseOrderReturns(currentPurchaseId, nextRows);
          syncedPurchaseIds.push(currentPurchaseId);
        } else if (formMode === "edit" && editingReturn) {
          const updatedRows = returnRows.map((row) =>
            row.return_id === persistedRow!.return_id ? persistedRow! : row
          );
          if (previousPurchaseId && previousPurchaseId !== currentPurchaseId) {
            const rowsWithoutCurrent = returnRows.filter(
              (row) => row.return_id !== editingReturn.id
            );
            await syncPurchaseOrderReturns(previousPurchaseId, rowsWithoutCurrent);
            syncedPurchaseIds.push(previousPurchaseId);
          } else if (previousPurchaseId && !currentPurchaseId) {
            const rowsWithoutCurrent = returnRows.filter(
              (row) => row.return_id !== editingReturn.id
            );
            await syncPurchaseOrderReturns(previousPurchaseId, rowsWithoutCurrent);
            syncedPurchaseIds.push(previousPurchaseId);
          }
          if (currentPurchaseId) {
            await syncPurchaseOrderReturns(currentPurchaseId, updatedRows);
            syncedPurchaseIds.push(currentPurchaseId);
          }
        }
      }

      toast.success(formMode === "create" ? "Return created successfully" : "Return updated successfully");
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      if (formMode === "create" && persistedRow) {
        try {
          await dispatch(thunks.returns_management.deleteOne(persistedRow.return_id)).unwrap();
        } catch {
          /* ignore rollback failure */
        }
      } else if (formMode === "edit" && editingReturn) {
        try {
          const revertPayload = buildDbPayloadFromRecord(editingReturn);
          await dispatch(
            thunks.returns_management.updateOne({
              id: editingReturn.id,
              values: revertPayload
            })
          ).unwrap();
        } catch {
          /* ignore rollback failure */
        }
      }

      for (let index = appliedSupplierAdjustments.length - 1; index >= 0; index--) {
        const adjustment = appliedSupplierAdjustments[index];
        try {
          await adjustSupplierBalance(adjustment.supplierId, -adjustment.delta, { silent: true });
        } catch {
          /* ignore rollback failure */
        }
      }

      for (const purchaseId of new Set(syncedPurchaseIds)) {
        const snapshot = purchaseSnapshots.get(purchaseId);
        if (!snapshot) continue;
        try {
          await dispatch(
            thunks.purchase_orders.updateOne({
              id: purchaseId,
              values: {
                purchase_order_items: snapshot.items,
                purchase_remaining_amount: snapshot.remaining,
                purchase_paid_amount: snapshot.paid
              }
            })
          ).unwrap();
        } catch {
          /* ignore rollback failure */
        }
      }

      toast.error(error?.message ?? "Failed to save return");
      return;
    }
  };

  const handleDeleteReturn = async (record: ReturnRecord) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this return?");
    if (!confirmDelete) return;
    try {
      await dispatch(thunks.returns_management.deleteOne(record.id)).unwrap();
      if (record.type === "purchase" && record.supplierId) {
        await adjustSupplierBalance(record.supplierId, -record.totalAmount);
      }
      if (record.type === "purchase" && record.purchaseId) {
        const nextRows = returnRows.filter((row) => row.return_id !== record.id);
        await syncPurchaseOrderReturns(record.purchaseId, nextRows);
      }
      toast.success("Return deleted successfully");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete return");
    }
  };

  const handleStatusChange = async (record: ReturnRecord, nextStatus: ReturnStatus) => {
    let updatedRow: ReturnsManagement | null = null;

    try {
      updatedRow = await dispatch(
        thunks.returns_management.updateOne({
          id: record.id,
          values: {
            return_status: toDbStatus(nextStatus)
          }
        })
      ).unwrap();

      if (record.type === "purchase" && record.purchaseId) {
        const snapshot = returnRows.map((row) =>
          row.return_id === record.id && updatedRow ? updatedRow : row
        );
        await syncPurchaseOrderReturns(record.purchaseId, snapshot);
      }

      toast.success(`Return marked as ${nextStatus}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update status");
    }
  };

  const statusBadge = (status: ReturnStatus) => {
    const map: Record<ReturnStatus, { variant: "default" | "secondary" | "destructive"; icon: any }> = {
      Pending: { variant: "secondary", icon: AlertCircle },
      Approved: { variant: "default", icon: CheckCircle },
      Rejected: { variant: "destructive", icon: XCircle },
      Completed: { variant: "default", icon: CheckCircle }
    };
    const Icon = map[status].icon;
    return (
      <Badge variant={map[status].variant} className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {status}
      </Badge>
    );
  };

  const typeBadge = (type: ReturnType) => (
      <Badge variant={type === "purchase" ? "default" : "secondary"}>
        {type === "purchase" ? "Purchase" : "Expense"}
      </Badge>
    );

  const combinedLoading = returnsLoading || purchaseLoading || expensesLoading || suppliersLoading;
  const combinedErrors = [returnsError, purchaseError, expensesError, suppliersError].filter(Boolean);

  const exportToExcel = () => {
    try {
      const exportData = filteredReturns.map((record) => ({
        "Return ID": record.id,
        "Type": record.type === "purchase" ? "Purchase Return" : "Expense Return",
        "Status": record.status,
        "Reason": record.reason,
        "Supplier": record.supplierName || "",
        "Purchase Number": record.purchaseNumber || "",
        "Purchase Date": record.purchaseDate || "",
        "Expense Number": record.expenseNumber || "",
        "Expense Date": record.expenseDate || "",
        "Manual Reference": record.manualReference || "",
        "Manual Date": record.manualDate || "",
        "Base Amount (SAR)": record.baseAmount,
        "Tax Amount (SAR)": record.taxAmount,
        "Total Amount (SAR)": record.totalAmount,
        "Remaining Amount (SAR)": record.remainingAmount || record.totalAmount,
        "Items Count": record.items.length,
        "Items Details": record.items.map(i => `${i.description} (Qty: ${i.quantity}, Price: ${i.unitPrice})`).join("; "),
        "Notes": record.notes || "",
        "Created At": record.createdAt || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 15 }, { wch: 18 }, { wch: 12 }, { wch: 30 }, { wch: 25 },
        { wch: 18 }, { wch: 12 }, { wch: 18 }, { wch: 12 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 10 },
        { wch: 50 }, { wch: 30 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Returns");
      const fileName = `returns_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-purple-600 text-2xl font-semibold">Returns Management</h1>
          <p className="text-muted-foreground">
            Track and manage returns for purchase orders and expenses
          </p>
          {combinedLoading && <p className="text-xs text-muted-foreground mt-1">Syncing data…</p>}
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={startCreate} className="bg-purple-600 hover:bg-purple-700 gap-2">
            <Plus className="h-4 w-4" />
            New Return
          </Button>
        </div>
      </div>

      {combinedErrors.length > 0 && (
        <Alert variant="destructive">
                  <AlertDescription>
            {combinedErrors.map((error, index) => (
              <p key={index}>{error}</p>
            ))}
                  </AlertDescription>
                </Alert>
              )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-l-4 border-l-blue-500">
          <CardHeader className="pb-2">
            <CardDescription>Total Returns</CardDescription>
            <CardTitle className="text-purple-600">{totalReturns}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <RefreshCcw className="mr-2 h-4 w-4" />
              All return requests
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-yellow-500">
          <CardHeader className="pb-2">
            <CardDescription>Pending Returns</CardDescription>
            <CardTitle className="text-yellow-600">{pendingReturns}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <AlertCircle className="mr-2 h-4 w-4" />
              Awaiting approval
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500">
          <CardHeader className="pb-2">
            <CardDescription>Approved / Completed</CardDescription>
            <CardTitle className="text-green-600">{approvedReturns}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <CheckCircle className="mr-2 h-4 w-4" />
              Returns cleared
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-rose-500">
          <CardHeader className="pb-2">
            <CardDescription>Total Return Value</CardDescription>
            <CardTitle className="text-rose-600">SAR {formatCurrency(totalReturnAmount)}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center text-sm text-muted-foreground">
              <DollarSign className="mr-2 h-4 w-4" />
              Amount owed back to us
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Returns</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Search by code, number, supplier, or reason…"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full md:w-[170px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="purchase">Purchase</SelectItem>
                <SelectItem value="expense">Expense</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full md:w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {RETURN_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader className="bg-muted/40">
                <TableRow>
                  <TableHead>Return</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Related Document</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReturns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    <Undo2 className="h-12 w-12 mx-auto mb-3 opacity-20"  />
                      No returns found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredReturns.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="font-medium text-sm">
                            {record.id.slice(0, 8).toUpperCase()}
                          </span>
                          {record.createdAt && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(record.createdAt).toLocaleDateString("en-GB")}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{typeBadge(record.type)}</TableCell>
                      <TableCell>
                        <div className="flex flex-col text-sm">
                          <span className="font-medium">
                            {record.type === "purchase"
                              ? record.purchaseNumber ?? record.manualReference ?? "—"
                              : record.expenseNumber ?? record.manualReference ?? "—"}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {record.type === "purchase"
                              ? record.purchaseDate
                                ? new Date(record.purchaseDate).toLocaleDateString("en-GB")
                                : "—"
                              : record.expenseDate
                                ? new Date(record.expenseDate).toLocaleDateString("en-GB")
                                : "—"}
                          </span>
                          {record.manualReference && (
                            <span className="text-xs text-muted-foreground">
                              Ref: {record.manualReference}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{record.supplierName ?? "—"}</TableCell>
                      <TableCell className="text-right font-medium">
                        SAR {formatCurrency(record.totalAmount)}
                      </TableCell>
                      <TableCell>{statusBadge(record.status)}</TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setViewReturn(record);
                              setIsViewOpen(true);
                            }}
                            title="View details"
                          >
                            <Eye className="h-4 w-4 text-purple-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEdit(record)}
                            title="Edit"
                          >
                            <Edit className="h-4 w-4 text-purple-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteReturn(record)}
                            title="Delete"
                          >
                            <Trash2 className="h-4 w-4 text-rose-600" />
                          </Button>
                          {record.status === "Pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleStatusChange(record, "Approved")}
                                title="Approve"
                              >
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="outline"
                                size="icon"
                                onClick={() => handleStatusChange(record, "Rejected")}
                                title="Reject"
                              >
                                <XCircle className="h-4 w-4 text-red-600" />
                              </Button>
                            </>
                          )}
                          {record.status === "Approved" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleStatusChange(record, "Completed")}
                              title="Mark Completed"
                            >
                              Complete
                            </Button>
                          )}
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

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="w-full max-w-6xl sm:w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {formMode === "create" ? "Create Return" : "Update Return"}
            </DialogTitle>
            <DialogDescription>
              {formMode === "create"
                ? "Select a purchase order or expense to register a return."
                : "Modify the return details and adjust the owed balance if necessary."}
            </DialogDescription>
          </DialogHeader>

            <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Return Type</Label>
                <Select
                  value={formType}
                  onValueChange={(value: ReturnType) => {
                    setFormType(value);
                    setFormPurchaseId("");
                    setFormExpenseId("");
                    setFormItems([]);
                    setUseManualReference(false);
                    setManualReference("");
                    setManualSupplierId("");
                    setManualDate(new Date().toISOString().split("T")[0]);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="purchase">Purchase Order</SelectItem>
                    <SelectItem value="expense">Expense</SelectItem>
                  </SelectContent>
                </Select>
                </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={formStatus} onValueChange={(value: ReturnStatus) => setFormStatus(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RETURN_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        {status}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                </div>
                </div>

            <div className="rounded-lg border p-4 flex items-start justify-between">
              <div className="space-y-1">
                <Label className="font-medium">Manual reference</Label>
                <p className="text-xs text-muted-foreground">
                  Enable if the {formType === "purchase" ? "purchase order" : "expense"} is not
                  listed above.
                </p>
                </div>
              <Switch
                checked={useManualReference}
                onCheckedChange={(checked) => {
                  setUseManualReference(checked);
                  setFormPurchaseId("");
                  setFormExpenseId("");
                  if (!checked) {
                    setManualReference("");
                    setManualSupplierId("");
                    setManualDate(new Date().toISOString().split("T")[0]);
                  }
                }}
              />
              </div>

            {formType === "purchase" ? (
              useManualReference ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Invoice Number *</Label>
                      <Input
                        value={manualReference}
                        onChange={(event) => setManualReference(event.target.value)}
                        placeholder="Enter supplier invoice number"
                      />
                  </div>
                    <div className="space-y-2">
                      <Label>Invoice Date</Label>
                      <Input
                        type="date"
                        value={manualDate}
                        onChange={(event) => setManualDate(event.target.value)}
                      />
                  </div>
                  </div>
                  <RecordCombobox
                    label="Supplier *"
                    value={manualSupplierId}
                    onChange={setManualSupplierId}
                    options={supplierOptions}
                    placeholder="Select supplier"
                    disabled={supplierOptions.length === 0}
                  />
                  </div>
              ) : (
                <div className="space-y-4">
                  <RecordCombobox
                    label="Purchase Order"
                    value={formPurchaseId}
                    onChange={setFormPurchaseId}
                    options={purchaseOptions}
                    placeholder="Select purchase order"
                    disabled={purchaseOptions.length === 0}
                  />

                  {selectedPurchase && (
                    <div className="space-y-4">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base">Purchase Summary</CardTitle>
                          <CardDescription>
                            {formatPurchaseIdentifier(selectedPurchase, selectedPurchase.purchase_id)}
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                          <div>
                            <span className="text-muted-foreground block">Supplier</span>
                            <span className="font-medium">
                              {selectedPurchaseSupplier?.supplier_en_name ??
                                selectedPurchaseSupplier?.supplier_ar_name ??
                                "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Date</span>
                            <span>
                              {selectedPurchase.purchase_date
                                ? new Date(selectedPurchase.purchase_date).toLocaleDateString("en-GB")
                                : "—"}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Payment Status</span>
                            <span className="font-medium">
                              {(selectedPurchase.payment_status ?? "Unknown").toString()}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Items</span>
                            <span>{selectedPurchaseItems.length}</span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Subtotal</span>
                            <span className="font-medium text-purple-600">
                              SAR {formatCurrency(selectedPurchaseTotals.subtotal)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Paid</span>
                            <span className="font-medium text-green-600">
                              SAR {formatCurrency(selectedPurchaseTotals.paid)}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground block">Remaining</span>
                            <span className="font-medium text-rose-600">
                              SAR {formatCurrency(selectedPurchaseTotals.remaining)}
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="pb-3 space-y-2">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <CardTitle className="text-base">Select Items to Return</CardTitle>
                              <CardDescription>
                                Choose the specific lines you want to include in this return.
                              </CardDescription>
                            </div>
                            <div className="flex gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleAllPurchaseItems(true)}
                                disabled={selectedPurchaseItems.length === 0 || allPurchaseItemsSelected}
                              >
                                Select All
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => handleToggleAllPurchaseItems(false)}
                                disabled={!somePurchaseItemsSelected}
                              >
                                Clear
                              </Button>
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="p-0">
                          <Table>
                            <TableHeader className="bg-muted/40">
                              <TableRow>
                                <TableHead className="w-16 text-center">Return</TableHead>
                                <TableHead>Item</TableHead>
                                <TableHead className="text-center">Ordered / Remaining</TableHead>
                                <TableHead className="text-center w-32">Return Qty</TableHead>
                                <TableHead className="text-center w-32">Unit Price</TableHead>
                                <TableHead className="text-center w-28">Line Total</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {selectedPurchaseItems.length === 0 ? (
                                <TableRow>
                                  <TableCell
                                    colSpan={6}
                                    className="text-center text-muted-foreground py-6"
                                  >
                                    No items found for this purchase order.
                                  </TableCell>
                                </TableRow>
                              ) : (
                                selectedPurchaseItems.map((item) => {
                                  const sourceId = String(item.id);
                                  const selectedFormItem = purchaseLinkedItemMap.get(sourceId);
                                  const lineQuantity = selectedFormItem
                                    ? parseFloat(selectedFormItem.quantity || "0")
                                    : item.quantity;
                                  const lineUnitPrice = selectedFormItem
                                    ? parseFloat(selectedFormItem.unitPrice || "0")
                                    : item.unitPrice;
                                  const lineTotal = lineQuantity * lineUnitPrice;

                                  return (
                                    <TableRow key={sourceId}>
                                      <TableCell className="text-center">
                                        <Checkbox
                                          checked={Boolean(selectedFormItem)}
                                          onCheckedChange={(value) =>
                                            handleTogglePurchaseItem(item, value)
                                          }
                                          aria-label={`Toggle return for ${item.description}`}
                                        />
                                      </TableCell>
                                      <TableCell>
                                        <div className="font-medium">{item.description}</div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <div>{item.quantity}</div>
                                        <div className="text-[11px] text-muted-foreground">
                                          Rem: {item.remainingQuantity ?? item.quantity}
                                        </div>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          value={
                                            selectedFormItem
                                              ? selectedFormItem.quantity
                                              : item.quantity.toString()
                                          }
                                          onChange={(event) =>
                                            handlePurchaseItemQuantityChange(
                                              sourceId,
                                              "quantity",
                                              event.target.value
                                            )
                                          }
                                          disabled={!selectedFormItem}
                                        />
                                        <p className="text-[10px] text-muted-foreground mt-1">
                                          Max {item.remainingQuantity ?? item.quantity}
                                        </p>
                                      </TableCell>
                                      <TableCell className="text-center">
                                        <Input
                                          type="number"
                                          min={0}
                                          step="0.01"
                                          value={
                                            selectedFormItem
                                              ? selectedFormItem.unitPrice
                                              : item.unitPrice.toString()
                                          }
                                          onChange={(event) =>
                                            handlePurchaseItemQuantityChange(
                                              sourceId,
                                              "unitPrice",
                                              event.target.value
                                            )
                                          }
                                          disabled={!selectedFormItem}
                                        />
                                      </TableCell>
                                      <TableCell className="text-center font-medium">
                                        SAR {formatCurrency(lineTotal)}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })
                              )}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    </div>
                  )}
                </div>
              )
            ) : useManualReference ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Expense Reference *</Label>
                  <Input
                    value={manualReference}
                    onChange={(event) => setManualReference(event.target.value)}
                    placeholder="Enter expense reference number"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Expense Date</Label>
                  <Input
                    type="date"
                    value={manualDate}
                    onChange={(event) => setManualDate(event.target.value)}
                  />
              </div>
              </div>
            ) : (
              <RecordCombobox
                label="Expense"
                value={formExpenseId}
                onChange={setFormExpenseId}
                options={expenseOptions}
                placeholder="Select expense"
                disabled={expenseOptions.length === 0}
              />
            )}

          {formType === "expense" && !useManualReference && selectedExpense && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Expense Summary</CardTitle>
                <CardDescription>
                  {formatExpenseIdentifier(selectedExpense, selectedExpense.expense_id)}
                </CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-muted-foreground block">Paid To</span>
                  <span className="font-medium">
                    {selectedExpense.paid_to ?? selectedExpense.description ?? "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Date</span>
                  <span>
                    {selectedExpense.expense_date
                      ? new Date(selectedExpense.expense_date).toLocaleDateString("en-GB")
                      : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Base Amount</span>
                  <span className="font-medium text-purple-600">
                    SAR {formatCurrency(selectedExpenseTotals.base)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Tax</span>
                  <span className="font-medium text-purple-600">
                    SAR {formatCurrency(selectedExpenseTotals.tax)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Total Paid</span>
                  <span className="font-medium text-green-600">
                    SAR {formatCurrency(selectedExpenseTotals.paid)}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground block">Remaining</span>
                  <span className="font-medium text-rose-600">
                    SAR {formatCurrency(selectedExpenseTotals.remaining)}
                  </span>
                </div>
                {selectedExpense.notes && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground block">Notes</span>
                    <span>{selectedExpense.notes}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={formReason} onValueChange={setFormReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose reason" />
                </SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map((reason) => (
                    <SelectItem key={reason} value={reason}>
                      {reason}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              </div>

            <div className="space-y-2">
              <Label>Additional Notes</Label>
              <Textarea
                value={formNotes}
                onChange={(event) => setFormNotes(event.target.value)}
                placeholder="Provide any additional context for this return…"
                rows={3}
              />
              </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>
                  {formType === "purchase" ? "Additional Manual Items" : "Return Items"}
                </Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddItemRow}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Item
                </Button>
              </div>
              {manualFormItems.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  {formType === "purchase"
                    ? "Select items from the purchase order above or add manual adjustments here."
                    : "Add line items for this return or leave empty to use the amount fields below."}
                </p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <Table>
                    <TableHeader className="bg-muted/40">
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-center w-24">Quantity</TableHead>
                        <TableHead className="text-center w-28">Unit Price</TableHead>
                        <TableHead className="text-center w-16">Remove</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {manualFormItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <Input
                              value={item.description}
                              onChange={(event) =>
                                updateItemRow(item.id, "description", event.target.value)
                              }
                              placeholder="Item description"
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="0"
                                step="0.01"
                              value={item.quantity}
                              onChange={(event) =>
                                updateItemRow(item.id, "quantity", event.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Input
                              type="number"
                              min="0"
                                step="0.01"
                              value={item.unitPrice}
                              onChange={(event) =>
                                updateItemRow(item.id, "unitPrice", event.target.value)
                              }
                            />
                          </TableCell>
                          <TableCell className="text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => removeItemRow(item.id)}
                            >
                              <Trash2 className="h-4 w-4 text-rose-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>Return Amount (SAR)</Label>
                <Input
                  type="number"
                  value={formAmount}
                  onChange={(event) => setFormAmount(event.target.value)}
                  disabled={formType === "purchase" && formItems.length > 0}
                />
                <p className="text-xs text-muted-foreground">
                  {formType === "purchase" && formItems.length > 0
                    ? "Amount derived from items above."
                    : "Enter the amount being returned before tax."}
                </p>
                </div>
              <div className="space-y-2">
                <Label>Tax Amount (SAR)</Label>
                <Input
                  type="number"
                  value={formTaxAmount}
                  onChange={(event) => setFormTaxAmount(event.target.value)}
                />
                </div>
              <div className="space-y-2">
                <Label>Total Return (SAR)</Label>
                <Input value={formatCurrency(totals.total)} readOnly className="bg-muted font-medium" />
              </div>
                </div>
              </div>

          <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 sm:space-x-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsDialogOpen(false);
                resetForm();
              }}
            >
              Cancel
            </Button>
          <Button onClick={handleSaveReturn}>
              {formMode === "create" ? "Create Return" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isViewOpen}
        onOpenChange={(open) => {
          setIsViewOpen(open);
          if (!open) setViewReturn(null);
        }}
      >
        <DialogContent className="w-full max-w-4xl sm:w-[95vw] max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Return Details</DialogTitle>
            <DialogDescription>
              Review the full breakdown of this return and its associated transaction.
            </DialogDescription>
          </DialogHeader>

          {viewReturn && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Return</CardTitle>
                    <CardDescription>{viewReturn.id.toUpperCase()}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Type</span>
                      {typeBadge(viewReturn.type)}
                  </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status</span>
                      {statusBadge(viewReturn.status)}
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Created</span>
                      <span>
                        {viewReturn.createdAt
                          ? new Date(viewReturn.createdAt).toLocaleDateString("en-GB")
                          : "—"}
                      </span>
                    </div>
              <div>
                      <span className="text-muted-foreground block">Reason</span>
                      <span className="font-medium">{viewReturn.reason}</span>
                  </div>
                    {viewReturn.notes && (
                    <div>
                        <span className="text-muted-foreground block">Notes</span>
                        <span className="text-sm">{viewReturn.notes}</span>
                    </div>
                  )}
                  </CardContent>
                </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">
                    {viewReturn.type === "purchase" ? "Purchase Order" : "Expense"}
                  </CardTitle>
                  <CardDescription>
                    {viewReturn.manualReference
                      ? viewReturn.manualReference
                      : viewReturn.type === "purchase"
                        ? viewReturn.purchaseNumber ?? "—"
                        : viewReturn.expenseNumber ?? "—"}
                  </CardDescription>
                  {viewReturn.isManual && (
                    <Badge variant="outline" className="mt-2 w-fit">
                      Manual entry
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Date</span>
                    <span>
                      {viewReturn.manualDate
                        ? new Date(viewReturn.manualDate).toLocaleDateString("en-GB")
                        : viewReturn.type === "purchase"
                          ? viewReturn.purchaseDate
                            ? new Date(viewReturn.purchaseDate).toLocaleDateString("en-GB")
                            : "—"
                          : viewReturn.expenseDate
                            ? new Date(viewReturn.expenseDate).toLocaleDateString("en-GB")
                            : "—"}
                    </span>
                    </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supplier</span>
                    <span>{viewReturn.supplierName ?? "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Return Value</span>
                    <span className="font-medium text-purple-600">
                      SAR {formatCurrency(viewReturn.baseAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Tax</span>
                    <span className="font-medium text-purple-600">
                      SAR {formatCurrency(viewReturn.taxAmount)}
                    </span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span>Total Refunded</span>
                    <span className="text-lg font-bold text-rose-600">
                      SAR {formatCurrency(viewReturn.totalAmount)}
                    </span>
                  </div>
                </CardContent>
              </Card>
              </div>

              {viewReturn.items.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Returned Items</CardTitle>
                    <CardDescription>Quantities and values returned to inventory</CardDescription>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader className="bg-muted/40">
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-center">Qty</TableHead>
                          <TableHead className="text-center">Unit Price</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {viewReturn.items.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell>{item.description}</TableCell>
                            <TableCell className="text-center">
                              {item.quantity}
                              {item.originalQuantity ? (
                                <span className="text-xs text-muted-foreground">
                                  {" "}
                                  / {item.originalQuantity}
                                </span>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-center">
                              SAR {formatCurrency(item.unitPrice)}
                            </TableCell>
                            <TableCell className="text-center">
                              SAR {formatCurrency(item.total)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Notes & Audit</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Created at</span>
                    <span>
                      {viewReturn.createdAt
                        ? new Date(viewReturn.createdAt).toLocaleString()
                        : "—"}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Supplier Impact</span>
                    <span>
                      {viewReturn.type === "purchase" && viewReturn.supplierName
                        ? `Balance increased by SAR ${formatCurrency(viewReturn.totalAmount)}`
                        : "No supplier impact"}
                    </span>
                  </div>
                    <div>
                    <span className="text-muted-foreground block">Reason</span>
                    <span className="font-medium">{viewReturn.reason}</span>
                    </div>
                  {viewReturn.manualReference && (
                    <div>
                      <span className="text-muted-foreground block">
                        {viewReturn.type === "purchase" ? "Manual invoice" : "Manual reference"}
                      </span>
                      <span>{viewReturn.manualReference}</span>
                    </div>
                  )}
                  {viewReturn.notes ? (
                    <p className="text-muted-foreground">{viewReturn.notes}</p>
                  ) : (
                    <p className="text-muted-foreground">No additional notes provided.</p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewOpen(false)}>
              Close
            </Button>
            <Button className="gap-2" disabled>
              <Download className="h-4 w-4" />
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}