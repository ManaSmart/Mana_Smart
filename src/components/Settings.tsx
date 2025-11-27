import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Switch } from "./ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "./ui/dialog";
import { Badge } from "./ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";
import {
  Settings as SettingsIcon,
  Users,
  Shield,
  Plus,
  Edit,
  Trash2,
  Save,
  Building2,
  Mail,
  Phone,
  MapPin,
  Upload,
  X,
  Image as ImageIcon,
  CheckSquare,
  Square,
  Loader2,
  Database,
} from "lucide-react";
import { toast } from "sonner";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import { useAppDispatch, useAppSelector } from "../redux-toolkit/hooks";
import { thunks, selectors } from "../redux-toolkit/slices";
import { sha256Hex } from "../lib/hash";
import { supabase } from "../lib/supabaseClient";
import type { Employees } from "../../supabase/models/employees";
import type { Roles } from "../../supabase/models/roles";
import type { SystemUsers } from "../../supabase/models/system_users";
import type { CompanyBranding } from "../../supabase/models/company_branding";
import type { SystemSettings } from "../../supabase/models/system_settings";
import { uploadFile, getFileUrl, deleteFile, getFilesByOwner } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";
import { validateFile } from "../lib/storage";
import { uploadLogoToS3WithFixedPath } from "../lib/s3Storage";
import { loadLogoWithAllFallbacks, downloadLogoToLocalBackup, clearLocalLogoBackup } from "../lib/logoManager";
import { ACCESS_AREAS, ACCESS_AREA_MAP } from "../config/access-areas";
import type { AccessAction } from "../config/access-areas";
import type { PageId } from "../config/page-map";
import { BackupSettings } from "./BackupSettings";
import {
  normalizePermissions,
  hasPermission,
  permissionSummary,
  mergePermission,
  removePermission,
  type PermissionMap,
  type ResolvedPermissions,
} from "../lib/permissions";

type NormalizedRole = Roles & { resolvedPermissions: ResolvedPermissions };

interface AddUserFormValues {
  employeeId?: string;
  name: string;
  email: string;
  phone?: string;
  department?: string;
  position?: string;
  roleId: string;
  roleName: string;
  password: string;
}

interface AddRoleFormValues {
  role_name: string;
  permissions: ResolvedPermissions;
}

const DEFAULT_SUPERUSER_EMAIL = "admin@mana-smart.com";
const DEFAULT_SUPERUSER_PASSWORD = "ChangeMeNow!123";
const DEFAULT_SUPERUSER_NAME = "Super Administrator";

interface SettingsProps {
  systemName: string;
  setSystemName: (name: string) => void;
  systemSubtitle: string;
  setSystemSubtitle: (subtitle: string) => void;
  systemLogo: string;
  setSystemLogo: (logo: string) => void;
  systemNameAr: string;
  setSystemNameAr: (name: string) => void;
  systemNameEn: string;
  setSystemNameEn: (name: string) => void;
  currentPermissions: ResolvedPermissions;
  currentUserEmail: string;
}

