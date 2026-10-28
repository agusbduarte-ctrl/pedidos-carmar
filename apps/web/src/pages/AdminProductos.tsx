import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type ProductoAdmin } from "../lib/adminApi";
import { NOMBRE_UNIDAD, Paginacion, formatearPrecio, textoError, useDemorado } from "../admin/comun";
import FormularioProducto from "../admin/FormularioProducto";

type Panel = { tipo: "nuevo" } | { tipo: "editar"; producto: ProductoAdmin } | null;

export default function AdminProductos() {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [rubroId, setRubroId] = useState("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const q = useDemorado(texto);
  const filtro = { q, rubroId, incluirInactivos, page };

  const lista = useQuery({
    queryKey: ["admin", "productos", "lista", filtro],
    queryFn: () => adminApi.productos(filtro),
    placeholderData: keepPreviousData,
  });
  const rubros = useQuery({
    queryKey: ["admin", "rubros", "opciones"],
    queryFn: adminApi.rubros,
    staleTime: 5 * 60 * 1000,
  });
  const proveedores = useQuery({
    queryKey: ["admin", "proveedores", "opciones"],
    queryFn: adminApi.proveedores,
    staleTime: 5 * 60 * 1000,
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["admin", "productos", "lista"] });

  const cambiarActivo = useMutation({
    mutationFn: (p: ProductoAdmin) => adminApi.editarProducto(p.id, { activo: !p.activo }),
    onSuccess: (nuevo) => {
      setError("");
      setPanel((p) =>
        p?.tipo === "editar" && p.producto.id === nuevo.id ? { tipo: "editar", producto: nuevo } : p,
      );
      void refrescar();
    },
    onError: (err) => setError(textoError(err, "No se pudo cambiar el estado.")),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => adminApi.borrarProducto(id),
    onSuccess: (_r, id) => {
      setError("");
      setBorrando(null);
      setAviso("Producto borrado.");
      setPanel((p) => (p?.tipo === "editar" && p.producto.id === id ? null : p));
      void refrescar();
    },
    onError: (err) => {
      setBorrando(null);
      setError(textoError(err, "No se pudo borrar el producto."));
    },
  });

  const cambiarFiltro = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const meta = lista.data?.meta;
  const filas = lista.data?.data ?? [];
  const listosParaForm = rubros.data !== undefined && proveedores.data !== undefined;

  return (
    <main className="pagina ancha extra">
      <h1>Productos</h1>

      <div className="barra-filtros">
        <label className="filtro">
          Buscar por nombre o código
          <input
            type="search"
            value={texto}
            onChange={(e) => cambiarFiltro(() => setTexto(e.target.value))}
          />
        </label>
        <label className="filtro">
          Rubro
          <select
            value={rubroId}
            onChange={(e) => cambiarFiltro(() => setRubroId(e.target.value))}
          >
            <option value="">Todos</option>
            {(rubros.data ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <label className="casilla">
          <input
            type="checkbox"
            checked={incluirInactivos}
            onChange={(e) => cambiarFiltro(() => setIncluirInactivos(e.target.checked))}
          />
          Mostrar inactivos
        </label>
        <button
          type="button"
          className="boton"
          disabled={!listosParaForm}
          onClick={() => {
            setAviso("");
            setPanel({ tipo: "nuevo" });
          }}
        >
          Nuevo producto
        </button>
      </div>

      {aviso && <p className="ok">{aviso}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {(rubros.isError || proveedores.isError) && (
        <p className="error" role="alert">
          {textoError(rubros.error ?? proveedores.error, "No se pudieron cargar rubros y proveedores.")}
        </p>
      )}

      <div className="admin-columnas">
        <div className="admin-lista">
          {lista.isPending && <p className="estado">Cargando productos...</p>}
          {lista.isError && (
            <p className="error" role="alert">
              {textoError(lista.error, "No se pudieron cargar los productos.")}
            </p>
          )}
          {lista.data && filas.length === 0 && (
            <p className="estado">No hay productos para mostrar. Probá cambiar los filtros.</p>
          )}

          <ul className="lista lista-plana">
            {filas.map((p) => (
              <li key={p.id} className="fila-admin">
                <div className="fila-admin-datos">
                  <span className="fila-titulo">{p.nombre}</span>
                  <span className="codigo">Código {p.codigo}</span>
                  <span className="fila-rotulos">
                    <span className="rotulo">{p.rubro.nombre}</span>
                    <span className="rotulo">{NOMBRE_UNIDAD[p.unidad]}</span>
                    <span className={`etiqueta ${p.activo ? "aprobado" : ""}`}>
                      {p.activo ? "Activo" : "Inactivo"}
                    </span>
                  </span>
                  <span className="chico">
                    {p.proveedor?.nombre ?? "Sin proveedor"}
                    {p.precioReferencia !== null ? `: ${formatearPrecio(p.precioReferencia)}` : ""}
                  </span>
                </div>
                <div className="fila-admin-acciones">
                  <button
                    type="button"
                    className="boton secundario chico-boton sin-margen"
                    disabled={!listosParaForm}
                    onClick={() => {
                      setAviso("");
                      setPanel({ tipo: "editar", producto: p });
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="boton secundario chico-boton sin-margen"
                    disabled={cambiarActivo.isPending}
                    onClick={() => {
                      setError("");
                      setAviso("");
                      cambiarActivo.mutate(p);
                    }}
                  >
                    {p.activo ? "Desactivar" : "Activar"}
                  </button>
                  <button
                    type="button"
                    className="boton peligro chico-boton"
                    disabled={borrar.isPending}
                    onClick={() => {
                      setError("");
                      setAviso("");
                      setBorrando(p.id);
                    }}
                  >
                    Borrar
                  </button>
                </div>
                {borrando === p.id && (
                  <div className="confirmar">
                    <p>¿Borrar "{p.nombre}"? Ya no va a aparecer para pedir.</p>
                    <div className="acciones">
                      <button
                        type="button"
                        className="boton peligro"
                        disabled={borrar.isPending}
                        onClick={() => {
                          setError("");
                          setAviso("");
                          borrar.mutate(p.id);
                        }}
                      >
                        {borrar.isPending ? "Borrando..." : "Sí, borrar"}
                      </button>
                      <button
                        type="button"
                        className="boton secundario sin-margen"
                        onClick={() => setBorrando(null)}
                      >
                        No, volver
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {meta && meta.total > 0 && (
            <Paginacion meta={meta} ocupado={lista.isFetching} alCambiar={setPage} />
          )}
        </div>

        {panel && rubros.data && proveedores.data && (
          <div className="admin-panel">
            <FormularioProducto
              key={panel.tipo === "editar" ? panel.producto.id : "nuevo"}
              producto={panel.tipo === "editar" ? panel.producto : null}
              rubros={rubros.data}
              proveedores={proveedores.data}
              alEmpezar={() => {
                setAviso("");
                setError("");
              }}
              alGuardar={(guardado) => {
                setAviso("Producto guardado.");
                setPanel({ tipo: "editar", producto: guardado });
              }}
              alCerrar={() => setPanel(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
