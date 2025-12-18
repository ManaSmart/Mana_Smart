import { useEffect, useState, useCallback, type ReactNode, Suspense, lazy } from "react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Calendar,
  DollarSign,
  UserCog,
  MessageSquare,
  Menu,
  X,
  UserPlus,
  Bell,
  Settings,
  BarChart3,
  Receipt,
  FileStack,
  Briefcase,
  Wallet,
  TrendingDown,
  ShoppingCart,
  Package,
  Factory,
  LogOut,
  User,
  ChevronDown,
  RefreshCcw,
  FileBarChart,
  Plane,
  HandCoins,
  ChevronRight,
  Building2,
  ClipboardList,
  Boxes,
  Store,
  Calculator,
  Megaphone,
  Percent,
  PanelLeftClose,
  PanelLeft,
  Shield,
} from "lucide-react";
// Keep Login as static import since it's needed immediately
import { Login } from "./components/Login";
import type { AuthUserPayload } from "./components/Login";

// Lazy load all page components for better performance
// Using direct default export pattern to avoid React 19 issues
const Dashboard = lazy(() => import("./components/Dashboard").then(m => ({ default: m.Dashboard })));
const Customers = lazy(() => import("./components/Customers").then(m => ({ default: m.Customers })));
const Contracts = lazy(() => import("./components/Contracts").then(m => ({ default: m.Contracts })));
const Visits = lazy(() => import("./components/Visits").then(m => ({ default: m.Visits })));
const Payments = lazy(() => import("./components/Payments").then(m => ({ default: m.Payments })));
const Representatives = lazy(() => import("./components/Representatives").then(m => ({ default: m.Representatives })));
const Support = lazy(() => import("./components/Support").then(m => ({ default: m.Support })));
const Leads = lazy(() => import("./components/Leads").then(m => ({ default: m.Leads })));
const SettingsPage = lazy(() => import("./components/Settings").then(m => ({ default: m.Settings })));
const Quotations = lazy(() => import("./components/QuotationsUpdated").then(m => ({ default: m.Quotations })));
const CalendarReminders = lazy(() => import("./components/CalendarReminders").then(m => ({ default: m.CalendarReminders })));
const Analytics = lazy(() => import("./components/Analytics").then(m => ({ default: m.Analytics })));
const CustomerStatement = lazy(() => import("./components/CustomerStatement").then(m => ({ default: m.CustomerStatement })));
const Templates = lazy(() => import("./components/Templates").then(m => ({ default: m.Templates })));
const Invoices = lazy(() => import("./components/Invoices").then(m => ({ default: m.Invoices })));
const Employees = lazy(() => import("./components/Employees").then(m => ({ default: m.Employees })));
const Payroll = lazy(() => import("./components/Payroll").then(m => ({ default: m.Payroll })));
const Expenses = lazy(() => import("./components/Expenses").then(m => ({ default: m.Expenses })));
const Purchases = lazy(() => import("./components/Purchases").then(m => ({ default: m.Purchases })));
const MonthlyVisits = lazy(() => import("./components/MonthlyVisits").then(m => ({ default: m.MonthlyVisits })));
const Reports = lazy(() => import("./components/Reports").then(m => ({ default: m.Reports })));
const Leaves = lazy(() => import("./components/Leaves").then(m => ({ default: m.Leaves })));
const EmployeeRequests = lazy(() => import("./components/EmployeeRequests").then(m => ({ default: m.EmployeeRequests })));
const Profile = lazy(() => import("./components/Profile").then(m => ({ default: m.Profile })));
const InventoryManufacturingTabs = lazy(() => import("./components/InventoryManufacturingTabs").then(m => ({ default: m.InventoryManufacturingTabs })));
const PlatformOrders = lazy(() => import("./components/PlatformOrders").then(m => ({ default: m.PlatformOrders })));
const PlatformCustomers = lazy(() => import("./components/PlatformCustomers").then(m => ({ default: m.PlatformCustomers })));
const Marketing = lazy(() => import("./components/Marketing").then(m => ({ default: m.Marketing })));
const VAT = lazy(() => import("./components/VAT").then(m => ({ default: m.VAT })));
const MyWorkspace = lazy(() => import("./components/MyWorkspace").then(m => ({ default: m.MyWorkspace })));
const HistoryLog = lazy(() => import("./components/HistoryLog").then(m => ({ default: m.HistoryLog })));
const Custody = lazy(() => import("./components/Custody").then(m => ({ default: m.Custody })));
const Assets = lazy(() => import("./components/Assets").then(m => ({ default: m.Assets })));
const AttendanceSheet = lazy(() => import("./components/AttendanceSheet").then(m => ({ default: m.AttendanceSheet })));
import { Button } from "./components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "./components/ui/avatar";
import { Toaster } from "./components/ui/sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "./components/ui/dropdown-menu";
import { toast } from "sonner";
import type { PageId } from "./config/page-map";
import { normalizePermissions, hasPermission, type ResolvedPermissions } from "./lib/permissions";
import { getFilesByOwner, getFileUrl } from "./lib/storage";
import { FILE_CATEGORIES } from "../supabase/models/file_metadata";
import { supabase } from "./lib/supabaseClient";
import type { CompanyBranding } from "../supabase/models/company_branding";
import type { Reminder, Activity } from "./types/activity";
import { ImageWithFallback } from "./components/figma/ImageWithFallback";

type Page = PageId;

interface NavigationItem {
  id: Page;
  name: string;
  icon: any;
}

interface NavigationSection {
  section: string;
  icon: any;
  items: NavigationItem[];
}

