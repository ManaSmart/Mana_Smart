import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Search, Download, DollarSign, FileText, Upload, Paperclip, Eye, X, Filter, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { Textarea } from "./ui/textarea";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Payrolls as DbPayroll } from "../../supabase/models/payrolls";

interface AttachmentDetails {
  name: string;
  size: number;
  dataUrl: string;
}

interface PayrollRecord {
  id: string;
  payrollNumber: string;
  month: string;
  monthValue: string;
  year: number;
  date: string;
  totalAmount: number;
  notes?: string;
  status: "draft" | "approved" | "paid";
  createdDate: string | null;
  createdBy: string | null;
  paidDate?: string | null;
  attachedFile?: AttachmentDetails;
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const getMonthLabel = (value: string) => {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric >= 1 && numeric <= 12) {
    return monthNames[numeric - 1];
  }
  const matchIndex = monthNames.findIndex((name) => name.toLowerCase() === value?.toLowerCase());
  return matchIndex >= 0 ? monthNames[matchIndex] : value;
};

const parseAttachmentDetails = (details: unknown): AttachmentDetails | undefined => {
  if (!details) return undefined;
  let parsed: any = details;
  if (typeof details === "string") {
    try {
      parsed = JSON.parse(details);
    } catch {
      return undefined;
    }
  }
  if (typeof parsed !== "object" || parsed === null) return undefined;
  if (typeof parsed.name !== "string" || typeof parsed.dataUrl !== "string") return undefined;
  const size = typeof parsed.size === "number" ? parsed.size : Number(parsed.size ?? 0);
  if (!Number.isFinite(size)) return undefined;
  return {
    name: parsed.name,
    dataUrl: parsed.dataUrl,
    size,
  };
};

const serializeAttachmentDetails = (attachment: AttachmentDetails | null) => {
  if (!attachment) return null;
  return {
    name: attachment.name,
    size: attachment.size,
    dataUrl: attachment.dataUrl,
  };
};

const formatDate = (value: string | null | undefined, options: Intl.DateTimeFormatOptions) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB", options);
};

const formatDateTime = (value: string | null | undefined, options: Intl.DateTimeFormatOptions) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", options);
};

const statusColors = {
  draft: "bg-gray-100 text-gray-700 border-gray-200",
  approved: "bg-blue-100 text-blue-700 border-blue-200",
  paid: "bg-green-100 text-green-700 border-green-200",
};

