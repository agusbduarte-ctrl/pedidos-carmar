import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, invalidarCatalogo, type ProveedorAdmin } from "../lib/adminApi";
import { textoError } from "./comun";

interface Props {
  // null = alta
  proveedor: ProveedorAdmin | null;
  alEmpezar: () => void;
  alGuardar: (p: ProveedorAdmin) => void;
  alCerrar: () => void;
}

export default function FormularioProveedor({ proveedor, alEmpezar, alGuardar, alCerrar }: Props) {
  const qc = useQueryClient();
  const editando = proveedor !== null;
  const [nombre, setNombre] = useState(proveedor?.nombre ?? "");
  const [email, setEmail] = useState(proveedor?.email ?? "");
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? "");
  const [error, setError] = useState("");

  const mutacion = useMutation({
    mutationFn: () => {
      const mail = email.trim();
      const tel = telefono.trim();
      if (proveedor) {
        // Campo vaciado = null para que la API lo borre
        return adminApi.editarProveedor(proveedor.id, {
          nombre: nombre.trim(),
          email: mail === "" ? null : mail,
          telefono: tel === "" ? null : tel,
        });
      }
      return adminApi.crearProveedor({
        nombre: nombre.trim(),
        ...(mail ? { email: mail } : {}),
        ...(tel ? { telefono: tel } : {}),
      });
    },
    onSuccess: (guardado) => {
      setError("");
      invalidarCatalogo(qc);
      alGuardar(guardado);
    },
    onError: (err) => {
      setError(textoError(err, "No se pudo guardar el proveedor."));
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    alEmpezar();
    if (nombre.trim().length < 2) return setError("El nombre tiene que tener al menos 2 letras.");
    const mail = email.trim();
    if (mail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail)) {
      return setError("El email no parece válido.");
    }
    mutacion.mutate();
  };

  return (
    <section
      className="panel panel-form"
      aria-label={editando ? "Editar proveedor" : "Nuevo proveedor"}
    >
      <h2>{editando ? `Editar ${proveedor.nombre}` : "Nuevo proveedor"}</h2>
      <form onSubmit={enviar} noValidate>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Email (opcional)
          <input
            type="email"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Teléfono (opcional)
          <input
            type="tel"
            autoComplete="off"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
          />
        </label>
        {!editando && (
          <p className="chico">
            Si ya existía un proveedor borrado con ese nombre, se vuelve a activar (con el email y
            el teléfono que pongas acá).
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button className="boton" type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? "Guardando..." : editando ? "Guardar cambios" : "Crear proveedor"}
          </button>
          <button className="boton secundario sin-margen" type="button" onClick={alCerrar}>
            {editando ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </form>
    </section>
  );
}