const navigationSections: NavigationSection[] = [
  {
    section: "Dashboard & Analytics",
    icon: LayoutDashboard,
    items: [
      { id: "dashboard" as Page, name: "Dashboard", icon: LayoutDashboard },
      { id: "myworkspace" as Page, name: "My Workspace", icon: Briefcase },
      { id: "analytics" as Page, name: "Analytics & KPIs", icon: BarChart3 },
      { id: "calendar" as Page, name: "Calendar & Reminders", icon: Calendar },
    ]
  },
  {
    section: "Sales & Customers",
    icon: Building2,
    items: [
      { id: "customers" as Page, name: "Customers", icon: Users },
      { id: "leads" as Page, name: "Leads", icon: UserPlus },
      { id: "quotations" as Page, name: "Quotations", icon: FileText },
      { id: "invoices" as Page, name: "Invoices", icon: Receipt },
      { id: "contracts" as Page, name: "Contracts", icon: FileStack },
      { id: "statements" as Page, name: "Customer Statements", icon: Receipt },
    ]
  },
  {
    section: "Operations",
    icon: ClipboardList,
    items: [
      { id: "visits" as Page, name: "Visits", icon: Calendar },
      { id: "monthlyVisits" as Page, name: "Monthly Visits", icon: Calendar },
      { id: "payments" as Page, name: "Payments", icon: DollarSign },
      { id: "representatives" as Page, name: "Representatives", icon: UserCog },
      { id: "support" as Page, name: "Customer Support", icon: MessageSquare },
    ]
  },
  {
    section: "HR & Employees",
    icon: Briefcase,
    items: [
      { id: "employees" as Page, name: "Employees", icon: Briefcase },
      { id: "attendanceSheet" as Page, name: "Attendance Sheet", icon: Calendar },
      { id: "payroll" as Page, name: "Payroll", icon: Wallet },
      { id: "leaves" as Page, name: "Leave Management", icon: Plane },
      { id: "employeeRequests" as Page, name: "Employee Requests", icon: HandCoins },
    ]
  },
  {
    section: "Inventory & Manufacturing",
    icon: Boxes,
    items: [
      { id: "inventory" as Page, name: "Inventory", icon: Package },
      { id: "purchases" as Page, name: "Purchases", icon: ShoppingCart },
      { id: "suppliers" as Page, name: "Suppliers", icon: Building2 },
      { id: "manufacturing" as Page, name: "Manufacturing", icon: Factory },
      { id: "returns" as Page, name: "Returns", icon: RefreshCcw },
    ]
  },
  {
    section: "Assets & Custody",
    icon: Building2,
    items: [
      { id: "assets" as Page, name: "Fixed Assets", icon: Building2 },
      { id: "custody" as Page, name: "Employee Custody", icon: Package },
    ]
  },
  {
    section: "E-Commerce Platforms",
    icon: Store,
    items: [
      { id: "platformOrders" as Page, name: "Platform Orders", icon: Store },
      { id: "platformCustomers" as Page, name: "Platform Customers", icon: Users },
    ]
  },
  {
    section: "Marketing",
    icon: Megaphone,
    items: [
      { id: "marketing" as Page, name: "Campaigns & Marketing", icon: Megaphone },
    ]
  },
  {
    section: "Finance & Accounting",
    icon: Calculator,
    items: [
      { id: "expenses" as Page, name: "Expenses", icon: TrendingDown },
      { id: "vat" as Page, name: "VAT & Zakat", icon: Percent },
      { id: "reports" as Page, name: "Reports", icon: FileBarChart },
    ]
  },
  {
    section: "Templates & Communication",
    icon: FileStack,
    items: [
      { id: "templates" as Page, name: "Message Templates", icon: FileStack },
    ]
  },
  {
    section: "System Settings",
    icon: Settings,
    items: [
      { id: "historyLog" as Page, name: "History Log", icon: FileText },
      { id: "settings" as Page, name: "Settings & Permissions", icon: Settings },
    ]
  },
];


