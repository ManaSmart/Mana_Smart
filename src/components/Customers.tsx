import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Phone, Mail, MapPin, Building2, Filter, Eye, FileText, Send, MessageSquare, User, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader } from "./ui/card";
import { ImportExcelButton } from "./ImportExcelButton";
import * as XLSX from "@e965/xlsx";
import { Download } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Separator } from "./ui/separator";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { thunks, selectors } from "../redux-toolkit/slices";
import type { Delegates } from "../../supabase/models/delegates";
import type { Contracts as DbContract } from "../../supabase/models/contracts";
import { getPrintLogo } from "../lib/getPrintLogo";
import type { MessageTemplateRow, MessageTemplateType, MessageTemplateCategory } from "../../supabase/models/message_templates";
import { mockMessageTemplates, type MessageTemplateSeed } from "../data/mockMessageTemplates";
import { supabase } from "../lib/supabaseClient";

interface Customer {
  id: number;
  dbId?: string;
  name: string;
  company: string;
  mobile: string;
  email: string;
  location: string;
  contractType: string;
  monthlyAmount: number;
  startDate: string;
  status: "active" | "inactive" | "pending";
  representative?: string;
  representativeId?: number;
  delegateDbId?: string;
  commercialRegister?: string;
  vatNumber?: string;
}

interface MessageTemplate {
  id: string;
  name: string;
  category: MessageTemplateCategory;
  content: string;
  type: MessageTemplateType;
  subject?: string | null;
}

interface Contract {
  id: number;
  recordId?: string;
  contractNumber: string;
  contractDate: string;
  clientName: string;
  clientCr: string;
  clientCity: string;
  clientRepresentative: string;
  clientDesignation: string;
  serviceAddress: string;
  postalCode: string;
  monthlyAmount: number;
  semiAnnualAmount: number;
  annualAmount: number;
  devicesCount: string;
  deviceTypes: string;
  emergencyVisitFee: number;
  paymentPlan: "monthly" | "semi-annual" | "annual";
  status: "draft" | "active" | "expired" | "cancelled" | "suspended" | "signed" | "attached";
  createdDate: string;
  monthlyVisitStartDate?: string;
  clientPhone?: string;
  clientEmail?: string;
  sentDate?: string;
  signedDate?: string;
  attachedDate?: string;
  attachedFileName?: string;
  attachedFileData?: string;
  attachedFileId?: string;
  attachedFileUrl?: string;
  suspendedDate?: string;
  suspensionReason?: string;
  cancelledDate?: string;
  cancellationReason?: string;
  reactivatedDate?: string;
  notes?: string;
}


// Using real data via Redux/Supabase instead of mockCustomers

const TEMPLATE_TABLE = "message_templates";

const convertSeedToTemplate = (seed: MessageTemplateSeed): MessageTemplate => ({
  id: seed.id,
  name: seed.name,
  category: seed.category,
  content: seed.content,
  type: seed.type,
  subject: seed.subject ?? null,
});

const fallbackTemplates: MessageTemplate[] = mockMessageTemplates.map(convertSeedToTemplate);

const mapRowToTemplate = (row: MessageTemplateRow): MessageTemplate => ({
  id: row.template_id,
  name: row.name,
  category: row.category,
  content: row.content,
  type: row.template_type,
  subject: row.subject ?? null,
});

