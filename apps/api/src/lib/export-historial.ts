import type { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import {
  MAX_FILAS_EXCEL,
  contarFilas,
  diaAR,
  listarFilas,
  lunesDe,
  resumenPorProducto,
  type Filtros,
  type FilaHistorial,
  type ResumenProducto,
} from "./historial.js";

export const HOJA_DETALLE = "Detalle";
export const HOJA_RESUMEN = "Resumen";

export const ENCABEZADOS_DETALLE = [
  "Fecha envío",
  "Semana",
  "Mes",
  "Sucursal",
  "Repositor",
  "Proveedor",
  "Pedido",
  "Código",
  "Producto",
  "Rubro",
  "Unidad",
  "Pedido",
  "Del galpón",
  "Comprado",
  "Estado",
  "Fecha aprobación",
];
export const ENCABEZADOS_RESUMEN = [
  "Código",
  "Producto",
  "Unidad",
  "Veces pedido",
  "Total pedido",
  "Del galpón",
  "Comprado",
];

const ANCHOS_DETALLE = [12, 12, 9, 10, 20, 24, 28, 16, 40, 18, 8, 9, 11, 10, 11, 14].map((wch) => ({ wch }));
const ANCHOS_RESUMEN = [16, 45, 8, 13, 13, 11, 11].map((wch) => ({ wch }));
const FORMATO_FECHA = "dd/mm/yyyy";

export class DemasiadasFilasError extends Error {
  readonly statusCode = 400;
  constructor() {
    super("Hay demasiados datos, achicá el rango de fechas");
  }
}

const NOMBRE_ESTADO: Record<string, string> = {
  APROBADO: "Aprobado",
  ENVIADO: "Enviado",
  DEVUELTO: "Devuelto",
};
const NOMBRE_SUCURSAL = { CARMAR_1: "Carmar 1", CARMAR_2: "Carmar 2" } as const;

// Número de serie de Excel (días desde 1899-12-30) de un día YYYY-MM-DD
export function serieExcel(dia: string): number {
  return (Date.parse(`${dia}T00:00:00Z`) - Date.UTC(1899, 11, 30)) / 86_400_000;
}

export function filaDetalle(f: FilaHistorial): (string | number)[] {
  const envio = f.fechaEnvio ? diaAR(f.fechaEnvio) : null;
  return [
    envio ? serieExcel(envio) : "",
    envio ? serieExcel(lunesDe(envio)) : "",
    envio ? envio.slice(0, 7) : "",
    NOMBRE_SUCURSAL[f.sucursal],
    f.repositor.nombre,
    f.proveedor?.nombre ?? "Sin proveedor",
    f.titulo,
    f.producto.codigo,
    f.producto.nombre,
    f.producto.rubro.nombre,
    f.producto.unidad,
    Number(f.cantidad),
    Number(f.cantidadDeposito ?? 0),
    Number(f.cantidadComprada),
    NOMBRE_ESTADO[f.estado] ?? f.estado,
    f.fechaAprobacion ? serieExcel(diaAR(f.fechaAprobacion)) : "",
  ];
}

export function filaResumen(r: ResumenProducto): (string | number)[] {
  return [
    r.producto.codigo,
    r.producto.nombre,
    r.producto.unidad,
    r.veces,
    Number(r.pedido),
    Number(r.deposito),
    Number(r.comprado),
  ];
}

// Arma el libro con las filas ya traídas (sin BD)
export function armarLibro(filas: FilaHistorial[], resumen: ResumenProducto[]): Buffer {
  const detalle = XLSX.utils.aoa_to_sheet([ENCABEZADOS_DETALLE, ...filas.map(filaDetalle)]);
  detalle["!cols"] = ANCHOS_DETALLE;
  // Columnas A, B y P son fechas (número de serie con formato de fecha)
  for (let r = 2; r <= filas.length + 1; r++) {
    for (const col of ["A", "B", "P"]) {
      const celda = detalle[`${col}${r}`];
      if (celda && celda.t === "n") celda.z = FORMATO_FECHA;
    }
  }
  const hojaResumen = XLSX.utils.aoa_to_sheet([ENCABEZADOS_RESUMEN, ...resumen.map(filaResumen)]);
  hojaResumen["!cols"] = ANCHOS_RESUMEN;

  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, detalle, HOJA_DETALLE);
  XLSX.utils.book_append_sheet(libro, hojaResumen, HOJA_RESUMEN);
  return XLSX.write(libro, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function nombreArchivoHistorial(desde: string, hasta: string): string {
  return `historial-pedidos_${desde}_a_${hasta}.xlsx`;
}

export async function exportarHistorial(db: PrismaClient, f: Filtros): Promise<Buffer> {
  if ((await contarFilas(db, f)) > MAX_FILAS_EXCEL) throw new DemasiadasFilasError();
  const [filas, resumen] = await Promise.all([listarFilas(db, f), resumenPorProducto(db, f, undefined)]);
  return armarLibro(filas, resumen);
}
