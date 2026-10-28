import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { pedidosApi, type ItemPedido } from "../lib/pedidosApi";

export default function ListaItems({
  pedidoId,
  items,
  editable,
}: {
  pedidoId: string;
  items: ItemPedido[];
  editable: boolean;
}) {
  const qc = useQueryClient();
  const [confirmando, setConfirmando] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const quitar = useMutation({
    mutationFn: (itemId: string) => pedidosApi.quitarItem(pedidoId, itemId),
    onSuccess: () => {
      setConfirmando(null);
      setError(null);
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (err) => {
      setConfirmando(null);
      setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
    },
  });

  if (items.length === 0) return <p className="chico">Todavía no cargaste productos.</p>;

  return (
    <>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="lista">
        {items.map((it) => (
          <li key={it.id} className="tarjeta">
            <div className="producto-nombre">{it.producto.nombre}</div>
            <div className="chico">
              {it.producto.codigo} · <strong>{Number(it.cantidad)}</strong> {it.producto.unidad}
            </div>
            {it.observacion && <div className="chico">Obs.: {it.observacion}</div>}
            {editable &&
              (confirmando === it.id ? (
                <div className="confirmar">
                  <p>¿Quitar este producto del pedido?</p>
                  <button
                    className="boton peligro"
                    disabled={quitar.isPending}
                    onClick={() => quitar.mutate(it.id)}
                  >
                    {quitar.isPending ? "Quitando..." : "Sí, quitar"}
                  </button>
                  <button className="boton secundario" onClick={() => setConfirmando(null)}>
                    No
                  </button>
                </div>
              ) : (
                <button className="boton secundario" onClick={() => setConfirmando(it.id)}>
                  Quitar
                </button>
              ))}
          </li>
        ))}
      </ul>
    </>
  );
}
