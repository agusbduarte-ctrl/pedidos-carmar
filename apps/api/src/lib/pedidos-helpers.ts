import {
  EstadoPedido,
  EstadoPeriodo,
  UnidadMedida,
  type PrismaClient,
  type Sucursal,
} from "@prisma/client";

export const ESTADOS_EDITABLES: readonly EstadoPedido[] = [
  EstadoPedido.BORRADOR,
  EstadoPedido.DEVUELTO,
];

// Solo KG y LT admiten cantidades con decimales
const UNIDADES_DECIMALES: readonly UnidadMedida[] = [UnidadMedida.KG, UnidadMedida.LT];

export function cantidadValida(cantidad: number, unidad: UnidadMedida): boolean {
  return UNIDADES_DECIMALES.includes(unidad) || Number.isInteger(cantidad);
}

export function getPeriodoAbierto(db: PrismaClient) {
  return db.periodo.findFirst({ where: { estado: EstadoPeriodo.ABIERTO } });
}

// true si el repositor tiene el rubro asignado. Si se pasa sucursal, la
// asignación tiene que ser de esa sucursal (RepositorRubro es por sucursal).
export async function verificarRubroAsignado(
  db: PrismaClient,
  usuarioId: string,
  rubroId: string,
  sucursal?: Sucursal,
): Promise<boolean> {
  const asignacion = await db.repositorRubro.findFirst({
    where: { usuarioId, rubroId, ...(sucursal ? { sucursal } : {}) },
    select: { id: true },
  });
  return asignacion !== null;
}