const mockActivities: Activity[] = [
  {
    id: 1,
    type: "customer",
    action: "created",
    title: "New Customer Added",
    description: "Added new customer: Palm Trading Company",
    user: "Mohammed Ahmed",
    userRole: "Sales Representative",
    timestamp: "2025-10-21T14:30:00",
    relatedEntity: "Palm Trading Company",
    details: {
      status: "Active"
    }
  },
  {
    id: 2,
    type: "invoice",
    action: "created",
    title: "Invoice Generated",
    description: "Created invoice #INV-2025-1024 for Paradise Corporation",
    user: "Sarah Ali",
    userRole: "Accountant",
    timestamp: "2025-10-21T13:45:00",
    relatedEntity: "Paradise Corporation",
    details: {
      amount: "SAR 5,175.00"
    }
  },
  {
    id: 3,
    type: "payment",
    action: "received",
    title: "Payment Received",
    description: "Received payment from Hope Commercial Group",
    user: "Fatima Hassan",
    userRole: "Finance Manager",
    timestamp: "2025-10-21T12:20:00",
    relatedEntity: "Hope Commercial Group",
    details: {
      amount: "SAR 3,450.00",
      status: "Completed"
    }
  },
  {
    id: 4,
    type: "contract",
    action: "updated",
    title: "Contract Renewed",
    description: "Renewed annual contract for Spring Trading Company",
    user: "Ahmed Khalid",
    userRole: "Contract Manager",
    timestamp: "2025-10-21T11:15:00",
    relatedEntity: "Spring Trading Company",
    details: {
      oldValue: "Expiring",
      newValue: "Active - 12 months",
      status: "Renewed"
    }
  },
  {
    id: 5,
    type: "visit",
    action: "completed",
    title: "Visit Completed",
    description: "Monthly maintenance visit completed at Horizon Company",
    user: "Khaled Saeed",
    userRole: "Field Representative",
    timestamp: "2025-10-21T10:30:00",
    relatedEntity: "Horizon Company",
    details: {
      status: "Successful"
    }
  },
  {
    id: 6,
    type: "lead",
    action: "created",
    title: "New Lead Added",
    description: "Added new potential customer: Future Tech Solutions",
    user: "Noor Abdullah",
    userRole: "Sales Executive",
    timestamp: "2025-10-21T09:45:00",
    relatedEntity: "Future Tech Solutions",
    details: {
      status: "Hot Lead"
    }
  },
  {
    id: 7,
    type: "quotation",
    action: "sent",
    title: "Quotation Sent",
    description: "Sent quotation #QT-2025-089 to Dream Enterprises",
    user: "Omar Youssef",
    userRole: "Sales Manager",
    timestamp: "2025-10-21T09:00:00",
    relatedEntity: "Dream Enterprises",
    details: {
      amount: "SAR 8,625.00"
    }
  },
  {
    id: 8,
    type: "customer",
    action: "updated",
    title: "Customer Information Updated",
    description: "Updated contact details for Paradise Corporation",
    user: "Layla Mohammed",
    userRole: "Customer Service",
    timestamp: "2025-10-20T16:30:00",
    relatedEntity: "Paradise Corporation",
    details: {
      oldValue: "Old Contact: +966 50 123 4567",
      newValue: "New Contact: +966 50 987 6543"
    }
  },
  {
    id: 9,
    type: "quotation",
    action: "created",
    title: "New Package Quotation",
    description: "Created premium package quotation for large businesses",
    user: "Abdullah Omar",
    userRole: "Sales Manager",
    timestamp: "2025-10-20T15:00:00",
    relatedEntity: "Premium Package",
    details: {
      amount: "SAR 4,500.00/month"
    }
  },
  {
    id: 10,
    type: "contract",
    action: "created",
    title: "New Contract Signed",
    description: "New 24-month contract signed with Global Trading LLC",
    user: "Hassan Ibrahim",
    userRole: "Business Development",
    timestamp: "2025-10-20T14:15:00",
    relatedEntity: "Global Trading LLC",
    details: {
      amount: "SAR 96,000.00",
      status: "Active"
    }
  },
  {
    id: 11,
    type: "reminder",
    action: "completed",
    title: "Reminder Completed",
    description: "Follow-up call completed for Spring Trading",
    user: "Mohammed Ahmed",
    userRole: "Sales Representative",
    timestamp: "2025-10-20T13:30:00",
    relatedEntity: "Spring Trading Company",
    details: {
      status: "Successful - Deal Closed"
    }
  },
  {
    id: 12,
    type: "invoice",
    action: "sent",
    title: "Invoice Sent",
    description: "Sent monthly invoice to Palm Trading Company",
    user: "Sarah Ali",
    userRole: "Accountant",
    timestamp: "2025-10-20T12:00:00",
    relatedEntity: "Palm Trading Company",
    details: {
      amount: "SAR 2,875.00"
    }
  },
  {
    id: 13,
    type: "system",
    action: "updated",
    title: "System Update",
    description: "Updated message templates for customer communications",
    user: "Admin",
    userRole: "System Administrator",
    timestamp: "2025-10-20T10:30:00",
    relatedEntity: "System Settings",
    details: {
      status: "Templates Updated"
    }
  },
  {
    id: 14,
    type: "lead",
    action: "updated",
    title: "Lead Converted",
    description: "Converted lead to active customer: Vision Enterprises",
    user: "Omar Youssef",
    userRole: "Sales Manager",
    timestamp: "2025-10-20T09:15:00",
    relatedEntity: "Vision Enterprises",
    details: {
      oldValue: "Lead",
      newValue: "Active Customer",
      status: "Converted"
    }
  },
  {
    id: 15,
    type: "payment",
    action: "completed",
    title: "Payment Processed",
    description: "Processed recurring payment for Horizon Company",
    user: "Fatima Hassan",
    userRole: "Finance Manager",
    timestamp: "2025-10-19T16:45:00",
    relatedEntity: "Horizon Company",
    details: {
      amount: "SAR 1,725.00",
      status: "Successful"
    }
  }
];

const PermissionDenied = ({ page }: { page: Page }) => (
  <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
    <Shield className="h-12 w-12 text-purple-500" />
    <div className="space-y-1">
      <h2 className="text-lg font-semibold">Access Restricted</h2>
      <p className="text-sm text-muted-foreground">
        You do not have permission to view the{" "}
        <span className="font-medium text-foreground">{page}</span> section.
      </p>
    </div>
  </div>
);

// Helper function to get initial auth state from localStorage (synchronous)
const getInitialAuthState = () => {
  try {
    const stored = localStorage.getItem('auth_user');
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    if (parsed?.full_name || parsed?.email) {
      return {
        currentUser: parsed.full_name ?? parsed.email ?? "",
        currentUserEmail: parsed.email ?? "",
        currentUserId: parsed.user_id ?? "",
        userRole: parsed.role_name ?? "",
        permissions: normalizePermissions(parsed.role_permissions),
        isLoggedIn: true,
      };
    }
  } catch (error) {
    console.error('Failed to parse stored auth user', error);
    localStorage.removeItem('auth_user');
  }
  return null;
};

// Helper function to get initial page, but reset to dashboard on a brand-new tab/window
const getInitialPage = (): Page => {
  try {
    // sessionStorage is cleared when the tab/window is closed, so use it to detect a fresh session
    const hasSession = sessionStorage.getItem('session_started');
    if (!hasSession) {
      sessionStorage.setItem('session_started', 'true');
      localStorage.setItem('current_page', 'dashboard'); // ensure new tabs start at dashboard
      return "dashboard";
    }

    const stored = localStorage.getItem('current_page');
    if (stored) {
      return stored as Page;
    }
  } catch (error) {
    console.error('Failed to parse stored current page', error);
  }
  return "dashboard";
};

