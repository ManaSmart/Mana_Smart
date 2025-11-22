import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2, Eye, Package, Laptop, Smartphone, Car, Monitor, Printer, Key, IdCard, Upload, X, User, DollarSign, FileText, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { EmployeeCustodyItems, EmployeeCustodyItemsInsert } from "../../supabase/models/employee_custody_items";
import type { Employees } from "../../supabase/models/employees";
import { uploadFile, getFileUrl, getFilesByOwner } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";

type CustodyStatus = "Active" | "Returned" | "Damaged" | "Lost";
type CustodyCondition = "New" | "Good" | "Fair" | "Poor";

interface CustodyItemView {
  record: EmployeeCustodyItems;
  custodyId: string;
  custodyNumber: string;
  itemName: string;
  itemNameAr: string;
  category: string;
  serialNumber?: string;
  description: string;
  descriptionAr: string;
  employeeName: string;
  employeeId: string;
  department: string;
  dateIssued: string;
  dateReturn?: string;
  status: CustodyStatus;
  condition: CustodyCondition;
  value: number;
  image?: string;
  location?: string;
  warrantyExpiry?: string;
  notes?: string;
}

interface EmployeeCustodyJsonEntry {
  custodyId: string;
  itemName: string;
  category: string;
  status: string | null;
  condition: string | null;
  dateIssued: string | null;
  dateReturn: string | null;
  value: number | null;
}

const DEFAULT_STATUS: CustodyStatus = "Active";
const DEFAULT_CONDITION: CustodyCondition = "New";

// Generate custody number in AST-YYYY-XXX format
const formatCustodyNumber = (item: EmployeeCustodyItems, sequence: number): string => {
  const date = item.item_date_issued ? new Date(item.item_date_issued) : 
                (item.created_at ? new Date(item.created_at) : new Date());
  const year = date.getFullYear();
  return `AST-${year}-${String(sequence).padStart(3, "0")}`;
};

const toNullableString = (value: string) => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const parseEmployeeJson = (value: Employees["attendance_calendar"]) => {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      return JSON.parse(value) ?? {};
    } catch (error) {
      console.warn("Failed to parse employee attendance_calendar JSON", error);
      return {};
    }
  }
  if (typeof value === "object") {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
};

const buildCustodyJsonEntries = (items: EmployeeCustodyItems[]): EmployeeCustodyJsonEntry[] =>
  items.map((item) => ({
    custodyId: item.custody_id,
    itemName: item.item_en_name,
    category: item.item_category,
    status: item.item_status,
    condition: item.item_condition,
    dateIssued: item.item_date_issued,
    dateReturn: item.item_return_date,
    value: item.item_value,
  }));

const normalizeStatus = (status: string | null | undefined): CustodyStatus => {
  const normalized = (status ?? DEFAULT_STATUS).toString().toLowerCase();
  switch (normalized) {
    case "active":
      return "Active";
    case "returned":
      return "Returned";
    case "damaged":
      return "Damaged";
    case "lost":
      return "Lost";
    default:
      return DEFAULT_STATUS;
  }
};

const normalizeCondition = (condition: string | null | undefined): CustodyCondition => {
  const normalized = (condition ?? DEFAULT_CONDITION).toString().toLowerCase();
  switch (normalized) {
    case "new":
      return "New";
    case "good":
      return "Good";
    case "fair":
      return "Fair";
    case "poor":
      return "Poor";
    default:
      return DEFAULT_CONDITION;
  }
};

const formatDateDisplay = (value?: string) => {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-GB');
};

