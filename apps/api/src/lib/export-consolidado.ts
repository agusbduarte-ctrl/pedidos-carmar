import type { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import { PROVEEDOR_SIN_ASIGNAR } from "./importar-catalogo.js";

export const ENCABEZADOS = ["Código", "Producto", "Unidad", "Cantidad", "Observación"];
export const HOJA_VACIA = "VACÍO";

const MAX_NOMBRE_HOJA = 31; // límite de Excel
const ANCHOS = [{ wch: 16 }, { wch: 45 }, { wch: 8 }, { wch: 10 }, { wch: 40 }];

export class ConsolidadoNoEncontradoError extends Error {
  readonly statusCode = 404;
  constructor() {
    super("CONSOLIDADO_NO_ENCONTRADO");
  }
}

// Nombre de hoja válido para Excel: sin \ / ? * [ ] :, hasta 31 caracteres y
// sin repetir uno ya usado (Excel no distingue mayúsculas en los nombres de hoja).
export function nombreDeHoja(nombre: string, usados: Set<string> = new Set()): string {
  const base = nombre.replace(/[\\/?*[\]:]/g, "_").trim().slice(0, MAX_NOMBRE_HOJA).trim() || "Proveedor";
  let candidato = base;
  for (let n = 2; usados.has(candidato.toLowerCase()); n++) {
    const sufijo = ` (${n})`;
    candidato = base.slice(0, MAX_NOMBRE_HOJA - sufijo.length).trimEnd() + sufijo;
  }
  usados.add(candidato.toLowerCase());
  return candidato;
}

// "Período Octubre 2026" + fecha -> "consolidado-Periodo-Octubre-2026-2026-10-27.xlsx"
export function nombreDeArchivo(periodoNombre: string, fecha: Date = new Date()): string {
  const periodo = periodoNombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // saca tildes: í -> i
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `consolidado-${periodo || "periodo"}-${fecha.toISOString().slice(0, 10)}.xlsx`;
}

// Una hoja por proveedor (los productos sin proveedor van a "SIN ASIGNAR").
// Cantidad = cantidadEditada si la encargada la ajustó; si no, cantidadTotal.
export async function exportarConsolidado(db: PrismaClient, consolidadoId: string): Promise<Buffer> {
  const consolidado = await db.consolidado.findUnique({
    where: { id: consolidadoId },
    include: {
      items: {
        include: {
          producto: {
            select: { codigo: true, nombre: true, unidad: true, proveedor: { select: { nombre: true } } },
          },
        },
      },
    },
  });
  if (!consolidado) throw new ConsolidadoNoEncontradoError();

  const porProveedor = new Map<string, (string | number)[][]>();
  for (const item of consolidado.items) {
    const proveedor = item.producto.proveedor?.nombre ?? PROVEEDOR_SIN_ASIGNAR;
    const filas = porProveedor.get(proveedor) ?? [];
    filas.push([
      item.producto.codigo,
      item.producto.nombre,
      item.producto.unidad,
      (item.cantidadEditada ?? item.cantidadTotal).toNumber(), // número, no texto
      item.observacion ?? "",
    ]);
    porProveedor.set(proveedor, filas);
  }

  const libro = XLSX.utils.book_new();
  const usados = new Set<string>();

  // Proveedores en orden alfabético y SIN ASIGNAR al final; filas por nombre de producto
  const proveedores = [...porProveedor.keys()].sort((a, b) =>
    a === PROVEEDOR_SIN_ASIGNAR ? 1 : b === PROVEEDOR_SIN_ASIGNAR ? -1 : a.localeCompare(b, "es"),
  );
  for (const proveedor of proveedores) {
    const filas = porProveedor.get(proveedor)!.sort((a, b) => String(a[1]).localeCompare(String(b[1]), "es"));
    const hoja = XLSX.utils.aoa_to_sheet([ENCABEZADOS, ...filas]);
    hoja["!cols"] = ANCHOS;
    XLSX.utils.book_append_sheet(libro, hoja, nombreDeHoja(proveedor, usados));
  }

  if (proveedores.length === 0) {
    const hoja = XLSX.utils.aoa_to_sheet([["El consolidado no tiene productos."]]);
    hoja["!cols"] = [{ wch: 40 }];
    XLSX.utils.book_append_sheet(libro, hoja, HOJA_VACIA);
  }

  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
