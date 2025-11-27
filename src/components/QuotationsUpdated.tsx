import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Printer, Send, Eye, X, Trash2, Upload, FileText, MoreVertical, Download } from "lucide-react";
import * as XLSX from "@e965/xlsx";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Separator } from "./ui/separator";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import type { InventoryItem } from "./Inventory";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { CustomerSelector } from "./CustomerSelector";
import type { Customer } from "./CustomerSelector";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { thunks, selectors } from "../redux-toolkit/slices";

interface QuotationItem {
  id: number;
  inventoryItem?: InventoryItem;
  isManual: boolean;
  image?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  priceAfterDiscount: number;
  subtotal: number;
  vat: number;
  total: number;
}

interface Quotation {
  id: number;
  quotationNumber: string;
  date: string;
  expiryDate: string;
  customerName: string;
  mobile: string;
  location: string;
  commercialRegister: string;
  taxNumber: string;
  companyLogo?: string;
  stamp?: string;
  stampPosition?: { x: number; y: number };
  notes?: string;
  termsAndConditions?: string;
  items: QuotationItem[];
  totalBeforeDiscount: number;
  totalDiscount: number;
  totalAfterDiscount: number;
  totalVAT: number;
  grandTotal: number;
  status: "sent" | "pending" | "cancelled";
}

const VAT_RATE = 0.15;

// Data comes from Supabase via Redux now

interface QuotationsProps {
  systemLogo: string;
  systemNameAr: string;
  systemNameEn: string;
  onConvertToInvoice?: (quotationData: any) => void;
}

