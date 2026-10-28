import { api, type Rol, type Sucursal } from "./api";
import type { Meta, Unidad } from "./pedidosApi";

export interface UsuarioAdmin {
  id: string;
  email: string | null;
  nombre: string;
  rol: Rol;
  sucursal: Sucursal | null;
  activo: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Pagina<T> {
  data: T[];
  meta: Meta;
}

export interface Opcion {
  id: string;
  nombre: string;
}

export interface FiltroUsuarios {
  q: string;
  rol: Rol | "";
  incluirInactivos: boolean;
  page: number;
}

export type NuevoUsuario =
  | { rol: "REPOSITOR"; nombre: string; sucursal: Sucursal; pin: string }
  | { rol: "ADMIN" | "ENCARGADA"; nombre: string; email: string; password: string };

export interface CambioUsuario {
  nombre?: string;
  email?: string;
  password?: string;
  pin?: string;
  sucursal?: Sucursal;
  activo?: boolean;
}

export interface ProductoAdmin {
  id: string;
  codigo: string;
  nombre: string;
  unidad: Unidad;
  precioReferencia: string | number | null;
  activo: boolean;
  rubroId: string;
  proveedorId: string | null;
  rubro: Opcion;
  proveedor: Opcion | null;
}

export interface FiltroProductos {
  q: string;
  rubroId: string;
  incluirInactivos: boolean;
  page: number;
}

export interface NuevoProducto {
  codigo: string;
  nombre: string;
  rubroId: string;
  proveedorId?: string;
  unidad: Unidad;
  precioReferencia?: number;
  activo: boolean;
}

export interface CambioProducto {
  nombre?: string;
  rubroId?: string;
  proveedorId?: string | null;
  unidad?: Unidad;
  precioReferencia?: number | null;
  activo?: boolean;
}

function consulta(params: Record<string, string | number | boolean>): string {
  const qs = new URLSearchParams();
  for (const [clave, valor] of Object.entries(params)) {
    if (valor === "" || valor === false) continue;
    qs.set(clave, String(valor));
  }
  return qs.toString();
}

export const POR_PAGINA = 20;

export const adminApi = {
  usuarios: (f: FiltroUsuarios) =>
    api<Pagina<UsuarioAdmin>>(
      `/admin/usuarios?${consulta({
        q: f.q.trim(),
        rol: f.rol,
        incluirInactivos: f.incluirInactivos,
        page: f.page,
        limit: POR_PAGINA,
      })}`,
    ),
  crearUsuario: (body: NuevoUsuario) =>
    api<{ data: UsuarioAdmin }>("/admin/usuarios", { method: "POST", body }).then((r) => r.data),
  editarUsuario: (id: string, body: CambioUsuario) =>
    api<{ data: UsuarioAdmin }>(`/admin/usuarios/${id}`, { method: "PATCH", body }).then(
      (r) => r.data,
    ),
  borrarUsuario: (id: string) => api<{ ok: true }>(`/admin/usuarios/${id}`, { method: "DELETE" }),
  rubrosDeUsuario: (id: string) =>
    api<{ data: Opcion[] }>(`/admin/usuarios/${id}/rubros`).then((r) => r.data),
  guardarRubrosDeUsuario: (id: string, rubroIds: string[]) =>
    api<{ data: Opcion[] }>(`/admin/usuarios/${id}/rubros`, {
      method: "PUT",
      body: { rubroIds },
    }).then((r) => r.data),

  productos: (f: FiltroProductos) =>
    api<Pagina<ProductoAdmin>>(
      `/admin/productos?${consulta({
        q: f.q.trim(),
        rubroId: f.rubroId,
        incluirInactivos: f.incluirInactivos,
        page: f.page,
        limit: POR_PAGINA,
      })}`,
    ),
  crearProducto: (body: NuevoProducto) =>
    api<{ data: ProductoAdmin }>("/admin/productos", { method: "POST", body }).then((r) => r.data),
  editarProducto: (id: string, body: CambioProducto) =>
    api<{ data: ProductoAdmin }>(`/admin/productos/${id}`, { method: "PATCH", body }).then(
      (r) => r.data,
    ),
  borrarProducto: (id: string) => api<{ ok: true }>(`/admin/productos/${id}`, { method: "DELETE" }),

  rubros: () =>
    api<Pagina<Opcion>>("/admin/rubros?limit=100").then((r) => r.data),
  proveedores: () =>
    api<Pagina<Opcion>>("/admin/proveedores?limit=100").then((r) => r.data),
};
