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
  const { user, pilot, isAdmin, isLoading, isPilotLoading } = useAuth();
  const location = useLocation();

  // 1. Initial auth check in progress (page load / hard refresh)
  //    isLoading is only true once — during the very first getSession() call.
  //    It never goes back to true on tab focus or token refresh.
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

  // 2. Not logged in → go to auth page
  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // 3. Pilot data fetch in progress — only on the very first load.
  //    isPilotLoading is set to false after the first fetch completes
  //    and is NEVER set back to true on background refetches.
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

  // 5. All clear — render the page
  return <>{children}</>;
}
