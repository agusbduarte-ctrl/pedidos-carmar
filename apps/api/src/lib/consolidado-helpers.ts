import { EstadoConsolidado, EstadoPedido, Prisma, type PrismaClient } from "@prisma/client";

// Pedidos que entran en un consolidado: los que la encargada ya tiene para revisar
export const ESTADOS_CONSOLIDABLES: EstadoPedido[] = [EstadoPedido.ENVIADO, EstadoPedido.APROBADO];

export const CONSOLIDADO_COMPLETO = {
  periodo: { select: { id: true, nombre: true, estado: true } },
  aprobadoPor: { select: { id: true, nombre: true } },
  items: {
    orderBy: { producto: { nombre: "asc" } },
    include: {
      producto: {
        select: {
          id: true,
          nombre: true,
          codigo: true,
          unidad: true,
          rubro: { select: { id: true, nombre: true } },
          proveedor: { select: { id: true, nombre: true } },
        },
      },
    },
  },
} satisfies Prisma.ConsolidadoInclude;

type Db = PrismaClient | Prisma.TransactionClient;

export function revalidarPedidos(db: Db, periodoId: string) {
  return db.pedido.findMany({
    where: { periodoId, estado: { in: ESTADOS_CONSOLIDABLES } },
    include: { items: { select: { productoId: true, cantidad: true } } },
  });
}

// Con un consolidado APROBADO el período queda congelado: un pedido que
// entra (enviar) o sale (devolver) del consolidado lo dejaría desactualizado
export async function periodoConConsolidadoAprobado(db: Db, periodoId: string): Promise<boolean> {
  const aprobado = await db.consolidado.findFirst({
    where: { periodoId, estado: EstadoConsolidado.APROBADO },
    select: { id: true },
  });
  return aprobado !== null;
}

export type ResultadoGeneracion =
  | { ok: true; consolidado: Prisma.ConsolidadoGetPayload<{ include: typeof CONSOLIDADO_COMPLETO }> }
  | { ok: false; error: "periodo_no_encontrado" | "ya_aprobado" };

// Genera (o regenera) el consolidado BORRADOR de un período sumando los
// pedidos ENVIADOS y APROBADOS. Si ya había un BORRADOR se reemplaza entero,
// incluidas sus cantidades editadas. Si hay uno APROBADO no se toca.
export async function generarConsolidado(db: PrismaClient, periodoId: string): Promise<ResultadoGeneracion> {
  return db.$transaction(async (tx) => {
    // Serializa generaciones simultáneas del mismo período (evita dos BORRADOR)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consolidado:${periodoId}`}))`;

    const periodo = await tx.periodo.findUnique({ where: { id: periodoId }, select: { id: true } });
    if (!periodo) return { ok: false, error: "periodo_no_encontrado" } as const;

    const aprobado = await tx.consolidado.findFirst({
      where: { periodoId, estado: EstadoConsolidado.APROBADO },
      select: { id: true },
    });
    if (aprobado) return { ok: false, error: "ya_aprobado" } as const;

    // Los ítems se borran en cascada
    await tx.consolidado.deleteMany({ where: { periodoId, estado: EstadoConsolidado.BORRADOR } });

    const totales = new Map<string, Prisma.Decimal>();
    for (const pedido of await revalidarPedidos(tx, periodoId)) {
      for (const { productoId, cantidad } of pedido.items) {
        totales.set(productoId, (totales.get(productoId) ?? new Prisma.Decimal(0)).add(cantidad));
      }
    }

    const consolidado = await tx.consolidado.create({
      data: {
        periodoId,
        estado: EstadoConsolidado.BORRADOR,
        items: {
          createMany: {
            data: [...totales].map(([productoId, cantidadTotal]) => ({ productoId, cantidadTotal })),
          },
        },
      },
      include: CONSOLIDADO_COMPLETO,
    });
    return { ok: true, consolidado } as const;
  });
}