const calculateDurationDays = (value?: string) => {
  if (!value) return null;
  const issued = new Date(value);
  if (Number.isNaN(issued.getTime())) return null;
  const today = new Date();
  const diff = today.getTime() - issued.getTime();
  if (!Number.isFinite(diff)) return null;
  return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "Active": return "bg-green-100 text-green-700 border-green-200";
    case "Returned": return "bg-blue-100 text-blue-700 border-blue-200";
    case "Damaged": return "bg-orange-100 text-orange-700 border-orange-200";
    case "Lost": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getConditionColor = (condition: string) => {
  switch (condition) {
    case "New": return "bg-green-100 text-green-700 border-green-200";
    case "Good": return "bg-blue-100 text-blue-700 border-blue-200";
    case "Fair": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Poor": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Laptop": return <Laptop className="h-5 w-5" />;
    case "Mobile": case "Tablet": return <Smartphone className="h-5 w-5" />;
    case "Vehicle": return <Car className="h-5 w-5" />;
    case "Monitor": return <Monitor className="h-5 w-5" />;
    case "Printer": return <Printer className="h-5 w-5" />;
    case "Access Card": return <IdCard className="h-5 w-5" />;
    case "Keys": return <Key className="h-5 w-5" />;
    default: return <Package className="h-5 w-5" />;
  }
};

export function Custody() {
  const dispatch = useAppDispatch();
  const custodyRaw = useAppSelector(selectors.employee_custody_items.selectAll) as EmployeeCustodyItems[];
  const employees = useAppSelector(selectors.employees.selectAll) as Employees[];
  const employeesLoading = useAppSelector(selectors.employees.selectLoading);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<CustodyItemView | null>(null);
  const [editingItem, setEditingItem] = useState<CustodyItemView | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [custodyImages, setCustodyImages] = useState<Record<string, string>>({});

  useEffect(() => {
    dispatch(thunks.employee_custody_items.fetchAll(undefined));
    dispatch(thunks.employees.fetchAll(undefined));
  }, [dispatch]);

  // Load images from storage for custody items
  useEffect(() => {
    const loadCustodyImages = async () => {
      const imageMap: Record<string, string> = {};
      for (const item of custodyRaw) {
        if (!item.custody_id) continue;
        try {
          const files = await getFilesByOwner(item.custody_id, 'custody', FILE_CATEGORIES.CUSTODY_DOCUMENT);
          if (files.length > 0) {
            const fileUrl = await getFileUrl(
              files[0].bucket as any,
              files[0].path,
              files[0].is_public
            );
            if (fileUrl) {
              imageMap[item.custody_id] = fileUrl;
            }
          } else if (item.item_image && (item.item_image.startsWith('http') || item.item_image.startsWith('https'))) {
            imageMap[item.custody_id] = item.item_image;
          } else if (item.item_image && item.item_image.startsWith('data:')) {
            imageMap[item.custody_id] = item.item_image;
          }
        } catch (error) {
          console.error(`Error loading image for custody ${item.custody_id}:`, error);
          if (item.item_image) {
            imageMap[item.custody_id] = item.item_image;
          }
        }
      }
      setCustodyImages(imageMap);
    };
    
    if (custodyRaw.length > 0) {
      loadCustodyImages();
    }
  }, [custodyRaw]);

  const employeesById = useMemo(() => {
    const map = new Map<string, Employees>();
    employees.forEach((employee) => {
      map.set(employee.employee_id, employee);
    });
    return map;
  }, [employees]);

  // Generate custody number map with sequences
  const custodyNumberMap = useMemo(() => {
    const parse = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    // Sort by item_date_issued (or created_at if no date), then by created_at
    const sorted = [...custodyRaw].sort((a, b) => {
      const dateA = parse(a.item_date_issued ?? a.created_at);
      const dateB = parse(b.item_date_issued ?? b.created_at);
      if (dateA !== dateB) return dateA - dateB;
      return parse(a.created_at) - parse(b.created_at);
    });

    const map = new Map<string, number>();
    const yearSequences = new Map<number, number>();

    sorted.forEach((item) => {
      const date = item.item_date_issued ? new Date(item.item_date_issued) : 
                   (item.created_at ? new Date(item.created_at) : new Date());
      const year = date.getFullYear();
      const currentSeq = yearSequences.get(year) ?? 0;
      const nextSeq = currentSeq + 1;
      yearSequences.set(year, nextSeq);
      map.set(item.custody_id, nextSeq);
    });

    return map;
  }, [custodyRaw]);

  const custodyItems = useMemo<CustodyItemView[]>(() => {
    return custodyRaw
      .map((item) => {
        const employee = item.employee_id ? employeesById.get(item.employee_id) : undefined;
        const view: CustodyItemView = {
          record: item,
          custodyId: item.custody_id,
          custodyNumber: formatCustodyNumber(item, custodyNumberMap.get(item.custody_id) ?? 1),
          itemName: item.item_en_name,
          itemNameAr: item.item_ar_name ?? "",
          category: item.item_category,
          serialNumber: item.item_serial_number ?? undefined,
          description: item.item_desc_en ?? "",
          descriptionAr: item.item_desc_ar ?? "",
          employeeName: employee?.name_en ?? "Unassigned",
          employeeId: item.employee_id ?? "",
          department: employee?.department ?? "General",
          dateIssued: item.item_date_issued ?? "",
          dateReturn: item.item_return_date ?? undefined,
          status: normalizeStatus(item.item_status),
          condition: normalizeCondition(item.item_condition),
          value: Number(item.item_value ?? 0),
          image: (custodyImages[item.custody_id] || item.item_image) ?? undefined,
          location: item.item_office_location ?? undefined,
          warrantyExpiry: item.item_warranty_expire ?? undefined,
          notes: item.item_notes ?? undefined,
        };
        return view;
      })
      .sort((a, b) => {
        const aDate = a.record.created_at ? new Date(a.record.created_at).getTime() : 0;
        const bDate = b.record.created_at ? new Date(b.record.created_at).getTime() : 0;
        return bDate - aDate;
      });
  }, [custodyRaw, employeesById, custodyImages, custodyNumberMap]);

  const categories = useMemo(() => {
    return Array.from(new Set(custodyItems.map(item => item.category))).sort();
  }, [custodyItems]);

  const employeeOptions = useMemo(() => {
    return employees
      .filter((emp) => !!emp.employee_id)
      .map((emp) => ({
        id: emp.employee_id,
        name: emp.name_en ?? "Unnamed Employee",
        department: emp.department ?? "General",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [employees]);

  // Form states
  const [formItemName, setFormItemName] = useState("");
  const [formItemNameAr, setFormItemNameAr] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formSerialNumber, setFormSerialNumber] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDescriptionAr, setFormDescriptionAr] = useState("");
  const [formEmployee, setFormEmployee] = useState("");
  const [formEmployeeId, setFormEmployeeId] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [formDateIssued, setFormDateIssued] = useState("");
  const [formDateReturn, setFormDateReturn] = useState("");
  const [formStatus, setFormStatus] = useState<"Active" | "Returned" | "Damaged" | "Lost">("Active");
  const [formCondition, setFormCondition] = useState<"New" | "Good" | "Fair" | "Poor">("New");
  const [formValue, setFormValue] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formWarrantyExpiry, setFormWarrantyExpiry] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const filteredItems = useMemo(() => {
    return custodyItems.filter(item => {
      const query = searchQuery.toLowerCase();
      const matchesSearch =
        item.itemName.toLowerCase().includes(query) ||
        item.itemNameAr.includes(searchQuery) ||
        item.custodyNumber.toLowerCase().includes(query) ||
        item.employeeName.toLowerCase().includes(query) ||
        item.employeeId.toLowerCase().includes(query) ||
        (item.serialNumber ?? "").toLowerCase().includes(query);

      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;

      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [custodyItems, searchQuery, statusFilter, categoryFilter]);

  const stats = useMemo(() => {
    const activeItems = custodyItems.filter(i => i.status === "Active");
    return {
      totalItems: custodyItems.length,
      active: activeItems.length,
      returned: custodyItems.filter(i => i.status === "Returned").length,
      damaged: custodyItems.filter(i => i.status === "Damaged").length,
      totalValue: activeItems.reduce((sum, item) => sum + item.value, 0),
    };
  }, [custodyItems]);

  const selectedItemDuration = selectedItem ? calculateDurationDays(selectedItem.dateIssued) : null;

  const syncEmployeeCustody = async (
    employeeId: string | null | undefined,
    overrideItems?: EmployeeCustodyItems[]
  ) => {
    if (!employeeId) return;
    const employee = employeesById.get(employeeId);
    const itemsForEmployee =
      overrideItems ?? custodyRaw.filter((item) => item.employee_id === employeeId);

    const existingJson = parseEmployeeJson(employee?.attendance_calendar ?? null);
    const nextJson = {
      ...existingJson,
      custody_items: buildCustodyJsonEntries(itemsForEmployee),
    };

    try {
      await dispatch(
        thunks.employees.updateOne({
          id: employeeId,
          values: { attendance_calendar: nextJson },
        })
      ).unwrap();
    } catch (error) {
      console.error("Failed to sync custody items with employee record", error);
      toast.error("Failed to link custody items to employee record");
    }
  };

  const resetForm = () => {
    setFormItemName("");
    setFormItemNameAr("");
    setFormCategory("");
    setFormSerialNumber("");
    setFormDescription("");
    setFormDescriptionAr("");
    setFormEmployee("");
    setFormEmployeeId("");
    setFormDepartment("");
    setFormDateIssued("");
    setFormDateReturn("");
    setFormStatus(DEFAULT_STATUS);
    setFormCondition(DEFAULT_CONDITION);
    setFormValue("");
    setFormLocation("");
    setFormWarrantyExpiry("");
    setFormNotes("");
    setFormImage(null);
    setFormImageFile(null);
    setEditingItem(null);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image size should be less than 5MB");
      return;
    }
    
    // For preview, show immediately
    const reader = new FileReader();
    reader.onloadend = () => {
      setFormImage(reader.result as string);
    };
    reader.readAsDataURL(file);
    
    // Store file for upload when saving
    setFormImageFile(file);
  };

  const openAddDialog = () => {
    resetForm();
    setIsDialogOpen(true);
  };

  const openEditDialog = (item: CustodyItemView) => {
    setEditingItem(item);
    setFormItemName(item.itemName);
    setFormItemNameAr(item.itemNameAr);
    setFormCategory(item.category);
    setFormSerialNumber(item.serialNumber || "");
    setFormDescription(item.description);
    setFormDescriptionAr(item.descriptionAr);
    setFormEmployee(item.employeeName);
    setFormEmployeeId(item.employeeId);
    setFormDepartment(item.department);
    setFormDateIssued(item.dateIssued);
    setFormDateReturn(item.dateReturn || "");
    setFormStatus(item.status);
    setFormCondition(item.condition);
    setFormValue(Number.isFinite(item.value) ? item.value.toString() : "");
    setFormLocation(item.location || "");
    setFormWarrantyExpiry(item.warrantyExpiry || "");
    setFormNotes(item.notes || "");
    setFormImage(item.image || null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (isSubmitting) return;
    if (!formItemName || !formItemNameAr || !formCategory || !formEmployee || !formEmployeeId || !formDepartment || !formDateIssued || !formValue) {
      toast.error("Please fill all required fields");
      return;
    }

    const parsedValue = Number(formValue);
    if (!Number.isFinite(parsedValue)) {
      toast.error("Please enter a valid numeric value");
      return;
    }

    let imageUrl = formImage; // Keep existing image URL if no new file

    // Upload new image if provided
    if (formImageFile) {
      setUploadingImage(true);
      try {
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

        const custodyId = editingItem?.custodyId;
        
        if (custodyId) {
          const uploadResult = await uploadFile({
            file: formImageFile,
            category: FILE_CATEGORIES.CUSTODY_DOCUMENT,
            ownerId: custodyId,
            ownerType: 'custody',
            description: `Custody item image for ${formItemName}`,
            userId: currentUserId || undefined,
          });

          if (uploadResult.success && uploadResult.fileMetadata) {
            imageUrl = uploadResult.publicUrl || uploadResult.signedUrl || 
              (await getFileUrl(
                uploadResult.fileMetadata.bucket as any,
                uploadResult.fileMetadata.path,
                uploadResult.fileMetadata.is_public
              )) || formImage;
          } else {
            toast.error(uploadResult.error || 'Failed to upload image');
            imageUrl = formImage;
          }
        }
      } catch (error: any) {
        console.error('Error uploading image:', error);
        toast.error(error.message || 'Failed to upload image');
        imageUrl = formImage;
      } finally {
        setUploadingImage(false);
      }
    }

    const basePayload = {
      item_en_name: formItemName,
      item_ar_name: toNullableString(formItemNameAr),
      item_category: formCategory,
      item_serial_number: toNullableString(formSerialNumber),
      item_desc_en: toNullableString(formDescription),
      item_desc_ar: toNullableString(formDescriptionAr),
      employee_id: formEmployeeId,
      item_date_issued: formDateIssued,
      item_return_date: toNullableString(formDateReturn),
      item_status: formStatus,
      item_condition: formCondition,
      item_value: parsedValue,
      item_image: imageUrl ?? null,
      item_office_location: toNullableString(formLocation),
      item_warranty_expire: toNullableString(formWarrantyExpiry),
      item_notes: toNullableString(formNotes),
    };

    setIsSubmitting(true);
    try {
      if (editingItem) {
        const previousEmployeeId = editingItem.employeeId;
        const updatePayload: Partial<EmployeeCustodyItems> = {
          ...basePayload,
        };
        const updated = await dispatch(
          thunks.employee_custody_items.updateOne({
            id: editingItem.custodyId,
            values: updatePayload,
          })
        ).unwrap();

        // Update image map if we uploaded a new image
        if (formImageFile && imageUrl) {
          setCustodyImages(prev => ({
            ...prev,
            [editingItem.custodyId]: imageUrl || ''
          }));
        }

        const nextEmployeeId = updated.employee_id ?? formEmployeeId;
        const updatedListForEmployee = [
          ...custodyRaw.filter(
            (item) => item.employee_id === nextEmployeeId && item.custody_id !== updated.custody_id
          ),
          updated,
        ];
        await syncEmployeeCustody(nextEmployeeId, updatedListForEmployee);

        if (previousEmployeeId && previousEmployeeId !== nextEmployeeId) {
          const previousEmployeeList = custodyRaw.filter(
            (item) => item.employee_id === previousEmployeeId && item.custody_id !== updated.custody_id
          );
          await syncEmployeeCustody(previousEmployeeId, previousEmployeeList);
        }

        toast.success("Custody item updated successfully!");
      } else {
        const createPayload: EmployeeCustodyItemsInsert = {
          ...basePayload,
        };
        const created = await dispatch(
          thunks.employee_custody_items.createOne(createPayload)
        ).unwrap();
        const custodyId = created.custody_id;
        
        // Upload image after creation if we have one
        if (formImageFile && custodyId) {
          try {
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

            const uploadResult = await uploadFile({
              file: formImageFile,
              category: FILE_CATEGORIES.CUSTODY_DOCUMENT,
              ownerId: custodyId,
              ownerType: 'custody',
              description: `Custody item image for ${formItemName}`,
              userId: currentUserId || undefined,
            });

            if (uploadResult.success && uploadResult.fileMetadata) {
              const uploadedUrl = uploadResult.publicUrl || uploadResult.signedUrl || 
                (await getFileUrl(
                  uploadResult.fileMetadata.bucket as any,
                  uploadResult.fileMetadata.path,
                  uploadResult.fileMetadata.is_public
                ));
              
              if (uploadedUrl) {
                // Update the custody item with the uploaded image URL
                await dispatch(thunks.employee_custody_items.updateOne({
                  id: custodyId,
                  values: { item_image: uploadedUrl }
                })).unwrap();
                
                // Update local image map
                setCustodyImages(prev => ({
                  ...prev,
                  [custodyId]: uploadedUrl
                }));
              }
            }
          } catch (error: any) {
            console.error('Error uploading image after creation:', error);
            // Don't fail the whole operation if image upload fails
          }
        }
        
        const nextEmployeeId = created.employee_id ?? formEmployeeId;
        const updatedListForEmployee = [
          ...custodyRaw.filter((item) => item.employee_id === nextEmployeeId),
          created,
        ];
        await syncEmployeeCustody(nextEmployeeId, updatedListForEmployee);
        toast.success("Custody item added successfully!");
      }

      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      console.error("Failed to save custody item", error);
      const message = error?.message || error?.error?.message || "Failed to save custody item";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: CustodyItemView) => {
    setDeletingId(item.custodyId);
    try {
      await dispatch(thunks.employee_custody_items.deleteOne(item.custodyId)).unwrap();
      const remainingItems = custodyRaw.filter(
        (custody) => custody.employee_id === item.employeeId && custody.custody_id !== item.custodyId
      );
      await syncEmployeeCustody(item.employeeId, remainingItems);
      toast.success("Custody item deleted successfully!");
    } catch (error: any) {
      console.error("Failed to delete custody item", error);
      const message = error?.message || error?.error?.message || "Failed to delete custody item";
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const openViewDialog = (item: CustodyItemView) => {
    setSelectedItem(item);
    setIsViewDialogOpen(true);
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredItems.map((item) => ({
        "Custody Number": item.custodyNumber,
        "Item Name": item.itemName,
        "Item Name (AR)": item.itemNameAr,
        "Category": item.category,
        "Serial Number": item.serialNumber || "",
        "Description": item.description,
        "Description (AR)": item.descriptionAr,
        "Employee Name": item.employeeName,
        "Employee ID": item.employeeId,
        "Department": item.department,
        "Date Issued": item.dateIssued,
        "Date Return": item.dateReturn || "",
        "Status": item.status,
        "Condition": item.condition,
        "Value (SAR)": item.value,
        "Location": item.location || "",
        "Warranty Expiry": item.warrantyExpiry || "",
        "Notes": item.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
        { wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 15 },
        { wch: 20 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Custody");
      const fileName = `custody_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2>Employee Custody - عهدة الموظفين</h2>
          <p className="text-muted-foreground mt-1">Manage items assigned to employees</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={openAddDialog} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="h-4 w-4" />
            New Custody Item
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Items</CardTitle>
            <Package className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.totalItems}</div>
            <p className="text-xs text-muted-foreground mt-1">All custody items</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active</CardTitle>
            <Package className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs text-muted-foreground mt-1">With employees</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Returned</CardTitle>
            <Package className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.returned}</div>
            <p className="text-xs text-muted-foreground mt-1">Back to inventory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Damaged</CardTitle>
            <Package className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.damaged}</div>
            <p className="text-xs text-muted-foreground mt-1">Needs attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Value</CardTitle>
            <DollarSign className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {stats.totalValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">SAR - Current value</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by item, employee, serial number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {categories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Returned">Returned</SelectItem>
                <SelectItem value="Damaged">Damaged</SelectItem>
                <SelectItem value="Lost">Lost</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Custody Table */}
      <Card>
        <CardContent className="pt-6">
          {filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No custody items found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Custody #</TableHead>
                    <TableHead>Item</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead>Date Issued</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item) => (
                    <TableRow key={item.custodyId}>
                      <TableCell className="font-mono text-sm">{item.custodyNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            {getCategoryIcon(item.category)}
                          </div>
                          <div>
                            <p className="font-medium">{item.itemName}</p>
                            <p className="text-xs text-muted-foreground" dir="rtl">{item.itemNameAr}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.employeeName}</p>
                          <p className="text-xs text-muted-foreground">{item.employeeId}</p>
                        </div>
                      </TableCell>
                      <TableCell>{item.department}</TableCell>
                      <TableCell>{formatDateDisplay(item.dateIssued)}</TableCell>
                      <TableCell>SAR {item.value.toLocaleString()}</TableCell>
                      <TableCell>
                        <Badge className={getConditionColor(item.condition)}>
                          {item.condition}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(item.status)}>
                          {item.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openViewDialog(item)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(item)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(item)}
                            disabled={deletingId === item.custodyId || isSubmitting}
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

      {/* Add/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Custody Item" : "Add New Custody Item"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update custody item information" : "Register a new custody item"}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="item" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="item">Item Details</TabsTrigger>
              <TabsTrigger value="employee">Employee Info</TabsTrigger>
              <TabsTrigger value="additional">Additional Info</TabsTrigger>
            </TabsList>

            <TabsContent value="item" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="itemName">Item Name (English) *</Label>
                  <Input
                    id="itemName"
                    value={formItemName}
                    onChange={(e) => setFormItemName(e.target.value)}
                    placeholder="Dell Latitude Laptop"
                  />
                </div>

                <div>
                  <Label htmlFor="itemNameAr">Item Name (Arabic) *</Label>
                  <Input
                    id="itemNameAr"
                    value={formItemNameAr}
                    onChange={(e) => setFormItemNameAr(e.target.value)}
                    placeholder="لابتوب ديل"
                    dir="rtl"
                  />
                </div>

                <div>
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Laptop">Laptop</SelectItem>
                      <SelectItem value="Mobile">Mobile Phone</SelectItem>
                      <SelectItem value="Tablet">Tablet</SelectItem>
                      <SelectItem value="Monitor">Monitor</SelectItem>
                      <SelectItem value="Printer">Printer</SelectItem>
                      <SelectItem value="Vehicle">Vehicle</SelectItem>
                      <SelectItem value="Access Card">Access Card</SelectItem>
                      <SelectItem value="Keys">Keys</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="serialNumber">Serial Number</Label>
                  <Input
                    id="serialNumber"
                    value={formSerialNumber}
                    onChange={(e) => setFormSerialNumber(e.target.value)}
                    placeholder="DL2023-456789"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="description">Description (English)</Label>
                  <Textarea
                    id="description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Detailed description in English"
                    rows={2}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="descriptionAr">Description (Arabic)</Label>
                  <Textarea
                    id="descriptionAr"
                    value={formDescriptionAr}
                    onChange={(e) => setFormDescriptionAr(e.target.value)}
                    placeholder="وصف تفصيلي بالعربية"
                    rows={2}
                    dir="rtl"
                  />
                </div>

                <div>
                  <Label htmlFor="value">Item Value (SAR) *</Label>
                  <Input
                    id="value"
                    type="number"
                    step="0.01"
                    value={formValue}
                    onChange={(e) => setFormValue(e.target.value)}
                    placeholder="4500.00"
                  />
                </div>

                <div>
                  <Label htmlFor="condition">Condition *</Label>
                  <Select value={formCondition} onValueChange={(value: any) => setFormCondition(value)}>
                    <SelectTrigger id="condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="Good">Good</SelectItem>
                      <SelectItem value="Fair">Fair</SelectItem>
                      <SelectItem value="Poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Label htmlFor="image">Item Image</Label>
                  <div className="mt-2">
                    {formImage ? (
                      <div className="relative inline-block">
                        <img 
                          src={formImage} 
                          alt="Item" 
                          className="w-32 h-32 object-cover rounded-lg border"
                        />
                        <Button
                          size="sm"
                          variant="destructive"
                          className="absolute -top-2 -right-2"
                          onClick={() => setFormImage(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-2">Upload item image</p>
                        <Input
                          id="image"
                          type="file"
                          accept="image/*"
                          onChange={handleImageUpload}
                          className="max-w-xs mx-auto"
                        />
                        <p className="text-xs text-muted-foreground mt-2">Max size: 5MB</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="employee" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <Label htmlFor="employeeSelect">Select Employee *</Label>
                  <Select
                    value={formEmployeeId}
                    onValueChange={(value) => {
                      setFormEmployeeId(value);
                      const selectedEmp = employeesById.get(value);
                      if (selectedEmp) {
                        setFormEmployee(selectedEmp.name_en ?? "Unnamed Employee");
                        setFormDepartment(selectedEmp.department ?? "General");
                      } else {
                        setFormEmployee("");
                        setFormDepartment("");
                      }
                    }}
                    disabled={employeesLoading}
                  >
                    <SelectTrigger id="employeeSelect">
                      <SelectValue placeholder={employeesLoading ? "Loading employees..." : "Choose employee from list"} />
                    </SelectTrigger>
                    <SelectContent>
                      {employeeOptions.map((emp) => (
                        <SelectItem key={emp.id} value={emp.id}>
                          <div className="flex items-center justify-between gap-4">
                            <span className="font-medium">{emp.name}</span>
                            <span className="text-xs text-muted-foreground">({emp.id})</span>
                            <span className="text-xs text-muted-foreground">- {emp.department}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="employee">Employee Name</Label>
                  <Input
                    id="employee"
                    value={formEmployee}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div>
                  <Label htmlFor="employeeId">Employee ID</Label>
                  <Input
                    id="employeeId"
                    value={formEmployeeId}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div>
                  <Label htmlFor="department">Department</Label>
                  <Input
                    id="department"
                    value={formDepartment}
                    disabled
                    className="bg-muted"
                  />
                </div>

                <div>
                  <Label htmlFor="dateIssued">Date Issued *</Label>
                  <Input
                    id="dateIssued"
                    type="date"
                    value={formDateIssued}
                    onChange={(e) => setFormDateIssued(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="status">Status *</Label>
                  <Select value={formStatus} onValueChange={(value: any) => setFormStatus(value)}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active (With Employee)</SelectItem>
                      <SelectItem value="Returned">Returned</SelectItem>
                      <SelectItem value="Damaged">Damaged</SelectItem>
                      <SelectItem value="Lost">Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="dateReturn">Date Returned (if applicable)</Label>
                  <Input
                    id="dateReturn"
                    type="date"
                    value={formDateReturn}
                    onChange={(e) => setFormDateReturn(e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="additional" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="location">Location</Label>
                  <Input
                    id="location"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Riyadh Office / Field"
                  />
                </div>

                <div>
                  <Label htmlFor="warrantyExpiry">Warranty Expiry</Label>
                  <Input
                    id="warrantyExpiry"
                    type="date"
                    value={formWarrantyExpiry}
                    onChange={(e) => setFormWarrantyExpiry(e.target.value)}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Additional notes or comments"
                    rows={4}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={uploadingImage || isSubmitting}
            >
              {editingItem ? "Update Custody Item" : "Add Custody Item"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Custody Item Details</DialogTitle>
            <DialogDescription>Complete information about this custody item</DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6 py-4">
              <div className="flex gap-6">
                <div className="w-40 h-40 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {selectedItem.image ? (
                    <img 
                      src={selectedItem.image} 
                      alt={selectedItem.itemName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      {getCategoryIcon(selectedItem.category)}
                      <p className="text-xs text-muted-foreground mt-2">{selectedItem.category}</p>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getStatusColor(selectedItem.status)}>
                        {selectedItem.status}
                      </Badge>
                      <Badge className={getConditionColor(selectedItem.condition)}>
                        {selectedItem.condition}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">{selectedItem.custodyNumber}</span>
                    </div>
                    <h3 className="text-2xl font-bold">{selectedItem.itemName}</h3>
                    <p className="text-lg text-muted-foreground" dir="rtl">{selectedItem.itemNameAr}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Category</Label>
                      <p className="font-medium">{selectedItem.category}</p>
                    </div>
                    {selectedItem.serialNumber && (
                      <div>
                        <Label className="text-muted-foreground">Serial Number</Label>
                        <p className="font-mono">{selectedItem.serialNumber}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Item Value</p>
                    <p className="text-2xl font-bold">SAR {selectedItem.value.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Date Issued</p>
                    <p className="text-xl font-semibold">{formatDateDisplay(selectedItem.dateIssued)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Duration</p>
                    <p className="text-xl font-semibold">
                      {selectedItemDuration !== null ? `${selectedItemDuration} days` : "-"}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Employee Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Name</Label>
                      <p className="font-medium">{selectedItem.employeeName}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Employee ID</Label>
                      <p className="font-mono">{selectedItem.employeeId}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Department</Label>
                      <p>{selectedItem.department}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Item Details
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Description (EN)</Label>
                      <p>{selectedItem.description}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Description (AR)</Label>
                      <p dir="rtl">{selectedItem.descriptionAr}</p>
                    </div>
                    {selectedItem.location && (
                      <div>
                        <Label className="text-muted-foreground">Location</Label>
                        <p>{selectedItem.location}</p>
                      </div>
                    )}
                    {selectedItem.warrantyExpiry && (
                      <div>
                        <Label className="text-muted-foreground">Warranty Expiry</Label>
                        <p>{formatDateDisplay(selectedItem.warrantyExpiry)}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {selectedItem.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{selectedItem.notes}</p>
                </div>
              )}

              {selectedItem.dateReturn && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <Label className="text-muted-foreground">Return Information</Label>
                  <p className="text-sm mt-1">
                    <strong>Date Returned:</strong> {formatDateDisplay(selectedItem.dateReturn)}
                  </p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setIsViewDialogOpen(false);
                  openEditDialog(selectedItem);
                }}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Item
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
