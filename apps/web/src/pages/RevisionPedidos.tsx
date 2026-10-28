import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, type Sucursal } from "../lib/api";
import type { EstadoPedido } from "../lib/pedidosApi";
import { revisionApi } from "../lib/revisionApi";
import { EstadoEtiqueta, formatearFecha, nombreSucursal } from "../revision/comun";

const PESTANAS: { estado: EstadoPedido | ""; texto: string }[] = [
  { estado: "ENVIADO", texto: "Enviados" },
  { estado: "DEVUELTO", texto: "Devueltos" },
  { estado: "APROBADO", texto: "Aprobados" },
  { estado: "", texto: "Todos" },
];

export default function RevisionPedidos() {
  const [estado, setEstado] = useState<EstadoPedido | "">("ENVIADO");
  const [sucursal, setSucursal] = useState<Sucursal | "">("");
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["pedidos", "revision", "lista", { estado, sucursal, page }],
    queryFn: () => revisionApi.lista({ estado, sucursal, page }),
    placeholderData: keepPreviousData,
  });

  return (
    <main className="pagina ancha">
      <p>
        <Link to="/">Volver al inicio</Link>
      </p>
      <h1>Pedidos para revisar</h1>

      <div className="pestanas" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.texto}
            role="tab"
            aria-selected={estado === p.estado}
            className={estado === p.estado ? "activa" : ""}
            onClick={() => {
              setEstado(p.estado);
              setPage(1);
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>

      <label className="filtro">
        Sucursal
        <select
          value={sucursal}
          onChange={(e) => {
            setSucursal(e.target.value as Sucursal | "");
            setPage(1);
          }}
        >
          <option value="">Todas</option>
          <option value="CARMAR_1">CARMAR 1</option>
          <option value="CARMAR_2">CARMAR 2</option>
        </select>
      </label>

      {q.isPending && <p className="estado">Cargando pedidos...</p>}
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof ApiError ? q.error.message : "No se pudieron cargar los pedidos."}
        </p>
      )}
      {q.data && q.data.data.length === 0 && <p className="estado">No hay pedidos para mostrar.</p>}
      {q.data && q.data.data.length > 0 && (
        <>
          <ul className="lista">
            {q.data.data.map((p) => (
              <li key={p.id}>
                <Link to={`/revision/${p.id}`} className="tarjeta fila-pedido">
                  <span className="producto-nombre">{p.repositor.nombre}</span>
                  <span>{nombreSucursal(p.sucursal)}</span>
                  <span>{p.periodo.nombre}</span>
                  <span>
                    {p._count.items} {p._count.items === 1 ? "producto" : "productos"}
                  </span>
                  <span>Enviado: {formatearFecha(p.fechaEnvio)}</span>
                  <EstadoEtiqueta estado={p.estado} />
                </Link>
              </li>
            ))}
          </ul>
          <div className="paginas">
            <button
              className="boton secundario"
              disabled={page <= 1 || q.isFetching}
              onClick={() => setPage(page - 1)}
            >
              Anterior
            </button>
            <span>
              Página {q.data.meta.page} de {Math.max(q.data.meta.totalPages, 1)}
            </span>
            <button
              className="boton secundario"
              disabled={page >= q.data.meta.totalPages || q.isFetching}
              onClick={() => setPage(page + 1)}
            >
              Siguiente
            </button>
          </div>
        </>
      )}
    </main>
  );
}
