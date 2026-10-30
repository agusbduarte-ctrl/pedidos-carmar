import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { pedidosApi } from "../lib/pedidosApi";
import { EstadoEtiqueta } from "../revision/comun";

export default function PedidoRepositor() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [titulo, setTitulo] = useState("");
  const lista = useQuery({ queryKey: ["pedidos", "mis-pedidos"], queryFn: pedidosApi.misPedidos });

  const crear = useMutation({
    mutationFn: () => pedidosApi.crear(titulo.trim() || undefined),
    onSuccess: (pedido) => {
      setTitulo("");
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
      navigate(`/pedido/${pedido.id}`);
    },
  });

  return (
    <>
      <section className="bloque">
        <h2>Nuevo pedido</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        >
          <label>
            Título (opcional)
            <input
              type="text"
              maxLength={80}
              value={titulo}
              placeholder="Ej: Arcor viernes"
              onChange={(e) => setTitulo(e.target.value)}
            />
          </label>
          {crear.isError && (
            <p className="error" role="alert">
              {crear.error instanceof ApiError ? crear.error.message : "Ocurrió un error inesperado."}
            </p>
          )}
          <button className="boton" type="submit" disabled={crear.isPending}>
            {crear.isPending ? "Creando..." : "Nuevo pedido"}
          </button>
        </form>
      </section>

      <section className="bloque">
        <h2>Mis pedidos</h2>
        {lista.isPending && <p className="estado">Cargando...</p>}
        {lista.isError && (
          <p className="error" role="alert">
            {lista.error instanceof ApiError ? lista.error.message : "No se pudo cargar tus pedidos."}
          </p>
        )}
        {lista.data && lista.data.length === 0 && (
          <p className="estado">Todavía no tenés pedidos. Empezá uno con el botón de arriba.</p>
        )}
        {lista.data && lista.data.length > 0 && (
          <ul className="lista lista-plana">
            {lista.data.map((p) => (
              <li key={p.id}>
                <Link to={`/pedido/${p.id}`} className="fila-revision">
                  <span className="fila-titulo fila-revision-repositor">{p.titulo ?? "Pedido sin título"}</span>
                  <span className="fila-revision-rotulos">
                    <span className="rotulo">{p.periodo.nombre}</span>
                  </span>
                  <span className="fila-revision-cantidad">
                    {p._count.items} {p._count.items === 1 ? "producto" : "productos"}
                  </span>
                  <span className="fila-revision-estado">
                    <EstadoEtiqueta estado={p.estado} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
