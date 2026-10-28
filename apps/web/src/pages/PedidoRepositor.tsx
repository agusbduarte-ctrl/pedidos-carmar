import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { pedidosApi, type EstadoPedido } from "../lib/pedidosApi";
import BuscadorProductos from "../pedidos/BuscadorProductos";
import ListaItems from "../pedidos/ListaItems";

const ETIQUETAS: Record<EstadoPedido, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  DEVUELTO: "Devuelto",
  APROBADO: "Aprobado",
};

function EstadoEtiqueta({ estado }: { estado: EstadoPedido }) {
  return <span className={`etiqueta ${estado.toLowerCase()}`}>{ETIQUETAS[estado]}</span>;
}

function PedidoDetalle({ id }: { id: string }) {
  const qc = useQueryClient();
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<{ mensaje: string; detalles: string[] } | null>(null);

  const q = useQuery({ queryKey: ["pedidos", "detalle", id], queryFn: () => pedidosApi.detalle(id) });

  const enviar = useMutation({
    mutationFn: () => pedidosApi.enviar(id),
    onSuccess: () => {
      setConfirmandoEnvio(false);
      setErrorEnvio(null);
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (err) => {
      setConfirmandoEnvio(false);
      setErrorEnvio(
        err instanceof ApiError
          ? { mensaje: err.message, detalles: err.detalles }
          : { mensaje: "Ocurrió un error inesperado.", detalles: [] },
      );
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
  });

  if (q.isPending) return <p className="estado">Cargando pedido...</p>;
  if (q.isError) {
    return (
      <p className="error" role="alert">
        {q.error instanceof ApiError ? q.error.message : "No se pudo cargar el pedido."}
      </p>
    );
  }

  const pedido = q.data;
  const editable = pedido.estado === "BORRADOR" || pedido.estado === "DEVUELTO";

  return (
    <>
      <p>
        {pedido.periodo.nombre} <EstadoEtiqueta estado={pedido.estado} />
      </p>

      {pedido.estado === "DEVUELTO" && (
        <div className="aviso devuelto" role="status">
          <strong>La encargada te devolvió el pedido.</strong>
          <p>{pedido.comentarioDevolucion ?? "Sin comentario."}</p>
          <p>Corregilo y volvé a enviarlo.</p>
        </div>
      )}
      {pedido.estado === "ENVIADO" && (
        <div className="aviso" role="status">
          Tu pedido ya fue enviado. Está esperando la revisión de la encargada y no se puede cambiar.
        </div>
      )}
      {pedido.estado === "APROBADO" && (
        <div className="aviso ok-aviso" role="status">
          Tu pedido fue aprobado. Ya no se puede cambiar.
        </div>
      )}

      <section className="bloque">
        <h2>Tu pedido ({pedido.items.length})</h2>
        <ListaItems pedidoId={pedido.id} items={pedido.items} editable={editable} />
      </section>

      {editable && (
        <>
          <section className="bloque">
            {errorEnvio && (
              <div className="error" role="alert">
                <p>{errorEnvio.mensaje}</p>
                {errorEnvio.detalles.length > 0 && (
                  <ul>
                    {errorEnvio.detalles.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {confirmandoEnvio ? (
              <div className="confirmar">
                <p>¿Enviás el pedido a la encargada? Después no vas a poder cambiarlo.</p>
                <button className="boton" disabled={enviar.isPending} onClick={() => enviar.mutate()}>
                  {enviar.isPending ? "Enviando..." : "Sí, enviar"}
                </button>
                <button
                  className="boton secundario"
                  disabled={enviar.isPending}
                  onClick={() => setConfirmandoEnvio(false)}
                >
                  No, seguir editando
                </button>
              </div>
            ) : (
              <button
                className="boton"
                disabled={pedido.items.length === 0}
                onClick={() => {
                  setErrorEnvio(null);
                  setConfirmandoEnvio(true);
                }}
              >
                Enviar pedido
              </button>
            )}
          </section>
          <BuscadorProductos pedidoId={pedido.id} />
        </>
      )}
    </>
  );
}

export default function PedidoRepositor() {
  const qc = useQueryClient();
  const lista = useQuery({ queryKey: ["pedidos", "mis-pedidos"], queryFn: pedidosApi.misPedidos });

  const crear = useMutation({
    mutationFn: pedidosApi.crear,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pedidos"] }),
  });

  if (lista.isPending) return <p className="estado">Cargando...</p>;
  if (lista.isError) {
    return (
      <p className="error" role="alert">
        {lista.error instanceof ApiError ? lista.error.message : "No se pudo cargar tus pedidos."}
      </p>
    );
  }

  // La API los devuelve del más nuevo al más viejo: el actual es el primero del período abierto
  const actual = lista.data.find((p) => p.periodo.estado === "ABIERTO");

  if (!actual) {
    return (
      <section className="bloque">
        <p>Todavía no empezaste tu pedido.</p>
        {crear.isError && (
          <p className="error" role="alert">
            {crear.error instanceof ApiError ? crear.error.message : "Ocurrió un error inesperado."}
          </p>
        )}
        <button className="boton" disabled={crear.isPending} onClick={() => crear.mutate()}>
          {crear.isPending ? "Creando..." : "Empezar pedido"}
        </button>
      </section>
    );
  }

  return <PedidoDetalle id={actual.id} />;
}
