import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  User,
  Mail,
  Phone,
  MapPin,
  Building2,
  Calendar,
  Camera,
  Lock,
  Save,
  UserCircle,
  Loader2,
  RefreshCw,
  Shield,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Textarea } from "./ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { toast } from "sonner";
import { sha256Hex } from "../lib/hash";
import { supabase } from "../lib/supabaseClient";
import type { SystemUsers } from "../../supabase/models/system_users";
import type { Employees } from "../../supabase/models/employees";
import type { Roles } from "../../supabase/models/roles";
import { uploadFile, getFileUrl, deleteFile, getFilesByOwner, validateFile } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";

interface ProfileProps {
  currentUser: string;
  userRole: string;
  userEmail?: string;
  userId?: string;
  recentActivities?: Array<{
    id: number;
    title: string;
    description: string;
    timestamp: string;
    type: string;
    action: string;
    user: string;
  }>;
  onUpdateUser?: (userData: any) => void;
}

interface ProfileFormState {
  fullName: string;
  email: string;
  phone: string;
  position: string;
  department: string;
  location: string;
  joinDate: string;
  employeeId: string;
  nationalId: string;
  address: string;
  emergencyContact: string;
  emergencyName: string;
  contractType: string;
  baseSalary: string;
  housingAllowance: string;
  transportAllowance: string;
  otherAllowances: string;
  bankName: string;
  bankIban: string;
}

const formatDateForInput = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
};

const formatDateForDisplay = (value?: string) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-GB");
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
};

const splitEmployeeAddress = (raw?: string | null) => {
  if (!raw) {
    return { location: "", address: "" };
  }
  const [firstLine, ...rest] = raw.split("\n");
  return {
    location: firstLine ?? "",
    address: rest.join("\n"),
  };
};

const combineEmployeeAddress = (location: string, address: string) => {
  const parts = [location.trim(), address.trim()].filter(Boolean);
  return parts.length ? parts.join("\n") : null;
};

