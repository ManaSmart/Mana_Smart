import { useState, useEffect, useMemo } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Phone, Mail, Calendar, Eye, Download, User } from "lucide-react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Avatar, AvatarFallback } from "./ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { thunks, selectors } from "../redux-toolkit/slices";
import type { Delegates } from "../../supabase/models/delegates";
import type { Customers } from "../../supabase/models/customers";
import type { MonthlyVisits } from "../../supabase/models/monthly_visits";

interface AssignedCustomer {
  id: number;
  name: string;
  company: string;
  mobile: string;
  status: "active" | "inactive";
  lastVisit: string;
  nextVisit: string;
}

interface Representative {
  id: number;
  dbId?: string;
  name: string;
  phone: string;
  email: string;
  area: string;
  activeClients: number;
  inactiveClients: number;
  monthlyVisits: number;
  status: "Active" | "On Leave" | "Inactive";
  assignedCustomers: AssignedCustomer[];
}


export function Representatives() {
  const dispatch = useAppDispatch();
  const dbDelegates = useAppSelector(selectors.delegates.selectAll) as Delegates[];
  const dbCustomers = useAppSelector(selectors.customers.selectAll) as Customers[];
  const dbVisits = useAppSelector(selectors.monthly_visits.selectAll) as MonthlyVisits[];
  const delegatesLoading = useAppSelector(selectors.delegates.selectLoading);

  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedRep, setSelectedRep] = useState<Representative | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [customerFilter, setCustomerFilter] = useState<"all" | "active" | "inactive">("all");

  // Load data from database
  useEffect(() => {
    dispatch(thunks.delegates.fetchAll(undefined));
    dispatch(thunks.customers.fetchAll(undefined));
    dispatch(thunks.monthly_visits.fetchAll(undefined));
  }, [dispatch]);

  // Map database delegates to UI Representatives with calculated statistics
  const representatives: Representative[] = useMemo(() => {
    return dbDelegates.map((delegate, idx) => {
      // Get customers assigned to this delegate
      const assignedCustomers = dbCustomers.filter(c => c.delegate_id === delegate.delegate_id);
      
      // Calculate active/inactive clients
      const activeClients = assignedCustomers.filter(c => c.status === "active").length;
      const inactiveClients = assignedCustomers.filter(c => c.status === "inactive" || c.status === "pending").length;
      
      // Calculate monthly visits (visits in current month for this delegate)
      const currentMonth = new Date().getMonth();
      const currentYear = new Date().getFullYear();
      const monthlyVisits = dbVisits.filter(v => {
        if (v.delegate_id !== delegate.delegate_id) return false;
        const visitDate = new Date(v.visit_date);
        return visitDate.getMonth() === currentMonth && visitDate.getFullYear() === currentYear;
      }).length;

      // Map assigned customers to UI format
      const mappedCustomers: AssignedCustomer[] = assignedCustomers.map((customer, cIdx) => {
        // Get last and next visit for this customer
        const customerVisits = dbVisits
          .filter(v => v.customer_id === customer.customer_id)
          .sort((a, b) => new Date(b.visit_date).getTime() - new Date(a.visit_date).getTime());
        
        const lastVisit = customerVisits.length > 0 
          ? customerVisits[0].visit_date 
          : customer.customer_last_visit || new Date().toISOString().split('T')[0];
        
        // Find next upcoming visit
        const upcomingVisits = customerVisits
          .filter(v => new Date(v.visit_date) >= new Date())
          .sort((a, b) => new Date(a.visit_date).getTime() - new Date(b.visit_date).getTime());
        const nextVisit = upcomingVisits.length > 0 
          ? upcomingVisits[0].visit_date 
          : "N/A";

        return {
          id: cIdx + 1,
          name: customer.customer_name || customer.company || "",
          company: customer.company || "",
          mobile: customer.contact_num || "",
          status: (customer.status === "active" ? "active" : "inactive") as "active" | "inactive",
          lastVisit,
          nextVisit,
        };
      });

      return {
        id: idx + 1,
        dbId: delegate.delegate_id,
        name: delegate.delegate_name,
        phone: delegate.delegate_phone || "",
        email: delegate.delegate_email || "",
        area: delegate.delegate_region || "",
        activeClients,
        inactiveClients,
        monthlyVisits,
        // Convert database status to UI format (capitalize first letter, handle underscores)
        status: (() => {
          const dbStatus = delegate.status?.toLowerCase() || "active";
          if (dbStatus === "active") return "Active";
          if (dbStatus === "on_leave" || dbStatus === "on leave") return "On Leave";
          if (dbStatus === "inactive") return "Inactive";
          return "Active";
        })() as "Active" | "On Leave" | "Inactive",
        assignedCustomers: mappedCustomers,
      };
    });
  }, [dbDelegates, dbCustomers, dbVisits]);

  const filteredRepresentatives = representatives.filter(rep =>
    rep.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rep.area.toLowerCase().includes(searchQuery.toLowerCase()) ||
    rep.phone.includes(searchQuery)
  );

  // Form states
  const [formName, setFormName] = useState("");
  const [formPhone, setFormPhone] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formArea, setFormArea] = useState("");
  const [formStatus, setFormStatus] = useState<"Active" | "On Leave" | "Inactive">("Active");

  const handleViewCustomers = (rep: Representative) => {
    setSelectedRep(rep);
    setIsViewDialogOpen(true);
  };

  const handleEditRep = (rep: Representative) => {
    setSelectedRep(rep);
    setFormName(rep.name);
    setFormPhone(rep.phone);
    setFormEmail(rep.email);
    setFormArea(rep.area);
    setFormStatus(rep.status);
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedRep || !formName || !formPhone || !formEmail || !formArea) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!selectedRep.dbId) {
      toast.error("Representative ID not found");
      return;
    }

    try {
      // Convert UI status to database format (lowercase)
      const dbStatus = formStatus.toLowerCase().replace(/\s+/g, '_'); // "Active" -> "active", "On Leave" -> "on_leave"
      
      await dispatch(thunks.delegates.updateOne({
        id: selectedRep.dbId,
        values: {
          delegate_name: formName,
          delegate_phone: formPhone,
          delegate_email: formEmail,
          delegate_region: formArea,
          status: dbStatus,
        }
      })).unwrap();

      dispatch(thunks.delegates.fetchAll(undefined));
      setIsEditDialogOpen(false);
      resetForm();
      toast.success("Representative updated successfully!");
    } catch (error: any) {
      console.error('Failed to update representative:', error);
      toast.error(`Failed to update representative: ${error.message || 'Unknown error'}`);
    }
  };

  const handleAddRep = async () => {
    if (!formName || !formPhone || !formEmail || !formArea) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      // Convert UI status to database format (lowercase)
      const dbStatus = formStatus.toLowerCase().replace(/\s+/g, '_'); // "Active" -> "active", "On Leave" -> "on_leave"
      
      const newDelegate = {
        delegate_name: formName,
        delegate_phone: formPhone,
        delegate_email: formEmail,
        delegate_region: formArea,
        status: dbStatus,
      };

      await dispatch(thunks.delegates.createOne(newDelegate)).unwrap();
      dispatch(thunks.delegates.fetchAll(undefined));
      setIsAddDialogOpen(false);
      resetForm();
      toast.success("Representative added successfully!");
    } catch (error: any) {
      console.error('Failed to create representative:', error);
      toast.error(`Failed to create representative: ${error.message || 'Unknown error'}`);
    }
  };

  const handleDeleteRep = async (rep: Representative) => {
    if (!rep.dbId) {
      toast.error("Representative ID not found");
      return;
    }

    // Check if representative has assigned customers
    if (rep.assignedCustomers.length > 0) {
      toast.error("Cannot delete representative with assigned customers. Please reassign customers first.");
      return;
    }

    if (!confirm(`Are you sure you want to delete ${rep.name}? This action cannot be undone.`)) {
      return;
    }

    try {
      await dispatch(thunks.delegates.deleteOne(rep.dbId)).unwrap();
      dispatch(thunks.delegates.fetchAll(undefined));
      toast.success("Representative deleted successfully!");
    } catch (error: any) {
      console.error('Failed to delete representative:', error);
      toast.error(`Failed to delete representative: ${error.message || 'Unknown error'}`);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormPhone("");
    setFormEmail("");
    setFormArea("");
    setFormStatus("Active");
    setSelectedRep(null);
  };

  const getFilteredCustomers = (customers: AssignedCustomer[]) => {
    if (customerFilter === "all") return customers;
    return customers.filter(c => c.status === customerFilter);
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredRepresentatives.map((rep) => ({
        "Name": rep.name,
        "Phone": rep.phone,
        "Email": rep.email,
        "Area": rep.area,
        "Status": rep.status,
        "Active Clients": rep.activeClients,
        "Inactive Clients": rep.inactiveClients,
        "Monthly Visits": rep.monthlyVisits,
        "Total Assigned Customers": rep.assignedCustomers.length,
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 25 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 12 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 20 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Representatives");
      const fileName = `representatives_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2>Representative Management</h2>
          <p className="text-muted-foreground mt-1">Manage representatives, assigned customers and visits</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Dialog open={isAddDialogOpen} onOpenChange={(open) => {
            setIsAddDialogOpen(open);
            if (!open) resetForm();
          }}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="h-4 w-4" />
                Add New Representative
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Representative</DialogTitle>
              <DialogDescription>Enter new representative details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="rep-name">Full Name *</Label>
                <Input 
                  id="rep-name" 
                  placeholder="Enter full name" 
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="rep-phone">Phone Number *</Label>
                  <Input 
                    id="rep-phone" 
                    placeholder="05xxxxxxxx" 
                    value={formPhone}
                    onChange={(e) => setFormPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rep-email">Email *</Label>
                  <Input 
                    id="rep-email" 
                    type="email" 
                    placeholder="email@example.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="rep-area">Coverage Area *</Label>
                <Input 
                  id="rep-area" 
                  placeholder="e.g., Riyadh - North"
                  value={formArea}
                  onChange={(e) => setFormArea(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="rep-status">Status</Label>
                <Select value={formStatus} onValueChange={(value: any) => setFormStatus(value)}>
                  <SelectTrigger id="rep-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="On Leave">On Leave</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddRep} className="bg-purple-600 hover:bg-purple-700 text-white" disabled={delegatesLoading}>
                {delegatesLoading ? "Adding..." : "Add Representative"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Representatives</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{representatives.length}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {representatives.filter(r => r.status === "Active").length} active
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Active Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {representatives.reduce((sum, r) => sum + r.activeClients, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Across all reps</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Inactive Clients</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">
              {representatives.reduce((sum, r) => sum + r.inactiveClients, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Need reactivation</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monthly Visits</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {representatives.reduce((sum, r) => sum + r.monthlyVisits, 0)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">This month</p>
          </CardContent>
        </Card>
      </div>

      {/* Representatives Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>All Representatives</CardTitle>
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search representatives..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 w-[300px]"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Representative</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Active Clients</TableHead>
                  <TableHead>Inactive Clients</TableHead>
                  <TableHead>Monthly Visits</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {delegatesLoading && filteredRepresentatives.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      Loading representatives...
                    </TableCell>
                  </TableRow>
                ) : filteredRepresentatives.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <div className="flex flex-col items-center justify-center py-12">
                        <User className="h-12 w-12 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No representatives found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRepresentatives.map((rep) => (
                  <TableRow key={rep.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="bg-primary/10 text-primary">
                            {rep.name.split(" ").map(n => n[0]).join("").slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{rep.name}</div>
                          <div className="text-sm text-muted-foreground">{rep.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {rep.phone}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {rep.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{rep.area}</TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
                        {rep.activeClients} Active
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">
                        {rep.inactiveClients} Inactive
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                        {rep.monthlyVisits}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        className={
                          rep.status === "Active"
                            ? "bg-green-100 text-green-700 border-green-200"
                            : rep.status === "On Leave"
                            ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                            : "bg-gray-100 text-gray-700 border-gray-200"
                        }
                      >
                        {rep.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewCustomers(rep)}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View Customers
                        </Button>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditRep(rep)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-destructive"
                              onClick={() => handleDeleteRep(rep)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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

      {/* Edit Representative Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={(open) => {
        setIsEditDialogOpen(open);
        if (!open) resetForm();
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Representative</DialogTitle>
            <DialogDescription>Update representative details</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Full Name *</Label>
              <Input 
                id="edit-name" 
                placeholder="Enter full name" 
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-phone">Phone Number *</Label>
                <Input 
                  id="edit-phone" 
                  placeholder="05xxxxxxxx" 
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-email">Email *</Label>
                <Input 
                  id="edit-email" 
                  type="email" 
                  placeholder="email@example.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-area">Coverage Area *</Label>
              <Input 
                id="edit-area" 
                placeholder="e.g., Riyadh - North"
                value={formArea}
                onChange={(e) => setFormArea(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-status">Status</Label>
              <Select value={formStatus} onValueChange={(value: any) => setFormStatus(value)}>
                <SelectTrigger id="edit-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="On Leave">On Leave</SelectItem>
                  <SelectItem value="Inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} className="bg-purple-600 hover:bg-purple-700 text-white" disabled={delegatesLoading}>
              {delegatesLoading ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* View Customers Dialog */}
      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              {selectedRep?.name} - Assigned Customers
            </DialogTitle>
            <DialogDescription>
              View and manage customers assigned to this representative
            </DialogDescription>
          </DialogHeader>

          {selectedRep && (
            <div className="space-y-4">
              {/* Rep Summary */}
              <div className="grid grid-cols-3 gap-4">
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {selectedRep.activeClients}
                      </div>
                      <p className="text-sm text-muted-foreground">Active Clients</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-orange-600">
                        {selectedRep.inactiveClients}
                      </div>
                      <p className="text-sm text-muted-foreground">Inactive Clients</p>
                    </div>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent className="pt-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold">
                        {selectedRep.monthlyVisits}
                      </div>
                      <p className="text-sm text-muted-foreground">Monthly Visits</p>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Customers List */}
              <Tabs value={customerFilter} onValueChange={(v) => setCustomerFilter(v as any)}>
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="all">
                    All ({selectedRep.assignedCustomers.length})
                  </TabsTrigger>
                  <TabsTrigger value="active">
                    Active ({selectedRep.assignedCustomers.filter(c => c.status === "active").length})
                  </TabsTrigger>
                  <TabsTrigger value="inactive">
                    Inactive ({selectedRep.assignedCustomers.filter(c => c.status === "inactive").length})
                  </TabsTrigger>
                </TabsList>

                <TabsContent value={customerFilter} className="mt-4">
                  <div className="rounded-md border overflow-auto max-h-[400px]">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Customer</TableHead>
                          <TableHead>Company</TableHead>
                          <TableHead>Mobile</TableHead>
                          <TableHead>Last Visit</TableHead>
                          <TableHead>Next Visit</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {getFilteredCustomers(selectedRep.assignedCustomers).length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                              No customers found
                            </TableCell>
                          </TableRow>
                        ) : (
                          getFilteredCustomers(selectedRep.assignedCustomers).map((customer) => (
                            <TableRow key={customer.id}>
                              <TableCell>
                                <div className="font-medium">{customer.name}</div>
                              </TableCell>
                              <TableCell>{customer.company}</TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  <Phone className="h-3 w-3 text-muted-foreground" />
                                  {customer.mobile}
                                </div>
                              </TableCell>
                              <TableCell>
                                {new Date(customer.lastVisit).toLocaleDateString('en-GB')}
                              </TableCell>
                              <TableCell>
                                {customer.nextVisit !== "N/A" 
                                  ? new Date(customer.nextVisit).toLocaleDateString('en-GB')
                                  : <span className="text-muted-foreground">N/A</span>
                                }
                              </TableCell>
                              <TableCell>
                                <Badge
                                  className={
                                    customer.status === "active"
                                      ? "bg-green-100 text-green-700 border-green-200"
                                      : "bg-gray-100 text-gray-700 border-gray-200"
                                  }
                                >
                                  {customer.status}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    const whatsappUrl = `https://wa.me/${customer.mobile.replace(/[^0-9]/g, '')}`;
                                    window.open(whatsappUrl, '_blank');
                                  }}
                                >
                                  <Phone className="h-4 w-4 mr-1" />
                                  Contact
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
