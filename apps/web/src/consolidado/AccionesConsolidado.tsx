import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import {
  consolidadoApi,
  type ConsolidadoDetalle,
  type ConsolidadoResumen,
} from "../lib/consolidadoApi";

type Modo = "nada" | "regenerar" | "aprobar";

interface Props {
  periodoId: string;
  consolidado: ConsolidadoDetalle | null;
}

export default function AccionesConsolidado({ periodoId, consolidado }: Props) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<Modo>("nada");
  const [error, setError] = useState<string | null>(null);

  const refrescar = () => {
    setModo("nada");
    void qc.invalidateQueries({ queryKey: ["consolidados"] });
  };
  const alFallar = (err: unknown) => {
    setModo("nada");
    setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
    void qc.invalidateQueries({ queryKey: ["consolidados"] });
  };

  // El borrador viejo se borra en el servidor: se fija el nuevo en caché y se descarta el viejo
  // para que no se vuelva a pedir su id (daría 404)
  const alGenerar = (nuevo: ConsolidadoDetalle) => {
    const viejoId = consolidado?.id;
    qc.setQueryData(["consolidados", "detalle", nuevo.id], nuevo);
    qc.setQueryData<ConsolidadoResumen[]>(["consolidados", "lista", periodoId], (lista) => [
      {
        id: nuevo.id,
        estado: nuevo.estado,
        periodoId,
        createdAt: new Date().toISOString(),
        fechaAprobacion: nuevo.fechaAprobacion,
        aprobadoPor: nuevo.aprobadoPor,
        _count: { items: nuevo.items.length },
      },
      ...(lista ?? []).filter((c) => c.id !== viejoId && c.id !== nuevo.id),
    ]);
    if (viejoId && viejoId !== nuevo.id) {
      qc.removeQueries({ queryKey: ["consolidados", "detalle", viejoId] });
    }
    setModo("nada");
    void qc.invalidateQueries({ queryKey: ["consolidados", "lista"] });
  };

  const generar = useMutation({
    mutationFn: () => consolidadoApi.generar(periodoId),
    onSuccess: alGenerar,
    onError: alFallar,
  });
  const aprobar = useMutation({
    mutationFn: () => consolidadoApi.aprobar(consolidado?.id ?? ""),
    onSuccess: refrescar,
    onError: alFallar,
  });
  const ocupado = generar.isPending || aprobar.isPending;
  const borrador = consolidado?.estado === "BORRADOR";

  const pedir = (m: Modo) => {
    setError(null);
    setModo(m);
  };

  return (
    <section className="bloque">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {modo === "nada" && (
        <div className="acciones">
          {!consolidado && (
            <button className="boton" disabled={ocupado} onClick={() => generar.mutate()}>
              {generar.isPending ? "Generando..." : "Generar consolidado"}
            </button>
          )}
          {borrador && (
            <>
              <button className="boton" onClick={() => pedir("aprobar")}>
                Aprobar
              </button>
              <button className="boton secundario sin-margen" onClick={() => pedir("regenerar")}>
                Regenerar
              </button>
            </>
          )}
          {consolidado && (
            <a
              className="boton secundario sin-margen"
              href={consolidadoApi.urlExcel(consolidado.id)}
              download
            >
              Descargar Excel
            </a>
          )}
        </div>
      )}

      {modo === "regenerar" && (
        <div className="confirmar" role="dialog" aria-label="Confirmar regeneración">
          <p>Se vuelve a calcular con los pedidos actuales y se pierden los ajustes que hiciste a mano.</p>
          <button className="boton peligro" disabled={ocupado} onClick={() => generar.mutate()}>
            {generar.isPending ? "Regenerando..." : "Sí, regenerar"}
          </button>
          <button className="boton secundario" disabled={ocupado} onClick={() => setModo("nada")}>
            Cancelar
          </button>
        </div>
      )}

      {modo === "aprobar" && (
        <div className="confirmar" role="dialog" aria-label="Confirmar aprobación">
          <p>¿Aprobás el consolidado? Después no se puede cambiar.</p>
          <button className="boton" disabled={ocupado} onClick={() => aprobar.mutate()}>
            {aprobar.isPending ? "Aprobando..." : "Sí, aprobar"}
          </button>
          <button className="boton secundario" disabled={ocupado} onClick={() => setModo("nada")}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
