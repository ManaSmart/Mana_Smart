import { useEffect, useMemo, useState } from "react";
import { Search, Download, Printer, DollarSign, FileText, TrendingUp } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Badge } from "./ui/badge";
import { Label } from "./ui/label";
import QRCode from "qrcode";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Customers } from "../../supabase/models/customers";
import type { Invoices as InvoiceRow } from "../../supabase/models/invoices";
import type { Payments as PaymentRow } from "../../supabase/models/payments";
import { getPrintLogo } from "../lib/getPrintLogo";

interface Transaction {
  id: string;
  date: string;
  type: string;
  typeLabel: string;
  typeArabic: string;
  reference: string;
  details: string;
  debit: number;
  credit: number;
  balance: number;
}

interface CustomerStatementProps {
  systemLogo: string;
  systemNameAr: string;
  systemNameEn: string;
}

interface CustomerOption {
  id: string;
  name: string;
  nameAr: string;
  accountNumber: string;
  iban: string;
  phone: string;
  contractNumber?: string;
  raw: Customers;
}

const PAYMENT_METHOD_LABELS: Record<string, { label: string; arabic: string }> = {
  cash: { label: "Cash", arabic: "نقدي" },
  bank_transfer: { label: "Bank Transfer", arabic: "تحويل بنكي" },
  credit_card: { label: "Credit Card", arabic: "بطاقة ائتمان" },
  cheque: { label: "Cheque", arabic: "شيك" },
  mada: { label: "Mada", arabic: "مدى" },
  stc_pay: { label: "STC Pay", arabic: "STC Pay" },
  other: { label: "Payment", arabic: "دفعة" },
};

