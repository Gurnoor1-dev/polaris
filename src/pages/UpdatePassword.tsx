import React, { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import {
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  AlertCircle,
  Loader2,
  ArrowRight,
} from "lucide-react";

type State = "loading" | "ready" | "submitting" | "success" | "error" | "invalid";

interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
}

export default function UpdatePassword() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [state, setState] = useState<State>("loading");
  const [errorMsg, setErrorMsg] = useState("");
  const [passwordStrength, setPasswordStrength] = useState<PasswordStrength>({
    score: 0,
    label: "Too weak",
    color: "from-red-500 to-red-600",
  });

  // Check if recovery token is valid on mount
  useEffect(() => {
    const validateToken = async () => {
      try {
        // The recovery token should be in the URL hash from Supabase
        const hash = window.location.hash;
        if (!hash || !hash.includes("access_token")) {
          setState("invalid");
          setErrorMsg("Invalid or expired recovery link");
          return;
        }

        // Try to get the current session - if valid, token exists
        const {
          data: { session },
          error,
        } = await supabase.auth.getSession();
        if (error || !session) {
          setState("invalid");
          setErrorMsg("Recovery link has expired");
          return;
        }

        setState("ready");
      } catch (err: any) {
        setState("invalid");
        setErrorMsg(err.message || "Failed to validate recovery link");
      }
    };

    validateToken();
  }, []);

  // Calculate password strength
  const calculateStrength = (pwd: string): PasswordStrength => {
    let score = 0;

    if (pwd.length >= 8) score++;
    if (pwd.length >= 12) score++;
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score++;
    if (/\d/.test(pwd)) score++;
    if (/[^a-zA-Z\d]/.test(pwd)) score++;

    const strengthLevels: PasswordStrength[] = [
      { score: 0, label: "Too weak", color: "from-red-500 to-red-600" },
      { score: 1, label: "Weak", color: "from-orange-500 to-orange-600" },
      { score: 2, label: "Fair", color: "from-yellow-500 to-yellow-600" },
      { score: 3, label: "Good", color: "from-emerald-500 to-emerald-600" },
      { score: 4, label: "Strong", color: "from-blue-500 to-blue-600" },
    ];

    return strengthLevels[Math.min(score, 4)];
  };

  useEffect(() => {
    if (password) {
      setPasswordStrength(calculateStrength(password));
    }
  }, [password]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");

    // Validation
    if (!password || !confirmPassword) {
      setErrorMsg("Both password fields are required");
      setState("error");
      return;
    }

    if (password.length < 8) {
      setErrorMsg("Password must be at least 8 characters");
      setState("error");
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match");
      setState("error");
      return;
    }

    setState("submitting");

    try {
      // Update the user's password
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) {
        setErrorMsg(error.message || "Failed to update password");
        setState("error");
        return;
      }

      setState("success");

      // Redirect after 2 seconds
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 2000);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen overflow-hidden relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Ambient Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-40 w-80 h-80 bg-teal-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 right-1/4 w-72 h-72 bg-slate-700/10 rounded-full blur-2xl" />
      </div>

      {/* Grid Pattern Overlay */}
      <div
        className="absolute inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255, 255, 255, 0.1) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255, 255, 255, 0.1) 1px, transparent 1px)
          `,
          backgroundSize: "50px 50px",
        }}
      />

      {/* Main Card Container */}
      <div className="relative z-10 w-full max-w-md">
        <div className="relative backdrop-blur-2xl bg-white/8 border border-white/10 rounded-2xl px-8 py-12 shadow-2xl">
          {/* Content Wrapper */}
          <div className="relative z-20">
            {state === "loading" && (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="w-8 h-8 text-blue-400 animate-spin mb-4" />
                <p className="text-sm text-slate-400 font-light">
                  Verifying recovery link...
                </p>
              </div>
            )}

            {state === "invalid" && (
              <div className="text-center space-y-4">
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-full bg-gradient-to-br from-red-500/30 to-red-600/20 border border-white/10 backdrop-blur-sm">
                    <AlertCircle className="w-6 h-6 text-red-400" />
                  </div>
                </div>
                <div>
                  <h1 className="text-2xl font-light tracking-tight text-white mb-2">
                    Link Expired
                  </h1>
                  <p className="text-sm text-slate-400 font-light mb-4">
                    {errorMsg}
                  </p>
                </div>
                <button
                  onClick={() => navigate("/migrate/request")}
                  className="w-full py-3 px-4 rounded-xl font-light text-sm text-white uppercase tracking-widest transition-all duration-300 relative overflow-hidden group bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500"
                >
                  <div className="relative flex items-center justify-center gap-2">
                    <span>Request New Link</span>
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </button>
              </div>
            )}

            {(state === "ready" || state === "submitting" || state === "error") && (
              <>
                {/* Header */}
                <div className="mb-8 text-center">
                  <div className="mb-4 flex justify-center">
                    <div className="p-3 rounded-full bg-gradient-to-br from-emerald-500/30 to-teal-500/30 border border-white/10 backdrop-blur-sm">
                      <Lock className="w-6 h-6 text-emerald-300" />
                    </div>
                  </div>
                  <h1 className="text-3xl font-light tracking-tight text-white mb-2">
                    Set New Password
                  </h1>
                  <p className="text-sm text-slate-400 font-light">
                    Create a secure password to protect your pilot account
                  </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                  {/* New Password Input */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300 uppercase tracking-widest ml-1">
                      New Password
                    </label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          if (state === "error") setState("ready");
                        }}
                        disabled={state === "submitting"}
                        placeholder="Min 8 characters"
                        className="w-full px-4 py-3 pr-10 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm font-light transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-400/50 focus:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        disabled={state === "submitting"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
                      >
                        {showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>

                    {/* Password Strength Indicator */}
                    {password && (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                            <div
                              className={`h-full bg-gradient-to-r ${passwordStrength.color} transition-all duration-300`}
                              style={{
                                width: `${(passwordStrength.score / 4) * 100}%`,
                              }}
                            />
                          </div>
                          <span
                            className={`text-xs font-medium bg-gradient-to-r ${passwordStrength.color} bg-clip-text text-transparent`}
                          >
                            {passwordStrength.label}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed">
                          Use a mix of uppercase, lowercase, numbers, and symbols for a stronger password.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Confirm Password Input */}
                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-slate-300 uppercase tracking-widest ml-1">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => {
                          setConfirmPassword(e.target.value);
                          if (state === "error") setState("ready");
                        }}
                        disabled={state === "submitting"}
                        placeholder="Re-enter your password"
                        className="w-full px-4 py-3 pr-10 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm font-light transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-400/50 focus:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        disabled={state === "submitting"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition-colors disabled:opacity-50"
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Error Message */}
                  {state === "error" && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-red-500/20 to-red-600/10 border border-red-500/30 backdrop-blur-sm">
                      <div className="flex gap-3">
                        <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                        <div>
                          <h3 className="text-sm font-medium text-red-300 mb-1">
                            Error
                          </h3>
                          <p className="text-xs text-red-200/80 leading-relaxed">
                            {errorMsg}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={state === "submitting" || !password || !confirmPassword}
                    className="w-full py-3 px-4 rounded-xl font-light text-sm text-white uppercase tracking-widest transition-all duration-300 relative overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {/* Background Gradient */}
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-600 via-teal-500 to-cyan-500 transition-opacity duration-500 group-hover:opacity-90 group-active:opacity-100" />

                    {/* Shimmer Effect */}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-r from-transparent via-white to-transparent" />

                    {/* Content */}
                    <div className="relative flex items-center justify-center gap-2">
                      {state === "submitting" ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Updating Password...</span>
                        </>
                      ) : (
                        <>
                          <span>Set Password</span>
                          <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                        </>
                      )}
                    </div>
                  </button>

                  {/* Info Box */}
                  <div className="p-3 rounded-xl bg-slate-800/30 border border-white/5 backdrop-blur-sm">
                    <p className="text-xs text-slate-400 leading-relaxed font-light">
                      This password will be your primary way to access your pilot dashboard. Keep it secure and never share it with anyone.
                    </p>
                  </div>
                </form>
              </>
            )}

            {state === "success" && (
              <div className="space-y-4 animate-in fade-in-50 duration-500 text-center py-4">
                <div className="flex justify-center mb-4">
                  <div className="p-3 rounded-full bg-gradient-to-br from-emerald-500/30 to-green-500/30 border border-white/10 backdrop-blur-sm">
                    <CheckCircle className="w-6 h-6 text-emerald-400" />
                  </div>
                </div>
                <div>
                  <h2 className="text-2xl font-light tracking-tight text-white mb-2">
                    Password Updated
                  </h2>
                  <p className="text-sm text-slate-400 font-light mb-4">
                    Your email login is now ready. You'll be redirected to your dashboard shortly.
                  </p>
                </div>
                <div className="pt-4 text-xs text-slate-500">
                  <p>Redirecting...</p>
                  <Loader2 className="w-3 h-3 animate-spin mx-auto mt-2" />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Accent Line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
    </div>
  );
}
