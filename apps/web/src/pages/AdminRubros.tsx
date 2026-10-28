import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, invalidarCatalogo, type Opcion } from "../lib/adminApi";
import { Paginacion, textoError, useDemorado } from "../admin/comun";
import FormularioRubro from "../admin/FormularioRubro";

type Panel = { tipo: "nuevo" } | { tipo: "editar"; rubro: Opcion } | null;

export default function AdminRubros() {
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const q = useDemorado(texto);

  const lista = useQuery({
    queryKey: ["admin", "rubros", "lista", { q, page }],
    queryFn: () => adminApi.rubrosLista(q, page),
    placeholderData: keepPreviousData,
  });

  const borrar = useMutation({
    mutationFn: (id: string) => adminApi.borrarRubro(id),
    onSuccess: (_r, id) => {
      setError("");
      setBorrando(null);
      setAviso("Rubro borrado.");
      setPanel((p) => (p?.tipo === "editar" && p.rubro.id === id ? null : p));
      invalidarCatalogo(qc);
    },
    onError: (err) => {
      setBorrando(null);
      setAviso("");
      setError(textoError(err, "No se pudo borrar el rubro."));
    },
  });

  const meta = lista.data?.meta;
  const filas = lista.data?.data ?? [];

  return (
    <main className="pagina ancha extra">
      <p>
        <Link to="/">Volver al inicio</Link>
      </p>
      <h1>Rubros</h1>

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
          Nuevo rubro
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
          {lista.isPending && <p className="estado">Cargando rubros...</p>}
          {lista.isError && (
            <p className="error" role="alert">
              {textoError(lista.error, "No se pudieron cargar los rubros.")}
            </p>
          )}
          {lista.data && filas.length === 0 && <p className="estado">No hay rubros para mostrar.</p>}

          <ul className="lista">
            {filas.map((r) => (
              <li key={r.id} className="tarjeta fila-admin">
                <div className="fila-admin-datos">
                  <span className="producto-nombre">{r.nombre}</span>
                </div>
                <div className="fila-admin-acciones">
                  <button
                    type="button"
                    className="boton secundario chico-boton sin-margen"
                    onClick={() => {
                      setAviso("");
                      setPanel({ tipo: "editar", rubro: r });
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
                      setBorrando(r.id);
                    }}
                  >
                    Borrar
                  </button>
                </div>
                {borrando === r.id && (
                  <div className="confirmar">
                    <p>
                      ¿Borrar {r.nombre}? Ya no va a aparecer en las listas ni se va a poder elegir.
                    </p>
                    <div className="acciones">
                      <button
                        type="button"
                        className="boton peligro"
                        disabled={borrar.isPending}
                        onClick={() => {
                          setError("");
                          setAviso("");
                          borrar.mutate(r.id);
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
            <FormularioRubro
              key={panel.tipo === "editar" ? panel.rubro.id : "nuevo"}
              rubro={panel.tipo === "editar" ? panel.rubro : null}
              alEmpezar={() => {
                setAviso("");
                setError("");
              }}
              alGuardar={(guardado) => {
                setAviso("Rubro guardado.");
                setPanel({ tipo: "editar", rubro: guardado });
              }}
              alCerrar={() => setPanel(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
