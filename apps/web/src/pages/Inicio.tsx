import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Rol } from "../lib/api";
import PedidoRepositor from "./PedidoRepositor";

const TITULOS: Record<Rol, string> = {
  ADMIN: "Administración",
  ENCARGADA: "Compras",
  REPOSITOR: "Reposición",
};

const TEXTOS: Record<Rol, string> = {
  ADMIN: "Acá administrás los usuarios y los productos, y ves los pedidos y el consolidado.",
  ENCARGADA: "Acá vas a ver los pedidos y el consolidado.",
  REPOSITOR: "Acá vas a cargar los pedidos de tu sucursal.",
};

export default function Inicio() {
  const { user, logout } = useAuth();
  const [saliendo, setSaliendo] = useState(false);
  if (!user) return null;

  const salir = async () => {
    setSaliendo(true);
    try {
      await logout();
    } catch {
      // La sesión local se limpia igual; la ruta protegida redirige al login.
    }
  };

  return (
    <main className="pagina">
      <h1>{TITULOS[user.rol]}</h1>
      <p>
        Hola, <strong>{user.nombre}</strong>
        {user.sucursal ? ` (${user.sucursal.replace("_", " ")})` : ""}
      </p>
      {user.rol === "REPOSITOR" ? <PedidoRepositor /> : <p>{TEXTOS[user.rol]}</p>}
      {user.rol !== "REPOSITOR" && (
        <Link className="boton" to="/revision">
          Revisar pedidos
        </Link>
      )}
      {user.rol !== "REPOSITOR" && (
        <Link className="boton" to="/consolidado">
          Consolidado
        </Link>
      )}
      {user.rol === "ADMIN" && (
        <Link className="boton" to="/admin/usuarios">
          Usuarios
        </Link>
      )}
      {user.rol === "ADMIN" && (
        <Link className="boton" to="/admin/productos">
          Productos
        </Link>
      )}
      <button className="boton secundario" onClick={salir} disabled={saliendo}>
        Cerrar sesión
      </button>
    </main>
  );
}
