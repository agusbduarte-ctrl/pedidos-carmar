import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { adminApi, type PeriodoAdmin } from "../lib/adminApi";
import { aInputFecha, hoyInput, textoError } from "./comun";

interface Props {
  // null = alta
  periodo: PeriodoAdmin | null;
  alEmpezar: () => void;
  alGuardar: (p: PeriodoAdmin) => void;
  alCerrar: () => void;
}

export default function FormularioPeriodo({ periodo, alEmpezar, alGuardar, alCerrar }: Props) {
  const qc = useQueryClient();
  const editando = periodo !== null;
  const [nombre, setNombre] = useState(periodo?.nombre ?? "");
  const [apertura, setApertura] = useState(periodo ? aInputFecha(periodo.fechaApertura) : hoyInput());
  const [cierre, setCierre] = useState(periodo ? aInputFecha(periodo.fechaCierre) : "");
  const [error, setError] = useState("");

  const mutacion = useMutation({
    mutationFn: () =>
      periodo
        ? adminApi.editarPeriodo(periodo.id, {
            nombre: nombre.trim(),
            fechaCierre: cierre === "" ? null : cierre,
          })
        : adminApi.crearPeriodo({
            nombre: nombre.trim(),
            fechaApertura: apertura,
            ...(cierre ? { fechaCierre: cierre } : {}),
          }),
    onSuccess: (guardado) => {
      setError("");
      void qc.invalidateQueries({ queryKey: ["admin", "periodos"] });
      alGuardar(guardado);
    },
    onError: (err) => {
      setError(textoError(err, "No se pudo guardar el período."));
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    alEmpezar();
    if (nombre.trim().length < 2) return setError("El nombre tiene que tener al menos 2 letras.");
    if (!apertura) return setError("Elegí la fecha de apertura.");
    if (cierre && cierre < apertura) {
      return setError("La fecha de cierre no puede ser anterior a la de apertura.");
    }
    mutacion.mutate();
  };

  return (
    <section
      className="tarjeta panel-form"
      aria-label={editando ? "Editar período" : "Abrir período"}
    >
      <h2>{editando ? `Editar ${periodo.nombre}` : "Abrir período"}</h2>
      <form onSubmit={enviar} noValidate>
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Fecha de apertura{editando ? " (no se puede cambiar)" : ""}
          <input
            type="date"
            value={apertura}
            disabled={editando}
            onChange={(e) => setApertura(e.target.value)}
          />
        </label>
        <label>
          Fecha de cierre (opcional)
          <input type="date" value={cierre} onChange={(e) => setCierre(e.target.value)} />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="acciones">
          <button className="boton" type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? "Guardando..." : editando ? "Guardar cambios" : "Abrir período"}
          </button>
          <button className="boton secundario sin-margen" type="button" onClick={alCerrar}>
            {editando ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </form>
    </section>
  );
}
