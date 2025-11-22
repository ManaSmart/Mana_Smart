import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Calendar, Download, Printer, FileText, Plus, Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "@e965/xlsx";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Employees as DbEmployee } from "../../supabase/models/employees";
import type { EmployeeAttendance as DbAttendance } from "../../supabase/models/employee_attendance";

interface AttendanceDay {
  date: number;
  status: "P" | "A" | "L" | "H" | "W" | "";
  locked: boolean;
}

interface EmployeeAttendanceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  department: string;
  days: AttendanceDay[];
  totalPresent: number;
  totalAbsent: number;
  totalLeave: number;
  totalHoliday: number;
  totalWeekend: number;
  lockedDays: Record<number, boolean>;
  originalStatusByDay: Record<number, AttendanceDay["status"]>;
  attendanceRecordId: string | null;
}

const months = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

const years = ["2025", "2024", "2023"];

const defaultDepartments = ["Sales", "HR", "Finance", "Operations", "IT", "Marketing"];

const getDaysInMonth = (month: number, year: number) =>
  new Date(year, month + 1, 0).getDate();

const normalizeAttendanceStatus = (status: unknown): AttendanceDay["status"] => {
  if (status === "P" || status === "A" || status === "L" || status === "H" || status === "W") {
    return status;
  }
  return "";
};

