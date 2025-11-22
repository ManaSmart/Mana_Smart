import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2, Eye, Building2, Car, Laptop, Package, DollarSign, TrendingUp, Upload, X, Wrench, AlertCircle, Clock, Download } from "lucide-react";
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
import { Switch } from "./ui/switch";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { FixedAssetsManagement } from "../../supabase/models/fixed_assets_management";
import { uploadFile, getFileUrl, getFilesByOwner } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";
import { SupplierSelector } from "./SupplierSelector";
import type { Supplier as SupplierOption } from "./SupplierSelector";
import type { Suppliers } from "../../supabase/models/suppliers";

interface Asset {
  id: string;
  assetNumber: string;
  assetName: string;
  assetNameAr: string;
  category: string;
  type: string;
  description: string;
  descriptionAr: string;
  purchaseDate: string;
  purchasePrice: number;
  currentValue: number;
  depreciationRate: number;
  usefulLife: number;
  location: string;
  department: string;
  supplier?: string;
  serialNumber?: string;
  model?: string;
  manufacturer?: string;
  warrantyExpiry?: string;
  lastMaintenanceDate?: string;
  nextMaintenanceDate?: string;
  status: "Active" | "Under Maintenance" | "Disposed" | "Sold";
  condition: "Excellent" | "Good" | "Fair" | "Poor";
  image?: string;
  notes?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "Active": return "bg-green-100 text-green-700 border-green-200";
    case "Under Maintenance": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Disposed": return "bg-red-100 text-red-700 border-red-200";
    case "Sold": return "bg-blue-100 text-blue-700 border-blue-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getConditionColor = (condition: string) => {
  switch (condition) {
    case "Excellent": return "bg-green-100 text-green-700 border-green-200";
    case "Good": return "bg-blue-100 text-blue-700 border-blue-200";
    case "Fair": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Poor": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Real Estate": return <Building2 className="h-5 w-5" />;
    case "Vehicles": return <Car className="h-5 w-5" />;
    case "IT Equipment": return <Laptop className="h-5 w-5" />;
    case "Machinery": return <Wrench className="h-5 w-5" />;
    case "Furniture": return <Package className="h-5 w-5" />;
    default: return <Package className="h-5 w-5" />;
  }
};

const normalizeStatus = (status: string | null | undefined): Asset["status"] => {
  if (status === "Active" || status === "Under Maintenance" || status === "Disposed" || status === "Sold") {
    return status;
  }
  return "Active";
};

const normalizeCondition = (condition: string | null | undefined): Asset["condition"] => {
  if (condition === "Excellent" || condition === "Good" || condition === "Fair" || condition === "Poor") {
    return condition;
  }
  return "Good";
};

// Generate asset number in AST-YYYY-XXX format
const formatAssetNumber = (record: FixedAssetsManagement, sequence: number): string => {
  const date = record.asset_purchase_date ? new Date(record.asset_purchase_date) : 
                (record.created_at ? new Date(record.created_at) : new Date());
  const year = date.getFullYear();
  return `AST-${year}-${String(sequence).padStart(3, "0")}`;
};

const mapRecordToAsset = (record: FixedAssetsManagement, sequence: number): Asset => ({
  id: record.asset_id,
  assetNumber: formatAssetNumber(record, sequence),
  assetName: record.asset_en_name,
  assetNameAr: record.asset_ar_name ?? "",
  category: record.asset_category,
  type: record.asset_department ?? record.asset_category,
  description: record.asset_desc_en ?? "",
  descriptionAr: record.asset_desc_ar ?? "",
  purchaseDate: record.asset_purchase_date,
  purchasePrice: record.asset_purchase_price,
  currentValue: record.asset_current_value ?? record.asset_purchase_price,
  depreciationRate: record.asset_depreciation_rate ?? 0,
  usefulLife: record.asset_useful_lifespan ?? 0,
  location: record.asset_location ?? "",
  department: record.asset_department ?? "",
  supplier: record.asset_supplier_id ?? undefined,
  serialNumber: record.asset_serial_number ?? undefined,
  model: record.asset_model ?? undefined,
  manufacturer: record.asset_manufacturer_name ?? undefined,
  warrantyExpiry: record.asset_warranty_exp ?? undefined,
  lastMaintenanceDate: record.asset_last_maintenance_date ?? undefined,
  nextMaintenanceDate: record.asset_next_maintenance_date ?? undefined,
  status: normalizeStatus(record.asset_status),
  condition: normalizeCondition(record.asset_condition),
  image: record.asset_image ?? undefined,
  notes: record.asset_notes ?? undefined,
});

