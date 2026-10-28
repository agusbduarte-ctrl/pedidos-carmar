import type { Unidad } from "../lib/pedidosApi";
import type { ItemConsolidado, Numerico } from "../lib/consolidadoApi";

export const SIN_ASIGNAR = "SIN ASIGNAR";

export function aNumero(n: Numerico): number {
  return typeof n === "number" ? n : Number(n);
}

export function formatearCantidad(n: Numerico): string {
  return aNumero(n).toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

export function admiteDecimales(u: Unidad): boolean {
  return u === "KG" || u === "LT";
}

export type Lectura = { ok: true; valor: number | null } | { ok: false; mensaje: string };

// Vacío = volver a la suma automática (null). Acepta coma como decimal.
export function leerCantidad(texto: string, unidad: Unidad): Lectura {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return { ok: true, valor: null };
  if (!/^\d+(\.\d+)?$/.test(limpio)) return { ok: false, mensaje: "Escribí un número." };
  const valor = Number(limpio);
  if (valor <= 0) return { ok: false, mensaje: "Tiene que ser mayor a 0." };
  if (!admiteDecimales(unidad) && !Number.isInteger(valor)) {
    return { ok: false, mensaje: `En ${unidad} va un número entero, sin decimales.` };
  }
  return { ok: true, valor };
}

export function textoEditable(item: ItemConsolidado): string {
  return item.cantidadEditada === null
    ? ""
    : String(aNumero(item.cantidadEditada)).replace(".", ",");
}

export interface GrupoProveedor {
  proveedor: string;
  items: ItemConsolidado[];
}

export function agruparPorProveedor(items: ItemConsolidado[]): GrupoProveedor[] {
  const mapa = new Map<string, ItemConsolidado[]>();
  for (const it of items) {
    const nombre = it.producto.proveedor?.nombre ?? SIN_ASIGNAR;
    const lista = mapa.get(nombre);
    if (lista) lista.push(it);
    else mapa.set(nombre, [it]);
  }
  return [...mapa.entries()]
    .map(([proveedor, lista]) => ({ proveedor, items: lista }))
    .sort((a, b) => {
      if (a.proveedor === SIN_ASIGNAR) return 1;
      if (b.proveedor === SIN_ASIGNAR) return -1;
      return a.proveedor.localeCompare(b.proveedor, "es");
    });
}
