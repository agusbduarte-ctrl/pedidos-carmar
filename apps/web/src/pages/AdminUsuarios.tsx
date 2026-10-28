import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../auth/AuthContext";
import type { Rol } from "../lib/api";
import { adminApi, type UsuarioAdmin } from "../lib/adminApi";
import { nombreSucursal } from "../revision/comun";
import { ETIQUETA_ROL, Paginacion, textoError, useDemorado } from "../admin/comun";
import FormularioUsuario from "../admin/FormularioUsuario";

type Panel = { tipo: "nuevo" } | { tipo: "editar"; usuario: UsuarioAdmin } | null;

export default function AdminUsuarios() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [texto, setTexto] = useState("");
  const [rol, setRol] = useState<Rol | "">("");
  const [incluirInactivos, setIncluirInactivos] = useState(false);
  const [page, setPage] = useState(1);
  const [panel, setPanel] = useState<Panel>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");

  const q = useDemorado(texto);
  const filtro = { q, rol, incluirInactivos, page };

  const lista = useQuery({
    queryKey: ["admin", "usuarios", "lista", filtro],
    queryFn: () => adminApi.usuarios(filtro),
    placeholderData: keepPreviousData,
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: ["admin", "usuarios", "lista"] });

  const cambiarActivo = useMutation({
    mutationFn: (u: UsuarioAdmin) => adminApi.editarUsuario(u.id, { activo: !u.activo }),
    onSuccess: (nuevo) => {
      setError("");
      setPanel((p) => (p?.tipo === "editar" && p.usuario.id === nuevo.id ? { tipo: "editar", usuario: nuevo } : p));
      void refrescar();
    },
    onError: (err) => setError(textoError(err, "No se pudo cambiar el estado.")),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => adminApi.borrarUsuario(id),
    onSuccess: (_r, id) => {
      setError("");
      setBorrando(null);
      setAviso("Usuario borrado.");
      setPanel((p) => (p?.tipo === "editar" && p.usuario.id === id ? null : p));
      void refrescar();
    },
    onError: (err) => {
      setBorrando(null);
      setError(textoError(err, "No se pudo borrar el usuario."));
    },
  });

  const cambiarFiltro = (fn: () => void) => {
    fn();
    setPage(1);
  };

  const meta = lista.data?.meta;
  const filas = lista.data?.data ?? [];

  return (
    <main className="pagina ancha extra">
      <p>
        <Link to="/">Volver al inicio</Link>
      </p>
      <h1>Usuarios</h1>

      <div className="barra-filtros">
        <label className="filtro">
          Buscar por nombre o email
          <input
            type="search"
            value={texto}
            onChange={(e) => cambiarFiltro(() => setTexto(e.target.value))}
          />
        </label>
        <label className="filtro">
          Rol
          <select
            value={rol}
            onChange={(e) => cambiarFiltro(() => setRol(e.target.value as Rol | ""))}
          >
            <option value="">Todos</option>
            <option value="REPOSITOR">{ETIQUETA_ROL.REPOSITOR}</option>
            <option value="ENCARGADA">{ETIQUETA_ROL.ENCARGADA}</option>
            <option value="ADMIN">{ETIQUETA_ROL.ADMIN}</option>
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
          onClick={() => {
            setAviso("");
            setPanel({ tipo: "nuevo" });
          }}
        >
          Nuevo usuario
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
          {lista.isPending && <p className="estado">Cargando usuarios...</p>}
          {lista.isError && (
            <p className="error" role="alert">
              {textoError(lista.error, "No se pudieron cargar los usuarios.")}
            </p>
          )}
          {lista.data && filas.length === 0 && <p className="estado">No hay usuarios para mostrar.</p>}

          <ul className="lista">
            {filas.map((u) => {
              const esYo = u.id === user?.id;
              return (
                <li key={u.id} className="tarjeta fila-admin">
                  <div className="fila-admin-datos">
                    <span className="producto-nombre">{u.nombre}</span>
                    <span>{ETIQUETA_ROL[u.rol]}</span>
                    <span>{u.sucursal ? nombreSucursal(u.sucursal) : u.email ?? "-"}</span>
                    <span className={`etiqueta ${u.activo ? "aprobado" : "devuelto"}`}>
                      {u.activo ? "Activo" : "Inactivo"}
                    </span>
                  </div>
                  <div className="fila-admin-acciones">
                    <button
                      type="button"
                      className="boton secundario chico-boton sin-margen"
                      onClick={() => {
                        setAviso("");
                        setPanel({ tipo: "editar", usuario: u });
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="boton secundario chico-boton sin-margen"
                      disabled={esYo || cambiarActivo.isPending}
                      onClick={() => {
                        setError("");
                        setAviso("");
                        cambiarActivo.mutate(u);
                      }}
                    >
                      {u.activo ? "Desactivar" : "Activar"}
                    </button>
                    <button
                      type="button"
                      className="boton peligro chico-boton"
                      disabled={esYo || borrar.isPending}
                      onClick={() => {
                        setError("");
                        setAviso("");
                        setBorrando(u.id);
                      }}
                    >
                      Borrar
                    </button>
                  </div>
                  {esYo && (
                    <p className="chico">Es tu usuario: no lo podés desactivar ni borrar.</p>
                  )}
                  {borrando === u.id && (
                    <div className="confirmar">
                      <p>¿Borrar a {u.nombre}? Ya no va a poder entrar.</p>
                      <div className="acciones">
                        <button
                          type="button"
                          className="boton peligro"
                          disabled={borrar.isPending}
                          onClick={() => {
                            setError("");
                            setAviso("");
                            borrar.mutate(u.id);
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
              );
            })}
          </ul>

          {meta && meta.total > 0 && (
            <Paginacion meta={meta} ocupado={lista.isFetching} alCambiar={setPage} />
          )}
        </div>

        {panel && (
          <div className="admin-panel">
            <FormularioUsuario
              key={panel.tipo === "editar" ? panel.usuario.id : "nuevo"}
              usuario={panel.tipo === "editar" ? panel.usuario : null}
              alEmpezar={() => {
                setAviso("");
                setError("");
              }}
              alAvisar={setAviso}
              alGuardar={(guardado) => {
                setAviso("Usuario guardado.");
                setPanel({ tipo: "editar", usuario: guardado });
              }}
              alCerrar={() => setPanel(null)}
            />
          </div>
        )}
      </div>
    </main>
  );
}
