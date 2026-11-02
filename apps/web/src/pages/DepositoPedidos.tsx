import { Link, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ApiError } from "../lib/api";
import { nombrePedido } from "../lib/pedidosApi";
import { depositoApi, type VistaDeposito } from "../lib/depositoApi";
import { formatearFecha, nombreSucursal } from "../revision/comun";

const PESTANAS: { vista: VistaDeposito; texto: string }[] = [
  { vista: "revisar", texto: "Para revisar" },
  { vista: "trasladar", texto: "Para mandar" },
];

export default function DepositoPedidos() {
  const [params, setParams] = useSearchParams();
  const vista: VistaDeposito = params.get("vista") === "trasladar" ? "trasladar" : "revisar";
  const [page, setPage] = useState(1);

  const q = useQuery({
    queryKey: ["pedidos", "deposito", "lista", { vista, page }],
    queryFn: () => depositoApi.lista(vista, page),
    placeholderData: keepPreviousData,
  });

  return (
    <main className="pagina ancha">
      <h1>Depósito</h1>

      <div className="pestanas" role="tablist">
        {PESTANAS.map((p) => (
          <button
            key={p.vista}
            role="tab"
            aria-selected={vista === p.vista}
            className={vista === p.vista ? "activa" : ""}
            onClick={() => {
              setParams(p.vista === "revisar" ? {} : { vista: p.vista });
              setPage(1);
            }}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {q.isPending && <p className="estado">Cargando pedidos...</p>}
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof ApiError ? q.error.message : "No se pudieron cargar los pedidos."}
        </p>
      )}
      {q.data && q.data.data.length === 0 && (
        <p className="estado">
          {vista === "revisar" ? "No hay pedidos para revisar." : "No hay nada para mandar."}
        </p>
      )}
      {q.data && q.data.data.length > 0 && (
        <>
          <ul className="lista lista-plana">
            {q.data.data.map((p) => (
              <li key={p.id}>
                <Link to={`/deposito/${p.id}`} className="fila-revision">
                  <span className="fila-titulo fila-revision-repositor">{nombrePedido(p)}</span>
                  <span className="chico">
                    {p.proveedor?.nombre ?? "Sin proveedor"} · {p.repositor.nombre}
                  </span>
                  <span className="fila-revision-rotulos">
                    <span className="rotulo">{nombreSucursal(p.sucursal)}</span>
                  </span>
                  <span className="fila-revision-cantidad">
                    {p._count.items} {p._count.items === 1 ? "producto" : "productos"}
                  </span>
                  <span className="fila-revision-fecha">
                    {formatearFecha(vista === "revisar" ? p.fechaEnvio : p.fechaAprobacion)}
                  </span>
                  {vista === "revisar" && (
                    <span className="fila-revision-estado">
                      <span className="chico">{p.fechaRevisionDeposito ? "Revisado" : "Sin revisar"}</span>
                    </span>
                  )}
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
