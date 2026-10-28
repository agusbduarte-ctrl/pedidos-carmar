import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Rol, Sucursal } from "../lib/api";
import { adminApi, type CambioUsuario, type NuevoUsuario, type UsuarioAdmin } from "../lib/adminApi";
import { nombreSucursal } from "../revision/comun";
import { ETIQUETA_ROL, textoError } from "./comun";
import SelectorRubros from "./SelectorRubros";

interface Props {
  // null = alta
  usuario: UsuarioAdmin | null;
  alEmpezar: () => void;
  alAvisar: (texto: string) => void;
  alGuardar: (u: UsuarioAdmin) => void;
  alCerrar: () => void;
}

const ROLES: Rol[] = ["REPOSITOR", "ENCARGADA", "ADMIN"];

export default function FormularioUsuario({
  usuario,
  alEmpezar,
  alAvisar,
  alGuardar,
  alCerrar,
}: Props) {
  const qc = useQueryClient();
  const editando = usuario !== null;

  const [rol, setRol] = useState<Rol>(usuario?.rol ?? "REPOSITOR");
  const [nombre, setNombre] = useState(usuario?.nombre ?? "");
  const [email, setEmail] = useState(usuario?.email ?? "");
  const [sucursal, setSucursal] = useState<Sucursal | "">(usuario?.sucursal ?? "");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const esRepositor = rol === "REPOSITOR";

  const mutacion = useMutation({
    mutationFn: async (): Promise<UsuarioAdmin> => {
      if (usuario) {
        const cambio: CambioUsuario = { nombre: nombre.trim() };
        if (esRepositor) {
          if (sucursal) cambio.sucursal = sucursal;
          if (pin) cambio.pin = pin;
        } else {
          cambio.email = email.trim();
          if (password) cambio.password = password;
        }
        return adminApi.editarUsuario(usuario.id, cambio);
      }
      const nuevo: NuevoUsuario = esRepositor
        ? { rol: "REPOSITOR", nombre: nombre.trim(), sucursal: sucursal as Sucursal, pin }
        : { rol: rol as "ADMIN" | "ENCARGADA", nombre: nombre.trim(), email: email.trim(), password };
      return adminApi.crearUsuario(nuevo);
    },
    onSuccess: (guardado) => {
      setError("");
      setPin("");
      setPassword("");
      void qc.invalidateQueries({ queryKey: ["admin", "usuarios", "lista"] });
      alGuardar(guardado);
    },
    onError: (err) => {
      setError(textoError(err, "No se pudo guardar el usuario."));
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    alEmpezar();
    if (nombre.trim().length < 2) return setError("El nombre tiene que tener al menos 2 letras.");
    if (esRepositor) {
      if (!sucursal) return setError("Elegí la sucursal.");
      if (!editando && !/^\d{4}$/.test(pin)) return setError("El PIN tiene que tener 4 números.");
      if (editando && pin && !/^\d{4}$/.test(pin)) return setError("El PIN tiene que tener 4 números.");
    } else {
      if (!email.trim()) return setError("Escribí el email.");
      if (!editando && password.length < 8) {
        return setError("La clave tiene que tener al menos 8 caracteres.");
      }
      if (editando && password && password.length < 8) {
        return setError("La clave tiene que tener al menos 8 caracteres.");
      }
    }
    mutacion.mutate();
  };

  return (
    <section className="panel panel-form" aria-label={editando ? "Editar usuario" : "Nuevo usuario"}>
      <h2>{editando ? `Editar a ${usuario.nombre}` : "Nuevo usuario"}</h2>
      <form onSubmit={enviar} noValidate>
        {editando ? (
          <p className="chico">
            Rol: <strong>{ETIQUETA_ROL[usuario.rol]}</strong> (no se puede cambiar)
          </p>
        ) : (
          <label>
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value as Rol)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ETIQUETA_ROL[r]}
                </option>
              ))}
            </select>
          </label>
        )}

        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </label>

        {esRepositor ? (
          <>
            <label>
              Sucursal
              <select value={sucursal} onChange={(e) => setSucursal(e.target.value as Sucursal | "")}>
                <option value="">Elegí una sucursal</option>
                <option value="CARMAR_1">{nombreSucursal("CARMAR_1")}</option>
                <option value="CARMAR_2">{nombreSucursal("CARMAR_2")}</option>
              </select>
            </label>
            {editando && usuario.sucursal && sucursal && sucursal !== usuario.sucursal && (
              <p className="aviso devuelto">
                Si cambia de sucursal, hay que volver a asignarle los rubros.
              </p>
            )}
            <label>
              PIN (4 números){editando ? " - dejar vacío para no cambiar" : ""}
              <input
                type="password"
                inputMode="numeric"
                pattern="\d*"
                maxLength={4}
                autoComplete="new-password"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              />
            </label>
          </>
        ) : (
          <>
            <label>
              Email
              <input
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Clave (mínimo 8 caracteres){editando ? " - dejar vacío para no cambiar" : ""}
              <input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
          </>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="acciones">
          <button className="boton" type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? "Guardando..." : editando ? "Guardar cambios" : "Crear usuario"}
          </button>
          <button className="boton secundario sin-margen" type="button" onClick={alCerrar}>
            {editando ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </form>

      {editando && usuario.rol === "REPOSITOR" && <RubrosDelRepositor usuario={usuario} alEmpezar={alEmpezar} alAvisar={alAvisar} />}
      {!editando && esRepositor && (
        <p className="chico">Cuando lo crees vas a poder asignarle los rubros.</p>
      )}
    </section>
  );
}

