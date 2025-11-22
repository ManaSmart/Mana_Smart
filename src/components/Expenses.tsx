import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit, Download, FileText, Calendar, DollarSign, Tag, Filter, Trash2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Expenses as ExpenseRow } from "../../supabase/models/expenses";
import type { ExpensePayments as ExpensePaymentRow } from "../../supabase/models/expense_payments";

type ExpenseStatus = "Pending" | "Approved" | "Rejected" | "Paid" | "Partial";

interface ExpenseRecord {
  id: number;
  dbId: string;
  expenseNumber: string;
  date: string;
  category: string;
  description: string;
  baseAmount: number;
  taxRate: number | null;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  paymentMethod: string;
  paidTo: string;
  status: ExpenseStatus;
  receiptNumber?: string;
  notes?: string;
}

interface ExpensePaymentRecord {
  id: string;
  expenseId: string;
  amount: number;
  date: string;
  method: string;
  reference: string;
  notes?: string;
}

const DEFAULT_CATEGORIES = [
  "Office Supplies",
  "Transportation",
  "Utilities",
  "Marketing",
  "Maintenance",
  "Salaries",
  "Rent",
  "Other"
];

const categoryColors: Record<string, string> = {
  "Office Supplies": "bg-blue-100 text-blue-700 border-blue-200",
  "Transportation": "bg-green-100 text-green-700 border-green-200",
  "Utilities": "bg-yellow-100 text-yellow-700 border-yellow-200",
  "Marketing": "bg-purple-100 text-purple-700 border-purple-200",
  "Maintenance": "bg-orange-100 text-orange-700 border-orange-200",
  "Salaries": "bg-pink-100 text-pink-700 border-pink-200",
  "Rent": "bg-cyan-100 text-cyan-700 border-cyan-200",
  "Other": "bg-gray-100 text-gray-700 border-gray-200"
};

const statusColors: Record<ExpenseStatus, string> = {
  Pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  Approved: "bg-blue-100 text-blue-700 border-blue-200",
  Rejected: "bg-red-100 text-red-700 border-red-200",
  Paid: "bg-green-100 text-green-700 border-green-200",
  Partial: "bg-orange-100 text-orange-700 border-orange-200"
};

const paymentMethods = ["Cash", "Credit Card", "Bank Transfer", "Check"];

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString();
}

function computeStatus(total: number, paid: number): ExpenseStatus {
  if (paid >= total && total > 0) return "Paid";
  if (paid > 0 && paid < total) return "Partial";
  return "Pending";
}

function normalizeStatusFromDb(status: string | null | undefined): ExpenseStatus {
  switch ((status ?? "").toLowerCase()) {
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    case "pending":
    default:
      return "Pending";
  }
}

const EXPENSE_IDENTIFIER_PATTERN = /^EXP-(\d{4})-(\d{3,})$/i;

function parseExpenseIdentifier(identifier: string | null | undefined) {
  if (!identifier) return null;
  const match = identifier.match(EXPENSE_IDENTIFIER_PATTERN);
  if (!match) return null;
  return {
    year: Number(match[1]),
    sequence: Number(match[2])
  };
}

