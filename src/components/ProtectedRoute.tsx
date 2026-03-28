import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, pilot, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  // 1. AUTH LOADING STATE
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4"></div>
        <p className="text-sm font-medium animate-pulse">Authenticating...</p>
      </div>
    );
  }

  // 2. NOT LOGGED IN → REDIRECT TO AUTH
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  /**
   * 3. IMPORTANT FIX:
   * DO NOT redirect if pilot is null.
   *
   * Reasons:
   * - pilot may still be loading
   * - pilot row may not exist yet (new user)
   * - network delay / race condition
   */

  // Optional: show loading if you EXPECT pilot to exist
  // (only if your app strictly requires it)
  if (user && pilot === null) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-400 mb-3"></div>
        <p className="text-sm opacity-80">Loading your profile...</p>
      </div>
    );
  }

  // 4. ADMIN CHECK
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // 5. SUCCESS → RENDER PAGE
  return <>{children}</>;
}
