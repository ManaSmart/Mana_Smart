import { useState, useEffect, useMemo, useCallback } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Phone, Mail, MapPin, Building2, Filter, Eye, FileText, Send, MessageSquare, User } from "lucide-react";
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
import { supabase } from "../lib/supabaseClient";
import type { MessageTemplateRow, MessageTemplateType, MessageTemplateCategory } from "../../supabase/models/message_templates";
import { mockMessageTemplates, type MessageTemplateSeed } from "../data/mockMessageTemplates";

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
}

interface MessageTemplate {
  id: string;
  name: string;
  category: MessageTemplateCategory;
  content: string;
  type: MessageTemplateType;
  subject?: string | null;
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
      };
    });
  }, [dbCustomers, dbDelegates]);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [messageTemplates, setMessageTemplates] = useState<MessageTemplate[]>(fallbackTemplates);
  const [templatesLoading, setTemplatesLoading] = useState(false);

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

  const handleSaveEdit = () => {
    if (!editingCustomer?.dbId) return;
    const values: any = {
      customer_name: editingCustomer.name,
      company: editingCustomer.company,
      contact_num: editingCustomer.mobile,
      customer_email: editingCustomer.email,
      customer_address: editingCustomer.location,
      contract_type: (editingCustomer.contractType || '').toLowerCase(),
      monthly_amount: editingCustomer.monthlyAmount,
      status: editingCustomer.status,
      delegate_id: editingCustomer.delegateDbId || null,
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
                };
                dispatch(thunks.customers.createOne(values))
                  .unwrap()
                  .then(() => {
                    setIsCreateDialogOpen(false);
                    setCreateForm({ name: '', company: '', mobile: '', email: '', location: '', contractType: '', monthlyAmount: '', delegateId: '' });
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
              {filteredCustomers.map((customer) => (
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
                          <DropdownMenuItem onClick={() => toast.info("View contract")}>
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
              ))}
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
    </div>
  );
}

