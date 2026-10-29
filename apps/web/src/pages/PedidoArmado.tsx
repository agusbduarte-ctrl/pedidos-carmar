import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { pedidosApi, type PedidoCompleto } from "../lib/pedidosApi";
import { EstadoEtiqueta } from "../revision/comun";
import BuscadorProductos from "../pedidos/BuscadorProductos";
import ListaItems from "../pedidos/ListaItems";

function EditorTitulo({ pedido }: { pedido: PedidoCompleto }) {
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState(pedido.titulo ?? "");
  const guardar = useMutation({
    mutationFn: () => pedidosApi.cambiarTitulo(pedido.id, titulo.trim() === "" ? null : titulo.trim()),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["pedidos"] }),
  });
  const sinCambios = titulo.trim() === (pedido.titulo ?? "");

  return (
    <form
      className="bloque"
      onSubmit={(e) => {
        e.preventDefault();
        guardar.mutate();
      }}
    >
      <label>
        Título del pedido (opcional)
        <input
          type="text"
          maxLength={80}
          value={titulo}
          placeholder="Ej: Arcor viernes"
          onChange={(e) => setTitulo(e.target.value)}
        />
      </label>
      {guardar.isError && (
        <p className="error" role="alert">
          {guardar.error instanceof ApiError ? guardar.error.message : "No se pudo guardar el título."}
        </p>
      )}
      <button className="boton secundario" type="submit" disabled={guardar.isPending || sinCambios}>
        {guardar.isPending ? "Guardando..." : "Guardar título"}
      </button>
    </form>
  );
}

export default function PedidoArmado() {
  const { id = "" } = useParams();
  const qc = useQueryClient();
  const [confirmandoEnvio, setConfirmandoEnvio] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<{ mensaje: string; detalles: string[] } | null>(null);

  const q = useQuery({
    queryKey: ["pedidos", "detalle", id],
    queryFn: () => pedidosApi.detalle(id),
    enabled: id !== "",
  });

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

  const volver = (
    <p>
      <Link to="/">Volver a mis pedidos</Link>
    </p>
  );

  if (q.isPending) {
    return (
      <main className="pagina">
        {volver}
        <p className="estado">Cargando pedido...</p>
      </main>
    );
  }
  if (q.isError) {
    return (
      <main className="pagina">
        {volver}
        <p className="error" role="alert">
          {q.error instanceof ApiError ? q.error.message : "No se pudo cargar el pedido."}
        </p>
      </main>
    );
  }

  const pedido = q.data;
  const editable = pedido.estado === "BORRADOR" || pedido.estado === "DEVUELTO";

  return (
    <main className="pagina">
      {volver}
      <h1>{pedido.titulo ?? "Pedido sin título"}</h1>
      <p className="encabezado-pedido">
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

      {editable && <EditorTitulo key={pedido.titulo ?? ""} pedido={pedido} />}

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
    </main>
  );
}
