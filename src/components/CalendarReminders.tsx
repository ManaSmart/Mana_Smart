import { useState, useEffect, useCallback, useMemo, type ComponentProps } from "react";
import {
  Plus,
  Bell,
  Calendar as CalendarIcon,
  Clock,
  Check,
  X,
  User,
  FileText,
  DollarSign,
  MapPin,
  Filter,
  Edit,
  Trash2,
  RotateCcw,
  XCircle,
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  Loader2,
} from "lucide-react";
import ReactCalendar from "react-calendar";
import "react-calendar/dist/Calendar.css";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "./ui/dialog";
import { Label } from "./ui/label";
import { Input } from "./ui/input";
import { Badge } from "./ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Textarea } from "./ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { ScrollArea } from "./ui/scroll-area";
import { supabase } from "../lib/supabaseClient";
import type { Reminder, Activity } from "../types/activity";
import { hasPermission, type ResolvedPermissions } from "../lib/permissions";

const typeColors = {
  visit: "bg-blue-100 text-blue-700 border-blue-200",
  payment: "bg-green-100 text-green-700 border-green-200",
  contract: "bg-purple-100 text-purple-700 border-purple-200",
  "follow-up": "bg-orange-100 text-orange-700 border-orange-200",
  other: "bg-gray-100 text-gray-700 border-gray-200",
};

const typeIcons = {
  visit: MapPin,
  payment: DollarSign,
  contract: FileText,
  "follow-up": Bell,
  other: CalendarIcon,
};