export function Payroll() {
  const dispatch = useAppDispatch();
  const dbPayrolls = useAppSelector(selectors.payrolls.selectAll) as DbPayroll[];
  const payrollsLoading = useAppSelector(selectors.payrolls.selectLoading);

  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");

  // Form states
  const [month, setMonth] = useState("");
  const [year, setYear] = useState("");
  const [date, setDate] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [attachedFile, setAttachedFile] = useState<AttachmentDetails | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dispatch(thunks.payrolls.fetchAll(undefined));
  }, [dispatch]);

  const payrollRecords = useMemo<PayrollRecord[]>(() => {
    return dbPayrolls
      .map((record) => {
        const monthValue = record.payroll_month ?? "";
        const status = (record.status ?? "draft") as PayrollRecord["status"];

        return {
          id: record.payroll_id,
          payrollNumber: record.payroll_number,
          monthValue,
          month: getMonthLabel(monthValue),
          year: record.payroll_year,
          date: record.payroll_date,
          totalAmount: record.total_amount,
          notes: record.notes ?? undefined,
          status,
          createdDate: record.created_at,
          createdBy: record.created_by,
          paidDate: record.paid_at ?? undefined,
          attachedFile: parseAttachmentDetails(record.attached_details),
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [dbPayrolls]);

  const selectedRecord = useMemo(() => {
    if (!selectedRecordId) return null;
    return payrollRecords.find((record) => record.id === selectedRecordId) ?? null;
  }, [payrollRecords, selectedRecordId]);

  useEffect(() => {
    if (!selectedRecordId) return;
    if (!payrollRecords.some((record) => record.id === selectedRecordId)) {
      setSelectedRecordId(null);
      setIsDetailsDialogOpen(false);
    }
  }, [payrollRecords, selectedRecordId]);

  const filteredRecords = useMemo(() => {
    return payrollRecords.filter((record) => {
      const search = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !search ||
        record.month.toLowerCase().includes(search) ||
        record.year.toString().includes(search) ||
        record.payrollNumber.toLowerCase().includes(search);
      const matchesStatus = filterStatus === "all" || record.status === filterStatus;
      return matchesSearch && matchesStatus;
    });
  }, [payrollRecords, searchQuery, filterStatus]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        toast.error("File size should not exceed 10MB");
        return;
      }
      
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachedFile({
          name: file.name,
          size: file.size,
          dataUrl: reader.result as string
        });
        toast.success("File attached successfully");
      };
      reader.readAsDataURL(file);
    }
  };

  const downloadTemplate = () => {
    // Create a simple template structure
    const templateContent = `Payroll Template - Scent System

Month: 
Year: 
Date: 
Total Amount (SAR): 

Employee Details:
--------------------------------------------------
Employee ID | Name | Position | Base Salary | Allowances | Deductions | Social Insurance | Net Salary
--------------------------------------------------



Notes:


This is a template file for payroll records. Fill in the employee details and save this file to upload with your payroll record.
`;

    const blob = new Blob([templateContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'Payroll_Template.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
    toast.success("Template downloaded successfully");
  };

  const handleCreatePayroll = async () => {
    if (!month || !year || !date || !totalAmount) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!attachedFile) {
      toast.error("Please upload the payroll details file.");
      return;
    }

    const yearNumber = parseInt(year, 10);
    if (!Number.isFinite(yearNumber)) {
      toast.error("Invalid year selected.");
      return;
    }

    const amountNumber = parseFloat(totalAmount);
    if (!Number.isFinite(amountNumber)) {
      toast.error("Total amount must be a valid number.");
      return;
    }

    const existingForMonth = dbPayrolls.filter(
      (record) => record.payroll_year === yearNumber && record.payroll_month === month
    ).length;
    const payrollNumber = `PAY-${year}-${month}-${String(existingForMonth + 1).padStart(3, "0")}`;

    setIsSubmitting(true);
    try {
      await dispatch(
        thunks.payrolls.createOne({
          payroll_number: payrollNumber,
          payroll_month: month,
          payroll_year: yearNumber,
          payroll_date: date,
          status: "draft",
          total_amount: amountNumber,
          notes: notes || null,
          attached_details: serializeAttachmentDetails(attachedFile),
          created_by: "Current User",
        })
      ).unwrap();

      toast.success("Payroll created successfully!");
      setIsAddDialogOpen(false);
      resetForm();
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to create payroll record.";
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const resetForm = () => {
    setMonth("");
    setYear("");
    setDate("");
    setTotalAmount("");
    setNotes("");
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const markAsApproved = async (id: string) => {
    try {
      await dispatch(
        thunks.payrolls.updateOne({
          id,
          values: {
            status: "approved",
          },
        })
      ).unwrap();
      toast.success("Payroll approved successfully!");
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to approve payroll.";
      toast.error(message);
    }
  };

  const markAsPaid = async (id: string) => {
    try {
      await dispatch(
        thunks.payrolls.updateOne({
          id,
          values: {
            status: "paid",
            paid_at: new Date().toISOString(),
          },
        })
      ).unwrap();
      toast.success("Payroll marked as paid!");
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to mark payroll as paid.";
      toast.error(message);
    }
  };

  const latestPendingPayroll = useMemo(() => {
    return payrollRecords.find((record) => record.status === "draft" || record.status === "approved") ?? null;
  }, [payrollRecords]);

  const totalMonthlyPayroll = latestPendingPayroll?.totalAmount ?? 0;

  const ytdPayroll = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return payrollRecords
      .filter((record) => record.status === "paid" && record.year === currentYear)
      .reduce((sum, record) => sum + record.totalAmount, 0);
  }, [payrollRecords]);

  const pendingPayroll = useMemo(() => {
    return payrollRecords
      .filter((record) => record.status === "draft" || record.status === "approved")
      .reduce((sum, record) => sum + record.totalAmount, 0);
  }, [payrollRecords]);

  const exportToExcel = () => {
    try {
      const exportData = filteredRecords.map((record) => ({
        "Payroll Number": record.payrollNumber,
        "Month": record.month,
        "Year": record.year,
        "Date": record.date,
        "Total Amount (SAR)": record.totalAmount,
        "Status": record.status,
        "Created Date": record.createdDate || "",
        "Created By": record.createdBy || "",
        "Paid Date": record.paidDate || "",
        "Notes": record.notes || "",
      }));

      const ws = XLSX.utils.json_to_sheet(exportData);
      ws["!cols"] = [
        { wch: 18 }, { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 18 },
        { wch: 12 }, { wch: 18 }, { wch: 20 }, { wch: 12 }, { wch: 30 },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Payroll");
      const fileName = `payroll_${new Date().toISOString().split("T")[0]}.xlsx`;
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
          <h2 className="text-2xl font-semibold tracking-tight">Payroll Management</h2>
          <p className="text-muted-foreground mt-1">Manage monthly payroll records and employee salaries</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportToExcel} variant="outline" className="gap-2">
            <Download className="h-4 w-4" />
            Export Excel
          </Button>
          <Button variant="outline" onClick={downloadTemplate} className="gap-2">
            <FileText className="h-4 w-4" />
            Download Template
          </Button>
          <Dialog
            open={isAddDialogOpen}
            onOpenChange={(open) => {
              setIsAddDialogOpen(open);
              if (!open) {
                resetForm();
                setIsSubmitting(false);
              }
            }}
          >
            <DialogTrigger asChild>
              <Button className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="h-4 w-4" />
                Add Payroll
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-xl">
              <DialogHeader>
                <DialogTitle>Add New Payroll Record</DialogTitle>
                <DialogDescription>Create a new payroll record with total amount and attached details</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="month">Month *</Label>
                    <Select value={month} onValueChange={setMonth}>
                      <SelectTrigger id="month">
                        <SelectValue placeholder="Select month" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="01">January</SelectItem>
                        <SelectItem value="02">February</SelectItem>
                        <SelectItem value="03">March</SelectItem>
                        <SelectItem value="04">April</SelectItem>
                        <SelectItem value="05">May</SelectItem>
                        <SelectItem value="06">June</SelectItem>
                        <SelectItem value="07">July</SelectItem>
                        <SelectItem value="08">August</SelectItem>
                        <SelectItem value="09">September</SelectItem>
                        <SelectItem value="10">October</SelectItem>
                        <SelectItem value="11">November</SelectItem>
                        <SelectItem value="12">December</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">Year *</Label>
                    <Select value={year} onValueChange={setYear}>
                      <SelectTrigger id="year">
                        <SelectValue placeholder="Select year" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input 
                    id="date" 
                    type="date" 
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="totalAmount">Total Amount (SAR) *</Label>
                  <Input 
                    id="totalAmount" 
                    type="number" 
                    placeholder="0.00"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter the total net payroll amount for all employees
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="notes">Notes</Label>
                  <Textarea 
                    id="notes" 
                    placeholder="Additional notes about this payroll..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Attach Payroll Details *</Label>
                  <div className="space-y-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={handleFileUpload}
                      accept=".pdf,.xlsx,.xls,.doc,.docx,.txt"
                      className="hidden"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full"
                    >
                      <Upload className="h-4 w-4 mr-2" />
                      {attachedFile ? "Change File" : "Upload Payroll Details"}
                    </Button>
                    {attachedFile && (
                      <div className="flex items-center gap-2 p-3 bg-muted rounded-md">
                        <Paperclip className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm flex-1 truncate">{attachedFile.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {(attachedFile.size / 1024).toFixed(1)} KB
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => setAttachedFile(null)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    <p className="text-xs text-muted-foreground">
                      Upload the detailed payroll breakdown file containing employee information
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-4">
                <Button variant="outline" onClick={() => {
                  setIsAddDialogOpen(false);
                  resetForm();
                }}>Cancel</Button>
                <Button
                  onClick={handleCreatePayroll}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Adding...
                    </>
                  ) : (
                    "Add Payroll"
                  )}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Records</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{payrollRecords.length}</div>
            <p className="text-xs text-muted-foreground mt-1">Payroll records</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current Month</CardTitle>
            <DollarSign className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{totalMonthlyPayroll.toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">Latest payroll</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending</CardTitle>
            <DollarSign className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{pendingPayroll.toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">Not yet paid</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">YTD Total</CardTitle>
            <DollarSign className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{ytdPayroll.toLocaleString()} ر.س</div>
            <p className="text-xs text-muted-foreground mt-1">Year to date</p>
          </CardContent>
        </Card>
      </div>

      {/* Payroll Records */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Payroll Records</CardTitle>
            <div className="flex items-center gap-2">
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search payrolls..."
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
                  <TableHead>Payroll #</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Total Amount</TableHead>
                  <TableHead>Attachment</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payrollsLoading && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                      Loading payroll records...
                    </TableCell>
                  </TableRow>
                )}
                {!payrollsLoading && filteredRecords.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>
                      <div className="font-mono text-sm text-muted-foreground">{record.payrollNumber}</div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{record.month} {record.year}</div>
                    </TableCell>
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        {formatDate(record.date, {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-green-600">
                      {record.totalAmount.toLocaleString()} ر.س
                    </TableCell>
                    <TableCell>
                      {record.attachedFile ? (
                        <div className="flex items-center gap-1 text-xs">
                          <Paperclip className="h-3 w-3 text-blue-600" />
                          <span className="text-blue-600 truncate max-w-[100px]">{record.attachedFile.name}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">No file</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[record.status]}>
                        {record.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedRecordId(record.id);
                            setIsDetailsDialogOpen(true);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-1" />
                          View
                        </Button>
                        {record.status === "draft" && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => markAsApproved(record.id)}
                          >
                            Approve
                          </Button>
                        )}
                        {record.status === "approved" && (
                          <Button
                            variant="default"
                            size="sm"
                            onClick={() => markAsPaid(record.id)}
                          >
                            Mark Paid
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!payrollsLoading && filteredRecords.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center text-muted-foreground">
                      {searchQuery
                        ? "No payroll records found matching your search."
                        : "No payroll records yet. Create your first payroll record to get started!"}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog
        open={isDetailsDialogOpen}
        onOpenChange={(open) => {
          setIsDetailsDialogOpen(open);
          if (!open) {
            setSelectedRecordId(null);
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Payroll Details</DialogTitle>
            <DialogDescription>
              {selectedRecord?.payrollNumber} - {selectedRecord?.month} {selectedRecord?.year}
            </DialogDescription>
          </DialogHeader>
          {selectedRecord && (
            <div className="space-y-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Payroll Number</Label>
                  <div className="font-mono">{selectedRecord.payrollNumber}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Period</Label>
                  <div className="font-medium">{selectedRecord.month} {selectedRecord.year}</div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Date</Label>
                  <div>
                    {formatDate(selectedRecord.date, {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground">Status</Label>
                  <div>
                    <Badge className={statusColors[selectedRecord.status]}>
                      {selectedRecord.status}
                    </Badge>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg border border-green-200">
                <div className="text-sm text-muted-foreground mb-1">Total Payroll Amount</div>
                <div className="text-3xl font-bold text-green-700">
                  {selectedRecord.totalAmount.toLocaleString()} ر.س
                </div>
              </div>

              {selectedRecord.notes && (
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <div className="p-3 bg-muted rounded-lg text-sm">
                    {selectedRecord.notes}
                  </div>
                </div>
              )}

              {selectedRecord.attachedFile && (
                <div className="space-y-2">
                  <Label>Attached File</Label>
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <Paperclip className="h-5 w-5 text-blue-600" />
                    <div className="flex-1">
                      <div className="font-medium text-sm">{selectedRecord.attachedFile.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {(selectedRecord.attachedFile.size / 1024).toFixed(1)} KB
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const file = selectedRecord.attachedFile;
                        if (!file) return;
                        const link = document.createElement("a");
                        link.href = file.dataUrl;
                        link.download = file.name;
                        link.click();
                      }}
                    >
                      <Download className="h-4 w-4 mr-1" />
                      Download
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Created Date</Label>
                  <div className="text-sm">
                    {formatDateTime(selectedRecord.createdDate, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-muted-foreground text-xs">Created By</Label>
                  <div className="text-sm">{selectedRecord.createdBy ?? "—"}</div>
                </div>
                {selectedRecord.paidDate && (
                  <div className="space-y-1">
                    <Label className="text-muted-foreground text-xs">Paid Date</Label>
                    <div className="text-sm text-green-600">
                      {formatDateTime(selectedRecord.paidDate, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Info Card */}
      <Card className="border-l-4 border-l-blue-600">
        <CardHeader>
          <CardTitle className="text-lg">How to Use Payroll Management</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground">
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs mt-0.5">1</div>
              <span>Download the payroll template using the "Download Template" button</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs mt-0.5">2</div>
              <span>Fill in the template with employee details, salaries, deductions, etc.</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs mt-0.5">3</div>
              <span>Create a new payroll record and enter the total amount</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs mt-0.5">4</div>
              <span>Upload your completed template file with the payroll record</span>
            </div>
            <div className="flex items-start gap-2">
              <div className="h-5 w-5 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs mt-0.5">5</div>
              <span>Approve the payroll when ready, then mark as paid after processing</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
