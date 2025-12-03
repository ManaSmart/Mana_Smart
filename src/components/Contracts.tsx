import { useState, useRef, useEffect, useMemo } from "react";
import { Plus, Search, Printer, Trash2, Download, Mail, MessageSquare, CheckCircle, XCircle, PauseCircle, Send, Upload, PlayCircle, MoreVertical, Edit, StickyNote, History, Clock, User, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { ImportExcelButton } from "./ImportExcelButton";
import * as XLSX from "@e965/xlsx";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel } from "./ui/dropdown-menu";
import { ScrollArea } from "./ui/scroll-area";
import { CustomerSelector, type Customer } from "./CustomerSelector";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { thunks, selectors } from "../redux-toolkit/slices";
import type { Customers } from "../../supabase/models/customers";
import type { Contracts as DbContract } from "../../supabase/models/contracts";
import type { MonthlyVisitsInsert } from "../../supabase/models/monthly_visits";
import type { Delegates } from "../../supabase/models/delegates";
import { supabase } from "../lib/supabaseClient";
import { generateAutomaticInvoice } from "../utils/autoInvoice";
import { uploadFile, getFileUrl } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";
import { getPrintLogo } from "../lib/getPrintLogo";

interface HistoryLog {
  id: number;
  action: string;
  description: string;
  user: string;
  timestamp: string;
  details?: string;
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
  attachedFileData?: string; // Deprecated - use attachedFileUrl instead
  attachedFileId?: string;
  attachedFileUrl?: string;
  suspendedDate?: string;
  suspensionReason?: string;
  cancelledDate?: string;
  cancellationReason?: string;
  reactivatedDate?: string;
  notes?: string;
  historyLog?: HistoryLog[];
}

const mockContracts: Contract[] = [
  {
    id: 1,
    recordId: "",
    contractNumber: "CNT-2025-001",
    contractDate: "2025-01-15",
    clientName: "Palm Trading Company",
    clientCr: "1234567890",
    clientCity: "Riyadh",
    clientRepresentative: "Ahmed Al-Salem",
    clientDesignation: "General Manager",
    serviceAddress: "Riyadh, Al Malaz District, Building 123",
    postalCode: "12345",
    monthlyAmount: 2000,
    semiAnnualAmount: 12000,
    annualAmount: 24000,
    devicesCount: "5",
    deviceTypes: "Pro: 2, Ultra: 3",
    emergencyVisitFee: 500,
    paymentPlan: "annual",
    status: "active",
    createdDate: "2025-01-15",
    monthlyVisitStartDate: "2025-01-15",
    clientPhone: "+966501234567",
    clientEmail: "info@palmtrading.com",
    notes: "Premium client. Prefers French scents. Monthly visits on the 15th of each month.",
    historyLog: [
      {
        id: 1,
        action: 'Created',
        description: 'Contract created',
        user: 'System Admin',
        timestamp: '2025-01-15T09:30:00.000Z',
        details: 'Contract created with status: Draft'
      },
      {
        id: 2,
        action: 'Edited',
        description: 'Contract information updated',
        user: 'John Smith',
        timestamp: '2025-01-15T10:15:00.000Z',
        details: 'Updated client contact information and pricing details'
      },
      {
        id: 3,
        action: 'Sent',
        description: 'Contract sent to client',
        user: 'John Smith',
        timestamp: '2025-01-15T11:00:00.000Z',
        details: 'Sent via Email to info@palmtrading.com'
      },
      {
        id: 4,
        action: 'Signed',
        description: 'Contract marked as signed',
        user: 'Sarah Johnson',
        timestamp: '2025-01-16T14:30:00.000Z',
        details: 'Contract status changed from Draft to Signed'
      },
      {
        id: 5,
        action: 'Attached',
        description: 'Signed contract file attached',
        user: 'Sarah Johnson',
        timestamp: '2025-01-16T14:45:00.000Z',
        details: 'File name: contract_signed_palm_trading.pdf. Contract status changed to Active'
      }
    ]
  }
];

const statusColors = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  signed: "bg-blue-100 text-blue-700 border-blue-200",
  attached: "bg-purple-100 text-purple-700 border-purple-200",
  active: "bg-green-100 text-green-700 border-green-200",
  suspended: "bg-yellow-100 text-yellow-700 border-yellow-200",
  expired: "bg-red-100 text-red-700 border-red-200",
  cancelled: "bg-orange-100 text-orange-700 border-orange-200",
};

interface ContractsProps {
  systemLogo: string;
  systemNameAr: string;
  systemNameEn: string;
}

