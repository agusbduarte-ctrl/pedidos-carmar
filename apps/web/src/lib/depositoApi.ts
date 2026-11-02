import { api, type Sucursal } from "./api";
import type { EstadoPedido, Meta, ProveedorResumen, Unidad } from "./pedidosApi";

export type VistaDeposito = "revisar" | "trasladar";

export interface PedidoDepositoFila {
  id: string;
  titulo: string | null;
  createdAt: string;
  sucursal: Sucursal;
  estado: EstadoPedido;
  fechaEnvio: string | null;
  fechaAprobacion: string | null;
  fechaRevisionDeposito: string | null;
  proveedor: ProveedorResumen | null;
  repositor: { id: string; nombre: string };
  _count: { items: number };
}

export interface ItemDeposito {
  id: string;
  cantidad: string;
  cantidadDeposito: string | null;
  observacion: string | null;
  producto: {
    id: string;
    codigo: string;
    nombre: string;
    unidad: Unidad;
    rubro: { id: string; nombre: string };
  };
}

export interface PedidoDepositoDetalle extends PedidoDepositoFila {
  revisadoDepositoPor: { id: string; nombre: string } | null;
  fechaTrasladoEnviado: string | null;
  items: ItemDeposito[];
}

export const depositoApi = {
  lista: (vista: VistaDeposito, page: number) =>
    api<{ data: PedidoDepositoFila[]; meta: Meta }>(
      `/deposito/pedidos?vista=${vista}&page=${page}&limit=20`,
    ),
  detalle: (id: string) =>
    api<{ data: PedidoDepositoDetalle }>(`/deposito/pedidos/${id}`).then((r) => r.data),
  revisar: (id: string, items: { itemId: string; cantidadDeposito: number }[]) =>
    api<{ data: PedidoDepositoDetalle }>(`/deposito/pedidos/${id}/revision`, {
      method: "PUT",
      body: { items },
    }).then((r) => r.data),
  trasladoEnviado: (id: string) =>
    api<{ data: PedidoDepositoDetalle }>(`/deposito/pedidos/${id}/traslado-enviado`, {
      method: "POST",
    }).then((r) => r.data),
};
