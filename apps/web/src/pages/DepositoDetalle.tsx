import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import Cantidad from "../components/Cantidad";
import { nombrePedido } from "../lib/pedidosApi";
import { depositoApi, type ItemDeposito, type PedidoDepositoDetalle } from "../lib/depositoApi";
import { formatearCantidad } from "../revision/mensajeProveedor";
import { formatearFechaCorta, nombreSucursal } from "../revision/comun";

const volver = (
  <p>
    <Link to="/deposito">Volver a la lista</Link>
  </p>
);

function numeroSucursal(p: PedidoDepositoDetalle): string {
  return p.sucursal.replace("CARMAR_", "");
}

function validar(item: ItemDeposito, texto: string): { valor: number } | { error: string } {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return { valor: 0 };
  const n = Number(limpio);
  const nombre = item.producto.nombre;
  if (!Number.isFinite(n) || n < 0) return { error: `${nombre}: escribí un número, 0 o más.` };
  if (n > Number(item.cantidad)) {
    return { error: `${nombre}: no puede ser más de lo pedido (${formatearCantidad(item.cantidad)}).` };
  }
  const decimal = item.producto.unidad === "KG" || item.producto.unidad === "LT";
  if (!decimal && !Number.isInteger(n)) return { error: `${nombre}: tiene que ser un número entero.` };
  return { valor: n };
}

