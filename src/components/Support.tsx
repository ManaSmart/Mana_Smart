import { useEffect, useMemo, useState } from "react";
import { Plus, MessageSquare, CheckCircle2, Clock, AlertCircle, Eye, Edit, Trash2, LayoutGrid, Table as TableIcon, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "./ui/table";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { CustomerSelector, type Customer } from "./CustomerSelector";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { CustomerSupportTickets } from "../../supabase/models/customer_support_tickets";
import type { Customers } from "../../supabase/models/customers";
import type { Delegates } from "../../supabase/models/delegates";

interface TicketViewModel {
  id: string;
  ticketNumber: string;
  customerId: string | null;
  customerName: string;
  subject: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  status: "New" | "In Progress" | "Completed";
  createdDate: string;
  assignedToId: string | null;
  assignedToName: string | null;
  notes?: string | null;
  resolutionNotes?: string | null;
}

const getStatusColor = (status: string) => {
  switch (status) {
    case "Completed": return "bg-green-100 text-green-700 border-green-200";
    case "In Progress": return "bg-blue-100 text-blue-700 border-blue-200";
    case "New": return "bg-red-100 text-red-700 border-red-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "High": return "bg-red-100 text-red-700 border-red-200";
    case "Medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "Low": return "bg-gray-100 text-gray-700 border-gray-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

export function Support() {
  const dispatch = useAppDispatch();
  const supportTickets = useAppSelector(selectors.customer_support_tickets.selectAll) as CustomerSupportTickets[];
  const customers = useAppSelector(selectors.customers.selectAll) as Customers[];
  const delegates = useAppSelector(selectors.delegates.selectAll) as Delegates[];
  const ticketsLoading = useAppSelector(selectors.customer_support_tickets.selectLoading);
  const ticketsError = useAppSelector(selectors.customer_support_tickets.selectError);
  const [selectedTicket, setSelectedTicket] = useState<TicketViewModel | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "edit" | "view">("add");

  // Form states
  const [formCustomer, setFormCustomer] = useState<string>("");
  const [selectedCustomerObj, setSelectedCustomerObj] = useState<Customer | null>(null);
  const [formSubject, setFormSubject] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formPriority, setFormPriority] = useState<"High" | "Medium" | "Low">("Medium");
  const [formStatus, setFormStatus] = useState<"New" | "In Progress" | "Completed">("New");
  const [formAssignedTo, setFormAssignedTo] = useState<string>("unassigned");
  const [formNotes, setFormNotes] = useState("");
  const [formResolutionNotes, setFormResolutionNotes] = useState("");

  useEffect(() => {
    dispatch(thunks.customer_support_tickets.fetchAll(undefined));
    dispatch(thunks.customers.fetchAll(undefined));
    dispatch(thunks.delegates.fetchAll(undefined));
  }, [dispatch]);

  const tickets = useMemo<TicketViewModel[]>(() => {
    const normalizePriority = (value: string | null | undefined): "High" | "Medium" | "Low" => {
      switch ((value ?? "Medium").toLowerCase()) {
        case "high":
          return "High";
        case "low":
          return "Low";
        default:
          return "Medium";
      }
    };

    const normalizeStatus = (value: string | null | undefined): "New" | "In Progress" | "Completed" => {
      switch ((value ?? "New").toLowerCase()) {
        case "in progress":
        case "in_progress":
          return "In Progress";
        case "completed":
          return "Completed";
        default:
          return "New";
      }
    };

    return supportTickets
      .map((ticket) => {
      const customer = customers.find((c) => c.customer_id === ticket.customer_id);
      const delegate = delegates.find((d) => d.delegate_id === ticket.assigned_to);
      const createdAt = ticket.created_at ?? new Date().toISOString();

      return {
        id: ticket.ticket_id,
        ticketNumber: `TKT-${ticket.ticket_id.slice(0, 8).toUpperCase()}`,
        customerId: ticket.customer_id,
        customerName: customer?.customer_name ?? customer?.company ?? "Unknown customer",
        subject: ticket.subject ?? "",
        description: ticket.description ?? "",
        priority: normalizePriority(ticket.priority),
        status: normalizeStatus(ticket.status),
        createdDate: createdAt,
        assignedToId: ticket.assigned_to,
        assignedToName: delegate?.delegate_name ?? null,
        notes: ticket.notes ?? null,
        resolutionNotes: ticket.resolution_notes ?? null,
      };
    })
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());
  }, [supportTickets, customers, delegates]);

  const filteredTickets = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return tickets.filter((ticket) => {
      const matchesSearch =
        ticket.ticketNumber.toLowerCase().includes(query) ||
        ticket.customerName.toLowerCase().includes(query) ||
        ticket.subject.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query);

      const matchesStatus = statusFilter === "all" || ticket.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [tickets, searchQuery, statusFilter]);

  const resetForm = () => {
    setFormCustomer("");
    setSelectedCustomerObj(null);
    setFormSubject("");
    setFormDescription("");
    setFormPriority("Medium");
    setFormStatus("New");
    setFormAssignedTo("unassigned");
    setFormNotes("");
    setFormResolutionNotes("");
    setSelectedTicket(null);
  };

  const openAddDialog = () => {
    resetForm();
    setMode("add");
    setIsDialogOpen(true);
  };

  const openViewDialog = (ticket: TicketViewModel) => {
    setSelectedTicket(ticket);
    setMode("view");
    setIsDialogOpen(true);
  };

  const openEditDialog = (ticket: TicketViewModel) => {
    setSelectedTicket(ticket);
    setFormCustomer(ticket.customerId ?? "");
    // Find and set the customer object
    const customer = customers.find(c => c.customer_id === ticket.customerId);
    if (customer) {
      setSelectedCustomerObj({
        id: parseInt(customer.customer_id.slice(0, 8), 16) % 1000000, // Generate a temporary ID
        name: customer.customer_name ?? customer.company ?? "",
        company: customer.company ?? "",
        mobile: customer.contact_num ?? "",
        email: customer.customer_email ?? "",
        location: customer.customer_address ?? customer.customer_city_of_residence ?? "",
        commercialRegister: customer.commercial_register ?? "",
        taxNumber: customer.vat_number ?? ""
      });
    }
    setFormSubject(ticket.subject);
    setFormDescription(ticket.description);
    setFormPriority(ticket.priority);
    setFormStatus(ticket.status);
    setFormAssignedTo(ticket.assignedToId ?? "unassigned");
    setFormNotes(ticket.notes ?? "");
    setFormResolutionNotes(ticket.resolutionNotes ?? "");
    setMode("edit");
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formCustomer || !selectedCustomerObj) {
      toast.error("Please select a customer");
      return;
    }

    if (!formSubject || !formDescription) {
      toast.error("Please fill all required fields");
      return;
    }

    const payload: Partial<CustomerSupportTickets> = {
      customer_id: formCustomer || null,
      subject: formSubject,
      description: formDescription,
      priority: formPriority,
      status: formStatus,
      assigned_to: formAssignedTo && formAssignedTo !== "unassigned" ? formAssignedTo : null,
      notes: formNotes ? formNotes : null,
      resolution_notes: formResolutionNotes ? formResolutionNotes : null,
    };

    try {
      if (mode === "add") {
        await dispatch(thunks.customer_support_tickets.createOne(payload)).unwrap();
        toast.success("Ticket created successfully!");
      } else if (mode === "edit" && selectedTicket) {
        await dispatch(
          thunks.customer_support_tickets.updateOne({
            id: selectedTicket.id,
            values: payload,
          })
        ).unwrap();
        toast.success("Ticket updated successfully!");
      }
      setIsDialogOpen(false);
      resetForm();
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save ticket");
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await dispatch(thunks.customer_support_tickets.deleteOne(id)).unwrap();
      toast.success("Ticket deleted successfully!");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to delete ticket");
    }
  };

  const handleStatusChange = async (ticketId: string, newStatus: "New" | "In Progress" | "Completed") => {
    try {
      await dispatch(
        thunks.customer_support_tickets.updateOne({
          id: ticketId,
          values: { status: newStatus },
        })
      ).unwrap();
      toast.success(`Ticket status updated to ${newStatus}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update status");
    }
  };

  const stats = {
    new: tickets.filter(t => t.status === "New").length,
    inProgress: tickets.filter(t => t.status === "In Progress").length,
    completed: tickets.filter(t => t.status === "Completed").length,
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredTickets.map((ticket) => ({
        "Ticket Number": ticket.ticketNumber,
        "Customer Name": ticket.customerName,
        "Subject": ticket.subject,
        "Description": ticket.description,
        "Priority": ticket.priority,
        "Status": ticket.status,
        "Assigned To": ticket.assignedToName || "Unassigned",
        "Created Date": new Date(ticket.createdDate).toLocaleDateString('en-GB'),
        "Notes": ticket.notes || "",
        "Resolution Notes": ticket.resolutionNotes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 18 }, { wch: 25 }, { wch: 30 }, { wch: 40 }, { wch: 12 },
        { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 30 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Support Tickets");
      const fileName = `support_tickets_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2>Customer Support</h2>
          <p className="text-muted-foreground mt-1">Manage customer requests and complaints</p>
        </div>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            <Button
              size="sm"
              variant={viewMode === "cards" ? "default" : "ghost"}
              onClick={() => setViewMode("cards")}
              className="gap-2"
            >
              <LayoutGrid className="h-4 w-4" />
              Cards
            </Button>
            <Button
              size="sm"
              variant={viewMode === "table" ? "default" : "ghost"}
              onClick={() => setViewMode("table")}
              className="gap-2"
            >
              <TableIcon className="h-4 w-4" />
              Table
            </Button>
          </div>
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button onClick={openAddDialog} className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
            <Plus className="h-4 w-4" />
            New Ticket
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("New")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">New Tickets</CardTitle>
            <AlertCircle className="h-5 w-5 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-red-600">{stats.new}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting response</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("In Progress")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
            <Clock className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.inProgress}</div>
            <p className="text-xs text-muted-foreground mt-1">Being handled</p>
          </CardContent>
        </Card>

        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => setStatusFilter("Completed")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.completed}</div>
            <p className="text-xs text-muted-foreground mt-1">Resolved</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex gap-3">
            <Input
              placeholder="Search tickets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="flex-1"
            />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tickets</SelectItem>
                <SelectItem value="New">New</SelectItem>
                <SelectItem value="In Progress">In Progress</SelectItem>
                <SelectItem value="Completed">Completed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {ticketsLoading && (
        <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-4 text-sm text-muted-foreground">
          Loading tickets...
        </div>
      )}

      {ticketsError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          {ticketsError}
        </div>
      )}

      {/* Tickets List - Cards View */}
      {viewMode === "cards" && (
        <div className="grid gap-4">
          {filteredTickets.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No tickets found</p>
              </CardContent>
            </Card>
          ) : (
            filteredTickets.map((ticket) => (
              <Card key={ticket.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm text-muted-foreground">{ticket.ticketNumber}</span>
                            <Badge className={getPriorityColor(ticket.priority)}>
                              {ticket.priority}
                            </Badge>
                            <Badge className={getStatusColor(ticket.status)}>
                              {ticket.status}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-lg">{ticket.subject}</h3>
                        </div>
                      </div>

                      {/* Content */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <span>Customer: <span className="font-medium text-foreground">{ticket.customerName}</span></span>
                          <span>•</span>
                          <span>Date: {new Date(ticket.createdDate).toLocaleDateString('en-GB')}</span>
                          {ticket.assignedToName && (
                            <>
                              <span>•</span>
                              <span>Assigned: <span className="font-medium text-foreground">{ticket.assignedToName}</span></span>
                            </>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">{ticket.description}</p>
                        {ticket.notes && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mt-2">
                            <p className="text-sm text-yellow-800"><strong>Note:</strong> {ticket.notes}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-col gap-2">
                      {ticket.status !== "Completed" && (
                        <Select
                          value={ticket.status}
                          onValueChange={(value) => handleStatusChange(ticket.id, value as "New" | "In Progress" | "Completed")}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="New">New</SelectItem>
                            <SelectItem value="In Progress">In Progress</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => openViewDialog(ticket)}>
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => openEditDialog(ticket)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDelete(ticket.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Tickets List - Table View */}
      {viewMode === "table" && (
        <Card>
          <CardContent className="pt-6">
            {filteredTickets.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12">
                <MessageSquare className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No tickets found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Assigned To</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredTickets.map((ticket) => (
                    <TableRow key={ticket.id}>
                      <TableCell className="font-mono text-sm">{ticket.ticketNumber}</TableCell>
                      <TableCell>{ticket.customerName}</TableCell>
                      <TableCell className="max-w-xs truncate">{ticket.subject}</TableCell>
                      <TableCell>
                        <Badge className={getPriorityColor(ticket.priority)}>
                          {ticket.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {ticket.status !== "Completed" ? (
                          <Select
                            value={ticket.status}
                            onValueChange={(value) => handleStatusChange(ticket.id, value as "New" | "In Progress" | "Completed")}
                          >
                            <SelectTrigger className="w-[130px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="New">New</SelectItem>
                              <SelectItem value="In Progress">In Progress</SelectItem>
                              <SelectItem value="Completed">Completed</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={getStatusColor(ticket.status)}>
                            {ticket.status}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{ticket.assignedToName || "Unassigned"}</TableCell>
                      <TableCell>{new Date(ticket.createdDate).toLocaleDateString('en-GB')}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button size="sm" variant="outline" onClick={() => openViewDialog(ticket)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => openEditDialog(ticket)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleDelete(ticket.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {mode === "add" ? "New Support Ticket" : mode === "edit" ? "Edit Ticket" : "Ticket Details"}
            </DialogTitle>
            <DialogDescription>
              {mode === "add" ? "Create a new customer support ticket" : 
               mode === "edit" ? "Update ticket information" : 
               `Viewing ticket ${selectedTicket?.ticketNumber}`}
            </DialogDescription>
          </DialogHeader>

          {mode === "view" && selectedTicket ? (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-muted-foreground">Ticket Number</Label>
                  <p className="font-mono">{selectedTicket.ticketNumber}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge className={getStatusColor(selectedTicket.status)}>
                      {selectedTicket.status}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Priority</Label>
                  <div className="mt-1">
                    <Badge className={getPriorityColor(selectedTicket.priority)}>
                      {selectedTicket.priority}
                    </Badge>
                  </div>
                </div>
                <div>
                  <Label className="text-muted-foreground">Date</Label>
                  <p>{new Date(selectedTicket.createdDate).toLocaleDateString('en-GB')}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Customer</Label>
                  <p className="font-medium">{selectedTicket.customerName}</p>
                </div>
                <div className="col-span-2">
                  <Label className="text-muted-foreground">Assigned To</Label>
                  <p>{selectedTicket.assignedToName || "Unassigned"}</p>
                </div>
              </div>

              <div>
                <Label className="text-muted-foreground">Subject</Label>
                <p className="font-medium text-lg mt-1">{selectedTicket.subject}</p>
              </div>

              <div>
                <Label className="text-muted-foreground">Description</Label>
                <div className="p-4 border rounded-lg bg-muted/30 mt-1">
                  <p>{selectedTicket.description}</p>
                </div>
              </div>

              {selectedTicket.notes && (
                <div>
                  <Label className="text-muted-foreground">Notes</Label>
                  <div className="p-4 border rounded-lg bg-yellow-50 mt-1">
                    <p className="text-sm">{selectedTicket.notes}</p>
                  </div>
                </div>
              )}

              {selectedTicket.resolutionNotes && (
                <div>
                  <Label className="text-muted-foreground">Resolution</Label>
                  <div className="p-4 border rounded-lg bg-green-50 mt-1">
                    <p className="text-sm">{selectedTicket.resolutionNotes}</p>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Close</Button>
                <Button onClick={() => openEditDialog(selectedTicket)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Edit Ticket
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <CustomerSelector
                    customers={customers.map(c => ({
                      id: parseInt(c.customer_id.slice(0, 8), 16) % 1000000, // Generate a temporary ID
                      name: c.customer_name ?? c.company ?? "Unnamed customer",
                      company: c.company ?? "",
                      mobile: c.contact_num ?? "",
                      email: c.customer_email ?? "",
                      location: c.customer_address ?? c.customer_city_of_residence ?? "",
                      commercialRegister: c.commercial_register ?? "",
                      taxNumber: c.vat_number ?? ""
                    }))}
                    selectedCustomerId={selectedCustomerObj?.id}
                    onCustomerSelect={(customer) => {
                      setSelectedCustomerObj(customer);
                      // Find the actual customer ID from the database
                      const dbCustomer = customers.find(c => 
                        (c.customer_name ?? c.company) === customer.name
                      );
                      if (dbCustomer) {
                        setFormCustomer(dbCustomer.customer_id);
                      }
                    }}
                    label="Customer"
                    placeholder="Search customer by name, company, or mobile..."
                    required={true}
                    hideQuickAdd={true}
                  />
                </div>

                <div>
                  <Label htmlFor="priority">Priority</Label>
                  <Select value={formPriority} onValueChange={(value) => setFormPriority(value as "High" | "Medium" | "Low")}>
                    <SelectTrigger id="priority">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formStatus} onValueChange={(value) => setFormStatus(value as "New" | "In Progress" | "Completed")}>
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="New">New</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="col-span-2">
                  <Label htmlFor="assigned">Assign To</Label>
                  <Select value={formAssignedTo} onValueChange={setFormAssignedTo}>
                    <SelectTrigger id="assigned">
                      <SelectValue placeholder={delegates.length ? "Select representative" : "No delegates available"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="unassigned">Unassigned</SelectItem>
                      {delegates.length === 0 ? (
                        <SelectItem value="no-delegates" disabled>
                          No delegates available
                        </SelectItem>
                      ) : (
                        delegates.map((delegate) => (
                          <SelectItem key={delegate.delegate_id} value={delegate.delegate_id}>
                            {delegate.delegate_name}
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="subject">Subject *</Label>
                <Input
                  id="subject"
                  value={formSubject}
                  onChange={(e) => setFormSubject(e.target.value)}
                  placeholder="Brief description of the issue"
                />
              </div>

              <div>
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  placeholder="Detailed description of the request or complaint"
                  rows={4}
                />
              </div>

              <div>
                <Label htmlFor="notes">Notes (Optional)</Label>
                <Textarea
                  id="notes"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Additional notes or comments"
                  rows={2}
                />
              </div>

              {formStatus === "Completed" && (
                <div>
                  <Label htmlFor="resolution">Resolution Notes</Label>
                  <Textarea
                    id="resolution"
                    value={formResolutionNotes}
                    onChange={(e) => setFormResolutionNotes(e.target.value)}
                    placeholder="How was this ticket resolved?"
                    rows={3}
                  />
                </div>
              )}

              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 text-white">
                  {mode === "add" ? "Create Ticket" : "Save Changes"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
