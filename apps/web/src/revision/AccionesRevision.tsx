import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { revisionApi } from "../lib/revisionApi";

const MAX_COMENTARIO = 500;

function mensajeError(err: unknown): string {
  return err instanceof ApiError ? err.message : "Ocurrió un error inesperado.";
}

type Modo = "nada" | "aprobar" | "devolver";

export default function AccionesRevision({ pedidoId }: { pedidoId: string }) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<Modo>("nada");
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState<string | null>(null);

  const alTerminar = () => {
    setModo("nada");
    setError(null);
    void qc.invalidateQueries({ queryKey: ["pedidos"] });
  };
  const alFallar = (err: unknown) => {
    setModo("nada");
    setError(mensajeError(err));
    // Puede que otra encargada ya haya resuelto el pedido: refrescar
    void qc.invalidateQueries({ queryKey: ["pedidos"] });
  };

  const aprobar = useMutation({
    mutationFn: () => revisionApi.aprobar(pedidoId),
    onSuccess: alTerminar,
    onError: alFallar,
  });
  const devolver = useMutation({
    mutationFn: () => revisionApi.devolver(pedidoId, comentario.trim()),
    onSuccess: alTerminar,
    onError: alFallar,
  });
  const ocupado = aprobar.isPending || devolver.isPending;

  return (
    <section className="bloque">
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {modo === "nada" && (
        <div className="acciones barra-acciones">
          <button
            className="boton"
            onClick={() => {
              setError(null);
              setModo("aprobar");
            }}
          >
            Aprobar
          </button>
          <button
            className="boton peligro"
            onClick={() => {
              setError(null);
              setModo("devolver");
            }}
          >
            Devolver
          </button>
        </div>
      )}

      {modo === "aprobar" && (
        <div className="confirmar" role="dialog" aria-label="Confirmar aprobación">
          <p>¿Aprobás este pedido? Después no se puede cambiar.</p>
          <button className="boton" disabled={ocupado} onClick={() => aprobar.mutate()}>
            {aprobar.isPending ? "Aprobando..." : "Sí, aprobar"}
          </button>
          <button className="boton secundario" disabled={ocupado} onClick={() => setModo("nada")}>
            Cancelar
          </button>
        </div>
      )}

      {modo === "devolver" && (
        <div className="confirmar" role="dialog" aria-label="Devolver pedido">
          <label>
            Motivo de la devolución (el repositor lo va a ver)
            <textarea
              value={comentario}
              maxLength={MAX_COMENTARIO}
              rows={4}
              onChange={(e) => setComentario(e.target.value)}
            />
          </label>
          <p className="chico contador">
            {comentario.length} / {MAX_COMENTARIO}
          </p>
          <button
            className="boton peligro"
            disabled={ocupado || comentario.trim().length === 0}
            onClick={() => devolver.mutate()}
          >
            {devolver.isPending ? "Devolviendo..." : "Devolver pedido"}
          </button>
          <button className="boton secundario" disabled={ocupado} onClick={() => setModo("nada")}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}
