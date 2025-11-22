import { useEffect, useMemo, useState } from "react";
import { Plus, Search, MoreVertical, Edit, Trash2, Phone, Mail, User, Star, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader } from "./ui/card";
import { ImportExcelButton } from "./ImportExcelButton";
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
import { Textarea } from "./ui/textarea";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { thunks, selectors } from "../redux-toolkit/slices";
import type { Delegates } from "../../supabase/models/delegates";

// Data now comes from Supabase via Redux

const getInterestColor = (interest: string) => {
  switch (interest) {
    case "High":
      return "default";
    case "Medium":
      return "secondary";
    case "Low":
      return "outline";
    default:
      return "secondary";
  }
};

interface Lead {
  id: number;
  dbId?: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  source: string;
  interest: string;
  status: string;
  estimatedValue: string;
  addedDate: string;
  notes: string;
  contactMethod?: string;
  representative?: string;
  representativeId?: number;
  delegateDbId?: string;
}

export function Leads() {
  const dispatch = useAppDispatch();
  const dbLeads = useAppSelector(selectors.leads.selectAll) as any[];
  const dbDelegates = useAppSelector(selectors.delegates.selectAll) as Delegates[];
  const loading = useAppSelector(selectors.leads.selectLoading);
  const loadError = useAppSelector(selectors.leads.selectError);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<Lead | null>(null);
  const [createForm, setCreateForm] = useState({
    name: "",
    contactPerson: "",
    phone: "",
    email: "",
    source: "",
    interest: "",
    status: "New",
    estimatedValue: "",
    contactMethod: "",
    notes: "",
    delegateId: "",
  });

  // Map DB rows to UI
  const leads: Lead[] = useMemo(() => {
    return dbLeads.map((l, idx) => {
      // Find the delegate assigned to this lead
      const assignedDelegate = l.delegate_id 
        ? dbDelegates.find(d => d.delegate_id === l.delegate_id)
        : null;
      
      return {
        id: idx + 1,
        dbId: l.lead_id,
        name: l.company_name ?? "",
        contactPerson: l.contact_person ?? "",
        phone: l.phone_number ?? "",
        email: l.contact_email ?? "",
        source: l.lead_source ?? "",
        interest: l.interest_level ?? "",
        status: (l.status ?? "new").toLowerCase(),
        estimatedValue: String(l.estimated_value ?? "0"),
        addedDate: (l.created_at ?? '').slice(0,10),
        notes: l.notes ?? "",
        contactMethod: undefined,
        representative: assignedDelegate?.delegate_name || undefined,
        representativeId: assignedDelegate ? dbDelegates.indexOf(assignedDelegate) + 1 : undefined,
        delegateDbId: l.delegate_id || undefined,
      };
    });
  }, [dbLeads, dbDelegates]);

  useEffect(() => {
    dispatch(thunks.leads.fetchAll(undefined));
    dispatch(thunks.delegates.fetchAll(undefined));
  }, [dispatch]);

  const convertToCustomer = (lead: Lead) => {
    // Create customer in DB then remove lead
    const customerValues: any = {
      customer_name: lead.contactPerson,
      company: lead.name,
      contact_num: lead.phone,
      customer_email: lead.email,
      customer_address: 'Not specified',
      // Use allowed enum-like value expected by DB constraint
      contract_type: 'monthly',
      monthly_amount: parseFloat((lead.estimatedValue || '0').toString().replace(/,/g,'')) || 0,
      status: 'active',
      delegate_id: lead.delegateDbId || null,
    };
    dispatch(thunks.customers.createOne(customerValues))
      .unwrap()
      .then(() => {
        if (lead.dbId) {
          return dispatch(thunks.leads.deleteOne(lead.dbId)).unwrap();
        }
      })
      .then(() => {
        toast.success(`${lead.name} has been converted to a customer!`, {
          description: 'The lead has been moved to the Customers section',
        });
      })
      .catch((e: any) => toast.error(e.message || 'Failed to convert lead'));
  };

  const updateLeadStatus = (leadId: number, newStatus: string) => {
    const target = leads.find(l => l.id === leadId);
    if (!target?.dbId) return;
    // Ensure status is lowercase and matches database constraint
    const dbStatus = (newStatus || 'new').toLowerCase();
    dispatch(thunks.leads.updateOne({ id: target.dbId, values: { status: dbStatus } as any }))
      .unwrap()
      .then(() => {
        // Refetch leads to ensure UI is updated
        dispatch(thunks.leads.fetchAll(undefined));
        const statusLabels: Record<string, string> = {
          new: 'New',
          contacted: 'Contacted',
          quoted: 'Quoted',
          follow_up: 'Follow-up',
          negotiating: 'Negotiating',
          won: 'Won',
          lost: 'Lost'
        };
        toast.success(`Lead status updated to ${statusLabels[dbStatus] || dbStatus}`);
      })
      .catch((e: any) => toast.error(e.message || 'Failed to update lead'));
  };

  const handleEditLead = (lead: Lead) => {
    setEditingLead({ ...lead });
    setIsEditDialogOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingLead?.dbId) return;
    const values: any = {
      company_name: editingLead.name,
      contact_person: editingLead.contactPerson,
      phone_number: editingLead.phone,
      contact_email: editingLead.email,
      lead_source: editingLead.source,
      interest_level: editingLead.interest,
      status: (editingLead.status || 'new').toLowerCase(),
      estimated_value: parseFloat((editingLead.estimatedValue || '0').toString().replace(/,/g,'')) || 0,
      notes: editingLead.notes,
      delegate_id: editingLead.delegateDbId || null,
    };
    dispatch(thunks.leads.updateOne({ id: editingLead.dbId, values }))
      .unwrap()
      .then(() => {
        setIsEditDialogOpen(false);
        setEditingLead(null);
        toast.success('Lead updated successfully!');
      })
      .catch((e: any) => toast.error(e.message || 'Failed to update lead'));
  };

  const handleDeleteLead = (leadId: number) => {
    const target = leads.find(l => l.id === leadId);
    if (!target?.dbId) return;
    if (confirm('Are you sure you want to delete this lead?')) {
      dispatch(thunks.leads.deleteOne(target.dbId))
        .unwrap()
        .then(() => toast.success('Lead deleted successfully!'))
        .catch((e: any) => toast.error(e.message || 'Failed to delete lead'));
    }
  };

  // Filter leads based on search, status, and source
  const filteredLeads = leads.filter((lead) => {
    const matchesSearch = 
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.contactPerson.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.phone.includes(searchQuery) ||
      lead.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesStatus = statusFilter === "all" || lead.status.toLowerCase() === statusFilter.toLowerCase();
    const matchesSource = sourceFilter === "all" || lead.source.toLowerCase() === sourceFilter.toLowerCase();
    
    return matchesSearch && matchesStatus && matchesSource;
  });

  const totalLeads = leads.length;
  const highInterest = leads.filter((l) => l.interest === "High").length;
  const estimatedRevenue = leads.reduce(
    (sum, l) => sum + parseFloat(l.estimatedValue.replace(/,/g, "")),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2>Leads Management</h2>
          <p className="text-muted-foreground mt-1">Manage potential customers and track opportunities</p>
        </div>
        <div className="flex gap-2">
          <ImportExcelButton section="Leads" />
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="h-4 w-4" />
                Add New Lead
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Add New Lead</DialogTitle>
              <DialogDescription>Enter potential customer details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lead-name">Company/Organization Name</Label>
                  <Input id="lead-name" placeholder="Enter name" value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-contact">Contact Person</Label>
                  <Input id="lead-contact" placeholder="Contact person name" value={createForm.contactPerson} onChange={(e) => setCreateForm({ ...createForm, contactPerson: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lead-phone">Phone Number</Label>
                  <Input id="lead-phone" placeholder="05xxxxxxxx" value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-email">Email Address</Label>
                  <Input id="lead-email" type="email" placeholder="email@example.com" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lead-source">Lead Source</Label>
                  <Select value={createForm.source} onValueChange={(value) => setCreateForm({ ...createForm, source: value })}>
                    <SelectTrigger id="lead-source">
                      <SelectValue placeholder="Select source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="website">🌐 Website</SelectItem>
                      <SelectItem value="referral">👥 Referral</SelectItem>
                      <SelectItem value="exhibition">🎪 Exhibition</SelectItem>
                      <SelectItem value="call">📱 Direct Call</SelectItem>
                      <SelectItem value="social">📲 Social Media</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-interest">Interest Level</Label>
                  <Select value={createForm.interest} onValueChange={(value) => setCreateForm({ ...createForm, interest: value })}>
                    <SelectTrigger id="lead-interest">
                      <SelectValue placeholder="Select level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="lead-value">Estimated Value (Monthly)</Label>
                  <Input id="lead-value" placeholder="0.00" value={createForm.estimatedValue} onChange={(e) => setCreateForm({ ...createForm, estimatedValue: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lead-contact-method">Contact Method</Label>
                  <Select value={createForm.contactMethod} onValueChange={(value) => setCreateForm({ ...createForm, contactMethod: value })}>
                    <SelectTrigger id="lead-contact-method">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="field-visit">🚗 Field Visit</SelectItem>
                      <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                      <SelectItem value="phone">📞 Phone Call</SelectItem>
                      <SelectItem value="email">📧 Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-representative">Assigned Representative</Label>
                <Select value={createForm.delegateId || "none"} onValueChange={(value) => setCreateForm({ ...createForm, delegateId: value === "none" ? "" : value })}>
                  <SelectTrigger id="lead-representative">
                    <SelectValue placeholder="Select representative" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {dbDelegates.length === 0 ? (
                      <SelectItem value="none" disabled>No representatives available. Add representatives first.</SelectItem>
                    ) : (
                      dbDelegates.map(delegate => (
                        <SelectItem key={delegate.delegate_id} value={delegate.delegate_id}>
                          {delegate.delegate_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lead-notes">Notes</Label>
                <Textarea id="lead-notes" placeholder="Any notes about the customer..." rows={3} value={createForm.notes} onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => {
                const values: any = {
                  company_name: createForm.name || null,
                  contact_person: createForm.contactPerson || null,
                  phone_number: createForm.phone || null,
                  contact_email: createForm.email || null,
                  lead_source: createForm.source || null,
                  interest_level: createForm.interest || null,
                  status: (createForm.status || 'new').toLowerCase() || 'new',
                  estimated_value: parseFloat((createForm.estimatedValue || '0').toString().replace(/,/g, '')) || 0,
                  notes: createForm.notes || null,
                  delegate_id: createForm.delegateId || null,
                };
                dispatch(thunks.leads.createOne(values))
                  .unwrap()
                  .then(() => {
                    setIsAddDialogOpen(false);
                    setCreateForm({ name: '', contactPerson: '', phone: '', email: '', source: '', interest: '', status: 'New', estimatedValue: '', contactMethod: '', notes: '', delegateId: '' });
                    toast.success('Lead added successfully!');
                  })
                  .catch((e: any) => {
                    console.error('Lead creation error:', e);
                    toast.error(e?.message || e?.error?.message || 'Failed to add lead');
                  });
              }}>
                Save Lead
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h4>Total Leads</h4>
            <User className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeads}</div>
            <p className="text-xs text-muted-foreground mt-1">New opportunities</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h4>High Interest</h4>
            <Star className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-primary">{highInterest}</div>
            <p className="text-xs text-muted-foreground mt-1">Requires follow-up</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <h4>Estimated Revenue</h4>
            <ArrowRight className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{estimatedRevenue.toLocaleString()} SAR</div>
            <p className="text-xs text-muted-foreground mt-1">Monthly upon conversion</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search for lead..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="new">🆕 New</SelectItem>
                <SelectItem value="contacted">📞 Contacted</SelectItem>
                <SelectItem value="quoted">💰 Quoted</SelectItem>
                <SelectItem value="follow_up">🔄 Follow-up</SelectItem>
                <SelectItem value="negotiating">🤝 Negotiating</SelectItem>
                <SelectItem value="won">✅ Won</SelectItem>
                <SelectItem value="lost">❌ Lost</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sourceFilter} onValueChange={setSourceFilter}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All Sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sources</SelectItem>
                <SelectItem value="website">🌐 Website</SelectItem>
                <SelectItem value="referral">👥 Referral</SelectItem>
                <SelectItem value="exhibition">🎪 Exhibition</SelectItem>
                <SelectItem value="direct call">📱 Direct Call</SelectItem>
                <SelectItem value="social media">📲 Social Media</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading && <div>Loading leads...</div>}
          {loadError && <div className="text-red-500">{loadError}</div>}
          {!loading && !loadError && filteredLeads.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p>No leads yet. Create your first lead!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company Name</TableHead>
                  <TableHead>Contact Person</TableHead>
                  <TableHead>Contact Info</TableHead>
                  <TableHead>Representative</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Contact Method</TableHead>
                  <TableHead>Interest Level</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Estimated Value</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredLeads.map((lead) => (
                <TableRow key={lead.id}>
                  <TableCell>{lead.name}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-muted-foreground" />
                      {lead.contactPerson}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                        {lead.phone}
                      </div>
                      <div className="flex items-center gap-1.5 text-sm">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {lead.email}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{lead.representative || "Not assigned"}</span>
                    </div>
                  </TableCell>
                  <TableCell>{lead.source}</TableCell>
                  <TableCell>
                    {lead.contactMethod ? (
                      <span className="text-sm">
                        {lead.contactMethod === 'field-visit' && '🚗 Field Visit'}
                        {lead.contactMethod === 'whatsapp' && '💬 WhatsApp'}
                        {lead.contactMethod === 'phone' && '📞 Phone'}
                        {lead.contactMethod === 'email' && '📧 Email'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground text-sm">-</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={getInterestColor(lead.interest)} className="gap-1.5">
                      <Star className="h-3 w-3" />
                      {lead.interest}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {(() => {
                      const normalizedStatus = (lead.status || "new").toLowerCase().replace(/-/g, '_');
                      return (
                        <Select 
                          key={`status-${lead.dbId}-${normalizedStatus}`}
                          value={normalizedStatus}
                          onValueChange={(value) => updateLeadStatus(lead.id, value)}
                        >
                          <SelectTrigger className="w-32 h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">🆕 New</SelectItem>
                            <SelectItem value="contacted">📞 Contacted</SelectItem>
                            <SelectItem value="quoted">💰 Quoted</SelectItem>
                            <SelectItem value="follow_up">🔄 Follow-up</SelectItem>
                            <SelectItem value="negotiating">🤝 Negotiating</SelectItem>
                            <SelectItem value="won">✅ Won</SelectItem>
                            <SelectItem value="lost">❌ Lost</SelectItem>
                          </SelectContent>
                        </Select>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{lead.estimatedValue} SAR</TableCell>
                  <TableCell>
                    <div className="flex justify-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => convertToCustomer(lead)}>
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                        Convert to Customer
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem className="gap-2" onClick={() => handleEditLead(lead)}>
                            <Edit className="h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="gap-2 text-destructive" onClick={() => handleDeleteLead(lead.id)}>
                            <Trash2 className="h-4 w-4" />
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
          )}
        </CardContent>
      </Card>

      {/* Edit Lead Dialog */}
      {editingLead && (
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Lead</DialogTitle>
              <DialogDescription>Update potential customer details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-name">Company/Organization Name</Label>
                  <Input 
                    id="edit-lead-name" 
                    value={editingLead.name}
                    onChange={(e) => setEditingLead({ ...editingLead, name: e.target.value })}
                    placeholder="Enter name" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-contact">Contact Person</Label>
                  <Input 
                    id="edit-lead-contact" 
                    value={editingLead.contactPerson}
                    onChange={(e) => setEditingLead({ ...editingLead, contactPerson: e.target.value })}
                    placeholder="Contact person name" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-phone">Phone Number</Label>
                  <Input 
                    id="edit-lead-phone" 
                    value={editingLead.phone}
                    onChange={(e) => setEditingLead({ ...editingLead, phone: e.target.value })}
                    placeholder="05xxxxxxxx" 
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-email">Email Address</Label>
                  <Input 
                    id="edit-lead-email" 
                    type="email" 
                    value={editingLead.email}
                    onChange={(e) => setEditingLead({ ...editingLead, email: e.target.value })}
                    placeholder="email@example.com" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-source">Lead Source</Label>
                  <Select 
                    value={editingLead.source}
                    onValueChange={(value) => setEditingLead({ ...editingLead, source: value })}
                  >
                    <SelectTrigger id="edit-lead-source">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Website">🌐 Website</SelectItem>
                      <SelectItem value="Referral">👥 Referral</SelectItem>
                      <SelectItem value="Exhibition">🎪 Exhibition</SelectItem>
                      <SelectItem value="Direct Call">📱 Direct Call</SelectItem>
                      <SelectItem value="Social Media">📲 Social Media</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-interest">Interest Level</Label>
                  <Select 
                    value={editingLead.interest}
                    onValueChange={(value) => setEditingLead({ ...editingLead, interest: value })}
                  >
                    <SelectTrigger id="edit-lead-interest">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="High">High</SelectItem>
                      <SelectItem value="Medium">Medium</SelectItem>
                      <SelectItem value="Low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-status">Status</Label>
                  <Select 
                    value={(editingLead.status || 'new').toLowerCase()}
                    onValueChange={(value) => setEditingLead({ ...editingLead, status: value })}
                  >
                    <SelectTrigger id="edit-lead-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">🆕 New</SelectItem>
                      <SelectItem value="contacted">📞 Contacted</SelectItem>
                      <SelectItem value="quoted">💰 Quoted</SelectItem>
                      <SelectItem value="follow_up">🔄 Follow-up</SelectItem>
                      <SelectItem value="negotiating">🤝 Negotiating</SelectItem>
                      <SelectItem value="won">✅ Won</SelectItem>
                      <SelectItem value="lost">❌ Lost</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-value">Estimated Value (Monthly SAR)</Label>
                  <Input 
                    id="edit-lead-value" 
                    value={editingLead.estimatedValue}
                    onChange={(e) => setEditingLead({ ...editingLead, estimatedValue: e.target.value })}
                    placeholder="0.00" 
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-contact-method">Contact Method</Label>
                  <Select 
                    value={editingLead.contactMethod || ""}
                    onValueChange={(value) => setEditingLead({ ...editingLead, contactMethod: value })}
                  >
                    <SelectTrigger id="edit-lead-contact-method">
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="field-visit">🚗 Field Visit</SelectItem>
                      <SelectItem value="whatsapp">💬 WhatsApp</SelectItem>
                      <SelectItem value="phone">📞 Phone Call</SelectItem>
                      <SelectItem value="email">📧 Email</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-lead-representative">Assigned Representative</Label>
                  <Select
                    value={editingLead.delegateDbId || "none"}
                    onValueChange={(value) => {
                      if (value === "none") {
                        setEditingLead({ 
                          ...editingLead, 
                          delegateDbId: undefined,
                          representative: undefined
                        });
                      } else {
                        const delegate = dbDelegates.find(d => d.delegate_id === value);
                        setEditingLead({ 
                          ...editingLead, 
                          delegateDbId: value,
                          representative: delegate?.delegate_name || undefined
                        });
                      }
                    }}
                  >
                    <SelectTrigger id="edit-lead-representative">
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
              <div className="space-y-2">
                <Label htmlFor="edit-lead-notes">Notes</Label>
                <Textarea 
                  id="edit-lead-notes" 
                  value={editingLead.notes}
                  onChange={(e) => setEditingLead({ ...editingLead, notes: e.target.value })}
                  placeholder="Any notes about the customer..." 
                  rows={3} 
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => {
                setIsEditDialogOpen(false);
                setEditingLead(null);
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
    </div>
  );
}