export function Settings({ 
  systemName, 
  setSystemName, 
  systemSubtitle, 
  setSystemSubtitle,
  systemLogo,
  setSystemLogo,
  systemNameAr,
  setSystemNameAr,
  systemNameEn,
  setSystemNameEn,
  currentPermissions,
  currentUserEmail,
}: SettingsProps) {
  const dispatch = useAppDispatch();
  const dbRoles = useAppSelector(selectors.roles.selectAll) as Roles[];
  const rolesLoading = useAppSelector(selectors.roles.selectLoading);
  const dbEmployees = useAppSelector(selectors.employees.selectAll) as Employees[];
  const employeesLoading = useAppSelector(selectors.employees.selectLoading);
  const dbSystemUsers = useAppSelector(selectors.system_users.selectAll) as SystemUsers[];
  const systemUsersLoading = useAppSelector(selectors.system_users.selectLoading);
  const canManageRoles = hasPermission(currentPermissions, "settings", "update");

  useEffect(() => {
    dispatch(thunks.roles.fetchAll(undefined));
    dispatch(thunks.employees.fetchAll(undefined));
    dispatch(thunks.system_users.fetchAll(undefined));
  }, [dispatch]);
  const [isAddUserOpen, setIsAddUserOpen] = useState(false);
  const [isAddAdminOpen, setIsAddAdminOpen] = useState(false);
  const [isAddRoleOpen, setIsAddRoleOpen] = useState(false);
  const [isEditRoleOpen, setIsEditRoleOpen] = useState(false);
  const [roleBeingEdited, setRoleBeingEdited] = useState<NormalizedRole | null>(null);
  const [isEditUserOpen, setIsEditUserOpen] = useState(false);
  const [userBeingEdited, setUserBeingEdited] = useState<{ user: SystemUsers; employee: Employees | undefined; role: NormalizedRole | undefined } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<{ user: SystemUsers; employee: Employees | undefined; role: NormalizedRole | undefined } | null>(null);
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const normalizedRoles = useMemo<NormalizedRole[]>(() => {
    // Calculate user count for each role dynamically
    const roleUserCounts = new Map<string, number>();
    dbSystemUsers.forEach((user) => {
      if (user.role_id) {
        const currentCount = roleUserCounts.get(user.role_id) || 0;
        roleUserCounts.set(user.role_id, currentCount + 1);
      }
    });

    return dbRoles.map((role) => ({
      ...role,
      resolvedPermissions: normalizePermissions(role.permissions),
      users_count: roleUserCounts.get(role.role_id) || 0, // Override with actual count
    }));
  }, [dbRoles, dbSystemUsers]);

  const usersWithRelations = useMemo(() => {
    const employeeById = new Map(dbEmployees.map((emp) => [emp.employee_id, emp]));
    const roleById = new Map(normalizedRoles.map((role) => [role.role_id, role]));
    return dbSystemUsers.map((user) => {
      const employee = user.employee_id ? employeeById.get(user.employee_id) : undefined;
      const role = user.role_id ? roleById.get(user.role_id) : undefined;
      return { user, employee, role };
    });
  }, [dbEmployees, dbSystemUsers, normalizedRoles]);

  const isDataLoading = rolesLoading || employeesLoading || systemUsersLoading;
  const superUserEnsuredRef = useRef(false);

  useEffect(() => {
    if (superUserEnsuredRef.current) {
      return;
    }
    if (rolesLoading || systemUsersLoading) {
      return;
    }
    if (normalizedRoles.length === 0) {
      return;
    }
    if (currentUserEmail !== DEFAULT_SUPERUSER_EMAIL) {
      return;
    }

    const superUsers = dbSystemUsers.filter((user) => {
      const role = normalizedRoles.find((r) => r.role_id === user.role_id);
      return role?.resolvedPermissions === "all";
    });

    const placeholderSuperUser = superUsers.find((user) => {
      return user.email === "admin@example.com" || !user.password_hash || user.password_hash === "hash_here";
    });

    const defaultEmailSuperUsers = superUsers.filter((user) => user.email === DEFAULT_SUPERUSER_EMAIL);
    const primaryCandidate = placeholderSuperUser ?? defaultEmailSuperUsers[0] ?? superUsers[0];

    const ensureSuperUser = async () => {
      try {
        superUserEnsuredRef.current = true;
        let targetRole = normalizedRoles.find((role) => role.resolvedPermissions === "all");
        if (!targetRole) {
          const createdRole = await dispatch(
            thunks.roles.createOne({
              role_name: "Super Admin",
              permissions: "all",
              users_count: 0,
            } as any)
          ).unwrap();
          targetRole = {
            ...(createdRole as Roles),
            resolvedPermissions: "all" as ResolvedPermissions,
          };
          dispatch(thunks.roles.fetchAll(undefined));
        }

        if (!targetRole) {
          superUserEnsuredRef.current = false;
          toast.error('Unable to ensure a super admin role');
          return;
        }

        if (primaryCandidate) {
          const updates: Partial<SystemUsers> = {
            status: 'active',
            role_id: targetRole.role_id,
          };
          if (!primaryCandidate.full_name) {
            updates.full_name = DEFAULT_SUPERUSER_NAME;
          }
          if (primaryCandidate.email !== DEFAULT_SUPERUSER_EMAIL) {
            updates.email = DEFAULT_SUPERUSER_EMAIL;
          }
          if (!primaryCandidate.password_hash || primaryCandidate.password_hash === 'hash_here') {
            updates.password_hash = await sha256Hex(DEFAULT_SUPERUSER_PASSWORD);
          }
          if (Object.keys(updates).length > 0) {
            await dispatch(
              thunks.system_users.updateOne({ id: primaryCandidate.user_id, values: updates as any })
            ).unwrap();
            toast.success(`Default superuser credentials reset (${DEFAULT_SUPERUSER_EMAIL}).`);
          }
        }

        const duplicateDefaults = superUsers.filter((user) => {
          if (!primaryCandidate) return false;
          if (user.user_id === primaryCandidate.user_id) return false;
          return user.email === DEFAULT_SUPERUSER_EMAIL && (user.status === 'active' || user.status === null);
        });

        for (const duplicate of duplicateDefaults) {
          const updates: Partial<SystemUsers> = {
            status: 'inactive',
            email: `archived+${duplicate.user_id}@example.local`,
          };
          await dispatch(
            thunks.system_users.updateOne({ id: duplicate.user_id, values: updates as any })
          ).unwrap();
        }

        if (!primaryCandidate) {
          const password_hash = await sha256Hex(DEFAULT_SUPERUSER_PASSWORD);
          await dispatch(
            thunks.system_users.createOne({
              email: DEFAULT_SUPERUSER_EMAIL,
              full_name: DEFAULT_SUPERUSER_NAME,
              password_hash,
              status: 'active',
              role_id: targetRole.role_id,
              employee_id: null,
              phone_number: null,
            } as any)
          ).unwrap();
          toast.success(`Default superuser created (${DEFAULT_SUPERUSER_EMAIL}). Remember to change the password after first login.`);
        }

        if (primaryCandidate || duplicateDefaults.length > 0) {
          dispatch(thunks.system_users.fetchAll(undefined));
        }
      } catch (error: any) {
        superUserEnsuredRef.current = false;
        toast.error(error.message || 'Failed to ensure default superuser');
      }
    };

    ensureSuperUser();
  }, [rolesLoading, systemUsersLoading, normalizedRoles, dbSystemUsers, dispatch, currentUserEmail]);

  // Local state for editing
  const [localSystemName, setLocalSystemName] = useState(systemName);
  const [localSystemSubtitle, setLocalSystemSubtitle] = useState(systemSubtitle);
  const [localSystemLogo, setLocalSystemLogo] = useState(systemLogo);
  const [localSystemNameAr, setLocalSystemNameAr] = useState(systemNameAr);
  const [localSystemNameEn, setLocalSystemNameEn] = useState(systemNameEn);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const stampInputRef = useRef<HTMLInputElement>(null);
  const [brandingId, setBrandingId] = useState<string | null>(null);
  const [brandingLoading, setBrandingLoading] = useState(true);
  const [brandingSaving, setBrandingSaving] = useState(false);
  const [logoFileId, setLogoFileId] = useState<string | null>(null);
  const [stampFileId, setStampFileId] = useState<string | null>(null);
  const [localSystemStamp, setLocalSystemStamp] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingStamp, setUploadingStamp] = useState(false);
  const [, setLogoLoading] = useState(true); // Track logo loading state

  // Company settings
  const [companyName, setCompanyName] = useState("Scent Management Company");
  const [companyEmail, setCompanyEmail] = useState("info@scentmanagement.com");
  const [companyPhone, setCompanyPhone] = useState("+966 50 123 4567");
  const [companyAddress, setCompanyAddress] = useState("Riyadh, Saudi Arabia");

  // System settings
  const [emailNotifications, setEmailNotifications] = useState(true);
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [autoBackup, setAutoBackup] = useState(true);
  const [twoFactorAuth, setTwoFactorAuth] = useState(false);
  const [systemSettingsId, setSystemSettingsId] = useState<string | null>(null);
  const [systemSettingsLoading, setSystemSettingsLoading] = useState(true);
  const [systemSettingsSaving, setSystemSettingsSaving] = useState(false);

  useEffect(() => {
    const loadBranding = async () => {
      setBrandingLoading(true);
      setLogoLoading(true); // Start logo loading
      try {
        const { data, error } = await supabase
          .from("company_branding")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<CompanyBranding>();

        if (error) {
          // PGRST116 means no rows found - this is expected if branding hasn't been set up yet
          if (error.code !== "PGRST116") {
            toast.error(error.message ?? "Failed to load branding settings");
          }
          setLogoLoading(false);
          return;
        }
        
        if (data) {
          setBrandingId(data.branding_id);
          setLocalSystemName(data.system_sidebar_name ?? "");
          setLocalSystemSubtitle(data.system_sidebar_subtitle ?? "");
          setLocalSystemNameAr(data.company_name_ar ?? "");
          setLocalSystemNameEn(data.company_name_en ?? "");
          setCompanyName(data.company_name_en ?? "");
          setCompanyEmail(data.company_email ?? "");
          setCompanyPhone(data.company_phone ?? "");
          setCompanyAddress(data.company_address ?? "");

          setSystemName(data.system_sidebar_name ?? "");
          setSystemSubtitle(data.system_sidebar_subtitle ?? "");
          setSystemNameAr(data.company_name_ar ?? "");
          setSystemNameEn(data.company_name_en ?? "");

          // Fetch branding files first (needed for both logo and stamp)
          const brandingFiles = await getFilesByOwner(data.branding_id, 'branding');

          // Load logo using enhanced logo manager with all fallbacks
          const logoResult = await loadLogoWithAllFallbacks(data.branding_id);
          
          if (logoResult.success && logoResult.url) {
            setLocalSystemLogo(logoResult.url);
            setSystemLogo(logoResult.url);
            
            // Save file metadata ID if available
            if (logoResult.fileMetadata) {
              setLogoFileId(logoResult.fileMetadata.id);
            } else {
              // Try to find file metadata from brandingFiles
              const logoFile = brandingFiles.find(f => f.category === FILE_CATEGORIES.BRANDING_LOGO);
              if (logoFile) {
                setLogoFileId(logoFile.id);
              }
            }
          } else {
            // Fallback to database stored value if available
            const logoValue = data.system_logo ?? "";
            if (logoValue) {
              setLocalSystemLogo(logoValue);
              setSystemLogo(logoValue);
            }
          }
          setLogoLoading(false);

          // Load stamp from file storage
          const stampFile = brandingFiles.find(f => f.category === FILE_CATEGORIES.BRANDING_STAMP);
          if (stampFile) {
            setStampFileId(stampFile.id);
            const stampUrl = await getFileUrl(
              stampFile.bucket as any,
              stampFile.path,
              stampFile.is_public
            );
            if (stampUrl) {
              setLocalSystemStamp(stampUrl);
            }
          }
        }

        // Update system logo state - will be handled by the useEffect below
      } catch (error: any) {
        console.error('Error loading branding:', error);
        toast.error('Failed to load branding settings');
      } finally {
        setBrandingLoading(false);
      }
    };

    void loadBranding();
  }, [
    setSystemLogo,
    setSystemName,
    setSystemSubtitle,
    setSystemNameAr,
    setSystemNameEn,
  ]);

  // Load system settings
  useEffect(() => {
    const loadSystemSettings = async () => {
      setSystemSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from("system_settings")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<SystemSettings>();

        if (error && error.code !== "PGRST116") {
          console.error('Error loading system settings:', error);
          toast.error(error.message ?? "Failed to load system settings");
        } else if (data) {
          setSystemSettingsId(data.setting_id);
          setEmailNotifications(data.email_notifications ?? true);
          setSmsNotifications(data.sms_notifications ?? false);
          setAutoBackup(data.auto_backup ?? true);
          setTwoFactorAuth(data.two_factor_auth ?? false);
        } else {
          // No settings found, use defaults
          setEmailNotifications(true);
          setSmsNotifications(false);
          setAutoBackup(true);
          setTwoFactorAuth(false);
        }
      } catch (error: any) {
        console.error('Error loading system settings:', error);
        toast.error('Failed to load system settings');
      } finally {
        setSystemSettingsLoading(false);
      }
    };

    void loadSystemSettings();
  }, []);

  // Note: Logo loading is handled in the main loadBranding useEffect above
  // This prevents duplicate loading and race conditions that cause errors on first render

  // Update system logo when local logo changes
  useEffect(() => {
    if (localSystemLogo) {
      setSystemLogo(localSystemLogo);
    }
  }, [localSystemLogo, setSystemLogo]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateFile(file, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'], 2 * 1024 * 1024); // 2MB
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploadingLogo(true);
    try {
      // Get current user ID from localStorage (custom auth system)
      const stored = localStorage.getItem('auth_user');
      let currentUserId: string | null = null;
      
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          currentUserId = parsed.user_id || null;
        } catch (e) {
          console.error('Failed to parse auth_user', e);
        }
      }

      if (!currentUserId) {
        throw new Error('User not authenticated');
      }

      // Ensure branding record exists first
      let currentBrandingId = brandingId;
      if (!currentBrandingId) {
        // Create branding record if it doesn't exist
        const { data: newBranding, error: createError } = await supabase
          .from("company_branding")
          .insert({
            system_sidebar_name: localSystemName || "System",
            company_name_ar: localSystemNameAr || "",
            company_name_en: localSystemNameEn || "",
          })
          .select()
          .maybeSingle<CompanyBranding>();

        if (createError || !newBranding) {
          throw new Error('Failed to create branding record');
        }
        currentBrandingId = newBranding.branding_id;
        setBrandingId(currentBrandingId);
      }

      // Delete old logo file metadata if exists (the S3 file will be overwritten automatically)
      if (logoFileId) {
        try {
          await deleteFile(logoFileId);
        } catch (error) {
          console.warn('Failed to delete old logo metadata (non-critical):', error);
        }
      }

      // Upload to S3 using fixed path (allows overwriting)
      const result = await uploadLogoToS3WithFixedPath(
        file,
        currentBrandingId,
        currentUserId
      );

      if (!result.success) {
        throw new Error(result.error || 'Failed to upload logo');
      }

      // Get signed URL from result
      let logoUrl: string | undefined = result.signedUrl;
      
      if (!logoUrl && result.fileMetadata) {
        // If no signed URL in result, fetch it
        logoUrl = await getFileUrl(
          result.fileMetadata.bucket as any,
          result.fileMetadata.path,
          false, // Private file, use signed URL
          604800 // 7 days expiration for logos
        ) ?? undefined;
      }

      // Update local state
      if (result.fileMetadata) {
        setLogoFileId(result.fileMetadata.id);
      }
      
      if (logoUrl) {
        setLocalSystemLogo(logoUrl);
        setSystemLogo(logoUrl);
        
        // Create local backup in background
        downloadLogoToLocalBackup(logoUrl).catch(err => {
          console.warn('Failed to create local backup:', err);
        });
        
        // Save signed URL to database
        try {
          const { error: updateError } = await supabase
            .from("company_branding")
            .update({ system_logo: logoUrl })
            .eq("branding_id", currentBrandingId);
          
          if (updateError) {
            console.error('Error updating logo URL in database:', updateError);
            // Don't fail - logo is uploaded and displayed
          }
        } catch (saveError: any) {
          console.error('Error saving logo URL:', saveError);
          // Don't fail - logo is uploaded and displayed
        }
        
        toast.success("Logo uploaded and saved successfully");
      } else {
        // URL not available, but file is uploaded - try to load with fallback
        const loadResult = await loadLogoWithAllFallbacks(currentBrandingId);
        if (loadResult.success && loadResult.url) {
          setLocalSystemLogo(loadResult.url);
          setSystemLogo(loadResult.url);
          toast.success("Logo uploaded successfully");
        } else {
          toast.warning('Logo uploaded successfully, but URL retrieval is delayed. Please refresh the page.');
        }
      }
    } catch (error: any) {
      console.error('Error uploading logo:', error);
      toast.error(error.message || 'Failed to upload logo');
    } finally {
      setUploadingLogo(false);
      if (logoInputRef.current) {
        logoInputRef.current.value = '';
      }
    }
  };

  const handleStampUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateFile(file, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/svg+xml'], 2 * 1024 * 1024); // 2MB
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    setUploadingStamp(true);
    try {
      // Get current user ID from localStorage (custom auth system)
      const stored = localStorage.getItem('auth_user');
      let currentUserId: string | null = null;
      
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          currentUserId = parsed.user_id || null;
        } catch (e) {
          console.error('Failed to parse auth_user', e);
        }
      }

      if (!currentUserId) {
        throw new Error('User not authenticated');
      }

      // Delete old stamp if exists
      if (stampFileId) {
        await deleteFile(stampFileId);
      }

      // Ensure branding record exists first
      let currentBrandingId = brandingId;
      if (!currentBrandingId) {
        // Create branding record if it doesn't exist
        const { data: newBranding, error: createError } = await supabase
          .from("company_branding")
          .insert({
            system_sidebar_name: localSystemName || "System",
            company_name_ar: localSystemNameAr || "",
            company_name_en: localSystemNameEn || "",
          })
          .select()
          .maybeSingle<CompanyBranding>();

        if (createError || !newBranding) {
          throw new Error('Failed to create branding record');
        }
        currentBrandingId = newBranding.branding_id;
        setBrandingId(currentBrandingId);
      }

      // Upload to storage
      const result = await uploadFile({
        file,
        category: FILE_CATEGORIES.BRANDING_STAMP,
        ownerId: currentBrandingId,
        ownerType: 'branding',
        description: 'Company stamp for documents',
        isPublic: false, // Stamps are private
        userId: currentUserId,
      });

      if (!result.success || !result.fileMetadata) {
        throw new Error(result.error || 'Failed to upload stamp');
      }

      // Get signed URL (stamps are private)
      // Note: For stamps, we store the file metadata ID, not the URL (since signed URLs expire)
      // The URL will be fetched fresh from storage when needed
      setStampFileId(result.fileMetadata.id);
      
      // Get initial URL for preview
      const stampUrl = result.signedUrl || (await getFileUrl(
        result.fileMetadata.bucket as any,
        result.fileMetadata.path,
        result.fileMetadata.is_public,
        3600 // 1 hour expiry
      ));

      if (stampUrl) {
        setLocalSystemStamp(stampUrl);
      }
      
      toast.success("Stamp uploaded successfully");
    } catch (error: any) {
      console.error('Error uploading stamp:', error);
      toast.error(error.message || 'Failed to upload stamp');
    } finally {
      setUploadingStamp(false);
      if (stampInputRef.current) {
        stampInputRef.current.value = '';
      }
    }
  };

  const handleDeleteLogo = async () => {
    if (!logoFileId) {
      // If no file ID, just clear the local state (legacy base64)
      setLocalSystemLogo("");
      setSystemLogo("");
      // Clear localStorage backup even if no file ID
      clearLocalLogoBackup();
      return;
    }

    try {
      const success = await deleteFile(logoFileId);
      if (success) {
        setLocalSystemLogo("");
        setLogoFileId(null);
        setSystemLogo("");
        
        // Clear localStorage backup
        clearLocalLogoBackup();
        
        // Update database
        if (brandingId) {
          await supabase
            .from("company_branding")
            .update({ system_logo: null })
            .eq("branding_id", brandingId);
        }
        
        toast.success("Logo deleted successfully");
      } else {
        throw new Error('Failed to delete logo');
      }
    } catch (error: any) {
      console.error('Error deleting logo:', error);
      toast.error(error.message || 'Failed to delete logo');
    }
  };

  const handleDeleteStamp = async () => {
    if (!stampFileId) {
      setLocalSystemStamp(null);
      return;
    }

    try {
      const success = await deleteFile(stampFileId);
      if (success) {
        setLocalSystemStamp(null);
        setStampFileId(null);
        toast.success("Stamp deleted successfully");
      } else {
        throw new Error('Failed to delete stamp');
      }
    } catch (error: any) {
      console.error('Error deleting stamp:', error);
      toast.error(error.message || 'Failed to delete stamp');
    }
  };

  const persistBranding = async (successMessage: string) => {
    // Store logo URL (from storage) or keep base64 for backward compatibility
    const logoValue = localSystemLogo || null;
    
    const payload: Partial<CompanyBranding> = {
      system_logo: logoValue, // URL from storage or base64 (legacy)
      company_name_ar: localSystemNameAr || "",
      company_name_en: localSystemNameEn || "",
      system_sidebar_subtitle: localSystemSubtitle || null,
      system_sidebar_name: localSystemName || "",
      company_phone: companyPhone || null,
      company_email: companyEmail || null,
      company_address: companyAddress || null,
    };

    setBrandingSaving(true);
    try {
      if (brandingId) {
        const { data, error } = await supabase
          .from("company_branding")
          .update(payload)
          .eq("branding_id", brandingId)
          .select()
          .maybeSingle<CompanyBranding>();

        if (error) {
          throw error;
        }

        if (data) {
          setBrandingId(data.branding_id);
        }
      } else {
        const { data, error } = await supabase
          .from("company_branding")
          .insert(payload)
          .select()
          .maybeSingle<CompanyBranding>();

        if (error) {
          throw error;
        }

        if (data) {
          setBrandingId(data.branding_id);
        }
      }

      setSystemName(localSystemName);
      setSystemSubtitle(localSystemSubtitle);
      if (localSystemLogo) {
        setSystemLogo(localSystemLogo);
      }
      setSystemNameAr(localSystemNameAr);
      setSystemNameEn(localSystemNameEn);
      toast.success(successMessage);
    } catch (error: any) {
      toast.error(error?.message ?? "Failed to save branding settings");
    } finally {
      setBrandingSaving(false);
    }
  };

  const handleSaveBranding = () => {
    void persistBranding("System branding saved successfully");
  };

  const handleSaveCompanySettings = () => {
    void persistBranding("Company settings saved successfully");
  };

  const handleSaveSystemSettings = async () => {
    setSystemSettingsSaving(true);
    try {
      // Get current user ID from localStorage (custom auth)
      const stored = localStorage.getItem('auth_user');
      let currentUserId: string | null = null;
      
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          currentUserId = parsed.user_id || null;
        } catch (e) {
          console.error('Failed to parse auth_user', e);
        }
      }

      const payload: Partial<SystemSettings> = {
        email_notifications: emailNotifications,
        sms_notifications: smsNotifications,
        auto_backup: autoBackup,
        two_factor_auth: twoFactorAuth,
        updated_by: currentUserId,
      };

      if (systemSettingsId) {
        // Update existing settings
        const { data, error } = await supabase
          .from("system_settings")
          .update(payload)
          .eq("setting_id", systemSettingsId)
          .select()
          .maybeSingle<SystemSettings>();

        if (error) {
          throw error;
        }

        if (data) {
          setSystemSettingsId(data.setting_id);
        }
      } else {
        // Create new settings
        const insertPayload: any = {
          ...payload,
          created_by: currentUserId,
        };

        const { data, error } = await supabase
          .from("system_settings")
          .insert(insertPayload)
          .select()
          .maybeSingle<SystemSettings>();

        if (error) {
          throw error;
        }

        if (data) {
          setSystemSettingsId(data.setting_id);
        }
      }

      toast.success("System settings saved successfully");
      
      // Apply settings immediately (you can add actual functionality here)
      applySystemSettings();
    } catch (error: any) {
      console.error('Error saving system settings:', error);
      toast.error(error?.message ?? "Failed to save system settings");
    } finally {
      setSystemSettingsSaving(false);
    }
  };

  const applySystemSettings = () => {
    // Apply email notifications setting
    if (emailNotifications) {
      console.log('Email notifications enabled');
      // TODO: Integrate with email notification service
    } else {
      console.log('Email notifications disabled');
    }

    // Apply SMS notifications setting
    if (smsNotifications) {
      console.log('SMS notifications enabled');
      // TODO: Integrate with SMS notification service
    } else {
      console.log('SMS notifications disabled');
    }

    // Apply auto backup setting
    if (autoBackup) {
      console.log('Automatic backup enabled');
      // TODO: Schedule automatic backup job
    } else {
      console.log('Automatic backup disabled');
    }

    // Apply two-factor authentication setting
    if (twoFactorAuth) {
      console.log('Two-factor authentication enabled');
      // TODO: Enforce 2FA for all users
    } else {
      console.log('Two-factor authentication disabled');
    }

    // Store settings in localStorage for quick access
    localStorage.setItem('system_settings', JSON.stringify({
      emailNotifications,
      smsNotifications,
      autoBackup,
      twoFactorAuth,
    }));
  };

  const handleAddUser = async (userData: AddUserFormValues) => {
    try {
      const role = normalizedRoles.find((r) => r.role_id === userData.roleId);
      if (!role) {
        toast.error("Selected role not found in database");
        return;
      }
      const password = userData.password;
      if (!password) {
        toast.error('Password is required');
        return;
      }
      const password_hash = await sha256Hex(password);
      const values: any = {
        email: userData.email,
        full_name: userData.name,
        password_hash,
        status: 'active',
        role_id: role.role_id,
        employee_id: userData.employeeId ?? null,
        phone_number: userData.phone ?? null,
      };
      await dispatch(thunks.system_users.createOne(values)).unwrap();
      setIsAddUserOpen(false);
      toast.success(`System user created for ${userData.name}`);
      dispatch(thunks.system_users.fetchAll(undefined));
    } catch (e: any) {
      toast.error(e.message || 'Failed to create system user');
    }
  };

  const handleAddAdmin = async (userData: AddUserFormValues) => {
    if (currentPermissions !== "all") {
      toast.error("Only super administrators can create admin users");
      return;
    }
    try {
      const role = normalizedRoles.find((r) => r.role_id === userData.roleId);
      if (!role) {
        toast.error("Selected role not found in database");
        return;
      }
      // Verify that the selected role has "all" permissions
      if (role.resolvedPermissions !== "all") {
        toast.error("Selected role does not have super admin permissions");
        return;
      }
      const password = userData.password;
      if (!password) {
        toast.error('Password is required');
        return;
      }
      const password_hash = await sha256Hex(password);
      const values: any = {
        email: userData.email,
        full_name: userData.name,
        password_hash,
        status: 'active',
        role_id: role.role_id,
        employee_id: null, // Admin users don't need to be linked to employees
        phone_number: userData.phone ?? null,
      };
      await dispatch(thunks.system_users.createOne(values)).unwrap();
      setIsAddAdminOpen(false);
      toast.success(`Admin user created successfully: ${userData.name}`);
      dispatch(thunks.system_users.fetchAll(undefined));
    } catch (e: any) {
      toast.error(e.message || 'Failed to create admin user');
    }
  };

  const handleDeleteUserClick = (userId: string) => {
    // Only super admins can delete users
    if (currentPermissions !== "all") {
      toast.error("Only super administrators can delete users");
      return;
    }

    const userRelation = usersWithRelations.find(({ user }) => user.user_id === userId);
    if (!userRelation) {
      toast.error("User not found");
      return;
    }

    setUserToDelete(userRelation);
    setDeleteConfirmationText("");
    setIsDeleteDialogOpen(true);
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    // Get current user ID
    const stored = localStorage.getItem('auth_user');
    let currentUserId: string | null = null;
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        currentUserId = parsed.user_id || null;
      } catch (e) {
        console.error('Failed to parse auth_user', e);
      }
    }

    // Check if trying to delete own account
    if (currentUserId === userToDelete.user.user_id) {
      toast.error("You cannot delete your own account");
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
      return;
    }

    // Check if deleting another super admin - requires typed confirmation
    const isTargetSuperAdmin = userToDelete.role?.resolvedPermissions === "all";
    const targetUserName = userToDelete.user.full_name || userToDelete.user.email;

    if (isTargetSuperAdmin) {
      // For super admin deletion, require exact username match
      if (deleteConfirmationText.trim() !== targetUserName.trim()) {
        toast.error("Username does not match. Please type the exact username to confirm deletion.");
        return;
      }
    } else {
      // For normal admin deletion, just need confirmation (no typed username required)
      // But we still show the dialog for safety
    }

    try {
      await dispatch(thunks.system_users.deleteOne(userToDelete.user.user_id)).unwrap();
      toast.success("User deleted successfully");
      setIsDeleteDialogOpen(false);
      setUserToDelete(null);
      setDeleteConfirmationText("");
      dispatch(thunks.system_users.fetchAll(undefined));
    } catch (e: any) {
      toast.error(e.message || "Failed to delete user");
    }
  };

  const handleToggleUserStatus = async (userId: string, currentStatus: string | null) => {
    try {
      const nextStatus = currentStatus === 'inactive' ? 'active' : 'inactive';
      await dispatch(thunks.system_users.updateOne({ id: userId, values: { status: nextStatus } })).unwrap();
      toast.success("User status updated");
    } catch (e: any) {
      toast.error(e.message || "Failed to update user status");
    }
  };

  const canEditAllRoles = currentPermissions === "all";
  const canEditAllUsers = currentPermissions === "all";

  const handleStartEditUser = (userId: string) => {
    if (!canEditAllUsers) {
      toast.error("You do not have permission to edit users.");
      return;
    }
    const userRelation = usersWithRelations.find(({ user }) => user.user_id === userId);
    if (!userRelation) {
      toast.error("User not found");
      return;
    }
    setUserBeingEdited(userRelation);
    setIsEditUserOpen(true);
  };

  const handleEditUser = async (userData: AddUserFormValues) => {
    if (!canEditAllUsers || !userBeingEdited) {
      toast.error("You do not have permission to edit users.");
      return;
    }
    try {
      const role = normalizedRoles.find((r) => r.role_id === userData.roleId);
      if (!role) {
        toast.error("Selected role not found in database");
        return;
      }

      const updates: Partial<SystemUsers> = {
        email: userData.email,
        full_name: userData.name,
        role_id: role.role_id,
        employee_id: userData.employeeId ?? null,
        phone_number: userData.phone ?? null,
      };

      // Only update password if a new one was provided
      if (userData.password && userData.password.trim() !== '') {
        const password_hash = await sha256Hex(userData.password);
        updates.password_hash = password_hash;
      }

      await dispatch(thunks.system_users.updateOne({ id: userBeingEdited.user.user_id, values: updates as any })).unwrap();
      setIsEditUserOpen(false);
      setUserBeingEdited(null);
      toast.success(`System user updated: ${userData.name}`);
      dispatch(thunks.system_users.fetchAll(undefined));
    } catch (e: any) {
      toast.error(e.message || 'Failed to update system user');
    }
  };

  const handleAddRole = async (roleData: AddRoleFormValues) => {
    if (!canManageRoles) {
      toast.error("You do not have permission to modify roles.");
      return;
    }
    try {
      await dispatch(
        thunks.roles.createOne({
          role_name: roleData.role_name,
          permissions: roleData.permissions === "all" ? "all" : roleData.permissions,
          users_count: 0,
        } as any),
      ).unwrap();
      setIsAddRoleOpen(false);
      toast.success("Role created successfully");
      dispatch(thunks.roles.fetchAll(undefined));
    } catch (e: any) {
      const message = e?.message ?? "Failed to create role";
      if (message.includes("roles_role_name_key") || e?.code === "23505") {
        toast.error("Role name already exists. Please choose another name.");
      } else {
        toast.error(message);
      }
    }
  };

  const handleStartEditRole = (roleId: string) => {
    if (!canEditAllRoles) return;
    const role = normalizedRoles.find((r) => r.role_id === roleId);
    if (!role) return;
    setRoleBeingEdited(role);
    setIsEditRoleOpen(true);
  };

  const handleEditRole = async (roleData: AddRoleFormValues) => {
    if (!canEditAllRoles || !roleBeingEdited) {
      toast.error("You do not have permission to modify roles.");
      return;
    }
    try {
      await dispatch(
        thunks.roles.updateOne({
          id: roleBeingEdited.role_id,
          values: {
            role_name: roleData.role_name,
            permissions: roleData.permissions === "all" ? "all" : roleData.permissions,
          } as any,
        }),
      ).unwrap();
      toast.success(`Role updated successfully (${roleData.role_name})`);
      setIsEditRoleOpen(false);
      setRoleBeingEdited(null);
      dispatch(thunks.roles.fetchAll(undefined));
    } catch (e: any) {
      const message = e?.message ?? "Failed to update role";
      if (message.includes("roles_role_name_key") || e?.code === "23505") {
        toast.error("Role name already exists. Please choose another name.");
      } else {
        toast.error(message);
      }
    }
  };

  const handleDeleteRole = async (roleId: string) => {
    if (!canManageRoles) {
      toast.error("You do not have permission to modify roles.");
      return;
    }
    const role = normalizedRoles.find(r => r.role_id === roleId);
    if (role && (role.users_count ?? 0) > 0) {
      toast.error("Cannot delete role with assigned users");
      return;
    }
    try {
      await dispatch(thunks.roles.deleteOne(roleId)).unwrap();
      toast.success("Role deleted successfully");
    } catch (e: any) {
      toast.error(e.message || "Failed to delete role");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2">
            <SettingsIcon className="h-7 w-7 text-primary" />
            Settings & Permissions
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage system settings, users, and permissions
          </p>
        </div>
      </div>

      <Tabs defaultValue="branding" className="space-y-6">
        <TabsList className="grid w-full grid-cols-6 lg:w-auto bg-gray-100/50 p-1 rounded-lg">
          <TabsTrigger 
            value="branding" 
            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent"
          >
            <ImageIcon className="h-4 w-4" />
            <span className="hidden sm:inline">Branding</span>
          </TabsTrigger>
          <TabsTrigger 
            value="company" 
            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent"
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Company</span>
          </TabsTrigger>
          <TabsTrigger 
            value="users" 
            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent"
          >
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Users</span>
          </TabsTrigger>
          <TabsTrigger 
            value="roles" 
            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent"
          >
            <Shield className="h-4 w-4" />
            <span className="hidden sm:inline">Roles</span>
          </TabsTrigger>
          <TabsTrigger 
            value="system" 
            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent"
          >
            <SettingsIcon className="h-4 w-4" />
            <span className="hidden sm:inline">System</span>
          </TabsTrigger>
          <TabsTrigger 
            value="backup" 
            className="gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm data-[state=inactive]:bg-transparent"
          >
            <Database className="h-4 w-4" />
            <span className="hidden sm:inline">Backup</span>
          </TabsTrigger>
        </TabsList>

        {/* System Branding */}
        <TabsContent value="branding" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Branding - هوية النظام</CardTitle>
              <CardDescription>Customize the system logo and name displayed in the sidebar</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="systemLogo">System Logo - شعار النظام</Label>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => logoInputRef.current?.click()}
                        className="w-full"
                        disabled={uploadingLogo}
                      >
                        {uploadingLogo ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Logo
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Recommended: 200x200px, PNG or JPG
                      </p>
                    </div>
                    {localSystemLogo && (
                      <div className="relative">
                        <div className="w-24 h-24 border-2 border-border rounded-lg p-2 bg-muted/30">
                          {uploadingLogo ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <ImageWithFallback
                              src={localSystemLogo}
                              alt="System Logo Preview"
                              className="w-full h-full object-contain"
                              brandingId={brandingId || undefined}
                              autoRegenerate={true}
                              maxRetries={2}
                            />
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleDeleteLogo}
                          disabled={uploadingLogo}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {!localSystemLogo && (
                      <div className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/30">
                        <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-gradient-to-br from-purple-600 to-purple-700">
                          <svg
                            className="h-10 w-10 text-white"
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
                      </div>
                    )}
                  </div>
                </div>

                {/* Company Stamp */}
                <div className="space-y-2 border-t pt-4">
                  <Label htmlFor="companyStamp">Company Stamp - ختم الشركة</Label>
                  <div className="flex items-start gap-4">
                    <div className="flex-1">
                      <input
                        ref={stampInputRef}
                        type="file"
                        accept="image/*"
                        onChange={handleStampUpload}
                        className="hidden"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => stampInputRef.current?.click()}
                        className="w-full"
                        disabled={uploadingStamp}
                      >
                        {uploadingStamp ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload Stamp
                          </>
                        )}
                      </Button>
                      <p className="text-xs text-muted-foreground mt-2">
                        Recommended: PNG with transparent background, max 2MB
                      </p>
                    </div>
                    {localSystemStamp && (
                      <div className="relative">
                        <div className="w-24 h-24 border-2 border-border rounded-lg p-2 bg-muted/30">
                          {uploadingStamp ? (
                            <div className="w-full h-full flex items-center justify-center">
                              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <ImageWithFallback
                              src={localSystemStamp}
                              alt="Company Stamp Preview"
                              className="w-full h-full object-contain"
                            />
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="absolute -top-2 -right-2 h-6 w-6 rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={handleDeleteStamp}
                          disabled={uploadingStamp}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                    {!localSystemStamp && (
                      <div className="w-24 h-24 border-2 border-dashed border-border rounded-lg flex items-center justify-center bg-muted/30">
                        <div className="text-center">
                          <ImageIcon className="h-8 w-8 text-muted-foreground mx-auto mb-1" />
                          <p className="text-xs text-muted-foreground">No stamp</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="systemName">System Name (Sidebar) - اسم النظام (القائمة)</Label>
                    <Input
                      id="systemName"
                      value={localSystemName}
                      onChange={(e) => setLocalSystemName(e.target.value)}
                      placeholder="Mana Smart"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="systemSubtitle">System Subtitle (Sidebar) - العنوان الفرعي</Label>
                    <Input
                      id="systemSubtitle"
                      value={localSystemSubtitle}
                      onChange={(e) => setLocalSystemSubtitle(e.target.value)}
                      placeholder="Scent System"
                    />
                  </div>
                </div>

                <div className="border-t pt-4 mt-4">
                  <h3 className="text-sm font-medium mb-4">Company Name for Documents - الاسم التجاري للمطبوعات</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="systemNameAr">Arabic Name - الاسم بالعربي</Label>
                      <Input
                        id="systemNameAr"
                        value={localSystemNameAr}
                        onChange={(e) => setLocalSystemNameAr(e.target.value)}
                        placeholder="منى سمارت"
                        dir="rtl"
                        className="text-right"
                      />
                      <p className="text-xs text-muted-foreground">
                        This name will appear on all printed documents (invoices, contracts, quotations)
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="systemNameEn">English Name - الاسم بالإنجليزي</Label>
                      <Input
                        id="systemNameEn"
                        value={localSystemNameEn}
                        onChange={(e) => setLocalSystemNameEn(e.target.value)}
                        placeholder="Mana Smart"
                      />
                      <p className="text-xs text-muted-foreground">
                        This name will appear on all printed documents (invoices, contracts, quotations)
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm font-medium mb-3">Preview - معاينة</p>
                    <div className="flex items-center gap-3 bg-card p-4 rounded-lg border">
                      {localSystemLogo ? (
                        <ImageWithFallback
                          src={localSystemLogo}
                          alt="Logo Preview" 
                          className="h-10 w-10 object-contain rounded-lg"
                          brandingId={brandingId || undefined}
                          autoRegenerate={true}
                          maxRetries={2}
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
                        <h1 className="text-base font-semibold">{localSystemName || "System Name"}</h1>
                        <p className="text-xs text-muted-foreground">{localSystemSubtitle || "Subtitle"}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  onClick={handleSaveBranding}
                  className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={brandingLoading || brandingSaving}
                >
                  <Save className="h-4 w-4" />
                  {brandingSaving ? "Saving..." : "Save Branding Settings"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Company Settings */}
        <TabsContent value="company" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Company Information</CardTitle>
              <CardDescription>Update your company details and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="companyName">Company Name</Label>
                  <Input
                    id="companyName"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyEmail">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="companyEmail"
                      type="email"
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyPhone">Phone</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="companyPhone"
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="companyAddress">Address</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="companyAddress"
                      value={companyAddress}
                      onChange={(e) => setCompanyAddress(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end pt-4">
                <Button
                  onClick={handleSaveCompanySettings}
                  className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={brandingLoading || brandingSaving}
                >
                  <Save className="h-4 w-4" />
                  {brandingSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Users Management */}
        <TabsContent value="users" className="space-y-6">
          <Card className="border-blue-200 bg-blue-50/30">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <Users className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-medium text-blue-900">
                    Users & Employees Integration
                  </p>
                  <p className="text-xs text-blue-700">
                    Each system user is linked to an employee record. Employee information (ID, Department, Position, Phone) is automatically synchronized.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>User Management - إدارة المستخدمين</CardTitle>
                  <CardDescription>Manage system users and their access - إدارة المستخدمين والصلاحيات</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Dialog open={isAddUserOpen} onOpenChange={setIsAddUserOpen}>
                    <DialogTrigger asChild>
                      <Button
                        className="gap-2"
                        disabled={isDataLoading || normalizedRoles.length === 0 || dbEmployees.length === 0}
                      >
                        <Plus className="h-4 w-4" />
                        Add User
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Add New User - إضافة مستخدم جديد</DialogTitle>
                        <DialogDescription>Link employee account with system user access</DialogDescription>
                      </DialogHeader>
                      <AddUserForm onSubmit={handleAddUser} roles={normalizedRoles} employees={dbEmployees} />
                    </DialogContent>
                  </Dialog>
                  {canEditAllUsers && (
                    <Dialog open={isAddAdminOpen} onOpenChange={setIsAddAdminOpen}>
                      <DialogTrigger asChild>
                        <Button
                          className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                          disabled={isDataLoading || normalizedRoles.length === 0}
                        >
                          <Shield className="h-4 w-4" />
                          Create Admin
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle>Create New Admin - إنشاء مسؤول جديد</DialogTitle>
                          <DialogDescription>Create a new super administrator account with full system access</DialogDescription>
                        </DialogHeader>
                        <AddAdminForm onSubmit={handleAddAdmin} roles={normalizedRoles} />
                      </DialogContent>
                    </Dialog>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Department</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {usersWithRelations.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center text-sm text-muted-foreground">
                          {isDataLoading ? "Loading users..." : "No users found"}
                        </TableCell>
                      </TableRow>
                    ) : usersWithRelations.map(({ user, employee, role }) => (
                      <TableRow key={user.user_id}>
                        <TableCell className="font-medium">{employee?.employee_id ?? "N/A"}</TableCell>
                        <TableCell>{user.full_name || employee?.name_en || employee?.name_ar || "N/A"}</TableCell>
                        <TableCell className="text-muted-foreground">{user.email}</TableCell>
                        <TableCell className="text-muted-foreground">{employee?.phone_number || user.phone_number || "N/A"}</TableCell>
                        <TableCell>{employee?.department || "N/A"}</TableCell>
                        <TableCell>{employee?.position || "N/A"}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{role?.role_name || "Unassigned"}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.status === "active" ? "default" : "secondary"}>
                            {user.status || "inactive"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            {canEditAllUsers && (
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleStartEditUser(user.user_id)}
                                title="Edit user"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleToggleUserStatus(user.user_id, user.status)}
                              title="Toggle user status"
                            >
                              <Shield className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteUserClick(user.user_id)}
                              disabled={currentPermissions !== "all"}
                              title={currentPermissions !== "all" ? "Only super administrators can delete users" : "Delete user"}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {canEditAllUsers && userBeingEdited && (
            <Dialog
              open={isEditUserOpen}
              onOpenChange={(open) => {
                setIsEditUserOpen(open);
                if (!open) setUserBeingEdited(null);
              }}
            >
              <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit User - تعديل المستخدم</DialogTitle>
                  <DialogDescription>Update system user information and access</DialogDescription>
                </DialogHeader>
                <EditUserForm 
                  user={userBeingEdited.user}
                  employee={userBeingEdited.employee}
                  role={userBeingEdited.role}
                  onSubmit={handleEditUser} 
                  roles={normalizedRoles} 
                  employees={dbEmployees}
                  onCancel={() => {
                    setIsEditUserOpen(false);
                    setUserBeingEdited(null);
                  }}
                />
              </DialogContent>
            </Dialog>
          )}

          {/* Delete User Confirmation Dialog */}
          {userToDelete && (
            <Dialog
              open={isDeleteDialogOpen}
              onOpenChange={(open) => {
                setIsDeleteDialogOpen(open);
                if (!open) {
                  setUserToDelete(null);
                  setDeleteConfirmationText("");
                }
              }}
            >
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle className="text-destructive">Delete User - حذف المستخدم</DialogTitle>
                  <DialogDescription>
                    This action cannot be undone. This will permanently delete the user account.
                  </DialogDescription>
                </DialogHeader>
                
                <div className="space-y-4 py-4">
                  <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex gap-3">
                      <Shield className="h-5 w-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-red-900 dark:text-red-100">
                          ⚠️ Warning: Deleting User Account
                        </p>
                        <div className="text-sm text-red-700 dark:text-red-300 space-y-1">
                          <p><strong>User:</strong> {userToDelete.user.full_name || userToDelete.user.email}</p>
                          <p><strong>Email:</strong> {userToDelete.user.email}</p>
                          <p><strong>Role:</strong> {userToDelete.role?.role_name || "Unassigned"}</p>
                          {userToDelete.role?.resolvedPermissions === "all" && (
                            <p className="font-bold text-red-900 dark:text-red-100">
                              ⚠️ This is a Super Administrator account!
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {(() => {
                    const stored = localStorage.getItem('auth_user');
                    let currentUserId: string | null = null;
                    if (stored) {
                      try {
                        const parsed = JSON.parse(stored);
                        currentUserId = parsed.user_id || null;
                      } catch (e) {
                        // Ignore
                      }
                    }
                    const isDeletingSelf = currentUserId === userToDelete.user.user_id;
                    const isTargetSuperAdmin = userToDelete.role?.resolvedPermissions === "all";
                    const targetUserName = userToDelete.user.full_name || userToDelete.user.email;

                    if (isDeletingSelf) {
                      return (
                        <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                          <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                            🚫 You cannot delete your own account
                          </p>
                          <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                            For security reasons, you cannot delete your own account. Please ask another super administrator to do this.
                          </p>
                        </div>
                      );
                    }

                    if (isTargetSuperAdmin) {
                      return (
                        <div className="space-y-3">
                          <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                            <p className="text-sm font-semibold text-orange-900 dark:text-orange-100 mb-2">
                              ⚠️ Deleting Super Administrator Account
                            </p>
                            <p className="text-xs text-orange-700 dark:text-orange-300">
                              You are about to delete a Super Administrator account. This requires additional confirmation.
                            </p>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="deleteConfirmation">
                              Type the username to confirm deletion:
                            </Label>
                            <Input
                              id="deleteConfirmation"
                              value={deleteConfirmationText}
                              onChange={(e) => setDeleteConfirmationText(e.target.value)}
                              placeholder={targetUserName}
                              className="font-mono"
                            />
                            <p className="text-xs text-muted-foreground">
                              You must type: <strong>{targetUserName}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    }

                    // Normal admin deletion - just warning, no typed confirmation needed
                    return (
                      <div className="bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                        <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
                          ⚠️ Confirm Deletion
                        </p>
                        <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                          Are you sure you want to delete this user account? This action cannot be undone.
                        </p>
                      </div>
                    );
                  })()}
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsDeleteDialogOpen(false);
                      setUserToDelete(null);
                      setDeleteConfirmationText("");
                    }}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={handleDeleteUser}
                    disabled={
                      (() => {
                        const stored = localStorage.getItem('auth_user');
                        let currentUserId: string | null = null;
                        if (stored) {
                          try {
                            const parsed = JSON.parse(stored);
                            currentUserId = parsed.user_id || null;
                          } catch (e) {
                            // Ignore
                          }
                        }
                        const isDeletingSelf = currentUserId === userToDelete.user.user_id;
                        const isTargetSuperAdmin = userToDelete.role?.resolvedPermissions === "all";
                        const targetUserName = userToDelete.user.full_name || userToDelete.user.email;
                        
                        if (isDeletingSelf) return true;
                        if (isTargetSuperAdmin) {
                          return deleteConfirmationText.trim() !== targetUserName.trim();
                        }
                        return false;
                      })()
                    }
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete User
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        {/* Roles & Permissions */}
        <TabsContent value="roles" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Roles & Permissions</CardTitle>
                  <CardDescription>Manage user roles and their permissions</CardDescription>
                  {!canManageRoles && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Only administrators with full access can modify roles. You can view existing roles below.
                    </p>
                  )}
                </div>
                {canManageRoles && (
                  <Dialog open={isAddRoleOpen} onOpenChange={setIsAddRoleOpen}>
                    <DialogTrigger asChild>
                      <Button
                        className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                        disabled={isDataLoading}
                      >
                        <Plus className="h-4 w-4" />
                        Add Role
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl">
                      <DialogHeader>
                        <DialogTitle>Create New Role</DialogTitle>
                        <DialogDescription>Define a new role and assign permissions</DialogDescription>
                      </DialogHeader>
                      <AddRoleForm onSubmit={handleAddRole} existingRoles={normalizedRoles} />
                    </DialogContent>
                  </Dialog>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Role Name</TableHead>
                      <TableHead>Permissions</TableHead>
                      <TableHead>Users</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {normalizedRoles.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-sm text-muted-foreground">
                          {isDataLoading ? "Loading roles..." : "No roles defined yet"}
                        </TableCell>
                      </TableRow>
                    ) : normalizedRoles.map((role) => (
                      <TableRow key={role.role_id}>
                        <TableCell>{role.role_name}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {permissionSummary(role.resolvedPermissions)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{role.users_count ?? 0} users</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleStartEditRole(role.role_id)}
                              disabled={!canEditAllRoles}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleDeleteRole(role.role_id)}
                              disabled={!canManageRoles || (role.users_count ?? 0) > 0}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
          {canEditAllRoles && roleBeingEdited && (
            <Dialog
              open={isEditRoleOpen}
              onOpenChange={(open) => {
                setIsEditRoleOpen(open);
                if (!open) setRoleBeingEdited(null);
              }}
            >
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Edit Role</DialogTitle>
                  <DialogDescription>Update role details and permissions</DialogDescription>
                </DialogHeader>
                <EditRoleForm
                  role={roleBeingEdited}
                  existingRoles={normalizedRoles}
                  onSubmit={handleEditRole}
                  onCancel={() => {
                    setIsEditRoleOpen(false);
                    setRoleBeingEdited(null);
                  }}
                />
              </DialogContent>
            </Dialog>
          )}
        </TabsContent>

        {/* System Settings */}
        <TabsContent value="system" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>System Settings</CardTitle>
              <CardDescription>Configure system preferences and security</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {systemSettingsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading settings...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Send email notifications for important events
                      </p>
                    </div>
                    <Switch
                      checked={emailNotifications}
                      onCheckedChange={setEmailNotifications}
                      disabled={systemSettingsSaving}
                    />
                  </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>SMS Notifications</Label>
                    <p className="text-sm text-muted-foreground">
                      Send SMS alerts for critical updates
                    </p>
                  </div>
                    <Switch
                      checked={smsNotifications}
                      onCheckedChange={setSmsNotifications}
                      disabled={systemSettingsSaving}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Automatic Backup</Label>
                      <p className="text-sm text-muted-foreground">
                        Daily automated backup of system data
                      </p>
                    </div>
                    <Switch
                      checked={autoBackup}
                      onCheckedChange={async (checked) => {
                        setAutoBackup(checked);
                        // Sync with BackupSettings
                        try {
                          const { updateBackupEnabled } = await import("../lib/backupApi");
                          await updateBackupEnabled(checked);
                        } catch (error) {
                          console.error("Failed to sync backup setting:", error);
                        }
                      }}
                      disabled={systemSettingsSaving}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label>Two-Factor Authentication</Label>
                      <p className="text-sm text-muted-foreground">
                        Require 2FA for all user logins
                      </p>
                    </div>
                    <Switch
                      checked={twoFactorAuth}
                      onCheckedChange={setTwoFactorAuth}
                      disabled={systemSettingsSaving}
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end pt-4 border-t">
                <Button 
                  onClick={handleSaveSystemSettings} 
                  className="gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                  disabled={systemSettingsLoading || systemSettingsSaving}
                >
                  {systemSettingsSaving ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      Save Settings
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Backup Settings */}
        <TabsContent value="backup" className="space-y-6">
          <BackupSettings 
            autoBackup={autoBackup}
            onAutoBackupChange={setAutoBackup}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EditUserForm({ 
  user, 
  employee, 
  role, 
  onSubmit, 
  roles, 
  employees,
  onCancel 
}: { 
  user: SystemUsers; 
  employee?: Employees; 
  role?: NormalizedRole;
  onSubmit: (data: AddUserFormValues) => void; 
  roles: NormalizedRole[]; 
  employees: Employees[];
  onCancel: () => void;
}) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(user.employee_id || "");
  const [name, setName] = useState(user.full_name || employee?.name_en || employee?.name_ar || "");
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone_number || employee?.phone_number || "");
  const [department, setDepartment] = useState(employee?.department || "");
  const [position, setPosition] = useState(employee?.position || "");
  const [roleId, setRoleId] = useState(user.role_id || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (employee) {
      setSelectedEmployeeId(employee.employee_id);
      setName(employee.name_en || employee.name_ar || user.full_name || "");
      setEmail(employee.email || user.email);
      setPhone(employee.phone_number || user.phone_number || "");
      setDepartment(employee.department || "");
      setPosition(employee.position || "");
    }
    if (role) {
      setRoleId(role.role_id);
    }
  }, [user, employee, role]);

  const handleEmployeeSelect = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const selectedEmployee = employees.find(emp => emp.employee_id === employeeId);
    if (selectedEmployee) {
      setName(selectedEmployee.name_en || selectedEmployee.name_ar || "");
      setEmail(selectedEmployee.email || email);
      setPhone(selectedEmployee.phone_number || "");
      setDepartment(selectedEmployee.department || "");
      setPosition(selectedEmployee.position || "");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!roleId) {
      toast.error("Select a system role");
      return;
    }
    if (password && password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    const selectedRole = roles.find(r => r.role_id === roleId);
    if (!selectedRole) {
      toast.error("Selected role could not be found");
      return;
    }
    onSubmit({
      name,
      email,
      phone,
      department,
      position,
      employeeId: selectedEmployeeId || undefined,
      roleId,
      roleName: selectedRole.role_name,
      password, // Can be empty to keep existing password
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4">
        <div className="flex gap-3">
          <Edit className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Edit System User
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Update user information and access permissions. Leave password blank to keep existing password.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="editEmployee">Select Employee - اختر الموظف</Label>
        <Select value={selectedEmployeeId} onValueChange={handleEmployeeSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Select employee from database..." />
          </SelectTrigger>
          <SelectContent>
            {employees.map((emp) => (
              <SelectItem key={emp.employee_id} value={emp.employee_id}>
                {emp.name_en || emp.name_ar || "Unnamed"} ({emp.department || "Unknown"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select an existing employee to automatically fill their information
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="editEmployeeId">Employee ID - رقم الموظف</Label>
          <Input
            id="editEmployeeId"
            value={selectedEmployeeId ? selectedEmployeeId : ""}
            disabled
            placeholder="Auto-filled"
            className="bg-muted"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="editName">Full Name - الاسم الكامل</Label>
          <Input
            id="editName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="editEmail">Email - البريد الإلكتروني</Label>
          <Input
            id="editEmail"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="editPhone">Phone - الهاتف</Label>
          <Input
            id="editPhone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="editDepartment">Department - القسم</Label>
          <Input
            id="editDepartment"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="editPosition">Position - المنصب</Label>
          <Input
            id="editPosition"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="editRole">System Role - صلاحيات النظام</Label>
        <Select value={roleId} onValueChange={setRoleId} required>
          <SelectTrigger>
            <SelectValue placeholder="Select system role..." />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.role_id} value={r.role_id}>
                {r.role_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          System role determines what the user can access in the system
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="editPassword">New Password - كلمة المرور الجديدة (Optional)</Label>
        <Input
          id="editPassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Leave blank to keep existing password"
        />
        <p className="text-xs text-muted-foreground">
          Only enter a password if you want to change it
        </p>
      </div>

      {password && (
        <div className="space-y-2">
          <Label htmlFor="editConfirmPassword">Confirm New Password - تأكيد كلمة المرور</Label>
          <Input
            id="editConfirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter new password"
          />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!roleId} className="bg-purple-600 hover:bg-purple-700 text-white">
          Update User Account
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddUserForm({ onSubmit, roles, employees }: { onSubmit: (data: AddUserFormValues) => void; roles: NormalizedRole[]; employees: Employees[] }) {
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [department, setDepartment] = useState("");
  const [position, setPosition] = useState("");
  const [roleId, setRoleId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handleEmployeeSelect = (employeeId: string) => {
    setSelectedEmployeeId(employeeId);
    const employee = employees.find(emp => emp.employee_id === employeeId);
    if (employee) {
      setName(employee.name_en || employee.name_ar || "");
      setEmail(employee.email || "");
      setPhone(employee.phone_number || "");
      setDepartment(employee.department || "");
      setPosition(employee.position || "");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeId) {
      toast.error("Select an employee to continue");
      return;
    }
    if (!roleId) {
      toast.error("Select a system role");
      return;
    }
    if (!password) {
      toast.error("Password is required");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    const selectedRole = roles.find(r => r.role_id === roleId);
    if (!selectedRole) {
      toast.error("Selected role could not be found");
      return;
    }
    onSubmit({
      name,
      email,
      phone,
      department,
      position,
      employeeId: selectedEmployeeId,
      roleId,
      roleName: selectedRole.role_name,
      password,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 p-4">
        <div className="flex gap-3">
          <Users className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
              Link Employee to System User
            </p>
            <p className="text-xs text-blue-700 dark:text-blue-300">
              Select an employee from the database to create their system login account. All employee information will be automatically linked.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="employee">Select Employee - اختر الموظف</Label>
        <Select value={selectedEmployeeId} onValueChange={handleEmployeeSelect}>
          <SelectTrigger>
            <SelectValue placeholder="Select employee from database..." />
          </SelectTrigger>
          <SelectContent>
            {employees.map((emp) => (
              <SelectItem key={emp.employee_id} value={emp.employee_id}>
                {emp.name_en || emp.name_ar || "Unnamed"} ({emp.department || "Unknown"})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Select an existing employee to automatically fill their information
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="employeeId">Employee ID - رقم الموظف</Label>
          <Input
            id="employeeId"
            value={selectedEmployeeId ? selectedEmployeeId : ""}
            disabled
            placeholder="Auto-filled"
            className="bg-muted"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Full Name - الاسم الكامل</Label>
          <Input
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={!selectedEmployeeId}
            className={!selectedEmployeeId ? "bg-muted" : ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="email">Email - البريد الإلكتروني</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={!selectedEmployeeId}
            className={!selectedEmployeeId ? "bg-muted" : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">Phone - الهاتف</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={!selectedEmployeeId}
            className={!selectedEmployeeId ? "bg-muted" : ""}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="department">Department - القسم</Label>
          <Input
            id="department"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            disabled={!selectedEmployeeId}
            className={!selectedEmployeeId ? "bg-muted" : ""}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="position">Position - المنصب</Label>
          <Input
            id="position"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={!selectedEmployeeId}
            className={!selectedEmployeeId ? "bg-muted" : ""}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="role">System Role - صلاحيات النظام</Label>
        <Select value={roleId} onValueChange={setRoleId} required>
          <SelectTrigger>
            <SelectValue placeholder="Select system role..." />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.role_id} value={r.role_id}>
                {r.role_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          System role determines what the user can access in the system
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password - كلمة المرور</Label>
        <Input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Enter secure password"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirmPassword">Confirm Password - تأكيد كلمة المرور</Label>
        <Input
          id="confirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          placeholder="Re-enter password"
        />
      </div>

      <DialogFooter>
        <Button type="submit" disabled={!selectedEmployeeId || !roleId} className="bg-purple-600 hover:bg-purple-700 text-white">
          Create User Account
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddAdminForm({ onSubmit, roles }: { onSubmit: (data: AddUserFormValues) => void; roles: NormalizedRole[] }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Filter roles to only show super admin roles (with "all" permissions)
  const adminRoles = roles.filter((r) => r.resolvedPermissions === "all");

  // Email validation function
  const validateEmail = (email: string): boolean => {
    if (!email || email.trim() === "") {
      return false;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    // Clear error when user starts typing
    if (emailError) {
      setEmailError("");
    }
  };

  const handleEmailBlur = () => {
    const trimmedEmail = email.trim();
    if (trimmedEmail && !validateEmail(trimmedEmail)) {
      const errorMsg = "البريد الإلكتروني غير صحيح / Invalid email format";
      setEmailError(errorMsg);
      toast.error(errorMsg);
    } else {
      setEmailError("");
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate email
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      const errorMsg = "يرجى إدخال البريد الإلكتروني / Please enter your email";
      setEmailError(errorMsg);
      toast.error(errorMsg);
      return;
    }
    
    if (!validateEmail(trimmedEmail)) {
      const errorMsg = "البريد الإلكتروني غير صحيح / Invalid email format";
      setEmailError(errorMsg);
      toast.error(errorMsg);
      return;
    }

    if (!name.trim()) {
      toast.error("Name is required");
      return;
    }

    if (!roleId) {
      toast.error("Select a super admin role");
      return;
    }

    const selectedRole = adminRoles.find((r) => r.role_id === roleId);
    if (!selectedRole) {
      toast.error("Selected role is not a super admin role");
      return;
    }

    if (!password) {
      toast.error("Password is required");
      return;
    }

    if (password.length < 8) {
      toast.error("Password must be at least 8 characters long");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }

    onSubmit({
      name: name.trim(),
      email: trimmedEmail,
      phone: phone.trim() || undefined,
      department: undefined,
      position: undefined,
      employeeId: undefined, // Admin users don't need employee link
      roleId,
      roleName: selectedRole.role_name,
      password,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 p-4">
        <div className="flex gap-3">
          <Shield className="h-5 w-5 text-purple-600 dark:text-purple-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="text-sm font-medium text-purple-900 dark:text-purple-100">
              Create Super Administrator Account
            </p>
            <p className="text-xs text-purple-700 dark:text-purple-300">
              Create a new administrator account with full system access. Admin accounts are not required to be linked to employee records.
            </p>
          </div>
        </div>
      </div>

      {adminRoles.length === 0 && (
        <div className="rounded-lg bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 p-4">
          <p className="text-sm text-yellow-900 dark:text-yellow-100">
            ⚠ No super admin roles found. Please create a role with full access permissions first.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="adminName">Full Name - الاسم الكامل *</Label>
          <Input
            id="adminName"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="Enter full name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="adminEmail">Email - البريد الإلكتروني *</Label>
          <Input
            id="adminEmail"
            type="email"
            value={email}
            onChange={(e) => handleEmailChange(e.target.value)}
            onBlur={handleEmailBlur}
            required
            placeholder="admin@example.com"
            className={emailError ? "border-destructive focus-visible:ring-destructive" : ""}
          />
          {emailError && (
            <p className="text-sm text-destructive mt-1 flex items-center gap-1">
              <span className="text-xs">⚠</span>
              {emailError}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adminPhone">Phone - الهاتف (Optional)</Label>
        <Input
          id="adminPhone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+966 50 123 4567"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="adminRole">Super Admin Role - صلاحيات المسؤول *</Label>
        <Select value={roleId} onValueChange={setRoleId} required disabled={adminRoles.length === 0}>
          <SelectTrigger>
            <SelectValue placeholder="Select super admin role..." />
          </SelectTrigger>
          <SelectContent>
            {adminRoles.map((r) => (
              <SelectItem key={r.role_id} value={r.role_id}>
                {r.role_name} (Full Access)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Only roles with full system access are available for admin accounts
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adminPassword">Password - كلمة المرور *</Label>
        <Input
          id="adminPassword"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          placeholder="Enter secure password (min 8 characters)"
          minLength={8}
        />
        <p className="text-xs text-muted-foreground">
          Password must be at least 8 characters long
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="adminConfirmPassword">Confirm Password - تأكيد كلمة المرور *</Label>
        <Input
          id="adminConfirmPassword"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          placeholder="Re-enter password"
        />
      </div>

      <DialogFooter>
        <Button 
          type="submit" 
          disabled={!name.trim() || !email.trim() || !roleId || !password || adminRoles.length === 0} 
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          <Shield className="h-4 w-4 mr-2" />
          Create Admin Account
        </Button>
      </DialogFooter>
    </form>
  );
}

function AddRoleForm({ onSubmit, existingRoles }: { onSubmit: (data: AddRoleFormValues) => void; existingRoles: NormalizedRole[] }) {
  const [name, setName] = useState("");
  const [grantAll, setGrantAll] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionMap>(() => ({} as PermissionMap));

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          ACCESS_AREAS.map((area) => area.category),
        ),
      ),
    [],
  );

  const ensureBaselinePermissions = (map: PermissionMap) => {
    let next = map;
    next = mergePermission(next, "profile", "view");
    return next;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Role name is required");
      return;
    }

    const trimmedName = name.trim();
    const duplicate = existingRoles.some(
      (role) => role.role_name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      toast.error("Role name already exists. Please choose another name.");
      return;
    }

    if (!grantAll && Object.keys(selectedPermissions).length === 0) {
      toast.error("Select at least one permission or enable full access");
      return;
    }

    const permissionsPayload = grantAll
      ? "all"
      : ensureBaselinePermissions(selectedPermissions);

    onSubmit({
      role_name: trimmedName,
      permissions: permissionsPayload,
    });
  };

  const toggleAreaAction = (areaId: PageId, action: AccessAction) => {
    setSelectedPermissions((prev): PermissionMap => {
      const hasAlready = hasPermission(prev, areaId, action);
      if (hasAlready) {
        return removePermission(prev, areaId, action) as PermissionMap;
      }
      return mergePermission(prev, areaId, action) as PermissionMap;
    });
  };

  const toggleAreaAll = (areaId: PageId) => {
    const area = ACCESS_AREA_MAP[areaId];
    if (!area) return;

    const hasAll = area.actions.every((action) =>
      hasPermission(selectedPermissions, areaId, action),
    );

    setSelectedPermissions((prev): PermissionMap => {
      if (hasAll) {
        return removePermission(prev, areaId) as PermissionMap;
      }
      let next = { ...prev };
      area.actions.forEach((action) => {
        next = mergePermission(next, areaId, action) as PermissionMap;
      });
      return next as PermissionMap;
    });
  };

  const isActionSelected = (areaId: PageId, action: AccessAction) =>
    hasPermission(selectedPermissions, areaId, action);

  const areaHasAllActions = (areaId: PageId) => {
    const area = ACCESS_AREA_MAP[areaId];
    if (!area) return false;
    return area.actions.every((action) => isActionSelected(areaId, action));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="roleName">Role Name</Label>
        <Input
          id="roleName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Sales Manager"
          required
        />
      </div>

      <div className="rounded-lg border bg-purple-50/40 p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-purple-900">Full Access</p>
            <p className="text-xs text-purple-700">
              Grant full access to all modules and actions in the system
            </p>
          </div>
          <Switch
            checked={grantAll}
            onCheckedChange={(value) => {
              setGrantAll(value);
              if (value) {
                setSelectedPermissions(() => ({} as PermissionMap));
              }
            }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Module Permissions</Label>
        <div className="border rounded-lg p-4 max-h-96 overflow-y-auto space-y-4 bg-gray-50/50">
          {categories.map((category) => {
            const areas = ACCESS_AREAS.filter((area) => area.category === category);
            return (
              <div key={category} className="space-y-2">
                <h4 className="font-medium text-sm text-purple-600">{category}</h4>
                <div className="space-y-3">
                  {areas.map((area) => {
                    const hasAll = areaHasAllActions(area.id);
                    return (
                      <div
                        key={area.id}
                        className={`rounded-lg border bg-white p-3 shadow-sm ${
                          grantAll ? "opacity-50 pointer-events-none" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{area.label}</p>
                            {area.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {area.description}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleAreaAll(area.id)}
                          >
                            {hasAll ? (
                              <>
                                <CheckSquare className="h-4 w-4 mr-2" />
                                All actions
                              </>
                            ) : (
                              <>
                                <Square className="h-4 w-4 mr-2" />
                                Select all
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {area.actions.map((action) => {
                            const selected = isActionSelected(area.id, action);
                            return (
                              <button
                                type="button"
                                key={`${area.id}-${action}`}
                                onClick={() => toggleAreaAction(area.id, action)}
                                className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                                  selected
                                    ? "border-purple-500 bg-purple-50 text-purple-700"
                                    : "border-muted bg-white text-muted-foreground hover:border-purple-200 hover:bg-purple-50/60"
                                }`}
                                disabled={grantAll}
                              >
                                <span className="capitalize">{action}</span>
                                {selected ? (
                                  <CheckSquare className="h-4 w-4 text-purple-600" />
                                ) : (
                                  <Square className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DialogFooter>
        <Button
          type="submit"
          className="bg-purple-600 hover:bg-purple-700 text-white"
        >
          Create Role
        </Button>
      </DialogFooter>
    </form>
  );
}

function clonePermissionMap(map: PermissionMap): PermissionMap {
  const result = {} as PermissionMap;
  Object.entries(map).forEach(([key, actions]) => {
    result[key as PageId] = [...actions] as AccessAction[];
  });
  return result;
}

function EditRoleForm({
  role,
  existingRoles,
  onSubmit,
  onCancel,
}: {
  role: NormalizedRole;
  existingRoles: NormalizedRole[];
  onSubmit: (data: AddRoleFormValues) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(role.role_name);
  const [grantAll, setGrantAll] = useState(role.resolvedPermissions === "all");
  const [selectedPermissions, setSelectedPermissions] = useState<PermissionMap>(() => {
    if (role.resolvedPermissions === "all") {
      return {} as PermissionMap;
    }
    return clonePermissionMap(role.resolvedPermissions as PermissionMap);
  });

  useEffect(() => {
    setName(role.role_name);
    setGrantAll(role.resolvedPermissions === "all");
    setSelectedPermissions(() => {
      if (role.resolvedPermissions === "all") {
        return {} as PermissionMap;
      }
      return clonePermissionMap(role.resolvedPermissions as PermissionMap);
    });
  }, [role]);

  const ensureBaselinePermissions = (map: PermissionMap) => {
    let next = map;
    next = mergePermission(next, "profile", "view");
    return next;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Role name is required");
      return;
    }
    const trimmedName = name.trim();
    const duplicate = existingRoles.some(
      (existing) =>
        existing.role_id !== role.role_id &&
        existing.role_name.toLowerCase() === trimmedName.toLowerCase(),
    );
    if (duplicate) {
      toast.error("Role name already exists. Please choose another name.");
      return;
    }

    const payloadPermissions = grantAll
      ? "all"
      : ensureBaselinePermissions(selectedPermissions);

    onSubmit({
      role_name: trimmedName,
      permissions: payloadPermissions,
    });
  };

  const toggleAreaAction = (areaId: PageId, action: AccessAction) => {
    setSelectedPermissions((prev): PermissionMap => {
      const hasAlready = hasPermission(prev, areaId, action);
      if (hasAlready) {
        return removePermission(prev, areaId, action) as PermissionMap;
      }
      return mergePermission(prev, areaId, action) as PermissionMap;
    });
  };

  const toggleAreaAll = (areaId: PageId) => {
    const area = ACCESS_AREA_MAP[areaId];
    if (!area) return;

    const hasAll = area.actions.every((action) =>
      hasPermission(selectedPermissions, areaId, action),
    );

    setSelectedPermissions((prev): PermissionMap => {
      if (hasAll) {
        return removePermission(prev, areaId) as PermissionMap;
      }
      let next = { ...prev };
      area.actions.forEach((action) => {
        next = mergePermission(next, areaId, action) as PermissionMap;
      });
      return next as PermissionMap;
    });
  };

  const isActionSelected = (areaId: PageId, action: AccessAction) =>
    hasPermission(selectedPermissions, areaId, action);

  const areaHasAllActions = (areaId: PageId) => {
    const area = ACCESS_AREA_MAP[areaId];
    if (!area) return false;
    return area.actions.every((action) => isActionSelected(areaId, action));
  };

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          ACCESS_AREAS.map((area) => area.category),
        ),
      ),
    [],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="editRoleName">Role Name</Label>
        <Input
          id="editRoleName"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Role name"
          required
        />
      </div>

      <div className="rounded-lg border bg-purple-50/40 p-4 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-purple-900">Full Access</p>
            <p className="text-xs text-purple-700">
              Grant full access to all modules and actions in the system
            </p>
          </div>
          <Switch
            checked={grantAll}
            onCheckedChange={(value) => {
              setGrantAll(value);
              if (value) {
                setSelectedPermissions(() => ({} as PermissionMap));
              }
            }}
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label>Module Permissions</Label>
        <div className="border rounded-lg p-4 max-h-96 overflow-y-auto space-y-4 bg-gray-50/50">
          {categories.map((category) => {
            const areas = ACCESS_AREAS.filter((area) => area.category === category);
            return (
              <div key={category} className="space-y-2">
                <h4 className="text-sm font-medium text-purple-600">{category}</h4>
                <div className="space-y-3">
                  {areas.map((area) => {
                    const hasAll = areaHasAllActions(area.id);
                    return (
                      <div
                        key={area.id}
                        className={`rounded-lg border bg-white p-3 shadow-sm ${
                          grantAll ? "opacity-50 pointer-events-none" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{area.label}</p>
                            {area.description && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {area.description}
                              </p>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleAreaAll(area.id)}
                          >
                            {hasAll ? (
                              <>
                                <CheckSquare className="h-4 w-4 mr-2" />
                                All actions
                              </>
                            ) : (
                              <>
                                <Square className="h-4 w-4 mr-2" />
                                Select all
                              </>
                            )}
                          </Button>
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-2">
                          {area.actions.map((action) => {
                            const selected = isActionSelected(area.id, action);
                            return (
                              <button
                                type="button"
                                key={`${area.id}-${action}`}
                                onClick={() => toggleAreaAction(area.id, action)}
                                className={`flex items-center justify-between rounded-md border px-3 py-2 text-xs font-medium transition-colors ${
                                  selected
                                    ? "border-purple-500 bg-purple-50 text-purple-700"
                                    : "border-muted bg-white text-muted-foreground hover:border-purple-200 hover:bg-purple-50/60"
                                }`}
                                disabled={grantAll}
                              >
                                <span className="capitalize">{action}</span>
                                {selected ? (
                                  <CheckSquare className="h-4 w-4 text-purple-600" />
                                ) : (
                                  <Square className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" className="bg-purple-600 hover:bg-purple-700 text-white">
          Save Changes
        </Button>
      </DialogFooter>
    </form>
  );
}

