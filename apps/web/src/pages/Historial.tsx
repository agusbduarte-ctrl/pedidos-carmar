import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ApiError, type Sucursal } from "../lib/api";
import { historialApi, type FiltroHistorial } from "../lib/historialApi";
import { Paginacion } from "../admin/comun";
import { EstadoEtiqueta, nombreSucursal } from "../revision/comun";
import { formatearCantidad } from "../revision/mensajeProveedor";

function aInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function filtroInicial(): FiltroHistorial {
  const hoy = new Date();
  const ini = new Date();
  ini.setDate(ini.getDate() - 29);
  return { desde: aInput(ini), hasta: aInput(hoy), proveedorId: "", sucursal: "", q: "", estado: "APROBADO" };
}

function fechaCorta(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const msg = (e: unknown, def: string) => (e instanceof ApiError ? e.message : def);

export default function Historial() {
  const [form, setForm] = useState<FiltroHistorial>(filtroInicial);
  const [aplicado, setAplicado] = useState<FiltroHistorial>(form);
  const [page, setPage] = useState(1);
  const [bajando, setBajando] = useState(false);
  const [errorExcel, setErrorExcel] = useState("");

  const proveedores = useQuery({ queryKey: ["historial", "proveedores"], queryFn: historialApi.proveedores });
  const lista = useQuery({
    queryKey: ["historial", "lista", aplicado, page],
    queryFn: () => historialApi.listar(aplicado, page),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const cambiar = (c: Partial<FiltroHistorial>) => {
    const nuevo = { ...form, ...c };
    setForm(nuevo);
    // Fechas y selectores se aplican al instante; el texto espera Enter o el botón
    setAplicado((a) => ({ ...nuevo, q: a.q }));
    setPage(1);
  };
  const buscar = () => {
    setAplicado(form);
    setPage(1);
  };
  const descargar = async () => {
    setErrorExcel("");
    setBajando(true);
    try {
      await historialApi.descargarExcel(aplicado);
    } catch (e) {
      setErrorExcel(msg(e, "No se pudo descargar el Excel."));
    } finally {
      setBajando(false);
    }
  };

  const filas = lista.data?.data ?? [];
  const resumen = lista.data?.resumen ?? [];

  return (
    <main className="pagina ancha extra">
      <h1>Historial</h1>
      <p>Qué se pidió, cuándo y cuánto.</p>

      <form
        className="barra-filtros"
        onSubmit={(e) => {
          e.preventDefault();
          buscar();
        }}
      >
        <label className="filtro">
          Desde
          <input type="date" value={form.desde} onChange={(e) => cambiar({ desde: e.target.value })} />
        </label>
        <label className="filtro">
          Hasta
          <input type="date" value={form.hasta} onChange={(e) => cambiar({ hasta: e.target.value })} />
        </label>
        <label className="filtro">
          Proveedor
          <select value={form.proveedorId} onChange={(e) => cambiar({ proveedorId: e.target.value })}>
            <option value="">Todos</option>
            {(proveedores.data ?? []).filter((p) => p.nombre !== "SIN ASIGNAR").map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="filtro">
          Sucursal
          <select value={form.sucursal} onChange={(e) => cambiar({ sucursal: e.target.value as "" | Sucursal })}>
            <option value="">Todas</option>
            <option value="CARMAR_1">Carmar 1</option>
            <option value="CARMAR_2">Carmar 2</option>
          </select>
        </label>
        <label className="filtro">
          Mostrar
          <select
            value={form.estado}
            onChange={(e) => cambiar({ estado: e.target.value as FiltroHistorial["estado"] })}
          >
            <option value="APROBADO">Solo aprobados</option>
            <option value="TODOS">Todos los enviados</option>
          </select>
        </label>
        <label className="filtro">
          Producto
          <input
            type="search"
            value={form.q}
            placeholder="Nombre o código"
            onChange={(e) => setForm({ ...form, q: e.target.value })}
          />
        </label>
        <button type="submit" className="boton">
          Buscar
        </button>
        <button type="button" className="boton secundario" disabled={bajando} onClick={() => void descargar()}>
          {bajando ? "Descargando..." : "Descargar Excel"}
        </button>
      </form>

      {proveedores.isError && (
        <p className="error" role="alert">
          {msg(proveedores.error, "No se pudo cargar la lista de proveedores.")}
        </p>
      )}
      {errorExcel && (
        <p className="error" role="alert">
          {errorExcel}
        </p>
      )}
      {lista.isError && (
        <p className="error" role="alert">
          {msg(lista.error, "No se pudo cargar el historial.")}
        </p>
      )}
      {lista.isPending && <p className="estado">Cargando...</p>}

      {lista.data && (
        <>
          <h2>Resumen por producto</h2>
          {resumen.length === 0 ? (
            <p className="estado">No hay pedidos con estos filtros.</p>
          ) : (
            <div className="tabla-scroll">
              <table className="tabla-items">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th className="num">Veces</th>
                    <th className="num">Pedido</th>
                    <th className="num">Del galpón</th>
                    <th className="num">Comprado</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map((r) => (
                    <tr key={r.producto.id}>
                      <td data-etiqueta="Producto">
                        {r.producto.codigo} · {r.producto.nombre}
                      </td>
                      <td className="num" data-etiqueta="Veces">
                        {r.veces}
                      </td>
                      <td className="num" data-etiqueta="Pedido">
                        {formatearCantidad(r.pedido)} {r.producto.unidad}
                      </td>
                      <td className="num" data-etiqueta="Del galpón">
                        {formatearCantidad(r.deposito)} {r.producto.unidad}
                      </td>
                      <td className="num" data-etiqueta="Comprado">
                        {formatearCantidad(r.comprado)} {r.producto.unidad}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h2>Detalle</h2>
          {filas.length === 0 ? (
            <p className="estado">No hay pedidos con estos filtros.</p>
          ) : (
            <div className="tabla-scroll">
              <table className="tabla-items">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Sucursal</th>
                    <th>Proveedor</th>
                    <th>Producto</th>
                    <th className="num">Pedido</th>
                    <th className="num">Del galpón</th>
                    <th className="num">Comprado</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f) => (
                    <tr key={f.itemId}>
                      <td data-etiqueta="Fecha">{fechaCorta(f.fechaAprobacion ?? f.fechaEnvio)}</td>
                      <td data-etiqueta="Sucursal">{nombreSucursal(f.sucursal)}</td>
                      <td data-etiqueta="Proveedor">{f.proveedor?.nombre ?? "-"}</td>
                      <td data-etiqueta="Producto">
                        {f.producto.codigo} · {f.producto.nombre}
                      </td>
                      <td className="num" data-etiqueta="Pedido">
                        {formatearCantidad(f.cantidad)} {f.producto.unidad}
                      </td>
                      <td className="num" data-etiqueta="Del galpón">
                        {f.cantidadDeposito === null
                          ? "-"
                          : `${formatearCantidad(f.cantidadDeposito)} ${f.producto.unidad}`}
                      </td>
                      <td className="num" data-etiqueta="Comprado">
                        {formatearCantidad(f.cantidadComprada)} {f.producto.unidad}
                      </td>
                      <td data-etiqueta="Estado">
                        <EstadoEtiqueta estado={f.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Paginacion meta={lista.data.meta} ocupado={lista.isFetching} alCambiar={setPage} />
        </>
      )}
    </main>
  );
}