export function CustomerStatement({ systemLogo, systemNameAr, systemNameEn }: CustomerStatementProps) {
  const dispatch = useAppDispatch();
  const dbCustomers = useAppSelector(selectors.customers.selectAll) as Customers[];
  const dbInvoices = useAppSelector(selectors.invoices.selectAll) as InvoiceRow[];
  const dbPayments = useAppSelector(selectors.payments.selectAll) as PaymentRow[];

  useEffect(() => {
    dispatch(thunks.customers.fetchAll(undefined));
    dispatch(thunks.invoices.fetchAll(undefined));
    dispatch(thunks.payments.fetchAll(undefined));
  }, [dispatch]);

  const customerOptions = useMemo<CustomerOption[]>(() => {
    return dbCustomers.map((customer) => {
      const accountNumber = customer.customer_id.slice(0, 8).toUpperCase();
      return {
        id: customer.customer_id,
        name: customer.customer_name ?? customer.company ?? "Unknown Customer",
        nameAr: customer.company ?? customer.customer_name ?? "عميل",
        accountNumber,
        iban: `SA-${accountNumber}-0000`,
        phone: customer.contact_num ?? "",
        contractNumber: undefined,
        raw: customer,
      };
    });
  }, [dbCustomers]);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>(undefined);
  const [_dateRange, _setDateRange] = useState<string>("last-6-months");
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [customerSearchQuery, setCustomerSearchQuery] = useState<string>("");

  useEffect(() => {
    if (!selectedCustomerId && customerOptions.length > 0) {
      setSelectedCustomerId(customerOptions[0].id);
    }
  }, [customerOptions, selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return customerOptions;
    return customerOptions.filter((c) => {
      const query = customerSearchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(query) ||
        c.nameAr.toLowerCase().includes(query) ||
        c.phone.toLowerCase().includes(query) ||
        c.accountNumber.toLowerCase().includes(query) ||
        c.iban.toLowerCase().includes(query) ||
        (c.contractNumber && c.contractNumber.toLowerCase().includes(query))
      );
    });
  }, [customerOptions, customerSearchQuery]);

  useEffect(() => {
    if (
      selectedCustomerId &&
      !customerOptions.some((option) => option.id === selectedCustomerId)
    ) {
      setSelectedCustomerId(customerOptions[0]?.id);
    }
  }, [customerOptions, selectedCustomerId]);

  const selectedCustomer = useMemo(
    () => customerOptions.find((option) => option.id === selectedCustomerId) ?? null,
    [customerOptions, selectedCustomerId]
  );

  useEffect(() => {
    if (!fromDate || !toDate) {
      const today = new Date();
      const end = today.toISOString().split("T")[0];
      const startDate = new Date(today);
      startDate.setMonth(startDate.getMonth() - 6);
      const start = startDate.toISOString().split("T")[0];
      setFromDate(start);
      setToDate(end);
    }
  }, [fromDate, toDate]);

  const invoiceNumberMap = useMemo(() => {
    const parseDate = (value?: string | null) => {
      if (!value) return 0;
      const timestamp = new Date(value).getTime();
      return Number.isNaN(timestamp) ? 0 : timestamp;
    };

    const sorted = [...dbInvoices].sort(
      (a, b) => parseDate(a.invoice_date ?? a.created_at) - parseDate(b.invoice_date ?? b.created_at)
    );

    const map = new Map<string, string>();
    sorted.forEach((invoice, index) => {
      const baseDate = invoice.invoice_date ?? invoice.created_at ?? new Date().toISOString();
      const year = new Date(baseDate).getFullYear();
      map.set(invoice.invoice_id, `INV-${year}-${String(index + 1).padStart(3, "0")}`);
    });

    return map;
  }, [dbInvoices]);

  const computeInvoiceTotal = (invoice: InvoiceRow) => {
    const total = Number(invoice.total_amount ?? 0);
    if (total > 0) return total;
    const subtotal = Number(invoice.subtotal ?? 0);
    const tax = Number(invoice.tax_amount ?? 0);
    const fallback = subtotal + tax;
    if (fallback > 0) return fallback;
    try {
      const items = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : [];
      return items.reduce((sum: number, item: any) => {
        const quantity = Number(item?.quantity ?? 1);
        const unit = Number(item?.unitPrice ?? 0);
        const discount = Number(item?.discountPercent ?? 0);
        const totalItem =
          Number(item?.total ?? 0) ||
          Number(item?.subtotal ?? 0) ||
          unit * quantity * (1 - discount / 100);
        return sum + totalItem;
      }, 0);
    } catch {
      return 0;
    }
  };

  const transactions = useMemo<Transaction[]>(() => {
    if (!selectedCustomer) return [];

    // Parse date range
    const fromDateObj = fromDate ? new Date(fromDate + "T00:00:00") : null;
    const toDateObj = toDate ? new Date(toDate + "T23:59:59") : null;

    // Helper function to check if a date is within range
    const isDateInRange = (dateStr: string): boolean => {
      if (!dateStr) return false;
      if (!fromDateObj && !toDateObj) return true; // No filter if no dates selected
      
      const transactionDate = new Date(dateStr);
      if (Number.isNaN(transactionDate.getTime())) return false;

      if (fromDateObj && transactionDate < fromDateObj) return false;
      if (toDateObj && transactionDate > toDateObj) return false;
      
      return true;
    };

    const relevantInvoices = dbInvoices.filter(
      (invoice) => invoice.customer_id === selectedCustomer.id
    );
    const invoiceIdSet = new Set(relevantInvoices.map((invoice) => invoice.invoice_id));

    const invoiceEntries: Transaction[] = relevantInvoices
      .filter((invoice) => {
        const date = invoice.invoice_date ?? invoice.created_at ?? "";
        return isDateInRange(date);
      })
      .map((invoice) => {
        const amount = computeInvoiceTotal(invoice);
        const date = invoice.invoice_date ?? invoice.created_at ?? "";
        const reference =
          invoiceNumberMap.get(invoice.invoice_id) ?? invoice.invoice_id.slice(0, 8).toUpperCase();

        return {
          id: `invoice-${invoice.invoice_id}`,
          date,
          type: "invoice",
          typeLabel: "Invoice",
          typeArabic: "فاتورة",
          reference,
          details: invoice.invoice_notes || "Invoice issued",
          debit: amount,
          credit: 0,
          balance: 0,
        };
      });

    const paymentEntries: Transaction[] = dbPayments
      .filter((payment) => {
        if (!payment.invoice_id || !invoiceIdSet.has(payment.invoice_id)) return false;
        const paymentDate = payment.payment_date ?? payment.created_at ?? "";
        return isDateInRange(paymentDate);
      })
      .map((payment) => {
        const method = payment.payment_method ?? "other";
        const labels = PAYMENT_METHOD_LABELS[method] ?? PAYMENT_METHOD_LABELS.other;
        const paymentDate = payment.payment_date ?? payment.created_at ?? "";
        const reference =
          payment.reference_number ||
          invoiceNumberMap.get(payment.invoice_id ?? "") ||
          payment.payment_id.slice(0, 8).toUpperCase();
        const amount = Number(payment.paid_amount ?? 0);

        return {
          id: `payment-${payment.payment_id}`,
          date: paymentDate,
          type: method,
          typeLabel: labels.label,
          typeArabic: labels.arabic,
          reference,
          details: payment.notes || `Payment via ${labels.label}`,
          debit: 0,
          credit: amount,
          balance: 0,
        };
      });

    const allTransactions = [...invoiceEntries, ...paymentEntries]
      .map((transaction) => {
        const timestamp = transaction.date ? new Date(transaction.date).getTime() : 0;
        return {
          ...transaction,
          sortValue: Number.isNaN(timestamp) ? 0 : timestamp,
        };
      })
      .sort((a, b) => {
        if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
        return a.id.localeCompare(b.id);
      })
      .map((transaction) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { sortValue, ...rest } = transaction;
        return rest;
      });

    let runningBalance = 0;
    return allTransactions.map((transaction) => {
      runningBalance += transaction.debit - transaction.credit;
      return { ...transaction, balance: runningBalance };
    });
  }, [selectedCustomer, dbInvoices, dbPayments, invoiceNumberMap, fromDate, toDate]);

  const totalInvoices = useMemo(
    () => transactions.reduce((sum, transaction) => sum + (transaction.debit > 0 ? transaction.debit : 0), 0),
    [transactions]
  );
  const totalPayments = useMemo(
    () => transactions.reduce((sum, transaction) => sum + (transaction.credit > 0 ? transaction.credit : 0), 0),
    [transactions]
  );
  const numberOfInvoices = useMemo(
    () => transactions.filter((transaction) => transaction.debit > 0).length,
    [transactions]
  );
  const numberOfPayments = useMemo(
    () => transactions.filter((transaction) => transaction.credit > 0).length,
    [transactions]
  );
  const openingBalance = 0;
  const closingBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : 0;

  const formatDisplayDate = (isoDate: string) => {
    if (!isoDate) return "-";
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;
    return parsed.toLocaleDateString("en-CA");
  };

  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return "";
    // Convert YYYY-MM-DD to YYYY/MM/DD
    return dateStr.replace(/-/g, "/");
  };

  const handlePrint = async () => {
    if (!selectedCustomer) return;

    // Generate QR code for validation
    const fromDateStr = formatDateForDisplay(fromDate);
    const toDateStr = formatDateForDisplay(toDate);
    const qrData = `Customer: ${selectedCustomer.name}\nAccount: ${selectedCustomer.accountNumber}\nIBAN: ${selectedCustomer.iban}\nPeriod: ${fromDateStr} - ${toDateStr}\nBalance: SAR ${closingBalance.toFixed(2)}`;
    let qrCode = "";
    
    try {
      qrCode = await QRCode.toDataURL(qrData);
    } catch (err) {
      console.error("QR Code generation error:", err);
    }

    const refNumber = `ST-${Date.now().toString().slice(-8)}`;
    const currentDate = new Date();
    const printDate = `${currentDate.getDate().toString().padStart(2, '0')}/${(currentDate.getMonth() + 1).toString().padStart(2, '0')}/${currentDate.getFullYear()}`;
    const printTime = currentDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

    const printWindow = window.open('', '', 'height=842,width=595');
    if (!printWindow) return;

    // Load logo from Settings
    const logoToUse = systemLogo || (await getPrintLogo()) || undefined;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Customer Account Statement - ${selectedCustomer.name}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif, 'Arial';
            font-size: 11px;
            line-height: 1.4;
            color: #000;
            background: #fff;
          }
          .container { max-width: 100%; margin: 0 auto; padding: 10px; }
          
          /* Header Section */
          .header {
            display: grid;
            grid-template-columns: 110px 1fr 110px;
            gap: 20px;
            align-items: start;
            margin-bottom: 20px;
            padding-bottom: 15px;
          }
          
          .qr-section {
            text-align: center;
          }
          .qr-code {
            width: 100px;
            height: 100px;
            margin-bottom: 5px;
          }
          .qr-label {
            font-size: 8px;
            color: #666;
            text-transform: uppercase;
          }
          
          .title-section {
            text-align: center;
            padding-top: 15px;
          }
          .title-ar {
            font-size: 20px;
            font-weight: bold;
            color: #000;
            margin-bottom: 5px;
          }
          .title-en {
            font-size: 17px;
            font-weight: bold;
            color: #000;
          }
          
          .logo-section {
            text-align: right;
          }
          .company-logo {
            max-width: 110px;
            max-height: 50px;
            object-fit: contain;
            margin-bottom: 5px;
          }
          .company-name-en {
            font-size: 12px;
            font-weight: bold;
            color: #000;
            margin-top: 5px;
          }
          .company-name-ar {
            font-size: 12px;
            font-weight: bold;
            color: #000;
            direction: rtl;
            margin-top: 3px;
          }
          
          /* Reference Info */
          .ref-info {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 10px;
            margin-bottom: 3px;
            padding: 8px 0;
            border-bottom: 1px solid #ddd;
          }
          .ref-row {
            display: flex;
            justify-content: space-between;
            font-size: 10px;
          }
          .ref-label {
            font-weight: normal;
            color: #000;
          }
          .ref-value {
            font-weight: normal;
            color: #000;
          }
          .ref-label-ar {
            text-align: right;
            direction: rtl;
            font-weight: normal;
          }
          
          /* Statement Details Section */
          .section-header {
            background: linear-gradient(135deg, #4169E1 0%, #1E40AF 100%);
            color: white;
            padding: 10px;
            font-weight: bold;
            font-size: 12px;
            text-align: center;
            margin: 15px 0 8px 0;
            display: grid;
            grid-template-columns: 1fr 1fr;
          }
          .section-header-ar {
            text-align: right;
            direction: rtl;
          }
          .section-header-en {
            text-align: left;
          }
          
          .details-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .details-table tr {
            border-bottom: 1px solid #f0f0f0;
          }
          .details-table td {
            padding: 8px;
            font-size: 10px;
          }
          .details-table td:first-child {
            width: 45%;
            text-align: left;
            font-weight: 600;
            color: #000;
          }
          .details-table td:nth-child(2) {
            width: 30%;
            text-align: center;
            background: #f5f5f5;
            color: #333;
          }
          .details-table td:last-child {
            width: 25%;
            text-align: right;
            font-weight: 600;
            color: #000;
            direction: rtl;
          }
          
          /* Transactions Table */
          .transactions-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 15px;
            page-break-inside: auto;
          }
          .transactions-table thead {
            background: linear-gradient(135deg, #4169E1 0%, #1E40AF 100%);
            color: white;
          }
          .transactions-table th {
            padding: 10px 6px;
            text-align: center;
            font-size: 10px;
            font-weight: bold;
            border: none;
          }
          .transactions-table tbody tr {
            page-break-inside: avoid;
            border-bottom: 1px solid #e0e0e0;
          }
          .transactions-table tbody tr:nth-child(even) {
            background: #f8f9ff;
          }
          .transactions-table tbody tr:nth-child(odd) {
            background: #ffffff;
          }
          .transactions-table td {
            padding: 8px 6px;
            text-align: center;
            font-size: 9px;
            border: none;
            vertical-align: top;
          }
          .transactions-table td.date {
            font-weight: 600;
            color: #1E40AF;
            background: #EFF6FF;
            width: 10%;
          }
          .transactions-table td.reference {
            font-weight: 600;
            color: #333;
            font-size: 8px;
            width: 12%;
          }
          .transactions-table td.type {
            width: 10%;
          }
          .type-badge {
            display: inline-block;
            padding: 3px 8px;
            border-radius: 12px;
            font-size: 8px;
            font-weight: 600;
            text-transform: uppercase;
          }
          .type-invoice {
            background: #FEE2E2;
            color: #991B1B;
          }
          .type-transfer {
            background: #DBEAFE;
            color: #1E40AF;
          }
          .type-cash {
            background: #D1FAE5;
            color: #065F46;
          }
          .type-check {
            background: #FEF3C7;
            color: #92400E;
          }
          .transactions-table td.details {
            text-align: left;
            font-size: 8px;
            color: #333;
            max-width: 250px;
            word-wrap: break-word;
            width: 35%;
          }
          .transactions-table td.amount {
            font-weight: 600;
            text-align: right;
            width: 11%;
          }
          .amount-debit {
            color: #DC2626;
          }
          .amount-credit {
            color: #16A34A;
          }
          .amount-balance {
            color: #1E40AF;
            font-weight: 700;
          }
          
          /* Page Number */
          .page-number {
            text-align: center;
            margin-top: 30px;
            font-size: 10px;
            color: #666;
          }
          
          /* Footer Note */
          .footer-note {
            margin-top: 20px;
            padding: 15px;
            background: #FEF3C7;
            border-left: 4px solid #F59E0B;
            border-radius: 4px;
          }
          .footer-note-title {
            font-size: 11px;
            font-weight: bold;
            color: #92400E;
            margin-bottom: 5px;
          }
          .footer-note-text {
            font-size: 9px;
            color: #78350F;
            line-height: 1.5;
          }
          
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
            .section-header, .transactions-table thead, .transactions-table td.date, .type-badge, .footer-note {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
            }
            .transactions-table tbody tr {
              page-break-inside: avoid;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <!-- Header with QR, Title, and Logo -->
          <div class="header">
            <div class="qr-section">
              ${qrCode ? `<img src="${qrCode}" class="qr-code" alt="QR Code">` : ''}
              <div class="qr-label">Scan to Verify</div>
            </div>
            
            <div class="title-section">
              <div class="title-ar">كشف حساب العميل</div>
              <div class="title-en">Customer Account Statement</div>
            </div>
            
            <div class="logo-section">
              ${logoToUse ? `<img src="${logoToUse}" class="company-logo" alt="Company Logo">` : ''}
              <div class="company-name-en">${systemNameEn || 'Mana Smart'}</div>
              <div class="company-name-ar">${systemNameAr || 'منى سمارت'}</div>
            </div>
          </div>
          
          <!-- Reference Information -->
          <div class="ref-info">
            <div class="ref-row">
              <span class="ref-label">Statement No</span>
              <span class="ref-value">${refNumber}</span>
            </div>
            <div class="ref-row">
              <span class="ref-value" style="text-align: right;">${refNumber}</span>
              <span class="ref-label-ar">رقم الكشف</span>
            </div>
          </div>
          
          <div class="ref-info">
            <div class="ref-row">
              <span class="ref-label">Print Date</span>
              <span class="ref-value">${printDate}</span>
            </div>
            <div class="ref-row">
              <span class="ref-value" style="text-align: right;">${printDate}</span>
              <span class="ref-label-ar">تاريخ الطباعة</span>
            </div>
          </div>
          
          <div class="ref-info" style="border-bottom: 2px solid #ddd;">
            <div class="ref-row">
              <span class="ref-label">Print Time</span>
              <span class="ref-value">${printTime}</span>
            </div>
            <div class="ref-row">
              <span class="ref-value" style="text-align: right;">${printTime}</span>
              <span class="ref-label-ar">وقت الطباعة</span>
            </div>
          </div>
          
          <!-- Statement Details Section -->
          <div class="section-header">
            <div class="section-header-en">Statement Details</div>
            <div class="section-header-ar">تفاصيل الكشف</div>
          </div>
          
          <table class="details-table">
            <tr>
              <td>Customer Name</td>
              <td>${selectedCustomer.name}</td>
              <td>اسم العميل</td>
            </tr>
            <tr>
              <td>Customer Name (Arabic)</td>
              <td>${selectedCustomer.nameAr}</td>
              <td>اسم العميل (بالعربي)</td>
            </tr>
            <tr>
              <td>Account Number</td>
              <td>${selectedCustomer.accountNumber}</td>
              <td>رقم الحساب</td>
            </tr>
            <tr>
              <td>IBAN Number</td>
              <td>${selectedCustomer.iban}</td>
              <td>رقم الآيبان</td>
            </tr>
            <tr>
              <td>Statement Period</td>
              <td>${fromDateStr} <span style="margin: 0 10px;">to</span> ${toDateStr}</td>
              <td>فترة الكشف</td>
            </tr>
            <tr>
              <td>Opening Balance</td>
              <td style="color: #2563eb; font-weight: bold;">${openingBalance.toFixed(2)} SAR</td>
              <td>رصيد الحساب الافتتاحي</td>
            </tr>
            <tr>
              <td>Number Of Invoices</td>
              <td>${numberOfInvoices}</td>
              <td>عدد الفواتير</td>
            </tr>
            <tr>
              <td>Total Invoiced Amount</td>
              <td style="color: #dc2626; font-weight: bold;">${totalInvoices.toFixed(2)} SAR</td>
              <td>إجمالي المبالغ المستحقة</td>
            </tr>
            <tr>
              <td>Number Of Payments</td>
              <td>${numberOfPayments}</td>
              <td>عدد الدفعات</td>
            </tr>
            <tr>
              <td>Total Payments Received</td>
              <td style="color: #16a34a; font-weight: bold;">${totalPayments.toFixed(2)} SAR</td>
              <td>إجمالي المدفوعات</td>
            </tr>
            <tr style="background: #FEF3C7;">
              <td style="font-size: 11px;">Closing Balance (Outstanding)</td>
              <td style="color: ${closingBalance > 0 ? '#dc2626' : '#16a34a'}; font-weight: bold; font-size: 12px;">${closingBalance.toFixed(2)} SAR</td>
              <td style="font-size: 11px;">رصيد الإقفال (المتبقي)</td>
            </tr>
          </table>
          
          <!-- Page Number -->
          <div class="page-number">Page 1 of 2 - الصفحة 1 من 2</div>
          
          <!-- Page Break for Transactions -->
          <div style="page-break-before: always;"></div>
          
          <!-- Reference Header on Page 2 -->
          <div class="ref-info" style="margin-bottom: 10px;">
            <div class="ref-row">
              <span class="ref-label">Statement No</span>
              <span class="ref-value">${refNumber}</span>
            </div>
            <div class="ref-row">
              <span class="ref-value" style="text-align: right;">${refNumber}</span>
              <span class="ref-label-ar">رقم الكشف</span>
            </div>
          </div>
          
          <div class="section-header">
            <div class="section-header-en">Transaction History</div>
            <div class="section-header-ar">سجل المعاملات</div>
          </div>
          
          <!-- Transactions Table -->
          <table class="transactions-table">
            <thead>
              <tr>
                <th>Date<br>التاريخ</th>
                <th>Reference<br>المرجع</th>
                <th>Type<br>النوع</th>
                <th>Transaction Details<br>تفاصيل المعاملة</th>
                <th>Invoiced<br>مدين</th>
                <th>Paid<br>دائن</th>
                <th>Balance<br>الرصيد</th>
              </tr>
            </thead>
            <tbody>
              ${transactions.map(transaction => {
                let typeClass = 'type-transfer';
                if (transaction.typeLabel === 'Invoice') {
                  typeClass = 'type-invoice';
                } else if (transaction.typeLabel === 'Cash') {
                  typeClass = 'type-cash';
                } else if (transaction.typeLabel === 'Cheque') {
                  typeClass = 'type-check';
                } else if (transaction.typeLabel === 'Credit Card') {
                  typeClass = 'type-transfer';
                }
                const formattedDate = formatDisplayDate(transaction.date);
                return `
                <tr>
                  <td class="date">${formattedDate}</td>
                  <td class="reference">${transaction.reference}</td>
                  <td class="type">
                    <span class="type-badge ${typeClass}">${transaction.typeLabel}</span><br>
                    <span style="font-size: 7px; color: #666;">${transaction.typeArabic}</span>
                  </td>
                  <td class="details">${transaction.details}</td>
                  <td class="amount amount-debit">${transaction.debit > 0 ? transaction.debit.toFixed(2) : '-'}</td>
                  <td class="amount amount-credit">${transaction.credit > 0 ? transaction.credit.toFixed(2) : '-'}</td>
                  <td class="amount amount-balance">${transaction.balance.toFixed(2)}</td>
                </tr>
              `;
              }).join('')}
            </tbody>
          </table>
          
          ${closingBalance > 0 ? `
          <div class="footer-note">
            <div class="footer-note-title">⚠️ Outstanding Balance - رصيد مستحق</div>
            <div class="footer-note-text">
              Dear Customer, your account shows an outstanding balance of <strong>${closingBalance.toFixed(2)} SAR</strong>. Please arrange payment at your earliest convenience. For payment inquiries, please contact our accounts department.<br><br>
              عزيزي العميل، حسابك يظهر رصيد مستحق قدره <strong>${closingBalance.toFixed(2)} ريال سعودي</strong>. يرجى ترتيب الدفع في أقرب وقت ممكن. للاستفسارات حول الدفع، يرجى التواصل مع قسم الحسابات.
            </div>
          </div>
          ` : ''}
          
          <!-- Page Number for Transactions Page -->
          <div class="page-number">Page 2 of 2 - الصفحة 2 من 2</div>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };

  const handleDownload = async () => {
    // Trigger print which can be saved as PDF
    await handlePrint();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Customer Statements - كشوف حساب العملاء</h2>
          <p className="text-muted-foreground">
            Generate detailed account statements for payment collection
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleDownload} variant="outline">
            <Download className="mr-2 h-4 w-4" />
            Download PDF
          </Button>
          <Button onClick={handlePrint}>
            <Printer className="mr-2 h-4 w-4" />
            Print Statement
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Generate Statement - إنشاء كشف حساب</CardTitle>
          <CardDescription>Select customer and date range to generate collection statement</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Customer - العميل</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground z-10" />
                <Input
                  placeholder="Search by name, phone, contract #, account # - ابحث بالاسم، الجوال، رقم العقد، رقم الحساب"
                  value={customerSearchQuery}
                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                  className="pl-9 mb-2"
                />
              </div>
              <Select
                value={selectedCustomerId ?? (filteredCustomers[0]?.id ?? "")}
                onValueChange={setSelectedCustomerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select customer" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCustomers.length > 0 ? (
                    filteredCustomers.map((customerOption) => (
                      <SelectItem key={customerOption.id} value={customerOption.id}>
                        {customerOption.name} | {customerOption.nameAr} |{" "}
                        {customerOption.phone || "—"} | {customerOption.contractNumber || "—"}
                      </SelectItem>
                    ))
                  ) : (
                    <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                      No customers found - لا يوجد عملاء
                    </div>
                  )}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="from-date">From Date - من تاريخ</Label>
              <Input 
                id="from-date"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="to-date">To Date - إلى تاريخ</Label>
              <Input 
                id="to-date"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                min={fromDate}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Invoiced</CardTitle>
            <FileText className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">SAR {totalInvoices.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {numberOfInvoices} invoices issued
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Payments</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">SAR {totalPayments.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {numberOfPayments} payments received
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Opening Balance</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">SAR {openingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            <p className="text-xs text-muted-foreground mt-1">
              Period start: {fromDate ? formatDateForDisplay(fromDate) : "—"}
            </p>
          </CardContent>
        </Card>

        <Card className={closingBalance > 0 ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balance</CardTitle>
            <DollarSign className={`h-4 w-4 ${closingBalance > 0 ? 'text-red-600' : 'text-green-600'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${closingBalance > 0 ? 'text-red-600' : 'text-green-600'}`}>
              SAR {closingBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {closingBalance > 0 ? 'Amount due for collection' : 'Account fully paid'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Transactions Table */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History - سجل المعاملات</CardTitle>
          <CardDescription>
            {selectedCustomer
              ? `Showing ${transactions.length} transaction${transactions.length !== 1 ? 's' : ''} for ${selectedCustomer.name}${fromDate && toDate ? ` (${formatDateForDisplay(fromDate)} - ${formatDateForDisplay(toDate)})` : ''}`
              : "Select a customer to view transactions"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[110px]">Date</TableHead>
                  <TableHead className="w-[130px]">Reference</TableHead>
                  <TableHead className="w-[130px]">Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="text-right w-[110px]">Invoiced</TableHead>
                  <TableHead className="text-right w-[110px]">Paid</TableHead>
                  <TableHead className="text-right w-[120px]">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">
                      {selectedCustomer 
                        ? fromDate && toDate 
                          ? `No transactions found for ${selectedCustomer.name} in the selected date range (${formatDateForDisplay(fromDate)} - ${formatDateForDisplay(toDate)}).`
                          : "No transactions found for this customer."
                        : "Select a customer to view transactions."}
                    </TableCell>
                  </TableRow>
                ) : (
                  transactions.map((transaction) => (
                    <TableRow key={transaction.id}>
                      <TableCell className="font-medium">{formatDisplayDate(transaction.date)}</TableCell>
                      <TableCell className="text-xs font-mono">{transaction.reference}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            transaction.typeLabel === "Invoice"
                              ? "destructive"
                              : transaction.typeLabel === "Cash"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {transaction.typeLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs max-w-md">{transaction.details}</TableCell>
                      <TableCell className="text-right font-medium text-red-600">
                        {transaction.debit > 0 ? `SAR ${transaction.debit.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-medium text-green-600">
                        {transaction.credit > 0 ? `SAR ${transaction.credit.toFixed(2)}` : "-"}
                      </TableCell>
                      <TableCell className="text-right font-bold text-blue-600">
                        SAR {transaction.balance.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
