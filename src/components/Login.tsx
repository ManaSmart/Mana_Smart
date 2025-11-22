import { useState, useEffect, useRef } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Eye, EyeOff } from "lucide-react";
import { sha256Hex } from "../lib/hash";
import { supabase } from "../lib/supabaseClient";
import { toast } from "sonner";
import { getFilesByOwner, getFileUrl } from "../lib/storage";
import { FILE_CATEGORIES } from "../../supabase/models/file_metadata";
import { ImageWithFallback } from "./figma/ImageWithFallback";
import type { CompanyBranding } from "../../supabase/models/company_branding";

export interface AuthUserPayload {
  fullName: string;
  roleName: string;
  roleId?: string;
  rolePermissions?: any;
  userId: string;
  email: string;
}

interface LoginProps {
  onLogin?: (payload: AuthUserPayload) => void;
}

export function Login({ onLogin }: LoginProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [loading, setLoading] = useState(false);
  const [systemLogo, setSystemLogo] = useState<string | null>(null);
  const [systemName, setSystemName] = useState("Scent Management System");
  const [systemSubtitle, setSystemSubtitle] = useState("نظام إدارة أعمال التعطير");
  const formRef = useRef<HTMLFormElement>(null);
  const emailInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  // Generate unique form ID to prevent browser from recognizing it as the same form
  const [formId] = useState(() => `login-form-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Clear form fields when component mounts (e.g., after logout)
  useEffect(() => {
    // Clear state
    setUsername("");
    setPassword("");
    setError("");
    setEmailError("");
    setShowPassword(false);
    
    // Use a small delay to ensure DOM is ready, then reset form and clear inputs
    const timer = setTimeout(() => {
      // Reset form to clear browser autocomplete
      if (formRef.current) {
        formRef.current.reset();
      }
      
      // Clear input values directly to prevent browser autofill
      if (emailInputRef.current) {
        emailInputRef.current.value = "";
        // Temporarily make readonly to prevent autofill, then remove
        emailInputRef.current.setAttribute("readonly", "readonly");
        emailInputRef.current.setAttribute("autocomplete", "off");
        setTimeout(() => {
          if (emailInputRef.current) {
            emailInputRef.current.removeAttribute("readonly");
          }
        }, 100);
      }
      
      if (passwordInputRef.current) {
        passwordInputRef.current.value = "";
        // Temporarily make readonly to prevent autofill, then remove
        passwordInputRef.current.setAttribute("readonly", "readonly");
        passwordInputRef.current.setAttribute("autocomplete", "new-password");
        setTimeout(() => {
          if (passwordInputRef.current) {
            passwordInputRef.current.removeAttribute("readonly");
          }
        }, 100);
      }
    }, 50);

    return () => clearTimeout(timer);
  }, []);

  // Load branding (logo, name) from database
  useEffect(() => {
    const loadBranding = async () => {
      try {
        const { data, error } = await supabase
          .from("company_branding")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle<CompanyBranding>();

        if (error && error.code !== "PGRST116") {
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

          // Load logo from file storage
          const brandingFiles = await getFilesByOwner(data.branding_id, 'branding', FILE_CATEGORIES.BRANDING_LOGO);
          const logoFile = brandingFiles.find(f => f.category === FILE_CATEGORIES.BRANDING_LOGO);
          
          if (logoFile) {
            const logoUrl = await getFileUrl(
              logoFile.bucket as any,
              logoFile.path,
              logoFile.is_public || true
            );
            
            if (logoUrl) {
              setSystemLogo(logoUrl);
            }
          } else if (data.system_logo) {
            // Fallback to stored URL if no file in storage
            const storedUrl = data.system_logo;
            if (storedUrl.startsWith('http') || storedUrl.startsWith('https')) {
              setSystemLogo(storedUrl);
            }
          }
        }
      } catch (error) {
        console.error('Error loading branding for login page:', error);
      }
    };

    void loadBranding();
  }, []);

  // Email validation function
  const validateEmail = (email: string): boolean => {
    if (!email || email.trim() === "") {
      return false;
    }
    // RFC 5322 compliant email regex (simplified but effective)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const handleEmailChange = (value: string) => {
    setUsername(value);
    // Clear error when user starts typing
    if (emailError) {
      setEmailError("");
    }
  };

  const handleEmailBlur = () => {
    const trimmedEmail = username.trim();
    if (trimmedEmail && !validateEmail(trimmedEmail)) {
      const errorMsg = "البريد الإلكتروني غير صحيح / Invalid email format";
      setEmailError(errorMsg);
      toast.error(errorMsg);
    } else {
      setEmailError("");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setEmailError("");
    
    // Validate email format before submission
    const trimmedEmail = username.trim();
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
    
    setLoading(true);
    try {
      const email = trimmedEmail;
      const passHash = await sha256Hex(password);
      const { data: user, error: qErr } = await supabase
        .from('system_users')
        .select('*')
        .eq('email', email)
        .eq('password_hash', passHash)
        .eq('status', 'active')
        .single();
      if (qErr || !user) throw qErr || new Error('Invalid credentials');
      // Fetch role
      let roleName: string | undefined;
      let rolePermissions: any = null;
      if (user.role_id) {
        const { data: role } = await supabase
          .from("roles")
          .select("role_name, permissions")
          .eq("role_id", user.role_id)
          .single();
        roleName = role?.role_name;
        rolePermissions = role?.permissions ?? null;
      }
      const payload: AuthUserPayload = {
        fullName: user.full_name ?? user.email,
        roleName: roleName ?? "",
        roleId: user.role_id ?? undefined,
        rolePermissions,
        userId: user.user_id,
        email: user.email,
      };
      localStorage.setItem('auth_user', JSON.stringify({
        user_id: payload.userId,
        email: payload.email,
        full_name: payload.fullName,
        role_id: user.role_id,
        role_name: payload.roleName,
        role_permissions: rolePermissions,
      }));
      
      // Clear password field immediately after successful login for security
      setPassword("");
      if (passwordInputRef.current) {
        passwordInputRef.current.value = "";
      }
      
      onLogin?.(payload);
    } catch (err: any) {
      setError('اسم المستخدم أو كلمة المرور غير صحيحة / Invalid username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            {systemLogo ? (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg shadow-purple-500/50 p-2">
                <ImageWithFallback
                  src={systemLogo}
                  alt="System Logo"
                  className="h-full w-full object-contain"
                />
              </div>
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-purple-700 shadow-lg shadow-purple-500/50">
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
            )}
          </div>
          <h1 className="text-2xl mb-2">{systemName}</h1>
          <p className="text-muted-foreground">{systemSubtitle}</p>
        </div>

        <Card className="shadow-xl border-0">
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">تسجيل الدخول / Login</CardTitle>
            <CardDescription>
              Enter your credentials to access the system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form 
              ref={formRef} 
              id={formId}
              name={formId}
              onSubmit={handleSubmit} 
              className="space-y-4" 
              autoComplete="off"
            >
              {/* Hidden dummy fields to confuse browser autocomplete */}
              <input type="text" name="fake-email" autoComplete="off" style={{ display: 'none' }} tabIndex={-1} />
              <input type="password" name="fake-password" autoComplete="new-password" style={{ display: 'none' }} tabIndex={-1} />
              
              <div className="space-y-2">
                <Label htmlFor="username">Email / البريد الإلكتروني</Label>
                <Input
                  ref={emailInputRef}
                  id="username"
                  name="email-login"
                  type="email"
                  placeholder="Enter your email (e.g., user@example.com)"
                  value={username}
                  onChange={(e) => handleEmailChange(e.target.value)}
                  onBlur={handleEmailBlur}
                  autoComplete="off"
                  required
                  className={`h-11 ${emailError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                />
                {emailError && (
                  <p className="text-sm text-destructive mt-1 flex items-center gap-1">
                    <span className="text-xs">⚠</span>
                    {emailError}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password / كلمة المرور</Label>
                <div className="relative">
                  <Input
                    ref={passwordInputRef}
                    id="password"
                    name="password-login"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    required
                    className="h-11 pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-11 w-11"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                  </Button>
                </div>
              </div>

              {error && (
                <div className="p-3 text-sm text-destructive bg-destructive/10 rounded-md border border-destructive/20">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full h-11" disabled={loading}>
                Login / تسجيل الدخول
              </Button>

              
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-6">
          © 2025 Scent Management System. All rights reserved.
        </p>
      </div>
    </div>
  );
}
