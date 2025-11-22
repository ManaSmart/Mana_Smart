import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Search, Package, DollarSign, Factory, ShoppingCart, CheckCircle, Clock, XCircle, Calculator, FileText, Trash2, Edit, Eye, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { ManufacturingRawMaterials } from "../../supabase/models/manufacturing_raw_materials";
import type { ManufacturingRecipes } from "../../supabase/models/manufacturing_recipes";
import type { ManufacturingOrders } from "../../supabase/models/manufacturing_orders";

// Types
type UUID = string;

interface RawMaterial {
  id: UUID;
  nameEn: string;
  nameAr: string;
  sku: string;
  unit: string;
  costPerUnit: number;
  currentStock: number;
  minStock: number;
  category: string;
}

interface RecipeItem {
  materialId: UUID;
  materialName: string;
  quantity: number;
  unit: string;
  costPerUnit: number;
  totalCost: number;
}

interface ManufacturingRecipe {
  id: string;
  productNameEn: string;
  productNameAr: string;
  productSku: string;
  outputQuantity: number;
  outputUnit: string;
  items: RecipeItem[];
  laborCost: number;
  overheadCost: number;
  totalMaterialCost: number;
  totalCost: number;
  costPerUnit: number;
  notes: string;
  createdDate: string;
}

interface ManufacturingOrder {
  id: UUID;
  orderNumber: string;
  recipeId: string;
  recipeName: string;
  productSku: string;
  batchSize: number;
  status: "pending" | "in-progress" | "completed" | "cancelled";
  startDate: string;
  completionDate?: string;
  totalCost: number;
  notes: string;
  createdBy: string;
}

