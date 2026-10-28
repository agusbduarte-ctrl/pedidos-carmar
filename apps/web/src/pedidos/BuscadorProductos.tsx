import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { pedidosApi, type ProductoBuscado } from "../lib/pedidosApi";

const UNIDADES_DECIMALES = ["KG", "LT"];

function mensajeError(err: unknown): string {
  if (err instanceof ApiError) return [err.message, ...err.detalles].join(" ");
  return "Ocurrió un error inesperado.";
}

function validarCantidad(texto: string, unidad: string): number | string {
  const n = Number(texto.replace(",", "."));
  if (texto.trim() === "" || !Number.isFinite(n) || n <= 0) return "Poné una cantidad mayor a cero.";
  if (!UNIDADES_DECIMALES.includes(unidad) && !Number.isInteger(n)) {
    return `Para ${unidad} la cantidad tiene que ser un número entero.`;
  }
  if (n > 99_999_999.99) return "La cantidad es demasiado grande.";
  return n;
}

function FilaProducto({ pedidoId, producto }: { pedidoId: string; producto: ProductoBuscado }) {
  const qc = useQueryClient();
  const [cantidad, setCantidad] = useState("");
  const [observacion, setObservacion] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [agregado, setAgregado] = useState(false);

  const agregar = useMutation({
    mutationFn: (v: { cantidad: number; observacion?: string }) =>
      pedidosApi.agregarItem(pedidoId, { productoId: producto.id, ...v }),
    onSuccess: () => {
      setCantidad("");
      setObservacion("");
      setAgregado(true);
      void qc.invalidateQueries({ queryKey: ["pedidos", "detalle"] });
      void qc.invalidateQueries({ queryKey: ["pedidos", "mis-pedidos"] });
    },
    onError: (err) => setError(mensajeError(err)),
  });

  const decimal = UNIDADES_DECIMALES.includes(producto.unidad);

  return (
    <li className="fila-producto">
      <div className="producto-nombre">{producto.nombre}</div>
      <div className="chico producto-datos">
        <span>{producto.codigo}</span>
        <span>{producto.rubro.nombre}</span>
        <span>{producto.unidad}</span>
      </div>
      <label>
        Cantidad ({producto.unidad})
        <input
          type="text"
          inputMode={decimal ? "decimal" : "numeric"}
          value={cantidad}
          onChange={(e) => {
            setCantidad(e.target.value);
            setError(null);
            setAgregado(false);
          }}
        />
      </label>
      <label>
        Observación (opcional)
        <input
          type="text"
          maxLength={200}
          value={observacion}
          onChange={(e) => setObservacion(e.target.value)}
        />
      </label>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {agregado && <p className="ok">Agregado al pedido.</p>}
      <button
        className="boton"
        disabled={agregar.isPending}
        onClick={() => {
          const v = validarCantidad(cantidad, producto.unidad);
          if (typeof v === "string") {
            setError(v);
            return;
          }
          setError(null);
          const obs = observacion.trim();
          agregar.mutate({ cantidad: v, ...(obs ? { observacion: obs } : {}) });
        }}
      >
        {agregar.isPending ? "Agregando..." : "Agregar"}
      </button>
    </li>
  );
}

export default function BuscadorProductos({ pedidoId }: { pedidoId: string }) {
  const [texto, setTexto] = useState("");
  const [q, setQ] = useState("");
  const [rubroId, setRubroId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => {
      setQ(texto.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [texto]);

  const rubros = useQuery({ queryKey: ["rubros", "mis-rubros"], queryFn: pedidosApi.misRubros });

  const qEfectiva = q.length >= 2 ? q : "";
  const buscar = qEfectiva !== "" || rubroId !== "";
  const productos = useQuery({
    queryKey: ["productos", qEfectiva, rubroId, page],
    queryFn: () => pedidosApi.productos({ q: qEfectiva, rubroId, page }),
    enabled: buscar,
  });

  return (
    <section className="bloque">
      <h2>Buscar productos</h2>
      <label>
        Nombre o código
        <input
          type="search"
          value={texto}
          placeholder="Escribí al menos 2 letras"
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      <label>
        Rubro
        <select
          value={rubroId}
          onChange={(e) => {
            setRubroId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos mis rubros</option>
          {rubros.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre}
            </option>
          ))}
        </select>
      </label>
      {!buscar && <p className="chico">Escribí 2 letras o elegí un rubro para ver productos.</p>}
      {buscar && productos.isPending && <p className="chico">Buscando...</p>}
      {productos.isError && (
        <p className="error" role="alert">
          {mensajeError(productos.error)}
        </p>
      )}
      {buscar && productos.data && productos.data.data.length === 0 && (
        <p className="chico">No se encontraron productos.</p>
      )}
      {buscar && productos.data && (
        <ul className="lista lista-plana">
          {productos.data.data.map((p) => (
            <FilaProducto key={p.id} pedidoId={pedidoId} producto={p} />
          ))}
        </ul>
      )}
      {buscar && productos.data && productos.data.meta.totalPages > 1 && (
        <div className="paginas">
          <button className="boton secundario" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Anterior
          </button>
          <span>
            {page} de {productos.data.meta.totalPages}
          </span>
          <button
            className="boton secundario"
            disabled={page >= productos.data.meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Siguiente
          </button>
        </div>
      )}
    </section>
  );
}