export function Contracts({ systemLogo }: ContractsProps) {
  const dispatch = useAppDispatch();
  const dbCustomers = useAppSelector(selectors.customers.selectAll) as Customers[];
  const dbContracts = useAppSelector(selectors.contracts.selectAll) as DbContract[];
  const dbDelegates = useAppSelector(selectors.delegates.selectAll) as Delegates[];
  
  const [contracts, setContracts] = useState<Contract[]>(mockContracts);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedContract, setSelectedContract] = useState<Contract | null>(null);
  const [editingContract, setEditingContract] = useState<Contract | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isSuspendDialogOpen, setIsSuspendDialogOpen] = useState(false);
  const [isCancelDialogOpen, setIsCancelDialogOpen] = useState(false);
  const [isNotesDialogOpen, setIsNotesDialogOpen] = useState(false);
  const [isHistoryDialogOpen, setIsHistoryDialogOpen] = useState(false);
  const [suspensionReason, setSuspensionReason] = useState("");
  const [cancellationReason, setCancellationReason] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>();
  const [hasRepresentative, setHasRepresentative] = useState(false);
  const [selectedDelegateId, setSelectedDelegateId] = useState<string | null>(null);

  // Load customers and contracts from Redux
  useEffect(() => {
    dispatch(thunks.customers.fetchAll(undefined));
    dispatch(thunks.contracts.fetchAll(undefined));
    dispatch(thunks.delegates.fetchAll(undefined));
  }, [dispatch]);

  // Map database contracts to UI Contract format
  useEffect(() => {
    if (dbContracts.length > 0) {
      const mappedContracts: Contract[] = dbContracts.map((dbContract, idx) => {
        // Try to parse additional data from notes field (stored as JSON)
        let additionalData: any = {};
        try {
          if (dbContract.notes) {
            additionalData = JSON.parse(dbContract.notes);
          }
        } catch (e) {
          // If notes is not JSON, treat it as regular notes
          additionalData = { notes: dbContract.notes };
        }

        // Get payment plan
        const paymentPlan = additionalData.paymentPlan || "monthly";

        return {
          id: idx + 1,
          recordId: dbContract.contract_id,
          contractNumber: dbContract.contract_number,
          contractDate: dbContract.contract_start_date,
          monthlyVisitStartDate: additionalData.monthlyVisitStartDate || dbContract.contract_start_date,
          clientName: additionalData.clientName || "",
          clientCr: additionalData.clientCr || "",
          clientCity: additionalData.clientCity || "",
          clientRepresentative: additionalData.clientRepresentative || "",
          clientDesignation: additionalData.clientDesignation || "",
          serviceAddress: dbContract.location || additionalData.serviceAddress || "",
          postalCode: additionalData.postalCode || "",
          monthlyAmount: additionalData.monthlyAmount || 0,
          semiAnnualAmount: additionalData.semiAnnualAmount || 0,
          annualAmount: additionalData.annualAmount || 0,
          devicesCount: additionalData.devicesCount || "",
          deviceTypes: additionalData.deviceTypes || "",
          emergencyVisitFee: additionalData.emergencyVisitFee || 500,
          paymentPlan: paymentPlan as "monthly" | "semi-annual" | "annual",
          status: (dbContract.contract_status || "draft") as Contract["status"],
          createdDate: dbContract.created_at ? dbContract.created_at.split('T')[0] : new Date().toISOString().split('T')[0],
          clientPhone: additionalData.clientPhone || "",
          clientEmail: additionalData.clientEmail || "",
          sentDate: additionalData.sentDate,
          signedDate: additionalData.signedDate,
          attachedDate: additionalData.attachedDate,
          attachedFileName: additionalData.attachedFileName,
          attachedFileData: additionalData.attachedFileData, // Keep for backward compatibility
          attachedFileId: additionalData.attachedFileId,
          attachedFileUrl: additionalData.attachedFileUrl,
          suspendedDate: additionalData.suspendedDate,
          suspensionReason: additionalData.suspensionReason,
          cancelledDate: additionalData.cancelledDate,
          cancellationReason: additionalData.cancellationReason,
          reactivatedDate: additionalData.reactivatedDate,
          notes: typeof additionalData.notes === 'string' ? additionalData.notes : dbContract.notes || "",
          historyLog: additionalData.historyLog || [],
        };
      });
      setContracts(mappedContracts);
    } else {
      setContracts([]);
    }
  }, [dbContracts]);

  // Map DB customers to Customer interface
  const customers: Customer[] = useMemo(() => {
    return dbCustomers.map((c, idx) => ({
      id: idx + 1,
      name: c.customer_name ?? c.company ?? "",
      company: c.company ?? "",
      mobile: c.contact_num ?? "",
      email: c.customer_email ?? "",
      location: c.customer_address ?? c.customer_city_of_residence ?? "",
      commercialRegister: c.customer_city_of_residence ?? "",
      status: (c.status ?? "active") as "active" | "inactive" | "pending",
    }));
  }, [dbCustomers]);


  // Form states
  const [formData, setFormData] = useState({
    contractDate: new Date().toISOString().split('T')[0],
    monthlyVisitStartDate: new Date().toISOString().split('T')[0],
    clientName: "",
    clientCr: "",
    clientCity: "",
    clientRepresentative: "",
    clientDesignation: "",
    serviceAddress: "",
    postalCode: "",
    monthlyAmount: "",
    semiAnnualAmount: "",
    annualAmount: "",
    devicesCount: "",
    deviceTypes: "",
    emergencyVisitFee: "500",
    paymentPlan: "monthly" as "monthly" | "semi-annual" | "annual",
    clientPhone: "",
    clientEmail: "",
    notes: "",
  });

  const filteredContracts = contracts.filter((contract) => {
    const matchesSearch = 
      contract.contractNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      contract.clientName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = filterStatus === "all" || contract.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const exportToExcel = () => {
    try {
      const exportData = filteredContracts.map((contract) => ({
        "Contract Number": contract.contractNumber,
        "Contract Date": contract.contractDate,
        "Client Name": contract.clientName,
        "Client CR": contract.clientCr,
        "Client City": contract.clientCity,
        "Client Representative": contract.clientRepresentative,
        "Client Designation": contract.clientDesignation,
        "Service Address": contract.serviceAddress,
        "Postal Code": contract.postalCode,
        "Monthly Amount (SAR)": contract.monthlyAmount,
        "Semi-Annual Amount (SAR)": contract.semiAnnualAmount,
        "Annual Amount (SAR)": contract.annualAmount,
        "Payment Plan": contract.paymentPlan,
        "Devices Count": contract.devicesCount,
        "Device Types": contract.deviceTypes,
        "Emergency Visit Fee (SAR)": contract.emergencyVisitFee,
        Status: contract.status,
        "Created Date": contract.createdDate,
        "Monthly Visit Start Date": contract.monthlyVisitStartDate || "",
        "Client Phone": contract.clientPhone || "",
        "Client Email": contract.clientEmail || "",
        "Sent Date": contract.sentDate || "",
        "Signed Date": contract.signedDate || "",
        "Attached Date": contract.attachedDate || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 18 }, { wch: 12 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
        { wch: 20 }, { wch: 18 }, { wch: 30 }, { wch: 12 }, { wch: 18 },
        { wch: 20 }, { wch: 18 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
        { wch: 20 }, { wch: 12 }, { wch: 12 }, { wch: 18 }, { wch: 15 },
        { wch: 25 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Contracts");
      const fileName = `contracts_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  const handleAddContract = async () => {
    if (!selectedCustomerId && !formData.clientName.trim()) {
      toast.error("Please select a customer or enter client name");
      return;
    }

    const currentUser = localStorage.getItem('userName') || 'System Admin';
    const now = new Date();
    const timestamp = now.toISOString();
    
    const initialLog: HistoryLog = {
      id: Date.now(),
      action: 'Created',
      description: 'Contract created',
      user: currentUser,
      timestamp,
      details: `Contract created with status: Draft`
    };

    // Get customer_id
    const customerId = selectedCustomerId 
      ? dbCustomers[selectedCustomerId - 1]?.customer_id 
      : null;

    if (!customerId) {
      toast.error("Please select a customer from the list");
      return;
    }

    const contractDurationMap: Record<"monthly" | "semi-annual" | "annual", string> = {
      monthly: "monthly",
      "semi-annual": "semi_annual",
      annual: "annual",
    };

    // Calculate contract amount based on payment plan
    let contractAmount = 0;
    if (formData.paymentPlan === "monthly") {
      contractAmount = parseFloat(formData.monthlyAmount) || 0;
    } else if (formData.paymentPlan === "semi-annual") {
      contractAmount = parseFloat(formData.semiAnnualAmount) || 0;
    } else {
      contractAmount = parseFloat(formData.annualAmount) || 0;
    }

    // Prepare additional data to store in notes field as JSON
    const additionalData = {
      monthlyVisitStartDate: formData.monthlyVisitStartDate,
      clientName: formData.clientName,
      clientCr: formData.clientCr,
      clientCity: formData.clientCity,
      clientRepresentative: formData.clientRepresentative,
      clientDesignation: formData.clientDesignation,
      postalCode: formData.postalCode,
      monthlyAmount: parseFloat(formData.monthlyAmount) || 0,
      semiAnnualAmount: parseFloat(formData.semiAnnualAmount) || 0,
      annualAmount: parseFloat(formData.annualAmount) || 0,
      devicesCount: formData.devicesCount,
      deviceTypes: formData.deviceTypes,
      emergencyVisitFee: parseFloat(formData.emergencyVisitFee) || 500,
      paymentPlan: formData.paymentPlan,
      clientPhone: formData.clientPhone,
      clientEmail: formData.clientEmail,
      notes: formData.notes,
      assignedDelegateId: selectedDelegateId,
      assignedDelegateName: hasRepresentative ? formData.clientRepresentative : undefined,
      historyLog: [initialLog],
    };

    // Prepare database contract
    const contractNumber = `CNT-2025-${String(dbContracts.length + 1).padStart(3, "0")}`;
    const dbContractPayload: Partial<DbContract> = {
      contract_number: contractNumber,
      contract_status: "draft",
      contract_amount: contractAmount,
      contract_start_date: formData.contractDate,
      contract_end_date: null,
      contract_duration_interval: contractDurationMap[formData.paymentPlan],
      customer_id: customerId,
      location: formData.serviceAddress,
      notes: JSON.stringify(additionalData),
      delegate_id: null,
    };

    try {
      await dispatch(thunks.contracts.createOne(dbContractPayload)).unwrap();
      dispatch(thunks.contracts.fetchAll(undefined));
      setIsAddDialogOpen(false);
      resetForm();
      toast.success("Contract created successfully!");
    } catch (error: any) {
      console.error('Failed to create contract:', error);
      toast.error(`Failed to create contract: ${error.message || 'Unknown error'}`);
    }
  };

  const resetForm = () => {
    setFormData({
      contractDate: new Date().toISOString().split('T')[0],
      monthlyVisitStartDate: new Date().toISOString().split('T')[0],
      clientName: "",
      clientCr: "",
      clientCity: "",
      clientRepresentative: "",
      clientDesignation: "",
      serviceAddress: "",
      postalCode: "",
      monthlyAmount: "",
      semiAnnualAmount: "",
      annualAmount: "",
      devicesCount: "",
      deviceTypes: "",
      emergencyVisitFee: "500",
      paymentPlan: "monthly",
      clientPhone: "",
      clientEmail: "",
      notes: "",
    });
    setSelectedCustomerId(undefined);
    setHasRepresentative(false);
    setSelectedDelegateId(null);
  };

  // Handle customer selection from dropdown
  const handleCustomerSelect = (customer: Customer) => {
    if (customer.id) {
      setSelectedCustomerId(customer.id);
      const dbCustomer = dbCustomers[customer.id - 1];
      
      // Check if customer has a representative
      const delegateId = dbCustomer?.delegate_id ?? null;
      const delegateName =
        delegateId && dbDelegates.length > 0
          ? dbDelegates.find((delegate) => delegate.delegate_id === delegateId)?.delegate_name ?? ""
          : "";

      const hasRep = !!delegateId;
      setHasRepresentative(hasRep);
      setSelectedDelegateId(delegateId);
      
      // Prefill form with all available customer data
      setFormData(prev => ({
        ...prev,
        clientName: customer.name || customer.company || "",
        clientCr: customer.commercialRegister || "",
        clientCity: customer.location ? customer.location.split(',')[0].trim() : "",
        serviceAddress: customer.location || "",
        clientPhone: customer.mobile || "",
        clientEmail: customer.email || "",
        clientRepresentative: hasRep
          ? delegateName || prev.clientRepresentative || ""
          : "",
      }));
    } else {
      // Clear selection - allow manual entry
      setSelectedCustomerId(undefined);
      setHasRepresentative(false);
      setSelectedDelegateId(null);
      setFormData(prev => ({
        ...prev,
        clientName: "",
        clientRepresentative: "",
      }));
    }
  };

  // Handle customer add (when new customer is added via CustomerSelector)
  const handleCustomerAdd = (newCustomer: Customer) => {
    // Customer is already added to the list by CustomerSelector
    // Just select it
    handleCustomerSelect(newCustomer);
  };

  const handleSendContract = (contract: Contract) => {
    const currentUser = localStorage.getItem('userName') || 'System Admin';
    const now = new Date();
    const timestamp = now.toISOString();
    
    const sendLog: HistoryLog = {
      id: Date.now(),
      action: 'Sent',
      description: 'Contract sent to client',
      user: currentUser,
      timestamp,
      details: `Sent via ${contract.clientEmail ? 'Email' : 'WhatsApp'}`
    };

    setContracts(contracts.map((c) =>
      c.id === contract.id
        ? { 
            ...c, 
            sentDate: new Date().toISOString().split('T')[0],
            historyLog: [...(c.historyLog || []), sendLog]
          }
        : c
    ));
    toast.success("Contract marked as sent!");
  };

  const [isSignConfirmOpen, setIsSignConfirmOpen] = useState(false);
  const [contractToSign, setContractToSign] = useState<Contract | null>(null);

  const handleSignContract = (contract: Contract) => {
    // Only allow signing if status is draft
    if (contract.status !== "draft") {
      toast.error("Only draft contracts can be marked as signed");
      return;
    }
    setContractToSign(contract);
    setIsSignConfirmOpen(true);
  };

  const confirmSignContract = async () => {
    if (!contractToSign) return;
    
    const currentUser = localStorage.getItem('userName') || 'System Admin';
    const now = new Date();
    const timestamp = now.toISOString();
    
    const signLog: HistoryLog = {
      id: Date.now(),
      action: 'Signed',
      description: 'Contract marked as signed',
      user: currentUser,
      timestamp,
      details: `Contract status changed from ${contractToSign.status} to Signed`
    };

    // Find the database contract
    const dbContract = dbContracts.find(c => c.contract_number === contractToSign.contractNumber);
    if (!dbContract) {
      toast.error("Contract not found in database");
      return;
    }

    // Parse existing notes
    let additionalData: any = {};
    try {
      if (dbContract.notes) {
        additionalData = JSON.parse(dbContract.notes);
      }
    } catch (e) {
      additionalData = { notes: dbContract.notes };
    }

    // Update additional data
    additionalData.signedDate = new Date().toISOString().split('T')[0];
    additionalData.historyLog = [...(additionalData.historyLog || []), signLog];

    // Update database contract
    try {
      await dispatch(thunks.contracts.updateOne({
        id: dbContract.contract_id,
        values: {
          contract_status: "signed",
          notes: JSON.stringify(additionalData),
        }
      })).unwrap();
      
      dispatch(thunks.contracts.fetchAll(undefined));
      setIsSignConfirmOpen(false);
      setContractToSign(null);
      toast.success("Contract marked as signed!");
    } catch (error: any) {
      console.error('Failed to update contract:', error);
      toast.error(`Failed to update contract: ${error.message || 'Unknown error'}`);
    }
  };

  const [isAttachConfirmOpen, setIsAttachConfirmOpen] = useState(false);
  const [contractToAttach, setContractToAttach] = useState<Contract | null>(null);

  const handleAttachContract = (contract: Contract) => {
    // Only allow attaching if status is signed
    if (contract.status !== "signed") {
      toast.error("Only signed contracts can have files attached");
      return;
    }
    setContractToAttach(contract);
    setIsAttachConfirmOpen(true);
  };

  const confirmAttachContract = () => {
    if (!contractToAttach) return;
    setSelectedContract(contractToAttach);
    setIsAttachConfirmOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedContract) return;

    // Validate file type
    if (!file.name.match(/\.(pdf|jpg|jpeg|png)$/i)) {
      toast.error("Please upload a PDF, JPG, or PNG file");
      return;
    }

    // Validate file size (10 MB max for contracts)
    if (file.size > 10 * 1024 * 1024) {
      toast.error("File size must be less than 10 MB");
      return;
    }

    const currentUser = localStorage.getItem('userName') || 'System Admin';
    const now = new Date();
    const timestamp = now.toISOString();
    
    // Find the database contract
    const dbContract = dbContracts.find(c => c.contract_number === selectedContract.contractNumber);
    if (!dbContract) {
      toast.error("Contract not found in database");
      return;
    }

    try {
      // Get current user ID from localStorage
      const stored = localStorage.getItem('auth_user');
      let currentUserId: string | null = null;
      
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          currentUserId = parsed.user_id || null;
        } catch (e) {
          console.error('Failed to parse auth_user', e);
        }
      }

      // Upload file to S3/Supabase storage
      const uploadResult = await uploadFile({
        file,
        category: FILE_CATEGORIES.CONTRACT_FILE,
        ownerId: dbContract.contract_id,
        ownerType: 'contract',
        description: `Signed contract file for ${selectedContract.contractNumber}`,
        userId: currentUserId || undefined,
      });

      if (!uploadResult.success || !uploadResult.fileMetadata) {
        throw new Error(uploadResult.error || 'Failed to upload contract file');
      }

      // Get file URL
      const fileUrl = uploadResult.publicUrl || uploadResult.signedUrl || (await getFileUrl(
        uploadResult.fileMetadata.bucket as any,
        uploadResult.fileMetadata.path,
        uploadResult.fileMetadata.is_public
      ));

      const attachLog: HistoryLog = {
        id: Date.now(),
        action: 'Attached',
        description: 'Signed contract file attached',
        user: currentUser,
        timestamp,
        details: `File name: ${file.name}. Contract status changed to Active`
      };
      
      const activationDate = new Date().toISOString().split('T')[0];
      const visitStartDate = selectedContract.monthlyVisitStartDate || activationDate;

      // Parse existing notes
      let additionalData: any = {};
      try {
        if (dbContract.notes) {
          additionalData = JSON.parse(dbContract.notes);
        }
      } catch (e) {
        additionalData = { notes: dbContract.notes };
      }

      // Update additional data - store file metadata ID instead of base64
      additionalData.attachedDate = activationDate;
      additionalData.attachedFileName = file.name;
      additionalData.attachedFileId = uploadResult.fileMetadata.id; // Store file metadata ID
      additionalData.attachedFileUrl = fileUrl; // Store file URL for quick access
      additionalData.monthlyVisitStartDate = visitStartDate;
      additionalData.historyLog = [...(additionalData.historyLog || []), attachLog];

      // Update contract status to Active
      await dispatch(thunks.contracts.updateOne({
        id: dbContract.contract_id,
        values: {
          contract_status: "active",
          notes: JSON.stringify(additionalData),
        }
      })).unwrap();
      
      dispatch(thunks.contracts.fetchAll(undefined));
      
      const nextVisitDate = await generateMonthlyVisit(dbContract, visitStartDate);
      const formattedDate = nextVisitDate ? new Date(nextVisitDate).toLocaleDateString('en-GB') : null;
      toast.success(
        `Contract attached and activated! File: ${file.name}. ${
          formattedDate ? `Next visit scheduled for ${formattedDate}.` : "Next visit already scheduled."
        }`
      );
    } catch (error: any) {
      console.error('Failed to upload contract file:', error);
      toast.error(`Failed to upload contract file: ${error.message || 'Unknown error'}`);
    } finally {
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const generateMonthlyVisit = async (
    dbContract: DbContract,
    startDate: string
  ): Promise<string | null> => {
    const baseDate = new Date(startDate);
    if (Number.isNaN(baseDate.getTime())) {
      return null;
    }

    // First, check for the latest scheduled visit for this contract
    const { data: latestScheduledVisits, error: latestError } = await supabase
      .from("monthly_visits")
      .select("visit_id, visit_date, status")
      .eq("contract_id", dbContract.contract_id)
      .eq("status", "scheduled")
      .order("visit_date", { ascending: false })
      .limit(1);

    if (latestError) {
      throw latestError;
    }

    // Calculate the next visit date (1 month after start date)
    const upcomingVisit = new Date(baseDate);
    upcomingVisit.setMonth(upcomingVisit.getMonth() + 1);
    let visitDateIso = upcomingVisit.toISOString().split("T")[0];

    // If there's a latest scheduled visit, ensure the new visit is after it
    if (latestScheduledVisits && latestScheduledVisits.length > 0) {
      const latestVisitDate = new Date(latestScheduledVisits[0].visit_date).getTime();
      const newVisitDate = new Date(visitDateIso).getTime();
      
      // If the new visit date is on or before the latest scheduled visit, adjust it
      if (newVisitDate <= latestVisitDate) {
        // Set the new visit to be 1 month after the latest scheduled visit
        const adjustedDate = new Date(latestScheduledVisits[0].visit_date);
        adjustedDate.setMonth(adjustedDate.getMonth() + 1);
        const adjustedDateIso = adjustedDate.toISOString().split("T")[0];
        
        // Check if this adjusted date already exists
        const { data: existingAdjusted, error: adjustedError } = await supabase
          .from("monthly_visits")
          .select("visit_id")
          .eq("contract_id", dbContract.contract_id)
          .eq("visit_date", adjustedDateIso);

        if (adjustedError) {
          throw adjustedError;
        }

        if (existingAdjusted && existingAdjusted.length > 0) {
          // Visit already exists for the adjusted date
          return adjustedDateIso;
        }

        // Use the adjusted date
        visitDateIso = adjustedDateIso;
      }
    }

    // Check if a visit already exists for the calculated date
    const { data: existingVisits, error: existingError } = await supabase
      .from("monthly_visits")
      .select("visit_id")
      .eq("contract_id", dbContract.contract_id)
      .eq("visit_date", visitDateIso);

    if (existingError) {
      throw existingError;
    }

    if (existingVisits && existingVisits.length > 0) {
      return visitDateIso;
    }

    let delegateId = dbContract.delegate_id ?? null;
    let address = dbContract.location ?? null;

    if (!delegateId || !address) {
      const { data: customerRow, error: customerError } = await supabase
        .from("customers")
        .select("delegate_id, customer_address")
        .eq("customer_id", dbContract.customer_id)
        .maybeSingle();

      if (customerError) {
        throw customerError;
      }

      if (customerRow) {
        if (!delegateId) {
          delegateId = customerRow.delegate_id ?? null;
        }
        if (!address) {
          address = customerRow.customer_address ?? null;
        }
      }
    }

    // Get current user ID from localStorage
    const stored = localStorage.getItem('auth_user');
    let currentUserId: string | null = null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        currentUserId = parsed.user_id || null;
      } catch (e) {
        console.error('Failed to parse auth_user', e);
      }
    }

    const visitPayload: MonthlyVisitsInsert = {
      contract_id: dbContract.contract_id,
      customer_id: dbContract.customer_id,
      visit_date: visitDateIso,
      visit_time: null,
      status: "scheduled",
      address,
      notes: `Monthly visit for contract ${dbContract.contract_number}`,
      delegate_id: delegateId,
      created_by: currentUserId,
      updated_by: currentUserId,
    };

    await dispatch(thunks.monthly_visits.createOne(visitPayload)).unwrap();

    // Generate automatic invoice if contract is active and automatic invoicing is enabled
    if (dbContract.contract_status?.toLowerCase() === 'active') {
      try {
        // Parse contract additional data to get payment plan information
        let contractAdditionalData: any = {};
        try {
          if (dbContract.notes) {
            contractAdditionalData = JSON.parse(dbContract.notes);
          }
        } catch (e) {
          // If notes is not JSON, use defaults
        }

        const paymentPlan = contractAdditionalData.paymentPlan || "monthly";
        const monthlyAmount = contractAdditionalData.monthlyAmount || 0;
        const semiAnnualAmount = contractAdditionalData.semiAnnualAmount || 0;
        const annualAmount = contractAdditionalData.annualAmount || 0;

        // Generate automatic invoice
        await generateAutomaticInvoice(
          dbContract.customer_id,
          dbContract.contract_id,
          visitDateIso,
          paymentPlan as "monthly" | "semi-annual" | "annual",
          monthlyAmount,
          semiAnnualAmount,
          annualAmount,
          dispatch,
          thunks
        );
      } catch (error) {
        // Log error but don't fail the visit creation
        console.error('Failed to generate automatic invoice for monthly visit:', error);
      }
    }

    return visitDateIso;
  };

  const handleSuspendContract = () => {
    if (!selectedContract || !suspensionReason.trim()) {
      toast.error("Please provide a suspension reason");
      return;
    }
    
    const currentUser = localStorage.getItem('userName') || 'System Admin';
    const now = new Date();
    const timestamp = now.toISOString();
    
    const suspendLog: HistoryLog = {
      id: Date.now(),
      action: 'Suspended',
      description: 'Contract suspended',
      user: currentUser,
      timestamp,
      details: `Reason: ${suspensionReason}`
    };

    setContracts(contracts.map((c) =>
      c.id === selectedContract.id
        ? {
            ...c,
            status: "suspended",
            suspendedDate: new Date().toISOString().split('T')[0],
            suspensionReason: suspensionReason,
            historyLog: [...(c.historyLog || []), suspendLog]
          }
        : c
    ));
    setIsSuspendDialogOpen(false);
    setSuspensionReason("");
    toast.success("Contract suspended successfully!");
  };

  const handleCancelContract = () => {
    if (!selectedContract || !cancellationReason.trim()) {
      toast.error("Please provide a cancellation reason");
      return;
    }
    
    const currentUser = localStorage.getItem('userName') || 'System Admin';
    const now = new Date();
    const timestamp = now.toISOString();
    
    const cancelLog: HistoryLog = {
      id: Date.now(),
      action: 'Cancelled',
      description: 'Contract cancelled',
      user: currentUser,
      timestamp,
      details: `Reason: ${cancellationReason}`
    };

    setContracts(contracts.map((c) =>
      c.id === selectedContract.id
        ? {
            ...c,
            status: "cancelled",
            cancelledDate: new Date().toISOString().split('T')[0],
            cancellationReason: cancellationReason,
            historyLog: [...(c.historyLog || []), cancelLog]
          }
        : c
    ));
    setIsCancelDialogOpen(false);
    setCancellationReason("");
    toast.success("Contract cancelled successfully!");
  };

  const handleReactivateContract = (contract: Contract) => {
    const today = new Date().toISOString().split('T')[0];
    const currentUser = localStorage.getItem('userName') || 'System Admin';
    const now = new Date();
    const timestamp = now.toISOString();
    
    const reactivateLog: HistoryLog = {
      id: Date.now(),
      action: 'Reactivated',
      description: 'Contract reactivated',
      user: currentUser,
      timestamp,
      details: `Contract reactivated from ${contract.status} status. Monthly visit start date updated to ${today}`
    };

    setContracts(contracts.map((c) =>
      c.id === contract.id
        ? {
            ...c,
            status: "active",
            reactivatedDate: today,
            monthlyVisitStartDate: today,
            suspendedDate: undefined,
            suspensionReason: undefined,
            cancelledDate: undefined,
            cancellationReason: undefined,
            historyLog: [...(c.historyLog || []), reactivateLog]
          }
        : c
    ));
    toast.success("Contract reactivated successfully!");
  };

  const handleDeleteContract = async (contract: Contract) => {
    if (!contract.recordId) {
      toast.error("Unable to delete contract: missing contract identifier.");
      return;
    }

    const confirmed = window.confirm(
      "Are you sure you want to delete this contract? This action cannot be undone."
    );

    if (!confirmed) return;

    try {
      await dispatch(thunks.contracts.deleteOne(contract.recordId)).unwrap();
      setContracts((prev) => prev.filter((c) => c.recordId !== contract.recordId));
      toast.success("Contract deleted successfully!");
    } catch (error: any) {
      console.error("Failed to delete contract:", error);
      toast.error(`Failed to delete contract: ${error?.message ?? "Unknown error"}`);
    }
  };

  const handleEditContract = (contract: Contract) => {
    setEditingContract(contract);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingContract) return;
    
    const currentUser = localStorage.getItem('userName') || 'System Admin';
    const now = new Date();
    const timestamp = now.toISOString();
    
    const editLog: HistoryLog = {
      id: Date.now(),
      action: 'Edited',
      description: 'Contract information updated',
      user: currentUser,
      timestamp,
      details: 'Contract details were modified'
    };

    const updatedContract = {
      ...editingContract,
      historyLog: [...(editingContract.historyLog || []), editLog]
    };
    
    setContracts(contracts.map((c) =>
      c.id === updatedContract.id ? updatedContract : c
    ));
    setIsEditDialogOpen(false);
    setEditingContract(null);
    toast.success("Contract updated successfully!");
  };

  const handleWhatsAppSend = (contract: Contract) => {
    const message = `Hello ${contract.clientName},\n\nYour service contract ${contract.contractNumber} is ready for review.\n\nBest regards,\nMana Smart Trading Company`;
    const phone = contract.clientPhone?.replace(/\D/g, '');
    const whatsappUrl = `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
    handleSendContract(contract);
  };

  const handleEmailSend = (contract: Contract) => {
    const subject = `Service Contract - ${contract.contractNumber}`;
    const body = `Dear ${contract.clientName},\n\nPlease find attached your service contract ${contract.contractNumber}.\n\nBest regards,\nMana Smart Trading Company`;
    const mailtoUrl = `mailto:${contract.clientEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoUrl);
    handleSendContract(contract);
  };

  const handlePrintContract = async (contract: Contract) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    // Load logo from Settings if not provided
    const logoToUse = systemLogo || (await getPrintLogo()) || undefined;
    const html = generateContractHTML(contract, logoToUse);
    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.print();
  };

  const handlePrintAttachedContract = async (contract: Contract) => {
    // Use file URL if available, otherwise fall back to base64 (for old contracts)
    let fileUrl = contract.attachedFileUrl || contract.attachedFileData;
    
    // If we have a file ID but no URL, try to get it
    if (!fileUrl && contract.attachedFileId) {
      try {
        const { getFileMetadata, getFileUrl } = await import("../lib/storage");
        const fileMetadata = await getFileMetadata(contract.attachedFileId);
        if (fileMetadata) {
          const url = await getFileUrl(
            fileMetadata.bucket as any,
            fileMetadata.path,
            fileMetadata.is_public
          );
          fileUrl = url ?? undefined;
        }
      } catch (error) {
        console.error('Error loading file URL:', error);
      }
    }

    if (!fileUrl) {
      toast.error("No attached contract file found");
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const fileType = contract.attachedFileName?.toLowerCase();
    
    if (fileType?.endsWith('.pdf')) {
      // For PDF files
      printWindow.document.write(`
        <html>
          <head><title>Print ${contract.attachedFileName}</title></head>
          <body style="margin:0;">
            <embed src="${fileUrl}" type="application/pdf" width="100%" height="100%" />
          </body>
        </html>
      `);
      printWindow.document.close();
      setTimeout(() => printWindow.print(), 500);
    } else {
      // For image files
      printWindow.document.write(`
        <html>
          <head>
            <title>Print ${contract.attachedFileName}</title>
            <style>
              body { margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
              img { max-width: 100%; height: auto; }
            </style>
          </head>
          <body>
            <img src="${fileUrl}" alt="${contract.attachedFileName}" />
          </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
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
              The Provider undertakes to provide scenting services using designated devices and aromatic oils, including installation, refilling, maintenance, and follow-up, as outlined in this agreement and the service annex.
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
              This contract is valid for one calendar year starting from the date of signing and is automatically renewed unless either party notifies the other of its intention not to renew at least thirty (30) days prior to expiration.
            </div>
          </div>
        </div>

        <!-- Clause 3 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الثالث: بداية الخدمة</div>
            <div class="clause-content">
              تبدأ الخدمة خلال (2–5) أيام عمل من تاريخ التوقيع وسداد الدفعة الأولى.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 3: Service Commencement</div>
            <div class="clause-content">
              Service will commence within (2–5) business days from the signing date and after the first payment is made.
            </div>
          </div>
        </div>

        <!-- Clause 4 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الرابع: خطة الدفع المتفق عليها</div>
            <div class="clause-content">
              ${contract.paymentPlan === 'monthly' 
                ? `<strong>✓ الخطة الشهرية:</strong><br>يدفع العميل مبلغ (${replaceVariables('{{monthly_amount}}', contract)}) ريال سعودي شهريًا.`
                : contract.paymentPlan === 'semi-annual'
                ? `<strong>✓ الخطة النصف سنوية:</strong><br>(6 أشهر + شهر مجاني)، يدفع العميل مبلغ (${replaceVariables('{{semi_annual_amount}}', contract)}) ريال سعودي مقدمًا.<br><em style="color: #3b82f6;">المجموع الفعلي: 7 أشهر خدمة مقابل 6 أشهر دفع.</em>`
                : `<strong>✓ الخطة السنوية:</strong><br>(12 شهر + شهرين مجانيين)، يدفع العميل مبلغ (${replaceVariables('{{annual_amount}}', contract)}) ريال سعودي مقدمًا.<br><em style="color: #3b82f6;">المجموع الفعلي: 14 شهر خدمة مقابل 12 شهر دفع.</em>`
              }
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 4: Agreed Payment Plan</div>
            <div class="clause-content">
              ${contract.paymentPlan === 'monthly'
                ? `<strong>✓ Monthly Plan:</strong><br>The client pays (${replaceVariables('{{monthly_amount}}', contract)}) SAR per month.`
                : contract.paymentPlan === 'semi-annual'
                ? `<strong>✓ Semi-Annual Plan:</strong><br>(6 months + 1 month free), The client pays (${replaceVariables('{{semi_annual_amount}}', contract)}) SAR in advance.<br><em style="color: #3b82f6;">Total: 7 months of service for 6 months payment.</em>`
                : `<strong>✓ Annual Plan:</strong><br>(12 months + 2 months free), The client pays (${replaceVariables('{{annual_amount}}', contract)}) SAR in advance.<br><em style="color: #3b82f6;">Total: 14 months of service for 12 months payment.</em>`
              }
            </div>
          </div>
        </div>

        <!-- Clause 5 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الخامس: موقع الخدمة</div>
            <div class="clause-content">
              العنوان: ${replaceVariables('{{service_address}}', contract)}
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 5: Service Location</div>
            <div class="clause-content">
              Address: ${replaceVariables('{{service_address}}', contract)}
            </div>
          </div>
        </div>

        <!-- Clause 6 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند السادس: العطور وتغيير الروائح</div>
            <div class="clause-content">
              يحق للعميل اختيار الروائح من قائمة المزود، ويمكن تغييرها شهريًا حسب التوفر.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 6: Fragrances and Scent Changes</div>
            <div class="clause-content">
              The client has the right to choose fragrances from the provider's list. Scents can be changed monthly based on availability.
            </div>
          </div>
        </div>

        <!-- Clause 7 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند السابع: الأجهزة وعددها</div>
            <div class="clause-content">
              عدد الأجهزة: ${replaceVariables('{{devices_count}}', contract)}<br>
              أنواع الأجهزة: ${replaceVariables('{{device_types}}', contract)}
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 7: Devices and Quantity</div>
            <div class="clause-content">
              Number of devices: ${replaceVariables('{{devices_count}}', contract)}<br>
              Device types: ${replaceVariables('{{device_types}}', contract)}
            </div>
          </div>
        </div>

        <!-- Clause 8 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الثامن: التزامات المزود</div>
            <div class="clause-content">
              <ul>
                <li>تركيب وتشغيل الأجهزة.</li>
                <li>تعبئة الزيوت دوريًا.</li>
                <li>صيانة شهرية أو عند الطلب.</li>
                <li>استبدال الجهاز في حال العطل الكامل.</li>
              </ul>
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 8: Provider's Responsibilities</div>
            <div class="clause-content">
              <ul>
                <li>Installation and operation of devices.</li>
                <li>Periodic refilling of oils.</li>
                <li>Monthly or on-demand maintenance.</li>
                <li>Device replacement in case of full malfunction.</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Clause 9 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند التاسع: التزامات العميل</div>
            <div class="clause-content">
              <ul>
                <li>تسهيل وصول فريق المزود.</li>
                <li>سداد المستحقات في وقتها.</li>
                <li>عدم نقل أو تعديل الأجهزة دون إذن.</li>
                <li>الإبلاغ عن الأعطال خلال 24 ساعة.</li>
                <li>تعيين شخص مسؤول للتواصل.</li>
              </ul>
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 9: Client's Responsibilities</div>
            <div class="clause-content">
              <ul>
                <li>Facilitate access for the provider's team.</li>
                <li>Timely payment of dues.</li>
                <li>Not to move or modify devices without permission.</li>
                <li>Report malfunctions within 24 hours.</li>
                <li>Assign a responsible person for communication.</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Clause 10 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند العاشر: الصيانة والاستجابة</div>
            <div class="clause-content">
              يلتزم المزود بالاستجابة خلال:
              <ul>
                <li>48 ساعة في المدن الرئيسية.</li>
                <li>72 ساعة في المدن الأخرى.</li>
              </ul>
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 10: Maintenance and Response</div>
            <div class="clause-content">
              The provider must respond within:
              <ul>
                <li>48 hours in main cities.</li>
                <li>72 hours in other cities.</li>
              </ul>
            </div>
          </div>
        </div>

        <!-- Clause 11 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الحادي عشر: إعادة الخدمة بعد الإيقاف</div>
            <div class="clause-content">
              يمكن إعادة الخدمة خلال 30 يومًا بعد تسوية المستحقات في حال الإيقاف بسبب التأخر في السداد، وبعدها يُعتبر العقد مفسوخًا.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 11: Service Resumption after Suspension</div>
            <div class="clause-content">
              Service can be resumed within 30 days after settling outstanding dues in case of suspension due to delayed payment. After this period, the contract is considered terminated.
            </div>
          </div>
        </div>

        <!-- Clause 12 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الثاني عشر: الأعطال المتكررة</div>
            <div class="clause-content">
              إذا تكرّر العطل أكثر من 3 مرات خلال 60 يومًا، يلتزم المزود باستبدال الجهاز.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 12: Repeated Malfunctions</div>
            <div class="clause-content">
              If a device malfunctions more than 3 times within 60 days, the provider must replace it.
            </div>
          </div>
        </div>

        <!-- Clause 13 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الثالث عشر: ملكية الأجهزة</div>
            <div class="clause-content">
              تظل الأجهزة والزيوت ملكًا للمزود طوال مدة العقد.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 13: Device Ownership</div>
            <div class="clause-content">
              Devices and oils remain the property of the provider throughout the contract duration.
            </div>
          </div>
        </div>

        <!-- Clause 14 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الرابع عشر: فسخ العقد</div>
            <div class="clause-content">
              يجوز فسخ العقد بإشعار خطي قبل 30 يومًا، والمبالغ المدفوعة غير مستردة إذا تم الفسخ من طرف العميل دون إخلال من المزود.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 14: Contract Termination</div>
            <div class="clause-content">
              The contract may be terminated by written notice 30 days in advance. Paid amounts are non-refundable if the client terminates without breach by the provider.
            </div>
          </div>
        </div>

        <!-- Clause 15 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الخامس عشر: الضمان</div>
            <div class="clause-content">
              تُغطّى جميع الأجهزة بضمان خلال مدة العقد ضد العيوب المصنعية.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 15: Warranty</div>
            <div class="clause-content">
              All devices are covered by a warranty during the contract period against manufacturing defects.
            </div>
          </div>
        </div>

        <!-- Clause 16 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند السادس عشر: تقييم الخدمة</div>
            <div class="clause-content">
              يُرسل تقييم دوري كل 3 أشهر لتقييم الأداء والجودة وتحسين الخدمة.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 16: Service Evaluation</div>
            <div class="clause-content">
              A periodic evaluation will be sent every 3 months to assess performance and quality.
            </div>
          </div>
        </div>

        <!-- Clause 17 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند السابع عشر: الزيارات الطارئة</div>
            <div class="clause-content">
              في حال طلب العميل زيارة خارج الجدول، تُحسب كزيارة طارئة بتكلفة (${replaceVariables('{{emergency_visit_fee}}', contract)}) ريال، ما لم يكن السبب عطلاً من المزود.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 17: Emergency Visits</div>
            <div class="clause-content">
              If the client requests an unscheduled visit, it will be considered an emergency visit at a cost of (${replaceVariables('{{emergency_visit_fee}}', contract)}) SAR unless caused by a technical fault of the provider.
            </div>
          </div>
        </div>

        <!-- Clause 18 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الثامن عشر: ملحق الخدمة (أ)</div>
            <div class="clause-content">
              يتضمن عدد ونوع الأجهزة وخطة الدفع والعطور وجدول الزيارات، ويُعد جزءًا لا يتجزأ من العقد.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 18: Service Annex (A)</div>
            <div class="clause-content">
              Includes number and type of devices, payment plan, fragrances, and visit schedule. This annex is an integral part of the agreement.
            </div>
          </div>
        </div>

        <!-- Clause 19 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند التاسع عشر: قنوات التواصل الرسمية</div>
            <div class="clause-content">
              البريد الإلكتروني: sales@mana.sa<br>
              واتساب / الهاتف: +966556292500
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 19: Official Communication Channels</div>
            <div class="clause-content">
              Email: sales@mana.sa<br>
              WhatsApp/Phone: +966556292500
            </div>
          </div>
        </div>

        <!-- Clause 20 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند العشرون: الاختصاص القضائي</div>
            <div class="clause-content">
              تخضع هذه الاتفاقية لأنظمة المملكة العربية السعودية وتختص المحكمة التجارية بمقر المزود بالنظر في أي نزاع.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 20: Legal Jurisdiction</div>
            <div class="clause-content">
              This agreement is governed by the laws of the Kingdom of Saudi Arabia. The Commercial Court at the provider's location shall have jurisdiction over any disputes.
            </div>
          </div>
        </div>

        <!-- Clause 21 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الحادي والعشرون: الخدمات الإضافية</div>
            <div class="clause-content">
              يجوز للمزود تقديم خدمات إضافية (مثل تعطير مناطق جديدة أو تخصيص روائح للعلامة التجارية للعميل) برسوم يتم الاتفاق عليها منفصلًا.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 21: Optional Additional Services</div>
            <div class="clause-content">
              The company may offer additional services (e.g., scenting new areas or creating custom fragrances) for fees agreed upon separately.
            </div>
          </div>
        </div>

        <!-- Clause 22 -->
        <div class="two-column">
          <div class="arabic-section">
            <div class="clause-title">البند الثاني والعشرون: اللغة المعتمدة</div>
            <div class="clause-content">
              حررت هذه الاتفاقية باللغتين العربية والإنجليزية، وفي حال الاختلاف في التفسير تُعتمد اللغة العربية.
            </div>
          </div>
          <div class="english-section">
            <div class="clause-title">Clause 22: Language</div>
            <div class="clause-content">
              This Agreement has been drawn up in Arabic and English. In case of interpretation differences, the Arabic language shall prevail.
            </div>
          </div>
        </div>

        <!-- Signatures -->
        <div class="signatures">
          <div class="two-column">
            <div class="arabic-section">
              <div class="signature-box">
                <div class="party-label">الطرف الأول (المزود):</div>
                <div>شركة مانا الذكية للتجارة</div>
                <div>يمثلها: المهندس زياد عبدﷲ الغامدي</div>
                <div>الصفة: المدير التنفيذي</div>
                <div class="signature-line"></div>
                <div class="signature-label">التوقيع والختم</div>
              </div>
            </div>
            <div class="english-section">
              <div class="signature-box">
                <div class="party-label">First Party (Provider):</div>
                <div>Mana Smart Trading Company</div>
                <div>Represented by: Eng. Ziad Abdullah Al Ghamdi</div>
                <div>Designation: Executive Director</div>
                <div class="signature-line"></div>
                <div class="signature-label">Signature & Seal</div>
              </div>
            </div>
          </div>

          <div class="two-column">
            <div class="arabic-section">
              <div class="signature-box">
                <div class="party-label">الطرف الثاني (العميل):</div>
                <div>${replaceVariables('{{client_name}}', contract)}</div>
                <div>يمثله: ${replaceVariables('{{client_representative}}', contract)}</div>
                <div>الصفة: ${replaceVariables('{{client_designation}}', contract)}</div>
                <div class="signature-line"></div>
                <div class="signature-label">التوقيع والختم</div>
              </div>
            </div>
            <div class="english-section">
              <div class="signature-box">
                <div class="party-label">Second Party (Client):</div>
                <div>${replaceVariables('{{client_name}}', contract)}</div>
                <div>Represented by: ${replaceVariables('{{client_representative}}', contract)}</div>
                <div>Designation: ${replaceVariables('{{client_designation}}', contract)}</div>
                <div class="signature-line"></div>
                <div class="signature-label">Signature & Seal</div>
              </div>
            </div>
          </div>
        </div>

        <div style="margin-top: 30px; text-align: center; color: #6b7280; font-size: 9pt; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          طُبع بتاريخ: ${new Date().toLocaleDateString('ar-SA')} | Printed on: ${new Date().toLocaleDateString('en-GB')}
        </div>
      </body>
      </html>
    `;
  };

  return (
    <div className="space-y-6">
      {/* Hidden file input for contract upload */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept=".pdf,.jpg,.jpeg,.png"
        className="hidden"
      />
      
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Contracts - العقود</h2>
          <p className="text-muted-foreground mt-1">Manage service agreements</p>
        </div>
        <div className="flex gap-2">
          <ImportExcelButton section="Contracts" />
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="h-4 w-4" />
            New Contract
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search contracts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="signed">Signed</SelectItem>
                <SelectItem value="attached">Attached</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Contracts Table */}
      <Card>
        <CardHeader>
          <CardTitle>All Contracts</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Contract #</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Contract Date</TableHead>
                  <TableHead>Visit Start</TableHead>
                  <TableHead>Payment Plan</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Suspend/Cancel Date</TableHead>
                  <TableHead className="text-center">Quick Send</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredContracts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="p-0">
                      <div className="flex flex-col items-center justify-center py-12">
                        <FileText className="h-12 w-12 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No contracts found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContracts.map((contract) => (
                  <TableRow key={contract.id}>
                    <TableCell className="font-mono text-sm">{contract.contractNumber}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">{contract.clientName}</div>
                        <div className="text-xs text-muted-foreground">{contract.clientRepresentative}</div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {contract.clientPhone && <div className="text-xs">{contract.clientPhone}</div>}
                        {contract.clientEmail && <div className="text-xs text-muted-foreground">{contract.clientEmail}</div>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">{new Date(contract.contractDate).toLocaleDateString('en-GB')}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {contract.monthlyVisitStartDate 
                          ? new Date(contract.monthlyVisitStartDate).toLocaleDateString('en-GB')
                          : <span className="text-muted-foreground">-</span>
                        }
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {contract.paymentPlan === "monthly" && "Monthly"}
                        {contract.paymentPlan === "semi-annual" && "Semi-Annual (6+1)"}
                        {contract.paymentPlan === "annual" && "Annual (12+2)"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm font-semibold text-green-600">
                        {contract.paymentPlan === "monthly" && `${contract.monthlyAmount.toLocaleString()} ر.س`}
                        {contract.paymentPlan === "semi-annual" && `${contract.semiAnnualAmount.toLocaleString()} ر.س`}
                        {contract.paymentPlan === "annual" && `${contract.annualAmount.toLocaleString()} ر.س`}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[contract.status]}>
                        {contract.status.charAt(0).toUpperCase() + contract.status.slice(1)}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm">
                        {contract.suspendedDate && (
                          <div className="text-yellow-600">
                            Susp: {new Date(contract.suspendedDate).toLocaleDateString('en-GB')}
                          </div>
                        )}
                        {contract.cancelledDate && (
                          <div className="text-red-600">
                            Cancel: {new Date(contract.cancelledDate).toLocaleDateString('en-GB')}
                          </div>
                        )}
                        {!contract.suspendedDate && !contract.cancelledDate && (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleWhatsAppSend(contract)}
                          disabled={!contract.clientPhone}
                          title="Send via WhatsApp"
                        >
                          <MessageSquare className="h-4 w-4 text-green-600" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEmailSend(contract)}
                          disabled={!contract.clientEmail}
                          title="Send via Email"
                        >
                          <Mail className="h-4 w-4 text-blue-600" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuLabel>Contract Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem onClick={() => handleEditContract(contract)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit Contract
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedContract(contract);
                                setIsNotesDialogOpen(true);
                              }}
                            >
                              <StickyNote className="mr-2 h-4 w-4" />
                              View Notes
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedContract(contract);
                                setIsHistoryDialogOpen(true);
                              }}
                            >
                              <History className="mr-2 h-4 w-4 text-blue-600" />
                              View History Log
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem 
                              onClick={() => handleSignContract(contract)}
                              disabled={contract.status !== "draft"}
                            >
                              <CheckCircle className="mr-2 h-4 w-4 text-blue-600" />
                              Mark as Signed
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem 
                              onClick={() => handleAttachContract(contract)}
                              disabled={contract.status !== "signed"}
                            >
                              <Upload className="mr-2 h-4 w-4 text-purple-600" />
                              Attach Signed File
                            </DropdownMenuItem>
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem onClick={() => handlePrintContract(contract)}>
                              <Printer className="mr-2 h-4 w-4" />
                              Print Contract
                            </DropdownMenuItem>
                            
                            {(contract.attachedFileUrl || contract.attachedFileData || contract.attachedFileId) && (
                              <DropdownMenuItem onClick={() => handlePrintAttachedContract(contract)}>
                                <Download className="mr-2 h-4 w-4 text-purple-600" />
                                Print Attached File
                              </DropdownMenuItem>
                            )}
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedContract(contract);
                                setIsSuspendDialogOpen(true);
                              }}
                              disabled={contract.status === "cancelled" || contract.status === "suspended" || contract.status === "draft"}
                            >
                              <PauseCircle className="mr-2 h-4 w-4 text-yellow-600" />
                              Suspend Contract
                            </DropdownMenuItem>
                            
                            <DropdownMenuItem 
                              onClick={() => {
                                setSelectedContract(contract);
                                setIsCancelDialogOpen(true);
                              }}
                              disabled={contract.status === "cancelled"}
                            >
                              <XCircle className="mr-2 h-4 w-4 text-red-600" />
                              Cancel Contract
                            </DropdownMenuItem>
                            
                            {(contract.status === "suspended" || contract.status === "cancelled") && (
                              <DropdownMenuItem onClick={() => handleReactivateContract(contract)}>
                                <PlayCircle className="mr-2 h-4 w-4 text-green-600" />
                                Reactivate Contract
                              </DropdownMenuItem>
                            )}
                            
                            <DropdownMenuSeparator />
                            
                            <DropdownMenuItem 
                              onClick={() => handleDeleteContract(contract)}
                              className="text-red-600"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Contract
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                  </TableRow>
                )))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Contract Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>New Service Agreement</DialogTitle>
            <DialogDescription>Create a new aromatic service contract</DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="contractDate">Contract Date</Label>
                <Input
                  id="contractDate"
                  type="date"
                  value={formData.contractDate}
                  onChange={(e) => setFormData({ ...formData, contractDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="monthlyVisitStartDate">Monthly Visit Start Date</Label>
                <Input
                  id="monthlyVisitStartDate"
                  type="date"
                  value={formData.monthlyVisitStartDate}
                  onChange={(e) => setFormData({ ...formData, monthlyVisitStartDate: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentPlan">Payment Plan</Label>
                <Select
                  value={formData.paymentPlan}
                  onValueChange={(value: "monthly" | "semi-annual" | "annual") =>
                    setFormData({ ...formData, paymentPlan: value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="semi-annual">Semi-Annual (6+1)</SelectItem>
                    <SelectItem value="annual">Annual (12+2)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Client Information</h3>
              
              {/* Customer Selector */}
              <div className="space-y-2">
                <CustomerSelector
                  customers={customers}
                  selectedCustomerId={selectedCustomerId}
                  onCustomerSelect={handleCustomerSelect}
                  onCustomerAdd={handleCustomerAdd}
                  label="Select Customer (or enter manually)"
                  placeholder="Search customer by name, company, or mobile..."
                  required={false}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Client Name</Label>
                  <Input
                    id="clientName"
                    value={formData.clientName}
                    onChange={(e) => setFormData({ ...formData, clientName: e.target.value })}
                    placeholder="Company Name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientCr">CR Number</Label>
                  <Input
                    id="clientCr"
                    value={formData.clientCr}
                    onChange={(e) => setFormData({ ...formData, clientCr: e.target.value })}
                    placeholder="1234567890"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientCity">City</Label>
                  <Input
                    id="clientCity"
                    value={formData.clientCity}
                    onChange={(e) => setFormData({ ...formData, clientCity: e.target.value })}
                    placeholder="Riyadh"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="postalCode">Postal Code</Label>
                  <Input
                    id="postalCode"
                    value={formData.postalCode}
                    onChange={(e) => setFormData({ ...formData, postalCode: e.target.value })}
                    placeholder="12345"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientRepresentative">Representative</Label>
                  <Input
                    id="clientRepresentative"
                    value={formData.clientRepresentative}
                    onChange={(e) => setFormData({ ...formData, clientRepresentative: e.target.value })}
                    placeholder="Ahmed Al-Salem"
                  />
                  {hasRepresentative && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Representative available
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientDesignation">Designation</Label>
                  <Input
                    id="clientDesignation"
                    value={formData.clientDesignation}
                    onChange={(e) => setFormData({ ...formData, clientDesignation: e.target.value })}
                    placeholder="General Manager"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientPhone">Phone Number</Label>
                  <Input
                    id="clientPhone"
                    value={formData.clientPhone}
                    onChange={(e) => setFormData({ ...formData, clientPhone: e.target.value })}
                    placeholder="+966501234567"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Email</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={formData.clientEmail}
                    onChange={(e) => setFormData({ ...formData, clientEmail: e.target.value })}
                    placeholder="info@company.com"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceAddress">Service Address</Label>
                <Textarea
                  id="serviceAddress"
                  value={formData.serviceAddress}
                  onChange={(e) => setFormData({ ...formData, serviceAddress: e.target.value })}
                  placeholder="Full service address"
                  rows={2}
                />
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Pricing - Based on Selected Payment Plan</h3>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm mb-3">
                <p className="text-blue-800">
                  <strong>Note:</strong> Only the pricing input for your selected payment plan is enabled. Fill in the amount for the selected plan above.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="monthlyAmount" className={formData.paymentPlan === 'monthly' ? 'text-green-600 font-semibold' : ''}>
                    Monthly Amount (SAR) {formData.paymentPlan === 'monthly' && '✓'}
                  </Label>
                  <Input
                    id="monthlyAmount"
                    type="number"
                    value={formData.monthlyAmount}
                    onChange={(e) => setFormData({ ...formData, monthlyAmount: e.target.value })}
                    placeholder="2000"
                    className={formData.paymentPlan === 'monthly' ? 'border-green-500' : ''}
                    disabled={formData.paymentPlan !== 'monthly'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="semiAnnualAmount" className={formData.paymentPlan === 'semi-annual' ? 'text-green-600 font-semibold' : ''}>
                    Semi-Annual (6+1) (SAR) {formData.paymentPlan === 'semi-annual' && '✓'}
                  </Label>
                  <Input
                    id="semiAnnualAmount"
                    type="number"
                    value={formData.semiAnnualAmount}
                    onChange={(e) => setFormData({ ...formData, semiAnnualAmount: e.target.value })}
                    placeholder="12000"
                    className={formData.paymentPlan === 'semi-annual' ? 'border-green-500' : ''}
                    disabled={formData.paymentPlan !== 'semi-annual'}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="annualAmount" className={formData.paymentPlan === 'annual' ? 'text-green-600 font-semibold' : ''}>
                    Annual (12+2) (SAR) {formData.paymentPlan === 'annual' && '✓'}
                  </Label>
                  <Input
                    id="annualAmount"
                    type="number"
                    value={formData.annualAmount}
                    onChange={(e) => setFormData({ ...formData, annualAmount: e.target.value })}
                    placeholder="24000"
                    className={formData.paymentPlan === 'annual' ? 'border-green-500' : ''}
                    disabled={formData.paymentPlan !== 'annual'}
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold">Devices</h3>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="devicesCount">Number of Devices</Label>
                  <Input
                    id="devicesCount"
                    value={formData.devicesCount}
                    onChange={(e) => setFormData({ ...formData, devicesCount: e.target.value })}
                    placeholder="5"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="deviceTypes">Device Types</Label>
                  <Input
                    id="deviceTypes"
                    value={formData.deviceTypes}
                    onChange={(e) => setFormData({ ...formData, deviceTypes: e.target.value })}
                    placeholder="Pro: 2, Ultra: 3"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="notes">Contract Notes</Label>
              <Textarea
                id="notes"
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Add any notes about this contract..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddContract} className="bg-purple-600 hover:bg-purple-700 text-white">Create Contract</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Contract Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Contract Details</DialogTitle>
            <DialogDescription>View contract information and print</DialogDescription>
          </DialogHeader>
          {selectedContract && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">Contract #:</span>
                  <p className="font-medium">{selectedContract.contractNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Client:</span>
                  <p className="font-medium">{selectedContract.clientName}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Date:</span>
                  <p className="font-medium">{new Date(selectedContract.contractDate).toLocaleDateString('en-GB')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Payment Plan:</span>
                  <p className="font-medium capitalize">{selectedContract.paymentPlan.replace('-', ' ')}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Devices:</span>
                  <p className="font-medium">{selectedContract.devicesCount}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status:</span>
                  <Badge className={statusColors[selectedContract.status]}>
                    {selectedContract.status}
                  </Badge>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => handlePrintContract(selectedContract)} className="gap-2">
                  <Printer className="h-4 w-4" />
                  Print Contract
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Suspend Contract Dialog */}
      <Dialog open={isSuspendDialogOpen} onOpenChange={setIsSuspendDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Suspend Contract</DialogTitle>
            <DialogDescription>
              Please provide a reason for suspending this contract
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="suspensionReason">Suspension Reason</Label>
              <Textarea
                id="suspensionReason"
                value={suspensionReason}
                onChange={(e) => setSuspensionReason(e.target.value)}
                placeholder="Enter reason for suspension..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsSuspendDialogOpen(false);
                  setSuspensionReason("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleSuspendContract} variant="destructive">
                Suspend Contract
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Cancel Contract Dialog */}
      <Dialog open={isCancelDialogOpen} onOpenChange={setIsCancelDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel Contract</DialogTitle>
            <DialogDescription>
              Please provide a reason for cancelling this contract. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="cancellationReason">Cancellation Reason</Label>
              <Textarea
                id="cancellationReason"
                value={cancellationReason}
                onChange={(e) => setCancellationReason(e.target.value)}
                placeholder="Enter reason for cancellation..."
                rows={4}
              />
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsCancelDialogOpen(false);
                  setCancellationReason("");
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleCancelContract} variant="destructive">
                Cancel Contract
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Contract Dialog */}
      {editingContract && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Contract</DialogTitle>
              <DialogDescription>Update contract information</DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-contractDate">Contract Date</Label>
                  <Input
                    id="edit-contractDate"
                    type="date"
                    value={editingContract.contractDate}
                    onChange={(e) => setEditingContract({ ...editingContract, contractDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-monthlyVisitStartDate">Monthly Visit Start Date</Label>
                  <Input
                    id="edit-monthlyVisitStartDate"
                    type="date"
                    value={editingContract.monthlyVisitStartDate || ""}
                    onChange={(e) => setEditingContract({ ...editingContract, monthlyVisitStartDate: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-paymentPlan">Payment Plan</Label>
                  <Select
                    value={editingContract.paymentPlan}
                    onValueChange={(value: "monthly" | "semi-annual" | "annual") =>
                      setEditingContract({ ...editingContract, paymentPlan: value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="semi-annual">Semi-Annual (6+1)</SelectItem>
                      <SelectItem value="annual">Annual (12+2)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Client Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-clientName">Client Name</Label>
                    <Input
                      id="edit-clientName"
                      value={editingContract.clientName}
                      onChange={(e) => setEditingContract({ ...editingContract, clientName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-clientCr">CR Number</Label>
                    <Input
                      id="edit-clientCr"
                      value={editingContract.clientCr}
                      onChange={(e) => setEditingContract({ ...editingContract, clientCr: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-clientCity">City</Label>
                    <Input
                      id="edit-clientCity"
                      value={editingContract.clientCity}
                      onChange={(e) => setEditingContract({ ...editingContract, clientCity: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-postalCode">Postal Code</Label>
                    <Input
                      id="edit-postalCode"
                      value={editingContract.postalCode}
                      onChange={(e) => setEditingContract({ ...editingContract, postalCode: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-clientPhone">Phone Number</Label>
                    <Input
                      id="edit-clientPhone"
                      value={editingContract.clientPhone || ""}
                      onChange={(e) => setEditingContract({ ...editingContract, clientPhone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-clientEmail">Email</Label>
                    <Input
                      id="edit-clientEmail"
                      type="email"
                      value={editingContract.clientEmail || ""}
                      onChange={(e) => setEditingContract({ ...editingContract, clientEmail: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Service Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-devicesCount">Number of Devices</Label>
                    <Input
                      id="edit-devicesCount"
                      value={editingContract.devicesCount}
                      onChange={(e) => setEditingContract({ ...editingContract, devicesCount: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-deviceTypes">Device Types</Label>
                    <Input
                      id="edit-deviceTypes"
                      value={editingContract.deviceTypes}
                      onChange={(e) => setEditingContract({ ...editingContract, deviceTypes: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold">Pricing - Based on Selected Payment Plan</h3>
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md text-sm mb-3">
                  <p className="text-blue-800">
                    <strong>Note:</strong> Only the pricing input for your selected payment plan is enabled. Fill in the amount for the selected plan above.
                  </p>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-monthlyAmount" className={editingContract.paymentPlan === 'monthly' ? 'text-green-600 font-semibold' : ''}>
                      Monthly Amount (SAR) {editingContract.paymentPlan === 'monthly' && '✓'}
                    </Label>
                    <Input
                      id="edit-monthlyAmount"
                      type="number"
                      value={editingContract.monthlyAmount}
                      onChange={(e) => setEditingContract({ ...editingContract, monthlyAmount: parseFloat(e.target.value) })}
                      className={editingContract.paymentPlan === 'monthly' ? 'border-green-500' : ''}
                      disabled={editingContract.paymentPlan !== 'monthly'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-semiAnnualAmount" className={editingContract.paymentPlan === 'semi-annual' ? 'text-green-600 font-semibold' : ''}>
                      Semi-Annual (6+1) (SAR) {editingContract.paymentPlan === 'semi-annual' && '✓'}
                    </Label>
                    <Input
                      id="edit-semiAnnualAmount"
                      type="number"
                      value={editingContract.semiAnnualAmount}
                      onChange={(e) => setEditingContract({ ...editingContract, semiAnnualAmount: parseFloat(e.target.value) })}
                      className={editingContract.paymentPlan === 'semi-annual' ? 'border-green-500' : ''}
                      disabled={editingContract.paymentPlan !== 'semi-annual'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-annualAmount" className={editingContract.paymentPlan === 'annual' ? 'text-green-600 font-semibold' : ''}>
                      Annual (12+2) (SAR) {editingContract.paymentPlan === 'annual' && '✓'}
                    </Label>
                    <Input
                      id="edit-annualAmount"
                      type="number"
                      value={editingContract.annualAmount}
                      onChange={(e) => setEditingContract({ ...editingContract, annualAmount: parseFloat(e.target.value) })}
                      className={editingContract.paymentPlan === 'annual' ? 'border-green-500' : ''}
                      disabled={editingContract.paymentPlan !== 'annual'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-emergencyVisitFee">Emergency Visit Fee (SAR)</Label>
                    <Input
                      id="edit-emergencyVisitFee"
                      type="number"
                      value={editingContract.emergencyVisitFee}
                      onChange={(e) => setEditingContract({ ...editingContract, emergencyVisitFee: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-notes">Contract Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editingContract.notes || ""}
                  onChange={(e) => setEditingContract({ ...editingContract, notes: e.target.value })}
                  placeholder="Add any notes about this contract..."
                  rows={4}
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSaveEdit}>
                  Save Changes
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* View Notes Dialog */}
      {selectedContract && (
        <Dialog open={isNotesDialogOpen} onOpenChange={setIsNotesDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Contract Notes & Details</DialogTitle>
              <DialogDescription>
                Contract #{selectedContract.contractNumber} - {selectedContract.clientName}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              {/* General Notes */}
              <div className="space-y-2">
                <Label className="text-base font-semibold">General Notes</Label>
                <div className="p-4 bg-muted rounded-lg">
                  {selectedContract.notes ? (
                    <p className="text-sm whitespace-pre-wrap">{selectedContract.notes}</p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">No notes added</p>
                  )}
                </div>
              </div>

              {/* Suspension Details */}
              {selectedContract.suspendedDate && (
                <div className="space-y-2">
                  <Label className="text-base font-semibold text-yellow-600">Suspension Details</Label>
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium">Suspended Date:</span>{" "}
                        <span>{new Date(selectedContract.suspendedDate).toLocaleDateString('en-GB')}</span>
                      </div>
                      <div>
                        <span className="font-medium">Reason:</span>
                        <p className="mt-1 text-sm whitespace-pre-wrap">
                          {selectedContract.suspensionReason || "No reason provided"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cancellation Details */}
              {selectedContract.cancelledDate && (
                <div className="space-y-2">
                  <Label className="text-base font-semibold text-red-600">Cancellation Details</Label>
                  <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                    <div className="space-y-2">
                      <div>
                        <span className="font-medium">Cancelled Date:</span>{" "}
                        <span>{new Date(selectedContract.cancelledDate).toLocaleDateString('en-GB')}</span>
                      </div>
                      <div>
                        <span className="font-medium">Reason:</span>
                        <p className="mt-1 text-sm whitespace-pre-wrap">
                          {selectedContract.cancellationReason || "No reason provided"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Reactivation Info */}
              {selectedContract.reactivatedDate && (
                <div className="space-y-2">
                  <Label className="text-base font-semibold text-green-600">Reactivation Info</Label>
                  <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                    <span className="font-medium">Reactivated Date:</span>{" "}
                    <span>{new Date(selectedContract.reactivatedDate).toLocaleDateString('en-GB')}</span>
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button onClick={() => setIsNotesDialogOpen(false)}>
                  Close
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* History Log Dialog */}
      {selectedContract && (
        <Dialog open={isHistoryDialogOpen} onOpenChange={setIsHistoryDialogOpen}>
          <DialogContent className="max-w-3xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <History className="h-5 w-5" />
                Contract History Log
              </DialogTitle>
              <DialogDescription>
                Contract #{selectedContract.contractNumber} - {selectedContract.clientName}
              </DialogDescription>
            </DialogHeader>

            <ScrollArea className="h-[600px] pr-4">
              {selectedContract.historyLog && selectedContract.historyLog.length > 0 ? (
                <div className="space-y-4">
                  {/* Timeline */}
                  <div className="relative">
                    {selectedContract.historyLog
                      .slice()
                      .reverse()
                      .map((log, index) => {
                        const date = new Date(log.timestamp);
                        const actionColors: Record<string, string> = {
                          'Created': 'bg-blue-500',
                          'Edited': 'bg-purple-500',
                          'Sent': 'bg-green-500',
                          'Signed': 'bg-teal-500',
                          'Attached': 'bg-indigo-500',
                          'Suspended': 'bg-yellow-500',
                          'Cancelled': 'bg-red-500',
                          'Reactivated': 'bg-green-600'
                        };

                        return (
                          <div key={log.id} className="relative pb-8">
                            {/* Timeline line */}
                            {index !== selectedContract.historyLog!.length - 1 && (
                              <div className="absolute left-4 top-8 bottom-0 w-0.5 bg-border" />
                            )}
                            
                            {/* Timeline dot */}
                            <div className="flex gap-4">
                              <div className={`relative z-10 flex h-8 w-8 items-center justify-center rounded-full ${actionColors[log.action] || 'bg-gray-500'} text-white flex-shrink-0`}>
                                {log.action === 'Created' && <Plus className="h-4 w-4" />}
                                {log.action === 'Edited' && <Edit className="h-4 w-4" />}
                                {log.action === 'Sent' && <Send className="h-4 w-4" />}
                                {log.action === 'Signed' && <CheckCircle className="h-4 w-4" />}
                                {log.action === 'Attached' && <Upload className="h-4 w-4" />}
                                {log.action === 'Suspended' && <PauseCircle className="h-4 w-4" />}
                                {log.action === 'Cancelled' && <XCircle className="h-4 w-4" />}
                                {log.action === 'Reactivated' && <PlayCircle className="h-4 w-4" />}
                              </div>

                              {/* Content */}
                              <div className="flex-1 bg-muted rounded-lg p-4">
                                <div className="flex items-start justify-between gap-4 mb-2">
                                  <div>
                                    <h4 className="font-semibold text-base">{log.action}</h4>
                                    <p className="text-sm text-muted-foreground">{log.description}</p>
                                  </div>
                                  <Badge variant="outline" className="flex-shrink-0">
                                    {log.action}
                                  </Badge>
                                </div>

                                {log.details && (
                                  <div className="mt-2 p-3 bg-background rounded border text-sm">
                                    <p className="text-muted-foreground">{log.details}</p>
                                  </div>
                                )}

                                <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                                  <div className="flex items-center gap-1">
                                    <User className="h-3 w-3" />
                                    <span>{log.user}</span>
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span>{date.toLocaleDateString('en-GB')} at {date.toLocaleTimeString()}</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <History className="h-12 w-12 text-muted-foreground mb-4" />
                  <h3 className="font-semibold mb-2">No History Available</h3>
                  <p className="text-sm text-muted-foreground">
                    This contract doesn't have any history logs yet.
                  </p>
                </div>
              )}
            </ScrollArea>

            <div className="flex justify-end pt-4 border-t">
              <Button onClick={() => setIsHistoryDialogOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Sign Contract Confirmation Dialog */}
      <Dialog open={isSignConfirmOpen} onOpenChange={setIsSignConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Mark as Signed</DialogTitle>
            <DialogDescription>
              Are you sure you want to mark this contract as signed? This will change the status from Draft to Signed.
            </DialogDescription>
          </DialogHeader>
          {contractToSign && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">Contract: {contractToSign.contractNumber}</p>
                <p className="text-sm text-muted-foreground">Client: {contractToSign.clientName}</p>
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsSignConfirmOpen(false);
                    setContractToSign(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={confirmSignContract} className="bg-purple-600 hover:bg-purple-700 text-white">
                  Confirm & Mark as Signed
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Attach File Confirmation Dialog */}
      <Dialog open={isAttachConfirmOpen} onOpenChange={setIsAttachConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Attach Signed File</DialogTitle>
            <DialogDescription>
              Attaching a signed file will change the contract status from Signed to Active and automatically generate monthly visit schedules.
            </DialogDescription>
          </DialogHeader>
          {contractToAttach && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-md">
                <p className="text-sm font-medium">Contract: {contractToAttach.contractNumber}</p>
                <p className="text-sm text-muted-foreground">Client: {contractToAttach.clientName}</p>
                <p className="text-xs text-muted-foreground mt-2">
                  After attaching, the contract will become Active and monthly visits will be scheduled starting from {contractToAttach.monthlyVisitStartDate || 'the activation date'}.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsAttachConfirmOpen(false);
                    setContractToAttach(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={confirmAttachContract} className="bg-purple-600 hover:bg-purple-700 text-white">
                  Continue to Upload
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