export function Manufacturing() {
  const dispatch = useAppDispatch();
  const [activeTab, setActiveTab] = useState("orders");

  const materialsState = useAppSelector(selectors.manufacturing_raw_materials.selectAll) as ManufacturingRawMaterials[];
  const materialsLoading = useAppSelector(selectors.manufacturing_raw_materials.selectLoading);
  const materialsError = useAppSelector(selectors.manufacturing_raw_materials.selectError);

  const recipesState = useAppSelector(selectors.manufacturing_recipes.selectAll) as ManufacturingRecipes[];
  const recipesLoading = useAppSelector(selectors.manufacturing_recipes.selectLoading);
  const recipesError = useAppSelector(selectors.manufacturing_recipes.selectError);

  const ordersState = useAppSelector(selectors.manufacturing_orders.selectAll) as ManufacturingOrders[];
  const ordersLoading = useAppSelector(selectors.manufacturing_orders.selectLoading);
  const ordersError = useAppSelector(selectors.manufacturing_orders.selectError);

  useEffect(() => {
    dispatch(thunks.manufacturing_raw_materials.fetchAll(undefined));
    dispatch(thunks.manufacturing_recipes.fetchAll(undefined));
    dispatch(thunks.manufacturing_orders.fetchAll(undefined));
  }, [dispatch]);

  const rawMaterials = useMemo<RawMaterial[]>(() => {
    return materialsState.map((material) => ({
      id: material.material_id,
      nameEn: material.material_en_name ?? "",
      nameAr: material.material_ar_name ?? "",
      sku: material.material_sku ?? "",
      unit: material.unit ?? "",
      costPerUnit: Number(material.cost_per_unit ?? 0),
      currentStock: Number(material.current_stock ?? 0),
      minStock: Number(material.min_stock ?? 0),
      category: material.category ?? ""
    }));
  }, [materialsState]);

  const materialLookup = useMemo(() => {
    const map = new Map<string, RawMaterial>();
    rawMaterials.forEach((material) => map.set(material.id, material));
    return map;
  }, [rawMaterials]);

  const parseRecipeItems = useCallback((rawItems: unknown): RecipeItem[] => {
    let normalized: any[] = [];
    if (Array.isArray(rawItems)) {
      normalized = rawItems;
    } else if (typeof rawItems === "string") {
      try {
        const parsed = JSON.parse(rawItems);
        if (Array.isArray(parsed)) {
          normalized = parsed;
        }
      } catch {
        normalized = [];
      }
    } else if (rawItems && typeof rawItems === "object") {
      normalized = Object.values(rawItems as Record<string, unknown>);
    }

    return normalized.flatMap((item: any) => {
      const id = item?.material_id ?? item?.materialId ?? item?.id;
      if (!id) return [];
      const materialInfo = materialLookup.get(id);
      const quantity = Number(item?.quantity ?? 0);
      const costPerUnit = Number(item?.cost_per_unit ?? materialInfo?.costPerUnit ?? 0);
      const unit = item?.unit ?? materialInfo?.unit ?? "";
      const name =
        item?.material_en_name ??
        item?.material_name ??
        item?.materialName ??
        materialInfo?.nameEn ??
        "";
      return [
        {
          materialId: id,
          materialName: name,
          quantity,
          unit,
          costPerUnit,
          totalCost: Number(item?.total_cost ?? quantity * costPerUnit)
        }
      ];
    });
  }, [materialLookup]);

  const recipes = useMemo<ManufacturingRecipe[]>(() => {
    return recipesState.map((recipe) => ({
      id: recipe.recipe_sku,
      productNameEn: recipe.recipe_en_name ?? "",
      productNameAr: recipe.recipe_ar_name ?? "",
      productSku: recipe.recipe_sku,
      outputQuantity: Number(recipe.prod_output_quantity ?? 0),
      outputUnit: recipe.prod_output_unit ?? "",
      items: parseRecipeItems(recipe.raw_materials_used),
      laborCost: Number(recipe.mfg_labour_cost ?? 0),
      overheadCost: Number(recipe.mfg_overhead_cost ?? 0),
      totalMaterialCost: Number(recipe.total_material_cost ?? 0),
      totalCost: Number(recipe.total_cost ?? 0),
      costPerUnit: Number(recipe.cost_per_unit ?? 0),
      notes: recipe.recipe_notes ?? "",
      createdDate: recipe.created_at ?? ""
    }));
  }, [parseRecipeItems, recipesState]);

  const recipeLookupBySku = useMemo(() => {
    const map = new Map<string, ManufacturingRecipe>();
    recipes.forEach((recipe) => map.set(recipe.productSku, recipe));
    return map;
  }, [recipes]);

  const orders = useMemo<ManufacturingOrder[]>(() => {
    return ordersState.map((order) => {
      const relatedRecipe = order.recipe_sku ? recipeLookupBySku.get(order.recipe_sku) : undefined;
      const orderNumber =
        order.order_number ??
        (order.mfg_order_id ? `MO-${order.mfg_order_id.slice(0, 8).toUpperCase()}` : "");

      return {
        id: order.mfg_order_id,
        orderNumber,
        recipeId: order.recipe_sku ?? "",
        recipeName: relatedRecipe?.productNameEn ?? order.recipe_sku ?? "",
        productSku: relatedRecipe?.productSku ?? order.recipe_sku ?? "",
        batchSize: Number(order.mfg_order_batch_size ?? 0),
        status: (order.mfg_order_status ?? "pending") as ManufacturingOrder["status"],
        startDate: order.mfg_order_start_date ?? "",
        completionDate: order.mfg_order_completion_date ?? undefined,
        totalCost: Number(order.mfg_order_total_cost ?? 0),
        notes: order.mfg_order_notes ?? "",
        createdBy: order.created_by ?? ""
      };
    });
  }, [ordersState, recipeLookupBySku]);

  // Raw Materials State
  const [isMaterialDialogOpen, setIsMaterialDialogOpen] = useState(false);
  const [editingMaterialId, setEditingMaterialId] = useState<string | null>(null);
  const [materialSearchQuery, setMaterialSearchQuery] = useState("");
  const [materialForm, setMaterialForm] = useState({
    nameEn: "",
    nameAr: "",
    sku: "",
    unit: "ml",
    costPerUnit: "",
    currentStock: "",
    minStock: "",
    category: ""
  });
  const [isMaterialSubmitting, setIsMaterialSubmitting] = useState(false);

  // Recipes State
  const [isRecipeDialogOpen, setIsRecipeDialogOpen] = useState(false);
  const [viewRecipeSku, setViewRecipeSku] = useState<string | null>(null);
  const selectedRecipe = useMemo(
    () => (viewRecipeSku ? recipes.find((recipe) => recipe.productSku === viewRecipeSku) ?? null : null),
    [recipes, viewRecipeSku]
  );
  const [isViewRecipeDialogOpen, setIsViewRecipeDialogOpen] = useState(false);
  const [editingRecipeSku, setEditingRecipeSku] = useState<string | null>(null);
  const [recipeSearchQuery, setRecipeSearchQuery] = useState("");
  const [recipeForm, setRecipeForm] = useState({
    productNameEn: "",
    productNameAr: "",
    productSku: "",
    outputQuantity: "",
    outputUnit: "piece",
    laborCost: "",
    overheadCost: "",
    notes: ""
  });
  const [recipeItems, setRecipeItems] = useState<RecipeItem[]>([]);
  const [currentItem, setCurrentItem] = useState({
    materialId: "",
    quantity: ""
  });
  const [isRecipeSubmitting, setIsRecipeSubmitting] = useState(false);

  // Manufacturing Orders State
  const [isOrderDialogOpen, setIsOrderDialogOpen] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null);
  const [orderSearchQuery, setOrderSearchQuery] = useState("");
  const [orderStatusFilter, setOrderStatusFilter] = useState("all");
  const [orderForm, setOrderForm] = useState({
    recipeId: "",
    batchSize: "",
    startDate: new Date().toISOString().split('T')[0],
    notes: "",
    createdBy: ""
  });
  const [isOrderSubmitting, setIsOrderSubmitting] = useState(false);

  const isAnyLoading = materialsLoading || recipesLoading || ordersLoading;
  const dataErrors = useMemo(() => {
    const errors: string[] = [];
    if (materialsError) errors.push(`Materials: ${materialsError}`);
    if (recipesError) errors.push(`Recipes: ${recipesError}`);
    if (ordersError) errors.push(`Orders: ${ordersError}`);
    return errors;
  }, [materialsError, ordersError, recipesError]);

  // Raw Material Functions
  const handleSaveMaterial = async () => {
    const nameEn = materialForm.nameEn.trim();
    const sku = materialForm.sku.trim();
    if (!nameEn || !sku || !materialForm.costPerUnit) {
      toast.error("Please fill in all required fields");
      return;
    }

    const nameAr = materialForm.nameAr.trim();
    const category = materialForm.category.trim();

    const payload = {
      material_en_name: nameEn,
      material_ar_name: nameAr || null,
      material_sku: sku,
      unit: materialForm.unit,
      cost_per_unit: parseFloat(materialForm.costPerUnit),
      current_stock: parseFloat(materialForm.currentStock || "0"),
      min_stock: parseFloat(materialForm.minStock || "0"),
      category: category || null
    };

    setIsMaterialSubmitting(true);
    try {
      if (editingMaterialId) {
        await dispatch(
          thunks.manufacturing_raw_materials.updateOne({
            id: editingMaterialId,
            values: payload
          })
        ).unwrap();
        toast.success("Raw material updated successfully!");
      } else {
        await dispatch(thunks.manufacturing_raw_materials.createOne(payload)).unwrap();
        toast.success("Raw material added successfully!");
      }
      setIsMaterialDialogOpen(false);
      resetMaterialForm();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save raw material");
    } finally {
      setIsMaterialSubmitting(false);
    }
  };

  const resetMaterialForm = () => {
    setMaterialForm({
      nameEn: "",
      nameAr: "",
      sku: "",
      unit: "ml",
      costPerUnit: "",
      currentStock: "",
      minStock: "",
      category: ""
    });
    setEditingMaterialId(null);
  };

  const openCreateMaterialDialog = () => {
    resetMaterialForm();
    setIsMaterialDialogOpen(true);
  };

  const handleEditMaterial = (material: RawMaterial) => {
    setEditingMaterialId(material.id);
    setMaterialForm({
      nameEn: material.nameEn,
      nameAr: material.nameAr,
      sku: material.sku,
      unit: material.unit,
      costPerUnit: material.costPerUnit.toString(),
      currentStock: material.currentStock.toString(),
      minStock: material.minStock.toString(),
      category: material.category
    });
    setIsMaterialDialogOpen(true);
  };

  const handleDeleteMaterial = async (materialId: string) => {
    if (!materialId) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this raw material?");
    if (!confirmDelete) return;

    setIsMaterialSubmitting(true);
    try {
      await dispatch(thunks.manufacturing_raw_materials.deleteOne(materialId)).unwrap();
      toast.success("Raw material deleted successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete raw material");
    } finally {
      setIsMaterialSubmitting(false);
    }
  };

  // Recipe Functions
  const handleAddItemToRecipe = () => {
    if (!currentItem.materialId || !currentItem.quantity) {
      toast.error("Please select material and enter quantity");
      return;
    }

    const material = materialLookup.get(currentItem.materialId);
    if (!material) {
      toast.error("Selected material not found");
      return;
    }

    const quantity = parseFloat(currentItem.quantity);
    if (Number.isNaN(quantity) || quantity <= 0) {
      toast.error("Quantity must be greater than zero");
      return;
    }
    const totalCost = quantity * material.costPerUnit;

    const newItem: RecipeItem = {
      materialId: material.id,
      materialName: material.nameEn,
      quantity: quantity,
      unit: material.unit,
      costPerUnit: material.costPerUnit,
      totalCost: totalCost
    };

    setRecipeItems([...recipeItems, newItem]);
    setCurrentItem({ materialId: "", quantity: "" });
    toast.success("Item added to recipe!");
  };

  const handleRemoveItemFromRecipe = (index: number) => {
    setRecipeItems(recipeItems.filter((_, i) => i !== index));
  };

  const calculateRecipeCosts = () => {
    const totalMaterialCost = recipeItems.reduce((sum, item) => sum + item.totalCost, 0);
    const laborCost = parseFloat(recipeForm.laborCost || "0");
    const overheadCost = parseFloat(recipeForm.overheadCost || "0");
    const totalCost = totalMaterialCost + laborCost + overheadCost;
    const outputQty = parseFloat(recipeForm.outputQuantity || "1");
    const costPerUnit = totalCost / outputQty;

    return {
      totalMaterialCost,
      laborCost,
      overheadCost,
      totalCost,
      costPerUnit
    };
  };

  const handleSaveRecipe = async () => {
    const productNameEn = recipeForm.productNameEn.trim();
    const productSku = recipeForm.productSku.trim();
    if (!productNameEn || !productSku || recipeItems.length === 0) {
      toast.error("Please fill in product details and add at least one material");
      return;
    }

    const costs = calculateRecipeCosts();
    const outputQty = parseFloat(recipeForm.outputQuantity || "1");
    if (Number.isNaN(outputQty) || outputQty <= 0) {
      toast.error("Output quantity must be greater than zero");
      return;
    }

    const notes = recipeForm.notes.trim();
    const materialsPayload = recipeItems.map((item) => ({
      material_id: item.materialId,
      material_en_name: item.materialName,
      quantity: item.quantity,
      unit: item.unit,
      cost_per_unit: item.costPerUnit,
      total_cost: item.totalCost
    }));

    const payload = {
      recipe_en_name: productNameEn,
      recipe_ar_name: recipeForm.productNameAr.trim() || null,
      recipe_sku: productSku,
      prod_output_quantity: outputQty,
      prod_output_unit: recipeForm.outputUnit,
      mfg_labour_cost: costs.laborCost,
      mfg_overhead_cost: costs.overheadCost,
      total_material_cost: costs.totalMaterialCost,
      total_cost: costs.totalCost,
      cost_per_unit: costs.costPerUnit,
      recipe_notes: notes || null,
      raw_materials_used: materialsPayload
    };

    setIsRecipeSubmitting(true);
    try {
      if (editingRecipeSku) {
        await dispatch(
          thunks.manufacturing_recipes.updateOne({
            id: editingRecipeSku,
            values: { ...payload, recipe_sku: editingRecipeSku }
          })
        ).unwrap();
        toast.success("Manufacturing recipe updated successfully!");
      } else {
        await dispatch(thunks.manufacturing_recipes.createOne(payload)).unwrap();
        toast.success("Manufacturing recipe created successfully!");
      }
      setIsRecipeDialogOpen(false);
      resetRecipeForm();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save recipe");
    } finally {
      setIsRecipeSubmitting(false);
    }
  };

  const resetRecipeForm = () => {
    setRecipeForm({
      productNameEn: "",
      productNameAr: "",
      productSku: "",
      outputQuantity: "",
      outputUnit: "piece",
      laborCost: "",
      overheadCost: "",
      notes: ""
    });
    setRecipeItems([]);
    setCurrentItem({ materialId: "", quantity: "" });
    setEditingRecipeSku(null);
  };

  const openCreateRecipeDialog = () => {
    resetRecipeForm();
    setIsRecipeDialogOpen(true);
  };

  const handleEditRecipe = (recipe: ManufacturingRecipe) => {
    setEditingRecipeSku(recipe.productSku);
    setRecipeForm({
      productNameEn: recipe.productNameEn,
      productNameAr: recipe.productNameAr,
      productSku: recipe.productSku,
      outputQuantity: recipe.outputQuantity ? recipe.outputQuantity.toString() : "",
      outputUnit: recipe.outputUnit,
      laborCost: recipe.laborCost ? recipe.laborCost.toString() : "",
      overheadCost: recipe.overheadCost ? recipe.overheadCost.toString() : "",
      notes: recipe.notes ?? ""
    });
    setRecipeItems(recipe.items.map((item) => ({ ...item })));
    setIsRecipeDialogOpen(true);
  };

  const handleDeleteRecipe = async (recipeSku: string) => {
    if (!recipeSku) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this manufacturing recipe?");
    if (!confirmDelete) return;
    setIsRecipeSubmitting(true);
    try {
      await dispatch(thunks.manufacturing_recipes.deleteOne(recipeSku)).unwrap();
      toast.success("Recipe deleted successfully!");
      if (viewRecipeSku === recipeSku) {
        setIsViewRecipeDialogOpen(false);
        setViewRecipeSku(null);
      }
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete recipe");
    } finally {
      setIsRecipeSubmitting(false);
    }
  };

  // Manufacturing Order Functions
  const handleSaveOrder = async () => {
    if (!orderForm.recipeId || !orderForm.batchSize) {
      toast.error("Please select recipe and enter batch size");
      return;
    }

    const recipe = recipeLookupBySku.get(orderForm.recipeId);
    if (!recipe) {
      toast.error("Unable to find selected recipe");
      return;
    }

    const batchSize = parseFloat(orderForm.batchSize);
    if (Number.isNaN(batchSize) || batchSize <= 0) {
      toast.error("Batch size must be greater than zero");
      return;
    }
    const totalCost = recipe.costPerUnit * batchSize;
    const createdBy = orderForm.createdBy.trim();
    const notes = orderForm.notes.trim();

    const existingOrder = editingOrderId ? orders.find(order => order.id === editingOrderId) : undefined;
    const generatedOrderNumber = `MO-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random()
      .toString(36)
      .slice(-4)
      .toUpperCase()}`;

    const payload = {
      recipe_sku: recipe.productSku,
      order_number: existingOrder?.orderNumber ?? generatedOrderNumber,
      mfg_order_batch_size: batchSize,
      mfg_order_total_cost: totalCost,
      mfg_order_status: existingOrder?.status ?? "pending",
      mfg_order_start_date: orderForm.startDate,
      mfg_order_notes: notes || null,
      created_by: createdBy || null,
      mfg_order_completion_date: existingOrder?.completionDate ?? null
    };

    setIsOrderSubmitting(true);
    try {
      if (editingOrderId) {
        await dispatch(
          thunks.manufacturing_orders.updateOne({
            id: editingOrderId,
            values: { ...payload }
          })
        ).unwrap();
        toast.success("Manufacturing order updated successfully!");
      } else {
        await dispatch(thunks.manufacturing_orders.createOne(payload)).unwrap();
        toast.success("Manufacturing order created successfully!");
      }
      setIsOrderDialogOpen(false);
      resetOrderForm();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save manufacturing order");
    } finally {
      setIsOrderSubmitting(false);
    }
  };

  const resetOrderForm = () => {
    setOrderForm({
      recipeId: "",
      batchSize: "",
      startDate: new Date().toISOString().split('T')[0],
      notes: "",
      createdBy: ""
    });
    setEditingOrderId(null);
  };

  const openCreateOrderDialog = () => {
    resetOrderForm();
    setIsOrderDialogOpen(true);
  };

  const handleEditOrder = (order: ManufacturingOrder) => {
    setEditingOrderId(order.id);
    setOrderForm({
      recipeId: order.recipeId,
      batchSize: order.batchSize ? order.batchSize.toString() : "",
      startDate: order.startDate || new Date().toISOString().split('T')[0],
      notes: order.notes || "",
      createdBy: order.createdBy || ""
    });
    setIsOrderDialogOpen(true);
  };

  const handleDeleteOrder = async (orderId: string) => {
    if (!orderId) return;
    const confirmDelete = window.confirm("Are you sure you want to delete this manufacturing order?");
    if (!confirmDelete) return;
    setIsOrderSubmitting(true);
    try {
      await dispatch(thunks.manufacturing_orders.deleteOne(orderId)).unwrap();
      toast.success("Manufacturing order deleted successfully!");
      if (editingOrderId === orderId) {
        resetOrderForm();
        setIsOrderDialogOpen(false);
      }
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete manufacturing order");
    } finally {
      setIsOrderSubmitting(false);
    }
  };

  const handleUpdateOrderStatus = async (orderId: string, newStatus: ManufacturingOrder["status"]) => {
    if (!orderId) return;
    const existingOrder = orders.find(order => order.id === orderId);
    if (!existingOrder) return;

    const payload: Record<string, unknown> = {
      mfg_order_status: newStatus
    };

    if (newStatus === "completed") {
      payload.mfg_order_completion_date = new Date().toISOString().split("T")[0];
    } else if (newStatus === "in-progress") {
      payload.mfg_order_completion_date = null;
      if (!existingOrder.startDate) {
        payload.mfg_order_start_date = new Date().toISOString().split("T")[0];
      }
    } else if (newStatus === "cancelled") {
      payload.mfg_order_completion_date = null;
    }

    setIsOrderSubmitting(true);
    try {
      await dispatch(
        thunks.manufacturing_orders.updateOne({
          id: orderId,
          values: payload
        })
      ).unwrap();
      toast.success(`Order status updated to ${newStatus}!`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update order status");
    } finally {
      setIsOrderSubmitting(false);
    }
  };

  // Filters
  const filteredMaterials = rawMaterials.filter(material =>
    material.nameEn.toLowerCase().includes(materialSearchQuery.toLowerCase()) ||
    material.nameAr.includes(materialSearchQuery) ||
    material.sku.toLowerCase().includes(materialSearchQuery.toLowerCase())
  );

  const filteredRecipes = recipes.filter(recipe =>
    recipe.productNameEn.toLowerCase().includes(recipeSearchQuery.toLowerCase()) ||
    recipe.productNameAr.includes(recipeSearchQuery) ||
    recipe.productSku.toLowerCase().includes(recipeSearchQuery.toLowerCase())
  );

  const filteredOrders = orders.filter(order => {
    const matchesSearch = order.orderNumber.toLowerCase().includes(orderSearchQuery.toLowerCase()) ||
      order.recipeName.toLowerCase().includes(orderSearchQuery.toLowerCase());
    const matchesStatus = orderStatusFilter === "all" || order.status === orderStatusFilter;
    return matchesSearch && matchesStatus;
  });

  const statusColors = {
    pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
    "in-progress": "bg-blue-100 text-blue-700 border-blue-200",
    completed: "bg-green-100 text-green-700 border-green-200",
    cancelled: "bg-red-100 text-red-700 border-red-200"
  };

  // Export functions
  const exportOrdersToExcel = () => {
    try {
      const exportData = filteredOrders.map((order) => ({
        "Order Number": order.orderNumber,
        "Recipe Name": order.recipeName,
        "Product SKU": order.productSku,
        "Batch Size": order.batchSize,
        "Status": order.status,
        "Start Date": order.startDate || "",
        "Completion Date": order.completionDate || "",
        "Total Cost (SAR)": order.totalCost,
        "Notes": order.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 20 }, { wch: 25 }, { wch: 15 }, { wch: 12 }, { wch: 15 },
        { wch: 12 }, { wch: 15 }, { wch: 18 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Manufacturing Orders");
      const fileName = `manufacturing_orders_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Manufacturing orders exported successfully");
    } catch (error) {
      toast.error("Failed to export manufacturing orders");
      console.error(error);
    }
  };

  const exportRecipesToExcel = () => {
    try {
      const exportData = filteredRecipes.map((recipe) => ({
        "Product Name (EN)": recipe.productNameEn,
        "Product Name (AR)": recipe.productNameAr,
        "Product SKU": recipe.productSku,
        "Output Quantity": recipe.outputQuantity,
        "Output Unit": recipe.outputUnit,
        "Total Material Cost (SAR)": recipe.totalMaterialCost,
        "Labor Cost (SAR)": recipe.laborCost,
        "Overhead Cost (SAR)": recipe.overheadCost,
        "Total Cost (SAR)": recipe.totalCost,
        "Cost Per Unit (SAR)": recipe.costPerUnit,
        "Notes": recipe.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
        { wch: 20 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 },
        { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Recipes");
      const fileName = `recipes_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Recipes exported successfully");
    } catch (error) {
      toast.error("Failed to export recipes");
      console.error(error);
    }
  };

  const exportMaterialsToExcel = () => {
    try {
      const exportData = filteredMaterials.map((material) => ({
        "Name (EN)": material.nameEn,
        "Name (AR)": material.nameAr,
        "SKU": material.sku,
        "Category": material.category || "",
        "Unit": material.unit,
        "Cost Per Unit (SAR)": material.costPerUnit,
        "Current Stock": material.currentStock,
        "Min Stock": material.minStock,
        "Total Value (SAR)": material.currentStock * material.costPerUnit,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 25 }, { wch: 25 }, { wch: 15 }, { wch: 15 }, { wch: 12 },
        { wch: 18 }, { wch: 15 }, { wch: 12 }, { wch: 18 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Raw Materials");
      const fileName = `raw_materials_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Raw materials exported successfully");
    } catch (error) {
      toast.error("Failed to export raw materials");
      console.error(error);
    }
  };

  // Calculate statistics
  const totalMaterialsValue = rawMaterials.reduce((sum, m) => sum + (m.currentStock * m.costPerUnit), 0);
  const lowStockMaterials = rawMaterials.filter(m => m.currentStock <= m.minStock).length;
  const pendingOrders = orders.filter(o => o.status === "pending").length;
  const completedOrders = orders.filter(o => o.status === "completed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Manufacturing - التصنيع</h2>
          <p className="text-muted-foreground mt-1">Manage production and costing</p>
          {isAnyLoading && (
            <p className="text-xs text-muted-foreground mt-1">Syncing latest data...</p>
          )}
        </div>
      </div>

      {dataErrors.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {dataErrors.map((error, index) => (
            <p key={index}>{error}</p>
          ))}
        </div>
      )}

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Materials Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMaterialsValue.toFixed(2)} SAR</div>
            <p className="text-xs text-muted-foreground mt-1">Raw materials inventory</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Stock Items</CardTitle>
            <Package className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{lowStockMaterials}</div>
            <p className="text-xs text-muted-foreground mt-1">Need reordering</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Orders</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{pendingOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting production</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Orders</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{completedOrders}</div>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="orders">
            <Factory className="h-4 w-4 mr-2" />
            Manufacturing Orders
          </TabsTrigger>
          <TabsTrigger value="recipes">
            <FileText className="h-4 w-4 mr-2" />
            Recipes (BOM)
          </TabsTrigger>
          <TabsTrigger value="materials">
            <ShoppingCart className="h-4 w-4 mr-2" />
            Raw Materials
          </TabsTrigger>
        </TabsList>

        {/* Manufacturing Orders Tab */}
        <TabsContent value="orders" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search orders..."
                    value={orderSearchQuery}
                    onChange={(e) => setOrderSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={orderStatusFilter} onValueChange={setOrderStatusFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="in-progress">In Progress</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex gap-2">
                  <Button
                    onClick={exportOrdersToExcel}
                    variant="outline"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export Excel
                  </Button>
                  <Button
                    onClick={openCreateOrderDialog}
                    className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                    disabled={isOrderSubmitting}
                  >
                    <Plus className="h-4 w-4" />
                    New Order
                  </Button>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Batch Size</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                        <Factory className="h-12 w-12 mx-auto mb-3 opacity-20"  />
                          No manufacturing orders found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrders.map((order) => (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.orderNumber}</TableCell>
                          <TableCell>
                            <div>
                              <div className="font-medium">{order.recipeName}</div>
                              <div className="text-xs text-muted-foreground">{order.productSku}</div>
                            </div>
                          </TableCell>
                          <TableCell>{order.batchSize} units</TableCell>
                          <TableCell>{order.totalCost.toFixed(2)} SAR</TableCell>
                          <TableCell>
                            {order.startDate ? new Date(order.startDate).toLocaleDateString('en-GB') : "-"}
                          </TableCell>
                          <TableCell>
                            <Badge className={statusColors[order.status]}>
                              {order.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              {order.status === "pending" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                    onClick={() => handleUpdateOrderStatus(order.id, "in-progress")}
                                  title="Start Production"
                                    disabled={isOrderSubmitting}
                                >
                                  <Clock className="h-4 w-4 text-blue-600" />
                                </Button>
                              )}
                              {order.status === "in-progress" && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                    onClick={() => handleUpdateOrderStatus(order.id, "completed")}
                                  title="Mark as Completed"
                                    disabled={isOrderSubmitting}
                                >
                                  <CheckCircle className="h-4 w-4 text-green-600" />
                                </Button>
                              )}
                              {(order.status === "pending" || order.status === "in-progress") && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                    onClick={() => handleUpdateOrderStatus(order.id, "cancelled")}
                                  title="Cancel Order"
                                    disabled={isOrderSubmitting}
                                >
                                  <XCircle className="h-4 w-4 text-red-600" />
                                </Button>
                              )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditOrder(order)}
                                  title="Edit Order"
                                  disabled={isOrderSubmitting}
                                >
                                  <Edit className="h-4 w-4 text-purple-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteOrder(order.id)}
                                  title="Delete Order"
                                  disabled={isOrderSubmitting}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
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

        {/* Recipes Tab */}
        <TabsContent value="recipes" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search recipes..."
                    value={recipeSearchQuery}
                    onChange={(e) => setRecipeSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={exportRecipesToExcel}
                    variant="outline"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export Excel
                  </Button>
                  <Button onClick={openCreateRecipeDialog} className="gap-2" disabled={isRecipeSubmitting}>
                    <Plus className="h-4 w-4" />
                    New Recipe
                  </Button>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Output</TableHead>
                      <TableHead>Material Cost</TableHead>
                      <TableHead>Total Cost</TableHead>
                      <TableHead>Cost/Unit</TableHead>
                      <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRecipes.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No recipes found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredRecipes.map((recipe) => (
                        <TableRow key={recipe.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{recipe.productNameEn}</div>
                              <div className="text-xs text-muted-foreground">{recipe.productNameAr}</div>
                            </div>
                          </TableCell>
                          <TableCell>{recipe.productSku}</TableCell>
                          <TableCell>{recipe.outputQuantity} {recipe.outputUnit}</TableCell>
                          <TableCell>{recipe.totalMaterialCost.toFixed(2)} SAR</TableCell>
                          <TableCell>{recipe.totalCost.toFixed(2)} SAR</TableCell>
                          <TableCell className="font-medium">{recipe.costPerUnit.toFixed(2)} SAR</TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setViewRecipeSku(recipe.productSku);
                                  setIsViewRecipeDialogOpen(true);
                                }}
                                title="View Details"
                              >
                                <Eye className="h-4 w-4 text-blue-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditRecipe(recipe)}
                                title="Edit"
                                disabled={isRecipeSubmitting}
                              >
                                <Edit className="h-4 w-4 text-purple-600" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteRecipe(recipe.productSku)}
                                title="Delete"
                                disabled={isRecipeSubmitting}
                              >
                                <Trash2 className="h-4 w-4 text-red-600" />
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

        {/* Raw Materials Tab */}
        <TabsContent value="materials" className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4 mb-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search materials..."
                    value={materialSearchQuery}
                    onChange={(e) => setMaterialSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={exportMaterialsToExcel}
                    variant="outline"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export Excel
                  </Button>
                  <Button onClick={openCreateMaterialDialog} className="gap-2" disabled={isMaterialSubmitting}>
                    <Plus className="h-4 w-4" />
                    Add Material
                  </Button>
                </div>
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Cost/Unit</TableHead>
                      <TableHead>Current Stock</TableHead>
                      <TableHead>Min Stock</TableHead>
                      <TableHead>Total Value</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredMaterials.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          No materials found
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMaterials.map((material) => {
                        const isLowStock = material.currentStock <= material.minStock;
                        return (
                          <TableRow key={material.id}>
                            <TableCell>
                              <div>
                                <div className="font-medium">{material.nameEn}</div>
                                <div className="text-xs text-muted-foreground">{material.nameAr}</div>
                              </div>
                            </TableCell>
                            <TableCell>{material.sku}</TableCell>
                            <TableCell>{material.category}</TableCell>
                            <TableCell>{material.costPerUnit.toFixed(2)} SAR</TableCell>
                            <TableCell>
                              <span className={isLowStock ? "text-red-600 font-medium" : ""}>
                                {material.currentStock} {material.unit}
                              </span>
                            </TableCell>
                            <TableCell>{material.minStock} {material.unit}</TableCell>
                            <TableCell className="font-medium">
                              {(material.currentStock * material.costPerUnit).toFixed(2)} SAR
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center justify-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleEditMaterial(material)}
                                  title="Edit Material"
                                  disabled={isMaterialSubmitting}
                                >
                                  <Edit className="h-4 w-4 text-blue-600" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleDeleteMaterial(material.id)}
                                  title="Delete Material"
                                  disabled={isMaterialSubmitting}
                                >
                                  <Trash2 className="h-4 w-4 text-red-600" />
                                </Button>
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
      </Tabs>

      {/* Add Raw Material Dialog */}
      <Dialog
        open={isMaterialDialogOpen}
        onOpenChange={(open) => {
          setIsMaterialDialogOpen(open);
          if (!open) {
            resetMaterialForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Raw Material</DialogTitle>
            <DialogDescription>Add a new raw material to inventory</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="nameEn">Name (English) *</Label>
                <Input
                  id="nameEn"
                  value={materialForm.nameEn}
                  onChange={(e) => setMaterialForm({ ...materialForm, nameEn: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nameAr">Name (Arabic)</Label>
                <Input
                  id="nameAr"
                  value={materialForm.nameAr}
                  onChange={(e) => setMaterialForm({ ...materialForm, nameAr: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sku">SKU *</Label>
                <Input
                  id="sku"
                  value={materialForm.sku}
                  onChange={(e) => setMaterialForm({ ...materialForm, sku: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Input
                  id="category"
                  value={materialForm.category}
                  onChange={(e) => setMaterialForm({ ...materialForm, category: e.target.value })}
                  placeholder="e.g., Fragrance Oils"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="unit">Unit</Label>
                <Select value={materialForm.unit} onValueChange={(value) => setMaterialForm({ ...materialForm, unit: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ml">ml</SelectItem>
                    <SelectItem value="liter">Liter</SelectItem>
                    <SelectItem value="gram">Gram</SelectItem>
                    <SelectItem value="kg">Kg</SelectItem>
                    <SelectItem value="piece">Piece</SelectItem>
                    <SelectItem value="set">Set</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="costPerUnit">Cost/Unit (SAR) *</Label>
                <Input
                  id="costPerUnit"
                  type="number"
                  step="0.01"
                  value={materialForm.costPerUnit}
                  onChange={(e) => setMaterialForm({ ...materialForm, costPerUnit: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="currentStock">Current Stock</Label>
                <Input
                  id="currentStock"
                  type="number"
                  step="0.01"
                  value={materialForm.currentStock}
                  onChange={(e) => setMaterialForm({ ...materialForm, currentStock: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minStock">Minimum Stock</Label>
                <Input
                  id="minStock"
                  type="number"
                  step="0.01"
                  value={materialForm.minStock}
                  onChange={(e) => setMaterialForm({ ...materialForm, minStock: e.target.value })}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsMaterialDialogOpen(false)} disabled={isMaterialSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSaveMaterial} disabled={isMaterialSubmitting}>
              {editingMaterialId ? "Update Material" : "Save Material"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Recipe Dialog */}
      <Dialog
        open={isRecipeDialogOpen}
        onOpenChange={(open) => {
          setIsRecipeDialogOpen(open);
          if (!open) {
            resetRecipeForm();
          }
        }}
      >
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Create Manufacturing Recipe (BOM)</DialogTitle>
            <DialogDescription>Define how to manufacture a product</DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Product Info */}
            <div className="space-y-4">
              <h4 className="font-medium">Product Information</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productNameEn">Product Name (English) *</Label>
                  <Input
                    id="productNameEn"
                    value={recipeForm.productNameEn}
                    onChange={(e) => setRecipeForm({ ...recipeForm, productNameEn: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="productNameAr">Product Name (Arabic)</Label>
                  <Input
                    id="productNameAr"
                    value={recipeForm.productNameAr}
                    onChange={(e) => setRecipeForm({ ...recipeForm, productNameAr: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="productSku">Product SKU *</Label>
                  <Input
                    id="productSku"
                    value={recipeForm.productSku}
                    onChange={(e) => setRecipeForm({ ...recipeForm, productSku: e.target.value })}
                    disabled={!!editingRecipeSku}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outputQuantity">Output Quantity</Label>
                  <Input
                    id="outputQuantity"
                    type="number"
                    step="0.01"
                    value={recipeForm.outputQuantity}
                    onChange={(e) => setRecipeForm({ ...recipeForm, outputQuantity: e.target.value })}
                    placeholder="1"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="outputUnit">Output Unit</Label>
                  <Select value={recipeForm.outputUnit} onValueChange={(value) => setRecipeForm({ ...recipeForm, outputUnit: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="piece">Piece</SelectItem>
                      <SelectItem value="set">Set</SelectItem>
                      <SelectItem value="kg">Kg</SelectItem>
                      <SelectItem value="liter">Liter</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Materials */}
            <div className="space-y-4">
              <h4 className="font-medium">Materials (Bill of Materials)</h4>
              
              <div className="flex gap-2">
                <Select value={currentItem.materialId} onValueChange={(value) => setCurrentItem({ ...currentItem, materialId: value })}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Select material" />
                  </SelectTrigger>
                  <SelectContent>
                    {rawMaterials.map((material) => (
                      <SelectItem key={material.id} value={material.id}>
                        {material.nameEn} ({material.unit})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="Quantity"
                  value={currentItem.quantity}
                  onChange={(e) => setCurrentItem({ ...currentItem, quantity: e.target.value })}
                  className="w-32"
                />
                <Button onClick={handleAddItemToRecipe} variant="outline">
                  <Plus className="h-4 w-4" />
                </Button>
              </div>

              {recipeItems.length > 0 && (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Cost/Unit</TableHead>
                        <TableHead>Total Cost</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {recipeItems.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.materialName}</TableCell>
                          <TableCell>{item.quantity} {item.unit}</TableCell>
                          <TableCell>{item.costPerUnit.toFixed(2)} SAR</TableCell>
                          <TableCell>{item.totalCost.toFixed(2)} SAR</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveItemFromRecipe(index)}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>

            {/* Additional Costs */}
            <div className="space-y-4">
              <h4 className="font-medium">Additional Costs</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="laborCost">Labor Cost (SAR)</Label>
                  <Input
                    id="laborCost"
                    type="number"
                    step="0.01"
                    value={recipeForm.laborCost}
                    onChange={(e) => setRecipeForm({ ...recipeForm, laborCost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="overheadCost">Overhead Cost (SAR)</Label>
                  <Input
                    id="overheadCost"
                    type="number"
                    step="0.01"
                    value={recipeForm.overheadCost}
                    onChange={(e) => setRecipeForm({ ...recipeForm, overheadCost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            {/* Cost Summary */}
            {recipeItems.length > 0 && (
              <div className="rounded-lg bg-gradient-to-r from-gray-50 to-white p-4 border">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="h-5 w-5 text-blue-600" />
                  <h4 className="font-medium">Cost Summary</h4>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Material Cost:</span>
                    <span className="font-medium">{calculateRecipeCosts().totalMaterialCost.toFixed(2)} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Labor Cost:</span>
                    <span className="font-medium">{calculateRecipeCosts().laborCost.toFixed(2)} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overhead Cost:</span>
                    <span className="font-medium">{calculateRecipeCosts().overheadCost.toFixed(2)} SAR</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t text-base">
                    <span className="font-semibold">Total Cost:</span>
                    <span className="font-bold text-blue-600">{calculateRecipeCosts().totalCost.toFixed(2)} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">Cost per Unit:</span>
                    <span className="font-bold text-green-600">{calculateRecipeCosts().costPerUnit.toFixed(2)} SAR</span>
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="notes">Notes</Label>
              <Input
                id="notes"
                value={recipeForm.notes}
                onChange={(e) => setRecipeForm({ ...recipeForm, notes: e.target.value })}
                placeholder="Additional notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRecipeDialogOpen(false)} disabled={isRecipeSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleSaveRecipe} disabled={isRecipeSubmitting}>
              {editingRecipeSku ? "Update Recipe" : "Save Recipe"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View Recipe Dialog */}
      <Dialog
        open={isViewRecipeDialogOpen}
        onOpenChange={(open) => {
          setIsViewRecipeDialogOpen(open);
          if (!open) {
            setViewRecipeSku(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Recipe Details</DialogTitle>
            <DialogDescription>View complete recipe information and cost breakdown</DialogDescription>
          </DialogHeader>

          {selectedRecipe && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Product Name</Label>
                  <p className="font-medium">{selectedRecipe.productNameEn}</p>
                  <p className="text-sm text-muted-foreground">{selectedRecipe.productNameAr}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">SKU</Label>
                  <p className="font-medium">{selectedRecipe.productSku}</p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground mb-2 block">Bill of Materials</Label>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Cost/Unit</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedRecipe.items.map((item, index) => (
                        <TableRow key={index}>
                          <TableCell>{item.materialName}</TableCell>
                          <TableCell>{item.quantity} {item.unit}</TableCell>
                          <TableCell>{item.costPerUnit.toFixed(2)} SAR</TableCell>
                          <TableCell>{item.totalCost.toFixed(2)} SAR</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              <div className="rounded-lg bg-gradient-to-r from-gray-50 to-white p-4 border">
                <h4 className="font-medium mb-3">Cost Breakdown</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Material Cost:</span>
                    <span className="font-medium">{selectedRecipe.totalMaterialCost.toFixed(2)} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Labor Cost:</span>
                    <span className="font-medium">{selectedRecipe.laborCost.toFixed(2)} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Overhead Cost:</span>
                    <span className="font-medium">{selectedRecipe.overheadCost.toFixed(2)} SAR</span>
                  </div>
                  <div className="flex justify-between pt-2 border-t text-base">
                    <span className="font-semibold">Total Cost:</span>
                    <span className="font-bold text-blue-600">{selectedRecipe.totalCost.toFixed(2)} SAR</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold">Cost per Unit:</span>
                    <span className="font-bold text-green-600">{selectedRecipe.costPerUnit.toFixed(2)} SAR</span>
                  </div>
                </div>
              </div>

              {selectedRecipe.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <p className="text-sm mt-1">{selectedRecipe.notes}</p>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              onClick={() => {
                setIsViewRecipeDialogOpen(false);
                setViewRecipeSku(null);
              }}
            >
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create Manufacturing Order Dialog */}
      <Dialog
        open={isOrderDialogOpen}
        onOpenChange={(open) => {
          setIsOrderDialogOpen(open);
          if (!open) {
            resetOrderForm();
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Create Manufacturing Order</DialogTitle>
            <DialogDescription>Start a new production batch</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="recipeId">Select Recipe *</Label>
              <Select value={orderForm.recipeId} onValueChange={(value) => setOrderForm({ ...orderForm, recipeId: value })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a recipe" />
                </SelectTrigger>
                <SelectContent>
                  {recipes.map((recipe) => (
                    <SelectItem key={recipe.id} value={recipe.productSku}>
                      {recipe.productNameEn} - {recipe.costPerUnit.toFixed(2)} SAR/unit
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="batchSize">Batch Size (units) *</Label>
                <Input
                  id="batchSize"
                  type="number"
                  value={orderForm.batchSize}
                  onChange={(e) => setOrderForm({ ...orderForm, batchSize: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">Start Date</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={orderForm.startDate}
                  onChange={(e) => setOrderForm({ ...orderForm, startDate: e.target.value })}
                />
              </div>
            </div>

            {orderForm.recipeId && orderForm.batchSize && (
              <div className="rounded-lg bg-blue-50 p-4 border border-blue-200">
                <h4 className="font-medium text-blue-900 mb-2">Estimated Cost</h4>
                <p className="text-2xl font-bold text-blue-600">
                  {(recipeLookupBySku.get(orderForm.recipeId)?.costPerUnit || 0) * parseFloat(orderForm.batchSize || "0")} SAR
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  for {orderForm.batchSize} units
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="createdBy">Created By</Label>
              <Input
                id="createdBy"
                value={orderForm.createdBy}
                onChange={(e) => setOrderForm({ ...orderForm, createdBy: e.target.value })}
                placeholder="Your name"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="orderNotes">Notes</Label>
              <Input
                id="orderNotes"
                value={orderForm.notes}
                onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })}
                placeholder="Additional notes..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOrderDialogOpen(false)} disabled={isOrderSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveOrder}
              className="bg-purple-600 hover:bg-purple-700 text-white"
              disabled={isOrderSubmitting}
            >
              {editingOrderId ? "Update Order" : "Create Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

