import type { Sucursal } from "../lib/api";
import type { EstadoPedido } from "../lib/pedidosApi";

export const ETIQUETAS_ESTADO: Record<EstadoPedido, string> = {
  BORRADOR: "Borrador",
  ENVIADO: "Enviado",
  DEVUELTO: "Devuelto",
  APROBADO: "Aprobado",
};

export function EstadoEtiqueta({ estado }: { estado: EstadoPedido }) {
  return <span className={`etiqueta ${estado.toLowerCase()}`}>{ETIQUETAS_ESTADO[estado]}</span>;
}

export function nombreSucursal(s: Sucursal): string {
  // CARMAR_1 -> Carmar 1
  return s.replace("CARMAR_", "Carmar ");
}

export function formatearFecha(iso: string | null): string {
  if (!iso) return "-";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "-";
  return fecha.toLocaleString("es-AR", { dateStyle: "short", timeStyle: "short" });
}
