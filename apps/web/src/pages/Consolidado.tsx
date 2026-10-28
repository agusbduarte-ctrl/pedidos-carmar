import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import {
  consolidadoApi,
  type ConsolidadoDetalle,
  type ConsolidadoResumen,
  type ItemConsolidado,
} from "../lib/consolidadoApi";
import { formatearFecha } from "../revision/comun";
import AccionesConsolidado from "../consolidado/AccionesConsolidado";
import TablaItems from "../consolidado/TablaItems";

function mensaje(err: unknown, porDefecto: string): string {
  return err instanceof ApiError ? err.message : porDefecto;
}

// Si hay uno aprobado es ese; si no, el más reciente (la API ya ordena del más nuevo al más viejo)
function elegir(lista: ConsolidadoResumen[]): ConsolidadoResumen | null {
  return lista.find((c) => c.estado === "APROBADO") ?? lista[0] ?? null;
}

export default function Consolidado() {
  const qc = useQueryClient();
  const [elegido, setElegido] = useState("");

  const periodos = useQuery({
    queryKey: ["consolidados", "periodos"],
    queryFn: consolidadoApi.periodos,
  });

  const ordenados = [...(periodos.data ?? [])].sort((a, b) =>
    (b.fechaApertura ?? "").localeCompare(a.fechaApertura ?? ""),
  );
  const periodoId =
    elegido || (ordenados.find((p) => p.estado === "ABIERTO") ?? ordenados[0])?.id || "";
  const periodo = ordenados.find((p) => p.id === periodoId);

  const lista = useQuery({
    queryKey: ["consolidados", "lista", periodoId],
    queryFn: () => consolidadoApi.delPeriodo(periodoId),
    enabled: periodoId !== "",
  });
  const resumen = lista.data ? elegir(lista.data) : null;

  const detalle = useQuery({
    queryKey: ["consolidados", "detalle", resumen?.id],
    queryFn: () => consolidadoApi.detalle(resumen?.id ?? ""),
    enabled: resumen !== null,
  });

  // Guardar un ítem actualiza solo ese ítem en caché: la tabla no se recarga
  const alGuardar = (nuevo: ItemConsolidado) => {
    qc.setQueryData<ConsolidadoDetalle>(["consolidados", "detalle", resumen?.id], (viejo) =>
      viejo
        ? { ...viejo, items: viejo.items.map((it) => (it.id === nuevo.id ? nuevo : it)) }
        : viejo,
    );
  };

  const consolidado = detalle.data ?? null;
  const cargando = periodos.isPending || (periodoId !== "" && lista.isPending);

  return (
    <main className="pagina ancha extra">
      <h1>Consolidado</h1>

      {periodos.isError && (
        <p className="error" role="alert">
          {mensaje(periodos.error, "No se pudieron cargar los períodos.")}
        </p>
      )}
      {periodos.data && ordenados.length === 0 && (
        <p className="estado">Todavía no hay períodos.</p>
      )}

      {ordenados.length > 0 && (
        <section className="barra-consolidado">
          <div className="barra-consolidado-datos">
            <label className="filtro-periodo">
              Período
              <select value={periodoId} onChange={(e) => setElegido(e.target.value)}>
                {ordenados.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.estado === "ABIERTO" ? " (abierto)" : ""}
                  </option>
                ))}
              </select>
            </label>
            {consolidado && (
              <>
                <div className="dato">
                  <span className="dato-rotulo">Estado</span>
                  <span className={`etiqueta ${consolidado.estado === "APROBADO" ? "aprobado" : "enviado"}`}>
                    {consolidado.estado === "APROBADO" ? "Aprobado" : "Borrador"}
                  </span>
                </div>
                <p className="dato dato-cifra">
                  <span className="dato-numero">{consolidado.items.length}</span> productos
                </p>
              </>
            )}
          </div>
          {consolidado && consolidado.estado === "APROBADO" && (
            <p className="chico">
              Aprobado por {consolidado.aprobadoPor?.nombre ?? "-"} el{" "}
              {formatearFecha(consolidado.fechaAprobacion)}. No se puede modificar.
            </p>
          )}
          {/* Sin botones hasta que terminen de cargar bien la lista y el detalle */}
          {periodoId !== "" && lista.isSuccess && (resumen === null || detalle.isSuccess) && (
            <AccionesConsolidado periodoId={periodoId} consolidado={consolidado} />
          )}
        </section>
      )}

      {periodo?.estado === "ABIERTO" && (
        <div className="aviso">
          Todavía pueden llegar pedidos
          <p>Volvé a generar cuando estén todos.</p>
        </div>
      )}

      {cargando && <p className="estado">Cargando...</p>}
      {lista.isError && (
        <p className="error" role="alert">
          {mensaje(lista.error, "No se pudo cargar el consolidado.")}
        </p>
      )}

      {lista.data && !resumen && (
        <div className="aviso">Este período todavía no tiene consolidado.</div>
      )}

      {resumen && detalle.isPending && <p className="estado">Cargando consolidado...</p>}
      {detalle.isError && (
        <p className="error" role="alert">
          {mensaje(detalle.error, "No se pudo cargar el consolidado.")}
        </p>
      )}

      {consolidado && (
        <TablaItems
          consolidadoId={consolidado.id}
          items={consolidado.items}
          editable={consolidado.estado === "BORRADOR"}
          alGuardar={alGuardar}
        />
      )}
    </main>
  );
}
