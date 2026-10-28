import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, invalidarCatalogo, type ProveedorAdmin } from "../lib/adminApi";
import { Paginacion, textoError, useDemorado } from "../admin/comun";
import FormularioProveedor from "../admin/FormularioProveedor";

type Panel = { tipo: "nuevo" } | { tipo: "editar"; proveedor: ProveedorAdmin } | null;

export default function AdminProveedores() {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const q = useDemorado(texto);

  const lista = useQuery({
    queryKey: ["admin", "proveedores", "lista", { q, page }],
    queryFn: () => adminApi.proveedoresLista(q, page),
    placeholderData: keepPreviousData,
  });

  const borrar = useMutation({
    mutationFn: (id: string) => adminApi.borrarProveedor(id),
    onSuccess: (_r, id) => {
      setError("");
      setBorrando(null);
      setAviso("Proveedor borrado.");
      setPanel((p) => (p?.tipo === "editar" && p.proveedor.id === id ? null : p));
      invalidarCatalogo(qc);
    },
    onError: (err) => {
      setBorrando(null);
      setAviso("");
      setError(textoError(err, "No se pudo borrar el proveedor."));
    },
  });

  const meta = lista.data?.meta;
  const filas = lista.data?.data ?? [];

  return (
    <main className="pagina ancha extra">
      <h1>Proveedores</h1>

      <div className="barra-filtros">
        <label className="filtro">
          Buscar por nombre
          <input
            type="search"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <button
          type="button"
          className="boton"
          onClick={() => {
            setAviso("");
            setPanel({ tipo: "nuevo" });
          }}
        >
          Nuevo proveedor
        </button>
      </div>

      {aviso && <p className="ok">{aviso}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="admin-columnas">
        <div className="admin-lista">
          {lista.isPending && <p className="estado">Cargando proveedores...</p>}
          {lista.isError && (
            <p className="error" role="alert">
              {textoError(lista.error, "No se pudieron cargar los proveedores.")}
            </p>
          )}
          {lista.data && filas.length === 0 && (
            <p className="estado">No hay proveedores para mostrar. Probá cambiar la búsqueda.</p>
          )}

          <ul className="lista lista-plana">
            {filas.map((p) => (
              <li key={p.id} className="fila-admin">
                <div className="fila-admin-datos">
                  <span className="fila-titulo">{p.nombre}</span>
                  <span className="fila-rotulos">
                    <span className="chico">{p.email ?? "Sin email"}</span>
                    <span className="chico">{p.telefono ?? "Sin teléfono"}</span>
                  </span>
                </div>
                <div className="fila-admin-acciones">
                  <button
                    type="button"
                    className="boton secundario chico-boton sin-margen"
                    onClick={() => {
                      setAviso("");
                      setPanel({ tipo: "editar", proveedor: p });
                    }}
                  >
                    Editar
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
                    <p>
                      ¿Borrar {p.nombre}? Ya no va a aparecer en las listas ni se va a poder elegir.
                    </p>
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

        {panel && (
          <div className="admin-panel">
            <FormularioProveedor
              key={panel.tipo === "editar" ? panel.proveedor.id : "nuevo"}
              proveedor={panel.tipo === "editar" ? panel.proveedor : null}
              alEmpezar={() => {
                setAviso("");
                setError("");
              }}
              alGuardar={(guardado) => {
                setAviso("Proveedor guardado.");
                setPanel({ tipo: "editar", proveedor: guardado });
              }}
              alCerrar={() => setPanel(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
