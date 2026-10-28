import { Navigate, Route, Routes } from "react-router-dom";
import { RequireRole } from "./auth/RequireRole";
import Login from "./pages/Login";
import Inicio from "./pages/Inicio";
import RevisionPedidos from "./pages/RevisionPedidos";
import RevisionDetalle from "./pages/RevisionDetalle";
import Consolidado from "./pages/Consolidado";
import AdminUsuarios from "./pages/AdminUsuarios";
import AdminProductos from "./pages/AdminProductos";
import AdminRubros from "./pages/AdminRubros";
import AdminProveedores from "./pages/AdminProveedores";
import AdminPeriodos from "./pages/AdminPeriodos";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<RequireRole />}>
        <Route path="/" element={<Inicio />} />
      </Route>
      <Route element={<RequireRole roles={["ENCARGADA", "ADMIN"]} />}>
        <Route path="/revision" element={<RevisionPedidos />} />
        <Route path="/revision/:id" element={<RevisionDetalle />} />
        <Route path="/consolidado" element={<Consolidado />} />
      </Route>
      <Route element={<RequireRole roles={["ADMIN"]} />}>
        <Route path="/admin/usuarios" element={<AdminUsuarios />} />
        <Route path="/admin/productos" element={<AdminProductos />} />
        <Route path="/admin/rubros" element={<AdminRubros />} />
        <Route path="/admin/proveedores" element={<AdminProveedores />} />
        <Route path="/admin/periodos" element={<AdminPeriodos />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
