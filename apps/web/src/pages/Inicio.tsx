import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import type { Rol } from "../lib/api";
import PedidoRepositor from "./PedidoRepositor";

const TITULOS: Record<Rol, string> = {
  ADMIN: "Administración",
  ENCARGADA: "Compras",
  REPOSITOR: "Reposición",
};

interface Tarea {
  to: string;
  titulo: string;
  detalle: string;
}

const PEDIDOS: Tarea[] = [
  { to: "/revision", titulo: "Revisar pedidos", detalle: "Mirá lo que mandaron los repositores, aprobalo o devolvelo" },
  { to: "/consolidado", titulo: "Consolidado", detalle: "Sumá los pedidos del período y descargá el Excel" },
];

const CATALOGO: Tarea[] = [
  { to: "/admin/usuarios", titulo: "Usuarios", detalle: "Altas, rubros de cada repositor y accesos" },
  { to: "/admin/productos", titulo: "Productos", detalle: "Catálogo, unidades y proveedores" },
  { to: "/admin/rubros", titulo: "Rubros", detalle: "Las secciones en que se agrupan los productos" },
  { to: "/admin/proveedores", titulo: "Proveedores", detalle: "A quién se le compra cada producto" },
  { to: "/admin/periodos", titulo: "Períodos", detalle: "Abrir y cerrar los períodos de pedidos" },
];

function Grupo({ titulo, tareas }: { titulo: string; tareas: Tarea[] }) {
  return (
    <section className="grupo-inicio">
      <h2>{titulo}</h2>
      <ul className="filas-tarea">
        {tareas.map((t) => (
          <li key={t.to}>
            <Link className="fila-tarea" to={t.to}>
              <span className="fila-tarea-titulo">{t.titulo}</span>
              <span className="fila-tarea-detalle">{t.detalle}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function Inicio() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <main className="pagina">
      <h1>{TITULOS[user.rol]}</h1>
      <p>
        Hola, <strong>{user.nombre}</strong>
      </p>
      {user.rol === "REPOSITOR" && <PedidoRepositor />}
      {user.rol !== "REPOSITOR" && <Grupo titulo="Pedidos" tareas={PEDIDOS} />}
      {user.rol === "ADMIN" && <Grupo titulo="Catálogo y personas" tareas={CATALOGO} />}
    </main>
  );
}
