import { useState, useMemo, useCallback } from "react";
import { Plus, Search, Printer, Eye, X, Trash2, Settings } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Separator } from "./ui/separator";
import { 
  InvoiceTableSkeleton, 
  InvoiceFormSkeleton, 
  InvoiceDetailSkeleton
} from "./ui/invoice-skeleton";
import { CustomerSelector } from "./CustomerSelector";
import type { Customer } from "./CustomerSelector";
import { 
  useInvoices, 
  useInvoice, 
  useCreateInvoice, 
  useDeleteInvoice,
  useInvoiceStats,
  type InvoiceListFilters,
  type InvoiceWithCustomer 
} from "../hooks/useInvoices";
import { useCustomers } from "../hooks/useCustomers";

// Constants
const VAT_RATE = 0.15;

// Types
interface InvoiceItem {
  id: number;
  isManual: boolean;
  image?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discountPercent: number;
  discountAmount: number;
  discountType: "percentage" | "fixed";
  itemDiscount: number;
  priceAfterDiscount: number;
  subtotal: number;
  vat: number;
  total: number;
}


export function InvoicesOptimized() {
  // State management
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<InvoiceWithCustomer | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>();
  
  // Form states
  const [invoiceDate, setInvoiceDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [customerName, setCustomerName] = useState("");
  const [mobile, setMobile] = useState("");
  const [location, setLocation] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
    const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [stamp, setStamp] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([{
    id: 1,
    isManual: true,
    description: "",
    quantity: 1,
    unitPrice: 0,
    discountPercent: 0,
    discountAmount: 0,
    discountType: "percentage",
    itemDiscount: 0,
    priceAfterDiscount: 0,
    subtotal: 0,
    vat: 0,
    total: 0
  }]);
  const [vatEnabled] = useState(true);
  const [paidAmount, setPaidAmount] = useState("");

  // Optimized data fetching with TanStack Query
  const filters: InvoiceListFilters = useMemo(() => ({
    page: currentPage,
    limit: 20,
    status: statusFilter as any,
    search: searchQuery,
    orderBy: 'created_at.desc'
  }), [currentPage, statusFilter, searchQuery]);

  const {
    data: invoicesData,
    isLoading: isInvoicesLoading,
    error: invoicesError,
    refetch: refetchInvoices
  } = useInvoices(filters);

  const { data: stats } = useInvoiceStats({ 
    status: statusFilter !== 'all' ? statusFilter as any : undefined 
  });

  const { data: customersData, isLoading: isCustomersLoading } = useCustomers({ 
    limit: 100 
  });

  
  const { data: selectedInvoiceData, isLoading: isSelectedInvoiceLoading } = useInvoice(
    selectedInvoice?.invoice_id || '', 
    isViewDialogOpen && !!selectedInvoice?.invoice_id
  );

  // Mutations
  const createInvoiceMutation = useCreateInvoice();
  const deleteInvoiceMutation = useDeleteInvoice();

  // Search hooks for dropdowns
  // Note: CustomerSelector handles its own search internally

  // Computed values
  const customers = useMemo(() => {
    return customersData?.customers || [];
  }, [customersData]);

  
  const invoices = useMemo(() => {
    return invoicesData?.invoices || [];
  }, [invoicesData]);

  const totalPages = useMemo(() => {
    return invoicesData?.totalPages || 1;
  }, [invoicesData]);

  
  // Calculate invoice totals
  const calculateInvoiceTotals = useCallback(() => {
    const totalBeforeDiscount = items.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const totalAfterDiscount = items.reduce((sum, item) => sum + item.subtotal, 0);
    const totalDiscount = totalBeforeDiscount - totalAfterDiscount;
    const totalVAT = items.reduce((sum, item) => sum + item.vat, 0);
    const grandTotal = items.reduce((sum, item) => sum + item.total, 0);

    return { totalBeforeDiscount, totalDiscount, totalAfterDiscount, totalVAT, grandTotal };
  }, [items]);

  const totals = calculateInvoiceTotals();

  // Event handlers
  const handleCreateInvoice = useCallback(async () => {
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

    const paid = parseFloat(paidAmount) || 0;
    if (paid > totals.grandTotal) {
      toast.error(`Paid amount cannot exceed grand total of ${totals.grandTotal.toFixed(2)} ر.س`);
      return;
    }

    let status: "paid" | "partial" | "draft" = "draft";
    if (paid >= totals.grandTotal) {
      status = "paid";
    } else if (paid > 0) {
      status = "partial";
    }

    try {
      const invoiceData = {
        customer_id: selectedCustomerId,
        invoice_items: items.map(item => ({
          id: item.id,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPercent: item.discountType === "percentage" ? item.discountPercent : 0,
          discountAmount: item.discountType === "fixed" ? item.discountAmount : 0,
          priceAfterDiscount: item.priceAfterDiscount,
          subtotal: item.subtotal,
          vat: item.vat,
          total: item.total,
          image: item.image || null,
        })),
        invoice_date: invoiceDate,
        due_date: invoiceDate,
        tax_rate: vatEnabled ? VAT_RATE : 0,
        vat_enabled: vatEnabled,
        subtotal: totals.totalBeforeDiscount,
        tax_amount: totals.totalVAT,
        total_amount: totals.grandTotal,
        paid_amount: paid,
        invoice_notes: notes.trim() || null,
        payment_status: status,
        company_logo: companyLogo || null,
        company_stamp: stamp || null,
      };

      await createInvoiceMutation.mutateAsync(invoiceData);
      
      // Reset form
      setCustomerName("");
      setMobile("");
      setLocation("");
            setTaxNumber("");
      setNotes("");
      setPaidAmount("");
      setItems([{
        id: 1,
        isManual: true,
        description: "",
        quantity: 1,
        unitPrice: 0,
        discountPercent: 0,
        discountAmount: 0,
        discountType: "percentage",
        itemDiscount: 0,
        priceAfterDiscount: 0,
        subtotal: 0,
        vat: 0,
        total: 0
      }]);
      setIsCreateDialogOpen(false);
      
    } catch (error) {
      console.error('Failed to create invoice:', error);
    }
  }, [customerName, mobile, items, totals, paidAmount, taxNumber, selectedCustomerId, invoiceDate, vatEnabled, notes, companyLogo, stamp, createInvoiceMutation, invoices.length]);

  const handleDeleteInvoice = useCallback(async (invoice: InvoiceWithCustomer) => {
    if (!confirm(`Are you sure you want to delete invoice ${invoice.invoice_id}?`)) {
      return;
    }
    
    try {
      await deleteInvoiceMutation.mutateAsync(invoice.invoice_id);
    } catch (error) {
      console.error('Failed to delete invoice:', error);
    }
  }, [deleteInvoiceMutation]);

  const handleViewInvoice = useCallback((invoice: InvoiceWithCustomer) => {
    setSelectedInvoice(invoice);
    setIsViewDialogOpen(true);
  }, []);

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          setStamp(result);
          toast.success("Stamp uploaded successfully");
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading stamp:', error);
      toast.error("Failed to upload stamp");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          setCompanyLogo(result);
          toast.success("Logo uploaded successfully");
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error uploading logo:', error);
      toast.error("Failed to upload logo");
    }
  };

  const handlePageChange = useCallback((page: number) => {
    setCurrentPage(page);
  }, []);

  // Calculate item totals
  const calculateItemTotals = useCallback((item: Partial<InvoiceItem>) => {
    const quantity = item.quantity || 0;
    const unitPrice = item.unitPrice || 0;
    const discountType = item.discountType || "percentage";
    const discountPercent = item.discountPercent || 0;
    const discountAmount = item.discountAmount || 0;
    
    const subtotal = quantity * unitPrice;
    
    let itemDiscount = 0;
    if (discountType === "percentage") {
      itemDiscount = subtotal * (Math.min(100, Math.max(0, discountPercent)) / 100);
    } else {
      itemDiscount = Math.min(subtotal, Math.max(0, discountAmount));
    }
    
    const priceAfterDiscount = unitPrice - (discountType === "percentage" ? unitPrice * (discountPercent / 100) : Math.min(unitPrice, discountAmount));
    const finalSubtotal = priceAfterDiscount * quantity;
    const vat = vatEnabled ? finalSubtotal * VAT_RATE : 0;
    const total = finalSubtotal + vat;

    return {
      discountType,
      discountPercent,
      discountAmount,
      itemDiscount,
      priceAfterDiscount,
      subtotal: finalSubtotal,
      vat,
      total
    };
  }, [vatEnabled]);

  // Update item
  const updateItem = useCallback((id: number, field: string, value: any) => {
    setItems(currentItems => currentItems.map(item => {
      if (item.id === id) {
        const updated = { ...item, [field]: value };
        const totals = calculateItemTotals(updated);
        return { ...updated, ...totals };
      }
      return item;
    }));
  }, [calculateItemTotals]);

  // Add item
  const addManualItem = useCallback(() => {
    setItems(currentItems => [...currentItems, {
      id: Date.now(),
      isManual: true,
      description: "",
      quantity: 1,
      unitPrice: 0,
      discountPercent: 0,
      discountAmount: 0,
      discountType: "percentage",
      itemDiscount: 0,
      priceAfterDiscount: 0,
      subtotal: 0,
      vat: 0,
      total: 0
    }]);
  }, []);

  const removeItem = useCallback((id: number) => {
    setItems(currentItems => {
      if (currentItems.length > 1) {
        return currentItems.filter(item => item.id !== id);
      }
      return currentItems;
    });
  }, []);

  // Handle customer selection
  const handleCustomerSelect = useCallback((customer: Customer) => {
    setSelectedCustomerId(customer.id?.toString());
    setCustomerName(customer.name);
    setMobile(customer.mobile);
    setLocation(customer.location || "");
        setTaxNumber(customer.taxNumber || "");
  }, []);

  // Handle loading and error states
  if (invoicesError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Error Loading Invoices</h2>
          <p className="text-sm text-muted-foreground">
            {invoicesError.message || 'Failed to load invoices. Please try again.'}
          </p>
          <Button onClick={() => refetchInvoices()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with stats */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Invoices</h1>
          <p className="text-muted-foreground">
            Manage your invoices and track payments
          </p>
        </div>
        
        {stats && (
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <p className="text-sm font-medium">Total Amount</p>
              <p className="text-2xl font-bold">SAR {stats.totalAmount.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Paid Amount</p>
              <p className="text-2xl font-bold text-green-600">SAR {stats.paidAmount.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Unpaid Amount</p>
              <p className="text-2xl font-bold text-red-600">SAR {stats.unpaidAmount.toFixed(2)}</p>
            </div>
          </div>
        )}
      </div>

      {/* Filters and search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search invoices..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New Invoice
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoices table */}
      {isInvoicesLoading ? (
        <InvoiceTableSkeleton />
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoices.map((invoice) => (
                  <TableRow key={invoice.invoice_id}>
                    <TableCell className="font-medium">
                      {invoice.invoice_id.slice(0, 8)}...
                    </TableCell>
                    <TableCell>{invoice.customer?.customer_name || 'Unknown'}</TableCell>
                    <TableCell>
                      {new Date(invoice.invoice_date || invoice.created_at || '').toLocaleDateString()}
                    </TableCell>
                    <TableCell>SAR {invoice.total_amount?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={
                          invoice.payment_status === 'paid' ? 'default' :
                          invoice.payment_status === 'partial' ? 'secondary' : 'outline'
                        }
                      >
                        {invoice.payment_status || 'draft'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleViewInvoice(invoice)}>
                            <Eye className="mr-2 h-4 w-4" />
                            View
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleDeleteInvoice(invoice)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </p>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage - 1)}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Create Invoice Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Create New Invoice</DialogTitle>
            <DialogDescription>
              Create a new invoice for your customer
            </DialogDescription>
          </DialogHeader>
          
          {isCustomersLoading ? (
            <InvoiceFormSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Customer Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="customerName">Customer Name *</Label>
                      <CustomerSelector
                        customers={customers.map((c, idx) => ({
                          id: idx + 1,
                          name: c.customer_name,
                          company: c.company || "",
                          mobile: c.contact_num || "",
                          email: c.customer_email || "",
                          location: c.customer_address || "",
                                                    taxNumber: c.vat_number || "",
                          status: (c.status as any) || "active",
                        }))}
                        onCustomerSelect={handleCustomerSelect}
                      />
                    </div>
                    <div>
                      <Label htmlFor="mobile">Mobile Number *</Label>
                      <Input
                        id="mobile"
                        value={mobile}
                        onChange={(e) => setMobile(e.target.value)}
                        placeholder="+966 5X XXX XXXX"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="location">Location</Label>
                      <Input
                        id="location"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                        placeholder="Customer address"
                      />
                    </div>
                    <div>
                      <Label htmlFor="invoiceDate">Invoice Date</Label>
                      <Input
                        id="invoiceDate"
                        type="date"
                        value={invoiceDate}
                        onChange={(e) => setInvoiceDate(e.target.value)}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Items */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Items</CardTitle>
                  <Button onClick={addManualItem} size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
                </CardHeader>
                <CardContent className="space-y-4">
                  {items.map((item) => (
                    <div key={item.id} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-5">
                        <Input
                          placeholder="Item description"
                          value={item.description}
                          onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          placeholder="Qty"
                          value={item.quantity}
                          onChange={(e) => updateItem(item.id, 'quantity', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          placeholder="Unit Price"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, 'unitPrice', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <Input
                          type="number"
                          placeholder="Discount %"
                          value={item.discountPercent}
                          onChange={(e) => updateItem(item.id, 'discountPercent', parseFloat(e.target.value) || 0)}
                        />
                      </div>
                      <div className="text-right font-medium">
                        SAR {item.total.toFixed(2)}
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeItem(item.id)}
                        disabled={items.length === 1}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Totals */}
              <Card>
                <CardHeader>
                  <CardTitle>Invoice Totals</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>SAR {totals.totalBeforeDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Discount:</span>
                    <span>SAR {totals.totalDiscount.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT (15%):</span>
                    <span>SAR {totals.totalVAT.toFixed(2)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Grand Total:</span>
                    <span>SAR {totals.grandTotal.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Notes and Terms */}
              <Card>
                <CardHeader>
                  <CardTitle>Additional Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Additional notes for the customer"
                      rows={3}
                    />
                  </div>
                  <div>
                    <Label htmlFor="logo">Company Logo</Label>
                    <div className="flex items-center space-x-4">
                      <Input
                        id="logo"
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {companyLogo && (
                        <div className="flex items-center space-x-2">
                          <img src={companyLogo} alt="Logo" className="h-12 w-12 object-cover rounded border" />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setCompanyLogo(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="stamp">Company Stamp</Label>
                    <div className="flex items-center space-x-4">
                      <Input
                        id="stamp"
                        type="file"
                        accept="image/*"
                        onChange={handleStampUpload}
                        className="file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                      />
                      {stamp && (
                        <div className="flex items-center space-x-2">
                          <img src={stamp} alt="Stamp" className="h-12 w-12 object-cover rounded border" />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setStamp(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="paidAmount">Paid Amount</Label>
                    <Input
                      id="paidAmount"
                      type="number"
                      value={paidAmount}
                      onChange={(e) => setPaidAmount(e.target.value)}
                      placeholder="Amount already paid"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleCreateInvoice}
                  disabled={createInvoiceMutation.isPending}
                >
                  {createInvoiceMutation.isPending ? 'Creating...' : 'Create Invoice'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* View Invoice Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
          </DialogHeader>
          
          {isSelectedInvoiceLoading ? (
            <InvoiceDetailSkeleton />
          ) : selectedInvoiceData ? (
            <div className="space-y-6">
              {/* Invoice header */}
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold">Invoice</h2>
                  <p className="text-muted-foreground">ID: {selectedInvoiceData.invoice_id}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Date</p>
                  <p className="font-medium">
                    {new Date(selectedInvoiceData.invoice_date || selectedInvoiceData.created_at || '').toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Customer info */}
              <Card>
                <CardHeader>
                  <CardTitle>Customer Information</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Name</p>
                      <p className="font-medium">{selectedInvoiceData.customer?.customer_name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Contact</p>
                      <p className="font-medium">{selectedInvoiceData.customer?.contact_num || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Address</p>
                      <p className="font-medium">{selectedInvoiceData.customer?.customer_address || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">VAT Number</p>
                      <p className="font-medium">{selectedInvoiceData.customer?.vat_number || 'N/A'}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Items */}
              <Card>
                <CardHeader>
                  <CardTitle>Items</CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Description</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>Unit Price</TableHead>
                        <TableHead>Discount</TableHead>
                        <TableHead>Subtotal</TableHead>
                        <TableHead>VAT</TableHead>
                        <TableHead>Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {Array.isArray(selectedInvoiceData.invoice_items) && 
                       selectedInvoiceData.invoice_items.map((item: any, index: number) => (
                        <TableRow key={index}>
                          <TableCell>{item.description}</TableCell>
                          <TableCell>{item.quantity}</TableCell>
                          <TableCell>SAR {item.unitPrice?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell>
                            {item.discountPercent > 0 ? `${item.discountPercent}%` : 
                             item.discountAmount > 0 ? `SAR ${item.discountAmount.toFixed(2)}` : '-'}
                          </TableCell>
                          <TableCell>SAR {item.subtotal?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell>SAR {item.vat?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell>SAR {item.total?.toFixed(2) || '0.00'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Totals */}
              <Card>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex justify-between">
                    <span>Subtotal:</span>
                    <span>SAR {selectedInvoiceData.subtotal?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>VAT ({selectedInvoiceData.tax_rate ? (selectedInvoiceData.tax_rate * 100).toFixed(0) : '15'}%):</span>
                    <span>SAR {selectedInvoiceData.tax_amount?.toFixed(2) || '0.00'}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-lg">
                    <span>Total Amount:</span>
                    <span>SAR {selectedInvoiceData.total_amount?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Paid Amount:</span>
                    <span>SAR {selectedInvoiceData.paid_amount?.toFixed(2) || '0.00'}</span>
                  </div>
                  <div className="flex justify-between font-medium">
                    <span>Remaining Amount:</span>
                    <span>SAR {Math.max(0, (selectedInvoiceData.total_amount || 0) - (selectedInvoiceData.paid_amount || 0)).toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Notes */}
              {selectedInvoiceData.invoice_notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>{selectedInvoiceData.invoice_notes}</p>
                  </CardContent>
                </Card>
              )}

              {/* Actions */}
              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>
                  Close
                </Button>
                <Button>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
