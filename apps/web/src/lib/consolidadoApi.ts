import { api } from "./api";
import type { Meta, Unidad } from "./pedidosApi";

export type EstadoPeriodo = "ABIERTO" | "CERRADO" | string;
export type EstadoConsolidado = "BORRADOR" | "APROBADO";

export interface PeriodoLista {
  id: string;
  nombre: string;
  estado: EstadoPeriodo;
  fechaApertura: string | null;
  fechaCierre: string | null;
}

export interface ConsolidadoResumen {
  id: string;
  estado: EstadoConsolidado;
  periodoId: string;
  createdAt: string;
  fechaAprobacion: string | null;
  aprobadoPor: { id: string; nombre: string } | null;
  _count: { items: number };
}

// Prisma serializa los Decimal como texto ("12.5")
export type Numerico = string | number;

export interface ItemConsolidado {
  id: string;
  cantidadTotal: Numerico;
  cantidadEditada: Numerico | null;
  observacion: string | null;
  producto: {
    id: string;
    nombre: string;
    codigo: string;
    unidad: Unidad;
    rubro: { id: string; nombre: string };
    proveedor: { id: string; nombre: string } | null;
  };
}

export interface ConsolidadoDetalle {
  id: string;
  estado: EstadoConsolidado;
  periodo: { id: string; nombre: string; estado: EstadoPeriodo };
  aprobadoPor: { id: string; nombre: string } | null;
  fechaAprobacion: string | null;
  items: ItemConsolidado[];
}

export const consolidadoApi = {
  periodos: () =>
    api<{ data: PeriodoLista[]; meta: Meta }>("/periodos?page=1&limit=50").then((r) => r.data),
  delPeriodo: (periodoId: string) =>
    api<{ data: ConsolidadoResumen[]; meta: Meta }>(
      `/consolidados?periodoId=${encodeURIComponent(periodoId)}&limit=20`,
    ).then((r) => r.data),
  detalle: (id: string) =>
    api<{ data: ConsolidadoDetalle }>(`/consolidados/${id}`).then((r) => r.data),
  generar: (periodoId: string) =>
    api<{ data: ConsolidadoDetalle }>("/consolidados", {
      method: "POST",
      body: { periodoId },
    }).then((r) => r.data),
  editarItem: (
    id: string,
    itemId: string,
    cambio: { cantidadEditada: number | null; observacion: string | null },
  ) =>
    api<{ data: ItemConsolidado }>(`/consolidados/${id}/items/${itemId}`, {
      method: "PATCH",
      body: cambio,
    }).then((r) => r.data),
  aprobar: (id: string) =>
    api<{ data: ConsolidadoDetalle }>(`/consolidados/${id}/aprobar`, { method: "POST" }).then(
      (r) => r.data,
    ),
  urlExcel: (id: string) => `/api/consolidados/${id}/export`,
};