export default function App() {
  // Initialize auth state synchronously from localStorage to prevent flash
  const initialAuthState = getInitialAuthState();
  const [isLoggedIn, setIsLoggedIn] = useState(initialAuthState?.isLoggedIn ?? false);
  const [currentUser, setCurrentUser] = useState(initialAuthState?.currentUser ?? "");
  const [currentUserEmail, setCurrentUserEmail] = useState(initialAuthState?.currentUserEmail ?? "");
  const [currentUserId, setCurrentUserId] = useState(initialAuthState?.currentUserId ?? "");
  const [userRole, setUserRole] = useState(initialAuthState?.userRole ?? "");
  const [permissions, setPermissions] = useState<ResolvedPermissions>(initialAuthState?.permissions ?? ({} as ResolvedPermissions));
  
  // Initialize current page from localStorage
  const [currentPage, setCurrentPage] = useState<Page>(getInitialPage());
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]); // Reminders are now fetched from database in CalendarReminders component
  const [activities, setActivities] = useState<Activity[]>(mockActivities);
  const [openSections, setOpenSections] = useState<string[]>(["Dashboard & Analytics"]);
  const [userProfilePicture, setUserProfilePicture] = useState<string | null>(null);
  
  // System Branding
  const [systemName, setSystemName] = useState("Mana Smart");
  const [systemSubtitle, setSystemSubtitle] = useState("Scent System");
  const [systemLogo, setSystemLogo] = useState("");
  const [systemNameAr, setSystemNameAr] = useState("منى سمارت");
  const [systemNameEn, setSystemNameEn] = useState("Mana Smart");
  
  // Shared state for converting quotations to invoices
  const [pendingQuotationData, setPendingQuotationData] = useState<any>(null);
  
  // Login key to force remount and clear form fields on logout
  const [loginKey, setLoginKey] = useState(0);

  // Ensure the sidebar section for the active page is expanded (covers initial load/reload)
  useEffect(() => {
    const section = navigationSections.find((s) =>
      s.items.some((item) => item.id === currentPage)
    );
    if (section && !openSections.includes(section.section)) {
      setOpenSections((prev) => [...prev, section.section]);
    }
  }, [currentPage, openSections]);

  const handleLogin = (payload: AuthUserPayload) => {
    setCurrentUser(payload.fullName);
    setCurrentUserEmail(payload.email);
    setCurrentUserId(payload.userId);
    setUserRole(payload.roleName);
    setPermissions(normalizePermissions(payload.rolePermissions));
    setIsLoggedIn(true);
    
    // Persist current page (in case user navigated before login)
    localStorage.setItem('current_page', currentPage);
  };

  // Persist current page whenever it changes (only if logged in)
  useEffect(() => {
    if (isLoggedIn && currentPage) {
      localStorage.setItem('current_page', currentPage);
    }
  }, [currentPage, isLoggedIn]);

  // Update favicon and page title when company logo/name changes
  useEffect(() => {
    const updateFavicon = (logoUrl: string) => {
      // Find existing favicon link or create a new one
      let favicon = document.querySelector("link[rel='icon']") as HTMLLinkElement;
      
      if (!favicon) {
        favicon = document.createElement("link");
        favicon.rel = "icon";
        document.head.appendChild(favicon);
      }

      if (logoUrl) {
        // Use company logo as favicon
        favicon.href = logoUrl;
        // Detect image type from URL extension
        const urlLower = logoUrl.toLowerCase();
        if (urlLower.includes('.svg')) {
          favicon.type = 'image/svg+xml';
        } else if (urlLower.includes('.png')) {
          favicon.type = 'image/png';
        } else if (urlLower.includes('.jpg') || urlLower.includes('.jpeg')) {
          favicon.type = 'image/jpeg';
        } else if (urlLower.includes('.webp')) {
          favicon.type = 'image/webp';
        } else {
          // Default to PNG for unknown formats
          favicon.type = 'image/png';
        }
      } else {
        // Fallback to default vite.svg
        favicon.href = '/vite.svg';
        favicon.type = 'image/svg+xml';
      }
    };

    updateFavicon(systemLogo);
    
    // Update page title with system name
    if (systemName) {
      document.title = systemName + (systemSubtitle ? ` - ${systemSubtitle}` : '');
    }
  }, [systemLogo, systemName, systemSubtitle]);

  // Load branding (logo, name, etc.) on app start
  useEffect(() => {
    const loadBranding = async () => {
      try {
        const { data, error } = await supabase
          .from("company_branding")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<CompanyBranding>();

        if (error) {
          // PGRST116 means no rows found - this is expected if branding hasn't been set up yet
          if (error.code === "PGRST116") {
            // Silently ignore - no branding record exists yet
            return;
          }
          console.error('Error loading branding:', error);
          return;
        }

        if (data) {
          // Update system name and subtitle
          if (data.system_sidebar_name) {
            setSystemName(data.system_sidebar_name);
          }
          if (data.system_sidebar_subtitle) {
            setSystemSubtitle(data.system_sidebar_subtitle);
          }
          if (data.company_name_ar) {
            setSystemNameAr(data.company_name_ar);
          }
          if (data.company_name_en) {
            setSystemNameEn(data.company_name_en);
          }

          // Load logo from file storage
          const brandingFiles = await getFilesByOwner(data.branding_id, 'branding');
          const logoFile = brandingFiles.find(f => f.category === FILE_CATEGORIES.BRANDING_LOGO);
          
          if (logoFile) {
            // Get fresh URL from storage (logos are now private/secured, use signed URLs)
            console.log('Loading secured logo from storage in App.tsx:', {
              bucket: logoFile.bucket,
              path: logoFile.path,
              isPublic: logoFile.is_public,
              secured: logoFile.metadata?.secured
            });
            
            const logoUrl = await getFileUrl(
              logoFile.bucket as any,
              logoFile.path,
              false // Private file, use signed URL (logos are now secured)
            );
            
            if (logoUrl) {
              console.log('Loaded logo URL in App.tsx:', logoUrl);
              setSystemLogo(logoUrl);
            } else {
              console.warn('Failed to get logo URL from storage, using stored value');
              // Fallback to stored URL
              const logoValue = data.system_logo ?? "";
              if (logoValue && (logoValue.startsWith('http') || logoValue.startsWith('https'))) {
                console.log('Using stored logo URL as fallback:', logoValue);
                setSystemLogo(logoValue);
              }
            }
          } else {
            // No file in storage, use stored value
            const logoValue = data.system_logo ?? "";
            if (logoValue && (logoValue.startsWith('http') || logoValue.startsWith('https'))) {
              console.log('Using stored logo URL (no file in storage):', logoValue);
              setSystemLogo(logoValue);
            }
          }
        }
      } catch (error) {
        console.error('Error loading branding on app start:', error);
      }
    };

    // Only load branding if user is logged in
    if (isLoggedIn) {
      void loadBranding();
    }
  }, [isLoggedIn]);

  // Load user profile picture
  const loadUserProfilePicture = useCallback(async (forceRefresh = false) => {
    if (!currentUserId) return;

    try {
      // First, try to get from file storage
      const files = await getFilesByOwner(currentUserId, 'user', FILE_CATEGORIES.PROFILE_PICTURE);
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
      try {
        const { data: systemUser, error: systemUserError } = await supabase
          .from('system_users')
          .select('employee_id')
          .eq('user_id', currentUserId)
          .single();

        if (systemUserError) {
          // Log errors for debugging but don't show to user
          // 406 errors typically have code 'PGRST116' or similar
          if (systemUserError.code === 'PGRST116' || systemUserError.message?.includes('406')) {
            console.debug('System user query failed (possibly RLS or format issue):', systemUserError.message);
          } else {
            console.debug('System user query error:', systemUserError.message);
          }
          // Continue to next fallback or set null
        } else if (systemUser?.employee_id) {
          const { data: employee, error: employeeError } = await supabase
            .from('employees')
            .select('profile_image')
            .eq('employee_id', systemUser.employee_id)
            .single();

          if (employeeError) {
            console.debug('Employee query error:', employeeError.message);
          } else if (employee?.profile_image) {
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
        }
      } catch (employeeError) {
        // Silently fail - employee might not exist
        console.debug('No employee record found for profile picture fallback:', employeeError);
      }

      // No picture found
      setUserProfilePicture(null);
    } catch (error) {
      console.error('Error loading user profile picture:', error);
      // Silently fail - don't show error to user
      setUserProfilePicture(null);
    }
  }, [currentUserId]);

  useEffect(() => {
    if (currentUserId) {
      loadUserProfilePicture();
    } else {
      setUserProfilePicture(null);
    }
  }, [currentUserId, loadUserProfilePicture]);

  // Refresh profile picture when navigating away from profile page (in case user updated it)
  useEffect(() => {
    if (currentPage !== 'profile' && currentUserId) {
      // Small delay to ensure any profile updates are saved
      const timer = setTimeout(() => {
        loadUserProfilePicture();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [currentPage, currentUserId, loadUserProfilePicture]);

  // Listen for profile picture updates
  useEffect(() => {
    const handleProfilePictureUpdate = (_event?: CustomEvent) => {
      if (currentUserId) {
        // Force refresh to bypass cache
        loadUserProfilePicture(true);
      }
    };

    window.addEventListener('profilePictureUpdated', handleProfilePictureUpdate as EventListener);
    return () => {
      window.removeEventListener('profilePictureUpdated', handleProfilePictureUpdate as EventListener);
    };
  }, [currentUserId, loadUserProfilePicture]);

  useEffect(() => {
    if (!isLoggedIn) return;
    if (hasPermission(permissions, currentPage, "view")) return;

    const firstAccessible = navigationSections
      .flatMap((section) => section.items)
      .find((item) => hasPermission(permissions, item.id, "view"));

    if (firstAccessible) {
      setCurrentPage(firstAccessible.id);
      const parentSection = navigationSections.find((section) =>
        section.items.some((item) => item.id === firstAccessible.id)
      );
      if (parentSection && !openSections.includes(parentSection.section)) {
        setOpenSections((prev) => [...prev, parentSection.section]);
      }
      return;
    }

    if (hasPermission(permissions, "profile", "view")) {
      setCurrentPage("profile");
    }
  }, [permissions, currentPage, isLoggedIn, openSections]);

  // Auto-open the section when navigating to a page
  // Prefetch component on hover for better performance
  const prefetchComponent = useCallback((pageId: Page) => {
    // Dynamic import based on pageId to avoid creating large object upfront
    let importPromise: Promise<any> | null = null;
    
    switch (pageId) {
      case "dashboard": importPromise = import("./components/Dashboard"); break;
      case "customers": importPromise = import("./components/Customers"); break;
      case "contracts": importPromise = import("./components/Contracts"); break;
      case "visits": importPromise = import("./components/Visits"); break;
      case "payments": importPromise = import("./components/Payments"); break;
      case "representatives": importPromise = import("./components/Representatives"); break;
      case "support": importPromise = import("./components/Support"); break;
      case "leads": importPromise = import("./components/Leads"); break;
      case "settings": importPromise = import("./components/Settings"); break;
      case "quotations": importPromise = import("./components/QuotationsUpdated"); break;
      case "calendar": importPromise = import("./components/CalendarReminders"); break;
      case "analytics": importPromise = import("./components/Analytics"); break;
      case "statements": importPromise = import("./components/CustomerStatement"); break;
      case "templates": importPromise = import("./components/Templates"); break;
      case "invoices": importPromise = import("./components/Invoices"); break;
      case "employees": importPromise = import("./components/Employees"); break;
      case "payroll": importPromise = import("./components/Payroll"); break;
      case "expenses": importPromise = import("./components/Expenses"); break;
      case "purchases": importPromise = import("./components/Purchases"); break;
      case "monthlyVisits": importPromise = import("./components/MonthlyVisits"); break;
      case "reports": importPromise = import("./components/Reports"); break;
      case "leaves": importPromise = import("./components/Leaves"); break;
      case "employeeRequests": importPromise = import("./components/EmployeeRequests"); break;
      case "profile": importPromise = import("./components/Profile"); break;
      case "inventory":
      case "manufacturing":
      case "returns":
      case "suppliers": importPromise = import("./components/InventoryManufacturingTabs"); break;
      case "platformOrders": importPromise = import("./components/PlatformOrders"); break;
      case "platformCustomers": importPromise = import("./components/PlatformCustomers"); break;
      case "marketing": importPromise = import("./components/Marketing"); break;
      case "vat": importPromise = import("./components/VAT"); break;
      case "myworkspace": importPromise = import("./components/MyWorkspace"); break;
      case "historyLog":
      case "journalEntries": importPromise = import("./components/HistoryLog"); break;
      case "custody": importPromise = import("./components/Custody"); break;
      case "assets": importPromise = import("./components/Assets"); break;
      case "attendanceSheet": importPromise = import("./components/AttendanceSheet"); break;
      default: return;
    }
    
    if (importPromise) {
      // Prefetch in the background
      importPromise.catch(() => {
        // Silently fail - prefetching is optional
      });
    }
  }, []);

  const handlePageChange = (pageId: Page) => {
    if (!hasPermission(permissions, pageId, "view")) {
      toast.error("You don't have permission to access this section.");
      return;
    }
    setCurrentPage(pageId);
    
    // Find which section this page belongs to and open it
    const section = navigationSections.find(s => 
      s.items.some(item => item.id === pageId)
    );
    
    if (section && !openSections.includes(section.section)) {
      setOpenSections(prev => [...prev, section.section]);
    }
  };

  const handleLogout = () => {
    setIsLoggedIn(false);
    setCurrentUser("");
    setCurrentUserEmail("");
    setCurrentUserId("");
    setUserRole("");
    setCurrentPage("dashboard");
    setPermissions({} as ResolvedPermissions);
    localStorage.removeItem('auth_user');
    localStorage.removeItem('current_page');
    // Increment login key to force Login component remount and clear form fields
    setLoginKey(prev => prev + 1);
  };

  const addActivity = (activity: Omit<Activity, "id" | "timestamp">) => {
    const newActivity: Activity = {
      ...activity,
      id: Date.now(),
      timestamp: new Date().toISOString(),
    };
    setActivities([newActivity, ...activities]);
  };

  const upsertVisitReminder = (
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
  ) => {
    setReminders((prev) => {
      const existingIndex = prev.findIndex((reminder) => reminder.relatedVisitId === visitId);
      const completedAt = payload.status === "completed" ? new Date().toISOString() : undefined;

      if (existingIndex >= 0) {
        const updated = {
          ...prev[existingIndex],
          title: payload.title,
          description: payload.description ?? prev[existingIndex].description,
          date: payload.date,
          time: payload.time,
          customer: payload.customer ?? prev[existingIndex].customer,
          status: payload.status,
          priority: payload.priority ?? prev[existingIndex].priority,
          completedAt,
          relatedVisitId: visitId,
        } satisfies Reminder;

        const next = [...prev];
        next[existingIndex] = updated;
        return next;
      }

      const newReminder: Reminder = {
        id: Date.now(),
        title: payload.title,
        description: payload.description ?? "",
        date: payload.date,
        time: payload.time,
        type: "visit",
        priority: payload.priority ?? "medium",
        status: payload.status,
        customer: payload.customer,
        completedAt,
        relatedVisitId: visitId,
      };

      return [newReminder, ...prev];
    });
  };

  const removeVisitReminder = (visitId: string) => {
    setReminders((prev) => prev.filter((reminder) => reminder.relatedVisitId !== visitId));
  };

  const renderWithGuard = useCallback((pageId: Page, component: ReactNode) =>
    hasPermission(permissions, pageId, "view") ? component : <PermissionDenied page={pageId} />,
    [permissions]
  );

  const renderPage = useCallback(() => {
    switch (currentPage) {
      case "dashboard":
        return renderWithGuard("dashboard", <Dashboard reminders={reminders} activities={activities} />);
      case "myworkspace":
        return renderWithGuard("myworkspace", <MyWorkspace />);
      case "analytics":
        return renderWithGuard("analytics", <Analytics />);
      case "calendar":
        return renderWithGuard(
          "calendar",
          <CalendarReminders
            reminders={reminders}
            setReminders={setReminders}
            onActivityAdd={addActivity}
            currentPermissions={permissions}
          />,
        );
      case "customers":
        return renderWithGuard("customers", <Customers />);
      case "leads":
        return renderWithGuard("leads", <Leads />);
      case "quotations":
        return renderWithGuard(
          "quotations",
          <Quotations
            systemLogo={systemLogo}
            systemNameAr={systemNameAr}
            systemNameEn={systemNameEn}
            onConvertToInvoice={(quotationData) => {
              setPendingQuotationData(quotationData);
              handlePageChange("invoices");
            }}
          />,
        );
      case "invoices":
        return renderWithGuard(
          "invoices",
          <Invoices
            pendingQuotationData={pendingQuotationData}
            onQuotationDataConsumed={() => setPendingQuotationData(null)}
          />,
        );
      case "contracts":
        return renderWithGuard(
          "contracts",
          <Contracts systemLogo={systemLogo} systemNameAr={systemNameAr} systemNameEn={systemNameEn} />,
        );
      case "visits":
        return renderWithGuard(
          "visits",
          <Visits
            onActivityAdd={addActivity}
            onVisitReminderUpsert={upsertVisitReminder}
            onVisitReminderRemove={removeVisitReminder}
          />,
        );
      case "monthlyVisits":
        return renderWithGuard("monthlyVisits", <MonthlyVisits />);
      case "payments":
        return renderWithGuard("payments", <Payments />);
      case "statements":
        return renderWithGuard(
          "statements",
          <CustomerStatement
            systemLogo={systemLogo}
            systemNameAr={systemNameAr}
            systemNameEn={systemNameEn}
          />,
        );
      case "templates":
        return renderWithGuard("templates", <Templates />);
      case "employees":
        return renderWithGuard("employees", <Employees />);
      case "payroll":
        return renderWithGuard("payroll", <Payroll />);
      case "expenses":
        return renderWithGuard("expenses", <Expenses />);
      case "purchases":
        return renderWithGuard("purchases", <Purchases />);
      case "inventory":
        return renderWithGuard("inventory", <InventoryManufacturingTabs initialTab="inventory" />);
      case "manufacturing":
        return renderWithGuard("manufacturing", <InventoryManufacturingTabs initialTab="manufacturing" />);
      case "returns":
        return renderWithGuard("returns", <InventoryManufacturingTabs initialTab="returns" />);
      case "suppliers":
        return renderWithGuard("suppliers", <InventoryManufacturingTabs initialTab="suppliers" />);
      case "platformOrders":
        return renderWithGuard("platformOrders", <PlatformOrders />);
      case "platformCustomers":
        return renderWithGuard("platformCustomers", <PlatformCustomers />);
      case "marketing":
        return renderWithGuard("marketing", <Marketing />);
      case "vat":
        return renderWithGuard("vat", <VAT />);
      case "reports":
        return renderWithGuard("reports", <Reports />);
      case "leaves":
        return renderWithGuard("leaves", <Leaves />);
      case "employeeRequests":
        return renderWithGuard("employeeRequests", <EmployeeRequests />);
      case "attendanceSheet":
        return renderWithGuard("attendanceSheet", <AttendanceSheet />);
      case "representatives":
        return renderWithGuard("representatives", <Representatives />);
      case "support":
        return renderWithGuard("support", <Support />);
      case "profile":
        return renderWithGuard(
          "profile",
          <Profile
            currentUser={currentUser}
            userRole={userRole}
            userEmail={currentUserEmail}
            userId={currentUserId}
            recentActivities={activities.slice(0, 10)}
            onUpdateUser={(data) => {
              setCurrentUser(data.fullName);
              setCurrentUserEmail(data.email);
              addActivity({
                type: "system",
                action: "updated",
                title: "Profile Updated",
                description: `${data.fullName} updated their profile information`,
                user: data.fullName,
                userRole: userRole,
              });
              const stored = localStorage.getItem('auth_user');
              if (stored) {
                try {
                  const parsed = JSON.parse(stored);
                  parsed.full_name = data.fullName;
                  parsed.email = data.email;
                  localStorage.setItem('auth_user', JSON.stringify(parsed));
                } catch (error) {
                  console.error('Failed to update auth user storage', error);
                }
              }
            }}
          />
        );
      case "custody":
        return renderWithGuard("custody", <Custody />);
      case "assets":
        return renderWithGuard("assets", <Assets />);
      case "historyLog":
        return renderWithGuard("historyLog", <HistoryLog />);
      case "settings":
        return renderWithGuard(
          "settings",
          <SettingsPage 
            systemName={systemName}
            setSystemName={setSystemName}
            systemSubtitle={systemSubtitle}
            setSystemSubtitle={setSystemSubtitle}
            systemLogo={systemLogo}
            setSystemLogo={setSystemLogo}
            systemNameAr={systemNameAr}
            setSystemNameAr={setSystemNameAr}
            systemNameEn={systemNameEn}
            setSystemNameEn={setSystemNameEn}
            currentPermissions={permissions}
            currentUserEmail={currentUserEmail}
          />
        );
      default:
        return renderWithGuard("dashboard", <Dashboard reminders={reminders} activities={activities} />);
    }
  }, [currentPage, renderWithGuard, reminders, activities, systemLogo, systemNameAr, systemNameEn, pendingQuotationData, addActivity, upsertVisitReminder, removeVisitReminder, currentUser, userRole, currentUserEmail, currentUserId, permissions]);

  // Show login page if not logged in
  // Auth state is initialized synchronously from localStorage, so no flash should occur
  if (!isLoggedIn) {
    return <Login key={loginKey} onLogin={handleLogin} />;
  }

  // Get user initials for avatar
  const getUserInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Sidebar for desktop */}
      <aside className={`fixed left-0 top-0 z-40 h-screen border-r border-border bg-card transition-all duration-300 lg:translate-x-0 hidden lg:block shadow-sm ${
        isSidebarCollapsed ? 'w-16' : 'w-64'
      }`}>
        <div className="flex h-full flex-col">
          <div className={`flex items-center border-b border-border py-5 ${isSidebarCollapsed ? 'px-3 justify-center' : 'px-6 gap-3'}`}>
            {systemLogo ? (
              <ImageWithFallback
                src={systemLogo}
                alt="System Logo"
                className="h-10 w-10 object-contain rounded-lg"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 shadow-lg shadow-purple-500/50">
                <svg
                  className="h-6 w-6 text-white"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            )}
            {!isSidebarCollapsed && (
              <div>
                <h1 className="text-base font-semibold">{systemName}</h1>
                <p className="text-xs text-muted-foreground">{systemSubtitle}</p>
              </div>
            )}
          </div>

          <nav className="flex-1 p-3 overflow-y-auto">
            <div className={isSidebarCollapsed ? "space-y-1" : "space-y-2"}>
              {navigationSections.map((section) => {
                const SectionIcon = section.icon;
                const visibleItems = section.items.filter((item) =>
                  hasPermission(permissions, item.id, "view")
                );
                if (visibleItems.length === 0) {
                  return null;
                }
                const isSectionOpen = openSections.includes(section.section);
                
                return (
                  <div key={section.section}>
                    {!isSidebarCollapsed ? (
                      <div className="space-y-1">
                        <button
                          onClick={() => {
                            setOpenSections(prev => 
                              prev.includes(section.section) 
                                ? prev.filter(s => s !== section.section)
                                : [...prev, section.section]
                            );
                          }}
                          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent/50 transition-all uppercase tracking-wide"
                        >
                          <SectionIcon className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="flex-1 text-left">{section.section}</span>
                          <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${isSectionOpen ? "rotate-90" : ""}`} />
                        </button>
                        
                        {isSectionOpen && (
                          <div className="space-y-0.5 ml-2">
                            {visibleItems.map((item) => {
                              const Icon = item.icon;
                              const isActive = currentPage === item.id;
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => {
                                    handlePageChange(item.id);
                                    setIsSidebarOpen(false);
                                  }}
                                  onMouseEnter={() => prefetchComponent(item.id)}
                                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                                    isActive
                                      ? "bg-purple-600 text-white shadow-sm"
                                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                  }`}
                                >
                                  <Icon className="h-4 w-4 flex-shrink-0" />
                                  <span className="font-medium">{item.name}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ) : (
                      // Collapsed view - show only icons
                      <div className="space-y-1">
                        {visibleItems.map((item) => {
                          const Icon = item.icon;
                          const isActive = currentPage === item.id;
                          return (
                            <button
                              key={item.id}
                              onClick={() => {
                                handlePageChange(item.id);
                                setIsSidebarOpen(false);
                              }}
                              onMouseEnter={() => prefetchComponent(item.id)}
                              className={`flex w-full items-center justify-center rounded-lg p-2.5 transition-all ${
                                isActive
                                  ? "bg-purple-600 text-white shadow-sm"
                                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                              }`}
                              title={item.name}
                            >
                              <Icon className="h-5 w-5 flex-shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </nav>

          <div className="border-t border-border p-4">
            <div className="space-y-2">
              {!isSidebarCollapsed ? (
                <div className="px-3 py-2 bg-muted/50 rounded-lg">
                  <p className="text-xs text-muted-foreground">Logged in as</p>
                  <p className="text-sm font-medium truncate">{currentUser}</p>
                  <p className="text-xs text-muted-foreground">{userRole}</p>
                </div>
              ) : (
                <div className="flex justify-center">
                  <Avatar className="h-8 w-8">
                    {userProfilePicture ? (
                      <AvatarImage src={userProfilePicture} alt={currentUser} />
                    ) : null}
                    <AvatarFallback className="bg-gradient-to-br from-purple-600 to-purple-700 text-white text-xs">
                      {getUserInitials(currentUser)}
                    </AvatarFallback>
                  </Avatar>
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                className="w-full"
              >
                {isSidebarCollapsed ? (
                  <PanelLeft className="h-4 w-4" />
                ) : (
                  <>
                    <PanelLeftClose className="h-4 w-4 mr-2" />
                    <span className="text-xs">Collapse</span>
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setIsSidebarOpen(false)}
          />
          <aside className="fixed left-0 top-0 h-screen w-64 border-r border-border bg-card shadow-lg">
            <div className="flex h-full flex-col">
              <div className="flex items-center justify-between border-b border-border px-6 py-5">
                <div className="flex items-center gap-3">
                  {systemLogo ? (
                    <img 
                      src={systemLogo} 
                      alt="System Logo" 
                      className="h-10 w-10 object-contain rounded-lg"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-purple-700 shadow-lg shadow-purple-500/50">
                      <svg
                        className="h-6 w-6 text-white"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                  )}
                  <div>
                    <h1 className="text-base font-semibold">{systemName}</h1>
                    <p className="text-xs text-muted-foreground">{systemSubtitle}</p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setIsSidebarOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <nav className="flex-1 space-y-2 p-3 overflow-y-auto">
                {navigationSections.map((section) => {
                  const SectionIcon = section.icon;
                  const visibleItems = section.items.filter((item) =>
                    hasPermission(permissions, item.id, "view")
                  );
                  if (visibleItems.length === 0) {
                    return null;
                  }
                  const isSectionOpen = openSections.includes(section.section);
                  
                  return (
                    <div key={section.section} className="space-y-1">
                      <button
                        onClick={() => {
                          setOpenSections(prev => 
                            prev.includes(section.section) 
                              ? prev.filter(s => s !== section.section)
                              : [...prev, section.section]
                          );
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold text-muted-foreground hover:bg-accent/50 transition-all uppercase tracking-wide"
                      >
                        <SectionIcon className="h-3.5 w-3.5" />
                        <span className="flex-1 text-left">{section.section}</span>
                        <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isSectionOpen ? "rotate-90" : ""}`} />
                      </button>
                      
                      {isSectionOpen && (
                        <div className="space-y-0.5 ml-2">
                          {visibleItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = currentPage === item.id;
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  handlePageChange(item.id);
                                  setIsSidebarOpen(false);
                                }}
                                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                                  isActive
                                    ? "bg-purple-600 text-white shadow-sm"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                                }`}
                              >
                                <Icon className="h-4 w-4" />
                                <span className="font-medium">{item.name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </nav>
            </div>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className={`transition-all duration-300 ${isSidebarCollapsed ? 'lg:ml-16' : 'lg:ml-64'}`}>
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 shadow-sm">
          <div className="flex items-center justify-between gap-4 px-4 py-3 lg:px-6">
            <div className="flex items-center gap-4 flex-1">
              <Button
                variant="ghost"
                size="icon"
                className="lg:hidden"
                onClick={() => setIsSidebarOpen(true)}
              >
                <Menu className="h-5 w-5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="hidden lg:flex"
                onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              >
                {isSidebarCollapsed ? (
                  <PanelLeft className="h-5 w-5" />
                ) : (
                  <PanelLeftClose className="h-5 w-5" />
                )}
              </Button>
              <div>
                <h1 className="text-lg font-semibold">{systemName}</h1>
                <p className="text-xs text-muted-foreground hidden sm:block">{systemSubtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                className="relative"
                onClick={() => handlePageChange("calendar")}
              >
                <Bell className="h-5 w-5" />
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-purple-600 ring-2 ring-card"></span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-3 pl-2 pr-2 h-auto">
                    <div className="hidden lg:block text-right">
                      <div className="text-sm font-medium">{currentUser}</div>
                      <div className="text-xs text-muted-foreground">{userRole}</div>
                    </div>
                    <Avatar className="h-9 w-9">
                      {userProfilePicture ? (
                        <AvatarImage src={userProfilePicture} alt={currentUser} />
                      ) : null}
                      <AvatarFallback className="bg-gradient-to-br from-purple-600 to-purple-700 text-white text-sm">
                        {getUserInitials(currentUser)}
                      </AvatarFallback>
                    </Avatar>
                    <ChevronDown className="h-4 w-4 text-muted-foreground hidden lg:block" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>
                    <div>
                      <p>{currentUser}</p>
                      <p className="text-xs text-muted-foreground font-normal">{userRole}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handlePageChange("profile")}>
                    <User className="mr-2 h-4 w-4" />
                    <span>My Profile</span>
                  </DropdownMenuItem>
                  {hasPermission(permissions, "settings", "view") && (
                    <DropdownMenuItem onClick={() => handlePageChange("settings")}>
                      <Settings className="mr-2 h-4 w-4" />
                      <span>Settings</span>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:text-destructive">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Logout / تسجيل خروج</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        <main className="p-4 lg:p-6">
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[400px]">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            </div>
          }>
            {renderPage()}
          </Suspense>
        </main>
      </div>
      <Toaster position="bottom-right" />
    </div>
  );
}
