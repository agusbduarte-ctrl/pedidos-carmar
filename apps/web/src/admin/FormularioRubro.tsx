import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, invalidarCatalogo, type Opcion } from "../lib/adminApi";
import { textoError } from "./comun";

interface Props {
  // null = alta
  rubro: Opcion | null;
  alEmpezar: () => void;
  alGuardar: (r: Opcion) => void;
  alCerrar: () => void;
}

export default function FormularioRubro({ rubro, alEmpezar, alGuardar, alCerrar }: Props) {
  const qc = useQueryClient();
  const editando = rubro !== null;
  const [nombre, setNombre] = useState(rubro?.nombre ?? "");
  const [error, setError] = useState("");

  const mutacion = useMutation({
    mutationFn: () =>
      rubro ? adminApi.editarRubro(rubro.id, nombre.trim()) : adminApi.crearRubro(nombre.trim()),
    onSuccess: (guardado) => {
      setError("");
      invalidarCatalogo(qc);
      alGuardar(guardado);
    },
    onError: (err) => {
      setError(textoError(err, "No se pudo guardar el rubro."));
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    alEmpezar();
    if (nombre.trim().length < 2) return setError("El nombre tiene que tener al menos 2 letras.");
    mutacion.mutate();
  };

  return (
    <section className="tarjeta panel-form" aria-label={editando ? "Editar rubro" : "Nuevo rubro"}>
      <h2>{editando ? `Editar ${rubro.nombre}` : "Nuevo rubro"}</h2>
      <form onSubmit={enviar} noValidate>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </label>
        {!editando && (
          <p className="chico">
            Si ya existía un rubro borrado con ese nombre, se vuelve a activar.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button className="boton" type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? "Guardando..." : editando ? "Guardar cambios" : "Crear rubro"}
          </button>
          <button className="boton secundario sin-margen" type="button" onClick={alCerrar}>
            {editando ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </form>
    </section>
  );
}