function RubrosDelRepositor({
  usuario,
  alEmpezar,
  alAvisar,
}: {
  usuario: UsuarioAdmin;
  alEmpezar: () => void;
  alAvisar: (texto: string) => void;
}) {
  const qc = useQueryClient();
  const [cambiados, setCambiados] = useState<string[] | null>(null);
  const [error, setError] = useState("");

  const todos = useQuery({
    queryKey: ["admin", "rubros", "opciones"],
    queryFn: adminApi.rubros,
    staleTime: 5 * 60 * 1000,
  });
  const asignados = useQuery({
    queryKey: ["admin", "usuarios", "rubros", usuario.id],
    queryFn: () => adminApi.rubrosDeUsuario(usuario.id),
  });

  const guardar = useMutation({
    mutationFn: (ids: string[]) => adminApi.guardarRubrosDeUsuario(usuario.id, ids),
    onSuccess: (lista) => {
      qc.setQueryData(["admin", "usuarios", "rubros", usuario.id], lista);
      setCambiados(null);
      setError("");
      alAvisar("Rubros guardados.");
    },
    onError: (err) => {
      setError(textoError(err, "No se pudieron guardar los rubros."));
    },
  });

  const elegidos = cambiados ?? asignados.data?.map((r) => r.id) ?? [];
  const sinSucursal = usuario.sucursal === null;

  return (
    <div className="bloque-rubros">
      <h3>Rubros que repone</h3>
      {sinSucursal && <p className="error">Este repositor no tiene sucursal. Elegí una primero.</p>}
      {(todos.isPending || asignados.isPending) && <p className="estado">Cargando rubros...</p>}
      {(todos.isError || asignados.isError) && (
        <p className="error" role="alert">
          {textoError(todos.error ?? asignados.error, "No se pudieron cargar los rubros.")}
        </p>
      )}
      {todos.data && asignados.data && (
        <>
          <p className="cuenta-rubros">
            <strong>{elegidos.length}</strong> {elegidos.length === 1 ? "rubro asignado" : "rubros asignados"} en{" "}
            {usuario.sucursal ? nombreSucursal(usuario.sucursal) : "ninguna sucursal"}.
          </p>
          <SelectorRubros
            rubros={todos.data}
            elegidos={elegidos}
            alCambiar={(ids) => {
              alEmpezar();
              setCambiados(ids);
            }}
            deshabilitado={sinSucursal || guardar.isPending}
          />
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button
            type="button"
            className="boton"
            disabled={cambiados === null || sinSucursal || guardar.isPending}
            onClick={() => {
              setError("");
              alEmpezar();
              guardar.mutate(elegidos);
            }}
          >
            {guardar.isPending ? "Guardando..." : "Guardar rubros"}
          </button>
        </>
      )}
    </div>
  );
}