function Revision({ pedido }: { pedido: PedidoDepositoDetalle }) {
  const qc = useQueryClient();
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      pedido.items.map((i) => [i.id, i.cantidadDeposito === null ? "" : formatearCantidad(i.cantidadDeposito)]),
    ),
  );
  const [errores, setErrores] = useState<string[]>([]);
  const [guardado, setGuardado] = useState(false);

  const guardar = useMutation({
    mutationFn: (items: { itemId: string; cantidadDeposito: number }[]) =>
      depositoApi.revisar(pedido.id, items),
    onSuccess: () => {
      setErrores([]);
      setGuardado(true);
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
    onError: (err) => {
      setGuardado(false);
      if (err instanceof ApiError) {
        setErrores(err.detalles.length > 0 ? err.detalles : [err.message]);
      } else {
        setErrores(["Ocurrió un error inesperado."]);
      }
    },
  });

  const poner = (id: string, v: string) => {
    setGuardado(false);
    setValores((prev) => ({ ...prev, [id]: v }));
  };

  const enviar = () => {
    setGuardado(false);
    const mensajes: string[] = [];
    const items: { itemId: string; cantidadDeposito: number }[] = [];
    for (const it of pedido.items) {
      const r = validar(it, valores[it.id] ?? "");
      if ("error" in r) mensajes.push(r.error);
      else items.push({ itemId: it.id, cantidadDeposito: r.valor });
    }
    setErrores(mensajes);
    if (mensajes.length === 0) guardar.mutate(items);
  };

  return (
    <>
      {pedido.fechaRevisionDeposito && (
        <div className="aviso ok-aviso" role="status">
          Ya lo revisaste el {formatearFechaCorta(pedido.fechaRevisionDeposito)}. Podés corregirlo mientras la
          encargada no lo apruebe.
        </div>
      )}
      <section className="bloque">
        <h2>Productos ({pedido.items.length})</h2>
        <ul className="lista lista-plana">
          {pedido.items.map((it) => (
            <li key={it.id} className="item-pedido">
              <div className="item-datos">
                <span className="producto-nombre">{it.producto.nombre}</span>
                <span className="codigo">Código {it.producto.codigo}</span>
                <span className="chico">
                  Pidieron: {formatearCantidad(it.cantidad)} {it.producto.unidad}
                </span>
                {it.observacion && <span className="chico">Obs.: {it.observacion}</span>}
                <label>
                  Hay en el galpón
                  <input
                    inputMode="decimal"
                    autoComplete="off"
                    value={valores[it.id] ?? ""}
                    onChange={(e) => poner(it.id, e.target.value)}
                  />
                </label>
                <div className="acciones">
                  <button type="button" className="boton secundario chico-boton" onClick={() => poner(it.id, "0")}>
                    No hay
                  </button>
                  <button
                    type="button"
                    className="boton secundario chico-boton"
                    onClick={() => poner(it.id, formatearCantidad(it.cantidad))}
                  >
                    Hay todo
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {errores.length > 0 && (
        <div className="error" role="alert">
          <ul>
            {errores.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {guardado && <p className="ok">Revisión guardada. La encargada ya lo puede ver.</p>}
      <div className="acciones">
        <button className="boton" disabled={guardar.isPending} onClick={enviar}>
          {guardar.isPending ? "Guardando..." : "Listo, revisado"}
        </button>
      </div>
    </>
  );
}

function Traslado({ pedido }: { pedido: PedidoDepositoDetalle }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [confirmando, setConfirmando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const items = pedido.items.filter((i) => Number(i.cantidadDeposito ?? 0) > 0);
  const texto = [
    `Para mandar a Sucursal ${numeroSucursal(pedido)}:`,
    ...items.map(
      (i) => `• ${i.producto.nombre} — ${formatearCantidad(i.cantidadDeposito ?? 0)} ${i.producto.unidad}`,
    ),
  ].join("\n");

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setErrorCopia(false);
    } catch {
      setCopiado(false);
      setErrorCopia(true);
    }
  };

  const mandado = useMutation({
    mutationFn: () => depositoApi.trasladoEnviado(pedido.id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
      navigate("/deposito?vista=trasladar");
    },
    onError: (err) => {
      setConfirmando(false);
      setError(err instanceof ApiError ? err.message : "Ocurrió un error inesperado.");
      void qc.invalidateQueries({ queryKey: ["pedidos"] });
    },
  });

  return (
    <section className="bloque">
      <h2>Mandar a Sucursal {numeroSucursal(pedido)}</h2>
      {items.length === 0 && <p className="estado">No hay nada para mandar en este pedido.</p>}
      <ul className="lista lista-plana">
        {items.map((i) => (
          <li key={i.id} className="item-pedido">
            <span className="producto-nombre">{i.producto.nombre}</span>
            <Cantidad valor={i.cantidadDeposito ?? 0} unidad={i.producto.unidad} />
          </li>
        ))}
      </ul>

      {pedido.fechaTrasladoEnviado ? (
        <p className="ok">Mandado el {formatearFechaCorta(pedido.fechaTrasladoEnviado)}</p>
      ) : (
        <>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {copiado && <p className="ok">Copiado</p>}
          {errorCopia && (
            <p className="error" role="alert">
              No se pudo copiar. Seleccioná el texto y copialo a mano.
            </p>
          )}
          {!confirmando ? (
            <div className="acciones">
              <button className="boton secundario" type="button" onClick={() => void copiar()}>
                Copiar lista
              </button>
              <button className="boton" type="button" onClick={() => setConfirmando(true)}>
                Ya lo mandé
              </button>
            </div>
          ) : (
            <div className="confirmar" role="dialog" aria-label="Confirmar envío">
              <p>¿Ya mandaste todo esto a la Sucursal {numeroSucursal(pedido)}?</p>
              <button className="boton" disabled={mandado.isPending} onClick={() => mandado.mutate()}>
                {mandado.isPending ? "Guardando..." : "Sí, ya lo mandé"}
              </button>
              <button className="boton secundario" disabled={mandado.isPending} onClick={() => setConfirmando(false)}>
                No
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

export default function DepositoDetalle() {
  const { id = "" } = useParams();
  const q = useQuery({
    queryKey: ["pedidos", "deposito", "detalle", id],
    queryFn: () => depositoApi.detalle(id),
    enabled: id !== "",
  });

  if (q.isPending) {
    return (
      <main className="pagina ancha">
        {volver}
        <p className="estado">Cargando pedido...</p>
      </main>
    );
  }
  if (q.isError) {
    return (
      <main className="pagina ancha">
        {volver}
        <p className="error" role="alert">
          {q.error instanceof ApiError ? q.error.message : "No se pudo cargar el pedido."}
        </p>
      </main>
    );
  }

  const p = q.data;
  return (
    <main className="pagina ancha">
      {volver}
      <h1>{nombrePedido(p)}</h1>
      <p className="chico">
        {nombreSucursal(p.sucursal)} · {p.proveedor?.nombre ?? "Sin proveedor"} · {p.repositor.nombre}
      </p>
      {p.estado === "ENVIADO" && <Revision key={p.id + (p.fechaRevisionDeposito ?? "")} pedido={p} />}
      {p.estado === "APROBADO" && <Traslado pedido={p} />}
      {p.estado !== "ENVIADO" && p.estado !== "APROBADO" && (
        <p className="aviso">Este pedido ya no está para revisar.</p>
      )}
    </main>
  );
}
