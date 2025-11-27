import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Search,
  Calendar,
  MapPin,
  User,
  CheckCircle2,
  XCircle,
  Clock,
  Edit,
  Trash2,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Download } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Skeleton } from "./ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { supabase } from "../lib/supabaseClient";
import type { Activity, Reminder } from "../types/activity";

interface VisitsProps {
  onActivityAdd: (activity: Omit<Activity, "id" | "timestamp">) => void;
  onVisitReminderUpsert: (
    visitId: string,
    payload: {
      title: string;
      description?: string;
      date: string;
      time: string;
      customer?: string;
      status: Reminder["status"];
      priority?: Reminder["priority"];
    }
  ) => void;
  onVisitReminderRemove: (visitId: string) => void;
}

type VisitStatus = "Scheduled" | "Completed" | "Cancelled";

interface VisitRecord {
  id: string;
  visitNumber?: string;
  customerId: string;
  customerName: string;
  delegateId: string;
  delegateName: string;
  visitDate: string;
  visitTime: string | null;
  status: VisitStatus;
  address: string | null;
  notes: string | null;
  created_at?: string;
}

interface VisitForm {
  customerId: string;
  delegateId: string;
  date: string;
  time: string;
  address: string;
  notes: string;
}

interface Option {
  id: string;
  name: string;
}

const formatStatus = (value?: string | null): VisitStatus => {
  switch ((value ?? "scheduled").toLowerCase()) {
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return "Scheduled";
  }
};

const toDbStatus = (status: VisitStatus) => status.toLowerCase();

const formatTimeFromDb = (value?: string | null) => {
  if (!value) return null;
  if (value.length >= 5) {
    return value.slice(0, 5);
  }
  return value;
};

const toDbTime = (value?: string) => {
  if (!value) return null;
  return value.length === 5 ? `${value}:00` : value;
};

const defaultForm: VisitForm = {
  customerId: "",
  delegateId: "",
  date: "",
  time: "",
  address: "",
  notes: "",
};