export function Expenses() {
  const dispatch = useAppDispatch();

  const dbExpenses = useAppSelector(selectors.expenses.selectAll) as ExpenseRow[];
  const expensesLoading = useAppSelector(selectors.expenses.selectLoading);
  const expensesError = useAppSelector(selectors.expenses.selectError);

  const dbExpensePayments = useAppSelector(selectors.expense_payments.selectAll) as ExpensePaymentRow[];
  const expensePaymentsLoading = useAppSelector(selectors.expense_payments.selectLoading);
  const expensePaymentsError = useAppSelector(selectors.expense_payments.selectError);

  useEffect(() => {
    dispatch(thunks.expenses.fetchAll(undefined));
    dispatch(thunks.expense_payments.fetchAll(undefined));
  }, [dispatch]);

  const expenseSequencesByYear = useMemo(() => {
    const accumulator = new Map<number, number>();
    dbExpenses.forEach((row) => {
      const parsed = parseExpenseIdentifier(row.receipt_number);
      if (!parsed) return;
      const currentMax = accumulator.get(parsed.year) ?? 0;
      if (parsed.sequence > currentMax) {
        accumulator.set(parsed.year, parsed.sequence);
      }
    });
    return accumulator;
  }, [dbExpenses]);

  const getNextExpenseIdentifier = useCallback(
    (expenseDate: string) => {
      const fallbackYear = new Date().getFullYear();
      const parsedDate = expenseDate ? new Date(expenseDate) : new Date();
      const year = Number.isFinite(parsedDate.getFullYear())
        ? parsedDate.getFullYear()
        : fallbackYear;
      const currentMax = expenseSequencesByYear.get(year) ?? 0;
      const nextSequence = currentMax + 1;
      return `EXP-${year}-${nextSequence.toString().padStart(3, "0")}`;
    },
    [expenseSequencesByYear]
  );

  const expenses = useMemo<ExpenseRecord[]>(() => {
    return dbExpenses.map((row, index) => {
      const baseAmount = Number(row.base_amount ?? 0);
      const taxAmount = Number(row.tax_amount ?? 0);
      const totalAmount = Number(row.total_amount ?? baseAmount + taxAmount);
      const paidAmount = Number(row.paid_amount ?? 0);
      const remainingAmount = Number(row.remaining_amount ?? Math.max(0, totalAmount - paidAmount));
      const expenseNumber = row.receipt_number
        ? row.receipt_number
        : `EXP-${(row.expense_id ?? "").slice(0, 8).toUpperCase()}`;

      const status = normalizeStatusFromDb(row.status) ?? computeStatus(totalAmount, paidAmount);

      return {
        id: index + 1,
        dbId: row.expense_id,
        expenseNumber,
        date: row.expense_date,
        category: row.category ?? "Other",
        description: row.description ?? "",
        baseAmount,
        taxRate: row.tax_rate,
        taxAmount,
        totalAmount,
        paidAmount,
        remainingAmount: Math.max(0, Number(remainingAmount.toFixed(2))),
        paymentMethod: row.payment_method ?? "",
        paidTo: row.paid_to ?? "",
        status,
        receiptNumber: row.receipt_number ?? undefined,
        notes: row.notes ?? undefined
      };
    });
  }, [dbExpenses]);

  const expenseLookup = useMemo(() => {
    const map = new Map<string, ExpenseRecord>();
    expenses.forEach((expense) => map.set(expense.dbId, expense));
    return map;
  }, [expenses]);

  const payments = useMemo<ExpensePaymentRecord[]>(() => {
    return dbExpensePayments
      .map((payment) => ({
        id: payment.expense_payment_id,
        expenseId: payment.expense_id,
        amount: Number(payment.payment_amount ?? 0),
        date: payment.payment_date,
        method: payment.payment_method ?? "",
        reference: payment.reference_number ?? "",
        notes: payment.notes ?? undefined
      }))
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [dbExpensePayments]);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [customCategories, setCustomCategories] = useState<string[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddCategoryDialogOpen, setIsAddCategoryDialogOpen] = useState(false);

  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseRecord | null>(null);

  const [date, setDate] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [taxRate, setTaxRate] = useState("15");
  const [taxAmount, setTaxAmount] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paidTo, setPaidTo] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [notes, setNotes] = useState("");

  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [isSavingPayment, setIsSavingPayment] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [viewExpense, setViewExpense] = useState<ExpenseRecord | null>(null);
  const [paymentForm, setPaymentForm] = useState({
    expenseId: "",
    amount: 0,
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "Cash",
    referenceNumber: "",
    notes: ""
  });

  const selectedExpenseForPayment = paymentForm.expenseId
    ? expenseLookup.get(paymentForm.expenseId) ?? null
    : null;

  const remainingBalance = selectedExpenseForPayment
    ? Math.max(0, selectedExpenseForPayment.totalAmount - selectedExpenseForPayment.paidAmount)
    : 0;

  const remainingBalanceLabel = remainingBalance > 0 ? "Remaining Balance" : "Already Paid";
  const remainingBalanceColor = remainingBalance > 0 ? "text-orange-600" : "text-green-600";

  const calculateTax = (baseAmount: string, rate: string) => {
    const amt = parseFloat(baseAmount) || 0;
    const r = parseFloat(rate) || 0;
    return ((amt * r) / 100).toFixed(2);
  };

  const handleAmountChange = (value: string) => {
    setAmount(value);
    const tax = calculateTax(value, taxRate);
    setTaxAmount(tax);
  };

  const handleTaxRateChange = (value: string) => {
    setTaxRate(value);
    const tax = calculateTax(amount, value);
    setTaxAmount(tax);
  };

  const derivedCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    expenses.forEach((expense) => {
      if (expense.category) set.add(expense.category);
    });
    customCategories.forEach((cat) => set.add(cat));
    return Array.from(set);
  }, [customCategories, expenses]);

  const filteredExpenses = useMemo(() => {
    return expenses.filter((expense) => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        expense.description.toLowerCase().includes(query) ||
        expense.expenseNumber.toLowerCase().includes(query) ||
        expense.paidTo.toLowerCase().includes(query);
    const matchesCategory = filterCategory === "all" || expense.category === filterCategory;
      const matchesStatus =
        filterStatus === "all" ||
        expense.status.toLowerCase() === filterStatus.toLowerCase();
    return matchesSearch && matchesCategory && matchesStatus;
  });
  }, [expenses, filterCategory, filterStatus, searchQuery]);

  const handleAddCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) {
      toast.error("Please enter category name");
      return;
    }
    if (derivedCategories.includes(trimmed)) {
      toast.error("Category already exists");
      return;
    }
    setCustomCategories((prev) => [...prev, trimmed]);
    categoryColors[trimmed] = "bg-gray-100 text-gray-700 border-gray-200";
    setIsAddCategoryDialogOpen(false);
    setNewCategoryName("");
    toast.success("Category added successfully!");
  };

  const resetExpenseForm = () => {
    setDate("");
    setCategory("");
    setDescription("");
    setAmount("");
    setTaxRate("15");
    setTaxAmount("");
    setPaidAmount("");
    setPaymentMethod("");
    setPaidTo("");
    setReceiptNumber("");
    setNotes("");
    setEditingExpense(null);
  };

  const openAddExpenseDialog = () => {
    resetExpenseForm();
    setIsAddDialogOpen(true);
  };

  const handleEditExpense = (expense: ExpenseRecord) => {
    setEditingExpense(expense);
    setDate(expense.date);
    setCategory(expense.category);
    setDescription(expense.description);
    setAmount(expense.baseAmount.toString());
    setTaxRate((expense.taxRate ?? 15).toString());
    setTaxAmount(expense.taxAmount.toString());
    setPaidAmount(expense.paidAmount.toString());
    setPaymentMethod(expense.paymentMethod);
    setPaidTo(expense.paidTo);
    setReceiptNumber(expense.receiptNumber ?? "");
    setNotes(expense.notes ?? "");
    setIsAddDialogOpen(true);
  };

  const handleSaveExpense = async () => {
    if (!date || !category || !description || !amount || !paymentMethod || !paidTo) {
      toast.error("Please fill all required fields");
      return;
    }

    const baseAmount = parseFloat(amount) || 0;
    const taxAmt = parseFloat(taxAmount || calculateTax(amount, taxRate)) || 0;
    const total = Number((baseAmount + taxAmt).toFixed(2));
    const paid = parseFloat(paidAmount) || 0;
    // const remaining = Number(Math.max(0, total - paid).toFixed(2));
    const normalizedStatus = computeStatus(total, paid);

    const normalizedReceiptInput = receiptNumber.trim();
    const existingReceipt = editingExpense?.receiptNumber
      ? editingExpense.receiptNumber.toUpperCase()
      : "";
    const fallbackDisplayedReceipt = editingExpense?.expenseNumber
      ? editingExpense.expenseNumber.toUpperCase()
      : "";
    const generatedIdentifier = getNextExpenseIdentifier(date).toUpperCase();

    let resolvedReceiptNumber: string | null;
    if (editingExpense) {
      if (normalizedReceiptInput) {
        resolvedReceiptNumber = normalizedReceiptInput.toUpperCase();
      } else if (existingReceipt) {
        resolvedReceiptNumber = existingReceipt;
      } else if (EXPENSE_IDENTIFIER_PATTERN.test(fallbackDisplayedReceipt)) {
        resolvedReceiptNumber = fallbackDisplayedReceipt;
      } else {
        resolvedReceiptNumber = generatedIdentifier;
      }
    } else {
      resolvedReceiptNumber = (normalizedReceiptInput || generatedIdentifier).toUpperCase();
    }

    const payload: Partial<ExpenseRow> = {
      expense_date: date,
      category,
      description,
      base_amount: baseAmount,
      tax_rate: parseFloat(taxRate) || null,
      paid_amount: paid,
      // remaining_amount: remaining,
      payment_method: paymentMethod,
      paid_to: paidTo,
      receipt_number: resolvedReceiptNumber || null,
      notes: notes || null,
      status: normalizedStatus
    };

    // If the tax_amount column is generated in the database, we must not send a value.
    // Only include it when the database schema allows manual inserts/updates.
    setIsSavingExpense(true);
    try {
      if (editingExpense) {
        await dispatch(
          thunks.expenses.updateOne({
            id: editingExpense.dbId,
            values: payload
          })
        ).unwrap();
        toast.success("Expense updated successfully!");
      } else {
        await dispatch(thunks.expenses.createOne(payload)).unwrap();
    toast.success("Expense added successfully!");
      }

      setIsAddDialogOpen(false);
      resetExpenseForm();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save expense");
    } finally {
      setIsSavingExpense(false);
    }
  };

  const handleDeleteExpense = async (expense: ExpenseRecord) => {
    if (!expense.dbId) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this expense?");
    if (!confirmDelete) return;

    try {
      await dispatch(thunks.expenses.deleteOne(expense.dbId)).unwrap();
      toast.success("Expense deleted successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete expense");
    }
  };

  const resetPaymentForm = () => {
    setPaymentForm({
      expenseId: "",
      amount: 0,
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "Cash",
      referenceNumber: "",
      notes: ""
    });
    setIsPaymentDialogOpen(false);
  };

  const openPaymentDialog = (expenseId?: string) => {
    setPaymentForm((prev) => ({
      ...prev,
      expenseId: expenseId ?? prev.expenseId ?? "",
      amount: 0,
      paymentDate: new Date().toISOString().split("T")[0]
    }));
    setIsPaymentDialogOpen(true);
  };

  const handleQuickPaymentFill = (mode: "half" | "full") => {
    if (!selectedExpenseForPayment) return;
    const base = Math.max(0, selectedExpenseForPayment.totalAmount - selectedExpenseForPayment.paidAmount);
    if (base <= 0) {
      setPaymentForm((prev) => ({ ...prev, amount: 0 }));
      return;
    }
    const value = mode === "half" ? base / 2 : base;
    setPaymentForm((prev) => ({ ...prev, amount: Number(value.toFixed(2)) }));
  };

  const handleRecordPayment = async () => {
    if (!paymentForm.expenseId || !paymentForm.amount || paymentForm.amount <= 0) {
      toast.error("Please select expense and enter payment amount");
      return;
    }
    if (!paymentForm.referenceNumber.trim()) {
      toast.error("Reference number is required");
      return;
    }

    const expense = expenseLookup.get(paymentForm.expenseId);
    if (!expense) {
      toast.error("Selected expense not found");
      return;
    }

    const remaining = Math.max(0, expense.totalAmount - expense.paidAmount);
    if (remaining <= 0) {
      toast.error("This expense is already fully paid");
      return;
    }
    if (paymentForm.amount > remaining) {
      toast.error("Payment amount cannot exceed remaining balance");
      return;
    }

    const paymentPayload: Partial<ExpensePaymentRow> = {
      expense_id: paymentForm.expenseId,
      payment_amount: paymentForm.amount,
      payment_date: paymentForm.paymentDate,
      payment_method: paymentForm.paymentMethod,
      reference_number: paymentForm.referenceNumber,
      notes: paymentForm.notes || null
    };

    const newPaidAmount = Number((expense.paidAmount + paymentForm.amount).toFixed(2));
    const newStatus = computeStatus(expense.totalAmount, newPaidAmount);

    setIsSavingPayment(true);
    try {
      await dispatch(thunks.expense_payments.createOne(paymentPayload as any)).unwrap();
      await dispatch(
        thunks.expenses.updateOne({
          id: paymentForm.expenseId,
          values: {
            paid_amount: newPaidAmount,
            status: newStatus
          }
        })
      ).unwrap();

      toast.success("Payment recorded successfully!");
      resetPaymentForm();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to record payment");
    } finally {
      setIsSavingPayment(false);
    }
  };

  const totalExpensesPaid = expenses
    .filter((expense) => expense.status === "Paid")
    .reduce((sum, expense) => sum + expense.totalAmount, 0);

  const pendingExpensesTotal = expenses
    .filter(
      (expense) =>
        expense.status === "Pending" ||
        expense.status === "Partial" ||
        expense.status === "Approved"
    )
    .reduce((sum, expense) => sum + expense.remainingAmount, 0);

  const monthlyExpenseCount = expenses.filter((expense) => {
    const monthDate = new Date(expense.date);
    const today = new Date();
    return monthDate.getMonth() === today.getMonth() && monthDate.getFullYear() === today.getFullYear();
  }).length;

  const loading = expensesLoading || expensePaymentsLoading;
  const dataErrors = [expensesError, expensePaymentsError].filter(Boolean) as string[];

  const tabValue = useMemo(() => {
    if (filteredExpenses.length === 0 && payments.length > 0) {
      return "payments";
    }
    return "expenses";
  }, [filteredExpenses.length, payments.length]);

  const [activeTab, setActiveTab] = useState<"expenses" | "payments">(tabValue);

  useEffect(() => {
    setActiveTab(tabValue);
  }, [tabValue]);

  const exportToExcel = () => {
    try {
      const exportData = filteredExpenses.map((expense) => ({
        "Expense Number": expense.expenseNumber,
        "Date": expense.date,
        "Category": expense.category,
        "Description": expense.description,
        "Base Amount (SAR)": expense.baseAmount,
        "Tax Rate (%)": expense.taxRate || 0,
        "Tax Amount (SAR)": expense.taxAmount,
        "Total Amount (SAR)": expense.totalAmount,
        "Paid Amount (SAR)": expense.paidAmount,
        "Remaining Amount (SAR)": expense.remainingAmount,
        "Status": expense.status,
        "Payment Method": expense.paymentMethod || "",
        "Paid To": expense.paidTo || "",
        "Receipt Number": expense.receiptNumber || "",
        "Notes": expense.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 18 }, { wch: 12 }, { wch: 15 }, { wch: 30 }, { wch: 15 },
        { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 15 }, { wch: 18 },
        { wch: 12 }, { wch: 15 }, { wch: 20 }, { wch: 15 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Expenses");
      const fileName = `expenses_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2 className="text-2xl font-semibold tracking-tight">Expenses Management</h2>
          <p className="text-muted-foreground mt-1">Track and manage purchase expenses</p>
          {loading && <p className="text-xs text-muted-foreground mt-1">Syncing latest data...</p>}
        </div>
        <div className="flex gap-2">
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
                <DialogDescription>Create a custom expense category</DialogDescription>
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
              <DialogFooter className="gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                  setIsAddCategoryDialogOpen(false);
                  setNewCategoryName("");
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleAddCategory}>Add Category</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button variant="outline" onClick={() => openPaymentDialog()} className="gap-2">
            <DollarSign className="h-4 w-4" />
            Add Payment
          </Button>

          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>

          <Button onClick={openAddExpenseDialog} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="h-4 w-4" />
                Add Expense
              </Button>
        </div>
      </div>

      {dataErrors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {dataErrors.map((error, index) => (
            <p key={index}>{error}</p>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{formatCurrency(totalExpensesPaid)} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">Fully paid expenses</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{formatCurrency(pendingExpensesTotal)} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting payment</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">This Month</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{monthlyExpenseCount}</div>
            <p className="text-xs text-muted-foreground mt-1">Transactions recorded</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as "expenses" | "payments")} className="space-y-4">
        <TabsList>
          <TabsTrigger value="expenses">Expenses</TabsTrigger>
          <TabsTrigger value="payments">Expense Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Expense Records</CardTitle>
                <div className="flex items-center gap-2">
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[180px]">
                  <Tag className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {derivedCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[160px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Partial">Partial</SelectItem>
                  <SelectItem value="Paid">Paid</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              </div>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search expenses..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Expense #</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Paid To</TableHead>
                      <TableHead>Base Amount</TableHead>
                      <TableHead>Tax</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Paid</TableHead>
                      <TableHead>Remaining</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredExpenses.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={12} className="text-center py-6 text-muted-foreground">
                          No expenses found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredExpenses.map((expense) => (
                        <TableRow key={expense.dbId}>
                          <TableCell className="font-mono text-sm">{expense.expenseNumber}</TableCell>
                          <TableCell>
                            {expense.date
                              ? new Date(expense.date).toLocaleDateString("en-GB", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric"
                                })
                              : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge className={categoryColors[expense.category] || categoryColors.Other}>
                              {expense.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="max-w-[180px] truncate">{expense.description}</div>
                          </TableCell>
                          <TableCell>{expense.paidTo}</TableCell>
                          <TableCell className="font-medium">{formatCurrency(expense.baseAmount)} ر.س</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatCurrency(expense.taxAmount)} ر.س
                          </TableCell>
                          <TableCell className="font-semibold text-red-600">
                            {formatCurrency(expense.totalAmount)} ر.س
                          </TableCell>
                          <TableCell className="text-green-600">
                            {formatCurrency(expense.paidAmount)} ر.س
                          </TableCell>
                          <TableCell
                            className={
                              expense.remainingAmount > 0
                                ? "text-orange-600 font-medium"
                                : "text-muted-foreground"
                            }
                          >
                            {formatCurrency(expense.remainingAmount)} ر.س
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[expense.status]}>{expense.status}</Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => openPaymentDialog(expense.dbId)}
                                title="Record Payment"
                              >
                                <DollarSign className="h-4 w-4 text-green-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditExpense(expense)}
                                title="Edit Expense"
                              >
                                <Edit className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteExpense(expense)}
                                title="Delete Expense"
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => {
                                  setViewExpense(expense);
                                  setIsViewDialogOpen(true);
                                }}
                                title="View Receipt"
                              >
                                <FileText className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="icon" title="Download Receipt">
                                <Download className="h-4 w-4" />
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

        <TabsContent value="payments" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Expense Payments</CardTitle>
                  <CardDescription>Reference log for recorded expense payments</CardDescription>
                </div>
                <Button variant="outline" onClick={() => setIsPaymentDialogOpen(true)}>
                  <DollarSign className="mr-2 h-4 w-4" />
                  Record Payment
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Payment Date</TableHead>
                      <TableHead>Expense</TableHead>
                      <TableHead>Vendor</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Reference</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">
                          No payments recorded yet
                        </TableCell>
                      </TableRow>
                    ) : (
                      payments.map((payment) => {
                        const expense = expenseLookup.get(payment.expenseId);
                        return (
                          <TableRow key={payment.id}>
                            <TableCell>
                              {payment.date
                                ? new Date(payment.date).toLocaleDateString("en-GB")
                                : "-"}
                            </TableCell>
                            <TableCell>
                              {expense ? `${expense.expenseNumber} - ${expense.description}` : "Unknown Expense"}
                            </TableCell>
                            <TableCell>{expense?.paidTo ?? "-"}</TableCell>
                            <TableCell className="font-medium">{formatCurrency(payment.amount)} ر.س</TableCell>
                            <TableCell>
                              <Badge variant="outline">{payment.method || "N/A"}</Badge>
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {payment.reference}
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
      </Tabs>

      <Dialog
        open={isAddDialogOpen}
        onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) resetExpenseForm();
        }}
      >
            <DialogContent className="max-w-3xl">
              <DialogHeader>
            <DialogTitle>{editingExpense ? "Edit Expense" : "Add New Expense"}</DialogTitle>
                <DialogDescription>Enter expense details</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                <Label htmlFor="expenseDate">Date *</Label>
                <Input
                  id="expenseDate"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="expenseCategory">Category *</Label>
                    <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="expenseCategory">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                    {derivedCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
              <Label htmlFor="expenseDescription">Description *</Label>
                  <Textarea 
                id="expenseDescription"
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Enter expense description"
                    rows={3}
                  />
                </div>

                <div className="p-4 bg-muted/50 rounded-lg space-y-4">
                  <h4 className="font-medium">Amount Details</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                  <Label htmlFor="expenseAmount">Base Amount (SAR) *</Label>
                      <Input 
                    id="expenseAmount"
                        type="number" 
                        value={amount} 
                        onChange={(e) => handleAmountChange(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                  <Label htmlFor="expenseTaxRate">Tax Rate (%)</Label>
                      <Input 
                    id="expenseTaxRate"
                        type="number" 
                        value={taxRate} 
                        onChange={(e) => handleTaxRateChange(e.target.value)}
                        placeholder="15"
                      />
                    </div>
                    <div className="space-y-2">
                  <Label htmlFor="expenseTaxAmount">Tax Amount (SAR)</Label>
                      <Input 
                    id="expenseTaxAmount"
                        type="number" 
                        value={taxAmount}
                        onChange={(e) => setTaxAmount(e.target.value)}
                        placeholder="0.00"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Total Amount (SAR)</Label>
                      <Input 
                        value={((parseFloat(amount) || 0) + (parseFloat(taxAmount) || 0)).toFixed(2)}
                        disabled
                        className="bg-muted font-bold"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                <Label htmlFor="expensePaidAmount">Paid Amount (SAR)</Label>
                    <Input 
                  id="expensePaidAmount"
                      type="number" 
                      value={paidAmount} 
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Remaining Amount (SAR)</Label>
                    <Input 
                      value={Math.max(0, (parseFloat(amount) || 0) + (parseFloat(taxAmount) || 0) - (parseFloat(paidAmount) || 0)).toFixed(2)}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                <Label htmlFor="expensePaymentMethod">Payment Method *</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger id="expensePaymentMethod">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                <Label htmlFor="expensePaidTo">Paid To *</Label>
                    <Input 
                  id="expensePaidTo"
                      value={paidTo} 
                      onChange={(e) => setPaidTo(e.target.value)}
                      placeholder="Vendor/Company name"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                <Label htmlFor="expenseReceiptNumber">Receipt Number</Label>
                    <Input 
                  id="expenseReceiptNumber"
                      value={receiptNumber} 
                      onChange={(e) => setReceiptNumber(e.target.value)}
                      placeholder="REC-1234"
                    />
                  </div>
                </div>

                <div className="space-y-2">
              <Label htmlFor="expenseNotes">Notes</Label>
                  <Textarea 
                id="expenseNotes"
                    value={notes} 
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional notes"
                    rows={2}
                  />
                </div>
              </div>
          <DialogFooter className="gap-2 pt-4">
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveExpense}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={isSavingExpense}
            >
              {isSavingExpense ? "Saving..." : editingExpense ? "Update Expense" : "Add Expense"}
            </Button>
          </DialogFooter>
            </DialogContent>
          </Dialog>

      <Dialog
        open={isPaymentDialogOpen}
        onOpenChange={(open) => {
          setIsPaymentDialogOpen(open);
          if (!open) resetPaymentForm();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Record Expense Payment</DialogTitle>
            <DialogDescription>
              Record a payment against an expense (reference only, suppliers are unaffected)
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="paymentExpense">Expense *</Label>
              <Select
                value={paymentForm.expenseId}
                onValueChange={(value) => setPaymentForm((prev) => ({ ...prev, expenseId: value }))}
              >
                <SelectTrigger id="paymentExpense">
                  <SelectValue placeholder="Select expense" />
                </SelectTrigger>
                <SelectContent>
                  {expenses.map((expense) => (
                    <SelectItem key={expense.dbId} value={expense.dbId}>
                      {expense.expenseNumber} • {expense.paidTo} ({formatCurrency(expense.remainingAmount)} ر.س remaining)
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
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, amount: Number(e.target.value) }))
                  }
                  placeholder="0.00"
                />
                {selectedExpenseForPayment && (
                  <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground gap-2">
                    <span>
                      {remainingBalanceLabel}:{" "}
                      <span className={`font-semibold ${remainingBalanceColor}`}>
                        {formatCurrency(remainingBalance)} ر.س
                      </span>
                    </span>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                        onClick={() => handleQuickPaymentFill("half")}
                        disabled={remainingBalance <= 0}
                      >
                        50%
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 px-3 text-xs"
                        onClick={() => handleQuickPaymentFill("full")}
                        disabled={remainingBalance <= 0}
                      >
                        Full
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentDate">Payment Date *</Label>
                <Input
                  id="paymentDate"
                  type="date"
                  value={paymentForm.paymentDate}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, paymentDate: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Method *</Label>
                <Select
                  value={paymentForm.paymentMethod}
                  onValueChange={(value) =>
                    setPaymentForm((prev) => ({ ...prev, paymentMethod: value }))
                  }
                >
                  <SelectTrigger id="paymentMethod">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    {paymentMethods.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentReference">Reference *</Label>
                <Input
                  id="paymentReference"
                  value={paymentForm.referenceNumber}
                  onChange={(e) =>
                    setPaymentForm((prev) => ({ ...prev, referenceNumber: e.target.value }))
                  }
                  placeholder="TRX-0001 or CHE-1234"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="paymentNotes">Notes</Label>
              <Textarea
                id="paymentNotes"
                value={paymentForm.notes}
                onChange={(e) =>
                  setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))
                }
                placeholder="Payment details..."
                rows={3}
              />
          </div>
                      </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetPaymentForm}>
              Cancel
                        </Button>
            <Button onClick={handleRecordPayment} disabled={isSavingPayment}>
              {isSavingPayment ? "Recording..." : "Record Payment"}
                        </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isViewDialogOpen}
        onOpenChange={(open) => {
          setIsViewDialogOpen(open);
          if (!open) setViewExpense(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Expense Receipt</DialogTitle>
            <DialogDescription>
              {viewExpense
                ? `${viewExpense.expenseNumber} • ${new Date(viewExpense.date).toLocaleDateString("en-GB")}`
                : "Detailed expense information"}
            </DialogDescription>
          </DialogHeader>

          {viewExpense && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardContent className="pt-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Vendor</span>
                      <span className="font-medium">{viewExpense.paidTo || "-"}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Category</span>
                      <Badge className={categoryColors[viewExpense.category] || categoryColors.Other}>
                        {viewExpense.category}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Payment Method</span>
                      <span className="font-medium">{viewExpense.paymentMethod || "-"}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Status</span>
                      <Badge className={statusColors[viewExpense.status]}>{viewExpense.status}</Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Receipt Number</span>
                      <span className="font-medium">{viewExpense.receiptNumber || "-"}</span>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="pt-4 space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Base Amount</span>
                      <span className="font-medium text-blue-600">
                        {formatCurrency(viewExpense.baseAmount)} ر.س
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tax Amount</span>
                      <span className="font-medium text-blue-600">
                        {formatCurrency(viewExpense.taxAmount)} ر.س
                      </span>
                    </div>
                    <div className="flex justify-between border-t pt-3">
                      <span className="text-muted-foreground">Total</span>
                      <span className="text-xl font-bold text-red-600">
                        {formatCurrency(viewExpense.totalAmount)} ر.س
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Paid</span>
                      <span className="font-medium text-green-600">
                        {formatCurrency(viewExpense.paidAmount)} ر.س
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Remaining</span>
                      <span
                        className={
                          viewExpense.remainingAmount > 0
                            ? "font-medium text-orange-600"
                            : "font-medium text-muted-foreground"
                        }
                      >
                        {formatCurrency(viewExpense.remainingAmount)} ر.س
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardContent className="pt-4 space-y-3 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Description</Label>
                    <p className="mt-1">{viewExpense.description || "-"}</p>
                  </div>
                  {viewExpense.notes && (
                    <div>
                      <Label className="text-muted-foreground">Notes</Label>
                      <p className="mt-1">{viewExpense.notes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
              Close
            </Button>
            <Button className="gap-2" disabled>
              <Download className="h-4 w-4" />
              Download Receipt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