const priorityColors = {
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

type CalendarView = "month" | "year" | "decade" | "century";

interface CalendarTileProperties {
  activeStartDate: Date | null;
  date: Date;
  view: CalendarView;
}

interface CalendarRemindersProps {
  reminders?: Reminder[]; // Deprecated - kept for backward compatibility but not used
  setReminders?: React.Dispatch<React.SetStateAction<Reminder[]>>; // Deprecated - kept for backward compatibility but not used
  onActivityAdd?: (activity: Omit<Activity, "id" | "timestamp">) => void;
  currentPermissions?: ResolvedPermissions; // User permissions for access control
}

interface VisitData {
  id: string;
  date: string;
  time: string | null;
  customerName: string;
  delegateName: string;
  status: string;
  address: string | null;
  notes: string | null;
  type: "manual" | "monthly";
  contractNumber?: string;
}

// Suppress unused parameter warnings for deprecated props
export function CalendarReminders({ 
  reminders: _reminders, 
  setReminders: _setReminders, 
  onActivityAdd,
  currentPermissions = "all" // Default to "all" if not provided for backward compatibility
}: CalendarRemindersProps) {
<<<<<<< HEAD
  // Check if user has permissions for calendar
  const canCreateReminders = hasPermission(currentPermissions, "calendar", "create");
=======
  // Check if user has update permission for calendar
>>>>>>> 52da8055d7ac5a5542c6c785b37b52caae8c5d53
  const canUpdateReminders = hasPermission(currentPermissions, "calendar", "update");
  const canDeleteReminders = hasPermission(currentPermissions, "calendar", "delete");
  const initialSelectedDate = new Date();
  initialSelectedDate.setHours(0, 0, 0, 0);
  const [selectedDate, setSelectedDate] = useState<Date>(initialSelectedDate);
  const [isAddReminderOpen, setIsAddReminderOpen] = useState(false);
  const [selectedFilter, setSelectedFilter] = useState<string>("all");
  const [visits, setVisits] = useState<VisitData[]>([]);
  const [loadingVisits, setLoadingVisits] = useState(false);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [dbReminders, setDbReminders] = useState<Reminder[]>([]);
  const [loadingReminders, setLoadingReminders] = useState(false);
  
  // Form states
  const [reminderTitle, setReminderTitle] = useState("");
  const [reminderDescription, setReminderDescription] = useState("");
  const [reminderDate, setReminderDate] = useState("");
  const [reminderTime, setReminderTime] = useState("");
  const [reminderType, setReminderType] = useState<"visit" | "payment" | "contract" | "follow-up" | "other">("visit");
  const [reminderPriority, setReminderPriority] = useState<"high" | "medium" | "low">("medium");
  const [reminderCustomer, setReminderCustomer] = useState("");
  const [reminderAssignedTo, setReminderAssignedTo] = useState("");
  const emptyEditForm = {
    title: "",
    description: "",
    date: "",
    time: "",
    type: "visit" as Reminder["type"],
    priority: "medium" as Reminder["priority"],
    status: "pending" as Reminder["status"],
    customer: "",
    assignedTo: "",
  };
  const [isEditReminderOpen, setIsEditReminderOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);
  const [editForm, setEditForm] = useState({ ...emptyEditForm });

  const toDateObject = (value: string | Date) => {
    if (value instanceof Date) {
      return new Date(value.getFullYear(), value.getMonth(), value.getDate());
    }
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
  };

  const isSameDay = (dateObj: Date, value: string | Date) => {
    const target = toDateObject(value);
    return (
      dateObj.getFullYear() === target.getFullYear() &&
      dateObj.getMonth() === target.getMonth() &&
      dateObj.getDate() === target.getDate()
    );
  };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const daysAhead = new Date(startOfToday);
  daysAhead.setDate(daysAhead.getDate() + 5); // 3-5 days (using 5 as max)
  daysAhead.setHours(23, 59, 59, 999);
  
  // Get the selected month's start and end dates
  const selectedMonthStart = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  selectedMonthStart.setHours(0, 0, 0, 0);
  const selectedMonthEnd = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
  selectedMonthEnd.setHours(23, 59, 59, 999);

  const selectedDay = new Date(
    selectedDate.getFullYear(),
    selectedDate.getMonth(),
    selectedDate.getDate()
  );

  const getMinutesFromTime = (time: string) => {
    if (!time) return 0;
    const normalized = time.trim().toLowerCase();
    if (normalized.includes("am") || normalized.includes("pm")) {
      const [timePart, period] = normalized.split(/\s+/);
      const [hoursStr, minutesStr] = timePart.split(":");
      let hours = parseInt(hoursStr ?? "0", 10);
      const minutes = parseInt(minutesStr ?? "0", 10);
      if (period === "pm" && hours < 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;
      return hours * 60 + minutes;
    }
    const [hours = 0, minutes = 0] = normalized.split(":").map(Number);
    return hours * 60 + minutes;
  };

  const compareReminders = (a: Reminder, b: Reminder) => {
    const dateDiff =
      toDateObject(a.date).getTime() - toDateObject(b.date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return getMinutesFromTime(a.time) - getMinutesFromTime(b.time);
  };

  const applySelectedFilter = (list: Reminder[]) => {
    if (selectedFilter === "all") return list;
    if (selectedFilter === "pending" || selectedFilter === "completed" || selectedFilter === "cancelled") {
      return list.filter((reminder) => reminder.status === selectedFilter);
    }
    return list.filter((reminder) => reminder.type === selectedFilter);
  };

  // Fetch reminders from database
  const fetchReminders = useCallback(async () => {
    setLoadingReminders(true);
    try {
      const { data, error } = await supabase
        .from("reminders")
        .select("*")
        .order("reminder_date", { ascending: true })
        .order("reminder_time", { ascending: true });

      if (error) {
        throw error;
      }

      const mappedReminders: Reminder[] = (data ?? []).map((reminder: any) => ({
        id: reminder.reminder_id,
        title: reminder.title,
        description: reminder.description ?? "",
        date: reminder.reminder_date,
        time: reminder.reminder_time ? (reminder.reminder_time.length >= 5 ? reminder.reminder_time.slice(0, 5) : reminder.reminder_time) : "09:00",
        type: reminder.type as Reminder["type"],
        priority: reminder.priority as Reminder["priority"],
        status: reminder.status as Reminder["status"],
        customer: reminder.customer ?? undefined,
        assignedTo: reminder.assigned_to ?? undefined,
        completedAt: reminder.completed_at ?? undefined,
        relatedVisitId: reminder.related_visit_id ?? undefined,
      }));

      setDbReminders(mappedReminders);
    } catch (error) {
      console.error("Error fetching reminders:", error);
      toast.error("Failed to load reminders");
    } finally {
      setLoadingReminders(false);
    }
  }, []);

  // Convert visits to reminders format for display
  const visitReminders = useMemo(() => {
    let idCounter = 1000000; // Start from a high number to avoid conflicts
    return visits
      .map((visit) => {
        // Normalize status (handle both capitalized and lowercase)
        const statusLower = visit.status?.toLowerCase() ?? "scheduled";
        const visitStatus = 
          statusLower === "completed" ? "completed" : 
          statusLower === "cancelled" ? "cancelled" : 
          "pending";
        
        return {
          id: idCounter++,
          title: visit.type === "monthly" 
            ? `Monthly Visit: ${visit.customerName}${visit.contractNumber ? ` (${visit.contractNumber})` : ""}`
            : `Visit: ${visit.customerName}`,
          description: visit.notes ?? `${visit.delegateName} - ${visit.address ?? "No address"}`,
          date: visit.date,
          time: visit.time ?? "09:00",
          type: "visit" as const,
          priority: "medium" as const,
          status: visitStatus as Reminder["status"],
          customer: visit.customerName,
          assignedTo: visit.delegateName,
          relatedVisitId: visit.id,
        } as Reminder;
      });
  }, [visits, startOfToday]);

  // Convert invoices with due dates to payment reminders
  const invoiceReminders = useMemo(() => {
    let idCounter = 2000000; // Start from a different high number
    return invoices
      .filter((invoice) => invoice.due_date)
      .map((invoice) => {
        const isOverdue = toDateObject(invoice.due_date) < startOfToday;
        const isPaid = invoice.payment_status === "paid" || (invoice.remaining_amount ?? invoice.total_amount) <= 0;
        
        return {
          id: idCounter++,
          title: `Payment Due: ${invoice.customer?.customer_name ?? "Unknown Customer"}`,
          description: `Invoice ${invoice.invoice_id.slice(0, 8)} - Amount: ${invoice.remaining_amount ?? invoice.total_amount} SAR`,
          date: invoice.due_date,
          time: "09:00",
          type: "payment" as const,
          priority: (isOverdue && !isPaid ? "high" : "medium") as Reminder["priority"],
          status: (isPaid ? "completed" : "pending") as Reminder["status"],
          customer: invoice.customer?.customer_name,
          relatedInvoiceId: invoice.invoice_id,
        } as Reminder & { relatedInvoiceId?: string };
      });
  }, [invoices, startOfToday]);

  // Combine database reminders, visit reminders, and invoice reminders (exclude local state reminders which are now in dbReminders)
  const allReminders = useMemo(() => [...dbReminders, ...visitReminders, ...invoiceReminders], [dbReminders, visitReminders, invoiceReminders]);

  const todayReminders = useMemo(() => allReminders
    .filter(
      (reminder) =>
        reminder.status === "pending" && isSameDay(startOfToday, reminder.date)
    )
    .sort(compareReminders), [allReminders, startOfToday]);

  const upcomingBase = useMemo(() => allReminders.filter((reminder) => {
    const reminderDate = toDateObject(reminder.date);
    return reminderDate >= startOfToday && reminderDate <= daysAhead;
  }), [allReminders, startOfToday, daysAhead]);


  // All reminders in the selected month (not just from today, but the entire selected month)
  const allMonthReminders = useMemo(() => allReminders.filter((reminder) => {
    const reminderDate = toDateObject(reminder.date);
    return reminderDate >= selectedMonthStart && reminderDate <= selectedMonthEnd;
  }), [allReminders, selectedMonthStart, selectedMonthEnd]);

  const upcomingReminders = useMemo(() => 
    applySelectedFilter(upcomingBase).sort(compareReminders), 
    [upcomingBase, selectedFilter]
  );

  // All reminders in the selected month (with filter applied)
  const allMonthRemindersFiltered = useMemo(() => 
    applySelectedFilter(allMonthReminders).sort(compareReminders), 
    [allMonthReminders, selectedFilter]
  );

  // Fetch visits from both manual_visits and monthly_visits tables
  const fetchVisits = useCallback(async () => {
    setLoadingVisits(true);
    try {
      const [manualVisitsRes, monthlyVisitsRes] = await Promise.all([
        supabase
          .from("manual_visits")
          .select(`
            visit_id,
            visit_date,
            visit_time,
            status,
            address,
            notes,
            customer:customers(customer_name),
            delegate:delegates(delegate_name)
          `)
          .order("visit_date", { ascending: true }),
        supabase
          .from("monthly_visits")
          .select(`
            visit_id,
            visit_date,
            visit_time,
            status,
            address,
            notes,
            customer:customers(customer_name),
            delegate:delegates(delegate_name),
            contract:contracts(contract_number)
          `)
          .order("visit_date", { ascending: true }),
      ]);

      const errors = [manualVisitsRes.error, monthlyVisitsRes.error].filter(Boolean);
      if (errors.length > 0) {
        throw errors[0];
      }

      const allVisits: VisitData[] = [];

      // Process manual visits
      (manualVisitsRes.data ?? []).forEach((visit: any) => {
        const customer = Array.isArray(visit.customer) ? visit.customer[0] : visit.customer;
        const delegate = Array.isArray(visit.delegate) ? visit.delegate[0] : visit.delegate;
        
        if (visit.visit_date) {
          allVisits.push({
            id: visit.visit_id,
            date: visit.visit_date,
            time: visit.visit_time ? (visit.visit_time.length >= 5 ? visit.visit_time.slice(0, 5) : visit.visit_time) : null,
            customerName: customer?.customer_name ?? "Unknown Customer",
            delegateName: delegate?.delegate_name ?? "Unassigned",
            status: visit.status ?? "scheduled",
            address: visit.address ?? null,
            notes: visit.notes ?? null,
            type: "manual",
          });
        }
      });

      // Process monthly visits
      (monthlyVisitsRes.data ?? []).forEach((visit: any) => {
        const customer = Array.isArray(visit.customer) ? visit.customer[0] : visit.customer;
        const delegate = Array.isArray(visit.delegate) ? visit.delegate[0] : visit.delegate;
        const contract = Array.isArray(visit.contract) ? visit.contract[0] : visit.contract;
        
        if (visit.visit_date) {
          allVisits.push({
            id: visit.visit_id,
            date: visit.visit_date,
            time: visit.visit_time ? (visit.visit_time.length >= 5 ? visit.visit_time.slice(0, 5) : visit.visit_time) : null,
            customerName: customer?.customer_name ?? "Unknown Customer",
            delegateName: delegate?.delegate_name ?? "Unassigned",
            status: visit.status ?? "scheduled",
            address: visit.address ?? null,
            notes: visit.notes ?? null,
            type: "monthly",
            contractNumber: contract?.contract_number,
          });
        }
      });

      setVisits(allVisits);
    } catch (error) {
      console.error("Error fetching visits:", error);
      toast.error("Failed to load visits");
    } finally {
      setLoadingVisits(false);
    }
  }, []);

  // Auto-create next month's scheduled monthly visits for active contracts
  const autoCreateNextMonthVisits = useCallback(async () => {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const endOfThisMonth = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        0
      );
      endOfThisMonth.setHours(0, 0, 0, 0);

      const msPerDay = 1000 * 60 * 60 * 24;
      const daysUntilEnd =
        (endOfThisMonth.getTime() - today.getTime()) / msPerDay;

      // Only run in the last 7 days of the month
      if (daysUntilEnd > 7 || daysUntilEnd < 0) {
        return;
      }

      // Fetch active contracts
      const { data: contracts, error: contractsError } = await supabase
        .from("contracts")
        .select("contract_id, contract_number, contract_status, customer_id, location, notes, delegate_id, contract_start_date")
        .eq("contract_status", "active");

      if (contractsError) {
        throw contractsError;
      }

      if (!contracts || contracts.length === 0) {
        return;
      }

      // Get current user ID if available
      const stored = localStorage.getItem("auth_user");
      let currentUserId: string | null = null;
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          currentUserId = parsed.user_id || null;
        } catch (e) {
          console.error("Failed to parse auth_user", e);
        }
      }

      const nextMonthFirstDay = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        1
      );
      nextMonthFirstDay.setHours(0, 0, 0, 0);

      for (const contract of contracts as any[]) {
        let additionalData: any = {};
        try {
          if (contract.notes) {
            additionalData = JSON.parse(contract.notes);
          }
        } catch {
          additionalData = { notes: contract.notes };
        }

        // Skip contracts where automatic monthly visits are disabled
        if (additionalData.autoMonthlyVisitsEnabled === false) {
          continue;
        }

        const baseDateStr =
          additionalData.monthlyVisitStartDate || contract.contract_start_date;
        if (!baseDateStr) continue;

        const baseDate = new Date(baseDateStr);
        if (Number.isNaN(baseDate.getTime())) continue;

        // Compute expected visit day (same day-of-month as base date) in next month
        const targetYear = nextMonthFirstDay.getFullYear();
        const targetMonth = nextMonthFirstDay.getMonth(); // already next month
        const day = baseDate.getDate();
        const lastDayOfTargetMonth = new Date(
          targetYear,
          targetMonth + 1,
          0
        ).getDate();
        const targetDay = Math.min(day, lastDayOfTargetMonth);

        const nextVisitDate = new Date(targetYear, targetMonth, targetDay);
        nextVisitDate.setHours(0, 0, 0, 0);
        const visitDateIso = nextVisitDate.toISOString().split("T")[0];

        // Check if a monthly visit already exists for that contract & date
        const { data: existingVisits, error: existingError } = await supabase
          .from("monthly_visits")
          .select("visit_id")
          .eq("contract_id", contract.contract_id)
          .eq("visit_date", visitDateIso);

        if (existingError) {
          throw existingError;
        }

        if (existingVisits && existingVisits.length > 0) {
          continue;
        }

        // Fallbacks for delegate and address
        let delegateId = contract.delegate_id ?? null;
        let address = contract.location ?? null;

        if (!delegateId || !address) {
          const { data: customerRow, error: customerError } = await supabase
            .from("customers")
            .select("delegate_id, customer_address")
            .eq("customer_id", contract.customer_id)
            .maybeSingle();

          if (customerError) {
            throw customerError;
          }

          if (customerRow) {
            if (!delegateId) {
              delegateId = customerRow.delegate_id ?? null;
            }
            if (!address) {
              address = customerRow.customer_address ?? null;
            }
          }
        }

        // Create the next month's scheduled visit
        const { error: insertError } = await supabase.from("monthly_visits").insert({
          contract_id: contract.contract_id,
          customer_id: contract.customer_id,
          visit_date: visitDateIso,
          visit_time: null,
          status: "scheduled",
          address,
          notes: `Monthly visit for contract ${contract.contract_number}`,
          delegate_id: delegateId,
          created_by: currentUserId,
          updated_by: currentUserId,
        });

        if (insertError) {
          throw insertError;
        }
      }
    } catch (error) {
      console.error("Error auto-creating next month's visits:", error);
      // Silent failure is acceptable here; no toast to avoid user noise on background task
    }
  }, []);

  // Fetch invoices with due dates
  const fetchInvoices = useCallback(async () => {
    setLoadingInvoices(true);
    try {
      const { data, error } = await supabase
        .from("invoices")
        .select(`
          invoice_id,
          due_date,
          total_amount,
          remaining_amount,
          payment_status,
          customer:customers(customer_name)
        `)
        .not("due_date", "is", null)
        .order("due_date", { ascending: true });

      if (error) {
        throw error;
      }

      setInvoices(data ?? []);
    } catch (error) {
      console.error("Error fetching invoices:", error);
      toast.error("Failed to load invoice due dates");
    } finally {
      setLoadingInvoices(false);
    }
  }, []);

  useEffect(() => {
    void fetchReminders();
    void fetchVisits();
    void fetchInvoices();
    void autoCreateNextMonthVisits();
  }, [fetchReminders, fetchVisits, fetchInvoices, autoCreateNextMonthVisits]);

  const getRemindersForDate = useCallback((targetDate: Date) => {
    const normalized = new Date(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      targetDate.getDate()
    );
    return allReminders.filter((reminder) => isSameDay(normalized, reminder.date));
  }, [allReminders]);



  const remindersForSelectedDate = useMemo(() => 
    getRemindersForDate(selectedDay), 
    [selectedDay, getRemindersForDate]
  );

  const calendarTileClassName = ({ date, view }: CalendarTileProperties) => {
    if (view !== "month") {
      return "text-sm";
    }

    const classes = [
      "relative",
      "rounded-xl",
      "py-2",
      "text-sm",
      "transition",
      "duration-200",
      "hover:bg-purple-50",
      "focus-visible:outline-none",
      "focus-visible:ring-2",
      "focus-visible:ring-purple-500/60",
    ];

    if (isSameDay(date, selectedDay)) {
      classes.push(
        "!bg-purple-600",
        "!text-white",
        "shadow-sm",
        "hover:!bg-purple-600/90"
      );
    } else if (isSameDay(date, startOfToday)) {
      classes.push(
        "border",
        "border-purple-200",
        "!bg-purple-50",
        "!text-purple-700",
        "font-semibold"
      );
    } else {
      classes.push("text-muted-foreground");
    }

    return classes.join(" ");
  };

  const calendarTileContent = ({
    date,
    view,
  }: CalendarTileProperties) => {
    if (view !== "month") {
      return null;
    }
    
    // Check all reminders (database, visits, invoices) for this date
    const hasReminders = allReminders.some((reminder) => isSameDay(date, reminder.date));
    
    if (hasReminders) {
      return (
        <span className="mx-auto mt-2 block h-1 w-6 rounded-full bg-purple-500"></span>
      );
    }
    return null;
  };

  const handleCalendarChange: NonNullable<
    ComponentProps<typeof ReactCalendar>["onChange"]
  > = (value) => {
    const nextValue = Array.isArray(value)
      ? value.find((item): item is Date => item instanceof Date) ?? null
      : value;

    if (nextValue instanceof Date) {
      const normalized = new Date(
        nextValue.getFullYear(),
        nextValue.getMonth(),
        nextValue.getDate()
      );
      setSelectedDate(normalized);
    }
  };

  const handleCreateReminder = async () => {
    if (!reminderTitle.trim() || !reminderDate || !reminderTime) {
      toast.error("Please fill all required fields");
      return;
    }

    // Check create permission
    if (!canCreateReminders) {
      toast.error("You do not have permission to create reminders");
      return;
    }

    try {
      const { error } = await supabase
        .from("reminders")
        .insert({
          title: reminderTitle,
          description: reminderDescription || null,
          reminder_date: reminderDate,
          reminder_time: reminderTime,
          type: reminderType,
          priority: reminderPriority,
          status: "pending",
          customer: reminderCustomer || null,
          assigned_to: reminderAssignedTo || null,
        });

      if (error) {
        throw error;
      }

      // Refresh reminders from database
      await fetchReminders();
      
      // Log activity
      if (onActivityAdd) {
        onActivityAdd({
          type: "reminder" as const,
          action: "created" as const,
          title: "New Reminder Created",
          description: `Created new ${reminderType} reminder: ${reminderTitle}`,
          user: "System",
          userRole: "User",
          relatedEntity: reminderCustomer || undefined,
          details: {
            status: `Scheduled for ${reminderDate} at ${reminderTime}`,
          }
        });
      }
      
      setIsAddReminderOpen(false);
      
      // Reset form
      setReminderTitle("");
      setReminderDescription("");
      setReminderDate("");
      setReminderTime("");
      setReminderType("visit");
      setReminderPriority("medium");
      setReminderCustomer("");
      setReminderAssignedTo("");
      
      toast.success("Reminder created successfully!");
    } catch (error) {
      console.error("Error creating reminder:", error);
      toast.error("Failed to create reminder");
    }
  };

  const openEditReminder = (reminder: Reminder) => {
    setEditingReminder(reminder);
    setEditForm({
      title: reminder.title,
      description: reminder.description,
      date: reminder.date,
      time: reminder.time,
      type: reminder.type,
      priority: reminder.priority,
      status: reminder.status,
      customer: reminder.customer ?? "",
      assignedTo: reminder.assignedTo ?? "",
    });
    setIsEditReminderOpen(true);
  };

  const handleUpdateReminder = async () => {
    if (!editingReminder) return;
    if (!editForm.title.trim() || !editForm.date || !editForm.time) {
      toast.error("Please fill all required fields");
      return;
    }

<<<<<<< HEAD
    // Check update permission for all reminders
    if (!canUpdateReminders) {
      toast.error("You do not have permission to update reminders");
      return;
=======
    // Check permissions for visit/invoice reminders
    if (editingReminder.relatedVisitId || (editingReminder as any).relatedInvoiceId) {
      if (!canUpdateReminders) {
        toast.error("You do not have permission to update visit or invoice reminders");
        return;
      }
      // Allow editing if user has update permission
>>>>>>> 52da8055d7ac5a5542c6c785b37b52caae8c5d53
    }

    try {
      const isNowCompleted = editForm.status === "completed";
      const completedAt = isNowCompleted && !editingReminder.completedAt 
        ? new Date().toISOString() 
        : (editForm.status === "completed" ? editingReminder.completedAt : null);

      const { error } = await supabase
        .from("reminders")
        .update({
          title: editForm.title,
          description: editForm.description || null,
          reminder_date: editForm.date,
          reminder_time: editForm.time,
          type: editForm.type,
          priority: editForm.priority,
          status: editForm.status,
          customer: editForm.customer || null,
          assigned_to: editForm.assignedTo || null,
          completed_at: completedAt || null,
          updated_at: new Date().toISOString(),
        })
        .eq("reminder_id", editingReminder.id);

      if (error) {
        throw error;
      }

      // Refresh reminders from database
      await fetchReminders();

      if (onActivityAdd) {
        onActivityAdd({
          type: "reminder",
          action: "updated",
          title: "Reminder Updated",
          description: `Updated reminder: ${editForm.title}`,
          user: "System",
          userRole: "User",
          relatedEntity: editForm.customer || undefined,
          details: {
            status: `Status: ${editForm.status}`,
          },
        });
      }

      setIsEditReminderOpen(false);
      setEditingReminder(null);
      setEditForm({ ...emptyEditForm });
      toast.success("Reminder updated successfully!");
    } catch (error) {
      console.error("Error updating reminder:", error);
      toast.error("Failed to update reminder");
    }
  };

  const handleDeleteReminder = async (id: number) => {
    const reminderToDelete = allReminders.find((r) => r.id === id);
    
    if (!reminderToDelete) {
      toast.error("Reminder not found");
      return;
    }

    // Check permissions for visit/invoice reminders
    if (reminderToDelete.relatedVisitId || (reminderToDelete as any)?.relatedInvoiceId) {
      if (!canDeleteReminders) {
        toast.error("You do not have permission to delete visit or invoice reminders");
        return;
      }
      // Note: Visit/invoice reminders are derived from visits/invoices, so we don't delete them
      // We only allow deleting the underlying visit/invoice if user has permissions
      toast.info("Visit and invoice reminders are managed through their respective modules");
      return;
    }

    // Check delete permission for regular reminders
    if (!canDeleteReminders) {
      toast.error("You do not have permission to delete reminders");
      return;
    }

    try {
      const { error } = await supabase
        .from("reminders")
        .delete()
        .eq("reminder_id", id);

      if (error) {
        throw error;
      }

      // Refresh reminders from database
      await fetchReminders();

      if (reminderToDelete && onActivityAdd) {
        onActivityAdd({
          type: "reminder",
          action: "deleted",
          title: "Reminder Deleted",
          description: `Deleted reminder: ${reminderToDelete.title}`,
          user: "System",
          userRole: "User",
          relatedEntity: reminderToDelete.customer,
          details: {
            status: reminderToDelete.status,
          },
        });
      }

      toast.success("Reminder deleted successfully!");
    } catch (error) {
      console.error("Error deleting reminder:", error);
      toast.error("Failed to delete reminder");
    }
  };

  const markAsCompleted = async (id: number) => {
    const reminder = allReminders.find(r => r.id === id);
    
    if (!reminder) {
      toast.error("Reminder not found");
      return;
    }

    // Check permissions for visit/invoice reminders
    if (reminder.relatedVisitId || (reminder as any)?.relatedInvoiceId) {
      if (!canUpdateReminders) {
        toast.error("You do not have permission to update visit or invoice reminders");
        return;
      }
    }

    try {
      const now = new Date().toISOString();
      
      // If it's a visit reminder, update the visit status in the database
      if (reminder.relatedVisitId) {
        // Determine which table to update based on visit type
        const visit = visits.find(v => v.id === reminder.relatedVisitId);
        if (visit) {
          const tableName = visit.type === "monthly" ? "monthly_visits" : "manual_visits";
          const { error: visitError } = await supabase
            .from(tableName)
            .update({
              status: "completed",
              updated_at: now,
            })
            .eq("visit_id", reminder.relatedVisitId);

          if (visitError) {
            console.error("Error updating visit:", visitError);
            toast.error("Failed to update visit status");
            return;
          }
        }
      }

      // Update reminder in database (if it exists there)
      // Note: Visit/invoice reminders might not exist in reminders table
      if (!reminder.relatedVisitId && !(reminder as any)?.relatedInvoiceId) {
        const { error } = await supabase
          .from("reminders")
          .update({
            status: "completed",
            completed_at: now,
            updated_at: now,
          })
          .eq("reminder_id", id);

        if (error) {
          throw error;
        }
      }

      // Refresh data
      await fetchReminders();
      await fetchVisits();
      
      // Log activity
      if (reminder && onActivityAdd) {
        onActivityAdd({
          type: "reminder" as const,
          action: "completed" as const,
          title: "Reminder Completed",
          description: `Completed reminder: ${reminder.title}`,
          user: "System",
          userRole: "User",
          relatedEntity: reminder.customer,
          details: {
            status: "Completed successfully"
          }
        });
      }
      
      toast.success("Reminder marked as completed!");
    } catch (error) {
      console.error("Error completing reminder:", error);
      toast.error("Failed to complete reminder");
    }
  };

  const markAsPending = async (id: number) => {
    const reminder = allReminders.find((r) => r.id === id);
    
    if (!reminder) {
      toast.error("Reminder not found");
      return;
    }

    // Check permissions for visit/invoice reminders
    if (reminder.relatedVisitId || (reminder as any)?.relatedInvoiceId) {
      if (!canUpdateReminders) {
        toast.error("You do not have permission to update visit or invoice reminders");
        return;
      }
    }

    try {
      const now = new Date().toISOString();
      
      // If it's a visit reminder, update the visit status in the database
      if (reminder.relatedVisitId) {
        const visit = visits.find(v => v.id === reminder.relatedVisitId);
        if (visit) {
          const tableName = visit.type === "monthly" ? "monthly_visits" : "manual_visits";
          const { error: visitError } = await supabase
            .from(tableName)
            .update({
              status: "scheduled",
              updated_at: now,
            })
            .eq("visit_id", reminder.relatedVisitId);

          if (visitError) {
            console.error("Error updating visit:", visitError);
            toast.error("Failed to update visit status");
            return;
          }
        }
      }

      // Update reminder in database (if it exists there)
      if (!reminder.relatedVisitId && !(reminder as any)?.relatedInvoiceId) {
        const { error } = await supabase
          .from("reminders")
          .update({
            status: "pending",
            completed_at: null,
            updated_at: now,
          })
          .eq("reminder_id", id);

        if (error) {
          throw error;
        }
      }

      // Refresh data
      await fetchReminders();
      await fetchVisits();

      if (reminder && onActivityAdd) {
        onActivityAdd({
          type: "reminder",
          action: "updated",
          title: "Reminder Reopened",
          description: `Reopened reminder: ${reminder.title}`,
          user: "System",
          userRole: "User",
          relatedEntity: reminder.customer,
          details: {
            status: "Pending",
          },
        });
      }

      toast.success("Reminder reopened and set to pending.");
    } catch (error) {
      console.error("Error reopening reminder:", error);
      toast.error("Failed to reopen reminder");
    }
  };

  const markAsCancelled = async (id: number) => {
    const reminder = allReminders.find((r) => r.id === id);
    
    if (!reminder) {
      toast.error("Reminder not found");
      return;
    }

    // Check permissions for visit/invoice reminders
    if (reminder.relatedVisitId || (reminder as any)?.relatedInvoiceId) {
      if (!canUpdateReminders) {
        toast.error("You do not have permission to update visit or invoice reminders");
        return;
      }
    }

    try {
      const now = new Date().toISOString();
      
      // If it's a visit reminder, update the visit status in the database
      if (reminder.relatedVisitId) {
        const visit = visits.find(v => v.id === reminder.relatedVisitId);
        if (visit) {
          const tableName = visit.type === "monthly" ? "monthly_visits" : "manual_visits";
          const { error: visitError } = await supabase
            .from(tableName)
            .update({
              status: "cancelled",
              updated_at: now,
            })
            .eq("visit_id", reminder.relatedVisitId);

          if (visitError) {
            console.error("Error updating visit:", visitError);
            toast.error("Failed to update visit status");
            return;
          }
        }
      }

      // Update reminder in database (if it exists there)
      if (!reminder.relatedVisitId && !(reminder as any)?.relatedInvoiceId) {
        const { error } = await supabase
          .from("reminders")
          .update({
            status: "cancelled",
            completed_at: null,
            updated_at: now,
          })
          .eq("reminder_id", id);

        if (error) {
          throw error;
        }
      }

      // Refresh data
      await fetchReminders();
      await fetchVisits();

      if (reminder && onActivityAdd) {
        onActivityAdd({
          type: "reminder",
          action: "updated",
          title: "Reminder Cancelled",
          description: `Cancelled reminder: ${reminder.title}`,
          user: "System",
          userRole: "User",
          relatedEntity: reminder.customer,
          details: {
            status: "Cancelled",
          },
        });
      }

      toast.success("Reminder cancelled.");
    } catch (error) {
      console.error("Error cancelling reminder:", error);
      toast.error("Failed to cancel reminder");
    }
  };

  const ReminderRow = ({ reminder }: { reminder: Reminder }) => {
    const Icon = typeIcons[reminder.type];
    const isPending = reminder.status === "pending";
    const reminderDate = toDateObject(reminder.date);

    return (
      <div className="border rounded-lg p-4 hover:bg-muted/50 transition-colors">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:gap-5">
          <div className={`p-3 rounded-lg ${typeColors[reminder.type]} flex-shrink-0`}>
            <Icon className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0 space-y-3">
            <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
              <div className="space-y-1">
                <h4 className="font-semibold break-words">{reminder.title}</h4>
                {reminder.description && (
                  <p className="text-sm text-muted-foreground break-words">
                    {reminder.description}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {reminder.relatedVisitId && (
                  <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 gap-1">
                    <MapPin className="h-3 w-3" />
                    Visit
                  </Badge>
                )}
                <Badge variant={priorityColors[reminder.priority] as any}>
                  {reminder.priority}
                </Badge>
                {reminder.status === "completed" && (
                  <Badge variant="default" className="gap-1">
                    <Check className="h-3 w-3" />
                    Completed
                  </Badge>
                )}
                {reminder.status === "cancelled" && (
                  <Badge variant="destructive" className="gap-1">
                    <X className="h-3 w-3" />
                    Cancelled
                  </Badge>
                )}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <CalendarIcon className="h-4 w-4" />
                {reminderDate.toLocaleDateString("en-GB", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </div>
              <div className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" />
                {reminder.time}
              </div>
              {reminder.customer && (
                <div className="flex items-center gap-1.5">
                  <User className="h-4 w-4" />
                  {reminder.customer}
                </div>
              )}
            </div>
            {reminder.assignedTo && (
              <div className="text-xs text-muted-foreground">
                Assigned to: {reminder.assignedTo}
              </div>
            )}
            {reminder.status === "completed" && reminder.completedAt && (
              <div className="text-xs text-muted-foreground">
                Completed at:{" "}
                {new Date(reminder.completedAt).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            )}
          </div>
          <div className="flex flex-col gap-2 flex-shrink-0 items-stretch">
            {isPending ? (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => markAsCompleted(reminder.id)}
                >
                  <Check className="h-3.5 w-3.5" />
                  Complete
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5 text-destructive"
                  onClick={() => markAsCancelled(reminder.id)}
                >
                  <XCircle className="h-3.5 w-3.5" />
                  Cancel
                </Button>
              </>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() => markAsPending(reminder.id)}
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Reopen
              </Button>
            )}
            <div className="flex gap-2 justify-end">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => openEditReminder(reminder)}
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => handleDeleteReminder(reminder.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Calendar & Reminders</h2>
          <p className="text-muted-foreground mt-1">Manage your schedule, appointments, and reminders</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              void fetchReminders();
              void fetchVisits();
              void fetchInvoices();
            }}
            disabled={loadingReminders || loadingVisits || loadingInvoices}
            className="gap-2"
          >
            {(loadingReminders || loadingVisits || loadingInvoices) ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
          <Dialog open={isAddReminderOpen} onOpenChange={setIsAddReminderOpen}>
          <DialogTrigger asChild>
            <Button 
              className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
              disabled={!canCreateReminders}
              title={!canCreateReminders ? "You do not have permission to create reminders" : ""}
            >
              <Plus className="h-4 w-4" />
              Add Reminder
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Reminder</DialogTitle>
              <DialogDescription>Set up a new reminder or appointment</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reminder-type">Type</Label>
                  <Select value={reminderType} onValueChange={(value: any) => setReminderType(value)}>
                    <SelectTrigger id="reminder-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visit">Visit</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="follow-up">Follow-up</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reminder-priority">Priority</Label>
                  <Select value={reminderPriority} onValueChange={(value: any) => setReminderPriority(value)}>
                    <SelectTrigger id="reminder-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="reminder-title">Title *</Label>
                <Input 
                  id="reminder-title" 
                  placeholder="Enter reminder title" 
                  value={reminderTitle}
                  onChange={(e) => setReminderTitle(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="reminder-description">Description</Label>
                <Textarea 
                  id="reminder-description" 
                  placeholder="Additional details..." 
                  rows={3}
                  value={reminderDescription}
                  onChange={(e) => setReminderDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reminder-date">Date *</Label>
                  <Input 
                    id="reminder-date" 
                    type="date"
                    value={reminderDate}
                    onChange={(e) => setReminderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reminder-time">Time *</Label>
                  <Input 
                    id="reminder-time" 
                    type="time"
                    value={reminderTime}
                    onChange={(e) => setReminderTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="reminder-customer">Customer (Optional)</Label>
                  <Input 
                    id="reminder-customer"
                    placeholder="Customer name"
                    value={reminderCustomer}
                    onChange={(e) => setReminderCustomer(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reminder-assigned">Assign To (Optional)</Label>
                  <Input 
                    id="reminder-assigned"
                    placeholder="Representative name"
                    value={reminderAssignedTo}
                    onChange={(e) => setReminderAssignedTo(e.target.value)}
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsAddReminderOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleCreateReminder} 
                className="bg-purple-600 hover:bg-purple-700 text-white"
                disabled={!canCreateReminders}
              >
                Create Reminder
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isEditReminderOpen}
          onOpenChange={(open) => {
            setIsEditReminderOpen(open);
            if (!open) {
              setEditingReminder(null);
              setEditForm({ ...emptyEditForm });
            }
          }}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Reminder</DialogTitle>
              <DialogDescription>Update reminder details</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-reminder-type">Type</Label>
                  <Select
                    value={editForm.type}
                    onValueChange={(value: Reminder["type"]) =>
                      setEditForm((prev) => ({ ...prev, type: value }))
                    }
                  >
                    <SelectTrigger id="edit-reminder-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visit">Visit</SelectItem>
                      <SelectItem value="payment">Payment</SelectItem>
                      <SelectItem value="contract">Contract</SelectItem>
                      <SelectItem value="follow-up">Follow-up</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reminder-priority">Priority</Label>
                  <Select
                    value={editForm.priority}
                    onValueChange={(value: Reminder["priority"]) =>
                      setEditForm((prev) => ({ ...prev, priority: value }))
                    }
                  >
                    <SelectTrigger id="edit-reminder-priority">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="low">Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-reminder-title">Title *</Label>
                <Input
                  id="edit-reminder-title"
                  placeholder="Enter reminder title"
                  value={editForm.title}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="edit-reminder-description">Description</Label>
                <Textarea
                  id="edit-reminder-description"
                  placeholder="Additional details..."
                  rows={3}
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, description: e.target.value }))
                  }
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-reminder-date">Date *</Label>
                  <Input
                    id="edit-reminder-date"
                    type="date"
                    value={editForm.date}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, date: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reminder-time">Time *</Label>
                  <Input
                    id="edit-reminder-time"
                    type="time"
                    value={editForm.time}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, time: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reminder-status">Status</Label>
                  <Select
                    value={editForm.status}
                    onValueChange={(value: Reminder["status"]) =>
                      setEditForm((prev) => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger id="edit-reminder-status">
                      <SelectValue placeholder="Select status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-reminder-customer">Customer (Optional)</Label>
                  <Input
                    id="edit-reminder-customer"
                    placeholder="Customer name"
                    value={editForm.customer}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, customer: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-reminder-assigned">
                    Assign To (Optional)
                  </Label>
                  <Input
                    id="edit-reminder-assigned"
                    placeholder="Representative name"
                    value={editForm.assignedTo}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        assignedTo: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditReminderOpen(false);
                  setEditingReminder(null);
                  setEditForm({ ...emptyEditForm });
                }}
              >
                Cancel
              </Button>
              <Button 
                onClick={handleUpdateReminder} 
                className="bg-purple-600 hover:bg-purple-700 text-white"
                disabled={!canUpdateReminders}
              >
                Save Changes
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      {/* Today's Overview */}
      {todayReminders.length > 0 && (
        <Card className="border-l-4 border-l-blue-600 bg-blue-50/50">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg">Today's Reminders</CardTitle>
              <Badge variant="default" className="ml-auto">{todayReminders.length}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {todayReminders.map((reminder) => {
                const Icon = typeIcons[reminder.type];
                return (
                  <div
                    key={reminder.id}
                    className="flex flex-col gap-3 rounded-lg border bg-white p-3 md:flex-row md:items-center"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${typeColors[reminder.type]}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-medium text-sm">{reminder.title}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <Clock className="h-3 w-3" />
                          {reminder.time}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 md:ml-auto">
                      {reminder.status === "pending" ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => markAsCompleted(reminder.id)}
                          >
                            <Check className="h-3.5 w-3.5" />
                            Done
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 text-destructive"
                            onClick={() => markAsCancelled(reminder.id)}
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => markAsPending(reminder.id)}
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          Reopen
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditReminder(reminder)}
                        title="Edit reminder"
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteReminder(reminder.id)}
                        title="Delete reminder"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-7">
        {/* Calendar */}
        <Card className="lg:col-span-4 hover:shadow-md transition-shadow">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Calendar</CardTitle>
                <CardDescription>View and manage your schedule</CardDescription>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <span className="block h-2 w-2 rounded-full bg-purple-500"></span>
                  <span>Activities</span>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex justify-center">
            <div className="w-full rounded-2xl border border-border bg-card p-4 shadow-sm">
              <ReactCalendar
                value={selectedDate}
                onChange={handleCalendarChange}
                tileClassName={calendarTileClassName}
                tileContent={calendarTileContent}
                prev2Label={null}
                next2Label={null}
                prevLabel={<ChevronLeft className="h-4 w-4 text-muted-foreground" />}
                nextLabel={<ChevronRight className="h-4 w-4 text-muted-foreground" />}
                showNeighboringMonth={false}
                minDetail="month"
                maxDetail="month"
                locale="en-US"
                className="react-calendar w-full border-none bg-transparent text-sm"
              />
            </div>
          </CardContent>
          <CardContent className="pt-0">
            <div className="border-t pt-4">
              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                Activities for{" "}
                {selectedDate.toLocaleDateString("en-GB", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
                {remindersForSelectedDate.length > 0 && (
                  <Badge variant="secondary" className="text-xs">
                    {remindersForSelectedDate.length}
                  </Badge>
                )}
              </h4>
              {remindersForSelectedDate.length > 0 ? (
                <div className="space-y-2">
                  {remindersForSelectedDate.map((reminder) => {
                    const Icon = typeIcons[reminder.type];
                    const isVisitReminder = 'relatedVisitId' in reminder && reminder.relatedVisitId !== undefined;
                    const isInvoiceReminder = 'relatedInvoiceId' in reminder && (reminder as any).relatedInvoiceId !== undefined;
                    
                    return (
                      <div key={reminder.id} className="flex items-start gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors">
                        <div className={`p-2 rounded-lg ${typeColors[reminder.type]} flex-shrink-0`}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="font-medium text-sm">{reminder.title}</div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {isVisitReminder && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 text-xs gap-1">
                                  <MapPin className="h-3 w-3" />
                                  Visit
                                </Badge>
                              )}
                              {isInvoiceReminder && (
                                <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-xs gap-1">
                                  <DollarSign className="h-3 w-3" />
                                  Payment
                                </Badge>
                              )}
                              <Badge variant={priorityColors[reminder.priority] as any} className="text-xs">
                                {reminder.priority}
                              </Badge>
                            </div>
                          </div>
                          {reminder.description && (
                            <div className="text-xs text-muted-foreground mb-1">{reminder.description}</div>
                          )}
                          <div className="flex items-center gap-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {reminder.time}
                            </div>
                            {reminder.customer && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {reminder.customer}
                              </div>
                            )}
                            {'assignedTo' in reminder && reminder.assignedTo && (
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {reminder.assignedTo}
                              </div>
                            )}
                          </div>
                          {reminder.status === "completed" && (
                            <div className="mt-2 space-y-1">
                              <Badge variant="default" className="text-xs">
                                <Check className="h-3 w-3 mr-1" />
                                Completed
                              </Badge>
                              {'completedAt' in reminder && reminder.completedAt && (
                                <p className="text-xs text-muted-foreground">
                                  Completed at: {new Date(reminder.completedAt).toLocaleString('en-US', { 
                                    month: 'short', 
                                    day: 'numeric', 
                                    hour: '2-digit', 
                                    minute: '2-digit' 
                                  })}
                                </p>
                              )}
                            </div>
                          )}
                          {reminder.status === "cancelled" && (
                            <Badge variant="destructive" className="text-xs mt-2">
                              <X className="h-3 w-3 mr-1" />
                              Cancelled
                            </Badge>
                          )}
                        </div>
                        {!isInvoiceReminder && (
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            {reminder.status === "pending" ? (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  onClick={() => markAsCompleted(reminder.id)}
                                >
                                  <Check className="h-3.5 w-3.5" />
                                  Done
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5 text-destructive"
                                  onClick={() => markAsCancelled(reminder.id)}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5"
                                onClick={() => markAsPending(reminder.id)}
                              >
                                <RotateCcw className="h-3.5 w-3.5" />
                                Reopen
                              </Button>
                            )}
                            {!isVisitReminder && (
                              <div className="flex gap-1.5 justify-end">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openEditReminder(reminder)}
                                >
                                  <Edit className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => handleDeleteReminder(reminder.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-6 text-muted-foreground">
                  <CalendarIcon className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No activities scheduled for this date</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Reminders */}
        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Upcoming</CardTitle>
            <CardDescription>Your next reminders</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-3">
                {upcomingReminders.length > 0 ? (
                  upcomingReminders.map((reminder) => {
                    const Icon = typeIcons[reminder.type];
                    return (
                      <div key={reminder.id} className="border rounded-lg p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${typeColors[reminder.type]}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="font-semibold text-sm">{reminder.title}</h4>
                              <Badge variant={priorityColors[reminder.priority] as any} className="text-xs">
                                {reminder.priority}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground mb-2">{reminder.description}</p>
                            <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <CalendarIcon className="h-3 w-3" />
                                {new Date(reminder.date).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {reminder.time}
                              </div>
                            </div>
                            {reminder.customer && (
                              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {reminder.customer}
                              </div>
                            )}
                          </div>
                        </div>
                    <div className="mt-3 flex justify-end flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => markAsCompleted(reminder.id)}
                      >
                        <Check className="h-3.5 w-3.5" />
                        Complete
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-destructive"
                        onClick={() => markAsCancelled(reminder.id)}
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => openEditReminder(reminder)}
                      >
                        <Edit className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => handleDeleteReminder(reminder.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No upcoming reminders</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* All Reminders */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>All Reminders</CardTitle>
              <CardDescription>View and manage all reminders</CardDescription>
            </div>
            <Select value={selectedFilter} onValueChange={setSelectedFilter}>
              <SelectTrigger className="w-[180px]">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reminders</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="visit">Visits</SelectItem>
                <SelectItem value="payment">Payments</SelectItem>
                <SelectItem value="contract">Contracts</SelectItem>
                <SelectItem value="follow-up">Follow-ups</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="upcoming" className="w-full">
            <TabsList className="grid w-full max-w-md grid-cols-2">
              <TabsTrigger value="upcoming">Upcoming (Next 5 Days)</TabsTrigger>
              <TabsTrigger value="all">All (This Month)</TabsTrigger>
            </TabsList>
            
            <TabsContent value="upcoming" className="mt-4 space-y-3">
              {upcomingReminders.length > 0 ? (
                upcomingReminders.map((reminder) => (
                  <ReminderRow key={`upcoming-${reminder.id}`} reminder={reminder} />
                ))
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No upcoming reminders</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="all" className="mt-4 space-y-6">
              {allMonthRemindersFiltered.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-muted-foreground mb-4">
                    <span className="text-sm font-semibold uppercase tracking-wide">
                      All Reminders in {selectedDate.toLocaleString("en-US", { month: "long", year: "numeric" })}
                    </span>
                    <Badge variant="outline">
                      {allMonthRemindersFiltered.length}
                    </Badge>
                  </div>
                  {allMonthRemindersFiltered.map((reminder) => (
                    <ReminderRow
                      key={`month-${reminder.id}`}
                      reminder={reminder}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Filter className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No reminders in {selectedDate.toLocaleString("en-US", { month: "long", year: "numeric" })}</p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
