import { useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { adminApi, type EstadoPeriodo, type PeriodoAdmin } from "../lib/adminApi";
import { formatearDia, Paginacion, textoError } from "../admin/comun";
import FormularioPeriodo from "../admin/FormularioPeriodo";
import ResumenCierre from "../admin/ResumenCierre";

type Panel = { tipo: "nuevo" } | { tipo: "editar"; periodo: PeriodoAdmin } | null;

export default function AdminPeriodos() {
  const qc = useQueryClient();
  const [estado, setEstado] = useState<EstadoPeriodo | "">("");
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [cerrando, setCerrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const lista = useQuery({
    queryKey: ["admin", "periodos", "lista", { estado, page }],
    queryFn: () => adminApi.periodos(estado, page),
    placeholderData: keepPreviousData,
  });

  // Para saber si ya hay uno abierto sin depender del filtro ni de la página
  const abierto = useQuery({
    queryKey: ["admin", "periodos", "abierto"],
    queryFn: () => adminApi.periodos("ABIERTO", 1),
  });
  const periodoAbierto = abierto.data?.data[0] ?? null;

  const cerrar = useMutation({
    mutationFn: (id: string) => adminApi.cerrarPeriodo(id),
    onSuccess: (cerrado) => {
      setError("");
      setCerrando(null);
      setAviso(`Se cerró el período ${cerrado.nombre}.`);
      setPanel((p) => (p?.tipo === "editar" && p.periodo.id === cerrado.id ? null : p));
      void qc.invalidateQueries({ queryKey: ["admin", "periodos"] });
    },
    onError: (err) => {
      setCerrando(null);
      setAviso("");
      setError(textoError(err, "No se pudo cerrar el período."));
      void qc.invalidateQueries({ queryKey: ["admin", "periodos"] });
    },
  });

  const meta = lista.data?.meta;
  const filas = lista.data?.data ?? [];
  const puedeAbrir = abierto.isSuccess && periodoAbierto === null;

  return (
    <main className="pagina ancha extra">
      <h1>Períodos</h1>

      <div className="barra-filtros">
        <label className="filtro">
          Estado
          <select
            value={estado}
            onChange={(e) => {
              setEstado(e.target.value as EstadoPeriodo | "");
              setPage(1);
            }}
          >
            <option value="">Todos</option>
            <option value="ABIERTO">Abiertos</option>
            <option value="CERRADO">Cerrados</option>
          </select>
        </label>
        <button
          type="button"
          className="boton"
          disabled={!puedeAbrir}
          onClick={() => {
            setAviso("");
            setPanel({ tipo: "nuevo" });
          }}
        >
          Abrir período
        </button>
      </div>
      {periodoAbierto && (
        <p className="chico">Primero cerrá el período abierto ({periodoAbierto.nombre}).</p>
      )}
      {abierto.isError && (
        <p className="error" role="alert">
          {textoError(abierto.error, "No se pudo saber si hay un período abierto.")}
        </p>
      )}

      {aviso && <p className="ok">{aviso}</p>}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="admin-columnas">
        <div className="admin-lista">
          {lista.isPending && <p className="estado">Cargando períodos...</p>}
          {lista.isError && (
            <p className="error" role="alert">
              {textoError(lista.error, "No se pudieron cargar los períodos.")}
            </p>
          )}
          {lista.data && filas.length === 0 && <p className="estado">No hay períodos para mostrar. Probá cambiar el filtro.</p>}

          <ul className="lista lista-plana">
            {filas.map((p) => {
              const esAbierto = p.estado === "ABIERTO";
              return (
                <li key={p.id} className="fila-admin">
                  <div className="fila-admin-datos">
                    <span className="fila-titulo">{p.nombre}</span>
                    <span className="fila-rotulos">
                      <span className={`etiqueta ${esAbierto ? "aprobado" : ""}`}>
                        {esAbierto ? "Abierto" : "Cerrado"}
                      </span>
                      <span className="chico">Apertura: {formatearDia(p.fechaApertura)}</span>
                      <span className="chico">Cierre: {formatearDia(p.fechaCierre)}</span>
                    </span>
                  </div>
                  {esAbierto && (
                    <div className="fila-admin-acciones">
                      <button
                        type="button"
                        className="boton secundario chico-boton sin-margen"
                        onClick={() => {
                          setAviso("");
                          setPanel({ tipo: "editar", periodo: p });
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="boton peligro chico-boton"
                        disabled={cerrar.isPending}
                        onClick={() => {
                          setError("");
                          setAviso("");
                          setCerrando(p.id);
                        }}
                      >
                        Cerrar período
                      </button>
                    </div>
                  )}
                  {cerrando === p.id && (
                    <div className="confirmar">
                      <ResumenCierre periodo={p} />
                      <div className="acciones">
                        <button
                          type="button"
                          className="boton peligro"
                          disabled={cerrar.isPending}
                          onClick={() => {
                            setError("");
                            setAviso("");
                            cerrar.mutate(p.id);
                          }}
                        >
                          {cerrar.isPending ? "Cerrando..." : "Sí, cerrar el período"}
                        </button>
                        <button
                          type="button"
                          className="boton secundario sin-margen"
                          onClick={() => setCerrando(null)}
                        >
                          No, volver
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {meta && meta.total > 0 && (
            <Paginacion meta={meta} ocupado={lista.isFetching} alCambiar={setPage} />
          )}
        </div>

        {panel && (
          <div className="admin-panel">
            <FormularioPeriodo
              key={panel.tipo === "editar" ? panel.periodo.id : "nuevo"}
              periodo={panel.tipo === "editar" ? panel.periodo : null}
              alEmpezar={() => {
                setAviso("");
                setError("");
              }}
              alGuardar={(guardado) => {
                setAviso(panel.tipo === "editar" ? "Período guardado." : "Período abierto.");
                setPanel({ tipo: "editar", periodo: guardado });
              }}
              alCerrar={() => setPanel(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
