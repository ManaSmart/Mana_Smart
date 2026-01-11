import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Trash2, FileText, Download, Upload, User, Calendar, DollarSign, Shield, Phone, Mail, MapPin, Briefcase, Eye, File, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea } from "./ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Employees as DbEmployee } from "../../supabase/models/employees";
import { uploadFile, getFileUrl, deleteFile, getFilesByOwner, deleteFilesByOwner } from "../lib/storage";
import type { FileMetadata } from "../../supabase/models/file_metadata";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";
import { supabase } from "../lib/supabaseClient";
import type { SystemUsers } from "../../supabase/models/system_users";
import type { Roles } from "../../supabase/models/roles";
import { normalizePermissions } from "../lib/permissions";

interface EmployeeDocument {
  id: string; // FileMetadata ID
  name: string;
  category: "contract" | "id" | "photo" | "certificate" | "other";
  fileUrl?: string; // URL to access the file
  fileType?: string;
  uploadDate: string;
  notes?: string;
  fileMetadata: FileMetadata; // Full metadata for reference
}

interface Employee {
  id: string;
  employeeId: string;
  displayCode: string;
  name: string;
  nameAr: string;
  position: string;
  department: string;
  email: string;
  phone: string;
  nationalId: string;
  hireDate: string | null;
  startDate: string | null;
  salary: number;
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowances: number;
  socialInsurance: string;
  socialInsuranceAmount: number;
  bankAccount: string;
  bankName: string;
  status: "active" | "on-leave" | "terminated";
  contractType: "full-time" | "part-time" | "contract";
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  photo?: string;
  documents: EmployeeDocument[];
}

const statusColors = {
  active: "bg-green-100 text-green-700 border-green-200",
  "on-leave": "bg-yellow-100 text-yellow-700 border-yellow-200",
  terminated: "bg-red-100 text-red-700 border-red-200",
};