const parseNumberField = (value: string) => {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const extractPermissions = (permissions: any) => {
  if (!permissions) return [] as string[];
  if (Array.isArray(permissions)) {
    return permissions
      .map((item) => (typeof item === "string" ? item : JSON.stringify(item)))
      .filter(Boolean);
  }
  if (typeof permissions === "object") {
    const collected: string[] = [];
    Object.entries(permissions).forEach(([key, value]) => {
      if (value === true) {
        collected.push(key);
        return;
      }
      if (typeof value === "string" || typeof value === "number") {
        collected.push(`${key}: ${value}`);
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((child) => collected.push(`${key}.${child}`));
        return;
      }
      if (value && typeof value === "object") {
        Object.entries(value).forEach(([innerKey, innerValue]) => {
          if (innerValue) {
            collected.push(`${key}.${innerKey}`);
          }
        });
      }
    });
    return collected;
  }
  return [] as string[];
};

export function Profile({
  currentUser,
  userRole,
  userEmail,
  userId,
  recentActivities,
  onUpdateUser,
}: ProfileProps) {
  const initialState: ProfileFormState = {
    fullName: currentUser ?? "",
    email: userEmail ?? "user@perfumesystem.com",
    phone: "",
    position: userRole ?? "",
    department: "Operations",
    location: "",
    joinDate: "",
    employeeId: "",
    nationalId: "",
    address: "",
    emergencyContact: "",
    emergencyName: "",
    contractType: "",
    baseSalary: "",
    housingAllowance: "",
    transportAllowance: "",
    otherAllowances: "",
    bankName: "",
    bankIban: "",
  };

  const [profileImage, setProfileImage] = useState<string>("");
  const [profileImageFileId, setProfileImageFileId] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [userData, setUserData] = useState<ProfileFormState>(initialState);
  const [passwordData, setPasswordData] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [systemUserRecord, setSystemUserRecord] = useState<SystemUsers | null>(null);
  const [employeeRecord, setEmployeeRecord] = useState<Employees | null>(null);
  const [roleName, setRoleName] = useState<string>(userRole);
  const [rolePermissions, setRolePermissions] = useState<Roles["permissions"] | null>(null);
  const [loading, setLoading] = useState<boolean>(!!userId);
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);

  const accountStatus = (systemUserRecord?.status ?? "active").toLowerCase();
  const displayJoinDate = useMemo(() => formatDateForDisplay(userData.joinDate), [userData.joinDate]);
  const lastLoginDisplay = useMemo(
    () => formatDateTime(systemUserRecord?.last_login),
    [systemUserRecord?.last_login]
  );
  const permissionList = useMemo(() => extractPermissions(rolePermissions), [rolePermissions]);

  const loadProfile = useCallback(
    async (options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!userId) {
        if (!silent) {
          setLoading(false);
        }
        setUserData((prev) => ({
          ...prev,
          fullName: currentUser ?? prev.fullName,
          email: userEmail ?? prev.email,
          position: userRole ?? prev.position,
        }));
        setRoleName(userRole);
        setRolePermissions(null);
        return;
      }

      if (!silent) {
        setLoading(true);
      }
      setServerError(null);

      try {
        const { data: userRow, error: userError } = await supabase
          .from("system_users")
          .select("*")
          .eq("user_id", userId)
          .single<SystemUsers>();

        if (userError || !userRow) {
          throw userError ?? new Error("Unable to load user profile");
        }

        setSystemUserRecord(userRow);

        if (userRow.role_id) {
          const { data: roleRow } = await supabase
            .from("roles")
            .select("role_name, permissions")
            .eq("role_id", userRow.role_id)
            .single<Roles>();
          if (roleRow) {
            setRoleName(roleRow.role_name ?? userRole);
            setRolePermissions(roleRow.permissions ?? null);
          } else {
            setRoleName(userRole);
            setRolePermissions(null);
          }
        } else {
          setRoleName(userRole);
          setRolePermissions(null);
        }

        let employee: Employees | null = null;
        if (userRow.employee_id) {
          const { data: employeeRow } = await supabase
            .from("employees")
            .select("*")
            .eq("employee_id", userRow.employee_id)
            .single<Employees>();
          if (employeeRow) {
            employee = employeeRow;
            setEmployeeRecord(employeeRow);
          } else {
            setEmployeeRecord(null);
          }
        } else {
          setEmployeeRecord(null);
        }

        const addressParts = splitEmployeeAddress(employee?.address ?? "");
        
        // Load profile picture from file storage
        if (userId) {
          try {
            const files = await getFilesByOwner(userId, 'user', FILE_CATEGORIES.PROFILE_PICTURE);
            if (files.length > 0) {
              const latestPicture = files[0];
              setProfileImageFileId(latestPicture.id);
              const pictureUrl = await getFileUrl(
                latestPicture.bucket as any,
                latestPicture.path,
                latestPicture.is_public
              );
              if (pictureUrl) {
                setProfileImage(pictureUrl);
              } else {
                // Fallback to legacy base64 if URL fails
                setProfileImage(employee?.profile_image ?? "");
              }
            } else {
              // Fallback to legacy base64
              setProfileImage(employee?.profile_image ?? "");
              setProfileImageFileId(null);
            }
          } catch (error) {
            console.error('Error loading profile picture:', error);
            // Fallback to legacy base64
            setProfileImage(employee?.profile_image ?? "");
            setProfileImageFileId(null);
          }
        } else {
          setProfileImage(employee?.profile_image ?? "");
        }

        setUserData({
          fullName: userRow.full_name ?? currentUser ?? "",
          email: userRow.email ?? userEmail ?? "",
          phone: userRow.phone_number ?? "",
          position: employee?.position ?? userRole ?? "",
          department: employee?.department ?? "Operations",
          location: addressParts.location,
          joinDate: formatDateForInput(employee?.job_start_date ?? employee?.hiring_date),
          employeeId: employee?.employee_id ?? userRow.employee_id ?? "",
          nationalId: employee?.national_id ?? "",
          address: addressParts.address,
          emergencyContact: employee?.emergency_contact_phone ?? "",
          emergencyName: employee?.emergency_contact_name ?? "",
          contractType: employee?.contract_type ?? "",
          baseSalary: employee?.base_salary != null ? String(employee.base_salary) : "",
          housingAllowance: employee?.housing_allowance != null ? String(employee.housing_allowance) : "",
          transportAllowance: employee?.transport_allowance != null ? String(employee.transport_allowance) : "",
          otherAllowances: employee?.other_allowances != null ? String(employee.other_allowances) : "",
          bankName: employee?.bank_name ?? "",
          bankIban: employee?.bank_iban ?? "",
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load profile";
        setServerError(message);
        toast.error(message);
      } finally {
        if (!silent) {
          setLoading(false);
        }
      }
    },
    [currentUser, userEmail, userId, userRole]
  );

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  useEffect(() => {
    if (!userId) {
      setUserData((prev) => ({
        ...prev,
        fullName: currentUser ?? prev.fullName,
        email: userEmail ?? prev.email,
        position: userRole ?? prev.position,
      }));
      setRoleName(userRole);
    }
  }, [currentUser, userEmail, userRole, userId]);

  const handleInputChange = useCallback(
    (field: keyof ProfileFormState) =>
      (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { value } = event.target;
        setUserData((prev) => ({ ...prev, [field]: value }));
      },
    []
  );

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const validation = validateFile(file, ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'], 5 * 1024 * 1024); // 5MB
    if (!validation.valid) {
      toast.error(validation.error);
      return;
    }

    if (!userId) {
      toast.error("User ID is required to upload profile picture");
      return;
    }

    setUploadingImage(true);
    try {
      // Get current user ID from localStorage (since we're not using Supabase Auth)
      const stored = localStorage.getItem('auth_user');
      let currentUserId = userId;
      
      if (!currentUserId && stored) {
        try {
          const parsed = JSON.parse(stored);
          currentUserId = parsed.user_id || userId;
        } catch (e) {
          console.error('Failed to parse auth_user', e);
        }
      }

      if (!currentUserId) {
        throw new Error('User ID is required to upload profile picture');
      }

      // Delete old profile picture if exists
      if (profileImageFileId) {
        await deleteFile(profileImageFileId);
      }

      // Upload to storage
      const result = await uploadFile({
        file,
        category: FILE_CATEGORIES.PROFILE_PICTURE,
        ownerId: currentUserId,
        ownerType: 'system_user', // Use system_user to match Settings component
        description: 'User profile picture',
        userId: currentUserId, // Use the same user ID for created_by
        metadata: {
          user_id: currentUserId, // Store user ID in metadata for precise deletion
        },
      });

      if (!result.success || !result.fileMetadata) {
        throw new Error(result.error || 'Failed to upload profile picture');
      }

      // Get public URL
      const pictureUrl = result.publicUrl || (await getFileUrl(
        result.fileMetadata.bucket as any,
        result.fileMetadata.path,
        result.fileMetadata.is_public
      ));

      if (!pictureUrl) {
        throw new Error('Failed to get picture URL');
      }

      // Add cache-busting to the URL
      const urlWithCacheBust = `${pictureUrl}${pictureUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
      setProfileImage(urlWithCacheBust);
      setProfileImageFileId(result.fileMetadata.id);
      
      // Trigger immediate refresh in other components with a small delay to ensure file is available
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('profilePictureUpdated', { 
          detail: { userId, timestamp: Date.now() } 
        }));
      }, 200);
      
      // Also trigger after a longer delay to ensure all components have time to process
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('profilePictureUpdated', { 
          detail: { userId, timestamp: Date.now() } 
        }));
      }, 1500);
      
      if (!isEditing) {
        setIsEditing(true);
      }
      toast.success("Profile image uploaded successfully");
    } catch (error: any) {
      console.error('Error uploading profile picture:', error);
      toast.error(error.message || 'Failed to upload profile picture');
    } finally {
      setUploadingImage(false);
      // Reset input
      if (e.target) {
        e.target.value = '';
      }
    }
  };

  const validateProfile = () => {
    if (!userData.fullName.trim()) {
      toast.error("Full name is required");
      return false;
    }
    if (!userData.email.trim()) {
      toast.error("Email is required");
      return false;
    }
    const emailRegex = /\S+@\S+\.\S+/;
    if (!emailRegex.test(userData.email.trim())) {
      toast.error("Please enter a valid email address");
      return false;
    }
    return true;
  };

  const handleSaveProfile = async () => {
    if (!userId) {
      toast.error("Missing user id");
      return;
    }
    if (!validateProfile()) return;

    setSaving(true);
    setServerError(null);
    const updatedSnapshot = { ...userData };

    try {
      const systemUserPayload = {
        full_name: userData.fullName.trim(),
        email: userData.email.trim(),
        phone_number: userData.phone.trim() || null,
        updated_at: new Date().toISOString(),
      } satisfies Partial<SystemUsers>;

      const { error: userUpdateError } = await supabase
        .from("system_users")
        .update(systemUserPayload)
        .eq("user_id", userId);

      if (userUpdateError) {
        throw userUpdateError;
      }

      const combinedAddress = combineEmployeeAddress(userData.location, userData.address);
      const employeePayload: Partial<Employees> = {
        name_en: userData.fullName.trim(),
        email: userData.email.trim(),
        phone_number: userData.phone.trim() || null,
        position: userData.position || null,
        department: userData.department || null,
        address: combinedAddress,
        national_id: userData.nationalId || null,
        emergency_contact_phone: userData.emergencyContact || null,
        emergency_contact_name: userData.emergencyName || null,
        contract_type: userData.contractType || null,
        job_start_date: userData.joinDate || null,
        hiring_date: userData.joinDate || null,
        base_salary: parseNumberField(userData.baseSalary),
        housing_allowance: parseNumberField(userData.housingAllowance),
        transport_allowance: parseNumberField(userData.transportAllowance),
        other_allowances: parseNumberField(userData.otherAllowances),
        bank_name: userData.bankName || null,
        bank_iban: userData.bankIban || null,
        // Don't save base64 to profile_image anymore - it's now in file storage
        // Keep profile_image for backward compatibility with legacy data
        profile_image: profileImage && profileImage.startsWith('data:') ? profileImage : null,
      };

      if (employeeRecord?.employee_id) {
        const { error: employeeUpdateError } = await supabase
          .from("employees")
          .update(employeePayload)
          .eq("employee_id", employeeRecord.employee_id);
        if (employeeUpdateError) throw employeeUpdateError;
      } else {
        const { data: insertedEmployee, error: employeeInsertError } = await supabase
          .from("employees")
          .insert(employeePayload)
          .select()
          .single<Employees>();

        if (employeeInsertError) throw employeeInsertError;

        if (insertedEmployee?.employee_id) {
          await supabase
            .from("system_users")
            .update({ employee_id: insertedEmployee.employee_id })
            .eq("user_id", userId);
        }
      }

      await loadProfile({ silent: true });
      setIsEditing(false);
      toast.success("Profile updated successfully");
      
      // Trigger a refresh of profile picture in parent components
      // This will cause App.tsx and MyWorkspace.tsx to reload the picture
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('profilePictureUpdated', { 
          detail: { userId, timestamp: Date.now() } 
        }));
      }, 100);
      
      if (onUpdateUser) {
        onUpdateUser(updatedSnapshot);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update profile";
      setServerError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancelEdit = async () => {
    setIsEditing(false);
    // Reload profile picture from storage
    if (userId) {
      try {
        const files = await getFilesByOwner(userId, 'user', FILE_CATEGORIES.PROFILE_PICTURE);
        if (files.length > 0) {
          const latestPicture = files[0];
          setProfileImageFileId(latestPicture.id);
          const pictureUrl = await getFileUrl(
            latestPicture.bucket as any,
            latestPicture.path,
            latestPicture.is_public
          );
          if (pictureUrl) {
            setProfileImage(pictureUrl);
          } else {
            setProfileImage(employeeRecord?.profile_image ?? "");
          }
        } else {
          setProfileImage(employeeRecord?.profile_image ?? "");
          setProfileImageFileId(null);
        }
      } catch (error) {
        console.error('Error reloading profile picture:', error);
        setProfileImage(employeeRecord?.profile_image ?? "");
      }
    } else {
      setProfileImage(employeeRecord?.profile_image ?? "");
    }
    void loadProfile({ silent: true });
  };

  const handleRefresh = () => {
    void loadProfile();
  };

  const handleToggleAccountStatus = async () => {
    if (!systemUserRecord) return;
    const nextStatus = accountStatus === "active" ? "inactive" : "active";

    setStatusChanging(true);
    try {
      const { error } = await supabase
        .from("system_users")
        .update({ status: nextStatus })
        .eq("user_id", systemUserRecord.user_id);
      if (error) throw error;
      await loadProfile({ silent: true });
      toast.success(
        nextStatus === "active" ? "Account re-activated" : "Account deactivated"
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update account status";
      toast.error(message);
    } finally {
      setStatusChanging(false);
    }
  };

  const handleChangePassword = async () => {
    try {
      if (!userId) {
        toast.error("Missing user id");
        return;
      }
      if (!passwordData.currentPassword || !passwordData.newPassword || !passwordData.confirmPassword) {
        toast.error("Please fill all password fields");
        return;
      }
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        toast.error("New passwords do not match");
        return;
      }
      if (passwordData.newPassword.length < 6) {
        toast.error("Password must be at least 6 characters");
        return;
      }

      const currentHash = await sha256Hex(passwordData.currentPassword);
      const { data: existing, error: qErr } = await supabase
        .from("system_users")
        .select("user_id")
        .eq("user_id", userId)
        .eq("password_hash", currentHash)
        .single();
      if (qErr || !existing) {
        toast.error("Current password is incorrect");
        return;
      }

      const newHash = await sha256Hex(passwordData.newPassword);
      const { error: uErr } = await supabase
        .from("system_users")
        .update({ password_hash: newHash })
        .eq("user_id", userId);
      if (uErr) throw uErr;

      toast.success("Password changed successfully");
      setPasswordData({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (e: any) {
      toast.error(e.message || "Failed to change password");
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardContent className="pt-6 space-y-4">
            <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
              <Skeleton className="h-32 w-32 rounded-full" />
              <div className="flex-1 space-y-3 w-full">
                <Skeleton className="h-6 w-1/2" />
                <Skeleton className="h-4 w-1/3" />
                <div className="grid grid-cols-2 gap-3">
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                  <Skeleton className="h-4" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-64" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              {Array.from({ length: 6 }).map((_, idx) => (
                <Skeleton key={idx} className="h-12" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {serverError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          {serverError}
        </div>
      )}

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">My Profile</h2>
          <p className="text-muted-foreground mt-1">
            Manage your personal information and account settings
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            onClick={handleRefresh}
            title="Reload profile"
            disabled={saving || loading}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button
            onClick={() => {
              if (isEditing) {
                handleCancelEdit();
              } else {
                setIsEditing(true);
              }
            }}
            variant={isEditing ? "outline" : "default"}
            className="whitespace-nowrap"
            disabled={saving}
          >
            {isEditing ? "Cancel" : "Edit Profile"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            <div className="relative">
              <Avatar className="h-32 w-32 border-4 border-background shadow-lg">
                {profileImage ? (
                  <AvatarImage src={profileImage} alt={userData.fullName} />
                ) : (
                  <AvatarFallback className="bg-gradient-to-br from-purple-600 to-purple-700 text-white text-3xl">
                    {userData.fullName
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                )}
              </Avatar>
              <label
                htmlFor="avatar-upload"
                className={`absolute bottom-0 right-0 bg-primary text-primary-foreground rounded-full p-2 cursor-pointer hover:bg-primary/90 transition-colors shadow-lg ${uploadingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {uploadingImage ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageUpload}
                  disabled={uploadingImage}
                />
              </label>
            </div>

            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="text-2xl font-bold">{userData.fullName || "Unnamed User"}</h3>
                {roleName && (
                  <Badge className="bg-purple-100 text-purple-700 border border-purple-200">
                    {roleName}
                  </Badge>
                )}
                <Badge
                  className={
                    accountStatus === "active"
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-amber-100 text-amber-700 border border-amber-200"
                  }
                >
                  {accountStatus === "active" ? "Active" : "Inactive"}
                </Badge>
              </div>
              <p className="text-muted-foreground mt-1">{userData.position || "Role not set"}</p>
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span>{userData.email || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{userData.phone || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span>{userData.department || "—"}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Joined {displayJoinDate}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-muted-foreground" />
                  <span>Last login: {lastLoginDisplay}</span>
                </div>
              </div>
            </div>

            {isEditing && (
              <Button
                onClick={handleSaveProfile}
                className="gap-2"
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="personal" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 lg:w-[420px]">
          <TabsTrigger value="personal">Personal Info</TabsTrigger>
          <TabsTrigger value="employment">Employment</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        <TabsContent value="personal" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Personal Information</CardTitle>
              <CardDescription>Update your personal details and contact information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="fullName"
                      value={userData.fullName}
                      onChange={handleInputChange("fullName")}
                      disabled={!isEditing}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="email"
                      type="email"
                      value={userData.email}
                      onChange={handleInputChange("email")}
                      disabled={!isEditing}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="phone">Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="phone"
                      value={userData.phone}
                      onChange={handleInputChange("phone")}
                      disabled={!isEditing}
                      className="pl-9"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="nationalId">National ID</Label>
                  <div className="relative">
                    <UserCircle className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="nationalId"
                      value={userData.nationalId}
                      onChange={handleInputChange("nationalId")}
                      disabled={!isEditing}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="location">City / Location</Label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="location"
                      value={userData.location}
                      onChange={handleInputChange("location")}
                      disabled={!isEditing}
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyContact">Emergency Contact</Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="emergencyContact"
                      value={userData.emergencyContact}
                      onChange={handleInputChange("emergencyContact")}
                      disabled={!isEditing}
                      className="pl-9"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="emergencyName">Emergency Contact Name</Label>
                  <Input
                    id="emergencyName"
                    value={userData.emergencyName}
                    onChange={handleInputChange("emergencyName")}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="address">Address</Label>
                <Textarea
                  id="address"
                  value={userData.address}
                  onChange={handleInputChange("address")}
                  disabled={!isEditing}
                  rows={3}
                />
              </div>

              {isEditing && (
                <div className="flex justify-end gap-2 pt-4">
                  <Button variant="outline" onClick={handleCancelEdit} disabled={saving}>
                    Cancel
                  </Button>
                  <Button onClick={handleSaveProfile} className="gap-2" disabled={saving}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="employment" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Employment Details</CardTitle>
              <CardDescription>Your work-related information</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Employee ID</Label>
                  <Input value={userData.employeeId || "—"} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Position</Label>
                  <Input
                    value={userData.position}
                    onChange={handleInputChange("position")}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input
                    value={userData.department}
                    onChange={handleInputChange("department")}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={userData.joinDate}
                    onChange={handleInputChange("joinDate")}
                    disabled={!isEditing}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Contract Type</Label>
                <Input
                  value={userData.contractType}
                  onChange={handleInputChange("contractType")}
                  disabled={!isEditing}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Base Salary (SAR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={userData.baseSalary}
                    onChange={handleInputChange("baseSalary")}
                    disabled={!isEditing}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Housing Allowance (SAR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={userData.housingAllowance}
                    onChange={handleInputChange("housingAllowance")}
                    disabled={!isEditing}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Transport Allowance (SAR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={userData.transportAllowance}
                    onChange={handleInputChange("transportAllowance")}
                    disabled={!isEditing}
                    dir="ltr"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Other Allowances (SAR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={userData.otherAllowances}
                    onChange={handleInputChange("otherAllowances")}
                    disabled={!isEditing}
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Bank Name</Label>
                  <Input
                    value={userData.bankName}
                    onChange={handleInputChange("bankName")}
                    disabled={!isEditing}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bank IBAN</Label>
                  <Input
                    value={userData.bankIban}
                    onChange={handleInputChange("bankIban")}
                    disabled={!isEditing}
                    dir="ltr"
                  />
                </div>
              </div>

              {!isEditing && (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 mt-4">
                  <p className="text-sm text-blue-700">
                    <strong>Note:</strong> Employment details are sourced from the HR database. Contact the HR
                    department for structural changes such as employment status or compensation plans.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Change Password</CardTitle>
              <CardDescription>Update your password to keep your account secure</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4 max-w-md">
                <div className="space-y-2">
                  <Label htmlFor="currentPassword">Current Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="currentPassword"
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) =>
                        setPasswordData((prev) => ({ ...prev, currentPassword: e.target.value }))
                      }
                      className="pl-9"
                      placeholder="Enter current password"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="newPassword"
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) =>
                        setPasswordData((prev) => ({ ...prev, newPassword: e.target.value }))
                      }
                      className="pl-9"
                      placeholder="Enter new password"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) =>
                        setPasswordData((prev) => ({ ...prev, confirmPassword: e.target.value }))
                      }
                      className="pl-9"
                      placeholder="Confirm new password"
                    />
                  </div>
                </div>

                <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                  <p className="text-xs text-amber-700">
                    Password must be at least 6 characters long and include a mix of letters and numbers for better
                    security.
                  </p>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={handleChangePassword}
                    className="gap-2"
                    disabled={statusChanging || saving}
                  >
                    <Lock className="h-4 w-4" />
                    Change Password
                  </Button>
                  <Button
                    onClick={handleToggleAccountStatus}
                    variant={accountStatus === "active" ? "destructive" : "default"}
                    className="gap-2"
                    disabled={statusChanging}
                  >
                    {statusChanging ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4" />
                    )}
                    {accountStatus === "active" ? "Deactivate Account" : "Activate Account"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Role & Permissions</CardTitle>
              <CardDescription>Access rights assigned to this account</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Role</p>
                <Badge className="mt-1 bg-slate-100 text-slate-700 border border-slate-200">
                  {roleName || "Not assigned"}
                </Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground mb-2">Permissions</p>
                {permissionList.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {permissionList.map((permission) => (
                      <Badge key={permission} variant="outline" className="text-xs">
                        {permission}
                      </Badge>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No granular permissions assigned.</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Account Activity</CardTitle>
              <CardDescription>Recent login history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {(recentActivities ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No recent activity.</p>
                ) : (
                  (recentActivities ?? []).map((act) => (
                    <div key={act.id} className="flex items-center justify-between py-3 border-b">
                      <div>
                        <p className="font-medium text-sm">{act.title}</p>
                        <p className="text-xs text-muted-foreground">{act.description}</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(act.timestamp).toLocaleString()}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
