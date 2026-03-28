import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  const { user, pilot, isAdmin, isLoading, isPilotLoading } = useAuth();
  const location = useLocation();

  // 1. Auth check still in progress — show spinner
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4" />
        <p className="text-sm font-medium animate-pulse">Authenticating...</p>
      </div>
    );
  }

  // 2. Not logged in → redirect to auth
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 3. Logged in but pilot row still loading → short spinner
  //    We only show this if we're ACTIVELY fetching (not if pilot simply
  //    doesn't exist, which would loop forever).
  if (isPilotLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-purple-400 mb-3" />
        <p className="text-sm opacity-80">Loading your profile...</p>
      </div>
    );
  }

  // 4. Admin guard
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // 5. All good — render
  return <>{children}</>;
}
