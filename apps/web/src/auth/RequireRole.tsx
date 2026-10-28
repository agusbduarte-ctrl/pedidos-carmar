import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import type { Rol } from "../lib/api";

export function RequireRole({ roles }: { roles?: Rol[] }) {
  const { user, cargando } = useAuth();
  const location = useLocation();

  if (cargando) return <p className="estado">Cargando...</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" replace />;
  return <Outlet />;
}