export function Quotations({ onConvertToInvoice }: QuotationsProps) {
  const dispatch = useAppDispatch();
  const dbQuotations = useAppSelector(selectors.quotations.selectAll) as any[];
  const dbInventory = useAppSelector(selectors.inventory.selectAll) as any[];
  const loading = useAppSelector(selectors.quotations.selectLoading);
  const loadError = useAppSelector(selectors.quotations.selectError);
  useEffect(() => {
    dispatch(thunks.quotations.fetchAll(undefined));
    dispatch(thunks.inventory.fetchAll(undefined));
  }, [dispatch]);
  // Create quotation number map similar to invoices - based on sorted order
  const quotationNumberMap = useMemo(() => {
    const parse = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    const sorted = [...dbQuotations].sort(
      (a, b) => parse(a.created_at) - parse(b.created_at)
    );

    const map = new Map<
      string,
      {
        quotationNumber: string;
        sequence: number;
      }
    >();

    sorted.forEach((quotation, index) => {
      const quotationDate = quotation.created_at ?? new Date().toISOString();
      const quotationYear = new Date(quotationDate).getFullYear();
      map.set(quotation.quotation_id, {
        quotationNumber: `QT-${quotationYear}-${String(index + 1).padStart(3, "0")}`,
        sequence: index + 1,
      });
    });

    return map;
  }, [dbQuotations]);

  const quotations: Quotation[] = useMemo(() => {
    return dbQuotations.map((q, idx) => {
      const items = Array.isArray(q.quotation_items) ? q.quotation_items : [];
      const totals = items.reduce((acc: any, it: any) => {
        const qty = Number(it.quantity || 0);
        const unit = Number(it.unitPrice || it.unit_price || 0);
        const disc = Number(it.discountPercent || it.discount_percent || 0);
        const priceAfter = unit * (1 - disc / 100);
        const subtotal = priceAfter * qty;
        const vat = subtotal * 0.15;
        const total = subtotal + vat;
        acc.totalBeforeDiscount += unit * qty;
        acc.totalAfterDiscount += subtotal;
        acc.totalVAT += vat;
        acc.grandTotal += total;
        acc.totalDiscount = acc.totalBeforeDiscount - acc.totalAfterDiscount;
        return acc;
      }, { totalBeforeDiscount: 0, totalAfterDiscount: 0, totalDiscount: 0, totalVAT: 0, grandTotal: 0 });
      
      const quotationMeta = quotationNumberMap.get(q.quotation_id);
      
      return {
        id: quotationMeta?.sequence ?? idx + 1,
        quotationNumber: quotationMeta?.quotationNumber ?? `QT${String(idx + 1).padStart(3, "0")}`,
        date: (q.created_at ?? '').slice(0,10) || new Date().toISOString().slice(0,10),
        expiryDate: q.quotation_validity ? new Date(Date.now() + Number(q.quotation_validity) * 86400000).toISOString().slice(0,10) : new Date().toISOString().slice(0,10),
        customerName: q.customer_name ?? '',
        mobile: q.phone_number ? String(q.phone_number) : '',
        location: q.location ?? '',
        commercialRegister: '',
        taxNumber: '',
        notes: q.quotation_notes ?? '',
        items: (items as any[]).map((it, i) => {
          const qty = Number(it.quantity || 0);
          const unit = Number(it.unitPrice || it.unit_price || 0);
          const disc = Number(it.discountPercent || it.discount_percent || 0);
          const priceAfter = unit * (1 - disc / 100);
          const subtotal = priceAfter * qty;
          const vat = subtotal * 0.15;
          const total = subtotal + vat;
          return {
            id: i + 1,
            isManual: true,
            image: it.image || undefined,
            description: it.description || it.name || '',
            quantity: qty,
            unitPrice: unit,
            discountPercent: disc,
            priceAfterDiscount: priceAfter,
            subtotal: subtotal,
            vat: vat,
            total: total,
          };
        }),
        totalBeforeDiscount: totals.totalBeforeDiscount,
        totalDiscount: totals.totalDiscount,
        totalAfterDiscount: totals.totalAfterDiscount,
        totalVAT: totals.totalVAT,
        grandTotal: totals.grandTotal,
        status: ((q.quotation_summary ?? 'pending') as 'pending' | 'sent' | 'cancelled'),
      } as Quotation;
    });
  }, [dbQuotations]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedQuotation, setSelectedQuotation] = useState<Quotation | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);

  // Customer management
  const [customers, setCustomers] = useState<Customer[]>([
    {
      id: 1,
      name: "Ahmed Mohammed",
      company: "Palm Trading Company",
      mobile: "0501234567",
      email: "ahmed@palmtrade.com",
      location: "Riyadh, Al Malaz District",
      commercialRegister: "1010234567",
      taxNumber: "310123456700003",
      status: "active"
    },
    {
      id: 2,
      name: "Khaled Abdullah",
      company: "Paradise Corporation",
      mobile: "0507654321",
      email: "khaled@paradise.com",
      location: "Jeddah, Al Safa District",
      commercialRegister: "1010345678",
      taxNumber: "310234567800003",
      status: "active"
    }
  ]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>();

  // Form states
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [location, setLocation] = useState("");
  const [commercialRegister, setCommercialRegister] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [expiryDays, setExpiryDays] = useState("30");
  const [notes, setNotes] = useState("");
  const [termsAndConditions, setTermsAndConditions] = useState(
    "• All prices include 15% VAT\n" +
    "• Payment terms: 50% advance, 50% upon completion\n" +
    "• Delivery within 7-10 business days\n" +
    "• Prices subject to change after expiry\n" +
    "• Installation and setup included\n" +
    "• One year warranty on all devices"
  );
  const [companyLogo, setCompanyLogo] = useState("");
  const [stamp, setStamp] = useState("");
  const [_stampPosition, setStampPosition] = useState({ x: 50, y: 50 });
  const [items, setItems] = useState<QuotationItem[]>([{
    id: 1,
    isManual: true,
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    priceAfterDiscount: 0,
    subtotal: 0,
    vat: 0,
    total: 0
  }]);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);

  const filteredQuotations = quotations.filter(quotation => {
    const matchesSearch = 
      quotation.quotationNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quotation.customerName.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || quotation.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCompanyLogo(reader.result as string);
        toast.success("Logo uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleStampUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setStamp(reader.result as string);
        toast.success("Stamp uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  const handleItemImageUpload = (itemId: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateItemImage(itemId, reader.result as string);
        toast.success("Image uploaded successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  const calculateItemTotals = (item: Partial<QuotationItem>) => {
    const quantity = item.quantity || 0;
    const unitPrice = item.unitPrice || 0;
    const discountPercent = item.discountPercent || 0;
    
    const priceAfterDiscount = unitPrice * (1 - discountPercent / 100);
    const subtotal = priceAfterDiscount * quantity;
    const vat = subtotal * VAT_RATE;
    const total = subtotal + vat;

    return {
      priceAfterDiscount,
      subtotal,
      vat,
      total
    };
  };

  const addManualItem = () => {
    setItems([...items, {
      id: Date.now(),
      isManual: true,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      priceAfterDiscount: 0,
      subtotal: 0,
      vat: 0,
      total: 0
    }]);
    toast.success("Manual item added");
  };

  const addInventoryItem = () => {
    setItems([...items, {
      id: Date.now(),
      isManual: false,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      priceAfterDiscount: 0,
      subtotal: 0,
      vat: 0,
      total: 0
    }]);
    toast.success("Inventory item added - please select from dropdown");
  };

  const removeItem = (id: number) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const handleCustomerSelect = (customer: Customer) => {
    if (customer.id) {
      setSelectedCustomerId(customer.id);
      setCustomerName(customer.name);
      setMobile(customer.mobile);
      setLocation(customer.location || "");
      setCommercialRegister(customer.commercialRegister || "");
      setTaxNumber(customer.taxNumber || "");
    } else {
      // Clear selection
      setSelectedCustomerId(undefined);
      setCustomerName("");
      setMobile("");
      setLocation("");
      setCommercialRegister("");
      setTaxNumber("");
    }
  };

  const handleCustomerAdd = (newCustomer: Customer) => {
    setCustomers([...customers, newCustomer]);
  };

  const updateItem = (id: number, field: string, value: any) => {
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        const totals = calculateItemTotals(updated);
        return { ...updated, ...totals };
      }
      return item;
    }));
  };

  const updateItemImage = (id: number, imageUrl: string) => {
    setItems(items.map(item => {
      if (item.id === id) {
        return { ...item, image: imageUrl };
      }
      return item;
    }));
  };

  const loadItemFromInventory = (id: number, inventoryKey: string) => {
    const inv = dbInventory.find((p: any) => p.product_code === inventoryKey);
    if (!inv) return;
    setItems(items.map(item => {
      if (item.id === id) {
        const updated = {
          ...item,
          inventoryItem: { id: inventoryKey },
          isManual: false,
          image: inv.prod_img || undefined,
          description: inv.en_prod_name || inv.ar_prod_name || '',
          unitPrice: Number(inv.prod_selling_price || 0),
        } as any;
        const totals = calculateItemTotals(updated);
        return { ...updated, ...totals };
      }
      return item;
    }));
    toast.success("Product loaded from inventory");
  };

  const calculateQuotationTotals = () => {
    const totalBeforeDiscount = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const totalAfterDiscount = items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalDiscount = totalBeforeDiscount - totalAfterDiscount;
    const totalVAT = items.reduce((sum, item) => sum + item.vat, 0);
    const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

    return { totalBeforeDiscount, totalDiscount, totalAfterDiscount, totalVAT, grandTotal };
  };

  const totals = calculateQuotationTotals();

  const resetForm = () => {
    setSelectedCustomerId(undefined);
    setCustomerName("");
    setMobile("");
    setLocation("");
    setCommercialRegister("");
    setTaxNumber("");
    setExpiryDays("30");
    setCompanyLogo("");
    setStamp("");
    setStampPosition({ x: 50, y: 50 });
    setNotes("");
    setTermsAndConditions(
      "• All prices include 15% VAT\n" +
      "• Payment terms: 50% advance, 50% upon completion\n" +
      "• Delivery within 7-10 business days\n" +
      "• Prices subject to change after expiry\n" +
      "• Installation and setup included\n" +
      "• One year warranty on all devices"
    );
    setItems([{
      id: 1,
      isManual: true,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      priceAfterDiscount: 0,
      subtotal: 0,
      vat: 0,
      total: 0
    }]);
  };

  const handleCreateQuotation = async () => {
    if (!customerName.trim()) {
      toast.error("Please enter customer name");
      return;
    }
    if (!mobile.trim()) {
      toast.error("Please enter mobile number");
      return;
    }
    if (items.every(item => !item.description.trim())) {
      toast.error("Please add at least one item with description");
      return;
    }

    // Quotation number will be auto-assigned based on sorted order (like invoices)
    // No need to generate or store it - it's calculated on display
    const itemsPayload = items.filter(i => i.description.trim()).map(i => ({
      description: i.description,
      quantity: i.quantity,
      unit_price: i.unitPrice,
      discount_percent: i.discountPercent,
      image: i.image || null,
    }));
    const values: any = {
      customer_name: customerName.trim(),
      phone_number: mobile ? parseInt(mobile.replace(/\D/g, ''), 10) : null,
      location: location.trim() || null,
      quotation_validity: parseInt(expiryDays) || 30,
      quotation_items: itemsPayload,
      quotation_notes: notes.trim() || null,
      quotation_summary: 'pending',
      company_logo: companyLogo || null,
      company_stamp: stamp || null,
    };
    dispatch(thunks.quotations.createOne(values))
      .unwrap()
      .then(() => {
        resetForm();
        setIsCreateDialogOpen(false);
        // Get the new quotation number from the map after refresh
        dispatch(thunks.quotations.fetchAll(undefined)).then(() => {
          // The quotation number will be calculated automatically based on sorted order
          toast.success("Quotation created successfully!");
        });
      })
      .catch((e: any) => toast.error(e.message || 'Failed to create quotation'));
  };

  const handleStatusChange = (quotationId: number, newStatus: "sent" | "pending" | "cancelled") => {
    const q = quotations.find(q => q.id === quotationId);
    if (!q) return;
    // We don't have the actual uuid here; derive from selector by index
    const target = dbQuotations[quotationId - 1];
    const id = target?.quotation_id as string | undefined;
    if (!id) return;
    dispatch(thunks.quotations.updateOne({ id, values: { quotation_summary: newStatus } as any }))
      .unwrap()
      .then(() => toast.success(`Quotation status updated to ${newStatus}`))
      .catch((e: any) => toast.error(e.message || 'Failed to update status'));
  };

  const convertToInvoice = (quotation: Quotation) => {
    const invoiceData = {
      quotationNumber: quotation.quotationNumber,
      customerName: quotation.customerName,
      mobile: quotation.mobile,
      location: quotation.location,
      commercialRegister: quotation.commercialRegister,
      taxNumber: quotation.taxNumber,
      items: quotation.items,
      notes: quotation.notes,
      companyLogo: quotation.companyLogo,
      stamp: quotation.stamp,
      totalBeforeDiscount: quotation.totalBeforeDiscount,
      totalDiscount: quotation.totalDiscount,
      totalAfterDiscount: quotation.totalAfterDiscount,
      totalVAT: quotation.totalVAT,
      grandTotal: quotation.grandTotal
    };
    
    if (onConvertToInvoice) {
      onConvertToInvoice(invoiceData);
      toast.success(`Converting quotation ${quotation.quotationNumber} to invoice...`);
    } else {
      toast.error("Unable to convert. Please try again.");
    }
  };

  const printQuotation = async (quotation: Quotation) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error("Please allow popups to print quotations");
      return;
    }

    // Debug: Log items with images
    console.log('Printing quotation items:', quotation.items.map(item => ({
      description: item.description,
      hasImage: !!item.image,
      imageLength: item.image?.length || 0,
      imagePreview: item.image?.substring(0, 50) || 'no image',
      imageType: item.image?.substring(0, 20) || 'no image'
    })));
    
    // Verify images are present
    const itemsWithImages = quotation.items.filter(item => item.image);
    console.log(`Found ${itemsWithImages.length} items with images out of ${quotation.items.length} total items`);

    // Generate HTML
    const quotationHTML = generateQuotationHTML(quotation);
    
    // Write HTML to print window
    printWindow.document.open();
    printWindow.document.write(quotationHTML);
    printWindow.document.close();
    
    // Wait for window to be ready and images to load
    await new Promise<void>((resolve) => {
      const checkReady = () => {
        if (printWindow.document.readyState === 'complete') {
          const images = printWindow.document.querySelectorAll('img');
          if (images.length === 0) {
            resolve();
            return;
          }
          
          let loadedCount = 0;
          const totalImages = images.length;
          
          const checkComplete = () => {
            loadedCount++;
            if (loadedCount >= totalImages) {
              resolve();
            }
          };
          
          images.forEach((img: HTMLImageElement) => {
            // For base64 images, they're usually already loaded
            if (img.complete && img.naturalHeight !== 0) {
              checkComplete();
            } else if (img.src && img.src.startsWith('data:')) {
              // Base64 images are synchronous, consider them loaded
              checkComplete();
            } else {
              img.onload = checkComplete;
              img.onerror = checkComplete;
            }
          });
          
          // Fallback timeout
          setTimeout(() => resolve(), 2000);
        } else {
          setTimeout(checkReady, 100);
        }
      };
      
      checkReady();
    });
    
    // Small delay to ensure everything is rendered
    await new Promise(resolve => setTimeout(resolve, 300));
    
    // Trigger print
    printWindow.focus();
    printWindow.print();
  };

  const generateQuotationHTML = (quotation: Quotation) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Quotation ${quotation.quotationNumber}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            font-size: 14px;
            background: linear-gradient(to bottom, #f3f4f6 0%, #ffffff 100%);
            position: relative;
          }
          .quotation-container { max-width: 800px; margin: 0 auto; padding: 20px; position: relative; background: white; border-radius: 8px; }
          .stamp {
            max-width: 50px;
            max-height: 50px;
            filter: brightness(0) saturate(100%) invert(23%) sepia(98%) saturate(7466%) hue-rotate(357deg) brightness(91%) contrast(118%);
            opacity: 0.8;
          }
          .content { position: relative; z-index: 1; }
          .header { 
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            padding-bottom: 20px;
            border-bottom: 3px solid #cbd5e1;
            margin-bottom: 20px;
          }
          .company-info { text-align: left; }
          .company-logo { 
            max-width: 180px;
            height: auto;
            margin-bottom: 10px;
          }
          .company-name {
            font-size: 22px; 
            font-weight: bold; 
            color: #475569;
            margin-bottom: 5px;
          }
          .quotation-info { text-align: right; }
          .quotation-number {
            font-size: 22px;
            font-weight: bold;
            color: #475569;
            margin-bottom: 10px;
          }
          .validity {
            background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
            padding: 10px;
            border-radius: 6px;
            border-left: 4px solid #f59e0b;
            margin-top: 10px;
            font-size: 12px;
          }
          .customer-section {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 30px;
            margin: 20px 0;
            padding: 15px;
            background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
            border-radius: 8px;
          }
          .section-title {
            font-weight: 600;
            color: #64748b;
            margin-bottom: 10px;
            font-size: 16px;
          }
          .info-row {
            margin: 5px 0;
            font-size: 13px;
          }
          .label { 
            font-weight: 600; 
            color: #94a3b8;
            display: inline-block;
            min-width: 100px;
          }
          .items-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .items-table th {
            background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%);
            color: #1e293b;
            padding: 12px 8px;
            text-align: left;
            font-size: 13px;
            font-weight: 600;
          }
          .items-table td {
            padding: 10px 8px;
            border-bottom: 1px solid #e2e8f0;
            font-size: 13px;
          }
          .items-table tr:hover {
            background: #f8fafc;
          }
          .item-image {
            width: 50px;
            height: 50px;
            object-fit: cover;
            border-radius: 6px;
            border: 1px solid #e2e8f0;
            display: block;
            max-width: 50px;
            max-height: 50px;
          }
          @media print {
            .item-image {
              print-color-adjust: exact;
              -webkit-print-color-adjust: exact;
              width: 50px !important;
              height: 50px !important;
              max-width: 50px !important;
              max-height: 50px !important;
              object-fit: cover !important;
              display: block !important;
            }
          }
          .item-desc {
            font-weight: 500;
          }
          .totals-section {
            float: right;
            width: 350px;
            margin-top: 20px;
          }
          .total-row {
            display: flex;
            justify-content: space-between;
            padding: 8px 15px;
            border-bottom: 1px solid #e2e8f0;
          }
          .total-row.grand {
            background: linear-gradient(135deg, #64748b 0%, #475569 100%);
            color: white;
            font-size: 18px;
            font-weight: bold;
            border-radius: 8px;
            margin-top: 10px;
          }
          .terms {
            clear: both;
            margin-top: 40px;
            padding: 20px;
            background: linear-gradient(135deg, #f9fafb 0%, #ffffff 100%);
            border-radius: 8px;
            border: 2px solid #e2e8f0;
            position: relative;
          }
          .terms-title {
            font-weight: 600;
            color: #64748b;
            margin-bottom: 10px;
            font-size: 16px;
          }
          .terms-content {
            font-size: 12px;
            line-height: 1.8;
          }
          .footer {
            clear: both;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 2px solid #e2e8f0;
            text-align: center;
            font-size: 11px;
            color: #64748b;
          }
          @media print {
            body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          }
        </style>
      </head>
      <body>
        <div class="quotation-container">
          ${quotation.stamp ? `<img src="${quotation.stamp}" class="stamp" alt="Stamp">` : ''}
          <div class="content">
            <div class="header">
              <div class="company-info">
                ${quotation.companyLogo ? `<img src="${quotation.companyLogo}" class="company-logo" alt="Company Logo">` : ''}
                <div class="company-name">Mana Smart Trading</div>
                <div style="margin-top: 10px; color: #64748b; font-size: 12px;">
                  <div>VAT: 311234567800003</div>
                  <div>C.R.: 1010567890</div>
                  <div>Riyadh, Saudi Arabia</div>
                </div>
              </div>
              <div class="quotation-info">
                <div class="quotation-number">QUOTATION</div>
                <div style="margin-top: 10px;">
                  <div style="font-weight: 600; color: #475569;">${quotation.quotationNumber}</div>
                  <div style="color: #64748b; font-size: 12px;">Date: ${new Date(quotation.date).toLocaleDateString('en-GB')}</div>
                  <div class="validity">
                    <strong>Valid Until:</strong> ${new Date(quotation.expiryDate).toLocaleDateString('en-GB')}
                  </div>
                </div>
              </div>
            </div>

            <div class="customer-section">
              <div>
                <div class="section-title">Prepared For</div>
                <div class="info-row"><span class="label">Name:</span> ${quotation.customerName}</div>
                <div class="info-row"><span class="label">Mobile:</span> ${quotation.mobile}</div>
                ${quotation.location ? `<div class="info-row"><span class="label">Location:</span> ${quotation.location}</div>` : ''}
              </div>
              <div>
                <div class="section-title">Tax Information</div>
                ${quotation.commercialRegister ? `<div class="info-row"><span class="label">C.R.:</span> ${quotation.commercialRegister}</div>` : ''}
                ${quotation.taxNumber ? `<div class="info-row"><span class="label">VAT:</span> ${quotation.taxNumber}</div>` : ''}
              </div>
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 60px;">Image</th>
                  <th>Description</th>
                  <th style="width: 80px; text-align: center;">Qty</th>
                  <th style="width: 100px; text-align: right;">Price</th>
                  <th style="width: 80px; text-align: center;">Disc. %</th>
                  <th style="width: 100px; text-align: right;">Subtotal</th>
                  <th style="width: 80px; text-align: right;">VAT 15%</th>
                  <th style="width: 100px; text-align: right;">Total</th>
                </tr>
              </thead>
              <tbody>
                ${quotation.items.map(item => {
                  const imageSrc = item.image || '';
                  const hasImage = imageSrc && imageSrc.trim() !== '';
                  const escapedDescription = (item.description || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                  // Build image HTML - base64 data URLs are safe to embed directly
                  let imageHtml = '';
                  if (hasImage) {
                    // Base64 data URLs can be embedded directly in HTML
                    // The imageSrc is already a valid data URL string
                    imageHtml = '<img src="' + imageSrc + '" class="item-image" alt="' + escapedDescription + '" style="max-width: 50px; max-height: 50px; object-fit: cover; width: 50px; height: 50px;">';
                  } else {
                    imageHtml = '<div style="width: 50px; height: 50px; background: #f1f5f9; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 20px;">📦</div>';
                  }
                  return `
                  <tr>
                    <td>
                      ${imageHtml}
                    </td>
                    <td>
                      <div class="item-desc">${escapedDescription}</div>
                    </td>
                    <td style="text-align: center;">${item.quantity}</td>
                    <td style="text-align: right;">SAR ${item.unitPrice.toFixed(2)}</td>
                    <td style="text-align: center;">${item.discountPercent}%</td>
                    <td style="text-align: right;">SAR ${item.subtotal.toFixed(2)}</td>
                    <td style="text-align: right;">SAR ${item.vat.toFixed(2)}</td>
                    <td style="text-align: right; font-weight: 600;">SAR ${item.total.toFixed(2)}</td>
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>

            <div class="totals-section">
              <div class="total-row">
                <span>Subtotal:</span>
                <span>SAR ${quotation.totalBeforeDiscount.toFixed(2)}</span>
              </div>
              ${quotation.totalDiscount > 0 ? `
              <div class="total-row">
                <span>Discount:</span>
                <span>- SAR ${quotation.totalDiscount.toFixed(2)}</span>
              </div>
              ` : ''}
              <div class="total-row">
                <span>After Discount:</span>
                <span>SAR ${quotation.totalAfterDiscount.toFixed(2)}</span>
              </div>
              <div class="total-row">
                <span>VAT (15%):</span>
                <span>SAR ${quotation.totalVAT.toFixed(2)}</span>
              </div>
              <div class="total-row grand">
                <span>GRAND TOTAL:</span>
                <span>SAR ${quotation.grandTotal.toFixed(2)}</span>
              </div>
            </div>

            ${quotation.notes ? `
            <div class="terms">
              <div class="terms-title">Notes</div>
              <div class="terms-content">${quotation.notes}</div>
            </div>
            ` : ''}

            <div class="terms">
              <div class="terms-title">Terms & Conditions</div>
              <div class="terms-content">
                <ul style="list-style: none; padding: 0;">
                  <li>• This quotation is valid for ${Math.ceil((new Date(quotation.expiryDate).getTime() - new Date(quotation.date).getTime()) / (1000 * 60 * 60 * 24))} days from the issue date</li>
                  ${quotation.termsAndConditions ? quotation.termsAndConditions.split('\\n').map(line => line.trim() ? `<li>${line}</li>` : '').join('') : ''}
                </ul>
              </div>
            </div>

            <div class="footer">
              <div style="font-weight: 600; margin-bottom: 10px;">Thank you for considering our quotation!</div>
              <div>
                For any questions, please contact us:<br>
                Phone: +966 50 123 4567 | Email: info@manatrading.sa
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
    `;
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredQuotations.map((quotation) => ({
        "Quotation Number": quotation.quotationNumber,
        Date: quotation.date,
        "Valid Until": quotation.expiryDate,
        "Customer Name": quotation.customerName,
        Mobile: quotation.mobile,
        Location: quotation.location || "N/A",
        "Grand Total (SAR)": quotation.grandTotal,
        Status: quotation.status,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Quotations");
      const fileName = `quotations_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2 className="text-2xl font-semibold tracking-tight">Quotations</h2>
          <p className="text-muted-foreground mt-1">Create and manage price quotations</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="h-4 w-4" />
              New Quotation
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader className="flex-shrink-0">
              <DialogTitle className="text-lg">Create New Quotation</DialogTitle>
              <DialogDescription className="text-sm">Fill in customer details and add items</DialogDescription>
            </DialogHeader>

            <div className="overflow-y-auto overflow-x-hidden flex-1 pr-2">
              <div className="space-y-3 px-1 py-2">
                {/* Customer Information */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Customer Information</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="col-span-2">
                      <CustomerSelector
                        customers={customers}
                        selectedCustomerId={selectedCustomerId}
                        onCustomerSelect={handleCustomerSelect}
                        onCustomerAdd={handleCustomerAdd}
                        label="Select Customer"
                        placeholder="Search customer by name, company, or mobile..."
                        required
                      />
                    </div>
                    
                    {selectedCustomerId && (
                      <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                        <div className="space-y-1">
                          <Label htmlFor="customerName" className="text-xs">Customer Name</Label>
                          <Input 
                            id="customerName" 
                            value={customerName} 
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Customer Name"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="mobile" className="text-xs">Mobile Number</Label>
                          <Input 
                            id="mobile" 
                            value={mobile} 
                            onChange={(e) => setMobile(e.target.value)}
                            placeholder="0501234567"
                            className="h-8 text-sm"
                          />
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="location" className="text-xs">Location</Label>
                          <Input 
                            id="location" 
                            value={location} 
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="Riyadh, Al Malaz District"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="expiryDays" className="text-xs">Valid For (Days)</Label>
                          <Select value={expiryDays} onValueChange={setExpiryDays}>
                            <SelectTrigger id="expiryDays" className="h-8 text-sm">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="7">7 Days</SelectItem>
                              <SelectItem value="15">15 Days</SelectItem>
                              <SelectItem value="30">30 Days</SelectItem>
                              <SelectItem value="60">60 Days</SelectItem>
                              <SelectItem value="90">90 Days</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1">
                          <Label htmlFor="commercialRegister" className="text-xs">Commercial Register</Label>
                          <Input 
                            id="commercialRegister" 
                            value={commercialRegister} 
                            onChange={(e) => setCommercialRegister(e.target.value)}
                            placeholder="1010123456"
                            className="h-8 text-sm"
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="taxNumber" className="text-xs">VAT Number</Label>
                          <Input 
                            id="taxNumber" 
                            value={taxNumber} 
                            onChange={(e) => setTaxNumber(e.target.value)}
                            placeholder="300159475400003"
                            className="h-8 text-sm"
                          />
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Branding */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Branding & Customization</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs">Company Logo</Label>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleLogoUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => logoInputRef.current?.click()}
                          className="w-full h-8 text-xs"
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Upload Logo
                        </Button>
                        {companyLogo && (
                          <div className="relative">
                            <ImageWithFallback 
                              src={companyLogo} 
                              alt="Company Logo" 
                              className="h-16 w-auto object-contain border rounded"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-0 right-0 h-6 w-6"
                              onClick={() => setCompanyLogo("")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>

                      <div className="space-y-1">
                        <Label className="text-xs">Stamp (Optional)</Label>
                        <input
                          ref={stampInputRef}
                          type="file"
                          accept="image/*"
                          onChange={handleStampUpload}
                          className="hidden"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => stampInputRef.current?.click()}
                          className="w-full h-8 text-xs"
                        >
                          <Upload className="h-3 w-3 mr-1" />
                          Upload Stamp
                        </Button>
                        {stamp && (
                          <div className="relative">
                            <ImageWithFallback 
                              src={stamp} 
                              alt="Stamp" 
                              className="h-16 w-auto object-contain border rounded"
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="absolute top-0 right-0 h-6 w-6"
                              onClick={() => setStamp("")}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Items */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quotation Items</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {items.map((item, index) => (
                      <Card key={item.id} className="border">
                        <CardContent className="pt-3 pb-3">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="text-xs font-medium">Item #{index + 1}</h4>
                              <Badge variant={item.isManual ? "default" : "secondary"} className="text-xs">
                                {item.isManual ? "Manual" : "From Inventory"}
                              </Badge>
                              {!item.isManual && (
                                <div className="w-52">
                                  <Select 
                                    value={(item as any).inventoryItem?.id || undefined}
                                    onValueChange={(value) => loadItemFromInventory(item.id, value)}
                                  >
                                    <SelectTrigger className="h-8">
                                      <SelectValue placeholder="Select product..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {dbInventory.length === 0 ? (
                                        <SelectItem disabled value="__none__">No items in inventory yet</SelectItem>
                                      ) : (
                                        dbInventory.map((p: any) => (
                                          <SelectItem key={p.product_code} value={p.product_code}>
                                            {p.en_prod_name || p.ar_prod_name || p.product_code}
                                          </SelectItem>
                                        ))
                                      )}
                                    </SelectContent>
                                  </Select>
                                </div>
                              )}
                            </div>
                            {items.length > 1 && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => removeItem(item.id)}
                                title="Remove item"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-destructive" />
                              </Button>
                            )}
                          </div>

                          <div className="grid grid-cols-4 gap-3 items-end">
                            <div className="space-y-1">
                              <Label className="text-xs">Image</Label>
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => handleItemImageUpload(item.id, e)}
                                className="hidden"
                                id={`item-image-${item.id}`}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => document.getElementById(`item-image-${item.id}`)?.click()}
                                className="w-full h-8 text-xs"
                              >
                                <Upload className="h-3 w-3 mr-1" />
                                Upload
                              </Button>
                              {item.image && (
                                <div className="relative">
                                  <ImageWithFallback 
                                    src={item.image} 
                                    alt="Product"
                                    className="h-12 w-12 rounded object-cover border"
                                  />
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="absolute -top-1 -right-1 h-5 w-5"
                                    onClick={() => updateItemImage(item.id, "")}
                                  >
                                    <X className="h-3 w-3" />
                                  </Button>
                                </div>
                              )}
                            </div>
                            <div className="col-span-3 space-y-1">
                              <Label className="text-xs">Description *</Label>
                              <Input 
                                value={item.description} 
                                onChange={(e) => updateItem(item.id, "description", e.target.value)}
                                placeholder="Product or service description"
                                className="h-8 text-sm"
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-4 gap-3 mt-3 items-end">
                            <div className="space-y-1">
                              <Label className="text-xs">Quantity *</Label>
                              <Input 
                                type="number" 
                                min="1"
                                value={item.quantity} 
                                onChange={(e) => updateItem(item.id, "quantity", parseInt(e.target.value) || 1)}
                                className="h-8 text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">Unit Price (SAR) *</Label>
                              <Input 
                                type="number" 
                                min="0"
                                step="0.01"
                                value={item.unitPrice} 
                                onChange={(e) => updateItem(item.id, "unitPrice", parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs">Discount %</Label>
                              <Input 
                                type="number" 
                                min="0"
                                max="100"
                                value={item.discountPercent} 
                                onChange={(e) => updateItem(item.id, "discountPercent", parseFloat(e.target.value) || 0)}
                                className="h-8 text-sm"
                              />
                            </div>

                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Total</Label>
                              <div className="h-8 flex items-center">
                                <p className="text-sm font-medium text-primary">SAR {item.total.toFixed(2)}</p>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}

                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={addManualItem} variant="outline" size="sm" className="w-full h-8 text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Add Manual Item
                      </Button>
                      <Button onClick={addInventoryItem} variant="outline" size="sm" className="w-full h-8 text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Add from Inventory
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <Textarea 
                      value={notes} 
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Additional notes..."
                      rows={2}
                      className="text-sm"
                    />
                  </CardContent>
                </Card>

                {/* Terms & Conditions */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Terms & Conditions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="p-4 rounded-lg" style={{ backgroundColor: '#f3f4f6' }}>
                      <Textarea 
                        value={termsAndConditions} 
                        onChange={(e) => setTermsAndConditions(e.target.value)}
                        placeholder="Enter terms and conditions..."
                        rows={3}
                        className="text-sm resize-none border-none bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Summary */}
                <Card className="bg-muted/30">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Quotation Summary</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Subtotal:</span>
                        <span className="font-medium">SAR {totals.totalBeforeDiscount.toFixed(2)}</span>
                      </div>
                      {totals.totalDiscount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Discount:</span>
                          <span className="font-medium text-destructive">- SAR {totals.totalDiscount.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">After Discount:</span>
                        <span className="font-medium">SAR {totals.totalAfterDiscount.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">VAT (15%):</span>
                        <span className="font-medium">SAR {totals.totalVAT.toFixed(2)}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between text-sm">
                        <span className="font-semibold">Grand Total:</span>
                        <span className="font-bold text-primary">SAR {totals.grandTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t mt-3 flex-shrink-0">
              <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} className="h-9">Cancel</Button>
              <Button onClick={handleCreateQuotation} className="h-9 bg-purple-600 hover:bg-purple-700 text-white">Create Quotation</Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Quotations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{quotations.length}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">
              {quotations.filter(q => q.status === "sent").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Sent to customers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {quotations.filter(q => q.status === "pending").length}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting action</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              SAR {quotations.reduce((sum, q) => sum + q.grandTotal, 0).toFixed(0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">All quotations</p>
          </CardContent>
        </Card>
      </div>

      {/* Quotations List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Quotations</CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search quotations..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-[250px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="sent">📤 Sent</SelectItem>
                  <SelectItem value="pending">⏳ Pending</SelectItem>
                  <SelectItem value="cancelled">❌ Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <div>Loading quotations...</div>}
          {loadError && <div className="text-red-500">{loadError}</div>}
          {quotations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">No quotations found</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quotation #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Valid Until</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Convert</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredQuotations.map((quotation) => {
                  const isExpired = new Date(quotation.expiryDate) < new Date();
                  
                  return (
                  <TableRow key={quotation.id}>
                    <TableCell className="font-medium">{quotation.quotationNumber}</TableCell>
                    <TableCell>{quotation.customerName}</TableCell>
                    <TableCell>{new Date(quotation.date).toLocaleDateString('en-GB')}</TableCell>
                    <TableCell className={isExpired ? "text-red-600 font-semibold" : ""}>
                      {new Date(quotation.expiryDate).toLocaleDateString('en-GB')}
                      {isExpired && <span className="ml-2 text-xs">(Expired)</span>}
                    </TableCell>
                    <TableCell>SAR {quotation.grandTotal.toFixed(2)}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`${
                            quotation.status === "sent" 
                              ? "bg-blue-50 text-blue-700 border-blue-200" 
                              : quotation.status === "pending" 
                              ? "bg-yellow-50 text-yellow-700 border-yellow-200" 
                              : "bg-red-50 text-red-700 border-red-200"
                          }`}
                        >
                          {quotation.status === "sent" ? "📤 Sent" : 
                           quotation.status === "pending" ? "⏳ Pending" : 
                           "❌ Cancelled"}
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-6 w-6">
                              <MoreVertical className="h-3.5 w-3.5" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleStatusChange(quotation.id, "sent")}>
                              📤 Mark as Sent
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(quotation.id, "pending")}>
                              ⏳ Mark as Pending
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleStatusChange(quotation.id, "cancelled")}>
                              ❌ Mark as Cancelled
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => convertToInvoice(quotation)}
                        disabled={quotation.status === "cancelled"}
                        className="gap-1.5"
                      >
                        <FileText className="h-4 w-4" />
                        To Invoice
                      </Button>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setSelectedQuotation(quotation);
                            setIsViewDialogOpen(true);
                          }}
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => void printQuotation(quotation)}
                          title="Print"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            const subject = `Quotation ${quotation.quotationNumber} - ${quotation.customerName}`;
                            const body = `Dear ${quotation.customerName},\n\nPlease find attached quotation ${quotation.quotationNumber} for your review.\n\nQuotation Details:\n- Date: ${new Date(quotation.date).toLocaleDateString('en-GB')}\n- Valid Until: ${new Date(quotation.expiryDate).toLocaleDateString('en-GB')}\n- Total Amount: SAR ${quotation.grandTotal.toFixed(2)}\n\nThank you for your business.\n\nBest regards,\nMana Smart Trading`;
                            window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
                            toast.success("Opening email client...");
                          }}
                          title="Send Email"
                        >
                          <Send className="h-4 w-4" />
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

      {/* View Quotation Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedQuotation && (
            <>
              <DialogHeader>
                <DialogTitle>Quotation Details - {selectedQuotation.quotationNumber}</DialogTitle>
                <DialogDescription>
                  Customer: {selectedQuotation.customerName} | Date: {new Date(selectedQuotation.date).toLocaleDateString('en-GB')}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
              {/* Customer Info */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Customer Information</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Name:</span>
                    <p className="font-medium">{selectedQuotation.customerName}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Mobile:</span>
                    <p className="font-medium">{selectedQuotation.mobile}</p>
                  </div>
                  {selectedQuotation.location && (
                    <div>
                      <span className="text-muted-foreground">Location:</span>
                      <p className="font-medium">{selectedQuotation.location}</p>
                    </div>
                  )}
                  {selectedQuotation.commercialRegister && (
                    <div>
                      <span className="text-muted-foreground">C.R.:</span>
                      <p className="font-medium">{selectedQuotation.commercialRegister}</p>
                    </div>
                  )}
                  {selectedQuotation.taxNumber && (
                    <div>
                      <span className="text-muted-foreground">VAT:</span>
                      <p className="font-medium">{selectedQuotation.taxNumber}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">Valid Until:</span>
                    <p className={`font-medium ${new Date(selectedQuotation.expiryDate) < new Date() ? 'text-red-600' : ''}`}>
                      {new Date(selectedQuotation.expiryDate).toLocaleDateString('en-GB')}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Items */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                        <TableHead className="text-center">Disc %</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedQuotation.items.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {item.image && (
                                <ImageWithFallback 
                                  src={item.image} 
                                  alt={item.description}
                                  className="w-10 h-10 rounded object-cover"
                                />
                              )}
                              <span>{item.description}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{item.quantity}</TableCell>
                          <TableCell className="text-right">SAR {item.unitPrice.toFixed(2)}</TableCell>
                          <TableCell className="text-center">{item.discountPercent}%</TableCell>
                          <TableCell className="text-right font-medium">SAR {item.total.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Summary */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Subtotal:</span>
                    <span>SAR {selectedQuotation.totalBeforeDiscount.toFixed(2)}</span>
                  </div>
                  {selectedQuotation.totalDiscount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Discount:</span>
                      <span className="text-red-600">- SAR {selectedQuotation.totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">After Discount:</span>
                    <span>SAR {selectedQuotation.totalAfterDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">VAT (15%):</span>
                    <span>SAR {selectedQuotation.totalVAT.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-semibold">
                    <span>Grand Total:</span>
                    <span className="text-primary">SAR {selectedQuotation.grandTotal.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {selectedQuotation.notes && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{selectedQuotation.notes}</p>
                  </CardContent>
                </Card>
              )}

              <div className="flex justify-end gap-2 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button onClick={() => void printQuotation(selectedQuotation)}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>
            </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
