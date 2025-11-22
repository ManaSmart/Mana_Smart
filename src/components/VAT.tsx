import { useCallback, useEffect, useMemo, useState } from "react";
import { 
  Plus, 
  DollarSign, 
  FileText, 
  Download,
  Building2,
  Receipt,
  CheckCircle2,
  AlertCircle,
  Clock,
  Pencil,
  Trash2
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Textarea } from "./ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Label } from "./ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { supabase } from "../lib/supabaseClient";
import type { VatReturnInsert, VatReturnRow, VatReturnUpdate, VatStatus } from "../../supabase/models/vat_management";
import type { ZakatRecordInsert, ZakatRecordRow, ZakatRecordUpdate, ZakatStatus } from "../../supabase/models/zakat_management";

const VAT_TABLE = "vat_returns";
const ZAKAT_TABLE = "zakat_records";

const VAT_RATE = 0.15; // 15% VAT in Saudi Arabia
const ZAKAT_RATE = 0.025; // 2.5% Zakat

type Quarter = "Q1" | "Q2" | "Q3" | "Q4";

interface QuarterlyVAT {
  id: string;
  quarter: Quarter;
  year: number;
  startDate: string;
  endDate: string;
  totalSalesIncVAT: number;
  totalSalesExcVAT: number;
  vatAmount: number;
  totalPurchasesIncVAT: number;
  totalPurchasesExcVAT: number;
  inputVAT: number;
  netVATPayable: number;
  status: VatStatus;
  submissionDate?: string;
  paymentDate?: string;
  notes?: string;
  createdAt?: string;
}

interface ZakatRecord {
  id: string;
  year: number;
  totalAssets: number;
  totalLiabilities: number;
  netAssets: number;
  zakatableAmount: number;
  zakatDue: number;
  status: ZakatStatus;
  submissionDate?: string;
  paymentDate?: string;
  notes?: string;
  createdAt?: string;
}

const quarterDatesMap = (year: number) => ({
  Q1: { start: `${year}-01-01`, end: `${year}-03-31` },
  Q2: { start: `${year}-04-01`, end: `${year}-06-30` },
  Q3: { start: `${year}-07-01`, end: `${year}-09-30` },
  Q4: { start: `${year}-10-01`, end: `${year}-12-31` }
});

const quarterOrder: Record<Quarter, number> = {
  Q1: 1,
  Q2: 2,
  Q3: 3,
  Q4: 4
};

const mapVatRowToRecord = (row: VatReturnRow): QuarterlyVAT => ({
  id: row.vat_return_id,
  quarter: row.quarter,
  year: Number(row.year),
  startDate: row.period_start_date,
  endDate: row.period_end_date,
  totalSalesIncVAT: Number(row.sales_inc_vat ?? 0),
  totalSalesExcVAT: Number(row.sales_exc_vat ?? 0),
  vatAmount: Number(row.vat_on_sales ?? 0),
  totalPurchasesIncVAT: Number(row.purchases_inc_vat ?? 0),
  totalPurchasesExcVAT: Number(row.purchases_exc_vat ?? 0),
  inputVAT: Number(row.input_vat ?? 0),
  netVATPayable: Number(row.net_vat_payable ?? 0),
  status: (row.status ?? "draft") as VatStatus,
  submissionDate: row.submission_date ?? undefined,
  paymentDate: row.payment_date ?? undefined,
  notes: row.notes ?? undefined,
  createdAt: row.created_at
});

const mapZakatRowToRecord = (row: ZakatRecordRow): ZakatRecord => ({
  id: row.zakat_record_id,
  year: Number(row.year),
  totalAssets: Number(row.total_assets ?? 0),
  totalLiabilities: Number(row.total_liabilities ?? 0),
  netAssets: Number(row.net_assets ?? 0),
  zakatableAmount: Number(row.zakatable_amount ?? row.net_assets ?? 0),
  zakatDue: Number(row.zakat_due ?? 0),
  status: (row.status ?? "draft") as ZakatStatus,
  submissionDate: row.submission_date ?? undefined,
  paymentDate: row.payment_date ?? undefined,
  notes: row.notes ?? undefined,
  createdAt: row.created_at
});

const sortVatRecords = (records: QuarterlyVAT[]) =>
  [...records].sort((a, b) => {
    if (a.year !== b.year) {
      return b.year - a.year;
    }
    return quarterOrder[b.quarter] - quarterOrder[a.quarter];
  });

const sortZakatRecords = (records: ZakatRecord[]) =>
  [...records].sort((a, b) => b.year - a.year);

