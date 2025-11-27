import { useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Search,
  Filter,
  DollarSign,
  CheckCircle2,
  XCircle,
  AlertCircle,
  User,
  Pencil,
  Trash2,
  Download,
  FileText,
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
import type {
  EmployeeRequests as DbRequest,
  EmployeeRequestStatus,
  EmployeeRequestType,
} from "../../supabase/models/employee_requests";

type RequestTypeOption = EmployeeRequestType;
type RequestStatusOption = EmployeeRequestStatus;

interface RequestRecord {
  id: string;
  requestNumber: string;
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  employeePosition: string;
  requestType: RequestTypeOption;
  amount: number | null;
  repaymentMonths: number | null;
  monthlyDeduction: number | null;
  leaveStartDate: string | null;
  leaveEndDate: string | null;
  leaveDays: number | null;
  description: string;
  status: RequestStatusOption;
  requestedDate: string | null;
  approvedBy: string | null;
  approvedDate: string | null;
  notes: string | null;
}

interface RequestFormState {
  employeeId: string;
  employeeName: string;
  employeeDepartment: string;
  employeePosition: string;
  requestType: RequestTypeOption | "";
  amount: string;
  repaymentMonths: string;
  leaveStartDate: string;
  leaveEndDate: string;
  description: string;
  notes: string;
  status: RequestStatusOption;
  requestedDate: string | null;
  approvedBy: string | null;
  approvedDate: string | null;
}

const defaultFormState: RequestFormState = {
  employeeId: "",
  employeeName: "",
  employeeDepartment: "",
  employeePosition: "",
  requestType: "",
  amount: "",
  repaymentMonths: "",
  leaveStartDate: "",
  leaveEndDate: "",
  description: "",
  notes: "",
  status: "pending",
  requestedDate: null,
  approvedBy: null,
  approvedDate: null,
};

const requestTypeColors: Record<RequestTypeOption, string> = {
  leave: "bg-blue-100 text-blue-700 border-blue-200",
  advance: "bg-green-100 text-green-700 border-green-200",
  loan: "bg-purple-100 text-purple-700 border-purple-200",
  overtime: "bg-orange-100 text-orange-700 border-orange-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const statusColors: Record<RequestStatusOption, string> = {
  pending: "bg-yellow-100 text-yellow-700 border-yellow-200",
  approved: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-red-100 text-red-700 border-red-200",
  completed: "bg-blue-100 text-blue-700 border-blue-200",
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

export function EmployeeRequests() {
  const dispatch = useAppDispatch();
  const dbRequests = useAppSelector(selectors.employee_requests.selectAll) as DbRequest[];
  const requestsLoading = useAppSelector(selectors.employee_requests.selectLoading);
  const dbEmployees = useAppSelector(selectors.employees.selectAll) as DbEmployee[];
  const employeesLoading = useAppSelector(selectors.employees.selectLoading);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");

  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [formState, setFormState] = useState<RequestFormState>(defaultFormState);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState("");
  const [isEmployeeSearchFocused, setIsEmployeeSearchFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const employeeSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(thunks.employee_requests.fetchAll(undefined));
    dispatch(thunks.employees.fetchAll(undefined));
  }, [dispatch]);

  const employeeLookup = useMemo(() => {
    const map = new Map<string, DbEmployee>();
    dbEmployees.forEach((employee) => map.set(employee.employee_id, employee));
    return map;
  }, [dbEmployees]);

  const requests = useMemo<RequestRecord[]>(() => {
    return dbRequests
      .map((request) => {
        const employee = employeeLookup.get(request.employee_id);
        const name =
          request.employee_name ??
          employee?.name_en ??
          employee?.name_ar ??
          "Unknown Employee";
        const department = request.employee_department ?? employee?.department ?? "—";
        const position = request.employee_position ?? employee?.position ?? "—";

        return {
          id: request.request_id,
          requestNumber: request.request_number,
          employeeId: request.employee_id,
          employeeName: name,
          employeeDepartment: department,
          employeePosition: position,
          requestType: request.request_type,
          amount: request.amount,
          repaymentMonths: request.repayment_months,
          monthlyDeduction: request.monthly_deduction,
          leaveStartDate: request.leave_start_date,
          leaveEndDate: request.leave_end_date,
          leaveDays: request.leave_days,
          description: request.description,
          status: request.status,
          requestedDate: request.requested_date,
          approvedBy: request.approved_by,
          approvedDate: request.approved_date,
          notes: request.notes,
        };
      })
      .sort((a, b) => {
        const dateA = a.requestedDate ? new Date(a.requestedDate).getTime() : 0;
        const dateB = b.requestedDate ? new Date(b.requestedDate).getTime() : 0;
        return dateB - dateA;
      });
  }, [dbRequests, employeeLookup]);

  const selectedRequest = useMemo(() => {
    if (!selectedRequestId) return null;
    return requests.find((request) => request.id === selectedRequestId) ?? null;
  }, [requests, selectedRequestId]);

  useEffect(() => {
    if (!selectedRequestId) return;
    if (!requests.some((request) => request.id === selectedRequestId)) {
      setSelectedRequestId(null);
      setIsDetailsDialogOpen(false);
    }
  }, [requests, selectedRequestId]);

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

  const filteredRequests = useMemo(() => {
    return requests.filter((request) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        request.employeeName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        request.requestNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        request.employeeId.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesStatus = filterStatus === "all" || request.status === filterStatus;
      const matchesType = filterType === "all" || request.requestType === filterType;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [requests, searchQuery, filterStatus, filterType]);

  const totalRequests = requests.length;
  const pendingRequests = requests.filter((r) => r.status === "pending").length;
  const approvedRequests = requests.filter((r) => r.status === "approved").length;
  const totalAdvances = requests
    .filter(
      (r) =>
        (r.requestType === "advance" || r.requestType === "loan") &&
        r.status === "approved" &&
        r.amount
    )
    .reduce((sum, r) => sum + (r.amount ?? 0), 0);

  const exportToExcel = () => {
    try {
      const exportData = filteredRequests.map((request) => ({
        "Request Number": request.requestNumber,
        "Employee ID": request.employeeId,
        "Employee Name": request.employeeName,
        "Department": request.employeeDepartment,
        "Position": request.employeePosition,
        "Request Type": request.requestType,
        "Amount (SAR)": request.amount || "",
        "Repayment Months": request.repaymentMonths || "",
        "Monthly Deduction (SAR)": request.monthlyDeduction || "",
        "Leave Start Date": request.leaveStartDate || "",
        "Leave End Date": request.leaveEndDate || "",
        "Leave Days": request.leaveDays || "",
        "Description": request.description,
        "Status": request.status,
        "Requested Date": request.requestedDate || "",
        "Approved By": request.approvedBy || "",
        "Approved Date": request.approvedDate || "",
        "Notes": request.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 15 }, { wch: 15 }, { wch: 25 }, { wch: 15 }, { wch: 20 },
        { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 18 }, { wch: 12 },
        { wch: 12 }, { wch: 10 }, { wch: 40 }, { wch: 12 }, { wch: 12 },
        { wch: 20 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Employee Requests");
      const fileName = `employee_requests_${new Date().toISOString().split("T")[0]}.xlsx`;
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
    setEditingRequestId(null);
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

  const openEditForm = (request: RequestRecord) => {
    setFormState({
      employeeId: request.employeeId,
      employeeName: request.employeeName,
      employeeDepartment: request.employeeDepartment === "—" ? "" : request.employeeDepartment,
      employeePosition: request.employeePosition === "—" ? "" : request.employeePosition,
      requestType: request.requestType,
      amount: request.amount != null ? String(request.amount) : "",
      repaymentMonths: request.repaymentMonths != null ? String(request.repaymentMonths) : "",
      leaveStartDate: request.leaveStartDate ?? "",
      leaveEndDate: request.leaveEndDate ?? "",
      description: request.description,
      notes: request.notes ?? "",
      status: request.status,
      requestedDate: request.requestedDate,
      approvedBy: request.approvedBy,
      approvedDate: request.approvedDate,
    });
    setEditingRequestId(request.id);
    setFormMode("edit");
    setIsFormOpen(true);
  };

  const validateForm = (): boolean => {
    if (
      !formState.employeeId ||
      !formState.employeeName ||
      !formState.requestType ||
      !formState.description
    ) {
      toast.error("Please fill all required fields.");
      return false;
    }

    if (
      formState.requestType === "leave" &&
      (!formState.leaveStartDate || !formState.leaveEndDate)
    ) {
      toast.error("Please select leave start and end dates.");
      return false;
    }

    if (
      (formState.requestType === "advance" ||
        formState.requestType === "loan" ||
        formState.requestType === "overtime") &&
      !formState.amount
    ) {
      toast.error("Please enter the amount for this request.");
      return false;
    }

    if (
      formState.requestType === "leave" &&
      formState.leaveStartDate &&
      formState.leaveEndDate &&
      new Date(formState.leaveStartDate) > new Date(formState.leaveEndDate)
    ) {
      toast.error("Leave end date must be after start date.");
      return false;
    }

    return true;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    const requestedDate =
      formMode === "create"
        ? new Date().toISOString()
        : formState.requestedDate ?? new Date().toISOString();

    const year = new Date(requestedDate).getFullYear();
    const sameYearCount = dbRequests.filter((request) =>
      request.request_number?.startsWith(`REQ-${year}-`)
    ).length;

    const requestNumber =
      formMode === "edit" && editingRequestId
        ? dbRequests.find((request) => request.request_id === editingRequestId)?.request_number ??
          `REQ-${year}-${String(sameYearCount + 1).padStart(3, "0")}`
        : `REQ-${year}-${String(sameYearCount + 1).padStart(3, "0")}`;

    const amountValue =
      formState.amount.trim() === "" ? null : Number.parseFloat(formState.amount);
    const repaymentValue =
      formState.repaymentMonths.trim() === ""
        ? null
        : Number.parseInt(formState.repaymentMonths, 10);
    const leaveDaysValue =
      formState.requestType === "leave" && formState.leaveStartDate && formState.leaveEndDate
        ? calculateDays(formState.leaveStartDate, formState.leaveEndDate)
        : null;
    const monthlyDeduction =
      amountValue != null && repaymentValue != null && repaymentValue > 0
        ? amountValue / repaymentValue
        : null;

    const payload = {
      request_number: requestNumber,
      employee_id: formState.employeeId,
      employee_name: formState.employeeName,
      employee_department: formState.employeeDepartment || null,
      employee_position: formState.employeePosition || null,
      request_type: formState.requestType as RequestTypeOption,
      amount: amountValue,
      repayment_months: repaymentValue,
      monthly_deduction: monthlyDeduction,
      leave_start_date:
        formState.requestType === "leave" ? formState.leaveStartDate || null : null,
      leave_end_date:
        formState.requestType === "leave" ? formState.leaveEndDate || null : null,
      leave_days: formState.requestType === "leave" ? leaveDaysValue : null,
      description: formState.description,
      status: formState.status,
      requested_date: requestedDate,
      approved_by: formState.status === "approved" ? formState.approvedBy ?? "HR Manager" : null,
      approved_date:
        formState.status === "approved"
          ? formState.approvedDate ?? new Date().toISOString()
          : null,
      notes: formState.notes || null,
    };

    setIsSubmitting(true);

    try {
      if (formMode === "edit" && editingRequestId) {
        await dispatch(
          thunks.employee_requests.updateOne({
            id: editingRequestId,
            values: payload,
          })
        ).unwrap();
        toast.success("Request updated successfully!");
      } else {
        await dispatch(
          thunks.employee_requests.createOne({
            ...payload,
            status: "pending",
            approved_by: null,
            approved_date: null,
          })
        ).unwrap();
        toast.success("Request submitted successfully!");
      }

      setIsFormOpen(false);
      resetForm();
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Failed to save the request.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateRequestStatus = async (
    request: RequestRecord,
    status: RequestStatusOption,
    extra: Partial<DbRequest> = {}
  ) => {
    try {
      await dispatch(
        thunks.employee_requests.updateOne({
          id: request.id,
          values: {
            status,
            ...extra,
          },
        })
      ).unwrap();
      const messageMap: Record<RequestStatusOption, string> = {
        pending: "Request moved back to pending.",
        approved: "Request approved successfully!",
        rejected: "Request rejected.",
        completed: "Request marked as completed.",
      };
      toast.success(messageMap[status]);
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Failed to update request status.";
      toast.error(message);
    }
  };

  const deleteRequest = async (requestId: string) => {
    if (!window.confirm("Are you sure you want to delete this request?")) return;
    try {
      await dispatch(thunks.employee_requests.deleteOne(requestId)).unwrap();
      toast.success("Request deleted.");
    } catch (error: any) {
      const message =
        error?.message || error?.error?.message || "Failed to delete request.";
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
          <h2 className="text-2xl font-semibold tracking-tight">Employee Requests</h2>
          <p className="text-muted-foreground mt-1">
            Manage leave requests, salary advances, loans, and other employee requests
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
                New Request
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>
                {formMode === "create" ? "Submit Employee Request" : "Update Employee Request"}
              </DialogTitle>
              <DialogDescription>
                {formMode === "create"
                  ? "Fill in the details for a new request"
                  : "Modify the request details"}
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
                <Label htmlFor="requestType">Request Type *</Label>
                <Select
                  value={formState.requestType}
                  onValueChange={(value) =>
                    setFormState((prev) => ({ ...prev, requestType: value as RequestTypeOption }))
                  }
                >
                  <SelectTrigger id="requestType">
                    <SelectValue placeholder="Select request type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leave">Leave Request</SelectItem>
                    <SelectItem value="advance">Salary Advance</SelectItem>
                    <SelectItem value="loan">Employee Loan</SelectItem>
                    <SelectItem value="overtime">Overtime Payment</SelectItem>
                    <SelectItem value="other">Other Request</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formState.requestType === "leave" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="leaveStartDate">Start Date *</Label>
                    <Input
                      id="leaveStartDate"
                      type="date"
                      value={formState.leaveStartDate}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, leaveStartDate: e.target.value }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="leaveEndDate">End Date *</Label>
                    <Input
                      id="leaveEndDate"
                      type="date"
                      value={formState.leaveEndDate}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, leaveEndDate: e.target.value }))
                      }
                    />
                  </div>
                  {formState.leaveStartDate &&
                    formState.leaveEndDate &&
                    new Date(formState.leaveStartDate) <= new Date(formState.leaveEndDate) && (
                      <div className="col-span-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-sm text-blue-900">
                          <strong>Duration:</strong>{" "}
                          {calculateDays(formState.leaveStartDate, formState.leaveEndDate)} day(s)
                        </div>
                      </div>
                    )}
                </div>
              )}

              {(formState.requestType === "advance" ||
                formState.requestType === "loan" ||
                formState.requestType === "overtime") && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount">Amount (SAR) *</Label>
                    <Input
                      id="amount"
                      type="number"
                      placeholder="0.00"
                      value={formState.amount}
                      onChange={(e) =>
                        setFormState((prev) => ({ ...prev, amount: e.target.value }))
                      }
                    />
                  </div>

                  {(formState.requestType === "advance" || formState.requestType === "loan") && (
                    <div className="space-y-2">
                      <Label htmlFor="repaymentMonths">Repayment Period (Months)</Label>
                      <Input
                        id="repaymentMonths"
                        type="number"
                        placeholder="Enter number of months"
                        value={formState.repaymentMonths}
                        onChange={(e) =>
                          setFormState((prev) => ({
                            ...prev,
                            repaymentMonths: e.target.value,
                          }))
                        }
                      />
                      {formState.amount &&
                        formState.repaymentMonths &&
                        Number.parseFloat(formState.amount) > 0 &&
                        Number.parseInt(formState.repaymentMonths, 10) > 0 && (
                          <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="text-sm text-green-900">
                              <strong>Monthly Deduction:</strong>{" "}
                              {(
                                Number.parseFloat(formState.amount) /
                                Number.parseInt(formState.repaymentMonths, 10)
                              ).toLocaleString()}{" "}
                              ر.س
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="description">Description *</Label>
                <Textarea
                  id="description"
                  placeholder="Describe the request..."
                  value={formState.description}
                  onChange={(e) =>
                    setFormState((prev) => ({ ...prev, description: e.target.value }))
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
                        status: value as RequestStatusOption,
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
                      <SelectItem value="completed">Completed</SelectItem>
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
            <div className="text-2xl font-bold">{totalRequests}</div>
            <p className="text-xs text-muted-foreground mt-1">All time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <AlertCircle className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingRequests}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Approved</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{approvedRequests}</div>
            <p className="text-xs text-muted-foreground mt-1">This year</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Advances</CardTitle>
            <DollarSign className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-purple-600">{totalAdvances.toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">Approved loans & advances</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Employee Requests</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="All Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="leave">Leave</SelectItem>
                  <SelectItem value="advance">Advance</SelectItem>
                  <SelectItem value="loan">Loan</SelectItem>
                  <SelectItem value="overtime">Overtime</SelectItem>
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
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search requests..."
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
                  <TableHead>Request #</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Requested Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {requestsLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      Loading requests...
                    </TableCell>
                  </TableRow>
                )}
                {!requestsLoading &&
                  filteredRequests.map((request) => (
                    <TableRow key={request.id}>
                      <TableCell>
                        <div className="font-mono text-sm text-muted-foreground">
                          {request.requestNumber}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{request.employeeName}</div>
                          <div className="text-xs text-muted-foreground">{request.employeeId}</div>
                          <div className="text-xs text-muted-foreground">
                            {request.employeeDepartment} • {request.employeePosition}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={requestTypeColors[request.requestType]}>
                          {request.requestType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="space-y-1 text-sm">
                          {request.amount != null && (
                            <div className="font-semibold text-purple-600">
                              {request.amount.toLocaleString()} ر.س
                            </div>
                          )}
                          {request.leaveDays != null && (
                            <div>{request.leaveDays} day(s)</div>
                          )}
                          {request.repaymentMonths != null && (
                            <div className="text-xs text-muted-foreground">
                              {request.repaymentMonths} months
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {formatDate(request.requestedDate, {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusColors[request.status]}>
                          {request.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedRequestId(request.id);
                              setIsDetailsDialogOpen(true);
                            }}
                          >
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditForm(request)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => deleteRequest(request.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          {request.status === "pending" && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-green-600 hover:text-green-700"
                                onClick={() =>
                                  updateRequestStatus(request, "approved", {
                                    approved_by: "HR Manager",
                                    approved_date: new Date().toISOString(),
                                  })
                                }
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() =>
                                  updateRequestStatus(request, "rejected", {
                                    approved_by: "HR Manager",
                                    approved_date: new Date().toISOString(),
                                  })
                                }
                              >
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          {request.status === "approved" && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                updateRequestStatus(request, "completed", {
                                  approved_by: request.approvedBy ?? "HR Manager",
                                  approved_date:
                                    request.approvedDate ?? new Date().toISOString(),
                                })
                              }
                            >
                              Mark Completed
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>

          {!requestsLoading && filteredRequests.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <FileText className="h-12 w-12 text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {searchQuery ? "No requests found matching your search." : "No employee requests found"}
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
            setSelectedRequestId(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
            <DialogDescription>{selectedRequest?.requestNumber}</DialogDescription>
          </DialogHeader>
          {selectedRequest && (
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Employee</Label>
                  <div>
                    <div className="font-medium">{selectedRequest.employeeName}</div>
                    <div className="text-sm text-muted-foreground">
                      {selectedRequest.employeeId}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {selectedRequest.employeeDepartment} • {selectedRequest.employeePosition}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Request Type</Label>
                  <div>
                    <Badge className={requestTypeColors[selectedRequest.requestType]}>
                      {selectedRequest.requestType}
                    </Badge>
                  </div>
                </div>
              </div>

              {selectedRequest.requestType === "leave" && (
                <div className="grid grid-cols-3 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Start Date</Label>
                    <div className="font-medium">
                      {formatDate(selectedRequest.leaveStartDate, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">End Date</Label>
                    <div className="font-medium">
                      {formatDate(selectedRequest.leaveEndDate, {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Duration</Label>
                    <div className="font-bold text-blue-600">
                      {selectedRequest.leaveDays} day(s)
                    </div>
                  </div>
                </div>
              )}

              {selectedRequest.amount != null && (
                <div className="p-4 bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Amount</Label>
                      <div className="text-2xl font-bold text-purple-600">
                        {selectedRequest.amount.toLocaleString()} ر.س
                      </div>
                    </div>
                    {selectedRequest.repaymentMonths != null && (
                      <>
                        <div className="space-y-1">
                          <Label className="text-muted-foreground text-xs">Repayment Period</Label>
                          <div className="text-xl font-semibold">
                            {selectedRequest.repaymentMonths} months
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-muted-foreground text-xs">Monthly Deduction</Label>
                          <div className="text-xl font-semibold text-red-600">
                            {selectedRequest.monthlyDeduction?.toLocaleString()} ر.س
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Description</Label>
                <div className="p-3 bg-muted rounded-lg text-sm">
                  {selectedRequest.description}
                </div>
              </div>

              {selectedRequest.notes && (
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <div className="p-3 bg-muted rounded-lg text-sm">{selectedRequest.notes}</div>
                </div>
              )}

              <div className="space-y-1">
                <Label className="text-muted-foreground">Status</Label>
                <div>
                  <Badge className={statusColors[selectedRequest.status]}>
                    {selectedRequest.status}
                  </Badge>
                </div>
              </div>

              <div className="pt-4 border-t grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Requested Date</Label>
                  <div className="text-sm">
                    {formatDate(selectedRequest.requestedDate, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                {selectedRequest.approvedBy && (
                  <>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Approved By</Label>
                      <div className="text-sm">{selectedRequest.approvedBy}</div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-muted-foreground text-xs">Approved Date</Label>
                      <div className="text-sm">
                        {formatDate(selectedRequest.approvedDate, {
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

              {selectedRequest.status === "pending" && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() =>
                      updateRequestStatus(selectedRequest, "approved", {
                        approved_by: "HR Manager",
                        approved_date: new Date().toISOString(),
                      })
                    }
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Approve Request
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700"
                    onClick={() =>
                      updateRequestStatus(selectedRequest, "rejected", {
                        approved_by: "HR Manager",
                        approved_date: new Date().toISOString(),
                      })
                    }
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Reject Request
                  </Button>
                </div>
              )}

              {selectedRequest.status === "approved" && (
                <div className="flex gap-3 pt-4 border-t">
                  <Button
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                    onClick={() =>
                      updateRequestStatus(selectedRequest, "completed", {
                        approved_by: selectedRequest.approvedBy ?? "HR Manager",
                        approved_date:
                          selectedRequest.approvedDate ?? new Date().toISOString(),
                      })
                    }
                  >
                    Mark Completed
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 text-red-600 hover:text-red-700"
                    onClick={() =>
                      updateRequestStatus(selectedRequest, "rejected", {
                        approved_by: "HR Manager",
                        approved_date: new Date().toISOString(),
                      })
                    }
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

