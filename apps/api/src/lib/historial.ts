import { EstadoPedido, Prisma, Sucursal, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { skipTake, type PaginationQuery } from "./pagination.js";

// Todas las fechas del historial son días de Argentina (UTC-3, sin horario de verano)
export const ZONA = "America/Argentina/Buenos_Aires";
const OFFSET_AR_MS = 3 * 60 * 60 * 1000;
const DIA_MS = 24 * 60 * 60 * 1000;

export const DIAS_POR_DEFECTO = 30;
export const MAX_DIAS_RANGO = 400;
export const MAX_FILAS_EXCEL = 50_000;
export const MAX_RESUMEN = 200;

function fechaIso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const diaMs = (s: string) => Date.parse(`${s}T00:00:00Z`);

const fechaStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Tiene que ser una fecha YYYY-MM-DD")
  .refine((s) => !Number.isNaN(diaMs(s)) && fechaIso(diaMs(s)) === s, "La fecha no existe");

export const historialQuery = z.object({
  desde: fechaStr.optional(),
  hasta: fechaStr.optional(),
  proveedorId: z.string().min(1).optional(),
  sucursal: z.nativeEnum(Sucursal).optional(),
  q: z.string().trim().max(100).optional(),
  estado: z.enum(["APROBADO", "TODOS"]).default("APROBADO"),
});
export type HistorialQuery = z.infer<typeof historialQuery>;

// Día (YYYY-MM-DD) de Argentina en el que cae un instante
export function diaAR(fecha: Date): string {
  return fechaIso(fecha.getTime() - OFFSET_AR_MS);
}

export interface Filtros {
  desde: string;
  hasta: string;
  /** Instante en que empieza `desde` (00:00 AR) */
  desdeInstante: Date;
  /** Instante en que empieza el día siguiente a `hasta` (exclusivo) */
  hastaExclusivo: Date;
  proveedorId?: string;
  sucursal?: Sucursal;
  q?: string;
  estado: "APROBADO" | "TODOS";
}

// Completa los valores por defecto y valida el rango. Devuelve el mensaje de error si no sirve.
export function resolverFiltros(
  query: HistorialQuery,
  ahora: Date = new Date(),
): { ok: true; filtros: Filtros } | { ok: false; error: string } {
  const hasta = query.hasta ?? diaAR(ahora);
  const desde = query.desde ?? fechaIso(diaMs(hasta) - (DIAS_POR_DEFECTO - 1) * DIA_MS);
  if (diaMs(desde) > diaMs(hasta)) {
    return { ok: false, error: "La fecha 'desde' no puede ser posterior a 'hasta'" };
  }
  if ((diaMs(hasta) - diaMs(desde)) / DIA_MS + 1 > MAX_DIAS_RANGO) {
    return { ok: false, error: `El rango no puede superar ${MAX_DIAS_RANGO} días` };
  }
  return {
    ok: true,
    filtros: {
      desde,
      hasta,
      desdeInstante: new Date(diaMs(desde) + OFFSET_AR_MS),
      hastaExclusivo: new Date(diaMs(hasta) + DIA_MS + OFFSET_AR_MS),
      proveedorId: query.proveedorId,
      sucursal: query.sucursal,
      q: query.q || undefined,
      estado: query.estado,
    },
  };
}

export function whereHistorial(f: Filtros): Prisma.ItemPedidoWhereInput {
  return {
    pedido: {
      fechaEnvio: { gte: f.desdeInstante, lt: f.hastaExclusivo },
      estado:
        f.estado === "TODOS"
          ? { in: [EstadoPedido.ENVIADO, EstadoPedido.DEVUELTO, EstadoPedido.APROBADO] }
          : EstadoPedido.APROBADO,
      ...(f.sucursal ? { sucursal: f.sucursal } : {}),
      ...(f.proveedorId ? { proveedorId: f.proveedorId } : {}),
    },
    ...(f.q
      ? {
          producto: {
            OR: [
              { nombre: { contains: f.q, mode: "insensitive" } },
              { codigo: { contains: f.q, mode: "insensitive" } },
            ],
          },
        }
      : {}),
  };
}

const ITEM_INCLUDE = {
  pedido: {
    select: {
      id: true,
      titulo: true,
      fechaEnvio: true,
      fechaAprobacion: true,
      estado: true,
      sucursal: true,
      repositor: { select: { id: true, nombre: true } },
      proveedor: { select: { id: true, nombre: true } },
    },
  },
  producto: {
    select: {
      id: true,
      codigo: true,
      nombre: true,
      unidad: true,
      rubro: { select: { id: true, nombre: true } },
    },
  },
} satisfies Prisma.ItemPedidoInclude;

const ORDEN: Prisma.ItemPedidoOrderByWithRelationInput[] = [
  { pedido: { fechaEnvio: "desc" } },
  { producto: { nombre: "asc" } },
  { id: "asc" },
];

type ItemConDatos = Prisma.ItemPedidoGetPayload<{ include: typeof ITEM_INCLUDE }>;

const ddmm = (d: Date) => {
  const [, m, dia] = diaAR(d).split("-");
  return `${dia}/${m}`;
};

// Título del pedido, o uno armado si no tiene
export function tituloPedido(p: {
  titulo: string | null;
  fechaEnvio: Date | null;
  proveedor: { nombre: string } | null;
}) {
  if (p.titulo) return p.titulo;
  const fecha = p.fechaEnvio ? ddmm(p.fechaEnvio) : "";
  if (p.proveedor) return fecha ? `${p.proveedor.nombre} – ${fecha}` : p.proveedor.nombre;
  return `Pedido del ${fecha}`;
}

export function aFila(item: ItemConDatos) {
  const { pedido, producto } = item;
  const deposito = item.cantidadDeposito;
  return {
    itemId: item.id,
    pedidoId: pedido.id,
    titulo: tituloPedido(pedido),
    fechaEnvio: pedido.fechaEnvio,
    fechaAprobacion: pedido.fechaAprobacion,
    estado: pedido.estado,
    sucursal: pedido.sucursal,
    repositor: pedido.repositor,
    proveedor: pedido.proveedor,
    producto,
    cantidad: item.cantidad.toString(),
    cantidadDeposito: deposito === null ? null : deposito.toString(),
    cantidadComprada: item.cantidad.sub(deposito ?? 0).toString(),
  };
}
export type FilaHistorial = ReturnType<typeof aFila>;

export function contarFilas(db: PrismaClient, f: Filtros): Promise<number> {
  return db.itemPedido.count({ where: whereHistorial(f) });
}

export async function listarFilas(
  db: PrismaClient,
  f: Filtros,
  paginacion?: PaginationQuery,
): Promise<FilaHistorial[]> {
  const items = await db.itemPedido.findMany({
    where: whereHistorial(f),
    include: ITEM_INCLUDE,
    orderBy: ORDEN,
    ...(paginacion ? skipTake(paginacion) : {}),
  });
  return items.map(aFila);
}

export interface ResumenProducto {
  producto: { id: string; codigo: string; nombre: string; unidad: string };
  veces: number;
  pedido: string;
  deposito: string;
  comprado: string;
}

// Por producto, sobre todo el filtro: mayor cantidad pedida primero
export async function resumenPorProducto(
  db: PrismaClient,
  f: Filtros,
  max: number | undefined = MAX_RESUMEN,
): Promise<ResumenProducto[]> {
  const grupos = await db.itemPedido.groupBy({
    by: ["productoId"],
    where: whereHistorial(f),
    _count: { _all: true },
    _sum: { cantidad: true, cantidadDeposito: true },
    orderBy: [{ _sum: { cantidad: "desc" } }, { productoId: "asc" }],
    ...(max ? { take: max } : {}),
  });
  const productos = await db.producto.findMany({
    where: { id: { in: grupos.map((g) => g.productoId) } },
    select: { id: true, codigo: true, nombre: true, unidad: true },
  });
  const porId = new Map(productos.map((p) => [p.id, p]));
  return grupos.map((g) => {
    const pedido = g._sum.cantidad ?? new Prisma.Decimal(0);
    const deposito = g._sum.cantidadDeposito ?? new Prisma.Decimal(0);
    return {
      producto: porId.get(g.productoId)!,
      veces: g._count._all,
      pedido: pedido.toString(),
      deposito: deposito.toString(),
      comprado: pedido.sub(deposito).toString(),
    };
  });
}

// Lunes (YYYY-MM-DD) de la semana de un día YYYY-MM-DD
export function lunesDe(dia: string): string {
  const ms = diaMs(dia);
  const diaSemana = new Date(ms).getUTCDay(); // 0 = domingo
  return fechaIso(ms - ((diaSemana + 6) % 7) * DIA_MS);
}
