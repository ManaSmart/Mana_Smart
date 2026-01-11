import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Edit, Trash2, Package, DollarSign, Eye, Upload, X, Boxes, Download } from "lucide-react";
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
import { thunks, selectors } from "../redux-toolkit/slices";
import { uploadFile, getFileUrl, getFilesByOwner, deleteFilesByRecord } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";
const CATEGORY_ALLOW_LIST = [
  "General",
  "Essential Oils",
  "Concentrates",
  "Diffusers",
  "Accessories",
  "Bundles",
  "Raw Materials",
];

export interface InventoryItem {
  id: number;
  sku: string;
  name: string;
  nameAr: string;
  category: string;
  productType: "simple" | "bundle";
  bundleItems?: { id: number; quantity: number }[];
  description: string;
  descriptionAr: string;
  image?: string;
  unitPrice: number;
  costPrice: number;
  stock: number;
  minStock: number;
  maxStock: number;
  unit: string;
  status: "in-stock" | "low-stock" | "out-of-stock";
  supplier?: string;
  location?: string;
  barcode?: string;
  taxable: boolean;
  weight?: number;
  dimensions?: string;
  expiryDate?: string;
  createdDate: string;
  lastUpdated: string;
  notes?: string;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "in-stock": return "bg-green-100 text-green-700 border-green-200";
    case "low-stock": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "out-of-stock": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

export function Inventory() {
  const dispatch = useAppDispatch();
  const dbInventory = useAppSelector(selectors.inventory.selectAll) as any[];
  const loading = useAppSelector(selectors.inventory.selectLoading);
  const loadError = useAppSelector(selectors.inventory.selectError);
  useEffect(() => {
    dispatch(thunks.inventory.fetchAll(undefined));
  }, [dispatch]);

  // Load images from storage for inventory items
  const [inventoryImages, setInventoryImages] = useState<Record<string, string>>({});
  
  useEffect(() => {
    const loadInventoryImages = async () => {
      const imageMap: Record<string, string> = {};
      for (const item of dbInventory) {
        if (!item.product_code) continue;
        try {
          // Try to load from file_metadata first
          const files = await getFilesByOwner(item.product_code, 'inventory', FILE_CATEGORIES.INVENTORY_IMAGE);
          if (files.length > 0) {
            const fileUrl = await getFileUrl(
              files[0].bucket as any,
              files[0].path,
              files[0].is_public
            );
            if (fileUrl) {
              imageMap[item.product_code] = fileUrl;
            }
          } else if (item.prod_img && (item.prod_img.startsWith('http') || item.prod_img.startsWith('https'))) {
            // Already a URL
            imageMap[item.product_code] = item.prod_img;
          } else if (item.prod_img && item.prod_img.startsWith('data:')) {
            // Legacy base64 - keep for backward compatibility
            imageMap[item.product_code] = item.prod_img;
          }
        } catch (error) {
          console.error(`Error loading image for product ${item.product_code}:`, error);
          // Fallback to stored value
          if (item.prod_img) {
            imageMap[item.product_code] = item.prod_img;
          }
        }
      }
      setInventoryImages(imageMap);
    };
    
    if (dbInventory.length > 0) {
      loadInventoryImages();
    }
  }, [dbInventory]);

  const inventory: InventoryItem[] = useMemo(() => {
    return dbInventory.map((p, idx) => ({
      id: idx + 1,
      sku: p.product_code?.slice(0,8) ?? `SKU-${idx+1}`,
      name: p.en_prod_name ?? p.ar_prod_name ?? '',
      nameAr: p.ar_prod_name ?? '',
      category: p.category ?? 'General',
      productType: 'simple',
      description: p.prod_en_description ?? '',
      descriptionAr: p.prod_ar_description ?? '',
      image: inventoryImages[p.product_code] || p.prod_img || undefined,
      unitPrice: Number(p.prod_selling_price ?? 0),
      costPrice: Number(p.prod_cost_price ?? 0),
      stock: Number(p.current_stock ?? 0),
      minStock: Number(p.minimum_stock_alert ?? 0),
      maxStock: Number(p.minimum_stock_alert ?? 0) * 10,
      unit: p.measuring_unit ?? '',
      status: (p.prod_status ?? 'in-stock') as any,
      supplier: p.prod_supplier ?? undefined,
      location: undefined,
      barcode: undefined,
      taxable: true,
      weight: undefined,
      dimensions: undefined,
      expiryDate: undefined,
      createdDate: new Date().toISOString().split('T')[0],
      lastUpdated: new Date().toISOString().split('T')[0],
      notes: undefined,
    }));
  }, [dbInventory, inventoryImages]);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);

