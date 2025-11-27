import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Filter,
  Clock,
  User,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Pencil,
  Trash2,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Employees as DbEmployee } from "../../supabase/models/employees";
import type { Leaves as DbLeave } from "../../supabase/models/leaves";

type LeaveTypeOption = DbLeave["leave_type"];
type LeaveStatusOption = DbLeave["status"];

interface LeaveRecord {
  id: string;
  leaveNumber: string;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  employeePosition: string;
  leaveType: LeaveTypeOption;
  startDate: string;
  endDate: string;
  totalDays: number;
  reason: string;
  status: LeaveStatusOption;
  appliedDate: string | null;
  approvedBy: string | null;
  approvedDate: string | null;
  notes: string | null;
}

interface LeaveFormState {
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  employeePosition: string;
  leaveType: LeaveTypeOption | "";
  startDate: string;
  endDate: string;
  reason: string;
  notes: string;
  status: LeaveStatusOption;
  appliedDate: string | null;
  approvedBy: string | null;
  approvedDate: string | null;
}

const defaultFormState: LeaveFormState = {
  employeeId: "",
  employeeName: "",
  employeeDepartment: "",
  employeePosition: "",
  leaveType: "",
  startDate: "",
  endDate: "",
  reason: "",
  notes: "",
  status: "pending",
  appliedDate: null,
  approvedBy: null,
  approvedDate: null,
};

const leaveTypeColors: Record<LeaveTypeOption, string> = {
  annual: "bg-blue-100 text-blue-700 border-blue-200",
  sick: "bg-red-100 text-red-700 border-red-200",
  emergency: "bg-orange-100 text-orange-700 border-orange-200",
  unpaid: "bg-gray-100 text-gray-700 border-gray-200",
  other: "bg-purple-100 text-purple-700 border-purple-200",
};

const statusColors: Record<LeaveStatusOption, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
};

const calculateDays = (start: string, end: string) => {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
};

const formatDate = (value: string | null, options?: Intl.DateTimeFormatOptions) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", options);
};

