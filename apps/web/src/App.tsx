import { Navigate, Route, Routes } from "react-router-dom";
import { RequireRole } from "./auth/RequireRole";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Inicio from "./pages/Inicio";
import PedidoArmado from "./pages/PedidoArmado";
import RevisionPedidos from "./pages/RevisionPedidos";
import RevisionDetalle from "./pages/RevisionDetalle";
import Historial from "./pages/Historial";
import AdminUsuarios from "./pages/AdminUsuarios";
import AdminProductos from "./pages/AdminProductos";
import AdminRubros from "./pages/AdminRubros";
import AdminProveedores from "./pages/AdminProveedores";
import DepositoPedidos from "./pages/DepositoPedidos";
import DepositoDetalle from "./pages/DepositoDetalle";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route element={<RequireRole />}>
          <Route path="/" element={<Inicio />} />
        </Route>
        <Route element={<RequireRole roles={["REPOSITOR"]} />}>
          <Route path="/pedido/:id" element={<PedidoArmado />} />
        </Route>
        <Route element={<RequireRole roles={["DEPOSITO"]} />}>
          <Route path="/deposito" element={<DepositoPedidos />} />
          <Route path="/deposito/:id" element={<DepositoDetalle />} />
        </Route>
        <Route element={<RequireRole roles={["ENCARGADA", "ADMIN"]} />}>
          <Route path="/revision" element={<RevisionPedidos />} />
          <Route path="/revision/:id" element={<RevisionDetalle />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/admin/proveedores" element={<AdminProveedores />} />
        </Route>
        <Route element={<RequireRole roles={["ADMIN"]} />}>
          <Route path="/admin/usuarios" element={<AdminUsuarios />} />
          <Route path="/admin/productos" element={<AdminProductos />} />
          <Route path="/admin/rubros" element={<AdminRubros />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
