import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
}

export function ProtectedRoute({
  children,
  requireAdmin = false,
}: ProtectedRouteProps) {
  const { user, isAdmin, isLoading, isPilotLoading, isReady } = useAuth();
  const location = useLocation();

  // 1. Auth session check in progress
  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mb-4" />
        <p className="text-sm font-medium animate-pulse text-muted-foreground">
          Authenticating…
        </p>
      </div>
    );
  }

  // 2. Not logged in → redirect to auth
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 3. Pilot profile fetch in progress
  if (isPilotLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-background text-foreground">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary mb-4" />
        <p className="text-sm font-medium animate-pulse text-muted-foreground">
          Loading your profile…
        </p>
      </div>
    );
  }

  // 4. Admin-only route guard
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/" replace />;
  }

  // 5. ✅ Only mount children (and their useQuery calls) once fully ready
  //    This prevents Supabase queries firing before session is established
  if (!isReady) return null;

  return <>{children}</>;
}
