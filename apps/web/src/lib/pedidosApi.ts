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
  cantidadDeposito?: string | null;
  producto: { id: string; nombre: string; codigo: string; unidad: Unidad };
}

export interface ProveedorResumen {
  id: string;
  nombre: string;
}

export function nombrePedido(p: { titulo: string | null; proveedor: ProveedorResumen | null; createdAt: string }): string {
  if (p.titulo) return p.titulo;
  const d = new Date(p.createdAt);
  const fecha = `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return p.proveedor ? `${p.proveedor.nombre} – ${fecha}` : `Pedido del ${fecha}`;
}

export interface PedidoResumen {
  id: string;
  titulo: string | null;
  proveedor: ProveedorResumen | null;
  estado: EstadoPedido;
  comentarioDevolucion: string | null;
  periodo: PeriodoResumen | null;
  createdAt: string;
  _count: { items: number };
}

export interface PedidoCompleto {
  id: string;
  titulo: string | null;
  proveedor: ProveedorResumen | null;
  estado: EstadoPedido;
  comentarioDevolucion: string | null;
  periodo: PeriodoResumen | null;
  createdAt: string;
  items: ItemPedido[];
}

export interface SugeridoProducto {
  producto: ProductoBuscado;
  vecesPedido: number;
  ultimaCantidad: string | null;
  ultimaFecha: string | null;
}

export interface RepetirResultado {
  data: PedidoCompleto;
  copiados: number;
  omitidos: number;
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
  crear: (datos: { proveedorId?: string; titulo?: string } = {}) =>
    api<{ data: PedidoCompleto }>("/pedidos", {
      method: "POST",
      body: {
        ...(datos.proveedorId ? { proveedorId: datos.proveedorId } : {}),
        ...(datos.titulo ? { titulo: datos.titulo } : {}),
      },
    }).then((r) => r.data),
  proveedores: () =>
    api<{ data: ProveedorResumen[] }>("/pedidos/proveedores").then((r) => r.data),
  sugeridos: (id: string) =>
    api<{ data: SugeridoProducto[] }>(`/pedidos/${id}/sugeridos`).then((r) => r.data),
  fijarCantidades: (id: string, items: { productoId: string; cantidad: number }[]) =>
    api<{ data: PedidoCompleto }>(`/pedidos/${id}/items`, { method: "PUT", body: { items } }).then(
      (r) => r.data,
    ),
  repetirUltimo: (id: string) =>
    api<RepetirResultado>(`/pedidos/${id}/repetir-ultimo`, { method: "POST" }),
  cambiarTitulo: (id: string, titulo: string | null) =>
    api<{ data: PedidoCompleto }>(`/pedidos/${id}`, { method: "PATCH", body: { titulo } }).then(
      (r) => r.data,
    ),
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