export function Assets() {
  const dispatch = useAppDispatch();
  const assetRecords = useAppSelector(selectors.fixed_assets_management.selectAll);
  const loading = useAppSelector(selectors.fixed_assets_management.selectLoading);
  const error = useAppSelector(selectors.fixed_assets_management.selectError);
  const dbSuppliers = useAppSelector(selectors.suppliers.selectAll) as Suppliers[];
  const [assetImages, setAssetImages] = useState<Record<string, string>>({});
  
  // Generate asset number map with sequences
  const assetNumberMap = useMemo(() => {
    const parse = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    // Sort by purchase date (or created_at if no purchase date), then by created_at
    const sorted = [...assetRecords].sort((a, b) => {
      const dateA = parse(a.asset_purchase_date ?? a.created_at);
      const dateB = parse(b.asset_purchase_date ?? b.created_at);
      if (dateA !== dateB) return dateA - dateB;
      return parse(a.created_at) - parse(b.created_at);
    });

    const map = new Map<string, number>();
    const yearSequences = new Map<number, number>();

    sorted.forEach((record) => {
      const date = record.asset_purchase_date ? new Date(record.asset_purchase_date) : 
                   (record.created_at ? new Date(record.created_at) : new Date());
      const year = date.getFullYear();
      const currentSeq = yearSequences.get(year) ?? 0;
      const nextSeq = currentSeq + 1;
      yearSequences.set(year, nextSeq);
      map.set(record.asset_id, nextSeq);
    });

    return map;
  }, [assetRecords]);

  const assets = useMemo(() => assetRecords.map(record => ({
    ...mapRecordToAsset(record, assetNumberMap.get(record.asset_id) ?? 1),
    image: assetImages[record.asset_id] || record.asset_image || undefined,
  })), [assetRecords, assetImages, assetNumberMap]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [editingAssetRecord, setEditingAssetRecord] = useState<FixedAssetsManagement | null>(null);

  // Form states
  const [formAssetName, setFormAssetName] = useState("");
  const [formAssetNameAr, setFormAssetNameAr] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formType, setFormType] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDescriptionAr, setFormDescriptionAr] = useState("");
  const [formPurchaseDate, setFormPurchaseDate] = useState("");
  const [formPurchasePrice, setFormPurchasePrice] = useState("");
  const [formCurrentValue, setFormCurrentValue] = useState("");
  const [formDepreciationRate, setFormDepreciationRate] = useState("");
  const [formUsefulLife, setFormUsefulLife] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formDepartment, setFormDepartment] = useState("");
  const [selectedSupplierOption, setSelectedSupplierOption] = useState<SupplierOption | null>(null);
  const [useManualSupplier, setUseManualSupplier] = useState(false);
  const [manualSupplierName, setManualSupplierName] = useState("");
  const [formSerialNumber, setFormSerialNumber] = useState("");
  const [formModel, setFormModel] = useState("");
  const [formManufacturer, setFormManufacturer] = useState("");
  const [formWarrantyExpiry, setFormWarrantyExpiry] = useState("");
  const [formLastMaintenance, setFormLastMaintenance] = useState("");
  const [formNextMaintenance, setFormNextMaintenance] = useState("");
  const [formStatus, setFormStatus] = useState<"Active" | "Under Maintenance" | "Disposed" | "Sold">("Active");
  const [formCondition, setFormCondition] = useState<"Excellent" | "Good" | "Fair" | "Poor">("Good");
  const [formNotes, setFormNotes] = useState("");
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  useEffect(() => {
    void dispatch(thunks.fixed_assets_management.fetchAll(undefined));
    void dispatch(thunks.suppliers.fetchAll(undefined));
  }, [dispatch]);

  // Load images from storage for assets
  useEffect(() => {
    const loadAssetImages = async () => {
      const imageMap: Record<string, string> = {};
      for (const record of assetRecords) {
        if (!record.asset_id) continue;
        try {
          const files = await getFilesByOwner(record.asset_id, 'asset', FILE_CATEGORIES.ASSET_FILE);
          if (files.length > 0) {
            const fileUrl = await getFileUrl(
              files[0].bucket as any,
              files[0].path,
              files[0].is_public
            );
            if (fileUrl) {
              imageMap[record.asset_id] = fileUrl;
            }
          } else if (record.asset_image && (record.asset_image.startsWith('http') || record.asset_image.startsWith('https'))) {
            imageMap[record.asset_id] = record.asset_image;
          } else if (record.asset_image && record.asset_image.startsWith('data:')) {
            imageMap[record.asset_id] = record.asset_image;
          }
        } catch (error) {
          console.error(`Error loading image for asset ${record.asset_id}:`, error);
          if (record.asset_image) {
            imageMap[record.asset_id] = record.asset_image;
          }
        }
      }
      setAssetImages(imageMap);
    };
    
    if (assetRecords.length > 0) {
      loadAssetImages();
    }
  }, [assetRecords]);

  useEffect(() => {
    if (error) {
      toast.error(error);
    }
  }, [error]);

  const categories = useMemo<string[]>(() => Array.from(new Set(assets.map(asset => asset.category))), [assets]);

  const supplierOptions = useMemo<SupplierOption[]>(() => {
    return dbSuppliers.map((supplier, idx) => ({
      id: idx + 1,
      name: supplier.supplier_en_name ?? supplier.supplier_ar_name ?? "Unnamed Supplier",
      mobile: supplier.supplier_phone_num ?? undefined,
      email: supplier.supplier_email ?? undefined,
      location: [supplier.supplier_address, supplier.supplier_city, supplier.supplier_country].filter(Boolean).join(", "),
      dbId: supplier.supplier_id,
    }));
  }, [dbSuppliers]);

  // Update selectedSupplierOption when supplierOptions change (for editing)
  useEffect(() => {
    if (editingAssetRecord?.asset_supplier_id && supplierOptions.length > 0) {
      const option = supplierOptions.find(opt => opt.dbId === editingAssetRecord.asset_supplier_id);
      if (option && (!selectedSupplierOption || selectedSupplierOption.dbId !== option.dbId)) {
        setSelectedSupplierOption(option);
      }
    }
  }, [editingAssetRecord?.asset_supplier_id, supplierOptions]);

  const filteredAssets = assets.filter(asset => {
    const matchesSearch = 
      asset.assetName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.assetNameAr.includes(searchQuery) ||
      asset.assetNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset.serialNumber?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || asset.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || asset.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = useMemo(() => ({
    totalAssets: assets.length,
    active: assets.filter(a => a.status === "Active").length,
    totalPurchaseValue: assets.reduce((sum, asset) => sum + asset.purchasePrice, 0),
    totalCurrentValue: assets.reduce((sum, asset) => sum + asset.currentValue, 0),
    underMaintenance: assets.filter(a => a.status === "Under Maintenance").length,
  }), [assets]);

  const resetForm = () => {
    setFormAssetName("");
    setFormAssetNameAr("");
    setFormCategory("");
    setFormType("");
    setFormDescription("");
    setFormDescriptionAr("");
    setFormPurchaseDate("");
    setFormPurchasePrice("");
    setFormCurrentValue("");
    setFormDepreciationRate("");
    setFormUsefulLife("");
    setFormLocation("");
    setFormDepartment("");
    setSelectedSupplierOption(null);
    setUseManualSupplier(false);
    setManualSupplierName("");
    setFormSerialNumber("");
    setFormModel("");
    setFormManufacturer("");
    setFormWarrantyExpiry("");
    setFormLastMaintenance("");
    setFormNextMaintenance("");
    setFormStatus("Active");
    setFormCondition("Good");
    setFormNotes("");
    setFormImage(null);
    setFormImageFile(null);
    setEditingAssetRecord(null);
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

  const openEditDialog = (asset: Asset) => {
    const record = assetRecords.find(item => item.asset_id === asset.id);
    if (!record) {
      toast.error("Unable to load asset for editing");
      return;
    }

    setEditingAssetRecord(record);
    setFormAssetName(asset.assetName);
    setFormAssetNameAr(asset.assetNameAr);
    setFormCategory(asset.category);
    setFormType(asset.type);
    setFormDescription(asset.description);
    setFormDescriptionAr(asset.descriptionAr);
    setFormPurchaseDate(asset.purchaseDate);
    setFormPurchasePrice(asset.purchasePrice.toString());
    setFormCurrentValue(asset.currentValue.toString());
    setFormDepreciationRate(asset.depreciationRate ? asset.depreciationRate.toString() : "");
    setFormUsefulLife(asset.usefulLife ? asset.usefulLife.toString() : "");
    setFormLocation(asset.location);
    setFormDepartment(asset.department);
    // Check if supplier is in the list or manual
    if (record.asset_supplier_id) {
      setUseManualSupplier(false);
      setManualSupplierName("");
      // Will be set by useEffect
    } else {
      // Check if supplier name is in notes (manual entry)
      const notes = asset.notes || "";
      const supplierMatch = notes.match(/^Supplier:\s*(.+?)(?:\n|$)/);
      if (supplierMatch) {
        setUseManualSupplier(true);
        setManualSupplierName(supplierMatch[1].trim());
        setSelectedSupplierOption(null);
        // Remove supplier from notes for display
        const notesWithoutSupplier = notes.replace(/^Supplier:\s*.+?(\n|$)/, "").trim();
        setFormNotes(notesWithoutSupplier);
      } else {
        setUseManualSupplier(false);
        setManualSupplierName("");
      }
    }
    setFormSerialNumber(asset.serialNumber || "");
    setFormModel(asset.model || "");
    setFormManufacturer(asset.manufacturer || "");
    setFormWarrantyExpiry(asset.warrantyExpiry || "");
    setFormLastMaintenance(asset.lastMaintenanceDate || "");
    setFormNextMaintenance(asset.nextMaintenanceDate || "");
    setFormStatus(asset.status);
    setFormCondition(asset.condition);
    setFormNotes(asset.notes || "");
    setFormImage(record.asset_image || null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formAssetName || !formAssetNameAr || !formCategory || !formPurchaseDate || !formPurchasePrice || !formLocation || !formDepartment) {
      toast.error("Please fill all required fields");
      return;
    }

    const purchasePrice = Number(formPurchasePrice);
    if (Number.isNaN(purchasePrice)) {
      toast.error("Purchase price must be a number");
      return;
    }

    const currentValueInput = formCurrentValue ? Number(formCurrentValue) : purchasePrice;
    if (Number.isNaN(currentValueInput)) {
      toast.error("Current value must be a number");
      return;
    }

    const depreciationRate = formDepreciationRate ? Number(formDepreciationRate) : null;
    if (formDepreciationRate && Number.isNaN(depreciationRate)) {
      toast.error("Depreciation rate must be a number");
      return;
    }

    const usefulLife = formUsefulLife ? Number(formUsefulLife) : null;
    if (formUsefulLife && Number.isNaN(usefulLife)) {
      toast.error("Useful life must be a number");
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

        const assetId = editingAssetRecord?.asset_id;
        
        if (assetId) {
          const uploadResult = await uploadFile({
            file: formImageFile,
            category: FILE_CATEGORIES.ASSET_FILE,
            ownerId: assetId,
            ownerType: 'asset',
            description: `Asset image for ${formAssetName}`,
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

    const payload: Partial<FixedAssetsManagement> = {
      asset_en_name: formAssetName,
      asset_ar_name: formAssetNameAr || null,
      asset_category: formCategory,
      asset_desc_en: formDescription || null,
      asset_desc_ar: formDescriptionAr || null,
      asset_purchase_date: formPurchaseDate,
      asset_purchase_price: purchasePrice,
      asset_current_value: currentValueInput,
      asset_depreciation_rate: depreciationRate,
      asset_useful_lifespan: usefulLife,
      asset_location: formLocation,
      asset_department: formDepartment,
      asset_supplier_id: useManualSupplier ? null : (selectedSupplierOption?.dbId || null),
      asset_notes: useManualSupplier && manualSupplierName 
        ? `${formNotes ? formNotes.trim() + '\n' : ''}Supplier: ${manualSupplierName}`.trim()
        : (formNotes ? formNotes.trim() : null),
      asset_serial_number: formSerialNumber || null,
      asset_model: formModel || null,
      asset_manufacturer_name: formManufacturer || null,
      asset_warranty_exp: formWarrantyExpiry || null,
      asset_last_maintenance_date: formLastMaintenance || null,
      asset_next_maintenance_date: formNextMaintenance || null,
      asset_status: formStatus,
      asset_condition: formCondition,
      asset_image: imageUrl || null,
    };

    try {
      if (editingAssetRecord) {
        const assetId = editingAssetRecord.asset_id;
        await dispatch(thunks.fixed_assets_management.updateOne({ id: assetId, values: payload })).unwrap();
        
        // Update image map if we uploaded a new image
        if (formImageFile && imageUrl) {
          setAssetImages(prev => ({
            ...prev,
            [assetId]: imageUrl || ''
          }));
        }
        
        toast.success("Asset updated successfully!");
      } else {
        // Create new asset first
        const created = await dispatch(thunks.fixed_assets_management.createOne(payload)).unwrap();
        const assetId = created?.asset_id;
        
        // Upload image after creation if we have one
        if (formImageFile && assetId) {
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
              category: FILE_CATEGORIES.ASSET_FILE,
              ownerId: assetId,
              ownerType: 'asset',
              description: `Asset image for ${formAssetName}`,
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
                // Update the asset with the uploaded image URL
                await dispatch(thunks.fixed_assets_management.updateOne({
                  id: assetId,
                  values: { asset_image: uploadedUrl }
                })).unwrap();
                
                // Update local image map
                setAssetImages(prev => ({
                  ...prev,
                  [assetId]: uploadedUrl
                }));
              }
            }
          } catch (error: any) {
            console.error('Error uploading image after creation:', error);
            // Don't fail the whole operation if image upload fails
          }
        }
        
        toast.success("Asset added successfully!");
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (err: any) {
      const message = err?.message || err?.error?.message || "Failed to save asset";
      toast.error(message);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dispatch(thunks.fixed_assets_management.deleteOne(id)).unwrap();
      toast.success("Asset deleted successfully!");
      if (selectedAsset?.id === id) {
        setIsViewDialogOpen(false);
        setSelectedAsset(null);
      }
    } catch (err: any) {
      const message = err?.message || err?.error?.message || "Failed to delete asset";
      toast.error(message);
    }
  };

  const openViewDialog = (asset: Asset) => {
    setSelectedAsset(asset);
    setIsViewDialogOpen(true);
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredAssets.map((asset) => ({
        "Asset Number": asset.assetNumber,
        "Asset Name": asset.assetName,
        "Asset Name (AR)": asset.assetNameAr,
        "Category": asset.category,
        "Type": asset.type,
        "Description": asset.description,
        "Description (AR)": asset.descriptionAr,
        "Purchase Date": asset.purchaseDate,
        "Purchase Price (SAR)": asset.purchasePrice,
        "Current Value (SAR)": asset.currentValue,
        "Depreciation Rate (%)": asset.depreciationRate,
        "Useful Life (Years)": asset.usefulLife,
        "Location": asset.location,
        "Department": asset.department,
        "Supplier": asset.supplier || "",
        "Serial Number": asset.serialNumber || "",
        "Model": asset.model || "",
        "Manufacturer": asset.manufacturer || "",
        "Warranty Expiry": asset.warrantyExpiry || "",
        "Last Maintenance Date": asset.lastMaintenanceDate || "",
        "Next Maintenance Date": asset.nextMaintenanceDate || "",
        "Status": asset.status,
        "Condition": asset.condition,
        "Notes": asset.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 },
        { wch: 30 }, { wch: 30 }, { wch: 12 }, { wch: 15 }, { wch: 15 },
        { wch: 15 }, { wch: 12 }, { wch: 20 }, { wch: 15 }, { wch: 20 },
        { wch: 15 }, { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Assets");
      const fileName = `assets_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2>Fixed Assets Management - إدارة الأصول الثابتة</h2>
          <p className="text-muted-foreground mt-1">Track and manage company assets</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={openAddDialog} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="h-4 w-4" />
            New Asset
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Assets</CardTitle>
            <Package className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.totalAssets}</div>
            <p className="text-xs text-muted-foreground mt-1">All assets</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Active Assets</CardTitle>
            <TrendingUp className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.active}</div>
            <p className="text-xs text-muted-foreground mt-1">In use</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Purchase Value</CardTitle>
            <DollarSign className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">
              {(stats.totalPurchaseValue / 1000000).toFixed(1)}M
            </div>
            <p className="text-xs text-muted-foreground mt-1">SAR - Original cost</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Value</CardTitle>
            <DollarSign className="h-5 w-5 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">
              {(stats.totalCurrentValue / 1000000).toFixed(1)}M
            </div>
            <p className="text-xs text-muted-foreground mt-1">SAR - Book value</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Maintenance</CardTitle>
            <Wrench className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.underMaintenance}</div>
            <p className="text-xs text-muted-foreground mt-1">Under service</p>
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
                placeholder="Search by name, asset number, serial number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[200px]">
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
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Under Maintenance">Under Maintenance</SelectItem>
                <SelectItem value="Disposed">Disposed</SelectItem>
                <SelectItem value="Sold">Sold</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Assets Table */}
      <Card>
        <CardContent className="pt-6">
          {error && assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <AlertCircle className="h-12 w-12 text-destructive mb-3" />
              <p className="text-destructive font-medium">Failed to load assets</p>
              <p className="text-sm text-muted-foreground max-w-md">{error}</p>
            </div>
          ) : loading && assets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mb-3 animate-spin" />
              <p className="text-muted-foreground">Loading assets...</p>
            </div>
          ) : filteredAssets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No assets found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset #</TableHead>
                    <TableHead>Asset Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Purchase Date</TableHead>
                    <TableHead>Purchase Price</TableHead>
                    <TableHead>Current Value</TableHead>
                    <TableHead>Condition</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAssets.map((asset) => (
                    <TableRow key={asset.id}>
                      <TableCell className="font-mono text-sm">{asset.assetNumber}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="p-2 rounded-lg bg-primary/10 text-primary">
                            {getCategoryIcon(asset.category)}
                          </div>
                          <div>
                            <p className="font-medium">{asset.assetName}</p>
                            <p className="text-xs text-muted-foreground" dir="rtl">{asset.assetNameAr}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{asset.category}</p>
                          <p className="text-xs text-muted-foreground">{asset.type}</p>
                        </div>
                      </TableCell>
                      <TableCell>{asset.location}</TableCell>
                      <TableCell>{new Date(asset.purchaseDate).toLocaleDateString('en-GB')}</TableCell>
                      <TableCell>SAR {asset.purchasePrice.toLocaleString()}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">SAR {asset.currentValue.toLocaleString()}</p>
                          <p className="text-xs text-muted-foreground">
                            {((asset.currentValue / asset.purchasePrice) * 100).toFixed(0)}% of original
                          </p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getConditionColor(asset.condition)}>
                          {asset.condition}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(asset.status)}>
                          {asset.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openViewDialog(asset)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(asset)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDelete(asset.id)}>
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
            <DialogTitle>{editingAssetRecord ? "Edit Asset" : "Add New Asset"}</DialogTitle>
            <DialogDescription>
              {editingAssetRecord ? "Update asset information" : "Register a new company asset"}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="financial">Financial</TabsTrigger>
              <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
              <TabsTrigger value="additional">Additional</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="assetName">Asset Name (English) *</Label>
                  <Input
                    id="assetName"
                    value={formAssetName}
                    onChange={(e) => setFormAssetName(e.target.value)}
                    placeholder="Office Building"
                  />
                </div>

                <div>
                  <Label htmlFor="assetNameAr">Asset Name (Arabic) *</Label>
                  <Input
                    id="assetNameAr"
                    value={formAssetNameAr}
                    onChange={(e) => setFormAssetNameAr(e.target.value)}
                    placeholder="مبنى المكتب"
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
                      <SelectItem value="Real Estate">Real Estate</SelectItem>
                      <SelectItem value="Vehicles">Vehicles</SelectItem>
                      <SelectItem value="Machinery">Machinery & Equipment</SelectItem>
                      <SelectItem value="IT Equipment">IT Equipment</SelectItem>
                      <SelectItem value="Furniture">Furniture & Fixtures</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="type">Asset Type *</Label>
                  <Input
                    id="type"
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    placeholder="Building, Vehicle, Equipment..."
                  />
                </div>

                <div>
                  <Label htmlFor="location">Location *</Label>
                  <Input
                    id="location"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Riyadh Office"
                  />
                </div>

                <div>
                  <Label htmlFor="department">Department *</Label>
                  <Select value={formDepartment} onValueChange={setFormDepartment}>
                    <SelectTrigger id="department">
                      <SelectValue placeholder="Select department" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Administration">Administration</SelectItem>
                      <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                      <SelectItem value="IT">IT</SelectItem>
                      <SelectItem value="Sales">Sales</SelectItem>
                      <SelectItem value="Logistics">Logistics</SelectItem>
                      <SelectItem value="Finance">Finance</SelectItem>
                    </SelectContent>
                  </Select>
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
                  <Label htmlFor="status">Status *</Label>
                  <Select value={formStatus} onValueChange={(value: any) => setFormStatus(value)}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Under Maintenance">Under Maintenance</SelectItem>
                      <SelectItem value="Disposed">Disposed</SelectItem>
                      <SelectItem value="Sold">Sold</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="condition">Condition *</Label>
                  <Select value={formCondition} onValueChange={(value: any) => setFormCondition(value)}>
                    <SelectTrigger id="condition">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Excellent">Excellent</SelectItem>
                      <SelectItem value="Good">Good</SelectItem>
                      <SelectItem value="Fair">Fair</SelectItem>
                      <SelectItem value="Poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="financial" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="purchaseDate">Purchase Date *</Label>
                  <Input
                    id="purchaseDate"
                    type="date"
                    value={formPurchaseDate}
                    onChange={(e) => setFormPurchaseDate(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="purchasePrice">Purchase Price (SAR) *</Label>
                  <Input
                    id="purchasePrice"
                    type="number"
                    step="0.01"
                    value={formPurchasePrice}
                    onChange={(e) => setFormPurchasePrice(e.target.value)}
                    placeholder="100000.00"
                  />
                </div>

                <div>
                  <Label htmlFor="currentValue">Current Value (SAR)</Label>
                  <Input
                    id="currentValue"
                    type="number"
                    step="0.01"
                    value={formCurrentValue}
                    onChange={(e) => setFormCurrentValue(e.target.value)}
                    placeholder="90000.00"
                  />
                </div>

                <div>
                  <Label htmlFor="depreciationRate">Depreciation Rate (%)</Label>
                  <Input
                    id="depreciationRate"
                    type="number"
                    step="0.1"
                    value={formDepreciationRate}
                    onChange={(e) => setFormDepreciationRate(e.target.value)}
                    placeholder="10"
                  />
                </div>

                <div>
                  <Label htmlFor="usefulLife">Useful Life (Years)</Label>
                  <Input
                    id="usefulLife"
                    type="number"
                    value={formUsefulLife}
                    onChange={(e) => setFormUsefulLife(e.target.value)}
                    placeholder="10"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Supplier</Label>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="manual-supplier" className="text-sm font-normal cursor-pointer">
                        Enter manually
                      </Label>
                      <Switch
                        id="manual-supplier"
                        checked={useManualSupplier}
                        onCheckedChange={(checked) => {
                          setUseManualSupplier(checked);
                          if (checked) {
                            setSelectedSupplierOption(null);
                          } else {
                            setManualSupplierName("");
                          }
                        }}
                      />
                    </div>
                  </div>
                  {useManualSupplier ? (
                    <Input
                      value={manualSupplierName}
                      onChange={(e) => setManualSupplierName(e.target.value)}
                      placeholder="Enter supplier name..."
                    />
                  ) : (
                    <SupplierSelector
                      suppliers={supplierOptions}
                      selectedSupplierId={selectedSupplierOption?.id}
                      onSupplierSelect={(supplier) => {
                        setSelectedSupplierOption(supplier);
                      }}
                      placeholder="Select supplier..."
                    />
                  )}
                </div>

                {formPurchasePrice && formCurrentValue && (
                  <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Total Depreciation</p>
                        <p className="font-semibold text-blue-700">
                          SAR {(parseFloat(formPurchasePrice) - parseFloat(formCurrentValue)).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Depreciation %</p>
                        <p className="font-semibold text-blue-700">
                          {(((parseFloat(formPurchasePrice) - parseFloat(formCurrentValue)) / parseFloat(formPurchasePrice)) * 100).toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Remaining Value</p>
                        <p className="font-semibold text-blue-700">
                          {((parseFloat(formCurrentValue) / parseFloat(formPurchasePrice)) * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="maintenance" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="warrantyExpiry">Warranty Expiry</Label>
                  <Input
                    id="warrantyExpiry"
                    type="date"
                    value={formWarrantyExpiry}
                    onChange={(e) => setFormWarrantyExpiry(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="lastMaintenance">Last Maintenance Date</Label>
                  <Input
                    id="lastMaintenance"
                    type="date"
                    value={formLastMaintenance}
                    onChange={(e) => setFormLastMaintenance(e.target.value)}
                  />
                </div>

                <div>
                  <Label htmlFor="nextMaintenance">Next Maintenance Date</Label>
                  <Input
                    id="nextMaintenance"
                    type="date"
                    value={formNextMaintenance}
                    onChange={(e) => setFormNextMaintenance(e.target.value)}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="additional" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="serialNumber">Serial Number</Label>
                  <Input
                    id="serialNumber"
                    value={formSerialNumber}
                    onChange={(e) => setFormSerialNumber(e.target.value)}
                    placeholder="SN-123456"
                  />
                </div>

                <div>
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    value={formModel}
                    onChange={(e) => setFormModel(e.target.value)}
                    placeholder="Model name/number"
                  />
                </div>

                <div>
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    value={formManufacturer}
                    onChange={(e) => setFormManufacturer(e.target.value)}
                    placeholder="Manufacturer name"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Additional notes or comments"
                    rows={3}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="image">Asset Image</Label>
                  <div className="mt-2">
                    {formImage ? (
                      <div className="relative inline-block">
                        <img 
                          src={formImage} 
                          alt="Asset" 
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
                        <p className="text-sm text-muted-foreground mb-2">Upload asset image</p>
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
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 text-white" disabled={uploadingImage}>
              {editingAssetRecord ? "Update Asset" : "Add Asset"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Asset Details</DialogTitle>
            <DialogDescription>Complete information about this asset</DialogDescription>
          </DialogHeader>

          {selectedAsset && (
            <div className="space-y-6 py-4">
              <div className="flex gap-6">
                <div className="w-48 h-48 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {selectedAsset.image ? (
                    <img 
                      src={selectedAsset.image} 
                      alt={selectedAsset.assetName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-center">
                      <div className="p-4 rounded-lg bg-primary/10 text-primary inline-block mb-2">
                        {getCategoryIcon(selectedAsset.category)}
                      </div>
                      <p className="text-sm text-muted-foreground">{selectedAsset.category}</p>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getStatusColor(selectedAsset.status)}>
                        {selectedAsset.status}
                      </Badge>
                      <Badge className={getConditionColor(selectedAsset.condition)}>
                        {selectedAsset.condition}
                      </Badge>
                      <span className="text-xs text-muted-foreground font-mono">{selectedAsset.assetNumber}</span>
                    </div>
                    <h3 className="text-2xl font-bold">{selectedAsset.assetName}</h3>
                    <p className="text-lg text-muted-foreground" dir="rtl">{selectedAsset.assetNameAr}</p>
                    <p className="text-sm text-muted-foreground mt-2">{selectedAsset.type}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Purchase Price</p>
                    <p className="text-xl font-bold">SAR {selectedAsset.purchasePrice.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Current Value</p>
                    <p className="text-xl font-bold text-primary">SAR {selectedAsset.currentValue.toLocaleString()}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Depreciation</p>
                    <p className="text-xl font-bold text-red-600">
                      {selectedAsset.depreciationRate}%/year
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Asset Age</p>
                    <p className="text-xl font-bold">
                      {Math.floor((new Date().getTime() - new Date(selectedAsset.purchaseDate).getTime()) / (1000 * 60 * 60 * 24 * 365))} years
                    </p>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold">Asset Information</h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Description (EN)</Label>
                      <p>{selectedAsset.description}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Description (AR)</Label>
                      <p dir="rtl">{selectedAsset.descriptionAr}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-muted-foreground">Category</Label>
                        <p>{selectedAsset.category}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Department</Label>
                        <p>{selectedAsset.department}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Location</Label>
                        <p>{selectedAsset.location}</p>
                      </div>
                      {selectedAsset.supplier && (
                        <div>
                          <Label className="text-muted-foreground">Supplier</Label>
                          <p>{selectedAsset.supplier}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold">Additional Details</h4>
                  <div className="space-y-2 text-sm">
                    {selectedAsset.serialNumber && (
                      <div>
                        <Label className="text-muted-foreground">Serial Number</Label>
                        <p className="font-mono">{selectedAsset.serialNumber}</p>
                      </div>
                    )}
                    {selectedAsset.model && (
                      <div>
                        <Label className="text-muted-foreground">Model</Label>
                        <p>{selectedAsset.model}</p>
                      </div>
                    )}
                    {selectedAsset.manufacturer && (
                      <div>
                        <Label className="text-muted-foreground">Manufacturer</Label>
                        <p>{selectedAsset.manufacturer}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Purchase Date</Label>
                      <p>{new Date(selectedAsset.purchaseDate).toLocaleDateString('en-GB')}</p>
                    </div>
                    {selectedAsset.warrantyExpiry && (
                      <div>
                        <Label className="text-muted-foreground">Warranty Expiry</Label>
                        <p>{new Date(selectedAsset.warrantyExpiry).toLocaleDateString('en-GB')}</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {(selectedAsset.lastMaintenanceDate || selectedAsset.nextMaintenanceDate) && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h4 className="font-semibold mb-2">Maintenance Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {selectedAsset.lastMaintenanceDate && (
                      <div>
                        <Label className="text-muted-foreground">Last Maintenance</Label>
                        <p>{new Date(selectedAsset.lastMaintenanceDate).toLocaleDateString('en-GB')}</p>
                      </div>
                    )}
                    {selectedAsset.nextMaintenanceDate && (
                      <div>
                        <Label className="text-muted-foreground">Next Maintenance</Label>
                        <p>{new Date(selectedAsset.nextMaintenanceDate).toLocaleDateString('en-GB')}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {selectedAsset.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{selectedAsset.notes}</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setIsViewDialogOpen(false);
                  openEditDialog(selectedAsset);
                }}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Asset
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