export function Leaves() {
  const dispatch = useAppDispatch();
  const dbLeaves = useAppSelector(selectors.leaves.selectAll) as DbLeave[];
  const leavesLoading = useAppSelector(selectors.leaves.selectLoading);
  const dbEmployees = useAppSelector(selectors.employees.selectAll) as DbEmployee[];
  const employeesLoading = useAppSelector(selectors.employees.selectLoading);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<LeaveFormState>(defaultFormState);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingLeaveId, setEditingLeaveId] = useState<string | null>(null);
  const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [isEmployeeSearchFocused, setIsEmployeeSearchFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const employeeSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(thunks.leaves.fetchAll(undefined));
    dispatch(thunks.employees.fetchAll(undefined));
  }, [dispatch]);

  const employeeLookup = useMemo(() => {
    const map = new Map<string, DbEmployee>();
    dbEmployees.forEach((employee) => map.set(employee.employee_id, employee));
    return map;
  }, [dbEmployees]);

  const leaves = useMemo<LeaveRecord[]>(() => {
    return dbLeaves
      .map((leave) => {
        const employee = employeeLookup.get(leave.employee_id);
        const name =
          leave.employee_name ??
          employee?.name_en ??
          employee?.name_ar ??
          "Unknown Employee";
        const department = leave.employee_department ?? employee?.department ?? "—";
        const position = leave.employee_position ?? employee?.position ?? "—";

        return {
          id: leave.leave_id,
          leaveNumber: leave.leave_number,
          employeeId: leave.employee_id,
          employeeName: name,
          employeeDepartment: department,
          employeePosition: position,
          leaveType: leave.leave_type,
          startDate: leave.start_date,
          endDate: leave.end_date,
          totalDays: leave.total_days,
          reason: leave.reason,
          status: leave.status,
          appliedDate: leave.applied_date,
          approvedBy: leave.approved_by,
          approvedDate: leave.approved_date,
          notes: leave.notes,
        };
      })
      .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  }, [dbLeaves, employeeLookup]);

  const selectedLeave = useMemo(() => {
    if (!selectedLeaveId) return null;
    return leaves.find((leave) => leave.id === selectedLeaveId) ?? null;
  }, [leaves, selectedLeaveId]);

  useEffect(() => {
    if (!selectedLeaveId) return;
    if (!leaves.some((leave) => leave.id === selectedLeaveId)) {
      setSelectedLeaveId(null);
      setIsDetailsDialogOpen(false);
    }
  }, [leaves, selectedLeaveId]);

  const employeeSuggestions = useMemo(() => {
    if (!isEmployeeSearchFocused) return [];

    const query = employeeSearchTerm.trim().toLowerCase();
    const source = query
      ? dbEmployees.filter((employee) => {
          const name = (employee.name_en ?? employee.name_ar ?? "").toLowerCase();
          const id = employee.employee_id.toLowerCase();
          const department = (employee.department ?? "").toLowerCase();
          return name.includes(query) || id.includes(query) || department.includes(query);
        })
      : dbEmployees;

    return source
      .slice()
      .sort((a, b) => {
        const nameA = (a.name_en ?? a.name_ar ?? "").toLowerCase();
        const nameB = (b.name_en ?? b.name_ar ?? "").toLowerCase();
        return nameA.localeCompare(nameB);
      })
      .slice(0, 8);
  }, [dbEmployees, employeeSearchTerm, isEmployeeSearchFocused]);

  const filteredLeaves = useMemo(() => {
    return leaves.filter((leave) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        leave.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        leave.leaveNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        leave.employeeId.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === "all" || leave.status === filterStatus;
      const matchesType = filterType === "all" || leave.leaveType === filterType;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [leaves, searchQuery, filterStatus, filterType]);

  const totalLeaves = leaves.length;
  const pendingLeaves = leaves.filter((l) => l.status === "pending").length;
  const approvedLeaves = leaves.filter((l) => l.status === "approved").length;
  const totalDays = leaves
    .filter((l) => l.status === "approved")
    .reduce((sum, l) => sum + l.totalDays, 0);

  const exportToExcel = () => {
    try {
      const exportData = filteredLeaves.map((leave) => ({
        "Leave Number": leave.leaveNumber,
        "Employee ID": leave.employeeId,
        "Employee Name": leave.employeeName,
        "Department": leave.employeeDepartment,
        "Position": leave.employeePosition,
        "Leave Type": leave.leaveType,
        "Start Date": leave.startDate,
        "End Date": leave.endDate,
        "Total Days": leave.totalDays,
        "Reason": leave.reason,
        "Status": leave.status,
        "Applied Date": leave.appliedDate || "",
        "Approved By": leave.approvedBy || "",
        "Approved Date": leave.approvedDate || "",
        "Notes": leave.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 20 },
        { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 30 },
        { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Leaves");
      const fileName = `leaves_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  const resetForm = () => {
    setFormState(defaultFormState);
    setEmployeeSearchTerm("");
    setEditingLeaveId(null);
    setFormMode("create");
    setIsSubmitting(false);
    setIsEmployeeSearchFocused(false);
  };

  const handleSelectEmployee = (employee: DbEmployee) => {
    setFormState((prev) => ({
      ...prev,
      employeeId: employee.employee_id,
      employeeName: employee.name_en ?? employee.name_ar ?? "",
      employeeDepartment: employee.department ?? "",
      employeePosition: employee.position ?? "",
    }));
    setEmployeeSearchTerm("");
    setIsEmployeeSearchFocused(false);
  };

  const openCreateForm = () => {
    resetForm();
    setFormMode("create");
    setIsFormOpen(true);
  };

  const openEditForm = (leave: LeaveRecord) => {
    setFormState({
      employeeId: leave.employeeId,
      employeeName: leave.employeeName,
      employeeDepartment: leave.employeeDepartment === "—" ? "" : leave.employeeDepartment,
      employeePosition: leave.employeePosition === "—" ? "" : leave.employeePosition,
      leaveType: leave.leaveType,
      startDate: leave.startDate,
      endDate: leave.endDate,
      reason: leave.reason,
      notes: leave.notes ?? "",
      status: leave.status,
      appliedDate: leave.appliedDate,
      approvedBy: leave.approvedBy,
      approvedDate: leave.approvedDate,
    });
    setEditingLeaveId(leave.id);
    setFormMode("edit");
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    if (
      !formState.employeeId ||
      !formState.employeeName ||
      !formState.leaveType ||
      !formState.startDate ||
      !formState.endDate ||
      !formState.reason
    ) {
      toast.error("Please fill all required fields.");
      return false;
    }

    if (new Date(formState.startDate) > new Date(formState.endDate)) {
      toast.error("End date must be after start date.");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const totalDays = calculateDays(formState.startDate, formState.endDate);
    const appliedDate =
      formMode === "create"
        ? new Date().toISOString()
        : formState.appliedDate ?? new Date().toISOString();

    const year = new Date(formState.startDate || appliedDate).getFullYear();
    const sameYearCount = dbLeaves.filter((leave) =>
      leave.leave_number?.startsWith(`LV-${year}-`)
    ).length;

    const leaveNumber =
      formMode === "edit" && editingLeaveId
        ? dbLeaves.find((leave) => leave.leave_id === editingLeaveId)?.leave_number ??
          `LV-${year}-${String(sameYearCount + 1).padStart(3, "0")}`
        : `LV-${year}-${String(sameYearCount + 1).padStart(3, "0")}`;

    const payload = {
      leave_number: leaveNumber,
      employee_id: formState.employeeId,
      employee_name: formState.employeeName,
      employee_department: formState.employeeDepartment || null,
      employee_position: formState.employeePosition || null,
      leave_type: formState.leaveType as LeaveTypeOption,
      start_date: formState.startDate,
      end_date: formState.endDate,
      total_days: totalDays,
      reason: formState.reason,
      status: formState.status,
      applied_date: appliedDate,
      approved_by: formState.status === "approved" ? formState.approvedBy ?? "HR Manager" : null,
      approved_date:
        formState.status === "approved"
          ? formState.approvedDate ?? new Date().toISOString()
          : null,
      notes: formState.notes || null,
    };

    setIsSubmitting(true);

    try {
      if (formMode === "edit" && editingLeaveId) {
        await dispatch(
          thunks.leaves.updateOne({
            id: editingLeaveId,
            values: payload,
          })
        ).unwrap();
        toast.success("Leave request updated successfully!");
      } else {
        await dispatch(
          thunks.leaves.createOne({
            ...payload,
            status: "pending",
            approved_by: null,
            approved_date: null,
          })
        ).unwrap();
        toast.success("Leave request created successfully!");
      }

      setIsFormOpen(false);
      resetForm();
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Failed to save leave request.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const approveLeave = async (leave: LeaveRecord) => {
    try {
      await dispatch(
        thunks.leaves.updateOne({
          id: leave.id,
          values: {
            status: "approved",
            approved_by: "HR Manager",
            approved_date: new Date().toISOString(),
          },
        })
      ).unwrap();
      toast.success("Leave request approved!");
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Failed to approve leave.";
      toast.error(message);
    }
  };

  const rejectLeave = async (leave: LeaveRecord) => {
    try {
      await dispatch(
        thunks.leaves.updateOne({
          id: leave.id,
          values: {
            status: "rejected",
            approved_by: "HR Manager",
            approved_date: new Date().toISOString(),
          },
        })
      ).unwrap();
      toast.success("Leave request rejected.");
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Failed to reject leave.";
      toast.error(message);
    }
  };

  const deleteLeave = async (leaveId: string) => {
    if (!window.confirm("Are you sure you want to delete this leave request?")) {
      return;
    }

    try {
      await dispatch(thunks.leaves.deleteOne(leaveId)).unwrap();
      toast.success("Leave request deleted.");
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Failed to delete leave.";
      toast.error(message);
    }
  };

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (
        employeeSearchRef.current &&
        !employeeSearchRef.current.contains(event.target as Node)
      ) {
        setEmployeeSearchTerm("");
        setIsEmployeeSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Leave Management</h2>
          <p className="text-muted-foreground mt-1">
            Manage employee leave requests and approvals
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Dialog
            open={isFormOpen}
            onOpenChange={(open) => {
              setIsFormOpen(open);
              if (!open) {
                resetForm();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button
                className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                onClick={openCreateForm}
              >
                <Plus className="h-4 w-4" />
                Add Leave Request
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {formMode === "create" ? "Submit Leave Request" : "Update Leave Request"}
              </DialogTitle>
              <DialogDescription>
                {formMode === "create"
                  ? "Fill in the details for a new leave request"
                  : "Modify the leave request details"}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 pt-4">
              <div className="space-y-2" ref={employeeSearchRef}>
                <Label htmlFor="employeeSearch">Find Employee</Label>
                <div className="relative">
                  <Input
                    id="employeeSearch"
                    placeholder="Search employees by name, ID, or department"
                    value={employeeSearchTerm}
                    onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                    onFocus={() => {
                      setIsEmployeeSearchFocused(true);
                    }}
                    disabled={employeesLoading}
                  />
                  {isEmployeeSearchFocused && (
                    <div className="absolute z-20 mt-1 w-full rounded-md border bg-white shadow-md">
                      {employeesLoading ? (
                        <div className="px-4 py-2 text-sm text-muted-foreground">
                          Loading employees...
                        </div>
                      ) : employeeSuggestions.length === 0 ? (
                        <div className="px-4 py-2 text-sm text-muted-foreground">
                          No employees found. You can fill the fields manually.
                        </div>
                      ) : (
                        employeeSuggestions.map((employee) => (
                          <button
                            key={employee.employee_id}
                            type="button"
                            className="flex w-full flex-col items-start px-4 py-2 text-left hover:bg-muted"
                            onClick={() => handleSelectEmployee(employee)}
                          >
                            <span className="font-medium">
                              {employee.name_en ?? employee.name_ar ?? "Unnamed Employee"}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {employee.employee_id} • {employee.department ?? "—"}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Select an employee to prefill details or leave blank to enter manually.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employeeId">Employee ID *</Label>
                  <Input
                    id="employeeId"
                    placeholder="EMP-001"
                    value={formState.employeeId}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, employeeId: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeeName">Employee Name *</Label>
                  <Input
                    id="employeeName"
                    placeholder="Full name"
                    value={formState.employeeName}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, employeeName: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="employeeDepartment">Department</Label>
                  <Input
                    id="employeeDepartment"
                    placeholder="Department"
                    value={formState.employeeDepartment}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        employeeDepartment: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="employeePosition">Position</Label>
                  <Input
                    id="employeePosition"
                    placeholder="Position"
                    value={formState.employeePosition}
                    onChange={(e) =>
                      setFormState((prev) => ({
                        ...prev,
                        employeePosition: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="leaveType">Leave Type *</Label>
                <Select
                  value={formState.leaveType}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, leaveType: value as LeaveTypeOption }))
                  }
                >
                  <SelectTrigger id="leaveType">
                    <SelectValue placeholder="Select leave type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="annual">Annual Leave</SelectItem>
                    <SelectItem value="sick">Sick Leave</SelectItem>
                    <SelectItem value="emergency">Emergency Leave</SelectItem>
                    <SelectItem value="unpaid">Unpaid Leave</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input
                    id="startDate"
                    type="date"
                    value={formState.startDate}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, startDate: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date *</Label>
                  <Input
                    id="endDate"
                    type="date"
                    value={formState.endDate}
                    onChange={(e) =>
                      setFormState((prev) => ({ ...prev, endDate: e.target.value }))
                    }
                  />
                </div>
              </div>

              {formState.startDate &&
                formState.endDate &&
                new Date(formState.startDate) <= new Date(formState.endDate) && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="text-sm text-blue-900">
                      <strong>Duration:</strong>{" "}
                      {calculateDays(formState.startDate, formState.endDate)} day(s)
                    </div>
                  </div>
                )}

              <div className="space-y-2">
                <Label htmlFor="reason">Reason *</Label>
                <Textarea
                  id="reason"
                  placeholder="Reason for leave request..."
                  value={formState.reason}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, reason: e.target.value }))
                  }
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes">Additional Notes</Label>
                <Textarea
                  id="notes"
                  placeholder="Any additional information..."
                  value={formState.notes}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, notes: e.target.value }))
                  }
                  rows={2}
                />
              </div>

              {formMode === "edit" && (
                <div className="space-y-2">
                  <Label htmlFor="status">Status</Label>
                  <Select
                    value={formState.status}
                    onValueChange={(value) =>
                      setFormState((prev) => ({
                        ...prev,
                        status: value as LeaveStatusOption,
                      }))
                    }
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="rejected">Rejected</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setIsFormOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                className="bg-purple-600 hover:bg-purple-700 text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Saving..." : formMode === "create" ? "Submit Request" : "Save Changes"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Requests
            </CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalLeaves}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingLeaves}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedLeaves}</div>
            <p className="text-xs text-muted-foreground mt-1">This year</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Days</CardTitle>
            <Clock className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalDays}</div>
            <p className="text-xs text-muted-foreground mt-1">Approved leave days</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Leave Requests</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="annual">Annual</SelectItem>
                  <SelectItem value="sick">Sick</SelectItem>
                  <SelectItem value="emergency">Emergency</SelectItem>
                  <SelectItem value="unpaid">Unpaid</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search leaves..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-[250px]"
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
                  <TableHead>Leave #</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Days</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leavesLoading && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Loading leave requests...
                    </TableCell>
                  </TableRow>
                )}
                {!leavesLoading &&
                  filteredLeaves.map((leave) => (
                    <TableRow key={leave.id}>
                      <TableCell>
                        <div className="font-mono text-sm text-muted-foreground">
                          {leave.leaveNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{leave.employeeName}</div>
                          <div className="text-xs text-muted-foreground">
                            {leave.employeeId}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {leave.employeeDepartment} • {leave.employeePosition}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={leaveTypeColors[leave.leaveType]}>
                          {leave.leaveType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(leave.startDate, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(leave.endDate, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-semibold">{leave.totalDays}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[leave.status]}>
                          {leave.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedLeaveId(leave.id);
                              setIsDetailsDialogOpen(true);
                            }}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditForm(leave)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => deleteLeave(leave.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {leave.status === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 hover:text-green-700"
                                onClick={() => approveLeave(leave)}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => rejectLeave(leave)}
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {!leavesLoading && filteredLeaves.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <Clock className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {searchQuery
                  ? "No leave requests found matching your search."
                  : "No leave requests found"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={isDetailsDialogOpen}
        onOpenChange={(open) => {
          setIsDetailsDialogOpen(open);
          if (!open) {
            setSelectedLeaveId(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Leave Request Details</DialogTitle>
            <DialogDescription>{selectedLeave?.leaveNumber}</DialogDescription>
          </DialogHeader>
          {selectedLeave && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Employee</Label>
                  <div>
                    <div className="font-medium">{selectedLeave.employeeName}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedLeave.employeeId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedLeave.employeeDepartment} • {selectedLeave.employeePosition}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Leave Type</Label>
                  <div>
                    <Badge className={leaveTypeColors[selectedLeave.leaveType]}>
                      {selectedLeave.leaveType}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Start Date</Label>
                  <div className="font-medium">
                    {formatDate(selectedLeave.startDate, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">End Date</Label>
                  <div className="font-medium">
                    {formatDate(selectedLeave.endDate, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Duration</Label>
                  <div className="font-bold text-blue-600">
                    {selectedLeave.totalDays} day(s)
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  {selectedLeave.reason}
                </div>
              </div>

              {selectedLeave.notes && (
                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    {selectedLeave.notes}
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-muted-foreground">Status</Label>
                <div>
                  <Badge className={statusColors[selectedLeave.status]}>
                    {selectedLeave.status}
                  </Badge>
                </div>
              </div>

              <div className="pt-4 border-t grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Applied Date</Label>
                  <div className="text-sm">
                    {formatDate(selectedLeave.appliedDate, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                {selectedLeave.approvedBy && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Approved By</Label>
                      <div className="text-sm">{selectedLeave.approvedBy}</div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Approved Date</Label>
                      <div className="text-sm">
                        {formatDate(selectedLeave.approvedDate, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {selectedLeave.status === "pending" && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => {
                      approveLeave(selectedLeave);
                      setIsDetailsDialogOpen(false);
                    }}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve Request
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700"
                    onClick={() => {
                      rejectLeave(selectedLeave);
                      setIsDetailsDialogOpen(false);
                    }}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Request
                  </Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}


