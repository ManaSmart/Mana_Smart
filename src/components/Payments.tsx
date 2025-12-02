import { useEffect, useMemo, useState } from "react";
import { Plus, Search, DollarSign, CheckCircle, AlertCircle, Clock, Download, Receipt } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader } from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Invoices as InvoiceRow } from "../../supabase/models/invoices";
import type { Payments as PaymentRecord } from "../../supabase/models/payments";
import type { Customers } from "../../supabase/models/customers";
import { getPrintLogo } from "../lib/getPrintLogo";

interface PaymentDisplay {
  id: number;
  invoiceId: string;
  invoiceNumber: string;
  customer: string;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  dueDate: string | null;
  paymentDate: string | null;
  status: "Paid" | "Partial" | "Pending" | "Overdue";
  statusKey: "paid" | "partial" | "pending" | "overdue";
  paymentMethod: string | null;
  payments: PaymentRecord[];
}

const paymentMethodOptions = [
  { value: "cash", label: "💵 Cash - نقدي" },
  { value: "bank_transfer", label: "🏦 Bank Transfer - تحويل بنكي" },
  { value: "credit_card", label: "💳 Credit Card - بطاقة ائتمان" },
  { value: "cheque", label: "📝 Cheque - شيك" },
] as const;

const allowedPaymentMethods = new Set(paymentMethodOptions.map((option) => option.value));

const paymentMethodLabels = paymentMethodOptions.reduce<Record<string, string>>((acc, option) => {
  acc[option.value] = option.label;
  return acc;
}, {});

const getStatusColor = (status: string) => {
  switch (status) {
    case "Paid":
      return "default";
    case "Partial":
      return "outline";
    case "Pending":
      return "secondary";
    case "Overdue":
      return "destructive";
    default:
      return "secondary";
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "Paid":
      return CheckCircle;
    case "Pending":
      return Clock;
    case "Overdue":
      return AlertCircle;
    default:
      return Clock;
  }
};