const normalizeAttendanceMonthKey = (attendanceMonth: string | null | undefined): string | null => {
  if (!attendanceMonth) return null;
  const parsed = new Date(attendanceMonth);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, "0");
    return `${year}-${month}`;
  }
  const match = attendanceMonth.match(/^(\d{4})-(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}`;
  }
  return null;
};

const computeTotals = (days: AttendanceDay[]) => {
  return days.reduce(
    (acc, day) => {
      if (day.status === "P") acc.present += 1;
      else if (day.status === "A") acc.absent += 1;
      else if (day.status === "L") acc.leave += 1;
      else if (day.status === "H") acc.holiday += 1;
      else if (day.status === "W") acc.weekend += 1;
      return acc;
    },
    { present: 0, absent: 0, leave: 0, holiday: 0, weekend: 0 }
  );
};

const isFutureDay = (year: number, monthIndex: number, day: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(year, monthIndex, day);
  target.setHours(0, 0, 0, 0);
  return target > today;
};

export function AttendanceSheet() {
  const dispatch = useAppDispatch();
  const dbEmployees = useAppSelector(selectors.employees.selectAll) as DbEmployee[];
  const employeesLoading = useAppSelector(selectors.employees.selectLoading);
  const attendanceRecords = useAppSelector(selectors.employee_attendance.selectAll) as DbAttendance[];
  const attendanceLoading = useAppSelector(selectors.employee_attendance.selectLoading);

  const [selectedMonth, setSelectedMonth] = useState("10"); // November (0-indexed)
  const [selectedYear, setSelectedYear] = useState("2025");
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [attendanceData, setAttendanceData] = useState<EmployeeAttendanceRow[]>([]);
  const [isGenerated, setIsGenerated] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dispatch(thunks.employees.fetchAll(undefined));
    dispatch(thunks.employee_attendance.fetchAll(undefined));
  }, [dispatch]);

  const employeesList = useMemo(
    () =>
      dbEmployees.map((emp) => ({
        id: emp.employee_id,
        name: emp.name_en ?? emp.name_ar ?? "Unnamed Employee",
        department: emp.department ?? "General",
      })),
    [dbEmployees]
  );

  const departmentOptions = useMemo(() => {
    const set = new Set<string>(defaultDepartments);
    employeesList.forEach((emp) => {
      if (emp.department) {
        set.add(emp.department);
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [employeesList]);

  const attendanceRecordLookup = useMemo(() => {
    const map = new Map<string, DbAttendance>();
    attendanceRecords.forEach((record) => {
      const monthKey = normalizeAttendanceMonthKey(record.attendance_month);
      if (!monthKey) return;
      map.set(`${record.employee_id}-${monthKey}`, record);
    });
    return map;
  }, [attendanceRecords]);

  const filteredEmployees = useMemo(() => {
    let list = employeesList;
    if (selectedDepartment !== "all") {
      list = list.filter((emp) => emp.department === selectedDepartment);
    }
    if (searchTerm) {
      const query = searchTerm.toLowerCase();
      list = list.filter(
        (emp) =>
          emp.name.toLowerCase().includes(query) ||
          emp.id.toLowerCase().includes(query) ||
          emp.id.slice(0, 8).toLowerCase().includes(query) ||
          emp.department.toLowerCase().includes(query)
      );
    }
    return list;
  }, [employeesList, selectedDepartment, searchTerm]);

  const generateAttendanceSheet = useCallback(
    (silent = false) => {
      if (employeesLoading) return;

      const monthNum = parseInt(selectedMonth, 10);
      const yearNum = parseInt(selectedYear, 10);
      const daysInMonth = getDaysInMonth(monthNum, yearNum);
      const paddedMonth = String(monthNum + 1).padStart(2, "0");
      const monthKey = `${selectedYear}-${paddedMonth}`;

      if (filteredEmployees.length === 0) {
        setAttendanceData([]);
        setIsGenerated(false);
        if (!silent) {
          toast.error("No employees found for the selected filters.");
        }
        return;
      }

      const data: EmployeeAttendanceRow[] = filteredEmployees.map((emp) => {
        const attendanceRecord = attendanceRecordLookup.get(`${emp.id}-${monthKey}`) ?? null;
        const statusByDayRaw = (attendanceRecord?.status_by_day ?? {}) as Record<string, unknown>;
        const lockedDays: Record<number, boolean> = {};
        const originalStatusByDay: Record<number, AttendanceDay["status"]> = {};

        Object.entries(statusByDayRaw).forEach(([dayString, statusValue]) => {
          const dayNumber = Number(dayString);
          if (!Number.isFinite(dayNumber) || dayNumber < 1 || dayNumber > 31) return;
          const normalizedStatus = normalizeAttendanceStatus(statusValue);
          if (!normalizedStatus) return;
          lockedDays[dayNumber] = true;
          if (normalizedStatus !== "W") {
            originalStatusByDay[dayNumber] = normalizedStatus;
          }
        });

        const days: AttendanceDay[] = [];

        for (let day = 1; day <= daysInMonth; day++) {
          const date = new Date(yearNum, monthNum, day);
          date.setHours(0, 0, 0, 0);
          const dayOfWeek = date.getDay();
          const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
          const savedStatus = normalizeAttendanceStatus(statusByDayRaw[String(day)]);
          const locked = Boolean(lockedDays[day]);

          let status: AttendanceDay["status"] = savedStatus;
          if (!status) {
            status = isWeekend ? "W" : "";
          }

          days.push({
            date: day,
            status,
            locked,
          });
        }

        const totals = computeTotals(days);

        return {
          id: emp.id,
          employeeId: emp.id,
          employeeName: emp.name,
          department: emp.department,
          days,
          totalPresent: totals.present,
          totalAbsent: totals.absent,
          totalLeave: totals.leave,
          totalHoliday: totals.holiday,
          totalWeekend: totals.weekend,
          lockedDays,
          originalStatusByDay,
          attendanceRecordId: attendanceRecord?.attendance_id ?? null,
        };
      });

      setAttendanceData(data);
      setIsGenerated(true);
      if (!silent) {
        toast.success("Attendance sheet loaded successfully!");
      }
    },
    [
      attendanceRecordLookup,
      employeesLoading,
      filteredEmployees,
      selectedMonth,
      selectedYear,
    ]
  );

  useEffect(() => {
    generateAttendanceSheet(true);
  }, [generateAttendanceSheet]);

  const handleCellClick = (empId: string, dayIndex: number) => {
    setAttendanceData((prev) =>
      prev.map((emp) => {
        if (emp.id !== empId) return emp;
        const targetDay = emp.days[dayIndex];
        if (!targetDay) return emp;
        const monthNum = parseInt(selectedMonth, 10);
        const yearNum = parseInt(selectedYear, 10);
        if (
          targetDay.status === "W" ||
          targetDay.locked ||
          isFutureDay(yearNum, monthNum, targetDay.date)
        ) {
          return emp;
        }

        const cycle: Array<AttendanceDay["status"]> = ["", "P", "A", "L", "H"];
        const currentIndex = cycle.indexOf(targetDay.status);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % cycle.length : 1;
        const nextStatus = cycle[nextIndex];

        const newDays = [...emp.days];
        newDays[dayIndex] = { ...targetDay, status: nextStatus };
        const totals = computeTotals(newDays);

        return {
          ...emp,
          days: newDays,
          totalPresent: totals.present,
          totalAbsent: totals.absent,
          totalLeave: totals.leave,
          totalHoliday: totals.holiday,
          totalWeekend: totals.weekend,
        };
      })
    );
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    window.print();
    toast.success("Please use your browser's print dialog to save as PDF");
  };

  const exportToExcel = () => {
    try {
      if (!isGenerated || attendanceData.length === 0) {
        toast.error("Generate attendance sheet before exporting");
        return;
      }

      const monthNum = parseInt(selectedMonth, 10);
      const yearNum = parseInt(selectedYear, 10);
      const daysInMonth = getDaysInMonth(monthNum, yearNum);
      const monthName = new Date(yearNum, monthNum, 1).toLocaleString('default', { month: 'long' });

      // Create headers with day numbers
      const headers: Record<string, any> = {
        "Employee ID": "",
        "Employee Name": "",
        "Department": "",
      };
      
      for (let day = 1; day <= daysInMonth; day++) {
        headers[`Day ${day}`] = "";
      }
      
      headers["Total Present"] = "";
      headers["Total Absent"] = "";
      headers["Total Leave"] = "";
      headers["Total Holiday"] = "";
      headers["Total Weekend"] = "";

      // Create rows
      const exportData = attendanceData.map((row) => {
        const rowData: Record<string, any> = {
          "Employee ID": row.employeeId,
          "Employee Name": row.employeeName,
          "Department": row.department,
        };
        
        for (let day = 1; day <= daysInMonth; day++) {
          const dayData = row.days.find(d => d.date === day);
          rowData[`Day ${day}`] = dayData?.status || "";
        }
        
        rowData["Total Present"] = row.totalPresent;
        rowData["Total Absent"] = row.totalAbsent;
        rowData["Total Leave"] = row.totalLeave;
        rowData["Total Holiday"] = row.totalHoliday;
        rowData["Total Weekend"] = row.totalWeekend;
        
        return rowData;
      });

      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `${monthName} ${yearNum}`);
      const fileName = `attendance_${monthName}_${yearNum}_${new Date().toISOString().split("T")[0]}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success("Excel file exported successfully");
    } catch (error) {
      toast.error("Failed to export Excel file");
      console.error(error);
    }
  };

  const handleSaveAttendance = async () => {
    if (!isGenerated || attendanceData.length === 0) {
      toast.error("Generate attendance before saving.");
      return;
    }

    const monthNum = parseInt(selectedMonth, 10);
    const yearNum = parseInt(selectedYear, 10);
    const paddedMonth = String(monthNum + 1).padStart(2, "0");
    const monthKey = `${selectedYear}-${paddedMonth}`;
    const attendanceMonthValue = `${monthKey}-01`;

    setIsSaving(true);
    try {
      const operations: Array<Promise<unknown>> = [];

      attendanceData.forEach((record) => {
        const existingRecord = attendanceRecordLookup.get(`${record.employeeId}-${monthKey}`);
        const baseStatuses: Record<string, string> = {};

        Object.entries(record.originalStatusByDay).forEach(([dayString, statusValue]) => {
          if (!statusValue || statusValue === "W") return;
          baseStatuses[dayString] = statusValue;
        });

        let hasNewStatuses = false;

        record.days.forEach((day) => {
          if (!day.status || day.status === "W") return;
          if (isFutureDay(yearNum, monthNum, day.date)) return;
          if (record.lockedDays[day.date]) return;

          const key = String(day.date);
          if (baseStatuses[key] === day.status) return;
          baseStatuses[key] = day.status;
          hasNewStatuses = true;
        });

        if (existingRecord) {
          if (!hasNewStatuses) {
            return;
          }
          const totals = computeTotals(record.days);
          operations.push(
            dispatch(
              thunks.employee_attendance.updateOne({
                id: existingRecord.attendance_id,
                values: {
                  status_by_day: baseStatuses,
                  total_present: totals.present,
                  total_absent: totals.absent,
                  total_leave: totals.leave,
                  total_holiday: totals.holiday,
                  total_weekend: totals.weekend,
                },
              })
            ).unwrap()
          );
        } else {
          if (Object.keys(baseStatuses).length === 0) {
            return;
          }
          const totals = computeTotals(record.days);
          operations.push(
            dispatch(
              thunks.employee_attendance.createOne({
                employee_id: record.employeeId,
                attendance_month: attendanceMonthValue,
                status_by_day: baseStatuses,
                total_present: totals.present,
                total_absent: totals.absent,
                total_leave: totals.leave,
                total_holiday: totals.holiday,
                total_weekend: totals.weekend,
              })
            ).unwrap()
          );
        }
      });

      if (operations.length === 0) {
        toast.info("No attendance changes to save.");
        return;
      }

      await Promise.all(operations);
      await Promise.all([
        dispatch(thunks.employees.fetchAll(undefined)).unwrap(),
        dispatch(thunks.employee_attendance.fetchAll(undefined)).unwrap(),
      ]);
      toast.success("Attendance saved successfully!");
    } catch (error: any) {
      const message = error?.message || error?.error?.message || "Failed to save attendance";
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "P": return "bg-green-100 text-green-700 hover:bg-green-200 border-green-300";
      case "A": return "bg-red-100 text-red-700 hover:bg-red-200 border-red-300";
      case "L": return "bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-300";
      case "H": return "bg-purple-100 text-purple-700 hover:bg-purple-200 border-purple-300";
      case "W": return "bg-gray-100 text-gray-500 border-gray-300";
      default: return "bg-white hover:bg-gray-50 border-gray-300";
    }
  };

  const monthNum = parseInt(selectedMonth, 10);
  const yearNum = parseInt(selectedYear, 10);
  const daysInMonth = getDaysInMonth(monthNum, yearNum);

  return (
    <div className="space-y-6">
      {/* Header - Hidden in print */}
      <div className="no-print">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2">
              <Calendar className="h-7 w-7 text-primary" />
              Monthly Attendance Sheet - كشف الحضور الشهري
            </h1>
            <p className="text-muted-foreground mt-1">
              Generate and manage employee attendance records
            </p>
          </div>
        </div>
      </div>

      {/* Filters - Hidden in print */}
      <Card className="no-print">
        <CardHeader>
          <CardTitle>Generate Attendance Sheet</CardTitle>
          <CardDescription>Select month, year, and department to generate attendance records</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-2">
              <Label>Month - الشهر</Label>
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map((month, index) => (
                    <SelectItem key={index} value={index.toString()}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Year - السنة</Label>
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {years.map((year) => (
                    <SelectItem key={year} value={year}>
                      {year}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Department - القسم</Label>
              <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Departments</SelectItem>
                  {departmentOptions.map((dept) => (
                    <SelectItem key={dept} value={dept}>
                      {dept}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Search Employee</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Name or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="opacity-0">Action</Label>
              <Button
                onClick={() => generateAttendanceSheet()}
                className="w-full gap-2"
                disabled={employeesLoading || employeesList.length === 0}
              >
                <Plus className="h-4 w-4" />
                Generate Sheet
              </Button>
            </div>
          </div>

          {isGenerated && (
            <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t">
              <Button
                onClick={handleSaveAttendance}
                className="gap-2"
                disabled={isSaving || attendanceData.length === 0 || employeesLoading || attendanceLoading}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4" />
                )}
                {isSaving ? "Saving..." : "Save Attendance"}
              </Button>
              <Button onClick={exportToExcel} variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export Excel
              </Button>
              <Button onClick={handlePrint} variant="outline" className="gap-2">
                <Printer className="h-4 w-4" />
                Print
              </Button>
              <Button onClick={handleExportPDF} variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Legend - Hidden in print */}
      {isGenerated && (
        <Card className="no-print">
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-green-100 border border-green-200 flex items-center justify-center font-medium text-green-700">P</div>
                <span className="text-sm">Present - حاضر</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-red-100 border border-red-200 flex items-center justify-center font-medium text-red-700">A</div>
                <span className="text-sm">Absent - غائب</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-blue-100 border border-blue-200 flex items-center justify-center font-medium text-blue-700">L</div>
                <span className="text-sm">Leave - إجازة</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-purple-100 border border-purple-200 flex items-center justify-center font-medium text-purple-700">H</div>
                <span className="text-sm">Holiday - عطلة رسمية</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded bg-gray-100 border border-gray-200 flex items-center justify-center font-medium text-gray-500">W</div>
                <span className="text-sm">Weekend - عطلة أسبوعية</span>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              💡 Click on any cell to change status
            </p>
          </CardContent>
        </Card>
      )}

      {/* Attendance Sheet - Printable */}
      {isGenerated && (
        <div ref={printRef} className="print-area">
          {/* Print Header - Only visible in print */}
          <div className="print-header">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold">Monthly Attendance Sheet</h1>
              <h2 className="text-xl font-semibold text-muted-foreground">كشف الحضور الشهري</h2>
              <p className="text-lg mt-2">
                {months[monthNum]} {selectedYear}
              </p>
              {selectedDepartment !== "all" && (
                <p className="text-base mt-1">Department: {selectedDepartment} • القسم: {selectedDepartment}</p>
              )}
            </div>
          </div>

          <Card>
            <CardHeader className="no-print">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>
                    Attendance Record - {months[monthNum]} {selectedYear}
                  </CardTitle>
                  <CardDescription>
                    {selectedDepartment !== "all" ? `Department: ${selectedDepartment}` : "All Departments"} • {attendanceData.length} Employees
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky-col-1 min-w-[150px]">Employee<br/>الموظف</TableHead>
                      <TableHead className="sticky-col-2 min-w-[100px]">Department<br/>القسم</TableHead>
                      {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                        const date = new Date(yearNum, monthNum, day);
                        const dayOfWeek = date.getDay();
                        const isWeekend = dayOfWeek === 5 || dayOfWeek === 6;
                        
                        return (
                          <TableHead 
                            key={day} 
                            className={`text-center min-w-[40px] ${isWeekend ? 'bg-gray-50' : ''}`}
                          >
                            <div className="text-xs font-medium">{day}</div>
                          </TableHead>
                        );
                      })}
                      <TableHead className="text-center bg-green-50 min-w-[50px]">P<br/>حاضر</TableHead>
                      <TableHead className="text-center bg-red-50 min-w-[50px]">A<br/>غائب</TableHead>
                      <TableHead className="text-center bg-blue-50 min-w-[50px]">L<br/>إجازة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {attendanceData.map((employee) => (
                      <TableRow key={employee.id}>
                        <TableCell className="sticky-col-1">
                          <div>
                            <div className="font-medium">{employee.employeeName}</div>
                            <div className="text-xs text-muted-foreground">
                              {employee.employeeId.slice(0, 8).toUpperCase()}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="sticky-col-2 text-sm">
                          {employee.department}
                        </TableCell>
                        {employee.days.map((day, index) => {
                          const isFuture = isFutureDay(yearNum, monthNum, day.date);
                          const isDisabled = day.status === "W" || day.locked || isFuture;
                          const reason =
                            day.status === "W"
                              ? "Weekend entries cannot be modified."
                              : day.locked
                              ? "Attendance already saved for this date."
                              : isFuture
                              ? "Cannot record attendance for future dates."
                              : undefined;
                          return (
                            <TableCell
                              key={index}
                              className={`text-center p-1 ${day.status === "W" ? "bg-gray-50" : ""}`}
                            >
                              <button
                                onClick={() => handleCellClick(employee.id, index)}
                                disabled={isDisabled}
                                title={reason}
                                className={`attendance-cell w-full h-8 rounded text-xs font-medium transition-colors border ${
                                  getStatusColor(day.status)
                                } ${isDisabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
                              >
                                {day.status}
                              </button>
                            </TableCell>
                          );
                        })}
                        <TableCell className="text-center font-medium bg-green-50">
                          {employee.totalPresent}
                        </TableCell>
                        <TableCell className="text-center font-medium bg-red-50">
                          {employee.totalAbsent}
                        </TableCell>
                        <TableCell className="text-center font-medium bg-blue-50">
                          {employee.totalLeave}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Print Footer - Only visible in print */}
          <div className="print-footer">
            <div className="grid grid-cols-3 gap-8 mt-8">
              <div className="text-center">
                <p className="text-sm mb-8">_____________________</p>
                <p className="text-sm font-medium">Prepared By</p>
                <p className="text-xs text-muted-foreground">HR Manager</p>
              </div>
              <div className="text-center">
                <p className="text-sm mb-8">_____________________</p>
                <p className="text-sm font-medium">Reviewed By</p>
                <p className="text-xs text-muted-foreground">Department Manager</p>
              </div>
              <div className="text-center">
                <p className="text-sm mb-8">_____________________</p>
                <p className="text-sm font-medium">Approved By</p>
                <p className="text-xs text-muted-foreground">General Manager</p>
              </div>
            </div>
            <div className="text-center mt-6 text-xs text-muted-foreground">
              Generated on: {new Date().toLocaleDateString('en-GB')} at {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>
      )}

      {!isGenerated && (
        <Card>
          <CardContent className="py-12 text-center">
            <Calendar className="h-16 w-16 mx-auto text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">No Attendance Sheet Generated</h3>
            <p className="text-muted-foreground">
              Select month, year, and department above, then click "Generate Sheet" to create attendance records
            </p>
          </CardContent>
        </Card>
      )}

      {/* Print Styles */}
      <style>{`
        @media print {
          /* Hide everything by default */
          body * {
            visibility: hidden;
          }

          /* Show only print area and its children */
          .print-area,
          .print-area * {
            visibility: visible;
          }

          /* Position print area */
          .print-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }

          /* Hide non-print elements */
          .no-print {
            display: none !important;
          }

          /* Show print-only elements */
          .print-header,
          .print-footer {
            display: block !important;
          }

          /* Remove interactive styles */
          .attendance-cell {
            cursor: default !important;
            pointer-events: none;
          }

          .attendance-cell:hover {
            background-color: inherit !important;
          }

          /* Ensure backgrounds print */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            color-adjust: exact !important;
          }

          /* Page setup */
          @page {
            size: A4 landscape;
            margin: 1cm;
          }

          /* Table styling for print */
          table {
            page-break-inside: auto;
            border-collapse: collapse;
            width: 100%;
          }

          tr {
            page-break-inside: avoid;
            page-break-after: auto;
          }

          thead {
            display: table-header-group;
          }

          /* Sticky columns in print */
          .sticky-col-1,
          .sticky-col-2 {
            position: static !important;
          }

          /* Card styling for print */
          .print-area > div {
            border: none !important;
            box-shadow: none !important;
          }

          /* Remove padding for print */
          .CardContent {
            padding: 0 !important;
          }

          /* Text sizes for print */
          h1 {
            font-size: 18pt;
          }

          h2 {
            font-size: 14pt;
          }

          p, td, th {
            font-size: 9pt;
          }

          .text-xs {
            font-size: 7pt;
          }
        }

        /* Print-only elements hidden by default */
        .print-header,
        .print-footer {
          display: none;
        }

        /* Sticky columns for screen */
        .sticky-col-1 {
          position: sticky;
          left: 0;
          z-index: 10;
          background: white;
        }

        .sticky-col-2 {
          position: sticky;
          left: 150px;
          z-index: 10;
          background: white;
        }
      `}</style>
    </div>
  );
}