export function Customers() {
  const dispatch = useAppDispatch();
  const dbCustomers = useAppSelector(selectors.customers.selectAll) as any[];
  const dbDelegates = useAppSelector(selectors.delegates.selectAll) as Delegates[];
  const dbContracts = useAppSelector(selectors.contracts.selectAll) as DbContract[];
  const loading = useAppSelector(selectors.customers.selectLoading);
  const loadError = useAppSelector(selectors.customers.selectError);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [createForm, setCreateForm] = useState({
    name: "",
    company: "",
    mobile: "",
    email: "",
    location: "",
    contractType: "",
    monthlyAmount: "",
    delegateId: "",
    commercialRegister: "",
    vatNumber: "",
  });
  // Map DB rows to UI shape
  const customers: Customer[] = useMemo(() => {
    return dbCustomers.map((c, idx) => {
      // Find the delegate assigned to this customer
      const assignedDelegate = c.delegate_id 
        ? dbDelegates.find(d => d.delegate_id === c.delegate_id)
        : null;
      
      return {
        id: idx + 1,
        dbId: c.customer_id,
        name: c.customer_name ?? c.company ?? "",
        company: c.company ?? "",
        mobile: c.contact_num ?? "",
        email: c.customer_email ?? "",
        location: c.customer_address ?? c.customer_city_of_residence ?? "",
        contractType: c.contract_type ?? "",
        monthlyAmount: Number(c.monthly_amount ?? 0),
        startDate: (c.created_at ?? "").slice(0, 10),
        status: (c.status ?? "active") as "active" | "inactive" | "pending",
        representative: assignedDelegate?.delegate_name || undefined,
        representativeId: assignedDelegate ? dbDelegates.indexOf(assignedDelegate) + 1 : undefined,
        delegateDbId: c.delegate_id || undefined,
        commercialRegister: c.commercial_register ?? undefined,
        vatNumber: c.vat_number ?? undefined,
      };
    });
  }, [dbCustomers, dbDelegates]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>(fallbackTemplates);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [isContractDialogOpen, setIsContractDialogOpen] = useState(false);
  const [selectedContractCustomer, setSelectedContractCustomer] = useState<Customer | null>(null);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);

  const fetchTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const { data, error } = await supabase
        .from(TEMPLATE_TABLE)
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        throw error;
      }

      const records = data ?? [];
      if (records.length === 0) {
        setMessageTemplates(fallbackTemplates);
      } else {
        setMessageTemplates(records.map(mapRowToTemplate));
      }
    } catch (err) {
      console.error("Failed to load message templates", err);
      setMessageTemplates(fallbackTemplates);
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  // Load from Supabase on mount
  useEffect(() => {
    dispatch(thunks.customers.fetchAll(undefined));
    dispatch(thunks.delegates.fetchAll(undefined));
    dispatch(thunks.contracts.fetchAll(undefined));
  }, [dispatch]);

  useEffect(() => {
    void fetchTemplates();

    const handleTemplatesUpdated = () => {
      void fetchTemplates();
    };

    window.addEventListener("messageTemplatesUpdated", handleTemplatesUpdated);

    return () => {
      window.removeEventListener("messageTemplatesUpdated", handleTemplatesUpdated);
    };
  }, [fetchTemplates]);

  const sendWhatsAppMessage = (customer: Customer) => {
    const message = `Hello ${customer.name}, welcome to our scent management service!`;
    const whatsappUrl = `https://wa.me/${customer.mobile.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    toast.success(`Opening WhatsApp for ${customer.name}`);
  };

  const sendEmailMessage = (customer: Customer) => {
    const subject = "Welcome to Our Service";
    const body = `Dear ${customer.name},\n\nThank you for choosing our scent management service.`;
    const mailtoUrl = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoUrl;
    toast.success(`Opening email client for ${customer.name}`);
  };

  const sendTemplateMessage = (customer: Customer, template: MessageTemplate) => {
    // Replace all common variables with actual customer data
    let message = template.content
      .replace(/\{\{customer_name\}\}/g, customer.name)
      .replace(/\{\{company\}\}/g, customer.company)
      .replace(/\{\{company_name\}\}/g, customer.company)
      .replace(/\{\{mobile\}\}/g, customer.mobile)
      .replace(/\{\{phone\}\}/g, customer.mobile)
      .replace(/\{\{email\}\}/g, customer.email)
      .replace(/\{\{location\}\}/g, customer.location)
      .replace(/\{\{address\}\}/g, customer.location)
      .replace(/\{\{contract_type\}\}/g, customer.contractType)
      .replace(/\{\{plan_name\}\}/g, customer.contractType)
      .replace(/\{\{monthly_amount\}\}/g, `${customer.monthlyAmount.toFixed(2)} SAR`)
      .replace(/\{\{amount\}\}/g, `${customer.monthlyAmount.toFixed(2)} SAR`)
      .replace(/\{\{monthly_fee\}\}/g, `${customer.monthlyAmount.toFixed(2)} SAR`)
      .replace(/\{\{start_date\}\}/g, customer.startDate)
      .replace(/\{\{status\}\}/g, customer.status)
      .replace(/\{\{representative\}\}/g, customer.representative || "Not assigned")
      .replace(/\{\{rep_name\}\}/g, customer.representative || "Not assigned")
      .replace(/\{\{manager_name\}\}/g, customer.representative || "Not assigned")
      .replace(/\{\{customer_id\}\}/g, customer.id.toString())
      // Add current date for invoice/payment reminders
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString('en-SA'))
      .replace(/\{\{current_date\}\}/g, new Date().toLocaleDateString('en-SA'))
      .replace(/\{\{today\}\}/g, new Date().toLocaleDateString('en-SA'))
      // Generic placeholders for invoices/visits that can be manually filled
      .replace(/\{\{invoice_number\}\}/g, "INV-XXXX")
      .replace(/\{\{contract_number\}\}/g, "CNT-XXXX")
      .replace(/\{\{visit_time\}\}/g, "10:00 AM")
      .replace(/\{\{time\}\}/g, "10:00 AM")
      .replace(/\{\{due_date\}\}/g, "End of month")
      .replace(/\{\{renewal_date\}\}/g, "Next month")
      .replace(/\{\{receipt_number\}\}/g, "REC-XXXX")
      .replace(/\{\{payment_date\}\}/g, new Date().toLocaleDateString('en-SA'))
      .replace(/\{\{services_list\}\}/g, "Monthly scent service");
    
    const channel = template.type ?? "whatsapp";
    const sanitizedPhone = customer.mobile.replace(/[^0-9]/g, "");

    if (channel === "email") {
      const subject = template.subject
        ? template.subject
            .replace(/\{\{customer_name\}\}/g, customer.name)
            .replace(/\{\{invoice_number\}\}/g, "INV-XXXX")
            .replace(/\{\{contract_number\}\}/g, "CNT-XXXX")
        : "Message from Scent System";

      const mailtoUrl = `mailto:${customer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
      window.location.href = mailtoUrl;
      toast.success(`Opening email for ${customer.name}`);
      return;
    }

    if (!sanitizedPhone) {
      toast.error("Customer phone number is invalid");
      return;
    }

    if (channel === "sms") {
      const smsUrl = `sms:${sanitizedPhone}?body=${encodeURIComponent(message)}`;
      window.location.href = smsUrl;
      toast.success(`Preparing SMS for ${customer.name}`);
      return;
    }

    const whatsappUrl = `https://wa.me/${sanitizedPhone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
    toast.success(`Sending "${template.name}" to ${customer.name}`);
  };

  const updateCustomerStatus = (customerId: number, newStatus: "active" | "inactive" | "pending") => {
    const target = customers.find(c => c.id === customerId);
    if (!target?.dbId) return;
    dispatch(thunks.customers.updateOne({ id: target.dbId, values: { status: newStatus } as any }))
      .unwrap()
      .then(() => toast.success(`Customer status updated to ${newStatus}`))
      .catch((e: any) => toast.error(e.message || 'Failed to update status'));
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer({ ...customer });
    setIsEditDialogOpen(true);
  };

  const handleViewContract = (customer: Customer) => {
    // Check if customer has a contract
    const dbContract = dbContracts.find(contract => contract.customer_id === customer.dbId);
    
    if (!dbContract) {
      toast.error(`No contract found for ${customer.name}`, {
        description: "This customer does not have any contract yet. Please create a contract first.",
        duration: 5000
      });
      return;
    }
    
    // Parse additional data from notes field
    let additionalData: any = {};
    try {
      if (dbContract.notes) {
        additionalData = JSON.parse(dbContract.notes);
      }
    } catch (e) {
      additionalData = { notes: dbContract.notes };
    }

    // Map database contract to Contract interface
    const contract: Contract = {
      id: 1, // Temporary ID
      recordId: dbContract.contract_id,
      contractNumber: dbContract.contract_number,
      contractDate: dbContract.contract_start_date,
      monthlyVisitStartDate: additionalData.monthlyVisitStartDate || dbContract.contract_start_date,
      clientName: additionalData.clientName || customer.name,
      clientCr: additionalData.clientCr || customer.commercialRegister || "",
      clientCity: additionalData.clientCity || customer.location.split(',')[0] || "",
      clientRepresentative: additionalData.clientRepresentative || customer.representative || "",
      clientDesignation: additionalData.clientDesignation || "",
      serviceAddress: dbContract.location || additionalData.serviceAddress || customer.location,
      postalCode: additionalData.postalCode || "",
      monthlyAmount: additionalData.monthlyAmount || 0,
      semiAnnualAmount: additionalData.semiAnnualAmount || 0,
      annualAmount: additionalData.annualAmount || 0,
      devicesCount: additionalData.devicesCount || "",
      deviceTypes: additionalData.deviceTypes || "",
      emergencyVisitFee: additionalData.emergencyVisitFee || 500,
      paymentPlan: additionalData.paymentPlan || "monthly",
      status: (dbContract.contract_status || "draft") as Contract["status"],
      createdDate: dbContract.created_at ? dbContract.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
      clientPhone: additionalData.clientPhone || customer.mobile,
      clientEmail: additionalData.clientEmail || customer.email,
      sentDate: additionalData.sentDate,
      signedDate: additionalData.signedDate,
      attachedDate: additionalData.attachedDate,
      attachedFileName: additionalData.attachedFileName,
      attachedFileData: additionalData.attachedFileData,
      attachedFileId: additionalData.attachedFileId,
      attachedFileUrl: additionalData.attachedFileUrl,
      suspendedDate: additionalData.suspendedDate,
      suspensionReason: additionalData.suspensionReason,
      cancelledDate: additionalData.cancelledDate,
      cancellationReason: additionalData.cancellationReason,
      reactivatedDate: additionalData.reactivatedDate,
      notes: typeof additionalData.notes === 'string' ? additionalData.notes : dbContract.notes || "",
    };
    
    setSelectedContractCustomer(customer);
    setSelectedContract(contract);
    setIsContractDialogOpen(true);
  };

  const handlePrintContract = async (contract: Contract) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Load logo from Settings if not provided
    const logoToUse = (await getPrintLogo()) || undefined;
    const html = generateContractHTML(contract, logoToUse);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  const replaceVariables = (text: string, contract: Contract): string => {
    return text
      .replace(/{{contract_date}}/g, new Date(contract.contractDate).toLocaleDateString('ar-SA'))
      .replace(/{{client_name}}/g, contract.clientName)
      .replace(/{{client_cr}}/g, contract.clientCr)
      .replace(/{{client_city}}/g, contract.clientCity)
      .replace(/{{client_representative}}/g, contract.clientRepresentative)
      .replace(/{{client_designation}}/g, contract.clientDesignation)
      .replace(/{{service_address}}/g, contract.serviceAddress)
      .replace(/{{postal_code}}/g, contract.postalCode)
      .replace(/{{monthly_amount}}/g, contract.monthlyAmount.toLocaleString())
      .replace(/{{semi_annual_amount}}/g, contract.semiAnnualAmount.toLocaleString())
      .replace(/{{annual_amount}}/g, contract.annualAmount.toLocaleString())
      .replace(/{{devices_count}}/g, contract.devicesCount)
      .replace(/{{device_types}}/g, contract.deviceTypes)
      .replace(/{{emergency_visit_fee}}/g, contract.emergencyVisitFee.toLocaleString());
  };

  const generateContractHTML = (contract: Contract, logoToUse?: string) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Service Agreement - اتفاقية خدمة التعطير</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #000;
            line-height: 1.8;
            font-size: 11pt;
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 3px solid #3b82f6;
          }
          .logo {
            max-width: 120px;
            max-height: 80px;
            margin: 0 auto 15px;
            display: block;
          }
          .main-title {
            font-size: 20pt;
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 8px;
          }
          .location {
            font-size: 11pt;
            color: #6b7280;
            margin: 10px 0;
          }
          .two-column {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin: 20px 0;
            align-items: start;
          }
          .arabic-section {
            text-align: right;
            direction: rtl;
            padding-right: 15px;
            border-right: 3px solid #3b82f6;
          }
          .english-section {
            text-align: left;
            direction: ltr;
            padding-left: 15px;
            border-left: 3px solid #3b82f6;
          }
          .clause-title {
            font-weight: bold;
            color: #3b82f6;
            font-size: 12pt;
            margin: 15px 0 10px;
          }
          .clause-content {
            color: #374151;
            margin-bottom: 15px;
          }
          .party-info {
            background: #f9fafb;
            padding: 15px;
            border-radius: 8px;
            margin: 10px 0;
            border: 1px solid #e5e7eb;
          }
          .party-label {
            font-weight: bold;
            color: #1f2937;
            margin-bottom: 5px;
          }
          .signatures {
            margin-top: 50px;
            page-break-inside: avoid;
          }
          .signature-box {
            background: #f9fafb;
            padding: 20px;
            border-radius: 8px;
            margin: 15px 0;
            border: 2px solid #e5e7eb;
            min-height: 150px;
          }
          .signature-line {
            border-top: 2px solid #000;
            margin: 60px 20px 10px;
          }
          .signature-label {
            font-weight: 600;
            color: #4b5563;
            text-align: center;
          }
          ul {
            margin: 10px 0;
            padding-right: 25px;
          }
          ul li {
            margin: 5px 0;
          }
          .english-section ul {
            padding-left: 25px;
            padding-right: 0;
          }
          @media print {
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div class="header">
          ${logoToUse ? `<img src="${logoToUse}" alt="Logo" class="logo">` : ''}
          <div class="main-title">اتفاقية تقديم خدمة التعطير (الأعمال)</div>
          <div class="main-title">Aromatic Service Agreement (Business)</div>
          <div class="location">
            الموقع: الخبر، المملكة العربية السعودية، ${replaceVariables('{{postal_code}}', contract)}
            <br>
            Khobar, Saudi Arabia, ${replaceVariables('{{postal_code}}', contract)}
          </div>
          <div class="location">
            تم إبرام هذه الاتفاقية بتاريخ ${replaceVariables('{{contract_date}}', contract)}
            <br>
            This Agreement is made as of ${replaceVariables('{{contract_date}}', contract)}
          </div>
        </div>

        <!-- Parties Info -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="party-info">
              <div class="party-label">الطرف الأول:</div>
              <div>شركة مانا الذكية للتجارة</div>
              <div>سجل تجاري رقم (2051245473)</div>
              <div>المقر الرئيسي: الخبر</div>
              <div>ويشار إليها لاحقًا بـ "المزود"</div>
            </div>
            <div class="party-info">
              <div class="party-label">الطرف الثاني:</div>
              <div>${replaceVariables('{{client_name}}', contract)}</div>
              <div>سجل تجاري رقم (${replaceVariables('{{client_cr}}', contract)})</div>
              <div>المقر الرئيسي: ${replaceVariables('{{client_city}}', contract)}</div>
              <div>ويشار إليه لاحقًا بـ "العميل"</div>
            </div>
          </div>
          <div class="english-section">
            <div class="party-info">
              <div class="party-label">First Party:</div>
              <div>Mana Smart Trading Company</div>
              <div>Commercial Registration No. (2051245473)</div>
              <div>Headquartered in Khobar</div>
              <div>Hereinafter referred to as the "Provider"</div>
            </div>
            <div class="party-info">
              <div class="party-label">Second Party:</div>
              <div>${replaceVariables('{{client_name}}', contract)}</div>
              <div>Commercial Registration No. (${replaceVariables('{{client_cr}}', contract)})</div>
              <div>Headquartered in ${replaceVariables('{{client_city}}', contract)}</div>
              <div>Hereinafter referred to as the "Client"</div>
            </div>
          </div>
        </div>

        <!-- Clause 1 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الأول: نطاق الاتفاقية</div>
            <div class="clause-content">
              يتعهد المزود بتقديم خدمات التعطير باستخدام الأجهزة والزيوت العطرية المخصصة، وتشمل التركيب، والتعبئة، والصيانة، والمتابعة، وفقًا لما هو مبيّن في هذه الاتفاقية وملحق الخدمة.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 1: Scope of Agreement</div>
            <div class="clause-content">
              The Provider undertakes to provide scenting services using designated devices and aromatic oils, including installation, refilling, maintenance, and follow-up, as outlined in this agreement and service annex.
            </div>
          </div>
        </div>

        <!-- Clause 2 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الثاني: مدة العقد</div>
            <div class="clause-content">
              مدة العقد سنة ميلادية واحدة تبدأ من تاريخ التوقيع، وتتجدد تلقائيًا ما لم يُخطر أحد الطرفين الآخر بعدم الرغبة بالتجديد قبل (30) يومًا من تاريخ الانتهاء.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 2: Contract Duration</div>
            <div class="clause-content">
              This contract is valid for one calendar year starting from date of signing and is automatically renewed unless either party notifies of its intention not to renew at least thirty (30) days prior to expiration.
            </div>
          </div>
        </div>

        <!-- Service Details -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الثالث: تفاصيل الخدمة</div>
            <div class="clause-content">
              <strong>العنوان:</strong> ${replaceVariables('{{service_address}}', contract)}<br>
              <strong>عدد الأجهزة:</strong> ${replaceVariables('{{devices_count}}', contract)}<br>
              <strong>أنواع الأجهزة:</strong> ${replaceVariables('{{device_types}}', contract)}<br>
              <strong>الزيارة الطارئة:</strong> ${replaceVariables('{{emergency_visit_fee}}', contract)} ريال
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 3: Service Details</div>
            <div class="clause-content">
              <strong>Address:</strong> ${replaceVariables('{{service_address}}', contract)}<br>
              <strong>Devices Count:</strong> ${replaceVariables('{{devices_count}}', contract)}<br>
              <strong>Device Types:</strong> ${replaceVariables('{{device_types}}', contract)}<br>
              <strong>Emergency Visit:</strong> ${replaceVariables('{{emergency_visit_fee}}', contract)} SAR
            </div>
          </div>
        </div>

        <!-- Payment -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الرابع: التكاليف والمدفوعات</div>
            <div class="clause-content">
              <strong>القيمة الشهرية:</strong> ${replaceVariables('{{monthly_amount}}', contract)} ريال<br>
              <strong>القيمة نصف السنوية:</strong> ${replaceVariables('{{semi_annual_amount}}', contract)} ريال<br>
              <strong>القيمة السنوية:</strong> ${replaceVariables('{{annual_amount}}', contract)} ريال
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 4: Costs and Payments</div>
            <div class="clause-content">
              <strong>Monthly Amount:</strong> ${replaceVariables('{{monthly_amount}}', contract)} SAR<br>
              <strong>Semi-Annual Amount:</strong> ${replaceVariables('{{semi_annual_amount}}', contract)} SAR<br>
              <strong>Annual Amount:</strong> ${replaceVariables('{{annual_amount}}', contract)} SAR
            </div>
          </div>
        </div>

        <!-- Signatures -->
        <div class="signatures">
          <div class="two-column">
            <div class="arabic-section">
              <div class="signature-box">
                <div class="signature-line"></div>
                <div class="signature-label">المزود</div>
              </div>
            </div>
            <div class="english-section">
              <div class="signature-box">
                <div class="signature-line"></div>
                <div class="signature-label">Provider</div>
              </div>
            </div>
          </div>
          <div class="two-column">
            <div class="arabic-section">
              <div class="signature-box">
                <div class="signature-line"></div>
                <div class="signature-label">العميل: ${replaceVariables('{{client_name}}', contract)}</div>
              </div>
            </div>
            <div class="english-section">
              <div class="signature-box">
                <div class="signature-line"></div>
                <div class="signature-label">Client: ${replaceVariables('{{client_name}}', contract)}</div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const handleSaveEdit = () => {
    if (!editingCustomer || !editingCustomer.dbId) return;
    
    const values: any = {
      customer_name: editingCustomer.name,
      company: editingCustomer.company,
      contact_num: editingCustomer.mobile,
      customer_email: editingCustomer.email,
      customer_address: editingCustomer.location,
      contract_type: editingCustomer.contractType?.toLowerCase() || null,
      monthly_amount: editingCustomer.monthlyAmount,
      status: editingCustomer.status,
      delegate_id: editingCustomer.delegateDbId || null,
      commercial_register: editingCustomer.commercialRegister || null,
      vat_number: editingCustomer.vatNumber || null,
    };
    dispatch(thunks.customers.updateOne({ id: editingCustomer.dbId, values }))
      .unwrap()
      .then(() => {
        setIsEditDialogOpen(false);
        setEditingCustomer(null);
        toast.success('Customer updated successfully!');
      })
      .catch((e: any) => toast.error(e.message || 'Failed to update customer'));
  };

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = customer.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         customer.company.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         customer.mobile.includes(searchQuery) ||
                         customer.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = filterStatus === "all" || customer.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  const exportToExcel = () => {
    try {
      const exportData = filteredCustomers.map((customer) => ({
        "Customer Name": customer.name,
        Company: customer.company,
        Mobile: customer.mobile,
        Email: customer.email,
        Location: customer.location,
        "Contract Type": customer.contractType,
        "Monthly Amount (SAR)": customer.monthlyAmount,
        Status: customer.status,
        Representative: customer.representative || "Not assigned",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Customers");
      const fileName = `customers_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2>Customers</h2>
          <p className="text-muted-foreground mt-1">Manage customer accounts and contracts</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <ImportExcelButton section="Customers" />
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="h-4 w-4" />
                Add Customer
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Customer</DialogTitle>
              <DialogDescription>Enter customer details to create a new account</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input placeholder="John Doe" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input placeholder="Company Name" value={createForm.company} onChange={(e) => setCreateForm({ ...createForm, company: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mobile Number</Label>
                  <Input placeholder="05xxxxxxxx" value={createForm.mobile} onChange={(e) => setCreateForm({ ...createForm, mobile: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input type="email" placeholder="email@example.com" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input placeholder="City, District" value={createForm.location} onChange={(e) => setCreateForm({ ...createForm, location: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Commercial Register</Label>
                  <Input placeholder="1010123456" value={createForm.commercialRegister} onChange={(e) => setCreateForm({ ...createForm, commercialRegister: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>VAT Number</Label>
                  <Input placeholder="300159475400003" value={createForm.vatNumber} onChange={(e) => setCreateForm({ ...createForm, vatNumber: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract Type</Label>
                  <Select value={createForm.contractType} onValueChange={(value) => setCreateForm({ ...createForm, contractType: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly Service</SelectItem>
                      <SelectItem value="quarterly">Quarterly Service</SelectItem>
                      <SelectItem value="yearly">Yearly Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monthly Amount (SAR)</Label>
                  <Input type="number" placeholder="0.00" value={createForm.monthlyAmount} onChange={(e) => setCreateForm({ ...createForm, monthlyAmount: e.target.value })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assigned Representative</Label>
                <Select value={createForm.delegateId || "none"} onValueChange={(value) => setCreateForm({ ...createForm, delegateId: value === "none" ? "" : value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select representative" />
                  </SelectTrigger>
                  <SelectContent>
                    {dbDelegates.length === 0 ? (
                      <SelectItem value="none" disabled>No representatives available. Add representatives first.</SelectItem>
                    ) : (
                      <>
                        <SelectItem value="none">None</SelectItem>
                        {dbDelegates.map(delegate => (
                          <SelectItem key={delegate.delegate_id} value={delegate.delegate_id}>
                            {delegate.delegate_name}
                          </SelectItem>
                        ))}
                      </>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                const values: any = {
                  customer_name: createForm.name,
                  company: createForm.company,
                  contact_num: createForm.mobile,
                  customer_email: createForm.email,
                  customer_address: createForm.location,
                  contract_type: createForm.contractType,
                  monthly_amount: Number(createForm.monthlyAmount || 0),
                  status: 'active',
                  delegate_id: createForm.delegateId || null,
                  commercial_register: createForm.commercialRegister || null,
                  vat_number: createForm.vatNumber || null,
                };
                dispatch(thunks.customers.createOne(values))
                  .unwrap()
                  .then(() => {
                    setIsCreateDialogOpen(false);
                    setCreateForm({ name: '', company: '', mobile: '', email: '', location: '', contractType: '', monthlyAmount: '', delegateId: '', commercialRegister: '', vatNumber: '' });
                    toast.success('Customer added successfully!');
                  })
                  .catch((e: any) => toast.error(e.message || 'Failed to add customer'));
              }}>
                Add Customer
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search customers..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-40">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <div>Loading customers...</div>}
          {loadError && <div className="text-red-500">{loadError}</div>}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer Name</TableHead>
                <TableHead>Company</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Representative</TableHead>
                <TableHead>Contract Type</TableHead>
                <TableHead>Monthly Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Quick Actions</TableHead>
                <TableHead className="text-center">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCustomers.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} className="p-0">
                    <div className="flex flex-col items-center justify-center py-12">
                      <User className="h-12 w-12 text-muted-foreground mb-3" />
                      <p className="text-muted-foreground">No customers found</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredCustomers.map((customer) => (
                <TableRow key={customer.id}>
                  <TableCell className="font-medium">{customer.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      {customer.company}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1 text-sm">
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {customer.mobile}
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {customer.email}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      {customer.location}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{customer.representative || "Not assigned"}</span>
                    </div>
                  </TableCell>
                  <TableCell>{customer.contractType}</TableCell>
                  <TableCell className="font-semibold">{customer.monthlyAmount.toFixed(2)} SAR</TableCell>
                  <TableCell>
                    <Select 
                      value={customer.status}
                      onValueChange={(value) => updateCustomerStatus(customer.id, value as "active" | "inactive" | "pending")}
                    >
                      <SelectTrigger className="w-28 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-green-500"></div>
                            Active
                          </div>
                        </SelectItem>
                        <SelectItem value="inactive">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-gray-400"></div>
                            Inactive
                          </div>
                        </SelectItem>
                        <SelectItem value="pending">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-2 rounded-full bg-yellow-500"></div>
                            Pending
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" variant="outline" className="gap-2">
                          <MessageSquare className="h-3.5 w-3.5" />
                          Send Message
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" className="w-56">
                        {templatesLoading ? (
                          <DropdownMenuItem disabled>
                            <span className="text-muted-foreground text-sm">Loading templates...</span>
                          </DropdownMenuItem>
                        ) : messageTemplates.length > 0 ? (
                          messageTemplates.map((template) => (
                            <DropdownMenuItem
                              key={template.id}
                              onClick={() => sendTemplateMessage(customer, template)}
                            >
                              <Send className="h-4 w-4 mr-2" />
                              {template.name}
                            </DropdownMenuItem>
                          ))
                        ) : (
                          <DropdownMenuItem disabled>
                            <span className="text-muted-foreground text-sm">No templates available</span>
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-2">
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => setSelectedCustomer(customer)}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditCustomer(customer)}>
                            <Edit className="h-4 w-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => sendWhatsAppMessage(customer)}>
                            <Phone className="h-4 w-4 mr-2" />
                            WhatsApp
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => sendEmailMessage(customer)}>
                            <Mail className="h-4 w-4 mr-2" />
                            Email
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewContract(customer)}>
                            <FileText className="h-4 w-4 mr-2" />
                            View Contract
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => {
                            if (!customer.dbId) return;
                            if (confirm('Are you sure you want to delete this customer?')) {
                              dispatch(thunks.customers.deleteOne(customer.dbId))
                                .unwrap()
                                .then(() => toast.success('Customer deleted'))
                                .catch((e: any) => toast.error(e.message || 'Failed to delete customer'));
                            }
                          }} className="text-destructive">
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit Customer Dialog */}
      {editingCustomer && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
              <DialogDescription>Update customer information</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Customer Name</Label>
                  <Input 
                    value={editingCustomer.name}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, name: e.target.value })}
                    placeholder="John Doe" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input 
                    value={editingCustomer.company}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, company: e.target.value })}
                    placeholder="Company Name" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Mobile Number</Label>
                  <Input 
                    value={editingCustomer.mobile}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, mobile: e.target.value })}
                    placeholder="05xxxxxxxx" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input 
                    type="email"
                    value={editingCustomer.email}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, email: e.target.value })}
                    placeholder="email@example.com" 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Location</Label>
                <Input 
                  value={editingCustomer.location}
                  onChange={(e) => setEditingCustomer({ ...editingCustomer, location: e.target.value })}
                  placeholder="City, District" 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Commercial Register</Label>
                  <Input 
                    value={editingCustomer.commercialRegister || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, commercialRegister: e.target.value })}
                    placeholder="1010123456" 
                  />
                </div>
                <div className="space-y-2">
                  <Label>VAT Number</Label>
                  <Input 
                    value={editingCustomer.vatNumber || ""}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, vatNumber: e.target.value })}
                    placeholder="300159475400003" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract Type</Label>
                  <Select 
                    value={(editingCustomer.contractType || '').toLowerCase()}
                    onValueChange={(value) => setEditingCustomer({ ...editingCustomer, contractType: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly Service</SelectItem>
                      <SelectItem value="quarterly">Quarterly Service</SelectItem>
                      <SelectItem value="yearly">Yearly Service</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Monthly Amount (SAR)</Label>
                  <Input 
                    type="number"
                    value={editingCustomer.monthlyAmount}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, monthlyAmount: parseFloat(e.target.value) || 0 })}
                    placeholder="0.00" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input 
                    type="date"
                    value={editingCustomer.startDate}
                    onChange={(e) => setEditingCustomer({ ...editingCustomer, startDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Status</Label>
                  <Select 
                    value={editingCustomer.status}
                    onValueChange={(value) => setEditingCustomer({ ...editingCustomer, status: value as "active" | "inactive" | "pending" })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="inactive">Inactive</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Assigned Representative</Label>
                <Select 
                  value={editingCustomer.delegateDbId || "none"}
                  onValueChange={(value) => {
                    if (value === "none") {
                      setEditingCustomer({ 
                        ...editingCustomer, 
                        delegateDbId: undefined,
                        representative: undefined
                      });
                    } else {
                      const delegate = dbDelegates.find(d => d.delegate_id === value);
                      setEditingCustomer({ 
                        ...editingCustomer, 
                        delegateDbId: value,
                        representative: delegate?.delegate_name || undefined
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select representative" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {dbDelegates.map(delegate => (
                      <SelectItem key={delegate.delegate_id} value={delegate.delegate_id}>
                        {delegate.delegate_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setIsEditDialogOpen(false);
                setEditingCustomer(null);
              }}>
                Cancel
              </Button>
              <Button onClick={handleSaveEdit}>
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Customer Details Dialog */}
      {selectedCustomer && (
        <Dialog open={!!selectedCustomer} onOpenChange={() => setSelectedCustomer(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Customer Details</DialogTitle>
              <DialogDescription>{selectedCustomer.company}</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Customer Name</Label>
                  <p className="font-medium">{selectedCustomer.name}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Company</Label>
                  <p className="font-medium">{selectedCustomer.company}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Mobile</Label>
                  <p className="font-medium">{selectedCustomer.mobile}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Email</Label>
                  <p className="font-medium">{selectedCustomer.email}</p>
                </div>
              </div>
              <div>
                <Label className="text-muted-foreground">Location</Label>
                <p className="font-medium">{selectedCustomer.location}</p>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Commercial Register</Label>
                  <p className="font-medium">{selectedCustomer.commercialRegister || "N/A"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">VAT Number</Label>
                  <p className="font-medium">{selectedCustomer.vatNumber || "N/A"}</p>
                </div>
              </div>
              <Separator />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Contract Type</Label>
                  <p className="font-medium">{selectedCustomer.contractType}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Monthly Amount</Label>
                  <p className="font-medium">{selectedCustomer.monthlyAmount.toFixed(2)} SAR</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Start Date</Label>
                  <p className="font-medium">{selectedCustomer.startDate}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <Badge variant={selectedCustomer.status === "active" ? "default" : selectedCustomer.status === "inactive" ? "secondary" : "outline"}>
                    {selectedCustomer.status.charAt(0).toUpperCase() + selectedCustomer.status.slice(1)}
                  </Badge>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setSelectedCustomer(null)}>Close</Button>
              <Button onClick={() => {
                handleEditCustomer(selectedCustomer);
                setSelectedCustomer(null);
              }}>Edit Customer</Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Contract Details Dialog */}
      {selectedContract && (
        <Dialog open={isContractDialogOpen} onOpenChange={setIsContractDialogOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Contract Details</DialogTitle>
              <DialogDescription>View contract information for {selectedContractCustomer?.company}</DialogDescription>
            </DialogHeader>
            <div className="space-y-6 py-4">
              {/* Contract Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Contract Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Contract Number</Label>
                    <p className="font-medium">{selectedContract.contractNumber}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Contract Date</Label>
                    <p className="font-medium">{new Date(selectedContract.contractDate).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Payment Plan</Label>
                    <p className="font-medium capitalize">{selectedContract.paymentPlan.replace('-', ' ')}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <Badge variant={
                      selectedContract.status === "active" ? "default" : 
                      selectedContract.status === "draft" ? "secondary" : 
                      selectedContract.status === "signed" ? "outline" : 
                      "destructive"
                    }>
                      {selectedContract.status.charAt(0).toUpperCase() + selectedContract.status.slice(1)}
                    </Badge>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Client Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Client Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Client Name</Label>
                    <p className="font-medium">{selectedContract.clientName}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Commercial Register</Label>
                    <p className="font-medium">{selectedContract.clientCr || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">City</Label>
                    <p className="font-medium">{selectedContract.clientCity || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Representative</Label>
                    <p className="font-medium">{selectedContract.clientRepresentative || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Email</Label>
                    <p className="font-medium">{selectedContract.clientEmail || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Phone</Label>
                    <p className="font-medium">{selectedContract.clientPhone || "N/A"}</p>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Service Details */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Service Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">Service Address</Label>
                    <p className="font-medium">{selectedContract.serviceAddress}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Postal Code</Label>
                    <p className="font-medium">{selectedContract.postalCode || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Monthly Amount</Label>
                    <p className="font-medium">{selectedContract.monthlyAmount.toFixed(2)} SAR</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Emergency Visit Fee</Label>
                    <p className="font-medium">{selectedContract.emergencyVisitFee.toFixed(2)} SAR</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Devices Count</Label>
                    <p className="font-medium">{selectedContract.devicesCount || "N/A"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Device Types</Label>
                    <p className="font-medium">{selectedContract.deviceTypes || "N/A"}</p>
                  </div>
                </div>
              </div>

              {/* Important Dates */}
              {(selectedContract.sentDate || selectedContract.signedDate || selectedContract.attachedDate) && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Important Dates</h3>
                    <div className="grid grid-cols-2 gap-4">
                      {selectedContract.sentDate && (
                        <div>
                          <Label className="text-muted-foreground">Sent Date</Label>
                          <p className="font-medium">{new Date(selectedContract.sentDate).toLocaleDateString('en-GB')}</p>
                        </div>
                      )}
                      {selectedContract.signedDate && (
                        <div>
                          <Label className="text-muted-foreground">Signed Date</Label>
                          <p className="font-medium">{new Date(selectedContract.signedDate).toLocaleDateString('en-GB')}</p>
                        </div>
                      )}
                      {selectedContract.attachedDate && (
                        <div>
                          <Label className="text-muted-foreground">Attached Date</Label>
                          <p className="font-medium">{new Date(selectedContract.attachedDate).toLocaleDateString('en-GB')}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Notes */}
              {selectedContract.notes && (
                <>
                  <Separator />
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">Notes</h3>
                    <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
                      {selectedContract.notes}
                    </p>
                  </div>
                </>
              )}
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setIsContractDialogOpen(false);
                setSelectedContract(null);
                setSelectedContractCustomer(null);
              }}>
                Close
              </Button>
              <Button onClick={() => {
                if (selectedContract) {
                  handlePrintContract(selectedContract);
                }
              }} className="gap-2">
                <Printer className="h-4 w-4" />
                Print Contract
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

