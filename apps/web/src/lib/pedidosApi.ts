import { api } from "./api";

export type EstadoPedido = "BORRADOR" | "ENVIADO" | "DEVUELTO" | "APROBADO";
export type Unidad = "UN" | "KG" | "LT" | "CAJA" | "PACK";

export interface PeriodoResumen {
  id: string;
  nombre: string;
  estado: string;
}

export interface ItemPedido {
  id: string;
  productoId: string;
  // Decimal de la BD: puede llegar como string
  cantidad: string | number;
  observacion: string | null;
  producto: { id: string; nombre: string; codigo: string; unidad: Unidad };
}

export interface PedidoResumen {
  id: string;
  estado: EstadoPedido;
  comentarioDevolucion: string | null;
  periodo: PeriodoResumen;
  createdAt: string;
  _count: { items: number };
}

export interface PedidoCompleto {
  id: string;
  estado: EstadoPedido;
  comentarioDevolucion: string | null;
  periodo: PeriodoResumen;
  items: ItemPedido[];
}

export interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductoBuscado {
  id: string;
  codigo: string;
  nombre: string;
  unidad: Unidad;
  rubro: { id: string; nombre: string };
}

export interface RubroItem {
  id: string;
  nombre: string;
}

export interface NuevoItem {
  productoId: string;
  cantidad: number;
  observacion?: string;
}

export const pedidosApi = {
  misPedidos: () =>
    api<{ data: PedidoResumen[]; meta: Meta }>("/pedidos/mis-pedidos").then((r) => r.data),
  detalle: (id: string) =>
    api<{ data: PedidoCompleto }>(`/pedidos/mis-pedidos/${id}`).then((r) => r.data),
  crear: () => api<{ data: PedidoCompleto }>("/pedidos", { method: "POST" }).then((r) => r.data),
  agregarItem: (id: string, item: NuevoItem) =>
    api<{ data: PedidoCompleto }>(`/pedidos/${id}/items`, { method: "POST", body: item }).then(
      (r) => r.data,
    ),
  quitarItem: (id: string, itemId: string) =>
    api<{ ok: true }>(`/pedidos/${id}/items/${itemId}`, { method: "DELETE" }),
  enviar: (id: string) =>
    api<{ data: PedidoCompleto }>(`/pedidos/${id}/enviar`, { method: "POST" }).then((r) => r.data),
  productos: (params: { q: string; rubroId: string; page: number }) => {
    const qs = new URLSearchParams({ page: String(params.page), limit: "20" });
    if (params.q) qs.set("q", params.q);
    if (params.rubroId) qs.set("rubroId", params.rubroId);
    return api<{ data: ProductoBuscado[]; meta: Meta }>(`/pedidos/productos?${qs.toString()}`);
  },
  misRubros: () => api<RubroItem[]>("/pedidos/mis-rubros"),
};