export function VAT() {
  const [vatRecords, setVatRecords] = useState<QuarterlyVAT[]>([]);
  const [zakatRecords, setZakatRecords] = useState<ZakatRecord[]>([]);
  const [vatLoading, setVatLoading] = useState(false);
  const [zakatLoading, setZakatLoading] = useState(false);
  const [vatSaving, setVatSaving] = useState(false);
  const [zakatSaving, setZakatSaving] = useState(false);
  const [initialLoadError, setInitialLoadError] = useState<string | null>(null);
  const [isVatFormOpen, setIsVatFormOpen] = useState(false);
  const [vatFormMode, setVatFormMode] = useState<"create" | "edit">("create");
  const [editingVATId, setEditingVATId] = useState<string | null>(null);
  const [isZakatFormOpen, setIsZakatFormOpen] = useState(false);
  const [zakatFormMode, setZakatFormMode] = useState<"create" | "edit">("create");
  const [editingZakatId, setEditingZakatId] = useState<string | null>(null);
  const [selectedVAT, setSelectedVAT] = useState<QuarterlyVAT | null>(null);
  const [selectedZakat, setSelectedZakat] = useState<ZakatRecord | null>(null);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const [isZakatDetailsOpen, setIsZakatDetailsOpen] = useState(false);
  const appendInitialError = useCallback((message: string) => {
    setInitialLoadError((prev) => (prev ? `${prev}\n${message}` : message));
  }, []);

  const fetchVatRecords = useCallback(async () => {
    setVatLoading(true);
    try {
      const { data, error } = await supabase
        .from(VAT_TABLE)
        .select("*")
        .order("year", { ascending: false })
        .order("period_start_date", { ascending: false });

      if (error) {
        throw error;
      }

      const mapped = (data ?? []).map(mapVatRowToRecord);
      setVatRecords(sortVatRecords(mapped));
    } catch (error) {
      console.error("Failed to fetch VAT records", error);
      const message =
        error instanceof Error ? error.message : "Failed to load VAT records";
      appendInitialError(message);
      toast.error("Failed to load VAT records");
    } finally {
      setVatLoading(false);
    }
  }, [appendInitialError]);

  const fetchZakatRecords = useCallback(async () => {
    setZakatLoading(true);
    try {
      const { data, error } = await supabase
        .from(ZAKAT_TABLE)
        .select("*")
        .order("year", { ascending: false });

      if (error) {
        throw error;
      }

      const mapped = (data ?? []).map(mapZakatRowToRecord);
      setZakatRecords(sortZakatRecords(mapped));
    } catch (error) {
      console.error("Failed to fetch Zakat records", error);
      const message =
        error instanceof Error ? error.message : "Failed to load Zakat records";
      appendInitialError(message);
      toast.error("Failed to load Zakat records");
    } finally {
      setZakatLoading(false);
    }
  }, [appendInitialError]);

  useEffect(() => {
    setInitialLoadError(null);
    void fetchVatRecords();
    void fetchZakatRecords();
  }, [fetchVatRecords, fetchZakatRecords]);

  // VAT Form state
  const [vatFormData, setVatFormData] = useState({
    quarter: "Q1",
    year: new Date().getFullYear().toString(),
    totalSalesIncVAT: "",
    totalPurchasesIncVAT: "",
    notes: ""
  });

  // Zakat Form state
  const [zakatFormData, setZakatFormData] = useState({
    year: new Date().getFullYear().toString(),
    totalAssets: "",
    totalLiabilities: "",
    notes: ""
  });

  const resetVATForm = () => {
    setVatFormData({
      quarter: "Q1",
      year: new Date().getFullYear().toString(),
      totalSalesIncVAT: "",
      totalPurchasesIncVAT: "",
      notes: ""
    });
    setVatFormMode("create");
    setEditingVATId(null);
  };

  const resetZakatForm = () => {
    setZakatFormData({
      year: new Date().getFullYear().toString(),
      totalAssets: "",
      totalLiabilities: "",
      notes: ""
    });
    setZakatFormMode("create");
    setEditingZakatId(null);
  };

  const currentYear = new Date().getFullYear();
  const {
    totalVATCollected,
    totalInputVAT,
    totalNetVATPayable,
    paidVAT,
    pendingVAT,
    totalZakatDue
  } = useMemo(() => {
    const vatForYear = vatRecords.filter(v => v.year === currentYear);
    const zakatForYear = zakatRecords.filter(z => z.year === currentYear);

    const sumReducer = (items: number[]) => items.reduce((sum, value) => sum + value, 0);

    const totalVATCollectedValue = sumReducer(vatForYear.map(v => v.vatAmount));
    const totalInputVATValue = sumReducer(vatForYear.map(v => v.inputVAT));
    const totalNetVATPayableValue = sumReducer(vatForYear.map(v => v.netVATPayable));
    const paidVATValue = sumReducer(vatForYear.filter(v => v.status === "paid").map(v => v.netVATPayable));
    const pendingVATValue = sumReducer(
      vatForYear.filter(v => v.status === "draft" || v.status === "pending").map(v => v.netVATPayable)
    );
    const totalZakatDueValue = sumReducer(zakatForYear.map(z => z.zakatDue));

    return {
      totalVATCollected: totalVATCollectedValue,
      totalInputVAT: totalInputVATValue,
      totalNetVATPayable: totalNetVATPayableValue,
      paidVAT: paidVATValue,
      pendingVAT: pendingVATValue,
      totalZakatDue: totalZakatDueValue
    };
  }, [currentYear, vatRecords, zakatRecords]);

  const calculateVATFromInclusive = (amountIncVAT: number) => {
    // VAT = Amount Including VAT × (VAT Rate / (1 + VAT Rate))
    const vatAmount = amountIncVAT * (VAT_RATE / (1 + VAT_RATE));
    const amountExcVAT = amountIncVAT - vatAmount;
    return { amountExcVAT, vatAmount };
  };

  const exportVATToExcel = () => {
    try {
      const exportData = vatRecords.map((record) => ({
        "Quarter": record.quarter,
        "Year": record.year,
        "Total Sales (Inc VAT) (SAR)": record.totalSalesIncVAT,
        "Total Purchases (Inc VAT) (SAR)": record.totalPurchasesIncVAT,
        "Sales VAT (SAR)": record.vatAmount,
        "Purchases VAT (SAR)": record.inputVAT,
        "Net VAT Due (SAR)": record.netVATPayable,
        "Status": record.status,
        "Due Date": record.submissionDate || "",
        "Paid Date": record.paymentDate || "",
        "Notes": record.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 10 }, { wch: 10 }, { wch: 25 }, { wch: 25 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
        { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "VAT Returns");
      const fileName = `vat_returns_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("VAT Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export VAT Excel file");
      console.error(error);
    }
  };

  const exportZakatToExcel = () => {
    try {
      const exportData = zakatRecords.map((record) => ({
        "Year": record.year,
        "Total Assets (SAR)": record.totalAssets,
        "Total Liabilities (SAR)": record.totalLiabilities,
        "Net Assets (SAR)": record.netAssets,
        "Zakat Amount (SAR)": record.zakatDue,
        "Status": record.status,
        "Due Date": record.submissionDate || "",
        "Paid Date": record.paymentDate || "",
        "Notes": record.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 10 }, { wch: 20 }, { wch: 20 }, { wch: 18 }, { wch: 18 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Zakat Records");
      const fileName = `zakat_records_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Zakat Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Zakat Excel file");
      console.error(error);
    }
  };

  const handleSaveVAT = async () => {
    if (!vatFormData.totalSalesIncVAT || !vatFormData.totalPurchasesIncVAT) {
      toast.error("Please fill in all required fields");
      return;
    }

    const salesIncVAT = parseFloat(vatFormData.totalSalesIncVAT);
    const purchasesIncVAT = parseFloat(vatFormData.totalPurchasesIncVAT);

    const sales = calculateVATFromInclusive(salesIncVAT);
    const purchases = calculateVATFromInclusive(purchasesIncVAT);

    const netVAT = sales.vatAmount - purchases.vatAmount;

    // Determine quarter dates
    const year = parseInt(vatFormData.year);
    if (Number.isNaN(year)) {
      toast.error("Year must be a valid number");
      return;
    }
    const dates = quarterDatesMap(year)[vatFormData.quarter as Quarter];

    if (vatFormMode === "edit") {
      if (editingVATId === null) {
        toast.error("Unable to update VAT record");
        return;
      }

      setVatSaving(true);

      const payload: VatReturnUpdate = {
        vat_return_id: editingVATId,
        quarter: vatFormData.quarter as Quarter,
        year,
        period_start_date: dates.start,
        period_end_date: dates.end,
        sales_inc_vat: salesIncVAT,
        sales_exc_vat: sales.amountExcVAT,
        vat_on_sales: sales.vatAmount,
        purchases_inc_vat: purchasesIncVAT,
        purchases_exc_vat: purchases.amountExcVAT,
        input_vat: purchases.vatAmount,
        net_vat_payable: netVAT,
        notes: vatFormData.notes || null
      };

      try {
        const { data, error } = await supabase
          .from(VAT_TABLE)
          .update(payload)
          .eq("vat_return_id", editingVATId)
          .select()
          .single();

        if (error || !data) {
          throw error ?? new Error("No data returned while updating VAT record");
        }

        const updatedVAT = mapVatRowToRecord(data as VatReturnRow);
        setVatRecords(prev => sortVatRecords(prev.map(vat => (vat.id === editingVATId ? updatedVAT : vat))));
        if (selectedVAT?.id === editingVATId) {
          setSelectedVAT(updatedVAT);
        }
        toast.success("VAT record updated successfully");
        setIsVatFormOpen(false);
        resetVATForm();
      } catch (error) {
        console.error("Failed to update VAT record", error);
        const message = error instanceof Error ? error.message : "Failed to update VAT record";
        toast.error(message);
      } finally {
        setVatSaving(false);
      }
    } else {
      setVatSaving(true);

      const payload: VatReturnInsert = {
        quarter: vatFormData.quarter as Quarter,
        year,
        period_start_date: dates.start,
        period_end_date: dates.end,
        sales_inc_vat: salesIncVAT,
        sales_exc_vat: sales.amountExcVAT,
        vat_on_sales: sales.vatAmount,
        purchases_inc_vat: purchasesIncVAT,
        purchases_exc_vat: purchases.amountExcVAT,
        input_vat: purchases.vatAmount,
        net_vat_payable: netVAT,
        status: "draft",
        notes: vatFormData.notes || null
      };

      try {
        const { data, error } = await supabase
          .from(VAT_TABLE)
          .insert(payload)
          .select()
          .single();

        if (error || !data) {
          throw error ?? new Error("No data returned while creating VAT record");
        }

        const newVAT = mapVatRowToRecord(data as VatReturnRow);
        setVatRecords(prev => sortVatRecords([newVAT, ...prev]));
        toast.success("VAT record added successfully");
        setIsVatFormOpen(false);
        resetVATForm();
      } catch (error) {
        console.error("Failed to create VAT record", error);
        const message = error instanceof Error ? error.message : "Failed to create VAT record";
        toast.error(message);
      } finally {
        setVatSaving(false);
      }
    }
  };

  const handleSaveZakat = async () => {
    if (!zakatFormData.totalAssets || !zakatFormData.totalLiabilities) {
      toast.error("Please fill in all required fields");
      return;
    }

    const assets = parseFloat(zakatFormData.totalAssets);
    const liabilities = parseFloat(zakatFormData.totalLiabilities);
    const netAssets = assets - liabilities;
    const zakatDue = netAssets * ZAKAT_RATE;

    const year = parseInt(zakatFormData.year);
    if (Number.isNaN(year)) {
      toast.error("Year must be a valid number");
      return;
    }

    if (zakatFormMode === "edit") {
      if (editingZakatId === null) {
        toast.error("Unable to update Zakat record");
        return;
      }

      setZakatSaving(true);

      const payload: ZakatRecordUpdate = {
        zakat_record_id: editingZakatId,
        year,
        total_assets: assets,
        total_liabilities: liabilities,
        net_assets: netAssets,
        zakatable_amount: netAssets,
        zakat_due: zakatDue,
        notes: zakatFormData.notes || null
      };

      try {
        const { data, error } = await supabase
          .from(ZAKAT_TABLE)
          .update(payload)
          .eq("zakat_record_id", editingZakatId)
          .select()
          .single();

        if (error || !data) {
          throw error ?? new Error("No data returned while updating Zakat record");
        }

        const updatedZakat = mapZakatRowToRecord(data as ZakatRecordRow);
        setZakatRecords(prev => sortZakatRecords(prev.map(zakat => (zakat.id === editingZakatId ? updatedZakat : zakat))));
        if (selectedZakat?.id === editingZakatId) {
          setSelectedZakat(updatedZakat);
        }
        toast.success("Zakat record updated successfully");
        setIsZakatFormOpen(false);
        resetZakatForm();
      } catch (error) {
        console.error("Failed to update Zakat record", error);
        const message = error instanceof Error ? error.message : "Failed to update Zakat record";
        toast.error(message);
      } finally {
        setZakatSaving(false);
      }
    } else {
      setZakatSaving(true);

      const payload: ZakatRecordInsert = {
        year,
        total_assets: assets,
        total_liabilities: liabilities,
        net_assets: netAssets,
        zakatable_amount: netAssets,
        zakat_due: zakatDue,
        status: "draft",
        notes: zakatFormData.notes || null
      };

      try {
        const { data, error } = await supabase
          .from(ZAKAT_TABLE)
          .insert(payload)
          .select()
          .single();

        if (error || !data) {
          throw error ?? new Error("No data returned while creating Zakat record");
        }

        const newZakat = mapZakatRowToRecord(data as ZakatRecordRow);
        setZakatRecords(prev => sortZakatRecords([newZakat, ...prev]));
        toast.success("Zakat record added successfully");
        setIsZakatFormOpen(false);
        resetZakatForm();
      } catch (error) {
        console.error("Failed to create Zakat record", error);
        const message = error instanceof Error ? error.message : "Failed to create Zakat record";
        toast.error(message);
      } finally {
        setZakatSaving(false);
      }
    }
  };

  const handleDeleteVAT = async (id: string) => {
    const record = vatRecords.find(v => v.id === id);

    if (!record) {
      toast.error("VAT record not found");
      return;
    }

    const shouldDelete = typeof window !== "undefined"
      ? window.confirm(`Delete VAT record for ${record.quarter} ${record.year}?`)
      : true;

    if (!shouldDelete) {
      return;
    }

    try {
      const { error } = await supabase.from(VAT_TABLE).delete().eq("vat_return_id", id);
      if (error) {
        throw error;
      }

      setVatRecords(prev => prev.filter(v => v.id !== id));

      if (selectedVAT?.id === id) {
        setSelectedVAT(null);
        setIsDetailsOpen(false);
      }

      toast.success("VAT record deleted successfully");
    } catch (error) {
      console.error("Failed to delete VAT record", error);
      const message = error instanceof Error ? error.message : "Failed to delete VAT record";
      toast.error(message);
    }
  };

  const handleDeleteZakat = async (id: string) => {
    const record = zakatRecords.find(z => z.id === id);

    if (!record) {
      toast.error("Zakat record not found");
      return;
    }

    const shouldDelete = typeof window !== "undefined"
      ? window.confirm(`Delete Zakat record for ${record.year}?`)
      : true;

    if (!shouldDelete) {
      return;
    }

    try {
      const { error } = await supabase.from(ZAKAT_TABLE).delete().eq("zakat_record_id", id);
      if (error) {
        throw error;
      }

      setZakatRecords(prev => prev.filter(z => z.id !== id));

      if (selectedZakat?.id === id) {
        setSelectedZakat(null);
        setIsZakatDetailsOpen(false);
      }

      toast.success("Zakat record deleted successfully");
    } catch (error) {
      console.error("Failed to delete Zakat record", error);
      const message = error instanceof Error ? error.message : "Failed to delete Zakat record";
      toast.error(message);
    }
  };

  const updateVATStatus = async (id: string, newStatus: VatStatus) => {
    const existing = vatRecords.find(v => v.id === id);
    if (!existing) {
      toast.error("VAT record not found");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const updates: VatReturnUpdate = {
      vat_return_id: id,
      status: newStatus
    };

    if (newStatus === "submitted") {
      updates.submission_date = today;
    }

    if (newStatus === "paid") {
      updates.payment_date = today;
      updates.submission_date = existing.submissionDate ?? today;
    }

    try {
      const { data, error } = await supabase
        .from(VAT_TABLE)
        .update(updates)
        .eq("vat_return_id", id)
        .select()
        .single();

      if (error || !data) {
        throw error ?? new Error("No data returned while updating VAT status");
      }

      const updated = mapVatRowToRecord(data as VatReturnRow);
      setVatRecords(prev => sortVatRecords(prev.map(vat => (vat.id === id ? updated : vat))));
      if (selectedVAT?.id === id) {
        setSelectedVAT(updated);
      }
      toast.success("Status updated successfully");
    } catch (error) {
      console.error("Failed to update VAT status", error);
      const message = error instanceof Error ? error.message : "Failed to update VAT status";
      toast.error(message);
    }
  };

  const updateZakatStatus = async (id: string, newStatus: ZakatStatus) => {
    const existing = zakatRecords.find(z => z.id === id);
    if (!existing) {
      toast.error("Zakat record not found");
      return;
    }

    const today = new Date().toISOString().split("T")[0];
    const updates: ZakatRecordUpdate = {
      zakat_record_id: id,
      status: newStatus
    };

    if (newStatus === "submitted") {
      updates.submission_date = today;
    }

    if (newStatus === "paid") {
      updates.payment_date = today;
      updates.submission_date = existing.submissionDate ?? today;
    }

    try {
      const { data, error } = await supabase
        .from(ZAKAT_TABLE)
        .update(updates)
        .eq("zakat_record_id", id)
        .select()
        .single();

      if (error || !data) {
        throw error ?? new Error("No data returned while updating Zakat status");
      }

      const updated = mapZakatRowToRecord(data as ZakatRecordRow);
      setZakatRecords(prev => sortZakatRecords(prev.map(zakat => (zakat.id === id ? updated : zakat))));
      if (selectedZakat?.id === id) {
        setSelectedZakat(updated);
      }
      toast.success("Status updated successfully");
    } catch (error) {
      console.error("Failed to update Zakat status", error);
      const message = error instanceof Error ? error.message : "Failed to update Zakat status";
      toast.error(message);
    }
  };

  const getStatusBadge = (status: string) => {
    const badges = {
      draft: { color: "bg-slate-100 text-slate-700", label: "Draft", icon: FileText },
      pending: { color: "bg-yellow-100 text-yellow-700", label: "Pending", icon: Clock },
      submitted: { color: "bg-blue-100 text-blue-700", label: "Submitted", icon: CheckCircle2 },
      paid: { color: "bg-green-100 text-green-700", label: "Paid", icon: CheckCircle2 }
    };
    return badges[status as keyof typeof badges] || badges.draft;
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl mb-1">VAT & Zakat Management</h1>
          <p className="text-sm text-muted-foreground">
            Manage Value Added Tax (15%) and Zakat (2.5%) calculations and submissions
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              resetZakatForm();
              setZakatFormMode("create");
              setIsZakatFormOpen(true);
            }}
            variant="outline"
            className="gap-2"
          >
            <Building2 className="w-4 h-4" />
            Add Zakat
          </Button>
          <Button
            onClick={() => {
              resetVATForm();
              setVatFormMode("create");
              setIsVatFormOpen(true);
            }}
            className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
          >
            <Plus className="w-4 h-4" />
            New VAT Record
          </Button>
        </div>
      </div>

      {initialLoadError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive whitespace-pre-line">
          {initialLoadError}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Total VAT Collected</CardTitle>
            <Receipt className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">SAR {totalVATCollected.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Year {currentYear}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Net VAT Payable</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">SAR {totalNetVATPayable.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              After input VAT: SAR {totalInputVAT.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Pending VAT</CardTitle>
            <AlertCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">SAR {pendingVAT.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Paid: SAR {paidVAT.toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm">Zakat Due</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl">SAR {totalZakatDue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Year {currentYear} @ 2.5%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="vat" className="space-y-4">
        <TabsList>
          <TabsTrigger value="vat">VAT Returns</TabsTrigger>
          <TabsTrigger value="zakat">Zakat</TabsTrigger>
          <TabsTrigger value="calculator">VAT Calculator</TabsTrigger>
        </TabsList>

        {/* VAT Tab */}
        <TabsContent value="vat" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Quarterly VAT Returns</CardTitle>
                  <CardDescription>Value Added Tax (15%) quarterly submissions</CardDescription>
                </div>
                <Button onClick={exportVATToExcel} variant="outline" className="gap-2">
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
                      <TableHead>Period</TableHead>
                      <TableHead>Sales (Inc VAT)</TableHead>
                      <TableHead>VAT on Sales</TableHead>
                      <TableHead>Input VAT</TableHead>
                      <TableHead>Net VAT Payable</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {vatLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Loading VAT records...
                        </TableCell>
                      </TableRow>
                    ) : vatRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No VAT records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      vatRecords.map((vat) => {
                        const statusBadge = getStatusBadge(vat.status);
                        const StatusIcon = statusBadge.icon;

                        return (
                          <TableRow key={vat.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{vat.quarter} {vat.year}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(vat.startDate).toLocaleDateString('en-GB')} - {new Date(vat.endDate).toLocaleDateString('en-GB')}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <div>
                                <div className="font-medium">SAR {vat.totalSalesIncVAT.toLocaleString()}</div>
                                <div className="text-xs text-muted-foreground">
                                  Exc: SAR {vat.totalSalesExcVAT.toLocaleString()}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-green-600">
                                SAR {vat.vatAmount.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-blue-600">
                                SAR {vat.inputVAT.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-lg">
                                SAR {vat.netVATPayable.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge className={statusBadge.color}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedVAT(vat);
                                    setIsDetailsOpen(true);
                                  }}
                                >
                                  <FileText className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setVatFormMode("edit");
                                    setEditingVATId(vat.id);
                                    setVatFormData({
                                      quarter: vat.quarter,
                                      year: vat.year.toString(),
                                      totalSalesIncVAT: vat.totalSalesIncVAT.toString(),
                                      totalPurchasesIncVAT: vat.totalPurchasesIncVAT.toString(),
                                      notes: vat.notes ?? ""
                                    });
                                    setIsVatFormOpen(true);
                                  }}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    void handleDeleteVAT(vat.id);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                                {vat.status === "draft" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      void updateVATStatus(vat.id, "submitted");
                                    }}
                                  >
                                    Submit
                                  </Button>
                                )}
                                {vat.status === "submitted" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      void updateVATStatus(vat.id, "paid");
                                    }}
                                  >
                                    Mark Paid
                                  </Button>
                                )}
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
        </TabsContent>

        {/* Zakat Tab */}
        <TabsContent value="zakat" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Zakat Records</CardTitle>
                  <CardDescription>Annual Zakat (2.5%) on net assets</CardDescription>
                </div>
                <Button onClick={exportZakatToExcel} variant="outline" className="gap-2">
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
                      <TableHead>Year</TableHead>
                      <TableHead>Total Assets</TableHead>
                      <TableHead>Liabilities</TableHead>
                      <TableHead>Net Assets</TableHead>
                      <TableHead>Zakat Due (2.5%)</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {zakatLoading ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          Loading Zakat records...
                        </TableCell>
                      </TableRow>
                    ) : zakatRecords.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                          No Zakat records found
                        </TableCell>
                      </TableRow>
                    ) : (
                      zakatRecords.map((zakat) => {
                        const statusBadge = getStatusBadge(zakat.status);
                        const StatusIcon = statusBadge.icon;

                        return (
                          <TableRow key={zakat.id}>
                            <TableCell>
                              <div className="font-medium">{zakat.year}</div>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">SAR {zakat.totalAssets.toLocaleString()}</span>
                            </TableCell>
                            <TableCell>
                              <span className="text-red-600">SAR {zakat.totalLiabilities.toLocaleString()}</span>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium">SAR {zakat.netAssets.toLocaleString()}</span>
                            </TableCell>
                            <TableCell>
                              <span className="font-medium text-lg text-blue-600">
                                SAR {zakat.zakatDue.toLocaleString()}
                              </span>
                            </TableCell>
                            <TableCell>
                              <Badge className={statusBadge.color}>
                                <StatusIcon className="w-3 h-3 mr-1" />
                                {statusBadge.label}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedZakat(zakat);
                                    setIsZakatDetailsOpen(true);
                                  }}
                                >
                                  <FileText className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setZakatFormMode("edit");
                                    setEditingZakatId(zakat.id);
                                    setZakatFormData({
                                      year: zakat.year.toString(),
                                      totalAssets: zakat.totalAssets.toString(),
                                      totalLiabilities: zakat.totalLiabilities.toString(),
                                      notes: zakat.notes ?? ""
                                    });
                                    setIsZakatFormOpen(true);
                                  }}
                                >
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    void handleDeleteZakat(zakat.id);
                                  }}
                                >
                                  <Trash2 className="w-4 h-4 text-destructive" />
                                </Button>
                                {zakat.status === "draft" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      void updateZakatStatus(zakat.id, "submitted");
                                    }}
                                  >
                                    Submit
                                  </Button>
                                )}
                                {zakat.status === "submitted" && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => {
                                      void updateZakatStatus(zakat.id, "paid");
                                    }}
                                  >
                                    Mark Paid
                                  </Button>
                                )}
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
        </TabsContent>

        {/* Calculator Tab */}
        <TabsContent value="calculator" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>VAT Calculator</CardTitle>
                <CardDescription>Calculate VAT from amount including tax</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="amountIncVAT">Amount Including VAT (SAR)</Label>
                  <Input
                    id="amountIncVAT"
                    type="number"
                    placeholder="115"
                    onChange={(e) => {
                      const incVAT = parseFloat(e.target.value) || 0;
                      const result = calculateVATFromInclusive(incVAT);
                      const excVATInput = document.getElementById("amountExcVAT") as HTMLInputElement;
                      const vatInput = document.getElementById("vatOnly") as HTMLInputElement;
                      if (excVATInput) excVATInput.value = result.amountExcVAT.toFixed(2);
                      if (vatInput) vatInput.value = result.vatAmount.toFixed(2);
                    }}
                  />
                </div>
                <div className="pt-4 border-t space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Amount Excluding VAT:</span>
                    <Input id="amountExcVAT" readOnly className="w-32 text-right" placeholder="100.00" />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">VAT Amount (15%):</span>
                    <Input id="vatOnly" readOnly className="w-32 text-right" placeholder="15.00" />
                  </div>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-900">
                    <strong>Formula:</strong> VAT = Amount Inc VAT × (0.15 / 1.15)
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Zakat Calculator</CardTitle>
                <CardDescription>Calculate Zakat on net assets (2.5%)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="zakatAssets">Total Assets (SAR)</Label>
                  <Input
                    id="zakatAssets"
                    type="number"
                    placeholder="5000000"
                    onChange={(e) => {
                      const assets = parseFloat(e.target.value) || 0;
                      const liabilitiesInput = document.getElementById("zakatLiabilities") as HTMLInputElement;
                      const liabilities = parseFloat(liabilitiesInput?.value) || 0;
                      const netAssets = assets - liabilities;
                      const zakatDue = netAssets * ZAKAT_RATE;
                      
                      const netAssetsInput = document.getElementById("zakatNetAssets") as HTMLInputElement;
                      const zakatDueInput = document.getElementById("zakatDueCalc") as HTMLInputElement;
                      if (netAssetsInput) netAssetsInput.value = netAssets.toFixed(2);
                      if (zakatDueInput) zakatDueInput.value = zakatDue.toFixed(2);
                    }}
                  />
                </div>
                <div>
                  <Label htmlFor="zakatLiabilities">Total Liabilities (SAR)</Label>
                  <Input
                    id="zakatLiabilities"
                    type="number"
                    placeholder="1500000"
                    onChange={(e) => {
                      const liabilities = parseFloat(e.target.value) || 0;
                      const assetsInput = document.getElementById("zakatAssets") as HTMLInputElement;
                      const assets = parseFloat(assetsInput?.value) || 0;
                      const netAssets = assets - liabilities;
                      const zakatDue = netAssets * ZAKAT_RATE;
                      
                      const netAssetsInput = document.getElementById("zakatNetAssets") as HTMLInputElement;
                      const zakatDueInput = document.getElementById("zakatDueCalc") as HTMLInputElement;
                      if (netAssetsInput) netAssetsInput.value = netAssets.toFixed(2);
                      if (zakatDueInput) zakatDueInput.value = zakatDue.toFixed(2);
                    }}
                  />
                </div>
                <div className="pt-4 border-t space-y-3">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">Net Assets:</span>
                    <Input id="zakatNetAssets" readOnly className="w-40 text-right" placeholder="3500000.00" />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm font-medium">Zakat Due (2.5%):</span>
                    <Input id="zakatDueCalc" readOnly className="w-40 text-right font-medium" placeholder="87500.00" />
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-900">
                    <strong>Formula:</strong> Zakat = Net Assets × 2.5%
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* VAT Form Dialog */}
      <Dialog
        open={isVatFormOpen}
        onOpenChange={(open) => {
          setIsVatFormOpen(open);
          if (!open) {
            resetVATForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{vatFormMode === "edit" ? "Edit VAT Record" : "Add VAT Record"}</DialogTitle>
            <DialogDescription>
              {vatFormMode === "edit"
                ? "Update the quarterly VAT return values."
                : "Add a new quarterly VAT return. Enter amounts including VAT."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="quarter">Quarter *</Label>
                <Select value={vatFormData.quarter} onValueChange={(value) => setVatFormData({ ...vatFormData, quarter: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Q1">Q1 (Jan - Mar)</SelectItem>
                    <SelectItem value="Q2">Q2 (Apr - Jun)</SelectItem>
                    <SelectItem value="Q3">Q3 (Jul - Sep)</SelectItem>
                    <SelectItem value="Q4">Q4 (Oct - Dec)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="year">Year *</Label>
                <Input
                  id="year"
                  type="number"
                  value={vatFormData.year}
                  onChange={(e) => setVatFormData({ ...vatFormData, year: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="totalSalesIncVAT">Total Sales (Including VAT) *</Label>
              <Input
                id="totalSalesIncVAT"
                type="number"
                value={vatFormData.totalSalesIncVAT}
                onChange={(e) => setVatFormData({ ...vatFormData, totalSalesIncVAT: e.target.value })}
                placeholder="575000"
              />
              <p className="text-xs text-muted-foreground">
                Enter total sales amount including 15% VAT
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="totalPurchasesIncVAT">Total Purchases (Including VAT) *</Label>
              <Input
                id="totalPurchasesIncVAT"
                type="number"
                value={vatFormData.totalPurchasesIncVAT}
                onChange={(e) => setVatFormData({ ...vatFormData, totalPurchasesIncVAT: e.target.value })}
                placeholder="230000"
              />
              <p className="text-xs text-muted-foreground">
                Enter total purchases amount including 15% VAT
              </p>
            </div>

            {vatFormData.totalSalesIncVAT && vatFormData.totalPurchasesIncVAT && (
              <div className="p-4 bg-blue-50 rounded-lg space-y-2">
                <p className="text-sm font-medium text-blue-900">Calculation Preview:</p>
                <div className="text-xs space-y-1 text-blue-800">
                  <div className="flex justify-between">
                    <span>VAT on Sales:</span>
                    <span>SAR {calculateVATFromInclusive(parseFloat(vatFormData.totalSalesIncVAT)).vatAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Input VAT:</span>
                    <span>SAR {calculateVATFromInclusive(parseFloat(vatFormData.totalPurchasesIncVAT)).vatAmount.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-1 border-t border-blue-200">
                    <span>Net VAT Payable:</span>
                    <span>SAR {(
                      calculateVATFromInclusive(parseFloat(vatFormData.totalSalesIncVAT)).vatAmount -
                      calculateVATFromInclusive(parseFloat(vatFormData.totalPurchasesIncVAT)).vatAmount
                    ).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                value={vatFormData.notes}
                onChange={(e) => setVatFormData({ ...vatFormData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsVatFormOpen(false);
                resetVATForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleSaveVAT();
              }}
              disabled={vatSaving}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-70"
            >
              {vatFormMode === "edit" ? "Save Changes" : "Add VAT Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zakat Form Dialog */}
      <Dialog
        open={isZakatFormOpen}
        onOpenChange={(open) => {
          setIsZakatFormOpen(open);
          if (!open) {
            resetZakatForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{zakatFormMode === "edit" ? "Edit Zakat Record" : "Add Zakat Record"}</DialogTitle>
            <DialogDescription>
              {zakatFormMode === "edit"
                ? "Update the annual Zakat calculation (2.5% on net assets)."
                : "Add annual Zakat calculation (2.5% on net assets)"}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="zakatYear">Year *</Label>
              <Input
                id="zakatYear"
                type="number"
                value={zakatFormData.year}
                onChange={(e) => setZakatFormData({ ...zakatFormData, year: e.target.value })}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="totalAssets">Total Assets (SAR) *</Label>
              <Input
                id="totalAssets"
                type="number"
                value={zakatFormData.totalAssets}
                onChange={(e) => setZakatFormData({ ...zakatFormData, totalAssets: e.target.value })}
                placeholder="5000000"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="totalLiabilities">Total Liabilities (SAR) *</Label>
              <Input
                id="totalLiabilities"
                type="number"
                value={zakatFormData.totalLiabilities}
                onChange={(e) => setZakatFormData({ ...zakatFormData, totalLiabilities: e.target.value })}
                placeholder="1500000"
              />
            </div>

            {zakatFormData.totalAssets && zakatFormData.totalLiabilities && (
              <div className="p-4 bg-green-50 rounded-lg space-y-2">
                <p className="text-sm font-medium text-green-900">Calculation Preview:</p>
                <div className="text-xs space-y-1 text-green-800">
                  <div className="flex justify-between">
                    <span>Total Assets:</span>
                    <span>SAR {parseFloat(zakatFormData.totalAssets).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Liabilities:</span>
                    <span>SAR {parseFloat(zakatFormData.totalLiabilities).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium pt-1 border-t border-green-200">
                    <span>Net Assets:</span>
                    <span>SAR {(parseFloat(zakatFormData.totalAssets) - parseFloat(zakatFormData.totalLiabilities)).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between font-medium text-base pt-1 border-t border-green-300">
                    <span>Zakat Due (2.5%):</span>
                    <span>SAR {((parseFloat(zakatFormData.totalAssets) - parseFloat(zakatFormData.totalLiabilities)) * ZAKAT_RATE).toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="zakatNotes">Notes</Label>
              <Textarea
                id="zakatNotes"
                value={zakatFormData.notes}
                onChange={(e) => setZakatFormData({ ...zakatFormData, notes: e.target.value })}
                placeholder="Additional notes..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsZakatFormOpen(false);
                resetZakatForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                void handleSaveZakat();
              }}
              disabled={zakatSaving}
              className="bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-70"
            >
              {zakatFormMode === "edit" ? "Save Changes" : "Add Zakat Record"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* VAT Details Dialog */}
      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>VAT Return Details</DialogTitle>
            <DialogDescription>
              {selectedVAT && `${selectedVAT.quarter} ${selectedVAT.year} - ${new Date(selectedVAT.startDate).toLocaleDateString('en-GB')} to ${new Date(selectedVAT.endDate).toLocaleDateString('en-GB')}`}
            </DialogDescription>
          </DialogHeader>

          {selectedVAT && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Sales</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Including VAT:</span>
                      <span className="font-medium">SAR {selectedVAT.totalSalesIncVAT.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Excluding VAT:</span>
                      <span>SAR {selectedVAT.totalSalesExcVAT.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">VAT (15%):</span>
                      <span className="font-medium text-green-600">SAR {selectedVAT.vatAmount.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm">Purchases</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Including VAT:</span>
                      <span className="font-medium">SAR {selectedVAT.totalPurchasesIncVAT.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Excluding VAT:</span>
                      <span>SAR {selectedVAT.totalPurchasesExcVAT.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between pt-2 border-t">
                      <span className="text-muted-foreground">Input VAT (15%):</span>
                      <span className="font-medium text-blue-600">SAR {selectedVAT.inputVAT.toLocaleString()}</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card className="border-2 border-primary">
                <CardContent className="pt-6">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-medium">Net VAT Payable:</span>
                    <span className="text-2xl font-bold">SAR {selectedVAT.netVATPayable.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    VAT on Sales (SAR {selectedVAT.vatAmount.toLocaleString()}) - Input VAT (SAR {selectedVAT.inputVAT.toLocaleString()})
                  </p>
                </CardContent>
              </Card>

              {selectedVAT.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-sm mt-1">{selectedVAT.notes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusBadge(selectedVAT.status).color}>
                      {getStatusBadge(selectedVAT.status).label}
                    </Badge>
                  </div>
                </div>
                {selectedVAT.submissionDate && (
                  <div>
                    <Label className="text-muted-foreground">Submission Date</Label>
                    <p className="mt-1">{new Date(selectedVAT.submissionDate).toLocaleDateString('en-GB')}</p>
                  </div>
                )}
                {selectedVAT.paymentDate && (
                  <div>
                    <Label className="text-muted-foreground">Payment Date</Label>
                    <p className="mt-1">{new Date(selectedVAT.paymentDate).toLocaleDateString('en-GB')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsOpen(false)}>
              Close
            </Button>
            <Button className="gap-2">
              <Download className="w-4 h-4" />
              Download Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Zakat Details Dialog */}
      <Dialog open={isZakatDetailsOpen} onOpenChange={setIsZakatDetailsOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Zakat Details</DialogTitle>
            <DialogDescription>
              {selectedZakat && `Year ${selectedZakat.year}`}
            </DialogDescription>
          </DialogHeader>

          {selectedZakat && (
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Assets:</span>
                    <span className="font-medium">SAR {selectedZakat.totalAssets.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total Liabilities:</span>
                    <span className="font-medium text-red-600">SAR {selectedZakat.totalLiabilities.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-sm pt-2 border-t">
                    <span className="text-muted-foreground">Net Assets:</span>
                    <span className="font-medium">SAR {selectedZakat.netAssets.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pt-3 border-t-2">
                    <span className="font-medium">Zakat Due (2.5%):</span>
                    <span className="text-2xl font-bold text-blue-600">SAR {selectedZakat.zakatDue.toLocaleString()}</span>
                  </div>
                </CardContent>
              </Card>

              {selectedZakat.notes && (
                <div>
                  <Label>Notes</Label>
                  <p className="text-sm mt-1">{selectedZakat.notes}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusBadge(selectedZakat.status).color}>
                      {getStatusBadge(selectedZakat.status).label}
                    </Badge>
                  </div>
                </div>
                {selectedZakat.submissionDate && (
                  <div>
                    <Label className="text-muted-foreground">Submission Date</Label>
                    <p className="mt-1">{new Date(selectedZakat.submissionDate).toLocaleDateString('en-GB')}</p>
                  </div>
                )}
                {selectedZakat.paymentDate && (
                  <div>
                    <Label className="text-muted-foreground">Payment Date</Label>
                    <p className="mt-1">{new Date(selectedZakat.paymentDate).toLocaleDateString('en-GB')}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsZakatDetailsOpen(false)}>
              Close
            </Button>
            <Button className="gap-2">
              <Download className="w-4 h-4" />
              Download Report
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