const documentCategoryColors = {
  contract: "bg-blue-100 text-blue-700 border-blue-200",
  id: "bg-purple-100 text-purple-700 border-purple-200",
  photo: "bg-green-100 text-green-700 border-green-200",
  certificate: "bg-orange-100 text-orange-700 border-orange-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

export function Employees() {
  const dispatch = useAppDispatch();
  const dbEmployees = useAppSelector(selectors.employees.selectAll) as DbEmployee[];
  const employeesLoading = useAppSelector(selectors.employees.selectLoading);
  const dbSystemUsers = useAppSelector(selectors.system_users.selectAll) as SystemUsers[];
  const dbRoles = useAppSelector(selectors.roles.selectAll) as Roles[];

  const [documentsByEmployee, setDocumentsByEmployee] = useState<Record<string, EmployeeDocument[]>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [viewDocument, setViewDocument] = useState<EmployeeDocument | null>(null);
  const [isViewDocumentOpen, setIsViewDocumentOpen] = useState(false);
  const [uploadingDocument, setUploadingDocument] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);

  // Form states
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [position, setPosition] = useState("");
  const [department, setDepartment] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [hireDate, setHireDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [baseSalary, setBaseSalary] = useState("");
  const [housingAllowance, setHousingAllowance] = useState("");
  const [transportAllowance, setTransportAllowance] = useState("");
  const [otherAllowances, setOtherAllowances] = useState("");
  const [socialInsurance, setSocialInsurance] = useState("");
  const [socialInsuranceAmount, setSocialInsuranceAmount] = useState("");
  const [bankAccount, setBankAccount] = useState("");
  const [bankName, setBankName] = useState("");
  const [contractType, setContractType] = useState<"full-time" | "part-time" | "contract">("full-time");
  const [address, setAddress] = useState("");
  const [emergencyContact, setEmergencyContact] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [employeePhoto, setEmployeePhoto] = useState("");

  // Document upload states
  const [documentName, setDocumentName] = useState("");
  const [documentCategory, setDocumentCategory] = useState<"contract" | "id" | "photo" | "certificate" | "other">("contract");
  const [documentFileType, setDocumentFileType] = useState("");
  const [documentNotes, setDocumentNotes] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dispatch(thunks.employees.fetchAll(undefined));
    dispatch(thunks.system_users.fetchAll(undefined));
    dispatch(thunks.roles.fetchAll(undefined));
  }, [dispatch]);

  // Get admin employee IDs (employees linked to system users with admin roles)
  const adminEmployeeIds = useMemo(() => {
    const roleById = new Map(dbRoles.map(role => [role.role_id, role]));
    const adminIds = new Set<string>();
    
    dbSystemUsers.forEach(user => {
      if (user.employee_id && user.role_id) {
        const role = roleById.get(user.role_id);
        if (role) {
          const permissions = normalizePermissions(role.permissions);
          if (permissions === "all") {
            adminIds.add(user.employee_id);
          }
        }
      }
    });
    
    return adminIds;
  }, [dbSystemUsers, dbRoles]);

  // Function to load documents for a specific employee
  const loadEmployeeDocuments = async (employeeId: string) => {
    try {
      console.log('Loading documents for employee:', employeeId);
      const files = await getFilesByOwner(employeeId, 'employee', FILE_CATEGORIES.EMPLOYEE_DOCUMENT);
      console.log(`Found ${files.length} documents for employee ${employeeId}`);
      
      const documents: EmployeeDocument[] = await Promise.all(
        files.map(async (fileMeta) => {
          const fileUrl = await getFileUrl(
            fileMeta.bucket as any,
            fileMeta.path,
            fileMeta.is_public
          );
          
          // Map category from file metadata to display category
          const categoryMap: Record<string, "contract" | "id" | "photo" | "certificate" | "other"> = {
            contract: "contract",
            id: "id",
            photo: "photo",
            certificate: "certificate",
          };
          
          const category = (fileMeta.metadata?.category as string) || "other";
          const displayCategory = categoryMap[category] || "other";
          
          return {
            id: fileMeta.id,
            name: fileMeta.file_name,
            category: displayCategory,
            fileUrl: fileUrl || undefined,
            fileType: fileMeta.mime_type,
            uploadDate: fileMeta.created_at || new Date().toISOString(),
            notes: fileMeta.description || fileMeta.metadata?.notes as string || undefined,
            fileMetadata: fileMeta,
          };
        })
      );
      
      setDocumentsByEmployee((prev) => ({
        ...prev,
        [employeeId]: documents,
      }));
      
      return documents;
    } catch (error) {
      console.error(`Error loading documents for employee ${employeeId}:`, error);
      return [];
    }
  };

  // Load documents for all employees when component mounts or employees change
  useEffect(() => {
    const loadAllDocuments = async () => {
      for (const emp of dbEmployees) {
        await loadEmployeeDocuments(emp.employee_id);
      }
    };
    
    if (dbEmployees.length > 0) {
      loadAllDocuments();
    }
  }, [dbEmployees]);

  // Reload documents when an employee is selected
  useEffect(() => {
    if (selectedEmployeeId) {
      loadEmployeeDocuments(selectedEmployeeId);
    }
  }, [selectedEmployeeId]);

  const employees = useMemo<Employee[]>(() => {
    // Filter out admin employees
    return dbEmployees
      .filter((emp) => !adminEmployeeIds.has(emp.employee_id))
      .map((emp) => {
      const baseSalary = Number(emp.base_salary ?? 0);
      const housingAllowance = Number(emp.housing_allowance ?? 0);
      const transportAllowance = Number(emp.transport_allowance ?? 0);
      const otherAllowances = Number(emp.other_allowances ?? 0);
      const salary = baseSalary + housingAllowance + transportAllowance + otherAllowances;

      const contractTypeRaw = (emp.contract_type ?? "contract").toLowerCase();
      const contractType: Employee["contractType"] =
        contractTypeRaw === "full-time" || contractTypeRaw === "part-time" || contractTypeRaw === "contract"
          ? (contractTypeRaw as Employee["contractType"])
          : "contract";

      const docs = documentsByEmployee[emp.employee_id] ?? [];

      return {
        id: emp.employee_id,
        employeeId: emp.employee_id,
        displayCode: emp.employee_id.slice(0, 8).toUpperCase(),
        name: emp.name_en ?? "Unnamed Employee",
        nameAr: emp.name_ar ?? "",
        position: emp.position ?? "",
        department: emp.department ?? "General",
        email: emp.email ?? "",
        phone: emp.phone_number ?? "",
        nationalId: emp.national_id ?? "",
        hireDate: emp.hiring_date ?? null,
        startDate: emp.job_start_date ?? null,
        salary,
        baseSalary,
        housingAllowance,
        transportAllowance,
        otherAllowances,
        socialInsurance: emp.social_insurance_number ?? "",
        socialInsuranceAmount: Number(emp.social_insurance_amount ?? 0),
        bankAccount: emp.bank_iban ?? "",
        bankName: emp.bank_name ?? "",
        status: (emp.status as "active" | "on-leave" | "terminated") || "active",
        contractType,
        address: emp.address ?? "",
        emergencyContact: emp.emergency_contact_name ?? "",
        emergencyPhone: emp.emergency_contact_phone ?? "",
        photo: emp.profile_image ?? undefined,
        documents: docs,
      };
    });
  }, [dbEmployees, documentsByEmployee, adminEmployeeIds]);

  const selectedEmployee = useMemo(
    () => employees.find((emp) => emp.id === selectedEmployeeId) ?? null,
    [employees, selectedEmployeeId]
  );

  const filteredEmployees = useMemo(
    () =>
      employees.filter((emp) => {
        const query = searchQuery.toLowerCase();
        return (
          emp.name.toLowerCase().includes(query) ||
          emp.displayCode.toLowerCase().includes(query) ||
          emp.department.toLowerCase().includes(query) ||
          emp.position.toLowerCase().includes(query)
        );
      }),
    [employees, searchQuery]
  );

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // If we have an employee ID, upload to storage immediately
    if (selectedEmployeeId) {
      setUploadingPhoto(true);
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

        // Upload to storage
        const result = await uploadFile({
          file,
          category: FILE_CATEGORIES.EMPLOYEE_PICTURE,
          ownerId: selectedEmployeeId,
          ownerType: 'employee',
          description: 'Employee photo',
          userId: currentUserId || undefined,
        });

        if (!result.success || !result.fileMetadata) {
          throw new Error(result.error || 'Failed to upload employee photo');
        }

        // Get file URL
        const photoUrl = result.publicUrl || (await getFileUrl(
          result.fileMetadata.bucket as any,
          result.fileMetadata.path,
          result.fileMetadata.is_public
        ));

        if (photoUrl) {
          setEmployeePhoto(photoUrl);
          toast.success("Photo uploaded successfully");
        } else {
          throw new Error('Failed to get photo URL');
        }
      } catch (error: any) {
        console.error('Error uploading employee photo:', error);
        toast.error(error.message || 'Failed to upload employee photo');
      } finally {
        setUploadingPhoto(false);
        if (e.target) {
          e.target.value = '';
        }
      }
    } else {
      // For new employee form, just show preview (base64)
      // Will be stored in employee record and can be uploaded later
      const reader = new FileReader();
      reader.onloadend = () => {
        setEmployeePhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDocumentFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setDocumentFile(file);
      setDocumentFileType(file.type);
      if (!documentName) {
        setDocumentName(file.name);
      }
      toast.success("File selected");
    }
  };

  const handleAddDocument = async () => {
    if (!selectedEmployeeId) {
      toast.error("Please select an employee first");
      return;
    }
    
    if (!documentName || !documentFile) {
      toast.error("Please provide document name and upload a file");
      return;
    }

    setUploadingDocument(true);
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

      // Map display category to metadata
      const categoryMetadata = {
        contract: "contract",
        id: "id",
        photo: "photo",
        certificate: "certificate",
        other: "other",
      };

      // Upload to storage
      const result = await uploadFile({
        file: documentFile,
        category: FILE_CATEGORIES.EMPLOYEE_DOCUMENT,
        ownerId: selectedEmployeeId,
        ownerType: 'employee',
        description: documentNotes || documentName,
        userId: currentUserId || undefined,
        metadata: {
          category: categoryMetadata[documentCategory],
          notes: documentNotes || undefined,
        },
      });

      if (!result.success || !result.fileMetadata) {
        throw new Error(result.error || 'Failed to upload document');
      }

      console.log('Document uploaded successfully:', result.fileMetadata.id);

      // Reload documents from database to ensure we have the latest
      await loadEmployeeDocuments(selectedEmployeeId);

      setIsUploadDialogOpen(false);
      resetDocumentForm();
      toast.success("Document uploaded successfully!");
    } catch (error: any) {
      console.error('Error uploading document:', error);
      toast.error(error.message || 'Failed to upload document');
    } finally {
      setUploadingDocument(false);
    }
  };

  const resetDocumentForm = () => {
    setDocumentName("");
    setDocumentCategory("contract");
    setDocumentFile(null);
    setDocumentFileType("");
    setDocumentNotes("");
  };

  const handleDownloadDocument = async (doc: EmployeeDocument) => {
    if (!doc.fileUrl) {
      // Try to get URL from metadata if not already loaded
      if (doc.fileMetadata) {
        const url = await getFileUrl(
          doc.fileMetadata.bucket as any,
          doc.fileMetadata.path,
          doc.fileMetadata.is_public
        );
        if (url) {
          const link = document.createElement('a');
          link.href = url;
          link.download = doc.name;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          toast.success("Document downloaded");
          return;
        }
      }
      toast.error("No file URL available");
      return;
    }

    const link = document.createElement('a');
    link.href = doc.fileUrl;
    link.download = doc.name;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Document downloaded");
  };

  const handleDeleteDocument = async (docId: string) => {
    if (!selectedEmployeeId) return;

    try {
      // Delete from storage
      const deleted = await deleteFile(docId);
      
      if (deleted) {
        // Remove from local state
        setDocumentsByEmployee((prev) => ({
          ...prev,
          [selectedEmployeeId]: (prev[selectedEmployeeId] ?? []).filter((d) => d.id !== docId),
        }));
        toast.success("Document deleted successfully");
      } else {
        toast.error("Failed to delete document");
      }
    } catch (error: any) {
      console.error('Error deleting document:', error);
      toast.error(error.message || 'Failed to delete document');
    }
  };

  const handleAddEmployee = async () => {
    if (!name || !position || !department || !baseSalary) {
      toast.error("Please fill all required fields");
      return;
    }


    const payload = {
      profile_image: employeePhoto || null,
      name_en: name,
      name_ar: nameAr || null,
      email: email || null,
      phone_number: phone || null,
      national_id: nationalId || null,
      address: address || null,
      position: position || null,
      department: department || null,
      contract_type: contractType,
      hiring_date: hireDate || null,
      job_start_date: startDate || null,
      base_salary: baseSalary ? parseFloat(baseSalary) : null,
      housing_allowance: housingAllowance ? parseFloat(housingAllowance) : null,
      transport_allowance: transportAllowance ? parseFloat(transportAllowance) : null,
      other_allowances: otherAllowances ? parseFloat(otherAllowances) : null,
      social_insurance_number: socialInsurance || null,
      social_insurance_amount: socialInsuranceAmount ? parseFloat(socialInsuranceAmount) : null,
      bank_name: bankName || null,
      bank_iban: bankAccount || null,
      emergency_contact_name: emergencyContact || null,
      emergency_contact_phone: emergencyPhone || null,
      status: "active" as const,
    };

    try {
      const created = await dispatch(thunks.employees.createOne(payload)).unwrap();
      
      // Initialize documents array for new employee
      setDocumentsByEmployee((prev) => ({
        ...prev,
        [created.employee_id]: [],
      }));
      
      // Reload employees to ensure new employee is in the list
      await dispatch(thunks.employees.fetchAll(undefined));
      
      toast.success("Employee added successfully!");
      setIsAddDialogOpen(false);
      resetForm();
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to add employee";
      toast.error(message);
    }
  };

  const resetForm = () => {
    setName("");
    setNameAr("");
    setPosition("");
    setDepartment("");
    setEmail("");
    setPhone("");
    setNationalId("");
    setHireDate("");
    setStartDate("");
    setBaseSalary("");
    setHousingAllowance("");
    setTransportAllowance("");
    setOtherAllowances("");
    setSocialInsurance("");
    setSocialInsuranceAmount("");
    setBankAccount("");
    setBankName("");
    setContractType("full-time");
    setAddress("");
    setEmergencyContact("");
    setEmergencyPhone("");
    setEmployeePhoto("");
  };

  const updateEmployeeStatus = async (employeeId: string, newStatus: "active" | "on-leave" | "terminated") => {
    try {
      await dispatch(
        thunks.employees.updateOne({
          id: employeeId,
          values: { status: newStatus },
        })
      ).unwrap();
      
      // Reload employees to get updated status
      await dispatch(thunks.employees.fetchAll(undefined));
      
      const statusMessages: Record<"active" | "on-leave" | "terminated", string> = {
        active: "Employee activated successfully!",
        "on-leave": "Employee status changed to on-leave",
        terminated: "Employee terminated successfully!",
      };
      
      toast.success(statusMessages[newStatus]);
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to update employee status";
      toast.error(message);
    }
  };

  const handleDeleteClick = (employee: Employee) => {
    setEmployeeToDelete(employee);
    setIsDeleteDialogOpen(true);
  };

  const deleteEmployee = async () => {
    if (!employeeToDelete) return;
    
    const id = employeeToDelete.id;
    
    try {
      // First, delete all related records
      // Delete employee attendance records
      const { error: attendanceError } = await supabase
        .from("employee_attendance")
        .delete()
        .eq("employee_id", id);
      
      if (attendanceError) {
        console.error("Error deleting employee attendance:", attendanceError);
        // Continue anyway, might not have attendance records
      }

      // Delete employee requests
      const { error: requestsError } = await supabase
        .from("employee_requests")
        .delete()
        .eq("employee_id", id);
      
      if (requestsError) {
        console.error("Error deleting employee requests:", requestsError);
        // Continue anyway
      }

      // Delete employee custody items
      const { error: custodyError } = await supabase
        .from("employee_custody_items")
        .delete()
        .eq("employee_id", id);
      
      if (custodyError) {
        console.error("Error deleting employee custody items:", custodyError);
        // Continue anyway
      }

      // Delete employee files (documents and photos)
      const { deleted: filesDeleted, errors: fileErrors } = await deleteFilesByOwner(id, 'employee');
      
      if (fileErrors.length > 0) {
        console.warn('Some employee files could not be deleted:', fileErrors);
      }
      
      if (filesDeleted > 0) {
        console.log(`Deleted ${filesDeleted} employee files`);
      }

      // Delete expenses linked to this employee (if any)
      const { error: expensesError } = await supabase
        .from("expenses_management")
        .delete()
        .eq("employee_id", id);
      
      if (expensesError) {
        console.error("Error deleting employee expenses:", expensesError);
        // Continue anyway
      }

      // Delete leaves linked to this employee (if any)
      const { error: leavesError } = await supabase
        .from("leaves")
        .delete()
        .eq("employee_id", id);
      
      if (leavesError) {
        console.error("Error deleting employee leaves:", leavesError);
        // Continue anyway
      }

      // Update system_users to remove employee_id reference (set to null)
      const { error: usersError } = await supabase
        .from("system_users")
        .update({ employee_id: null })
        .eq("employee_id", id);
      
      if (usersError) {
        console.error("Error updating system users:", usersError);
        // Continue anyway
      }

      // Now delete the employee
      await dispatch(thunks.employees.deleteOne(id)).unwrap();
      
      setDocumentsByEmployee((prev) => {
        if (!(id in prev)) return prev;
        const updated = { ...prev };
        delete updated[id];
        return updated;
      });
      
      toast.success("Employee deleted successfully!");
      setIsDeleteDialogOpen(false);
      setEmployeeToDelete(null);
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to delete employee";
      toast.error(message);
      console.error("Error deleting employee:", error);
    }
  };

  const totalSalaries = employees
    .filter(emp => emp.status === "active")
    .reduce((sum, emp) => sum + emp.salary, 0);

  const exportToExcel = () => {
    try {
      const exportData = filteredEmployees.map((emp) => ({
        "Employee Code": emp.displayCode,
        "Name": emp.name,
        "Name (Arabic)": emp.nameAr,
        "Position": emp.position,
        "Department": emp.department,
        "Email": emp.email,
        "Phone": emp.phone,
        "National ID": emp.nationalId,
        "Hire Date": emp.hireDate || "",
        "Start Date": emp.startDate || "",
        "Base Salary (SAR)": emp.baseSalary,
        "Housing Allowance (SAR)": emp.housingAllowance,
        "Transport Allowance (SAR)": emp.transportAllowance,
        "Other Allowances (SAR)": emp.otherAllowances,
        "Total Salary (SAR)": emp.salary,
        "Social Insurance": emp.socialInsurance,
        "Social Insurance Amount (SAR)": emp.socialInsuranceAmount,
        "Bank Account": emp.bankAccount,
        "Bank Name": emp.bankName,
        "Contract Type": emp.contractType,
        "Address": emp.address,
        "Emergency Contact": emp.emergencyContact,
        "Emergency Phone": emp.emergencyPhone,
        "Status": emp.status,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 20 }, { wch: 15 },
        { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 },
        { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 15 },
        { wch: 15 }, { wch: 18 }, { wch: 20 }, { wch: 20 }, { wch: 12 },
        { wch: 30 }, { wch: 20 }, { wch: 15 }, { wch: 12 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Employees");
      const fileName = `employees_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2 className="text-2xl font-semibold tracking-tight">Employee Management</h2>
          <p className="text-muted-foreground mt-1">Manage employee information, documents, and records</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="h-4 w-4" />
                Add Employee
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Employee</DialogTitle>
              <DialogDescription>Enter employee information and details</DialogDescription>
            </DialogHeader>
            
            <Tabs defaultValue="personal" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="personal">Personal</TabsTrigger>
                <TabsTrigger value="employment">Employment</TabsTrigger>
                <TabsTrigger value="financial">Financial</TabsTrigger>
                <TabsTrigger value="emergency">Emergency</TabsTrigger>
              </TabsList>

              <TabsContent value="personal" className="space-y-4 pt-4">
                {/* Employee Photo */}
                <div className="flex flex-col items-center gap-3 p-4 border rounded-lg bg-muted/30">
                  <Avatar className="h-24 w-24">
                    {employeePhoto ? (
                      <AvatarImage src={employeePhoto} />
                    ) : (
                      <AvatarFallback className="bg-primary/10 text-primary text-2xl">
                        <User className="h-12 w-12" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => photoInputRef.current?.click()}
                    className="gap-2"
                    disabled={uploadingPhoto}
                  >
                    <Upload className="h-4 w-4" />
                    {uploadingPhoto ? "Uploading..." : employeePhoto ? "Change Photo" : "Upload Photo"}
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full Name (English) *</Label>
                    <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="John Doe" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="nameAr">Full Name (Arabic)</Label>
                    <Input id="nameAr" value={nameAr} onChange={(e) => setNameAr(e.target.value)} placeholder="جون دو" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@company.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+966 50 123 4567" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="nationalId">National ID</Label>
                    <Input id="nationalId" value={nationalId} onChange={(e) => setNationalId(e.target.value)} placeholder="1234567890" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="address">Address</Label>
                    <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="City, Country" />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="employment" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="position">Position *</Label>
                  <Input id="position" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Sales Manager" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="department">Department *</Label>
                    <Select value={department} onValueChange={setDepartment}>
                      <SelectTrigger id="department">
                        <SelectValue placeholder="Select department" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Sales">Sales</SelectItem>
                        <SelectItem value="Finance">Finance</SelectItem>
                        <SelectItem value="Operations">Operations</SelectItem>
                        <SelectItem value="HR">Human Resources</SelectItem>
                        <SelectItem value="IT">IT</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contractType">Contract Type</Label>
                    <Select value={contractType} onValueChange={(value: any) => setContractType(value)}>
                      <SelectTrigger id="contractType">
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full-time">Full Time</SelectItem>
                        <SelectItem value="part-time">Part Time</SelectItem>
                        <SelectItem value="contract">Contract</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hireDate">Hire Date</Label>
                    <Input id="hireDate" type="date" value={hireDate} onChange={(e) => setHireDate(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="startDate">Start Date</Label>
                    <Input id="startDate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="financial" className="space-y-4 pt-4">
                <div className="space-y-4">
                  <div className="p-3 bg-muted/50 rounded-lg">
                    <h4 className="font-medium mb-3">Salary Components</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="baseSalary">Base Salary (SAR) *</Label>
                        <Input 
                          id="baseSalary" 
                          type="number" 
                          value={baseSalary} 
                          onChange={(e) => setBaseSalary(e.target.value)} 
                          placeholder="5000" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="housingAllowance">Housing Allowance (SAR)</Label>
                        <Input 
                          id="housingAllowance" 
                          type="number" 
                          value={housingAllowance} 
                          onChange={(e) => setHousingAllowance(e.target.value)} 
                          placeholder="1500" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="transportAllowance">Transport Allowance (SAR)</Label>
                        <Input 
                          id="transportAllowance" 
                          type="number" 
                          value={transportAllowance} 
                          onChange={(e) => setTransportAllowance(e.target.value)} 
                          placeholder="800" 
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="otherAllowances">Other Allowances (SAR)</Label>
                        <Input 
                          id="otherAllowances" 
                          type="number" 
                          value={otherAllowances} 
                          onChange={(e) => setOtherAllowances(e.target.value)} 
                          placeholder="200" 
                        />
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t">
                      <div className="flex justify-between items-center">
                        <span className="font-medium">Total Monthly Salary:</span>
                        <span className="text-lg font-bold text-primary">
                          SAR {(
                            parseFloat(baseSalary || "0") + 
                            parseFloat(housingAllowance || "0") + 
                            parseFloat(transportAllowance || "0") + 
                            parseFloat(otherAllowances || "0")
                          ).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="socialInsurance">Social Insurance No.</Label>
                      <Input 
                        id="socialInsurance" 
                        value={socialInsurance} 
                        onChange={(e) => setSocialInsurance(e.target.value)} 
                        placeholder="SI-1234567890" 
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="socialInsuranceAmount">Social Insurance Amount (SAR)</Label>
                      <Input 
                        id="socialInsuranceAmount" 
                        type="number" 
                        value={socialInsuranceAmount} 
                        onChange={(e) => setSocialInsuranceAmount(e.target.value)} 
                        placeholder="500" 
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="bankName">Bank Name</Label>
                      <Select value={bankName} onValueChange={setBankName}>
                        <SelectTrigger id="bankName">
                          <SelectValue placeholder="Select bank" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Al Rajhi Bank">Al Rajhi Bank</SelectItem>
                          <SelectItem value="Riyad Bank">Riyad Bank</SelectItem>
                          <SelectItem value="NCB">NCB</SelectItem>
                          <SelectItem value="SAMBA">SAMBA</SelectItem>
                          <SelectItem value="Al Ahli">Al Ahli</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bankAccount">Bank Account (IBAN)</Label>
                      <Input 
                        id="bankAccount" 
                        value={bankAccount} 
                        onChange={(e) => setBankAccount(e.target.value)} 
                        placeholder="SA1234567890123456789012" 
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="emergency" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContact">Emergency Contact Name</Label>
                    <Input id="emergencyContact" value={emergencyContact} onChange={(e) => setEmergencyContact(e.target.value)} placeholder="Contact Name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyPhone">Emergency Phone</Label>
                    <Input id="emergencyPhone" value={emergencyPhone} onChange={(e) => setEmergencyPhone(e.target.value)} placeholder="+966 50 123 4567" />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddEmployee} className="bg-purple-600 hover:bg-purple-700 text-white">Add Employee</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {employees.filter(e => e.status === "active").length} Active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Payroll</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">SAR {totalSalaries.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">Monthly total</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Departments</CardTitle>
            <Briefcase className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{new Set(employees.map(e => e.department)).size}</div>
            <p className="text-xs text-muted-foreground mt-1">Active departments</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Documents</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{employees.reduce((sum, emp) => sum + emp.documents.length, 0)}</div>
            <p className="text-xs text-muted-foreground mt-1">Total files</p>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Employee List</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search employees..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-[300px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {employeesLoading && employees.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">Loading employees...</div>
          ) : filteredEmployees.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <User className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No employees found</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead>Position</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Salary</TableHead>
                    <TableHead>Documents</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            {employee.photo ? (
                              <AvatarImage src={employee.photo} />
                            ) : (
                              <AvatarFallback className="bg-primary/10 text-primary">
                                {employee.name.split(' ').map(n => n[0]).join('')}
                              </AvatarFallback>
                            )}
                          </Avatar>
                          <div>
                            <div className="font-medium">{employee.name}</div>
                            <div className="text-sm text-muted-foreground">{employee.displayCode}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{employee.position}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{employee.department}</Badge>
                      </TableCell>
                      <TableCell>SAR {employee.salary.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          <FileText className="h-3 w-3" />
                          {employee.documents.length}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Select
                          value={employee.status}
                          onValueChange={(value: "active" | "on-leave" | "terminated") => 
                            updateEmployeeStatus(employee.id, value)
                          }
                        >
                          <SelectTrigger className="w-[140px] h-8 border-0 p-0">
                            <SelectValue>
                              <Badge className={statusColors[employee.status]}>
                                {employee.status.replace('-', ' ')}
                              </Badge>
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="active">
                              <div className="flex items-center gap-2">
                                <Badge className={statusColors.active}>Active</Badge>
                              </div>
                            </SelectItem>
                            <SelectItem value="on-leave">
                              <div className="flex items-center gap-2">
                                <Badge className={statusColors["on-leave"]}>On Leave</Badge>
                              </div>
                            </SelectItem>
                            <SelectItem value="terminated">
                              <div className="flex items-center gap-2">
                                <Badge className={statusColors.terminated}>Terminated</Badge>
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              setSelectedEmployeeId(employee.id);
                              setIsDetailsDialogOpen(true);
                            }}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteClick(employee)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Employee Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Employee Details</DialogTitle>
            <DialogDescription>Complete employee information and records</DialogDescription>
          </DialogHeader>

          {selectedEmployee && (
            <Tabs defaultValue="info" className="w-full">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="info">Information</TabsTrigger>
                <TabsTrigger value="employment">Employment</TabsTrigger>
                <TabsTrigger value="financial">Financial</TabsTrigger>
                <TabsTrigger value="documents">
                  Documents ({selectedEmployee.documents.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="info" className="space-y-4">
                <div className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                  <Avatar className="h-20 w-20">
                    {selectedEmployee.photo ? (
                      <AvatarImage src={selectedEmployee.photo} />
                    ) : (
                      <AvatarFallback className="bg-primary text-primary-foreground text-xl">
                        {selectedEmployee.name.split(' ').map(n => n[0]).join('')}
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">{selectedEmployee.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedEmployee.nameAr}</p>
                    <div className="flex items-center gap-4 mt-2">
                      <Badge>{selectedEmployee.displayCode}</Badge>
                      <Select
                        value={selectedEmployee.status}
                        onValueChange={(value: "active" | "on-leave" | "terminated") => 
                          updateEmployeeStatus(selectedEmployee.id, value)
                        }
                      >
                        <SelectTrigger className="w-[140px] h-8 border-0 p-0">
                          <SelectValue>
                            <Badge className={statusColors[selectedEmployee.status]}>
                              {selectedEmployee.status.replace('-', ' ')}
                            </Badge>
                          </SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">
                            <div className="flex items-center gap-2">
                              <Badge className={statusColors.active}>Active</Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="on-leave">
                            <div className="flex items-center gap-2">
                              <Badge className={statusColors["on-leave"]}>On Leave</Badge>
                            </div>
                          </SelectItem>
                          <SelectItem value="terminated">
                            <div className="flex items-center gap-2">
                              <Badge className={statusColors.terminated}>Terminated</Badge>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Email</Label>
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <p>{selectedEmployee.email}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Phone</Label>
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <p>{selectedEmployee.phone}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">National ID</Label>
                    <p>{selectedEmployee.nationalId}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Address</Label>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <p>{selectedEmployee.address}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Emergency Contact</Label>
                    <p>{selectedEmployee.emergencyContact}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Emergency Phone</Label>
                    <p>{selectedEmployee.emergencyPhone}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="employment" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Position</Label>
                    <p className="font-medium">{selectedEmployee.position}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Department</Label>
                    <Badge variant="outline">{selectedEmployee.department}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Contract Type</Label>
                    <Badge>{selectedEmployee.contractType}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Hire Date</Label>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p>{selectedEmployee.hireDate ? new Date(selectedEmployee.hireDate).toLocaleDateString('en-GB') : "—"}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Start Date</Label>
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <p>{selectedEmployee.startDate ? new Date(selectedEmployee.startDate).toLocaleDateString('en-GB') : "—"}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Tenure</Label>
                    <p>
                      {selectedEmployee.hireDate 
                        ? `${Math.floor((new Date().getTime() - new Date(selectedEmployee.hireDate).getTime()) / (1000 * 60 * 60 * 24 * 365))} years`
                        : "—"}
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="financial" className="space-y-4">
                <div className="p-4 bg-muted/50 rounded-lg space-y-3">
                  <h4 className="font-semibold">Salary Breakdown</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-sm">Base Salary</Label>
                      <p className="font-medium">SAR {selectedEmployee.baseSalary.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-sm">Housing Allowance</Label>
                      <p className="font-medium">SAR {selectedEmployee.housingAllowance.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-sm">Transport Allowance</Label>
                      <p className="font-medium">SAR {selectedEmployee.transportAllowance.toLocaleString()}</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-sm">Other Allowances</Label>
                      <p className="font-medium">SAR {selectedEmployee.otherAllowances.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="pt-3 border-t">
                    <div className="flex justify-between items-center">
                      <Label className="text-muted-foreground">Total Monthly Salary</Label>
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-primary" />
                        <p className="text-xl font-bold text-primary">
                          SAR {selectedEmployee.salary.toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Social Insurance No.</Label>
                    <div className="flex items-center gap-2">
                      <Shield className="h-4 w-4 text-muted-foreground" />
                      <p>{selectedEmployee.socialInsurance}</p>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Social Insurance Amount</Label>
                    <p className="font-medium">SAR {selectedEmployee.socialInsuranceAmount.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Bank Name</Label>
                    <p>{selectedEmployee.bankName}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Bank Account (IBAN)</Label>
                    <p className="font-mono text-sm">{selectedEmployee.bankAccount}</p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="documents" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Employee Documents</h4>
                  <Button 
                    size="sm" 
                    className="gap-2"
                    onClick={() => {
                      resetDocumentForm();
                      setIsUploadDialogOpen(true);
                    }}
                  >
                    <Upload className="h-4 w-4" />
                    Upload Document
                  </Button>
                </div>

                {selectedEmployee.documents.length === 0 ? (
                  <div className="text-center py-12 border rounded-lg bg-muted/30">
                    <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                    <p className="text-muted-foreground">No documents uploaded yet</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-4 gap-2"
                      onClick={() => {
                        resetDocumentForm();
                        setIsUploadDialogOpen(true);
                      }}
                    >
                      <Upload className="h-4 w-4" />
                      Upload First Document
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {selectedEmployee.documents.map((doc) => (
                      <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 flex-1">
                          {doc.category === "photo" || (doc.fileType && doc.fileType.startsWith('image/')) ? (
                            <div className="h-12 w-12 rounded border bg-muted flex items-center justify-center overflow-hidden">
                              {doc.fileUrl ? (
                                <img src={doc.fileUrl} alt={doc.name} className="h-full w-full object-cover" />
                              ) : (
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              )}
                            </div>
                          ) : (
                            <div className="h-12 w-12 rounded border bg-primary/5 flex items-center justify-center">
                              <File className="h-6 w-6 text-primary" />
                            </div>
                          )}
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{doc.name}</p>
                              <Badge className={documentCategoryColors[doc.category]} variant="outline">
                                {doc.category}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              Uploaded {new Date(doc.uploadDate).toLocaleDateString('en-GB')}
                              {doc.notes && ` • ${doc.notes}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {doc.fileUrl && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="gap-2"
                              onClick={() => {
                                setViewDocument(doc);
                                setIsViewDocumentOpen(true);
                              }}
                            >
                              <Eye className="h-4 w-4" />
                              View
                            </Button>
                          )}
                          {doc.fileUrl && (
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              className="gap-2"
                              onClick={() => handleDownloadDocument(doc)}
                            >
                              <Download className="h-4 w-4" />
                              Download
                            </Button>
                          )}
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => handleDeleteDocument(doc.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>

      {/* Upload Document Dialog */}
      <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Employee Document</DialogTitle>
            <DialogDescription>
              Upload contract, ID, photo, certificates, or other documents for {selectedEmployee?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="docName">Document Name *</Label>
              <Input
                id="docName"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="e.g., Employment Contract 2024"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="docCategory">Document Category *</Label>
              <Select value={documentCategory} onValueChange={(value: any) => setDocumentCategory(value)}>
                <SelectTrigger id="docCategory">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="id">National ID / Iqama</SelectItem>
                  <SelectItem value="photo">Employee Photo</SelectItem>
                  <SelectItem value="certificate">Certificate / Diploma</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Upload File *</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                onChange={handleDocumentFileUpload}
                className="hidden"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="w-full gap-2"
              >
                <Upload className="h-4 w-4" />
                {documentFile ? "Change File" : "Choose File"}
              </Button>
              {documentFile && (
                <div className="p-4 border rounded-lg bg-muted/30">
                  {documentFileType?.startsWith('image/') ? (
                    <img src={URL.createObjectURL(documentFile)} alt="Preview" className="max-h-48 mx-auto rounded" />
                  ) : (
                    <div className="flex items-center gap-2 text-sm">
                      <File className="h-5 w-5 text-primary" />
                      <span>{documentFile.name} ({(documentFile.size / 1024).toFixed(2)} KB)</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="docNotes">Notes (Optional)</Label>
              <Textarea
                id="docNotes"
                value={documentNotes}
                onChange={(e) => setDocumentNotes(e.target.value)}
                placeholder="Add any additional notes about this document..."
                rows={3}
              />
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAddDocument} disabled={!documentName || !documentFile || uploadingDocument}>
              <Upload className="h-4 w-4 mr-2" />
              {uploadingDocument ? "Uploading..." : "Upload Document"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Document Dialog */}
      <Dialog open={isViewDocumentOpen} onOpenChange={setIsViewDocumentOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>{viewDocument?.name}</DialogTitle>
            <DialogDescription>
              <Badge className={viewDocument ? documentCategoryColors[viewDocument.category] : ""} variant="outline">
                {viewDocument?.category}
              </Badge>
              <span className="ml-2">
                Uploaded on {viewDocument && new Date(viewDocument.uploadDate).toLocaleDateString('en-GB')}
              </span>
            </DialogDescription>
          </DialogHeader>

          {viewDocument && viewDocument.fileUrl && (
            <ScrollArea className="h-[600px]">
              {viewDocument.fileType?.startsWith('image/') || viewDocument.category === 'photo' ? (
                <img 
                  src={viewDocument.fileUrl} 
                  alt={viewDocument.name} 
                  className="w-full rounded-lg"
                />
              ) : viewDocument.fileType === 'application/pdf' ? (
                <iframe
                  src={viewDocument.fileUrl}
                  className="w-full h-[600px] rounded-lg border"
                  title={viewDocument.name}
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-[400px] border rounded-lg bg-muted/30">
                  <File className="h-16 w-16 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">Preview not available for this file type</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-4 gap-2"
                    onClick={() => handleDownloadDocument(viewDocument)}
                  >
                    <Download className="h-4 w-4" />
                    Download to View
                  </Button>
                </div>
              )}
            </ScrollArea>
          )}

          {viewDocument?.notes && (
            <div className="p-3 border rounded-lg bg-muted/30 mt-4">
              <Label className="text-sm font-medium">Notes:</Label>
              <p className="text-sm text-muted-foreground mt-1">{viewDocument.notes}</p>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => setIsViewDocumentOpen(false)}>Close</Button>
            {viewDocument && (
              <Button onClick={() => handleDownloadDocument(viewDocument)} className="gap-2">
                <Download className="h-4 w-4" />
                Download
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Employee</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this employee? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {employeeToDelete && (
            <div className="py-4">
              <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg">
                <Avatar className="h-12 w-12">
                  {employeeToDelete.photo ? (
                    <AvatarImage src={employeeToDelete.photo} />
                  ) : (
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {employeeToDelete.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  )}
                </Avatar>
                <div>
                  <p className="font-medium">{employeeToDelete.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {employeeToDelete.position} • {employeeToDelete.department}
                  </p>
                  <p className="text-xs text-muted-foreground">{employeeToDelete.displayCode}</p>
                </div>
              </div>
              <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg">
                <p className="text-sm text-destructive font-medium">
                  Warning: This will permanently delete:
                </p>
                <ul className="mt-2 text-sm text-muted-foreground list-disc list-inside space-y-1">
                  <li>Employee record and all personal information</li>
                  <li>All attendance records</li>
                  <li>All employee requests</li>
                  <li>All custody items</li>
                  <li>All documents and photos</li>
                  <li>Related expenses and leaves</li>
                </ul>
              </div>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="outline" onClick={() => {
              setIsDeleteDialogOpen(false);
              setEmployeeToDelete(null);
            }}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => deleteEmployee()}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Employee
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