  // Form states
  const [formSku, setFormSku] = useState("");
  const [formName, setFormName] = useState("");
  const [formNameAr, setFormNameAr] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formProductType, setFormProductType] = useState<"simple" | "bundle">("simple");
  const [formDescription, setFormDescription] = useState("");
  const [formDescriptionAr, setFormDescriptionAr] = useState("");
  const [formUnitPrice, setFormUnitPrice] = useState("");
  const [formCostPrice, setFormCostPrice] = useState("");
  const [formStock, setFormStock] = useState("");
  const [formMinStock, setFormMinStock] = useState("");
  const [formMaxStock, setFormMaxStock] = useState("");
  const [formUnit, setFormUnit] = useState("");
  const [formSupplier, setFormSupplier] = useState("");
  const [formLocation, setFormLocation] = useState("");
  const [formBarcode, setFormBarcode] = useState("");
  const [formTaxable, setFormTaxable] = useState("yes");
  const [formWeight, setFormWeight] = useState("");
  const [formDimensions, setFormDimensions] = useState("");
  const [formExpiryDate, setFormExpiryDate] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formImage, setFormImage] = useState<string | null>(null);
  const [formImageFile, setFormImageFile] = useState<File | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);

  const categoryOptions = useMemo(() => {
    const set = new Set<string>();
    CATEGORY_ALLOW_LIST.forEach((cat) => set.add(cat));
    inventory
      .map((item) => (item.category ?? "").trim())
      .filter((cat) => cat.length > 0)
      .forEach((cat) => set.add(cat));
    return Array.from(set);
  }, [inventory]);

  useEffect(() => {
    if (!editingItem && categoryOptions.length > 0 && !formCategory) {
      setFormCategory(categoryOptions[0]);
    }
  }, [categoryOptions, editingItem, formCategory]);

  const filteredInventory = inventory.filter(item => {
    const matchesSearch = 
      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.nameAr.includes(searchQuery) ||
      item.sku.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.barcode?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = categoryFilter === "all" || item.category === categoryFilter;
    const matchesStatus = statusFilter === "all" || item.status === statusFilter;
    
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const stats = {
    totalItems: inventory.length,
    inStock: inventory.filter(i => i.status === "in-stock").length,
    lowStock: inventory.filter(i => i.status === "low-stock").length,
    outOfStock: inventory.filter(i => i.status === "out-of-stock").length,
    totalValue: inventory.reduce((sum, item) => sum + (item.stock * item.costPrice), 0),
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredInventory.map((item) => ({
        "SKU": item.sku,
        "Product Name (EN)": item.name,
        "Product Name (AR)": item.nameAr,
        "Category": item.category,
        "Product Type": item.productType,
        "Description": item.description,
        "Description (AR)": item.descriptionAr,
        "Unit Price (SAR)": item.unitPrice,
        "Cost Price (SAR)": item.costPrice,
        "Stock": item.stock,
        "Min Stock": item.minStock,
        "Max Stock": item.maxStock,
        "Unit": item.unit,
        "Status": item.status,
        "Supplier": item.supplier || "",
        "Location": item.location || "",
        "Barcode": item.barcode || "",
        "Taxable": item.taxable ? "Yes" : "No",
        "Weight": item.weight || "",
        "Dimensions": item.dimensions || "",
        "Expiry Date": item.expiryDate || "",
        "Created Date": item.createdDate,
        "Last Updated": item.lastUpdated,
        "Notes": item.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 12 }, { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 12 },
        { wch: 30 }, { wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 10 },
        { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 12 }, { wch: 20 },
        { wch: 20 }, { wch: 15 }, { wch: 8 }, { wch: 10 }, { wch: 15 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Inventory");
      const fileName = `inventory_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  const resetForm = () => {
    setFormSku("");
    setFormName("");
    setFormNameAr("");
    setFormCategory(categoryOptions[0] ?? "General");
    setFormProductType("simple");
    setFormDescription("");
    setFormDescriptionAr("");
    setFormUnitPrice("");
    setFormCostPrice("");
    setFormStock("");
    setFormMinStock("");
    setFormMaxStock("");
    setFormUnit("");
    setFormSupplier("");
    setFormLocation("");
    setFormBarcode("");
    setFormTaxable("yes");
    setFormWeight("");
    setFormDimensions("");
    setFormExpiryDate("");
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

  const openEditDialog = (item: InventoryItem) => {
    setEditingItem(item);
    setFormSku(item.sku);
    setFormName(item.name);
    setFormNameAr(item.nameAr);
    setFormCategory(item.category ?? categoryOptions[0] ?? "General");
    setFormProductType(item.productType);
    setFormDescription(item.description);
    setFormDescriptionAr(item.descriptionAr);
    setFormUnitPrice(item.unitPrice.toString());
    setFormCostPrice(item.costPrice.toString());
    setFormStock(item.stock.toString());
    setFormMinStock(item.minStock.toString());
    setFormMaxStock(item.maxStock.toString());
    setFormUnit(item.unit);
    setFormSupplier(item.supplier || "");
    setFormLocation(item.location || "");
    setFormBarcode(item.barcode || "");
    setFormTaxable(item.taxable ? "yes" : "no");
    setFormWeight(item.weight?.toString() || "");
    setFormDimensions(item.dimensions || "");
    setFormExpiryDate(item.expiryDate || "");
    setFormNotes(item.notes || "");
    setFormImage(item.image || null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    const normalizedCategory = formCategory.trim();

    if (
      !formSku ||
      !formName ||
      !formNameAr ||
      !normalizedCategory ||
      !formUnitPrice ||
      !formCostPrice ||
      !formStock ||
      !formMinStock ||
      !formUnit
    ) {
      toast.error("Please fill all required fields");
      return;
    }

    const stock = parseInt(formStock);
    const minStock = parseInt(formMinStock);
    const status: "in-stock" | "low-stock" | "out-of-stock" = 
      stock === 0 ? "out-of-stock" : 
      stock <= minStock ? "low-stock" : "in-stock";

    let imageUrl = formImage; // Keep existing image URL if no new file

    // Upload new image if provided
    if (formImageFile) {
      setUploadingImage(true);
      try {
        // Get current user ID
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

        // Get product code (for existing items) or generate temp ID
        const productCode = editingItem 
          ? dbInventory[editingItem.id - 1]?.product_code 
          : null;
        
        if (!productCode && !editingItem) {
          // For new items, we'll upload after creation
          // For now, just show preview
          imageUrl = formImage;
        } else if (productCode) {
          // Upload to storage
          const uploadResult = await uploadFile({
            file: formImageFile,
            category: FILE_CATEGORIES.INVENTORY_IMAGE,
            ownerId: productCode,
            ownerType: 'inventory',
            description: `Product image for ${formName}`,
            userId: currentUserId || undefined,
            metadata: {
              product_code: productCode, // Store product code in metadata for precise deletion
              product_name: formName,
            },
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
            imageUrl = formImage; // Fallback to preview
          }
        }
      } catch (error: any) {
        console.error('Error uploading image:', error);
        toast.error(error.message || 'Failed to upload image');
        imageUrl = formImage; // Fallback to preview
      } finally {
        setUploadingImage(false);
      }
    }

    const itemData = {
      sku: formSku,
      name: formName,
      nameAr: formNameAr,
      category: normalizedCategory,
      productType: formProductType,
      description: formDescription,
      descriptionAr: formDescriptionAr,
      image: imageUrl || undefined,
      unitPrice: parseFloat(formUnitPrice),
      costPrice: parseFloat(formCostPrice),
      stock: stock,
      minStock: minStock,
      maxStock: parseInt(formMaxStock) || minStock * 10,
      unit: formUnit,
      status: status,
      supplier: formSupplier || undefined,
      location: formLocation || undefined,
      barcode: formBarcode || undefined,
      taxable: formTaxable === "yes",
      weight: formWeight ? parseFloat(formWeight) : undefined,
      dimensions: formDimensions || undefined,
      expiryDate: formExpiryDate || undefined,
      notes: formNotes || undefined,
      lastUpdated: new Date().toISOString().split('T')[0],
    };

    const values: any = {
      en_prod_name: itemData.name,
      ar_prod_name: itemData.nameAr,
      category: itemData.category,
      measuring_unit: itemData.unit,
      prod_en_description: itemData.description,
      prod_ar_description: itemData.descriptionAr,
      prod_img: itemData.image ?? null,
      prod_selling_price: itemData.unitPrice,
      prod_cost_price: itemData.costPrice,
      current_stock: itemData.stock,
      minimum_stock_alert: itemData.minStock,
      prod_status: itemData.status,
      prod_supplier: itemData.supplier ?? null,
    };
    try {
      if (editingItem) {
        const target = dbInventory[editingItem.id - 1];
        const id = target?.product_code as string | undefined;
        if (!id) return;
        
        // If we uploaded a new image, reload images
        if (formImageFile && imageUrl) {
          setInventoryImages(prev => ({
            ...prev,
            [id]: imageUrl || ''
          }));
        }
        
        await dispatch(thunks.inventory.updateOne({ id, values })).unwrap();
        toast.success("Product updated successfully!");
      } else {
        // Create new item first
        const created = await dispatch(thunks.inventory.createOne(values)).unwrap();
        const productCode = created?.product_code;
        
        // Upload image after creation if we have one
        if (formImageFile && productCode) {
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
              category: FILE_CATEGORIES.INVENTORY_IMAGE,
              ownerId: productCode,
              ownerType: 'inventory',
              description: `Product image for ${formName}`,
              userId: currentUserId || undefined,
              metadata: {
                product_code: productCode, // Store product code in metadata for precise deletion
                product_name: formName,
              },
            });

            if (uploadResult.success && uploadResult.fileMetadata) {
              const uploadedUrl = uploadResult.publicUrl || uploadResult.signedUrl || 
                (await getFileUrl(
                  uploadResult.fileMetadata.bucket as any,
                  uploadResult.fileMetadata.path,
                  uploadResult.fileMetadata.is_public
                ));
              
              if (uploadedUrl) {
                // Update the product with the uploaded image URL
                await dispatch(thunks.inventory.updateOne({
                  id: productCode,
                  values: { prod_img: uploadedUrl }
                })).unwrap();
                
                // Update local image map
                setInventoryImages(prev => ({
                  ...prev,
                  [productCode]: uploadedUrl
                }));
              }
            }
          } catch (error: any) {
            console.error('Error uploading image after creation:', error);
            // Don't fail the whole operation if image upload fails
          }
        }
        
        toast.success("Product added successfully!");
      }
    } catch (error: any) {
      toast.error(error.message || (editingItem ? 'Failed to update product' : 'Failed to add product'));
      return;
    }

    setIsDialogOpen(false);
    resetForm();
  };

  const handleDelete = async (id: number) => {
    const target = dbInventory[id - 1];
    const product_code = target?.product_code as string | undefined;
    if (!product_code) return;
    
    if (confirm('Are you sure you want to delete this product? This will also delete associated images.')) {
      try {
        // Delete associated files from storage (both S3 and Supabase) - only for this specific product
        const { deleted, errors } = await deleteFilesByRecord(product_code, 'inventory', FILE_CATEGORIES.INVENTORY_IMAGE);
        
        if (errors.length > 0) {
          console.warn('Some files could not be deleted:', errors);
        }
        
        if (deleted > 0) {
          console.log(`Deleted ${deleted} associated files for product ${product_code}`);
        }
        
        // Then delete the inventory item
        await dispatch(thunks.inventory.deleteOne(product_code)).unwrap();
        toast.success('Product and associated images deleted successfully!');
      } catch (e: any) {
        toast.error(e.message || 'Failed to delete product');
      }
    }
  };

  const openViewDialog = (item: InventoryItem) => {
    setSelectedItem(item);
    setIsViewDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2>Inventory Management</h2>
          <p className="text-muted-foreground mt-1">Manage your products and stock levels</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={openAddDialog} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="h-4 w-4" />
            Add Product
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
            <p className="text-xs text-muted-foreground mt-1">Products in system</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Stock</CardTitle>
            <Package className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.inStock}</div>
            <p className="text-xs text-muted-foreground mt-1">Available products</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Low Stock</CardTitle>
            <Package className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-yellow-600">{stats.lowStock}</div>
            <p className="text-xs text-muted-foreground mt-1">Need reorder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Out of Stock</CardTitle>
            <Package className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.outOfStock}</div>
            <p className="text-xs text-muted-foreground mt-1">Urgent reorder</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            <DollarSign className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {stats.totalValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">SAR - Inventory value</p>
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
                placeholder="Search by name, SKU, or barcode..."
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
                {categoryOptions.map(cat => (
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
                <SelectItem value="in-stock">In Stock</SelectItem>
                <SelectItem value="low-stock">Low Stock</SelectItem>
                <SelectItem value="out-of-stock">Out of Stock</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Inventory Table */}
      <Card>
        <CardContent className="pt-6">
          {loading && <div>Loading products...</div>}
          {loadError && <div className="text-red-500">{loadError}</div>}
          {filteredInventory.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <Package className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No products found</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Image</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product Name</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Stock</TableHead>
                    <TableHead>Unit Price</TableHead>
                    <TableHead>Cost Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredInventory.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        {item.image ? (
                          <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted flex items-center justify-center">
                            <img 
                              src={item.image} 
                              alt={item.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center">
                            <Package className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{item.sku}</TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.name}</p>
                          <p className="text-sm text-muted-foreground">{item.nameAr}</p>
                        </div>
                      </TableCell>
                      <TableCell>{item.category}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="gap-1">
                          {item.productType === "bundle" ? <Boxes className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                          {item.productType === "bundle" ? "Bundle" : "Simple"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div>
                          <p className="font-medium">{item.stock} {item.unit}</p>
                          <p className="text-xs text-muted-foreground">Min: {item.minStock}</p>
                        </div>
                      </TableCell>
                      <TableCell>SAR {item.unitPrice.toFixed(2)}</TableCell>
                      <TableCell>SAR {item.costPrice.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(item.status)}>
                          {item.status.replace("-", " ")}
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
                          <Button size="sm" variant="outline" onClick={() => handleDelete(item.id)}>
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
            <DialogTitle>{editingItem ? "Edit Product" : "Add New Product"}</DialogTitle>
            <DialogDescription>
              {editingItem ? "Update product information" : "Add a new product to inventory"}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="basic" className="mt-4">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="basic">Basic Info</TabsTrigger>
              <TabsTrigger value="pricing">Pricing & Stock</TabsTrigger>
              <TabsTrigger value="additional">Additional Info</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="sku">SKU *</Label>
                  <Input
                    id="sku"
                    value={formSku}
                    onChange={(e) => setFormSku(e.target.value)}
                    placeholder="PRD-001"
                  />
                </div>

                <div>
                  <Label htmlFor="productType">Product Type *</Label>
                  <Select value={formProductType} onValueChange={(value: any) => setFormProductType(value)}>
                    <SelectTrigger id="productType">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="simple">Simple Product</SelectItem>
                      <SelectItem value="bundle">Bundle/Kit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="name">Product Name (English) *</Label>
                  <Input
                    id="name"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="Lavender Essential Oil"
                  />
                </div>

                <div>
                  <Label htmlFor="nameAr">Product Name (Arabic) *</Label>
                  <Input
                    id="nameAr"
                    value={formNameAr}
                    onChange={(e) => setFormNameAr(e.target.value)}
                    placeholder="زيت اللافندر"
                    dir="rtl"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="category">Category *</Label>
                  <Select value={formCategory} onValueChange={setFormCategory}>
                    <SelectTrigger id="category">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categoryOptions.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Label htmlFor="description">Description (English)</Label>
                  <Textarea
                    id="description"
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    placeholder="Product description in English"
                    rows={3}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="descriptionAr">Description (Arabic)</Label>
                  <Textarea
                    id="descriptionAr"
                    value={formDescriptionAr}
                    onChange={(e) => setFormDescriptionAr(e.target.value)}
                    placeholder="وصف المنتج بالعربية"
                    rows={3}
                    dir="rtl"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="image">Product Image</Label>
                  <div className="mt-2">
                    {formImage ? (
                      <div className="relative inline-block">
                        <img 
                          src={formImage} 
                          alt="Product" 
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
                      <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                        <p className="text-sm text-muted-foreground mb-2">Upload product image</p>
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

            <TabsContent value="pricing" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="unitPrice">Unit Price (SAR) *</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    step="0.01"
                    value={formUnitPrice}
                    onChange={(e) => setFormUnitPrice(e.target.value)}
                    placeholder="150.00"
                  />
                </div>

                <div>
                  <Label htmlFor="costPrice">Cost Price (SAR) *</Label>
                  <Input
                    id="costPrice"
                    type="number"
                    step="0.01"
                    value={formCostPrice}
                    onChange={(e) => setFormCostPrice(e.target.value)}
                    placeholder="95.00"
                  />
                </div>

                <div>
                  <Label htmlFor="stock">Current Stock *</Label>
                  <Input
                    id="stock"
                    type="number"
                    value={formStock}
                    onChange={(e) => setFormStock(e.target.value)}
                    placeholder="45"
                  />
                </div>

                <div>
                  <Label htmlFor="unit">Unit *</Label>
                  <Select value={formUnit} onValueChange={setFormUnit}>
                    <SelectTrigger id="unit">
                      <SelectValue placeholder="Select unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="bottle">Bottle</SelectItem>
                      <SelectItem value="box">Box</SelectItem>
                      <SelectItem value="piece">Piece</SelectItem>
                      <SelectItem value="set">Set</SelectItem>
                      <SelectItem value="kg">Kilogram</SelectItem>
                      <SelectItem value="liter">Liter</SelectItem>
                      <SelectItem value="pack">Pack</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="minStock">Minimum Stock *</Label>
                  <Input
                    id="minStock"
                    type="number"
                    value={formMinStock}
                    onChange={(e) => setFormMinStock(e.target.value)}
                    placeholder="10"
                  />
                </div>

                <div>
                  <Label htmlFor="maxStock">Maximum Stock</Label>
                  <Input
                    id="maxStock"
                    type="number"
                    value={formMaxStock}
                    onChange={(e) => setFormMaxStock(e.target.value)}
                    placeholder="100"
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="taxable">Taxable</Label>
                  <Select value={formTaxable} onValueChange={setFormTaxable}>
                    <SelectTrigger id="taxable">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yes">Yes (Subject to VAT)</SelectItem>
                      <SelectItem value="no">No (VAT Exempt)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {formUnitPrice && formCostPrice && (
                  <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Profit Margin</p>
                        <p className="font-semibold text-blue-700">
                          SAR {(parseFloat(formUnitPrice) - parseFloat(formCostPrice)).toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Margin %</p>
                        <p className="font-semibold text-blue-700">
                          {(((parseFloat(formUnitPrice) - parseFloat(formCostPrice)) / parseFloat(formUnitPrice)) * 100).toFixed(1)}%
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="additional" className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input
                    id="supplier"
                    value={formSupplier}
                    onChange={(e) => setFormSupplier(e.target.value)}
                    placeholder="Supplier name"
                  />
                </div>

                <div>
                  <Label htmlFor="location">Storage Location</Label>
                  <Input
                    id="location"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Warehouse A - Shelf 12"
                  />
                </div>

                <div>
                  <Label htmlFor="barcode">Barcode</Label>
                  <Input
                    id="barcode"
                    value={formBarcode}
                    onChange={(e) => setFormBarcode(e.target.value)}
                    placeholder="8901234567890"
                  />
                </div>

                <div>
                  <Label htmlFor="weight">Weight (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.01"
                    value={formWeight}
                    onChange={(e) => setFormWeight(e.target.value)}
                    placeholder="0.6"
                  />
                </div>

                <div>
                  <Label htmlFor="dimensions">Dimensions</Label>
                  <Input
                    id="dimensions"
                    value={formDimensions}
                    onChange={(e) => setFormDimensions(e.target.value)}
                    placeholder="10x10x15 cm"
                  />
                </div>

                <div>
                  <Label htmlFor="expiryDate">Expiry Date</Label>
                  <Input
                    id="expiryDate"
                    type="date"
                    value={formExpiryDate}
                    onChange={(e) => setFormExpiryDate(e.target.value)}
                  />
                </div>

                <div className="col-span-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea
                    id="notes"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Additional notes about this product"
                    rows={3}
                  />
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-3 pt-4 border-t mt-6">
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 text-white" disabled={uploadingImage}>
              {uploadingImage ? "Uploading..." : editingItem ? "Update Product" : "Add Product"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Product Details</DialogTitle>
            <DialogDescription>Complete information about this product</DialogDescription>
          </DialogHeader>

          {selectedItem && (
            <div className="space-y-6 py-4">
              {/* Image and Basic Info */}
              <div className="flex gap-6">
                <div className="w-40 h-40 rounded-lg overflow-hidden bg-muted flex items-center justify-center flex-shrink-0">
                  {selectedItem.image ? (
                    <img 
                      src={selectedItem.image} 
                      alt={selectedItem.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Package className="h-16 w-16 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Badge className={getStatusColor(selectedItem.status)}>
                        {selectedItem.status.replace("-", " ")}
                      </Badge>
                      <Badge variant="outline" className="gap-1">
                        {selectedItem.productType === "bundle" ? <Boxes className="h-3 w-3" /> : <Package className="h-3 w-3" />}
                        {selectedItem.productType === "bundle" ? "Bundle" : "Simple"}
                      </Badge>
                    </div>
                    <h3 className="text-2xl font-bold">{selectedItem.name}</h3>
                    <p className="text-lg text-muted-foreground" dir="rtl">{selectedItem.nameAr}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <Label className="text-muted-foreground">SKU</Label>
                      <p className="font-mono">{selectedItem.sku}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Category</Label>
                      <p>{selectedItem.category}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pricing and Stock */}
              <div className="grid grid-cols-4 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Unit Price</p>
                    <p className="text-2xl font-bold">SAR {selectedItem.unitPrice.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Cost Price</p>
                    <p className="text-2xl font-bold">SAR {selectedItem.costPrice.toFixed(2)}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Current Stock</p>
                    <p className="text-2xl font-bold">{selectedItem.stock} {selectedItem.unit}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">Stock Value</p>
                    <p className="text-2xl font-bold">
                      {(selectedItem.stock * selectedItem.costPrice).toFixed(0)}
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Details */}
              <div className="grid grid-cols-2 gap-6">
                <div className="space-y-3">
                  <h4 className="font-semibold">Product Information</h4>
                  <div className="space-y-2 text-sm">
                    {selectedItem.description && (
                      <div>
                        <Label className="text-muted-foreground">Description (EN)</Label>
                        <p>{selectedItem.description}</p>
                      </div>
                    )}
                    {selectedItem.descriptionAr && (
                      <div>
                        <Label className="text-muted-foreground">Description (AR)</Label>
                        <p dir="rtl">{selectedItem.descriptionAr}</p>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-muted-foreground">Min Stock</Label>
                        <p>{selectedItem.minStock} {selectedItem.unit}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Max Stock</Label>
                        <p>{selectedItem.maxStock} {selectedItem.unit}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="font-semibold">Additional Details</h4>
                  <div className="space-y-2 text-sm">
                    {selectedItem.supplier && (
                      <div>
                        <Label className="text-muted-foreground">Supplier</Label>
                        <p>{selectedItem.supplier}</p>
                      </div>
                    )}
                    {selectedItem.location && (
                      <div>
                        <Label className="text-muted-foreground">Location</Label>
                        <p>{selectedItem.location}</p>
                      </div>
                    )}
                    {selectedItem.barcode && (
                      <div>
                        <Label className="text-muted-foreground">Barcode</Label>
                        <p className="font-mono">{selectedItem.barcode}</p>
                      </div>
                    )}
                    {selectedItem.weight && (
                      <div>
                        <Label className="text-muted-foreground">Weight</Label>
                        <p>{selectedItem.weight} kg</p>
                      </div>
                    )}
                    {selectedItem.dimensions && (
                      <div>
                        <Label className="text-muted-foreground">Dimensions</Label>
                        <p>{selectedItem.dimensions}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground">Taxable</Label>
                      <p>{selectedItem.taxable ? "Yes (VAT applicable)" : "No (VAT exempt)"}</p>
                    </div>
                  </div>
                </div>
              </div>

              {selectedItem.notes && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{selectedItem.notes}</p>
                </div>
              )}

              <div className="flex justify-between items-center text-xs text-muted-foreground pt-4 border-t">
                <span>Created: {new Date(selectedItem.createdDate).toLocaleDateString('en-GB')}</span>
                <span>Last Updated: {new Date(selectedItem.lastUpdated).toLocaleDateString('en-GB')}</span>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => {
                  setIsViewDialogOpen(false);
                  openEditDialog(selectedItem);
                }}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Product
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