export function Payments() {
  const dispatch = useAppDispatch();
  const dbInvoices = useAppSelector(selectors.invoices.selectAll) as InvoiceRow[];
  const dbPayments = useAppSelector(selectors.payments.selectAll) as PaymentRecord[];
  const dbCustomers = useAppSelector(selectors.customers.selectAll) as Customers[];
  const invoicesLoading = useAppSelector(selectors.invoices.selectLoading);
  const paymentsLoading = useAppSelector(selectors.payments.selectLoading);
  const customersLoading = useAppSelector(selectors.customers.selectLoading);
  const isLoading = invoicesLoading || paymentsLoading || customersLoading;

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentDisplay | null>(null);

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
      }
    >();
    sorted.forEach((invoice, index) => {
      const invoiceDate = invoice.invoice_date ?? invoice.created_at ?? null;
      const invoiceYear = invoiceDate ? new Date(invoiceDate).getFullYear() : new Date().getFullYear();
      const invoiceNumber = `INV-${invoiceYear}-${String(index + 1).padStart(3, "0")}`;
      map.set(invoice.invoice_id, {
        invoiceNumber,
        sequence: index + 1,
      });
    });
    return map;
  }, [dbInvoices]);

  useEffect(() => {
    dispatch(thunks.invoices.fetchAll(undefined));
    dispatch(thunks.payments.fetchAll(undefined));
    dispatch(thunks.customers.fetchAll(undefined));
  }, [dispatch]);

  const payments = useMemo<PaymentDisplay[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parseTimestamp = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    // Sort by created_at first (stable, never changes) then by invoice_id for consistent ordering
    const sortedInvoices = [...dbInvoices].sort((a, b) => {
      const timeA = parseTimestamp(a.created_at);
      const timeB = parseTimestamp(b.created_at);
      if (timeA !== timeB) return timeA - timeB;
      // If created_at is the same, sort by invoice_id for stable ordering
      return a.invoice_id.localeCompare(b.invoice_id);
    });

    return sortedInvoices.map((invoice, idx) => {
      const customer = dbCustomers.find((c) => c.customer_id === invoice.customer_id);
      const invoiceItems = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : [];
      const relatedPayments = dbPayments
        .filter((payment) => payment.invoice_id === invoice.invoice_id)
        .slice()
        .sort((a, b) => parseTimestamp(b.payment_date) - parseTimestamp(a.payment_date));

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

      const subtotalPlusTax = Number(invoice.subtotal ?? 0) + Number(invoice.tax_amount ?? 0);
      let amount = Number(invoice.total_amount ?? 0);
      if (amount <= 0) {
        if (subtotalPlusTax > 0) {
          amount = subtotalPlusTax;
        } else if (calculatedItemsTotal > 0) {
          amount = calculatedItemsTotal;
        }
      }

      const paymentsSum = relatedPayments.reduce(
        (sum, payment) => sum + Number(payment.paid_amount ?? 0),
        0
      );
      let paidAmount = paymentsSum > 0 ? paymentsSum : Number(invoice.paid_amount ?? 0);
      if (amount > 0 && paidAmount - amount > 0.0001) {
        paidAmount = amount;
      }

      const remainingAmount = Math.max(0, amount - paidAmount);
      // Round remaining amount to 2 decimal places for display
      const roundedRemaining = Number(remainingAmount.toFixed(2));
      // Treat very small amounts (floating point precision errors) as 0
      const displayRemaining = roundedRemaining <= 0.01 ? 0 : roundedRemaining;
      const lastPayment = relatedPayments[0] ?? null;
      const dueDate = invoice.due_date ?? null;

      let status: PaymentDisplay["status"];
      // Use same threshold as Invoices.tsx - 0.01 for "paid" status
      if (displayRemaining <= 0.01 && amount > 0) {
        status = "Paid";
      } else {
        const due = dueDate ? new Date(dueDate) : null;
        if (due) due.setHours(0, 0, 0, 0);
        if (due && due.getTime() < today.getTime()) {
          status = "Overdue";
        } else if (paidAmount > 0) {
          status = "Partial";
        } else {
          status = "Pending";
        }
      }

      const invoiceDate = invoice.invoice_date ?? invoice.created_at ?? null;
      const invoiceYear = invoiceDate ? new Date(invoiceDate).getFullYear() : new Date().getFullYear();
      const invoiceSequence = invoiceNumberMap.get(invoice.invoice_id);
      const invoiceNumber = invoiceSequence?.invoiceNumber ?? `INV-${invoiceYear}-${String(idx + 1).padStart(3, "0")}`;
      const sequenceId = invoiceSequence?.sequence ?? idx + 1;

      return {
        id: sequenceId,
        invoiceId: invoice.invoice_id,
        invoiceNumber,
        customer: customer?.customer_name ?? "Unknown Customer",
        amount,
        paidAmount,
        remainingAmount: displayRemaining,
        dueDate,
        paymentDate: lastPayment?.payment_date ?? null,
        status,
        statusKey: status.toLowerCase() as PaymentDisplay["statusKey"],
        paymentMethod: lastPayment?.payment_method ?? null,
        payments: relatedPayments
          .slice()
          .sort((a, b) => parseTimestamp(a.payment_date) - parseTimestamp(b.payment_date)),
      };
    });
  }, [dbInvoices, dbPayments, dbCustomers]);

  const [filterStatus, setFilterStatus] = useState("all");
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [formData, setFormData] = useState({
    invoiceId: "",
    invoiceNumber: "",
    amount: "",
    paymentDate: new Date().toISOString().split("T")[0],
    paymentMethod: "",
    reference: "",
  });

  const totalPaid = payments.reduce((sum, p) => sum + p.paidAmount, 0);
  
  const totalRemaining = payments.reduce((sum, p) => sum + p.remainingAmount, 0);

  const totalPending = payments
    .filter((p) => p.status === "Pending")
    .reduce((sum, p) => sum + p.amount, 0);

  const totalOverdue = payments
    .filter((p) => p.status === "Overdue")
    .reduce((sum, p) => sum + p.amount, 0);
    
  const totalPartial = payments
    .filter((p) => p.status === "Partial")
    .reduce((sum, p) => sum + p.remainingAmount, 0);

  const handleRecordPayment = (payment: PaymentDisplay) => {
    setSelectedPayment(payment);
    setFormData({
      invoiceId: payment.invoiceId,
      invoiceNumber: payment.invoiceNumber,
      amount: payment.remainingAmount > 0 ? payment.remainingAmount.toString() : "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "",
      reference: "",
    });
    setInvoiceSearchQuery("");
    setIsAddDialogOpen(true);
  };

  const handleNewPayment = () => {
    setSelectedPayment(null);
    setFormData({
      invoiceId: "",
      invoiceNumber: "",
      amount: "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "",
      reference: "",
    });
    setInvoiceSearchQuery("");
    setIsAddDialogOpen(true);
  };

  const handlePrint = async (payment: any) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Failed to open print window");
      return;
    }

    // Load logo from Settings
    const logoToUse = await getPrintLogo();

    const html = `
      <!DOCTYPE html>
      <html dir="rtl">
      <head>
        <meta charset="UTF-8">
        <title>Payment Receipt - إيصال دفع ${payment.invoiceNumber}</title>
        <style>
          @page { size: A4; margin: 20mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            direction: rtl;
            color: #000;
            padding: 30px;
            line-height: 1.6;
          }
          .header {
            text-align: center;
            margin-bottom: 40px;
            padding-bottom: 20px;
            border-bottom: 4px solid #3b82f6;
          }
          .title {
            font-size: 32px;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 8px;
          }
          .subtitle {
            font-size: 20px;
            color: #6b7280;
          }
          .receipt-number {
            background: #3b82f6;
            color: white;
            padding: 8px 20px;
            border-radius: 20px;
            display: inline-block;
            margin-top: 15px;
            font-weight: 600;
          }
          .info-section {
            margin: 25px 0;
            background: #f9fafb;
            padding: 25px;
            border-radius: 12px;
            border: 2px solid #e5e7eb;
          }
          .info-row {
            display: flex;
            justify-content: space-between;
            padding: 12px 0;
            border-bottom: 1px solid #e5e7eb;
          }
          .info-row:last-child {
            border-bottom: none;
          }
          .info-label {
            font-weight: 600;
            color: #4b5563;
            flex: 0 0 200px;
          }
          .info-value {
            color: #1f2937;
            flex: 1;
            text-align: left;
          }
          .amount-section {
            margin: 30px 0;
            padding: 25px;
            background: linear-gradient(135deg, #10b981 0%, #059669 100%);
            color: white;
            border-radius: 12px;
            text-align: center;
          }
          .amount-label {
            font-size: 18px;
            margin-bottom: 10px;
            opacity: 0.9;
          }
          .amount-value {
            font-size: 48px;
            font-weight: bold;
          }
          .status-badge {
            background: #dcfce7;
            color: #166534;
            padding: 8px 20px;
            border-radius: 20px;
            display: inline-block;
            font-weight: 600;
            margin-top: 10px;
          }
          .footer {
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e5e7eb;
            text-align: center;
            color: #6b7280;
            font-size: 14px;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoToUse ? `<img src="${logoToUse}" alt="Company Logo" style="max-width: 120px; max-height: 80px; margin-bottom: 15px; display: block; margin-left: auto; margin-right: auto;">` : ''}
          <div class="title">إيصال دفع</div>
          <div class="subtitle">PAYMENT RECEIPT</div>
          <div class="receipt-number">رقم الإيصال: ${payment.invoiceNumber}</div>
        </div>
        
        <div class="info-section">
          <div class="info-row">
            <span class="info-label">رقم الفاتورة / Invoice Number:</span>
            <span class="info-value">${payment.invoiceNumber}</span>
          </div>
          <div class="info-row">
            <span class="info-label">اسم العميل / Customer Name:</span>
            <span class="info-value">${payment.customer}</span>
          </div>
          <div class="info-row">
            <span class="info-label">تاريخ الاستحقاق / Due Date:</span>
            <span class="info-value">${new Date(payment.dueDate).toLocaleDateString('ar-SA')} - ${new Date(payment.dueDate).toLocaleDateString('en-GB')}</span>
          </div>
          <div class="info-row">
            <span class="info-label">تاريخ الدفع / Payment Date:</span>
            <span class="info-value">${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString('ar-SA') + ' - ' + new Date(payment.paymentDate).toLocaleDateString('en-GB') : 'غير محدد - Not Set'}</span>
          </div>
          <div class="info-row">
            <span class="info-label">طريقة الدفع / Payment Method:</span>
            <span class="info-value">${
              payment.paymentMethod
                ? (paymentMethodLabels[payment.paymentMethod] ?? payment.paymentMethod)
                : 'غير محدد - Not Set'
            }</span>
          </div>
          <div class="info-row">
            <span class="info-label">الحالة / Status:</span>
            <span class="info-value">
              <span class="status-badge">
                ${payment.status === 'Paid' ? '✓ مدفوعة بالكامل - Fully Paid' : payment.status === 'Partial' ? '💰 دفع جزئي - Partial Payment' : payment.status === 'Pending' ? '⏱ قيد الانتظار - Pending' : '⚠ متأخرة - Overdue'}
              </span>
            </span>
          </div>
        </div>

        <div style="margin: 25px 0; background: #f9fafb; padding: 20px; border-radius: 12px; border: 2px solid #e5e7eb;">
          <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px; text-align: center;">
            <div style="background: white; padding: 15px; border-radius: 8px; border: 2px solid #3b82f6;">
              <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">المبلغ الإجمالي / Total Amount</div>
              <div style="font-size: 24px; font-weight: bold; color: #3b82f6;">${payment.amount.toLocaleString()} ر.س</div>
              <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">SAR ${payment.amount.toLocaleString()}</div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 8px; border: 2px solid #10b981;">
              <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">المبلغ المدفوع / Paid Amount</div>
              <div style="font-size: 24px; font-weight: bold; color: #10b981;">${payment.paidAmount.toLocaleString()} ر.س</div>
              <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">SAR ${payment.paidAmount.toLocaleString()}</div>
            </div>
            <div style="background: white; padding: 15px; border-radius: 8px; border: 2px solid #f97316;">
              <div style="font-size: 14px; color: #6b7280; margin-bottom: 8px;">المبلغ المتبقي / Remaining</div>
              <div style="font-size: 24px; font-weight: bold; color: #f97316;">${payment.remainingAmount.toLocaleString()} ر.س</div>
              <div style="font-size: 14px; color: #6b7280; margin-top: 5px;">SAR ${payment.remainingAmount.toLocaleString()}</div>
            </div>
          </div>
        </div>
        
        <div class="footer">
          <p>طُبع بتاريخ: ${new Date().toLocaleDateString('ar-SA')} | Printed on: ${new Date().toLocaleDateString('en-GB')}</p>
          <p style="margin-top: 10px;">شكراً لتعاملكم معنا | Thank you for your business</p>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
    toast.success(`Printing receipt for ${payment.invoiceNumber}`);
  };

  const handleSavePayment = async () => {
    if (!formData.invoiceId) {
      toast.error("Please select an invoice");
      return;
    }
    if (!formData.amount || !formData.paymentDate || !formData.paymentMethod) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!formData.paymentMethod || !allowedPaymentMethods.has(formData.paymentMethod as "cash" | "bank_transfer" | "credit_card" | "cheque")) {
      toast.error("Selected payment method is not supported. Please choose another method.");
      return;
    }

    const paymentAmount = parseFloat(formData.amount);
    if (Number.isNaN(paymentAmount) || paymentAmount <= 0) {
      toast.error("Please enter a valid payment amount");
      return;
    }

    const invoice = dbInvoices.find((inv) => inv.invoice_id === formData.invoiceId);
    if (!invoice) {
      toast.error("Invoice not found");
      return;
    }

    const invoiceItems = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : [];
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

    const subtotalPlusTax = Number(invoice.subtotal ?? 0) + Number(invoice.tax_amount ?? 0);
    let totalAmount = Number(invoice.total_amount ?? 0);
    if (totalAmount <= 0) {
      if (subtotalPlusTax > 0) {
        totalAmount = subtotalPlusTax;
      } else if (calculatedItemsTotal > 0) {
        totalAmount = calculatedItemsTotal;
      }
    }

    const relatedPayments = dbPayments.filter((payment) => payment.invoice_id === invoice.invoice_id);
    const currentPaidFromPayments = relatedPayments.reduce(
      (sum, payment) => sum + Number(payment.paid_amount ?? 0),
      0
    );
    // Always prefer the sum of payments as the source of truth
    // Only fall back to invoice.paid_amount if no payments exist yet
    let currentPaid = currentPaidFromPayments;
    if (currentPaid <= 0) {
      // If no payments found, use invoice's paid_amount
      currentPaid = Number(invoice.paid_amount ?? 0);
    }
    // Ensure we don't exceed total amount
    if (totalAmount > 0 && currentPaid - totalAmount > 0.0001) {
      currentPaid = totalAmount;
    }

    let remainingBefore = Math.max(0, totalAmount - currentPaid);

    if (paymentAmount - remainingBefore > 0.0001) {
      toast.error("Payment amount cannot exceed remaining amount");
      return;
    }

    try {
      await dispatch(
        thunks.payments.createOne({
          invoice_id: invoice.invoice_id,
          payment_date: formData.paymentDate,
          paid_amount: paymentAmount,
          payment_method: formData.paymentMethod,
          reference_number: formData.reference || null,
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
    const uncappedNewPaid = currentPaid + paymentAmount;
    const newPaidAmount =
      totalAmount > 0 ? Math.min(uncappedNewPaid, totalAmount) : uncappedNewPaid;
    const newRemainingAmount = Math.max(0, totalAmount - newPaidAmount);
    
    // Round to 2 decimal places to avoid floating point precision issues
    const roundedRemaining = Number(newRemainingAmount.toFixed(2));
    const roundedPaid = Number(newPaidAmount.toFixed(2));
    
    // Determine status: if remaining is 0 or very small (<= 0.01), mark as paid
    // Also check if paid amount equals or exceeds total amount
    const paymentStatus = (roundedRemaining <= 0.01 || roundedPaid >= totalAmount - 0.01) ? "paid" : "partial";

    try {
      await dispatch(
        thunks.invoices.updateOne({
          id: invoice.invoice_id,
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

    setIsAddDialogOpen(false);
    setSelectedPayment(null);
    setInvoiceSearchQuery("");
    setFormData({
      invoiceId: "",
      invoiceNumber: "",
      amount: "",
      paymentDate: new Date().toISOString().split("T")[0],
      paymentMethod: "",
      reference: "",
    });

    toast.success(`Payment of ${paymentAmount.toLocaleString()} ر.س recorded successfully!`);
  };

  const filteredPayments = payments.filter((payment) => {
    const matchesSearch =
      payment.invoiceNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      payment.customer.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || payment.statusKey === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const exportToExcel = () => {
    try {
      const exportData = filteredPayments.map((payment) => ({
        "Invoice Number": payment.invoiceNumber,
        "Customer": payment.customer,
        "Total Amount (SAR)": payment.amount,
        "Paid Amount (SAR)": payment.paidAmount,
        "Remaining Amount (SAR)": payment.remainingAmount,
        "Due Date": payment.dueDate || "",
        "Payment Date": payment.paymentDate || "",
        "Payment Method": payment.paymentMethod ? paymentMethodLabels[payment.paymentMethod] ?? payment.paymentMethod : "",
        "Status": payment.status,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 18 }, { wch: 25 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
        { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payments");
      const fileName = `payments_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2>Payment Management</h2>
          <p className="text-muted-foreground mt-1">Collections, invoices, and payments</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white" onClick={handleNewPayment}>
            <Plus className="h-4 w-4" />
            Record New Payment
          </Button>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
          setIsAddDialogOpen(open);
          if (!open) {
            setSelectedPayment(null);
            setInvoiceSearchQuery("");
            setFormData({
              invoiceId: "",
              invoiceNumber: "",
              amount: "",
              paymentDate: new Date().toISOString().split("T")[0],
              paymentMethod: "",
              reference: "",
            });
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {selectedPayment ? `Record Payment for ${selectedPayment.invoiceNumber}` : 'Record New Payment'}
              </DialogTitle>
              <DialogDescription>
                {selectedPayment ? `Record payment received from ${selectedPayment.customer}` : 'Enter received payment details'}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {selectedPayment && (
                <Card className="bg-gradient-to-br from-blue-50 to-purple-50 border-2">
                  <CardContent className="pt-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="text-center p-3 bg-white rounded-lg border">
                        <Label className="text-xs text-muted-foreground">Total Amount</Label>
                        <p className="text-xl font-bold text-blue-600">{selectedPayment.amount.toLocaleString()} ر.س</p>
                      </div>
                      <div className="text-center p-3 bg-white rounded-lg border">
                        <Label className="text-xs text-muted-foreground">Paid Amount</Label>
                        <p className="text-xl font-bold text-green-600">{selectedPayment.paidAmount.toLocaleString()} ر.س</p>
                      </div>
                      <div className="text-center p-3 bg-white rounded-lg border">
                        <Label className="text-xs text-muted-foreground">Remaining</Label>
                        <p className="text-xl font-bold text-orange-600">{selectedPayment.remainingAmount.toLocaleString()} ر.س</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="invoice">Invoice Number</Label>
                  {selectedPayment ? (
                    <div className="space-y-2">
                      <Input 
                        id="invoice"
                        value={formData.invoiceNumber}
                        disabled
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">
                        Customer: {selectedPayment.customer}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Input
                        placeholder="Search invoice number..."
                        value={invoiceSearchQuery}
                        onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                        className="mb-2"
                      />
                      <Select
                        value={formData.invoiceId}
                        onValueChange={(value) => {
                          const payment = payments.find((p) => p.invoiceId === value);
                          if (payment) {
                            setSelectedPayment(payment);
                            setFormData((prev) => ({
                              ...prev,
                              invoiceId: payment.invoiceId,
                              invoiceNumber: payment.invoiceNumber,
                              amount: payment.remainingAmount > 0 ? payment.remainingAmount.toString() : "",
                            }));
                          } else {
                            setSelectedPayment(null);
                            setFormData((prev) => ({
                              ...prev,
                              invoiceId: value,
                              invoiceNumber: "",
                              amount: "",
                            }));
                          }
                        }}
                      >
                        <SelectTrigger id="invoice">
                          <SelectValue placeholder="Select invoice" />
                        </SelectTrigger>
                        <SelectContent>
                          {payments
                            .filter(p => p.remainingAmount > 0.01)
                            .filter(p => 
                              invoiceSearchQuery === "" || 
                              p.invoiceNumber.toLowerCase().includes(invoiceSearchQuery.toLowerCase()) ||
                              p.customer.toLowerCase().includes(invoiceSearchQuery.toLowerCase())
                            )
                            .map((payment) => (
                              <SelectItem key={payment.id} value={payment.invoiceId}>
                                <div className="flex items-center justify-between gap-2 w-full">
                                  <span>{payment.invoiceNumber} - {payment.customer}</span>
                                  <span className="text-xs">
                                    <span className="text-green-600">Paid: {payment.paidAmount.toLocaleString()}</span> | 
                                    <span className="text-orange-600 ml-1">Remaining: {payment.remainingAmount.toLocaleString()} ر.س</span>
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="amount">Amount Paid (SAR)</Label>
                  <Input 
                    id="amount" 
                    type="number"
                    step="0.01"
                    placeholder="0.00" 
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  />
                  {selectedPayment && selectedPayment.remainingAmount > 0.01 && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, amount: (selectedPayment.remainingAmount / 2).toFixed(2) })}
                      >
                        50%
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setFormData({ ...formData, amount: selectedPayment.remainingAmount.toString() })}
                      >
                        Full Amount
                      </Button>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="payment-date">Payment Date</Label>
                  <Input 
                    id="payment-date" 
                    type="date"
                    value={formData.paymentDate}
                    onChange={(e) => setFormData({ ...formData, paymentDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="payment-method">Payment Method</Label>
                  <Select value={formData.paymentMethod} onValueChange={(value) => setFormData({ ...formData, paymentMethod: value })}>
                    <SelectTrigger id="payment-method">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentMethodOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="reference">Reference / Receipt Number</Label>
                <Input 
                  id="reference" 
                  placeholder="Transfer or receipt number"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setIsAddDialogOpen(false);
                setSelectedPayment(null);
                setInvoiceSearchQuery("");
                setFormData({
                  invoiceId: "",
                  invoiceNumber: "",
                  amount: "",
                  paymentDate: new Date().toISOString().split("T")[0],
                  paymentMethod: "",
                  reference: "",
                });
              }}>
                Cancel
              </Button>
              <Button onClick={handleSavePayment}>
                Record Payment
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h4 className="text-sm font-medium text-muted-foreground">Total Paid</h4>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{totalPaid.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">ر.س - Collected amounts</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h4 className="text-sm font-medium text-muted-foreground">Total Remaining</h4>
            <DollarSign className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{totalRemaining.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">ر.س - Outstanding balance</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h4 className="text-sm font-medium text-muted-foreground">Partial Payments</h4>
            <Clock className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{totalPartial.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">ر.س - Partially paid</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h4 className="text-sm font-medium text-muted-foreground">Pending</h4>
            <Clock className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{totalPending.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">ر.س - Upcoming receivables</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h4 className="text-sm font-medium text-muted-foreground">Overdue</h4>
            <AlertCircle className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{totalOverdue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">ر.س - Requires follow-up</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search for invoice..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select defaultValue="all" value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Invoices</SelectItem>
                <SelectItem value="paid">✅ Paid</SelectItem>
                <SelectItem value="partial">💰 Partial</SelectItem>
                <SelectItem value="pending">📝 Pending</SelectItem>
                <SelectItem value="overdue">⚠️ Overdue</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-6 text-center text-muted-foreground">Loading payments...</div>
          ) : payments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 px-4">
              <div className="relative mb-6">
                <div className="absolute inset-0 bg-gradient-to-br from-purple-100 to-blue-100 rounded-full blur-2xl opacity-50"></div>
                <div className="relative bg-gradient-to-br from-purple-50 to-blue-50 rounded-full p-8 border-2 border-purple-200">
                  <Receipt className="h-16 w-16 text-purple-600" />
                </div>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-2">No Payments Yet</h3>
              <p className="text-muted-foreground text-center max-w-md mb-6">
                Start tracking your payments by recording your first payment. Click the "Record New Payment" button to get started.
              </p>
              <Button 
                onClick={handleNewPayment}
                className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              >
                <Plus className="h-4 w-4" />
                Record New Payment
              </Button>
            </div>
          ) : filteredPayments.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Receipt className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No payments found matching your search criteria.</p>
            </div>
          ) : (
            <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead className="text-right">Total Amount</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead className="text-right">Remaining</TableHead>
                <TableHead>Due Date</TableHead>
                <TableHead>Payment Date</TableHead>
                <TableHead>Payment Method</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPayments.map((payment) => {
                const StatusIcon = getStatusIcon(payment.status);
                return (
                  <TableRow key={payment.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-primary" />
                        {payment.invoiceNumber}
                      </div>
                    </TableCell>
                    <TableCell>{payment.customer}</TableCell>
                    <TableCell className="text-right font-semibold">{payment.amount.toLocaleString()} ر.س</TableCell>
                    <TableCell className="text-right">
                      <span className="font-medium text-green-600">
                        {payment.paidAmount.toLocaleString()} ر.س
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className={`font-medium ${payment.remainingAmount > 0 ? 'text-orange-600' : 'text-muted-foreground'}`}>
                        {payment.remainingAmount.toLocaleString()} ر.س
                      </span>
                    </TableCell>
                    <TableCell>{payment.dueDate}</TableCell>
                    <TableCell>{payment.paymentDate || "-"}</TableCell>
                    <TableCell>
                      {payment.paymentMethod
                        ? paymentMethodLabels[payment.paymentMethod] ?? payment.paymentMethod
                        : "-"}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={getStatusColor(payment.status)} 
                        className={`gap-1.5 ${
                          payment.status === "Paid" ? "bg-green-100 text-green-700 border-green-200" :
                          payment.status === "Partial" ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                          payment.status === "Pending" ? "bg-blue-100 text-blue-700 border-blue-200" :
                          payment.status === "Overdue" ? "bg-red-100 text-red-700 border-red-200" :
                          ""
                        }`}
                      >
                        <StatusIcon className="h-3 w-3" />
                        {payment.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-center gap-2">
                        {payment.remainingAmount > 0.01 && (
                          <Button 
                            size="sm" 
                            className="gap-2 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleRecordPayment(payment)}
                          >
                            <DollarSign className="h-4 w-4" />
                            {payment.status === "Partial" ? `Collect (${payment.remainingAmount.toLocaleString()} ر.س)` : "Record Payment"}
                          </Button>
                        )}
                        {payment.status === "Paid" && (
                          <Badge className="bg-green-100 text-green-700 border-green-200">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Fully Paid
                          </Badge>
                        )}
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handlePrint(payment)}
                        >
                          Print
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
