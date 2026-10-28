import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import { ApiError } from "../lib/api";
import { revisionApi, type ItemRevision } from "../lib/revisionApi";
import AccionesRevision from "../revision/AccionesRevision";
import { EstadoEtiqueta, formatearFecha, nombreSucursal } from "../revision/comun";

function agruparPorRubro(items: ItemRevision[]): [string, ItemRevision[]][] {
  const grupos = new Map<string, ItemRevision[]>();
  for (const item of items) {
    const rubro = item.producto.rubro.nombre;
    grupos.set(rubro, [...(grupos.get(rubro) ?? []), item]);
  }
  return [...grupos.entries()].sort(([a], [b]) => a.localeCompare(b, "es"));
}

export default function RevisionDetalle() {
  const { id = "" } = useParams();
  const { user } = useAuth();
  const q = useQuery({
    queryKey: ["pedidos", "revision", "detalle", id],
    queryFn: () => revisionApi.detalle(id),
    enabled: id !== "",
  });

  const volver = (
    <p>
      <Link to="/revision">Volver a la lista</Link>
    </p>
  );

  if (q.isPending) return <main className="pagina ancha">{volver}<p className="estado">Cargando pedido...</p></main>;
  if (q.isError) {
    return (
      <main className="pagina ancha">
        {volver}
        <p className="error" role="alert">
          {q.error instanceof ApiError ? q.error.message : "No se pudo cargar el pedido."}
        </p>
      </main>
    );
  }

  const p = q.data;

  return (
    <main className="pagina ancha">
      {volver}
      <h1>Pedido de {p.repositor.nombre}</h1>
      <div className="tarjeta datos">
        <p>
          <strong>Estado:</strong> <EstadoEtiqueta estado={p.estado} />
        </p>
        <p>
          <strong>Sucursal:</strong> {nombreSucursal(p.sucursal)}
        </p>
        <p>
          <strong>Período:</strong> {p.periodo.nombre}
        </p>
        <p>
          <strong>Enviado por:</strong> {p.enviadoPor?.nombre ?? "-"} ({formatearFecha(p.fechaEnvio)})
        </p>
        {p.devueltoPor && (
          <p>
            <strong>Devuelto por:</strong> {p.devueltoPor.nombre} ({formatearFecha(p.fechaDevolucion)})
          </p>
        )}
        {p.aprobadoPor && (
          <p>
            <strong>Aprobado por:</strong> {p.aprobadoPor.nombre} ({formatearFecha(p.fechaAprobacion)})
          </p>
        )}
      </div>

      {p.comentarioDevolucion && (
        <div className="aviso devuelto" role="status">
          <strong>Comentario de la devolución</strong>
          <p>{p.comentarioDevolucion}</p>
        </div>
      )}

      <section className="bloque">
        <h2>Productos ({p.items.length})</h2>
        {p.items.length === 0 && <p className="estado">El pedido no tiene productos.</p>}
        {agruparPorRubro(p.items).map(([rubro, items]) => (
          <div key={rubro} className="rubro-grupo">
            <h3>{rubro}</h3>
            <ul className="lista">
              {items.map((item) => (
                <li key={item.id} className="tarjeta">
                  <span className="producto-nombre">{item.producto.nombre}</span>
                  <span className="chico">Código {item.producto.codigo}</span>
                  <span>
                    {Number(item.cantidad)} {item.producto.unidad}
                  </span>
                  {item.observacion && <span className="chico">Obs.: {item.observacion}</span>}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {p.estado === "ENVIADO" && user?.rol === "ENCARGADA" && <AccionesRevision pedidoId={p.id} />}
      {p.estado === "ENVIADO" && user?.rol === "ADMIN" && (
        <div className="aviso" role="status">
          Solo la encargada puede aprobar o devolver.
        </div>
      )}
    </main>
  );
}
