import React, { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Mail, ArrowRight, CheckCircle, AlertCircle, Loader2 } from "lucide-react";

type State = "idle" | "loading" | "success" | "error";

export default function MigrateToEmail() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setErrorMsg("Email is required");
      setState("error");
      return;
    }

    setState("loading");
    setErrorMsg("");

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/migrate/update-password`,
      });

      if (error) {
        setErrorMsg(
          error.message || "Failed to send reset link. Please try again."
        );
        setState("error");
        return;
      }

      setState("success");
      setEmail("");
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred");
      setState("error");
    }
  };

  return (
    <div className="min-h-screen overflow-hidden relative bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center p-4">
      {/* Ambient Background Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        <div className="absolute -bottom-32 -left-40 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute top-1/3 left-1/4 w-72 h-72 bg-slate-700/10 rounded-full blur-2xl" />
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
        {/* Glassmorphic Background Blur */}
        <div className="absolute -inset-1 bg-gradient-to-r from-blue-600/20 via-cyan-500/10 to-blue-600/20 rounded-2xl blur-xl opacity-0 transition-opacity duration-700 group-hover:opacity-100" />

        <div className="relative backdrop-blur-2xl bg-white/8 border border-white/10 rounded-2xl px-8 py-12 shadow-2xl">
          {/* Content Wrapper */}
          <div className="relative z-20">
            {/* Header */}
            <div className="mb-8 text-center">
              <div className="mb-4 flex justify-center">
                <div className="p-3 rounded-full bg-gradient-to-br from-blue-500/30 to-cyan-500/30 border border-white/10 backdrop-blur-sm">
                  <Mail className="w-6 h-6 text-blue-300" />
                </div>
              </div>
              <h1 className="text-3xl font-light tracking-tight text-white mb-2">
                Transition to Email
              </h1>
              <p className="text-sm text-slate-400 font-light">
                Link your email account and secure your pilot profile with a password
              </p>
            </div>

            {/* Conditional Content */}
            {state === "success" ? (
              <div className="space-y-4 animate-in fade-in-50 duration-500">
                <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-500/10 border border-emerald-500/30 backdrop-blur-sm">
                  <div className="flex gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-sm font-medium text-emerald-300 mb-1">
                        Reset Link Sent
                      </h3>
                      <p className="text-xs text-emerald-200/80 leading-relaxed">
                        We've sent a password reset link to <span className="font-medium">{email}</span>. 
                        Check your inbox and click the link to set your new password.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5 backdrop-blur-sm text-center">
                  <p className="text-xs text-slate-400 mb-3">
                    Link expires in 24 hours. Didn't receive it?
                  </p>
                  <button
                    onClick={() => {
                      setState("idle");
                      setEmail("");
                    }}
                    className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    Request another link
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Email Input */}
                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-300 uppercase tracking-widest ml-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (state === "error") setState("idle");
                    }}
                    disabled={state === "loading"}
                    placeholder="pilot@example.com"
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-slate-500 text-sm font-light transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-400/50 focus:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  {state === "error" && (
                    <p className="text-xs text-red-400 ml-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {errorMsg}
                    </p>
                  )}
                </div>

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={state === "loading"}
                  className="w-full py-3 px-4 rounded-xl font-light text-sm text-white uppercase tracking-widest transition-all duration-300 relative overflow-hidden group disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {/* Background Gradient */}
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 via-blue-500 to-cyan-500 transition-opacity duration-500 group-hover:opacity-90 group-active:opacity-100" />

                  {/* Shimmer Effect */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-20 transition-opacity duration-500 bg-gradient-to-r from-transparent via-white to-transparent" />

                  {/* Content */}
                  <div className="relative flex items-center justify-center gap-2">
                    {state === "loading" ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Sending Link...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Reset Link</span>
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </div>
                </button>

                {/* Divider */}
                <div className="flex items-center gap-3 my-6">
                  <div className="flex-1 h-px bg-gradient-to-r from-white/0 via-white/10 to-white/0" />
                  <span className="text-xs text-slate-500 font-light">Security</span>
                  <div className="flex-1 h-px bg-gradient-to-r from-white/0 via-white/10 to-white/0" />
                </div>

                {/* Info Box */}
                <div className="p-3 rounded-xl bg-slate-800/30 border border-white/5 backdrop-blur-sm">
                  <p className="text-xs text-slate-400 leading-relaxed font-light">
                    Your Discord account will remain linked. This email login is an additional security layer for your pilot profile.
                  </p>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Accent Line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent" />
    </div>
  );
}
