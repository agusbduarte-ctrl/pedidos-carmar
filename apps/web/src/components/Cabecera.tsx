import { useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { nombreSucursal } from "../revision/comun";

export default function Cabecera() {
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
    <header className="cabecera">
      <div className="cabecera-interior">
        <Link className="cabecera-marca" to="/">
          Cármar
        </Link>
        <div className="cabecera-usuario">
          <span className="cabecera-nombre">{user.nombre}</span>
          {user.sucursal && <span className="cabecera-sucursal">{nombreSucursal(user.sucursal)}</span>}
          <button className="cabecera-salir" onClick={salir} disabled={saliendo}>
            Salir
          </button>
        </div>
      </div>
    </header>
  );
}
