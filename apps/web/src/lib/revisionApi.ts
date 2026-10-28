import { api, type Sucursal } from "./api";
import type { EstadoPedido, ItemPedido, Meta, PeriodoResumen } from "./pedidosApi";

export interface UsuarioNombre {
  id: string;
  nombre: string;
}

export interface PedidoRevisionResumen {
  id: string;
  estado: EstadoPedido;
  sucursal: Sucursal;
  fechaEnvio: string | null;
  repositor: UsuarioNombre;
  periodo: PeriodoResumen;
  _count: { items: number };
}

export interface ItemRevision extends Omit<ItemPedido, "producto"> {
  producto: ItemPedido["producto"] & { rubro: { id: string; nombre: string } };
}

export interface PedidoRevisionDetalle {
  id: string;
  estado: EstadoPedido;
  sucursal: Sucursal;
  periodo: PeriodoResumen;
  repositor: UsuarioNombre;
  enviadoPor: UsuarioNombre | null;
  devueltoPor: UsuarioNombre | null;
  aprobadoPor: UsuarioNombre | null;
  comentarioDevolucion: string | null;
  fechaEnvio: string | null;
  fechaDevolucion: string | null;
  fechaAprobacion: string | null;
  items: ItemRevision[];
}

export interface FiltroLista {
  estado: EstadoPedido | "";
  sucursal: Sucursal | "";
  page: number;
}

export const revisionApi = {
  lista: (f: FiltroLista) => {
    const qs = new URLSearchParams({ page: String(f.page), limit: "20" });
    if (f.estado) qs.set("estado", f.estado);
    if (f.sucursal) qs.set("sucursal", f.sucursal);
    return api<{ data: PedidoRevisionResumen[]; meta: Meta }>(`/pedidos?${qs.toString()}`);
  },
  detalle: (id: string) =>
    api<{ data: PedidoRevisionDetalle }>(`/pedidos/${id}`).then((r) => r.data),
  aprobar: (id: string) =>
    api<{ data: PedidoRevisionDetalle }>(`/pedidos/${id}/aprobar`, { method: "POST" }).then(
      (r) => r.data,
    ),
  devolver: (id: string, comentario: string) =>
    api<{ data: PedidoRevisionDetalle }>(`/pedidos/${id}/devolver`, {
      method: "POST",
      body: { comentario },
    }).then((r) => r.data),
};
