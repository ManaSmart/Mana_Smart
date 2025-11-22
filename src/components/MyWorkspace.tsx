import { useEffect, useMemo, useState, useCallback } from "react";
import { Calendar, FileText, Users, Clock, AlertCircle, Briefcase, Send, User, Mail, Phone, MapPin, CreditCard, Building2, Package, Laptop, Monitor, Smartphone, Car, Printer, IdCard, ListTodo, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { cn } from "./ui/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { selectors, thunks } from "../redux-toolkit/slices";
import type { Employees } from "../../supabase/models/employees";
import type { EmployeeRequests as DbEmployeeRequest } from "../../supabase/models/employee_requests";
import type { Leaves as DbLeave } from "../../supabase/models/leaves";
import type { MonthlyVisits as DbMonthlyVisit } from "../../supabase/models/monthly_visits";
import type { EmployeeCustodyItems as DbCustodyItem } from "../../supabase/models/employee_custody_items";
import type { CustomerSupportTickets as DbSupportTicket } from "../../supabase/models/customer_support_tickets";
import type { SystemUsers } from "../../supabase/models/system_users";
import { getFilesByOwner, getFileUrl } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";
import { supabase } from "../lib/supabaseClient";

interface EmployeeRequest {
  id: string;
  requestNumber: string;
  type: string;
  subject: string;
  description: string;
  status: string;
  date: string;
  response?: string;
}

interface LeaveRequest {
  id: string;
  leaveNumber: string;
  type: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  response?: string;
}

interface Visit {
  id: string;
  customer: string;
  date: string;
  time: string;
  status: string;
  notes?: string;
}

interface Task {
  id: string;
  title: string;
  description: string;
  dueDate: string;
  priority: string;
  status: string;
}

interface CustodyItem {
  id: string;
  itemName: string;
  itemNameAr: string;
  serialNumber?: string;
  category: string;
  description: string;
  dateReceived: string;
  condition: string;
  value: number;
  notes?: string;
}

interface EmployeeData {
  id: string;
  name: string;
  nameAr: string;
  email: string;
  phone: string;
  position: string;
  positionAr: string;
  department: string;
  departmentAr: string;
  employeeNumber: string;
  nationalId: string;
  dateOfBirth: string;
  joiningDate: string;
  contractType: string;
  basicSalary: number;
  allowances: number;
  address: string;
  emergencyContact: string;
  emergencyPhone: string;
  bankName: string;
  bankAccount: string;
  iban: string;
  status: string;
  photo?: string;
}

// Mock employee data - في التطبيق الحقيقي، سيتم جلبها من قاعدة البيانات حسب المستخدم المسجل
// const mockEmployeeData: EmployeeData = {
//   id: "EMP-0025",
//   name: "Mohammed Ahmed Al-Saeed",
//   nameAr: "محمد أحمد السعيد",
//   email: "mohammed.ahmed@company.com",
//   phone: "+966 50 123 4567",
//   position: "Sales Representative",
//   positionAr: "مندوب مبيعات",
//   department: "Sales & Marketing",
//   departmentAr: "المبيعات والتسويق",
//   employeeNumber: "EMP-0025",
//   nationalId: "1234567890",
//   dateOfBirth: "1990-05-15",
//   joiningDate: "2023-01-10",
//   contractType: "Full-time",
//   basicSalary: 8000,
//   allowances: 2000,
//   address: "Riyadh, Al-Malqa District, Building 45",
//   emergencyContact: "Ahmed Al-Saeed (Father)",
//   emergencyPhone: "+966 55 987 6543",
//   bankName: "Al Rajhi Bank",
//   bankAccount: "12345678901234",
//   iban: "SA1234567890123456789012",
//   status: "Active",
// };

// const mockCustodyItems: CustodyItem[] = [
//   {
//     id: 1,
//     itemName: "Dell Latitude Laptop",
//     itemNameAr: "لابتوب ديل لاتيتيود",
//     serialNumber: "DL2023-456789",
//     category: "Laptop",
//     description: "Dell Latitude 5520, Intel Core i7, 16GB RAM, 512GB SSD",
//     dateReceived: "2023-01-10",
//     condition: "Good",
//     value: 4500,
//     notes: "Issued on joining date",
//   },
//   {
//     id: 2,
//     itemName: "iPhone 14 Pro",
//     itemNameAr: "ايفون 14 برو",
//     serialNumber: "APL-789456123",
//     category: "Mobile",
//     description: "iPhone 14 Pro, 256GB, Space Black",
//     dateReceived: "2023-01-10",
//     condition: "Good",
//     value: 4200,
//   },
//   {
//     id: 3,
//     itemName: "Company Car - Toyota Camry",
//     itemNameAr: "سيارة الشركة - تويوتا كامري",
//     serialNumber: "ABC-1234",
//     category: "Vehicle",
//     description: "Toyota Camry 2022, White",
//     dateReceived: "2023-06-15",
//     condition: "Good",
//     value: 85000,
//     notes: "For field visits",
//   },
//   {
//     id: 4,
//     itemName: "Office Access Card",
//     itemNameAr: "بطاقة دخول المكتب",
//     serialNumber: "ACC-0025",
//     category: "Access Card",
//     description: "Building access card with parking privileges",
//     dateReceived: "2023-01-10",
//     condition: "New",
//     value: 50,
//   },
// ];

const REQUEST_TYPE_LABELS: Record<DbEmployeeRequest["request_type"], string> = {
  advance: "Salary Advance",
  loan: "Loan Request",
  overtime: "Overtime Request",
  leave: "Leave Request",
  other: "Other Request",
};

const REQUEST_STATUS_LABELS: Record<DbEmployeeRequest["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  completed: "Completed",
};

const REQUEST_TYPE_OPTIONS = [
  { value: "advance", label: "Salary Advance" },
  { value: "loan", label: "Loan Request" },
  { value: "overtime", label: "Overtime Request" },
  { value: "leave", label: "Leave Request" },
  { value: "other", label: "Other Request" },
];

const LEAVE_TYPE_LABELS: Record<DbLeave["leave_type"], string> = {
  annual: "Annual Leave",
  sick: "Sick Leave",
  emergency: "Emergency Leave",
  unpaid: "Unpaid Leave",
  other: "Other Leave",
};

const LEAVE_STATUS_LABELS: Record<DbLeave["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

const LEAVE_TYPE_OPTIONS = [
  { value: "annual", label: "Annual Leave" },
  { value: "sick", label: "Sick Leave" },
  { value: "emergency", label: "Emergency Leave" },
  { value: "unpaid", label: "Unpaid Leave" },
  { value: "other", label: "Other Leave" },
];

const VISIT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TASK_STATUS_OPTIONS = ["New", "In Progress", "Completed"] as const;

const toTitleCase = (value: string) =>
  value
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

// Mock data for requests, leaves, visits, tasks
// const mockEmployeeRequests: EmployeeRequest[] = [
//   {
//     id: 1,
//     requestNumber: "REQ-2025-001",
//     type: "Salary Advance",
//     subject: "Request for salary advance",
//     description: "Need advance for emergency expenses",
//     status: "Pending",
//     date: "2025-10-28"
//   },
//   {
//     id: 2,
//     requestNumber: "REQ-2025-002",
//     type: "Equipment",
//     subject: "Laptop upgrade request",
//     description: "Current laptop is slow, need upgrade for better performance",
//     status: "Approved",
//     date: "2025-10-25",
//     response: "Approved. New laptop will be delivered next week."
//   }
// ];

// const mockLeaveRequests: LeaveRequest[] = [
//   {
//     id: 1,
//     leaveNumber: "LV-2025-001",
//     type: "Annual Leave",
//     startDate: "2025-11-15",
//     endDate: "2025-11-20",
//     days: 6,
//     reason: "Family vacation",
//     status: "Approved",
//     response: "Approved. Enjoy your vacation!"
//   },
//   {
//     id: 2,
//     leaveNumber: "LV-2025-002",
//     type: "Sick Leave",
//     startDate: "2025-10-30",
//     endDate: "2025-10-31",
//     days: 2,
//     reason: "Medical appointment",
//     status: "Pending"
//   }
// ];

// const mockVisits: Visit[] = [
//   {
//     id: 1,
//     customer: "Palm Trading Company",
//     date: "2025-10-31",
//     time: "10:00 AM",
//     status: "Scheduled",
//     notes: "Monthly maintenance visit"
//   },
//   {
//     id: 2,
//     customer: "Paradise Corporation",
//     date: "2025-11-02",
//     time: "2:00 PM",
//     status: "Scheduled",
//     notes: "Check fragrance levels"
//   }
// ];

// const mockTasks: Task[] = [
//   {
//     id: 1,
//     title: "Follow up with Paradise Corp",
//     description: "Check on complaint resolution",
//     priority: "High",
//     dueDate: "2025-10-30",
//     status: "Pending"
//   },
//   {
//     id: 2,
//     title: "Prepare monthly report",
//     description: "Sales report for October",
//     priority: "Medium",
//     dueDate: "2025-11-01",
//     status: "In Progress"
//   }
// ];

const getStatusColor = (status: string) => {
  const normalized = status.toLowerCase();
  switch (normalized) {
    case "approved":
    case "completed":
    case "active":
      return "bg-green-100 text-green-700 border-green-200";
    case "pending":
    case "scheduled":
    case "in progress":
    case "new":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "rejected":
    case "cancelled":
    case "inactive":
      return "bg-red-100 text-red-700 border-red-200";
    default:
      return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getPriorityColor = (priority: string) => {
  switch (priority.toLowerCase()) {
    case "high": return "bg-red-100 text-red-700 border-red-200";
    case "medium": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "low": return "bg-gray-100 text-gray-700 border-gray-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getConditionColor = (condition: string) => {
  switch (condition) {
    case "New": return "bg-green-100 text-green-700 border-green-200";
    case "Good": return "bg-blue-100 text-blue-700 border-blue-200";
    case "Fair": return "bg-yellow-100 text-yellow-700 border-yellow-200";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getCategoryIcon = (category: string) => {
  switch (category) {
    case "Laptop": return <Laptop className="h-5 w-5" />;
    case "Mobile": return <Smartphone className="h-5 w-5" />;
    case "Vehicle": return <Car className="h-5 w-5" />;
    case "Access Card": return <IdCard className="h-5 w-5" />;
    case "Monitor": return <Monitor className="h-5 w-5" />;
    case "Printer": return <Printer className="h-5 w-5" />;
    default: return <Package className="h-5 w-5" />;
  }
};

export function MyWorkspace() {
  const dispatch = useAppDispatch();

  const [authUser, setAuthUser] = useState<{
    userId: string;
    email: string;
    fullName: string;
    roleId?: string | null;
    roleName?: string | null;
  } | null>(null);
  const [isRequestDialogOpen, setIsRequestDialogOpen] = useState(false);
  const [isLeaveDialogOpen, setIsLeaveDialogOpen] = useState(false);
  const [userProfilePicture, setUserProfilePicture] = useState<string | null>(null);

  // Request form
  const [requestType, setRequestType] = useState<string>("advance");
  const [requestSubject, setRequestSubject] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Leave form
  const [leaveType, setLeaveType] = useState<string>("annual");
  const [leaveStartDate, setLeaveStartDate] = useState("");
  const [leaveEndDate, setLeaveEndDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [isSubmittingLeave, setIsSubmittingLeave] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("auth_user");
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      if (parsed?.user_id) {
        setAuthUser({
          userId: parsed.user_id,
          email: parsed.email ?? "",
          fullName: parsed.full_name ?? parsed.email ?? "",
          roleId: parsed.role_id ?? null,
          roleName: parsed.role_name ?? "",
        });
      }
    } catch (error) {
      console.error("Failed to parse auth_user from localStorage", error);
    }
  }, []);

  useEffect(() => {
    if (!authUser?.userId) return;
    void dispatch(
      thunks.system_users.fetchAll({
        user_id: authUser.userId,
      })
    );
  }, [dispatch, authUser?.userId]);

  const systemUsers = useAppSelector(selectors.system_users.selectAll) as SystemUsers[];
  const systemUsersLoading = useAppSelector(selectors.system_users.selectLoading);

  const currentSystemUser = useMemo(
    () => systemUsers.find((user) => user.user_id === authUser?.userId) ?? null,
    [systemUsers, authUser?.userId]
  );

  const employeeId = currentSystemUser?.employee_id ?? null;

  useEffect(() => {
    if (!employeeId) return;
    void dispatch(thunks.employees.fetchAll({ employee_id: employeeId }));
    void dispatch(thunks.employee_requests.fetchAll({ employee_id: employeeId }));
    void dispatch(thunks.leaves.fetchAll({ employee_id: employeeId }));
    void dispatch(thunks.monthly_visits.fetchAll({ delegate_id: employeeId }));
    void dispatch(thunks.employee_custody_items.fetchAll({ employee_id: employeeId }));
    void dispatch(thunks.customer_support_tickets.fetchAll({ assigned_to: employeeId }));
  }, [dispatch, employeeId]);

  // Load user profile picture
  const loadUserProfilePicture = useCallback(async (forceRefresh = false) => {
    if (!authUser?.userId) return;

    try {
      // First, try to get from file storage
      const files = await getFilesByOwner(authUser.userId, 'user', FILE_CATEGORIES.PROFILE_PICTURE);
      if (files.length > 0) {
        // Get the most recent profile picture
        const latestPicture = files[0]; // Already sorted by created_at desc
        const pictureUrl = await getFileUrl(
          latestPicture.bucket as any,
          latestPicture.path,
          latestPicture.is_public
        );
        if (pictureUrl) {
          // Add cache-busting query parameter if force refresh
          const urlWithCacheBust = forceRefresh 
            ? `${pictureUrl}${pictureUrl.includes('?') ? '&' : '?'}t=${Date.now()}`
            : pictureUrl;
          setUserProfilePicture(urlWithCacheBust);
          return;
        }
      }

      // Fallback: Check employee record for legacy base64 profile_image
      // Use employeeId from the component scope
      if (employeeId) {
        // Get employees from Redux store - we'll need to access it differently
        // Since we can't use hooks inside callbacks, we'll fetch it directly
        try {
          const { data: employee } = await supabase
            .from('employees')
            .select('profile_image')
            .eq('employee_id', employeeId)
            .single();

          if (employee?.profile_image) {
            // Check if it's a base64 data URL (legacy format)
            if (employee.profile_image.startsWith('data:image/')) {
              setUserProfilePicture(employee.profile_image);
              return;
            }
            // If it's a URL, use it directly
            if (employee.profile_image.startsWith('http')) {
              const urlWithCacheBust = forceRefresh 
                ? `${employee.profile_image}${employee.profile_image.includes('?') ? '&' : '?'}t=${Date.now()}`
                : employee.profile_image;
              setUserProfilePicture(urlWithCacheBust);
              return;
            }
          }
        } catch (employeeError) {
          // Silently fail - employee might not exist
          console.debug('No employee record found for profile picture fallback');
        }
      }

      // No picture found
      setUserProfilePicture(null);
    } catch (error) {
      console.error('Error loading user profile picture:', error);
      // Silently fail - don't show error to user
      setUserProfilePicture(null);
    }
  }, [authUser?.userId, employeeId]);

  useEffect(() => {
    if (authUser?.userId) {
      loadUserProfilePicture();
    } else {
      setUserProfilePicture(null);
    }
  }, [authUser?.userId, loadUserProfilePicture]);

  // Listen for profile picture updates
  useEffect(() => {
    const handleProfilePictureUpdate = (_event?: CustomEvent) => {
      if (authUser?.userId) {
        // Force refresh to bypass cache
        loadUserProfilePicture(true);
      }
    };

    window.addEventListener('profilePictureUpdated', handleProfilePictureUpdate as EventListener);
    return () => {
      window.removeEventListener('profilePictureUpdated', handleProfilePictureUpdate as EventListener);
    };
  }, [authUser?.userId, loadUserProfilePicture]);

  const employees = useAppSelector(selectors.employees.selectAll) as Employees[];
  const employeesLoading = useAppSelector(selectors.employees.selectLoading);

  const employeeRequestsData = useAppSelector(
    selectors.employee_requests.selectAll
  ) as DbEmployeeRequest[];
  const employeeRequestsLoading = useAppSelector(selectors.employee_requests.selectLoading);

  const leavesData = useAppSelector(selectors.leaves.selectAll) as DbLeave[];
  const leavesLoading = useAppSelector(selectors.leaves.selectLoading);

  const visitsData = useAppSelector(selectors.monthly_visits.selectAll) as DbMonthlyVisit[];
  const visitsLoading = useAppSelector(selectors.monthly_visits.selectLoading);

  const custodyItemsData = useAppSelector(
    selectors.employee_custody_items.selectAll
  ) as DbCustodyItem[];
  const custodyItemsLoading = useAppSelector(selectors.employee_custody_items.selectLoading);

  const supportTicketsData = useAppSelector(
    selectors.customer_support_tickets.selectAll
  ) as DbSupportTicket[];
  const supportTicketsLoading = useAppSelector(selectors.customer_support_tickets.selectLoading);

  const employeeRecord = useMemo(
    () => employees.find((emp) => emp.employee_id === employeeId) ?? null,
    [employees, employeeId]
  );

  const calculateDays = (start: string, end: string) => {
    if (!start || !end) return 0;
    const startDate = new Date(start);
    const endDate = new Date(end);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    return diffDays;
  };

  const employeeData: EmployeeData = useMemo(() => {
    const statusLabel =
      (currentSystemUser?.status ?? "inactive").toLowerCase() === "inactive"
        ? "Inactive"
        : "Active";

    if (!employeeRecord) {
      return {
        id: employeeId ?? authUser?.userId ?? "UNLINKED",
        name: authUser?.fullName ?? "—",
        nameAr: "",
        email: authUser?.email ?? "",
        phone: "",
        position: "",
        positionAr: "",
        department: "",
        departmentAr: "",
        employeeNumber: employeeId ? employeeId.slice(0, 8).toUpperCase() : "—",
        nationalId: "",
        dateOfBirth: "",
        joiningDate: "",
        contractType: "",
        basicSalary: 0,
        allowances: 0,
        address: "",
        emergencyContact: "",
        emergencyPhone: "",
        bankName: "",
        bankAccount: "",
        iban: "",
        status: statusLabel,
        photo: undefined,
      };
    }

    const baseSalary = Number(employeeRecord.base_salary ?? 0);
    const allowances =
      Number(employeeRecord.housing_allowance ?? 0) +
      Number(employeeRecord.transport_allowance ?? 0) +
      Number(employeeRecord.other_allowances ?? 0);

    return {
      id: employeeRecord.employee_id,
      name: employeeRecord.name_en ?? authUser?.fullName ?? "—",
      nameAr: employeeRecord.name_ar ?? "",
      email: employeeRecord.email ?? authUser?.email ?? "",
      phone: employeeRecord.phone_number ?? "",
      position: employeeRecord.position ?? "",
      positionAr: employeeRecord.position ?? "",
      department: employeeRecord.department ?? "",
      departmentAr: employeeRecord.department ?? "",
      employeeNumber: employeeRecord.employee_id.slice(0, 8).toUpperCase(),
      nationalId: employeeRecord.national_id ?? "",
      dateOfBirth: "",
      joiningDate: employeeRecord.hiring_date ?? "",
      contractType: employeeRecord.contract_type
        ? toTitleCase(employeeRecord.contract_type)
        : "",
      basicSalary: baseSalary,
      allowances,
      address: employeeRecord.address ?? "",
      emergencyContact: employeeRecord.emergency_contact_name ?? "",
      emergencyPhone: employeeRecord.emergency_contact_phone ?? "",
      bankName: employeeRecord.bank_name ?? "",
      bankAccount: employeeRecord.bank_iban ?? "",
      iban: employeeRecord.bank_iban ?? "",
      status: statusLabel,
      photo: employeeRecord.profile_image ?? undefined,
    };
  }, [employeeRecord, currentSystemUser?.status, authUser, employeeId]);

  const custodyItems = useMemo<CustodyItem[]>(() => {
    if (custodyItemsData.length === 0) return [];
    return custodyItemsData.map((item) => ({
      id: item.custody_id,
      itemName: item.item_en_name ?? "Unnamed Item",
      itemNameAr: item.item_ar_name ?? "",
      serialNumber: item.item_serial_number ?? undefined,
      category: item.item_category ?? "General",
      description: item.item_desc_en ?? "",
      dateReceived: item.item_date_issued ?? "",
      condition: item.item_condition ?? "Good",
      value: Number(item.item_value ?? 0),
      notes: item.item_notes ?? undefined,
    }));
  }, [custodyItemsData]);

  const employeeRequests = useMemo<EmployeeRequest[]>(() => {
    if (employeeRequestsData.length === 0) return [];
    return employeeRequestsData
      .map((req) => {
        const typeKey = req.request_type ?? "other";
        const statusKey = req.status ?? "pending";
        return {
          id: req.request_id,
          requestNumber: req.request_number ?? "—",
          type:
            REQUEST_TYPE_LABELS[typeKey as DbEmployeeRequest["request_type"]] ??
            toTitleCase(typeKey),
          subject: req.notes ?? REQUEST_TYPE_LABELS[typeKey as DbEmployeeRequest["request_type"]] ?? "Employee Request",
          description: req.description ?? "",
          status:
            REQUEST_STATUS_LABELS[statusKey as DbEmployeeRequest["status"]] ??
            toTitleCase(statusKey),
          date: req.requested_date ?? req.created_at ?? "",
          response: req.approved_by
            ? `Approved by ${req.approved_by}`
            : req.notes ?? undefined,
        };
      })
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
  }, [employeeRequestsData]);

  const leaveRequests = useMemo<LeaveRequest[]>(() => {
    if (leavesData.length === 0) return [];
    return leavesData
      .map((leave) => {
        const typeKey = leave.leave_type ?? "other";
        const statusKey = leave.status ?? "pending";
        return {
          id: leave.leave_id,
          leaveNumber: leave.leave_number ?? "—",
          type:
            LEAVE_TYPE_LABELS[typeKey as DbLeave["leave_type"]] ?? toTitleCase(typeKey),
          startDate: leave.start_date,
          endDate: leave.end_date,
          days: Number(leave.total_days ?? calculateDays(leave.start_date, leave.end_date)),
          reason: leave.reason ?? "",
          status:
            LEAVE_STATUS_LABELS[statusKey as DbLeave["status"]] ?? toTitleCase(statusKey),
          response: leave.approved_by
            ? `Approved by ${leave.approved_by}`
            : leave.notes ?? undefined,
        };
      })
      .sort((a, b) => (b.startDate ?? "").localeCompare(a.startDate ?? ""));
  }, [leavesData]);

  const visits = useMemo<Visit[]>(() => {
    if (visitsData.length === 0) return [];
    return visitsData
      .map((visit) => {
        const statusKey = (visit.status ?? "scheduled").toLowerCase();
        return {
          id: visit.visit_id,
          customer: visit.customer_id ?? "Customer",
          date: visit.visit_date,
          time: visit.visit_time ?? "",
          status: VISIT_STATUS_LABELS[statusKey] ?? toTitleCase(statusKey),
          notes: visit.notes ?? undefined,
        };
      })
      .sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
  }, [visitsData]);

  const tasks = useMemo<Task[]>(() => {
    if (supportTicketsData.length === 0) return [];
    return supportTicketsData
      .map((ticket) => ({
        id: ticket.ticket_id,
        title: ticket.subject ?? "Support Ticket",
        description: ticket.description ?? "",
        priority: toTitleCase(ticket.priority ?? "Medium"),
        dueDate: ticket.created_at ?? "",
        status: TASK_STATUS_OPTIONS.includes(
          toTitleCase(ticket.status ?? "New") as (typeof TASK_STATUS_OPTIONS)[number]
        )
          ? (toTitleCase(ticket.status ?? "New") as (typeof TASK_STATUS_OPTIONS)[number])
          : "New",
      }))
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? ""));
  }, [supportTicketsData]);

  const stats = useMemo(
    () => ({
      pendingRequests: employeeRequests.filter((r) => r.status.toLowerCase().includes("pending")).length,
      pendingLeaves: leaveRequests.filter((l) => l.status.toLowerCase().includes("pending")).length,
      upcomingVisits: visits.filter((v) => v.status.toLowerCase() === "scheduled").length,
      pendingTasks: tasks.filter((t) => {
        const status = t.status.toLowerCase();
        return status === "pending" || status === "new";
      }).length,
      custodyValue: custodyItems.reduce(
        (sum, item) => sum + (Number.isFinite(item.value) ? item.value : 0),
        0
      ),
    }),
    [employeeRequests, leaveRequests, visits, tasks, custodyItems]
  );

  const isLoading =
    systemUsersLoading ||
    (employeeId
      ? employeesLoading ||
        employeeRequestsLoading ||
        leavesLoading ||
        visitsLoading ||
        custodyItemsLoading ||
        supportTicketsLoading
      : false);

  const hasLinkedEmployee = Boolean(employeeId);

  const handleSubmitRequest = async () => {
    if (!requestSubject.trim() || !requestDescription.trim()) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!hasLinkedEmployee) {
      toast.error("Your account is not linked to an employee profile yet.");
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const sameYearCount = employeeRequestsData.filter((request) =>
      request.request_number?.startsWith(`REQ-${year}-`)
    ).length;
    const requestNumber = `REQ-${year}-${String(sameYearCount + 1).padStart(3, "0")}`;

    const payload: Partial<DbEmployeeRequest> = {
      request_number: requestNumber,
      employee_id: employeeId!,
      employee_name: employeeRecord?.name_en ?? authUser?.fullName ?? "",
      employee_department: employeeRecord?.department ?? null,
      employee_position: employeeRecord?.position ?? null,
      request_type: requestType as DbEmployeeRequest["request_type"],
      description: requestDescription,
      notes: requestSubject || null,
      status: "pending",
      requested_date: now.toISOString(),
      leave_start_date: null,
      leave_end_date: null,
      leave_days: null,
      amount: null,
      monthly_deduction: null,
      repayment_months: null,
    };

    try {
      setIsSubmittingRequest(true);
      await dispatch(thunks.employee_requests.createOne(payload)).unwrap();
      toast.success("Request submitted successfully!");
      setIsRequestDialogOpen(false);
      setRequestType("advance");
      setRequestSubject("");
      setRequestDescription("");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to submit request");
    } finally {
      setIsSubmittingRequest(false);
    }
  };

  const handleSubmitLeave = async () => {
    if (!leaveStartDate || !leaveEndDate || !leaveReason.trim()) {
      toast.error("Please fill all required fields");
      return;
    }

    if (!hasLinkedEmployee) {
      toast.error("Your account is not linked to an employee profile yet.");
      return;
    }

    const days = calculateDays(leaveStartDate, leaveEndDate);
    if (days <= 0) {
      toast.error("End date must be after start date");
      return;
    }

    const now = new Date();
    const year = now.getFullYear();
    const sameYearCount = leavesData.filter((leave) =>
      leave.leave_number?.startsWith(`LV-${year}-`)
    ).length;
    const leaveNumber = `LV-${year}-${String(sameYearCount + 1).padStart(3, "0")}`;

    const payload: Partial<DbLeave> = {
      leave_number: leaveNumber,
      employee_id: employeeId!,
      employee_name: employeeRecord?.name_en ?? authUser?.fullName ?? "",
      employee_department: employeeRecord?.department ?? null,
      employee_position: employeeRecord?.position ?? null,
      leave_type: leaveType as DbLeave["leave_type"],
      start_date: leaveStartDate,
      end_date: leaveEndDate,
      total_days: days,
      reason: leaveReason,
      status: "pending",
      applied_date: now.toISOString(),
      notes: null,
      approved_by: null,
      approved_date: null,
    };

    try {
      setIsSubmittingLeave(true);
      await dispatch(thunks.leaves.createOne(payload)).unwrap();
      toast.success("Leave request submitted successfully!");
      setIsLeaveDialogOpen(false);
      setLeaveType("annual");
      setLeaveStartDate("");
      setLeaveEndDate("");
      setLeaveReason("");
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to submit leave request");
    } finally {
      setIsSubmittingLeave(false);
    }
  };

  const handleTaskStatusChange = async (
    taskId: string,
    newStatus: (typeof TASK_STATUS_OPTIONS)[number]
  ) => {
    try {
      await dispatch(
        thunks.customer_support_tickets.updateOne({
          id: taskId,
          values: { status: newStatus },
        })
      ).unwrap();
      toast.success(`Task status updated to ${newStatus}`);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to update task status");
    }
  };

  const calculateEmploymentDuration = () => {
    if (!employeeData.joiningDate) return "—";
    const joining = new Date(employeeData.joiningDate);
    if (Number.isNaN(joining.getTime())) return "—";
    const now = new Date();
    let years = now.getFullYear() - joining.getFullYear();
    let months = now.getMonth() - joining.getMonth();
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) return "—";
    
    if (years > 0) {
      return `${years} year${years > 1 ? "s" : ""}${
        months > 0 ? ` ${months} month${months > 1 ? "s" : ""}` : ""
      }`;
    }
    return `${months} month${months === 1 ? "" : "s"}`;
  };

  return (
    <div className="space-y-6">
      {!hasLinkedEmployee && !isLoading && (
        <Card className="border-yellow-200 bg-yellow-50">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">Employee profile not linked</p>
              <p className="text-xs mt-1">
                We could not find an employee record connected to your account. Please contact your administrator to complete your setup.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {isLoading && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading your workspace data...
            </p>
          </CardContent>
        </Card>
      )}
      {/* Header with Employee Photo */}
      <Card className="border-2">
        <CardContent className="pt-6">
          <div className="flex items-start gap-6">
            {/* Photo */}
            <Avatar className="w-24 h-24 flex-shrink-0">
              {userProfilePicture ? (
                <AvatarImage src={userProfilePicture} alt={employeeData.name} className="object-cover" />
              ) : null}
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600 text-white text-3xl font-bold">
                {employeeData.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            
            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-1">{employeeData.name}</h2>
                  <p className="text-lg text-muted-foreground mb-2" dir="rtl">{employeeData.nameAr}</p>
                  <div className="flex items-center gap-4 flex-wrap">
                    <Badge className={cn(getStatusColor(employeeData.status), "text-sm px-3 py-1")}>
                      {employeeData.status}
                    </Badge>
                    <span className="text-sm font-mono text-muted-foreground">{employeeData.employeeNumber}</span>
                    <span className="text-sm text-muted-foreground">{employeeData.position}</span>
                    <span className="text-sm text-muted-foreground">{employeeData.department}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setIsRequestDialogOpen(true)}
                    size="sm"
                    className="gap-2"
                    disabled={!hasLinkedEmployee}
                    title={!hasLinkedEmployee ? "Link an employee profile to submit requests" : undefined}
                  >
                    <FileText className="h-4 w-4" />
                    New Request
                  </Button>
                  <Button
                    onClick={() => setIsLeaveDialogOpen(true)}
                    size="sm"
                    variant="outline"
                    className="gap-2"
                    disabled={!hasLinkedEmployee}
                    title={!hasLinkedEmployee ? "Link an employee profile to request leave" : undefined}
                  >
                    <Calendar className="h-4 w-4" />
                    Request Leave
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Requests</CardTitle>
            <FileText className="h-5 w-5 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">{stats.pendingRequests}</div>
            <p className="text-xs text-muted-foreground mt-1">Awaiting approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Leave Requests</CardTitle>
            <Calendar className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{stats.pendingLeaves}</div>
            <p className="text-xs text-muted-foreground mt-1">Pending approval</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Upcoming Visits</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{stats.upcomingVisits}</div>
            <p className="text-xs text-muted-foreground mt-1">Scheduled</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Tasks</CardTitle>
            <Briefcase className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{stats.pendingTasks}</div>
            <p className="text-xs text-muted-foreground mt-1">To complete</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Custody Value</CardTitle>
            <Package className="h-5 w-5 text-indigo-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-indigo-600">
              {stats.custodyValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">SAR - Total items</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Tabs */}
      <Tabs defaultValue="profile" className="space-y-4">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="profile">Profile & Custody</TabsTrigger>
          <TabsTrigger value="tasks">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4" />
              My Tasks
              {stats.pendingTasks > 0 && (
                <Badge className="bg-red-500 text-white text-xs px-1.5 py-0.5 ml-1">
                  {stats.pendingTasks}
                </Badge>
              )}
            </div>
          </TabsTrigger>
          <TabsTrigger value="requests">My Requests</TabsTrigger>
          <TabsTrigger value="leaves">My Leaves</TabsTrigger>
          <TabsTrigger value="visits">My Visits</TabsTrigger>
        </TabsList>

        {/* Profile & Custody Tab */}
        <TabsContent value="profile" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            {/* Employee Information */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Employee Information
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground text-xs">Employee Number</Label>
                    <p className="font-mono">{employeeData.employeeNumber}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">National ID</Label>
                    <p className="font-mono">{employeeData.nationalId}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Date of Birth</Label>
                    <p>
                      {employeeData.dateOfBirth
                        ? new Date(employeeData.dateOfBirth).toLocaleDateString('en-GB')
                        : "—"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Joining Date</Label>
                    <p>
                      {employeeData.joiningDate
                        ? new Date(employeeData.joiningDate).toLocaleDateString('en-GB')
                        : "—"}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <Label className="text-muted-foreground text-xs">Employment Duration</Label>
                    <p className="font-medium text-primary">{calculateEmploymentDuration()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Contract Type</Label>
                    <p>{employeeData.contractType}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Status</Label>
                    <Badge className={getStatusColor(employeeData.status)}>
                      {employeeData.status}
                    </Badge>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Contact Information
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-start gap-2">
                      <Mail className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <Label className="text-muted-foreground text-xs">Email</Label>
                        <p>{employeeData.email}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <Phone className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <Label className="text-muted-foreground text-xs">Phone</Label>
                        <p>{employeeData.phone}</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <MapPin className="h-4 w-4 mt-0.5 text-muted-foreground" />
                      <div>
                        <Label className="text-muted-foreground text-xs">Address</Label>
                        <p>{employeeData.address}</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Emergency Contact
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div>
                      <Label className="text-muted-foreground text-xs">Contact Person</Label>
                      <p>{employeeData.emergencyContact}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Emergency Phone</Label>
                      <p>{employeeData.emergencyPhone}</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Financial & Bank Information */}
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Financial Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Basic Salary</Label>
                      <p className="text-xl font-bold text-green-600">
                        {employeeData.basicSalary.toLocaleString()} SAR
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Allowances</Label>
                      <p className="text-xl font-bold text-blue-600">
                        {employeeData.allowances.toLocaleString()} SAR
                      </p>
                    </div>
                    <div className="col-span-2 bg-primary/5 rounded-lg p-3">
                      <Label className="text-muted-foreground text-xs">Total Salary</Label>
                      <p className="text-2xl font-bold text-primary">
                        {(employeeData.basicSalary + employeeData.allowances).toLocaleString()} SAR
                      </p>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-semibold mb-3 flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      Bank Details
                    </h4>
                    <div className="space-y-2 text-sm">
                      <div>
                        <Label className="text-muted-foreground text-xs">Bank Name</Label>
                        <p>{employeeData.bankName}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">Account Number</Label>
                        <p className="font-mono">{employeeData.bankAccount}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground text-xs">IBAN</Label>
                        <p className="font-mono text-xs">{employeeData.iban}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Custody Summary */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Custody Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Items</span>
                      <span className="font-semibold">{custodyItems.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Total Value</span>
                      <span className="font-bold text-lg text-primary">
                        {stats.custodyValue.toLocaleString()} SAR
                      </span>
                    </div>
                    <div className="pt-3 border-t space-y-2">
                      {custodyItems.slice(0, 3).map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-sm">
                          <div className="p-1.5 rounded bg-primary/10 text-primary">
                            {getCategoryIcon(item.category)}
                          </div>
                          <span className="flex-1">{item.itemName}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Custody Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Custody Items - العهدة
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                All equipment and assets assigned to you
              </p>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4">
                {custodyItems.map((item) => (
                  <Card key={item.id} className="border-2">
                    <CardContent className="pt-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 rounded-lg bg-primary/10 text-primary">
                          {getCategoryIcon(item.category)}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="font-semibold">{item.itemName}</h4>
                              <p className="text-sm text-muted-foreground" dir="rtl">{item.itemNameAr}</p>
                            </div>
                            <Badge className={getConditionColor(item.condition)}>
                              {item.condition}
                            </Badge>
                          </div>
                          
                          <p className="text-sm text-muted-foreground mb-3">{item.description}</p>
                          
                          <div className="grid grid-cols-4 gap-4 text-sm">
                            <div>
                              <Label className="text-muted-foreground text-xs">Serial Number</Label>
                              <p className="font-mono">{item.serialNumber || 'N/A'}</p>
                            </div>
                            <div>
                              <Label className="text-muted-foreground text-xs">Date Received</Label>
                              <p>{new Date(item.dateReceived).toLocaleDateString('en-GB')}</p>
                            </div>
                            <div>
                              <Label className="text-muted-foreground text-xs">Value</Label>
                              <p className="font-semibold text-primary">
                                {item.value.toLocaleString()} SAR
                              </p>
                            </div>
                            <div>
                              <Label className="text-muted-foreground text-xs">Category</Label>
                              <p>{item.category}</p>
                            </div>
                          </div>
                          
                          {item.notes && (
                            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs">
                              <strong>Note:</strong> {item.notes}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Requests Tab */}
        <TabsContent value="requests" className="space-y-4">
          {employeeRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <FileText className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No requests yet</p>
                <Button onClick={() => setIsRequestDialogOpen(true)} variant="outline" className="mt-4">
                  Submit Your First Request
                </Button>
              </CardContent>
            </Card>
          ) : (
            employeeRequests.map((request) => (
              <Card key={request.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-muted-foreground">{request.requestNumber}</span>
                        <Badge className={getStatusColor(request.status)}>{request.status}</Badge>
                        <Badge variant="outline">{request.type}</Badge>
                      </div>
                      <h3 className="font-semibold">{request.subject}</h3>
                      <p className="text-sm text-muted-foreground">{request.description}</p>
                      <p className="text-xs text-muted-foreground">Submitted: {new Date(request.date).toLocaleDateString('en-GB')}</p>
                      {request.response && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                          <p className="text-sm text-blue-800"><strong>Response:</strong> {request.response}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Leaves Tab */}
        <TabsContent value="leaves" className="space-y-4">
          {leaveRequests.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Calendar className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No leave requests</p>
                <Button onClick={() => setIsLeaveDialogOpen(true)} variant="outline" className="mt-4">
                  Request Your First Leave
                </Button>
              </CardContent>
            </Card>
          ) : (
            leaveRequests.map((leave) => (
              <Card key={leave.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-muted-foreground">{leave.leaveNumber}</span>
                        <Badge className={getStatusColor(leave.status)}>{leave.status}</Badge>
                        <Badge variant="outline">{leave.type}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="font-medium">
                          {new Date(leave.startDate).toLocaleDateString('en-GB')} - {new Date(leave.endDate).toLocaleDateString('en-GB')}
                        </span>
                        <Badge variant="secondary">{leave.days} days</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground"><strong>Reason:</strong> {leave.reason}</p>
                      {leave.response && (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mt-2">
                          <p className="text-sm text-blue-800"><strong>Response:</strong> {leave.response}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Visits Tab */}
        <TabsContent value="visits" className="space-y-4">
          {visits.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No visits scheduled</p>
              </CardContent>
            </Card>
          ) : (
            visits.map((visit) => (
              <Card key={visit.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{visit.customer}</h3>
                        <Badge className={getStatusColor(visit.status)}>{visit.status}</Badge>
                      </div>
                      <div className="flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-4 w-4" />
                          {new Date(visit.date).toLocaleDateString('en-GB')}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {visit.time}
                        </span>
                      </div>
                      {visit.notes && <p className="text-sm text-muted-foreground">{visit.notes}</p>}
                    </div>
                    <Button size="sm" variant="outline">
                      View Details
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* Tasks Tab */}
        <TabsContent value="tasks" className="space-y-4">
          {tasks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Briefcase className="h-12 w-12 text-muted-foreground mb-3" />
                <p className="text-muted-foreground">No tasks assigned</p>
              </CardContent>
            </Card>
          ) : (
            tasks.map((task) => (
              <Card key={task.id} className="hover:shadow-md transition-shadow">
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{task.title}</h3>
                        <Badge className={getPriorityColor(task.priority)}>{task.priority}</Badge>
                        <Badge className={getStatusColor(task.status)}>{task.status}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Due: {task.dueDate ? new Date(task.dueDate).toLocaleDateString('en-GB') : "—"}
                      </p>
                    </div>
                    <Select
                      value={task.status}
                      onValueChange={(value: string) =>
                        handleTaskStatusChange(
                          task.id,
                          value as (typeof TASK_STATUS_OPTIONS)[number]
                        )
                      }
                    >
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TASK_STATUS_OPTIONS.map((status) => (
                          <SelectItem key={status} value={status}>
                            {status}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>

      {/* New Request Dialog */}
      <Dialog open={isRequestDialogOpen} onOpenChange={setIsRequestDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Submit New Request</DialogTitle>
            <DialogDescription>Fill in the details for your request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="request-type">Request Type *</Label>
              <Select value={requestType} onValueChange={setRequestType}>
                <SelectTrigger id="request-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {REQUEST_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="request-subject">Subject *</Label>
              <Input
                id="request-subject"
                value={requestSubject}
                onChange={(e) => setRequestSubject(e.target.value)}
                placeholder="Brief description of your request"
              />
            </div>

            <div>
              <Label htmlFor="request-description">Description *</Label>
              <Textarea
                id="request-description"
                value={requestDescription}
                onChange={(e) => setRequestDescription(e.target.value)}
                placeholder="Provide detailed information about your request"
                rows={5}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsRequestDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitRequest}
                className="gap-2"
                disabled={isSubmittingRequest || !hasLinkedEmployee}
              >
                <Send className="h-4 w-4" />
                {isSubmittingRequest ? "Submitting..." : "Submit Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* New Leave Dialog */}
      <Dialog open={isLeaveDialogOpen} onOpenChange={setIsLeaveDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Request Leave</DialogTitle>
            <DialogDescription>Submit your leave request</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="leave-type">Leave Type *</Label>
              <Select value={leaveType} onValueChange={setLeaveType}>
                <SelectTrigger id="leave-type">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {LEAVE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="leave-start">Start Date *</Label>
                <Input
                  id="leave-start"
                  type="date"
                  value={leaveStartDate}
                  onChange={(e) => setLeaveStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="leave-end">End Date *</Label>
                <Input
                  id="leave-end"
                  type="date"
                  value={leaveEndDate}
                  onChange={(e) => setLeaveEndDate(e.target.value)}
                />
              </div>
            </div>

            {leaveStartDate && leaveEndDate && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <strong>Total Days:</strong> {calculateDays(leaveStartDate, leaveEndDate)} days
                </p>
              </div>
            )}

            <div>
              <Label htmlFor="leave-reason">Reason *</Label>
              <Textarea
                id="leave-reason"
                value={leaveReason}
                onChange={(e) => setLeaveReason(e.target.value)}
                placeholder="Explain the reason for your leave"
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="outline" onClick={() => setIsLeaveDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitLeave}
                className="gap-2"
                disabled={isSubmittingLeave || !hasLinkedEmployee}
              >
                <Send className="h-4 w-4" />
                {isSubmittingLeave ? "Submitting..." : "Submit Leave Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
