import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { nombrePedido, pedidosApi } from "../lib/pedidosApi";
import SelectorProveedor from "../pedidos/SelectorProveedor";
import { EstadoEtiqueta } from "../revision/comun";

export default function PedidoRepositor() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [eligiendo, setEligiendo] = useState(false);
  const lista = useQuery({ queryKey: ["pedidos", "mis-pedidos"], queryFn: pedidosApi.misPedidos });

  const crear = useMutation({
    mutationFn: (proveedorId: string | undefined) => pedidosApi.crear({ proveedorId }),
    onSuccess: (pedido) => {
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
      navigate(`/pedido/${pedido.id}`);
    },
  });

  return (
    <>
      <section className="bloque">
        <h2>Nuevo pedido</h2>
        {eligiendo ? (
          <SelectorProveedor
            deshabilitado={crear.isPending}
            alElegir={(id) => crear.mutate(id)}
            alCancelar={() => setEligiendo(false)}
          />
        ) : (
          <button className="boton" type="button" onClick={() => setEligiendo(true)}>
            Nuevo pedido
          </button>
        )}
        {crear.isPending && <p className="chico">Creando...</p>}
        {crear.isError && (
          <p className="error" role="alert">
            {crear.error instanceof ApiError ? crear.error.message : "Ocurrió un error inesperado."}
          </p>
        )}
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
                <Link to={`/pedido/${p.id}`} className="fila-revision compacta">
                  <span className="fila-titulo fila-revision-repositor">{nombrePedido(p)}</span>
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