export function Visits({
  onActivityAdd,
  onVisitReminderUpsert,
  onVisitReminderRemove,
}: VisitsProps) {
  const [visits, setVisits] = useState<VisitRecord[]>([]);
  const [delegates, setDelegates] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [selectedRepId, setSelectedRepId] = useState<string | "all">("all");
  const [formData, setFormData] = useState<VisitForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [editingVisit, setEditingVisit] = useState<VisitRecord | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [delegatesRes, customersRes, visitsRes] = await Promise.all([
        supabase
          .from("delegates")
          .select("delegate_id, delegate_name, status")
          .order("delegate_name", { ascending: true }),
        supabase
          .from("customers")
          .select("customer_id, customer_name")
          .order("customer_name", { ascending: true }),
        supabase
          .from("manual_visits")
          .select("visit_id, customer_id, delegate_id, visit_date, visit_time, status, address, notes, created_at")
          .order("created_at", { ascending: true }),
      ]);

      const errors = [delegatesRes.error, customersRes.error, visitsRes.error].filter(Boolean);
      if (errors.length > 0) {
        throw errors[0];
      }

      const delegateOptions: Option[] = (delegatesRes.data ?? [])
        .filter((delegate) => (delegate.status ?? "active").toLowerCase() !== "inactive")
        .map((delegate) => ({
          id: delegate.delegate_id,
          name: delegate.delegate_name,
        }));
      setDelegates(delegateOptions);

      const customerOptions: Option[] = (customersRes.data ?? []).map((customer) => ({
        id: customer.customer_id,
        name: customer.customer_name,
      }));
      setCustomers(customerOptions);

      const delegateMap = new Map(delegateOptions.map((delegate) => [delegate.id, delegate.name]));
      const customerMap = new Map(customerOptions.map((customer) => [customer.id, customer.name]));

      const mappedVisits: VisitRecord[] = (visitsRes.data ?? []).map((visit) => ({
        id: visit.visit_id,
        customerId: visit.customer_id,
        customerName: customerMap.get(visit.customer_id) ?? "Unknown Customer",
        delegateId: visit.delegate_id,
        delegateName: delegateMap.get(visit.delegate_id) ?? "Unassigned",
        visitDate: visit.visit_date,
        visitTime: formatTimeFromDb(visit.visit_time),
        status: formatStatus(visit.status),
        address: visit.address,
        notes: visit.notes,
        created_at: visit.created_at,
      }));

      setVisits(mappedVisits);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "Failed to load visits";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Create visit number map similar to quotations - based on sorted order
  const visitNumberMap = useMemo(() => {
    const parse = (value?: string | null) => {
      if (!value) return 0;
      const time = new Date(value).getTime();
      return Number.isNaN(time) ? 0 : time;
    };

    const sorted = [...visits].sort(
      (a, b) => parse(a.created_at) - parse(b.created_at)
    );

    const map = new Map<
      string,
      {
        visitNumber: string;
        sequence: number;
      }
    >();

    sorted.forEach((visit, index) => {
      const visitDate = visit.created_at ?? new Date().toISOString();
      const visitYear = new Date(visitDate).getFullYear();
      map.set(visit.id, {
        visitNumber: `VI-${visitYear}-${String(index + 1).padStart(3, "0")}`,
        sequence: index + 1,
      });
    });

    return map;
  }, [visits]);

  const visitsWithNumbers = useMemo(() => {
    return visits.map((visit) => {
      const visitMeta = visitNumberMap.get(visit.id);
      return {
        ...visit,
        visitNumber: visitMeta?.visitNumber ?? `VI-${new Date().getFullYear()}-${String(visit.id.slice(0, 3)).padStart(3, "0")}`,
      };
    });
  }, [visits, visitNumberMap]);

  const filteredVisits = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return visitsWithNumbers.filter((visit) => {
      const matchesSearch =
        visit.customerName.toLowerCase().includes(query) ||
        visit.delegateName.toLowerCase().includes(query) ||
        (visit.address ?? "").toLowerCase().includes(query) ||
        (visit.notes ?? "").toLowerCase().includes(query) ||
        (visit.visitNumber ?? "").toLowerCase().includes(query);
      const matchesRepresentative = selectedRepId === "all" || visit.delegateId === selectedRepId;
      const matchesStatus = filterStatus === "all" || visit.status === filterStatus;
      return matchesSearch && matchesRepresentative && matchesStatus;
    });
  }, [visitsWithNumbers, searchQuery, selectedRepId, filterStatus]);

  const visitsByRepresentative = useMemo(() => {
    const map = new Map<string, VisitRecord[]>();
    visitsWithNumbers.forEach((visit) => {
      const existing = map.get(visit.delegateId) ?? [];
      existing.push(visit);
      map.set(visit.delegateId, existing);
    });
    return map;
  }, [visitsWithNumbers]);

  const getRepStats = (repId: string) => {
    const repVisits = visitsByRepresentative.get(repId) ?? [];
    return {
      total: repVisits.length,
      scheduled: repVisits.filter((visit) => visit.status === "Scheduled").length,
      completed: repVisits.filter((visit) => visit.status === "Completed").length,
      cancelled: repVisits.filter((visit) => visit.status === "Cancelled").length,
    };
  };

  const openCreateDialog = () => {
    setEditingVisit(null);
    setFormData(defaultForm);
    setIsDialogOpen(true);
  };

  const openEditDialog = (visit: VisitRecord) => {
    setEditingVisit(visit);
    setFormData({
      customerId: visit.customerId,
      delegateId: visit.delegateId,
      date: visit.visitDate,
      time: visit.visitTime ?? "",
      address: visit.address ?? "",
      notes: visit.notes ?? "",
    });
    setIsDialogOpen(true);
  };

  const resetDialogState = () => {
    setIsDialogOpen(false);
    setFormData(defaultForm);
    setEditingVisit(null);
    setSaving(false);
  };

  const handleFormChange = (field: keyof VisitForm, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const syncReminderForVisit = (
    visit: VisitRecord,
    status: VisitStatus,
    overrideDate?: string,
    overrideTime?: string | null
  ) => {
    onVisitReminderUpsert(visit.id, {
      title: `Visit: ${visit.customerName}`,
      description: visit.notes ?? "Scheduled visit",
      date: overrideDate ?? visit.visitDate,
      time: overrideTime ?? visit.visitTime ?? "09:00",
      customer: visit.customerName,
      status: status === "Completed" ? "completed" : status === "Cancelled" ? "cancelled" : "pending",
      priority: "medium",
    });
  };

  const createVisit = async () => {
    if (!formData.customerId || !formData.delegateId || !formData.date) {
      toast.error("Please fill in the required fields");
      return;
    }

    setSaving(true);
    try {
      // Visit number will be auto-assigned based on sorted order (like quotations)
      // No need to generate or store it - it's calculated on display
      const { data, error: insertError } = await supabase
        .from("manual_visits")
        .insert({
          customer_id: formData.customerId,
          delegate_id: formData.delegateId,
          visit_date: formData.date,
          visit_time: toDbTime(formData.time),
          status: "scheduled",
          address: formData.address || null,
          notes: formData.notes || null,
        })
        .select("visit_id, customer_id, delegate_id, visit_date, visit_time, status, address, notes, created_at")
        .single();

      if (insertError || !data) {
        throw insertError ?? new Error("Failed to schedule visit");
      }

      const customerName = customers.find((customer) => customer.id === data.customer_id)?.name ?? "Unknown Customer";
      const delegateName = delegates.find((delegate) => delegate.id === data.delegate_id)?.name ?? "Unassigned";

      const newVisit: VisitRecord = {
        id: data.visit_id,
        customerId: data.customer_id,
        customerName,
        delegateId: data.delegate_id,
        delegateName,
        visitDate: data.visit_date,
        visitTime: formatTimeFromDb(data.visit_time),
        status: formatStatus(data.status),
        address: data.address,
        notes: data.notes,
        created_at: data.created_at,
      };

      setVisits((prev) => [newVisit, ...prev]);
      toast.success("Visit scheduled successfully");
      syncReminderForVisit(newVisit, "Scheduled", newVisit.visitDate, newVisit.visitTime);
      onActivityAdd({
        type: "visit",
        action: "created",
        title: "Visit scheduled",
        description: `${newVisit.customerName} assigned to ${newVisit.delegateName}`,
        user: "System",
        userRole: "automation",
        relatedEntity: newVisit.customerName,
      });
      resetDialogState();
    } catch (createError) {
      const message = createError instanceof Error ? createError.message : "Failed to schedule visit";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const updateVisit = async () => {
    if (!editingVisit) return;
    if (!formData.customerId || !formData.delegateId || !formData.date) {
      toast.error("Please fill in the required fields");
      return;
    }

    setSaving(true);
    try {
      const { data, error: updateError } = await supabase
        .from("manual_visits")
        .update({
          customer_id: formData.customerId,
          delegate_id: formData.delegateId,
          visit_date: formData.date,
          visit_time: toDbTime(formData.time),
          address: formData.address || null,
          notes: formData.notes || null,
        })
        .eq("visit_id", editingVisit.id)
        .select("visit_id, customer_id, delegate_id, visit_date, visit_time, status, address, notes, created_at")
        .single();

      if (updateError || !data) {
        throw updateError ?? new Error("Failed to update visit");
      }

      const customerName = customers.find((customer) => customer.id === data.customer_id)?.name ?? "Unknown Customer";
      const delegateName = delegates.find((delegate) => delegate.id === data.delegate_id)?.name ?? "Unassigned";

      const updatedVisit: VisitRecord = {
        id: data.visit_id,
        customerId: data.customer_id,
        customerName,
        delegateId: data.delegate_id,
        delegateName,
        visitDate: data.visit_date,
        visitTime: formatTimeFromDb(data.visit_time),
        status: formatStatus(data.status),
        address: data.address,
        notes: data.notes,
        created_at: data.created_at,
      };

      setVisits((prev) => prev.map((visit) => (visit.id === updatedVisit.id ? updatedVisit : visit)));
      toast.success("Visit updated successfully");
      syncReminderForVisit(updatedVisit, updatedVisit.status, updatedVisit.visitDate, updatedVisit.visitTime);
      onActivityAdd({
        type: "visit",
        action: "updated",
        title: "Visit updated",
        description: `${updatedVisit.customerName} assigned to ${updatedVisit.delegateName}`,
        user: "System",
        userRole: "automation",
        relatedEntity: updatedVisit.customerName,
      });
      resetDialogState();
    } catch (updateError) {
      const message = updateError instanceof Error ? updateError.message : "Failed to update visit";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (editingVisit) {
      await updateVisit();
    } else {
      await createVisit();
    }
  };

  const updateVisitStatus = async (visit: VisitRecord, nextStatus: VisitStatus) => {
    if (visit.status === nextStatus) return;

    try {
      const { data, error: updateError } = await supabase
        .from("manual_visits")
        .update({ status: toDbStatus(nextStatus) })
        .eq("visit_id", visit.id)
        .select("visit_id, visit_date, visit_time, status")
        .single();

      if (updateError || !data) {
        throw updateError ?? new Error("Failed to update status");
      }

      const updatedVisit: VisitRecord = {
        ...visit,
        status: formatStatus(data.status),
        visitDate: data.visit_date ?? visit.visitDate,
        visitTime: formatTimeFromDb(data.visit_time) ?? visit.visitTime,
      };

      setVisits((prev) => prev.map((item) => (item.id === updatedVisit.id ? updatedVisit : item)));
      syncReminderForVisit(updatedVisit, nextStatus);
      onActivityAdd({
        type: "visit",
        action: "updated",
        title: `Visit ${nextStatus.toLowerCase()}`,
        description: `${updatedVisit.customerName} assigned to ${updatedVisit.delegateName}`,
        user: "System",
        userRole: "automation",
        relatedEntity: updatedVisit.customerName,
      });

      toast.success(`Visit marked as ${nextStatus.toLowerCase()}`);
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : "Failed to update status";
      toast.error(message);
    }
  };

  const deleteVisit = async (visit: VisitRecord) => {
    const confirmed = window.confirm(`Delete visit for ${visit.customerName}?`);
    if (!confirmed) return;

    try {
      const { error: deleteError } = await supabase
        .from("manual_visits")
        .delete()
        .eq("visit_id", visit.id);

      if (deleteError) {
        throw deleteError;
      }

      setVisits((prev) => prev.filter((item) => item.id !== visit.id));
      onVisitReminderRemove(visit.id);
      onActivityAdd({
        type: "visit",
        action: "deleted",
        title: "Visit deleted",
        description: `${visit.customerName} - ${visit.delegateName}`,
        user: "System",
        userRole: "automation",
        relatedEntity: visit.customerName,
      });
      toast.success("Visit deleted successfully");
    } catch (deleteError) {
      const message = deleteError instanceof Error ? deleteError.message : "Failed to delete visit";
      toast.error(message);
    }
  };

  const exportToExcel = () => {
    try {
      const exportData = filteredVisits.map((visit) => ({
        "Visit ID": visit.visitNumber ?? visit.id.slice(0, 8),
        "Customer Name": visit.customerName,
        "Representative": visit.delegateName,
        "Visit Date": visit.visitDate,
        "Visit Time": visit.visitTime || "N/A",
        Status: visit.status,
        Address: visit.address || "N/A",
        Notes: visit.notes || "N/A",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Visits");
      const fileName = `visits_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2>Visit Management</h2>
          <p className="text-muted-foreground mt-1">Monthly visit schedule by representative</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Dialog open={isDialogOpen} onOpenChange={(open) => (open ? undefined : resetDialogState())}>
          <DialogTrigger asChild>
            <Button
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              onClick={openCreateDialog}
            >
              <Plus className="h-4 w-4" />
              Schedule New Visit
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingVisit ? "Edit Visit" : "Schedule New Visit"}</DialogTitle>
              <DialogDescription>
                {editingVisit
                  ? "Update visit details and assigned representative"
                  : "Set the visit date and assigned representative"}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="customer">Customer *</Label>
                  <Select
                    value={formData.customerId}
                    onValueChange={(value) => handleFormChange("customerId", value)}
                  >
                    <SelectTrigger id="customer">
                      <SelectValue placeholder="Select customer" />
                    </SelectTrigger>
                    <SelectContent>
                      {customers.map((customer) => (
                        <SelectItem key={customer.id} value={customer.id}>
                          {customer.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="representative">Representative *</Label>
                  <Select
                    value={formData.delegateId}
                    onValueChange={(value) => handleFormChange("delegateId", value)}
                  >
                    <SelectTrigger id="representative">
                      <SelectValue placeholder="Select representative" />
                    </SelectTrigger>
                    <SelectContent>
                      {delegates.map((delegate) => (
                        <SelectItem key={delegate.id} value={delegate.id}>
                          {delegate.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="visit-date">Visit Date *</Label>
                  <Input
                    id="visit-date"
                    type="date"
                    value={formData.date}
                    onChange={(event) => handleFormChange("date", event.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="visit-time">Visit Time</Label>
                  <Input
                    id="visit-time"
                    type="time"
                    value={formData.time}
                    onChange={(event) => handleFormChange("time", event.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Input
                  id="address"
                  placeholder="Visit location"
                  value={formData.address}
                  onChange={(event) => handleFormChange("address", event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Visit notes and requirements"
                  rows={3}
                  value={formData.notes}
                  onChange={(event) => handleFormChange("notes", event.target.value)}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={resetDialogState} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingVisit ? "Save Changes" : "Schedule Visit"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Visits</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-24" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold">{visits.length}</div>
                <p className="text-xs text-muted-foreground mt-1">All recorded visits</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Scheduled</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-blue-600">
                  {visits.filter((visit) => visit.status === "Scheduled").length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Upcoming</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-28" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-green-600">
                  {visits.filter((visit) => visit.status === "Completed").length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Successfully finished</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Cancelled</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <>
                <Skeleton className="h-8 w-16 mb-2" />
                <Skeleton className="h-3 w-20" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold text-red-600">
                  {visits.filter((visit) => visit.status === "Cancelled").length}
                </div>
                <p className="text-xs text-muted-foreground mt-1">This month</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Visits by Representative</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="all">
            <TabsList className="flex flex-wrap gap-2">
              <TabsTrigger value="all" onClick={() => setSelectedRepId("all")}>
                All ({visits.length})
              </TabsTrigger>
              {delegates.map((delegate) => {
                const stats = getRepStats(delegate.id);
                return (
                  <TabsTrigger
                    key={delegate.id}
                    value={delegate.id}
                    onClick={() => setSelectedRepId(delegate.id)}
                  >
                    {delegate.name.split(" ")[0]} ({stats.total})
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {selectedRepId !== "all" && (
              <TabsContent value={selectedRepId.toString()} className="mt-4">
                {(() => {
                  const stats = getRepStats(selectedRepId as string);
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-blue-600">{stats.scheduled}</div>
                            <p className="text-sm text-muted-foreground">Scheduled</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-green-600">{stats.completed}</div>
                            <p className="text-sm text-muted-foreground">Completed</p>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6">
                          <div className="text-center">
                            <div className="text-2xl font-bold text-red-600">{stats.cancelled}</div>
                            <p className="text-sm text-muted-foreground">Cancelled</p>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  );
                })()}
              </TabsContent>
            )}
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>All Visits</CardTitle>
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="Scheduled">Scheduled</SelectItem>
                  <SelectItem value="Completed">Completed</SelectItem>
                  <SelectItem value="Cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search visits..."
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  className="pl-8 w-full md:w-[300px]"
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Visit ID #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Representative</TableHead>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredVisits.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="p-0">
                      <div className="flex flex-col items-center justify-center py-12">
                        <Calendar className="h-12 w-12 text-muted-foreground mb-3" />
                        <p className="text-muted-foreground">No visits found</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVisits.map((visit) => {
                    const StatusIcon = visit.status === "Completed" ? CheckCircle2 : visit.status === "Cancelled" ? XCircle : Clock;
                    return (
                      <TableRow key={visit.id}>
                        <TableCell>
                          <div className="font-medium font-mono">{visit.visitNumber}</div>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium">{visit.customerName}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-muted-foreground" />
                            {visit.delegateName}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-muted-foreground" />
                            <div>
                              <div className="font-medium">
                                {visit.visitDate ? new Date(visit.visitDate).toLocaleDateString('en-GB') : "--"}
                              </div>
                              <div className="text-sm text-muted-foreground">
                                {visit.visitTime ?? "--"}
                              </div>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-muted-foreground" />
                            {visit.address ?? "--"}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={`capitalize ${
                            visit.status === "Completed"
                              ? "bg-green-100 text-green-700 border-green-200"
                              : visit.status === "Cancelled"
                              ? "bg-red-100 text-red-700 border-red-200"
                              : "bg-blue-100 text-blue-700 border-blue-200"
                          }`}>
                            <StatusIcon className="h-3 w-3 mr-1" />
                            {visit.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm text-muted-foreground max-w-[220px] truncate">
                            {visit.notes ?? "--"}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => openEditDialog(visit)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            {visit.status !== "Completed" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void updateVisitStatus(visit, "Completed")}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                            {visit.status !== "Scheduled" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void updateVisitStatus(visit, "Scheduled")}
                              >
                                <Clock className="h-4 w-4" />
                              </Button>
                            )}
                            {visit.status !== "Cancelled" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void updateVisitStatus(visit, "Cancelled")}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-500"
                              onClick={() => void deleteVisit(visit)}
                            >
                              <Trash2 className="h-4 w-4" />
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
          {error && <p className="text-sm text-destructive mt-4">{error}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
