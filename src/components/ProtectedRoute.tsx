import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false }: ProtectedRouteProps) {
  // Removed 'isPilotLoading' as it was undefined in your Context
  const { user, pilot, isAdmin, isLoading } = useAuth();
  const location = useLocation();

  // 1. WHILE LOADING: Show a visible loading state instead of 'null'
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#030712] text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-purple-500 mb-4"></div>
        <p className="text-sm font-medium animate-pulse">Authenticating...</p>
      </div>
    );
  }

  // 2. CHECK SESSION: If no user, send to login
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 3. CHECK PILOT DATA: If user exists but pilot record hasn't loaded 
  // (and we aren't loading anymore), they might need to re-auth
  if (!pilot) {
    return <Navigate to="/auth" replace />;
  }

  // 4. ADMIN CHECK
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
