import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { pedidosApi, type PedidoCompleto } from "../lib/pedidosApi";
import { formatearCantidad } from "../revision/mensajeProveedor";

const UNIDADES_DECIMALES = ["KG", "LT"];

// Devuelve el número (0 = quitar) o un texto de error
function validar(texto: string, unidad: string): number | string {
  if (texto.trim() === "") return 0;
  const n = Number(texto.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return "Poné una cantidad válida.";
  if (!UNIDADES_DECIMALES.includes(unidad) && !Number.isInteger(n)) {
    return `Para ${unidad} la cantidad tiene que ser un número entero.`;
  }
  if (n > 99_999_999.99) return "La cantidad es demasiado grande.";
  return n;
}

interface Props {
  pedido: PedidoCompleto;
  alCambiarSinGuardar: (hay: boolean) => void;
}

export default function Sugeridos({ pedido, alCambiarSinGuardar }: Props) {
  const qc = useQueryClient();
  const proveedor = pedido.proveedor;
  const [editado, setEditado] = useState<Record<string, string>>({});
  const [errores, setErrores] = useState<string[]>([]);
  const [guardado, setGuardado] = useState(false);
  const [repetido, setRepetido] = useState<string | null>(null);
  const [errorRepetir, setErrorRepetir] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["pedidos", "sugeridos", pedido.id],
    queryFn: () => pedidosApi.sugeridos(pedido.id),
    enabled: proveedor !== null,
  });

  const actual = new Map(pedido.items.map((i) => [i.productoId, Number(i.cantidad)]));

  // Filas cuyo valor tipeado es distinto de lo que hay en el pedido
  const cambios = (q.data ?? []).flatMap((s) => {
    const texto = editado[s.producto.id];
    if (texto === undefined) return [];
    const v = validar(texto, s.producto.unidad);
    const previo = actual.get(s.producto.id) ?? 0;
    if (typeof v === "number" && v === previo) return [];
    return [{ s, v }];
  });
  const haySinGuardar = cambios.length > 0;

  useEffect(() => {
    alCambiarSinGuardar(haySinGuardar);
  }, [haySinGuardar, alCambiarSinGuardar]);

  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["pedidos"] });
  };

  const guardar = useMutation({
    mutationFn: (items: { productoId: string; cantidad: number }[]) =>
      pedidosApi.fijarCantidades(pedido.id, items),
    onSuccess: () => {
      setEditado({});
      setErrores([]);
      setGuardado(true);
      refrescar();
    },
    onError: (err) => {
      setGuardado(false);
      setErrores(
        err instanceof ApiError ? [err.message, ...err.detalles] : ["Ocurrió un error inesperado."],
      );
    },
  });

  const repetir = useMutation({
    mutationFn: () => pedidosApi.repetirUltimo(pedido.id),
    onSuccess: (r) => {
      setErrorRepetir(null);
      setEditado({});
      setRepetido(
        `Se copiaron ${r.copiados} ${r.copiados === 1 ? "producto" : "productos"}` +
          (r.omitidos > 0
            ? `. ${r.omitidos} ${r.omitidos === 1 ? "no se pudo copiar" : "no se pudieron copiar"}.`
            : "."),
      );
      refrescar();
    },
    onError: (err) => {
      setRepetido(null);
      setErrorRepetir(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
    },
  });

  const onGuardar = () => {
    setGuardado(false);
    const invalidos: string[] = [];
    const items: { productoId: string; cantidad: number }[] = [];
    for (const { s, v } of cambios) {
      if (typeof v === "string") invalidos.push(`${s.producto.nombre}: ${v}`);
      else items.push({ productoId: s.producto.id, cantidad: v });
    }
    if (invalidos.length > 0) {
      setErrores(["Revisá estas cantidades:", ...invalidos]);
      return;
    }
    setErrores([]);
    if (items.length === 0) return;
    guardar.mutate(items);
  };

  if (!proveedor) return null;

  return (
    <section className="bloque">
      <h2>Lo que le pedís a {proveedor.nombre}</h2>
      <button
        className="boton secundario"
        type="button"
        disabled={repetir.isPending}
        onClick={() => {
          setRepetido(null);
          repetir.mutate();
        }}
      >
        {repetir.isPending ? "Copiando..." : "Repetir último pedido"}
      </button>
      {repetido && <p className="ok">{repetido}</p>}
      {errorRepetir && (
        <p className="error" role="alert">
          {errorRepetir}
        </p>
      )}

      {q.isPending && <p className="chico">Cargando productos...</p>}
      {q.isError && (
        <p className="error" role="alert">
          {q.error instanceof ApiError ? q.error.message : "No se pudo cargar los productos."}
        </p>
      )}
      {q.data && q.data.length === 0 && (
        <p className="chico">
          Todavía no hay productos de este proveedor. Buscalos abajo y la próxima vez van a aparecer acá.
        </p>
      )}
      {q.data && q.data.length > 0 && (
        <>
          <ul className="lista lista-plana">
            {q.data.map((s) => {
              const p = s.producto;
              const previo = actual.get(p.id);
              const valor = editado[p.id] ?? (previo !== undefined ? formatearCantidad(previo) : "");
              return (
                <li key={p.id} className="fila-producto">
                  <div className="producto-nombre">{p.nombre}</div>
                  <div className="chico producto-datos">
                    <span>{p.unidad}</span>
                    {s.ultimaCantidad !== null && (
                      <span>La última vez: {formatearCantidad(s.ultimaCantidad)}</span>
                    )}
                  </div>
                  <label>
                    Cantidad ({p.unidad})
                    <input
                      type="text"
                      inputMode={UNIDADES_DECIMALES.includes(p.unidad) ? "decimal" : "numeric"}
                      value={valor}
                      onChange={(e) => {
                        setEditado({ ...editado, [p.id]: e.target.value });
                        setGuardado(false);
                        setErrores([]);
                      }}
                    />
                  </label>
                </li>
              );
            })}
          </ul>
          {errores.length > 0 && (
            <div className="error" role="alert">
              <ul>
                {errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </div>
          )}
          {guardado && <p className="ok">Cantidades guardadas.</p>}
          <button className="boton" type="button" disabled={guardar.isPending} onClick={onGuardar}>
            {guardar.isPending ? "Guardando..." : "Guardar cantidades"}
          </button>
        </>
      )}
    </section>
  );
}
