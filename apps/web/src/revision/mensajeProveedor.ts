import type { ItemRevision } from "../lib/revisionApi";
import type { Sucursal } from "../lib/api";

// "10.000" -> "10"; "2.500" -> "2,5"
export function formatearCantidad(valor: string | number): string {
  const n = Number(valor);
  if (!Number.isFinite(n)) return String(valor);
  return String(n).replace(".", ",");
}

export function armarMensajeProveedor(sucursal: Sucursal, items: ItemRevision[]): string {
  const nro = sucursal === "CARMAR_1" ? "1" : "2";
  const lineas = items.map((i) => {
    const obs = i.observacion ? ` (${i.observacion})` : "";
    return `• ${i.producto.nombre} x ${formatearCantidad(i.cantidad)} ${i.producto.unidad}${obs}`;
  });
  return [`Hola! Pedido de Supermercado Cármar – Sucursal ${nro}:`, ...lineas, "Gracias!"].join("\n");
}
