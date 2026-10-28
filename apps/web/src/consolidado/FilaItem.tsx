import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { consolidadoApi, type ItemConsolidado } from "../lib/consolidadoApi";
import { formatearCantidad, leerCantidad, textoEditable } from "./utilidades";

interface Props {
  consolidadoId: string;
  item: ItemConsolidado;
  editable: boolean;
  alGuardar: (item: ItemConsolidado) => void;
}

export default function FilaItem({ consolidadoId, item, editable, alGuardar }: Props) {
  const [cantidad, setCantidad] = useState(textoEditable(item));
  const [observacion, setObservacion] = useState(item.observacion ?? "");
  const [error, setError] = useState<string | null>(null);

  const guardar = useMutation({
    mutationFn: (cambio: { cantidadEditada: number | null; observacion: string | null }) =>
      consolidadoApi.editarItem(consolidadoId, item.id, cambio),
    onSuccess: (nuevo) => {
      setError(null);
      setCantidad(textoEditable(nuevo));
      setObservacion(nuevo.observacion ?? "");
      alGuardar(nuevo);
    },
    onError: (err) => setError(err instanceof ApiError ? mensajeApi(err) : "No se pudo guardar."),
  });

  const sinCambios =
    cantidad.trim() === textoEditable(item) && observacion.trim() === (item.observacion ?? "");
  const ajustado = item.cantidadEditada !== null;

  const intentarGuardar = () => {
    const lectura = leerCantidad(cantidad, item.producto.unidad);
    if (!lectura.ok) {
      setError(lectura.mensaje);
      return;
    }
    setError(null);
    guardar.mutate({
      cantidadEditada: lectura.valor,
      observacion: observacion.trim() === "" ? null : observacion.trim(),
    });
  };

  return (
    <tr className={ajustado ? "ajustado" : ""}>
      <td data-etiqueta="Código">{item.producto.codigo}</td>
      <td data-etiqueta="Producto" className="producto-nombre">
        {item.producto.nombre}
        {ajustado && <span className="etiqueta enviado marca-ajuste">Ajustado</span>}
      </td>
      <td data-etiqueta="Unidad">{item.producto.unidad}</td>
      <td data-etiqueta="Suma" className="num">
        {formatearCantidad(item.cantidadTotal)}
      </td>
      <td data-etiqueta="Ajustada" className="num">
        {editable ? (
          <input
            className="entrada-cantidad"
            inputMode="decimal"
            aria-label={`Cantidad ajustada de ${item.producto.nombre}`}
            placeholder={formatearCantidad(item.cantidadTotal)}
            value={cantidad}
            disabled={guardar.isPending}
            onChange={(e) => setCantidad(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !sinCambios) intentarGuardar();
            }}
          />
        ) : item.cantidadEditada !== null ? (
          formatearCantidad(item.cantidadEditada)
        ) : (
          "-"
        )}
      </td>
      <td data-etiqueta="Observación">
        {editable ? (
          <input
            aria-label={`Observación de ${item.producto.nombre}`}
            maxLength={200}
            value={observacion}
            disabled={guardar.isPending}
            onChange={(e) => setObservacion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !sinCambios) intentarGuardar();
            }}
          />
        ) : (
          (item.observacion ?? "")
        )}
        {error && (
          <span className="error-fila" role="alert">
            {error}
          </span>
        )}
      </td>
      {editable && (
        <td data-etiqueta="">
          <button
            className="boton chico-boton"
            disabled={sinCambios || guardar.isPending}
            onClick={intentarGuardar}
          >
            {guardar.isPending ? "Guardando..." : "Guardar"}
          </button>
        </td>
      )}
    </tr>
  );
}

function mensajeApi(err: ApiError): string {
  return err.detalles.length > 0 ? err.detalles.join(". ") : err.message;
}
