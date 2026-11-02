import { api, ApiError, type Sucursal } from "./api";
import type { EstadoPedido, Meta, Unidad } from "./pedidosApi";

export interface FiltroHistorial {
  desde: string;
  hasta: string;
  proveedorId: string;
  sucursal: "" | Sucursal;
  q: string;
  estado: "APROBADO" | "TODOS";
}

export interface FilaHistorial {
  itemId: string;
  pedidoId: string;
  titulo: string | null;
  fechaEnvio: string | null;
  fechaAprobacion: string | null;
  estado: EstadoPedido;
  sucursal: Sucursal;
  repositor: { id: string; nombre: string };
  proveedor: { id: string; nombre: string } | null;
  producto: { id: string; codigo: string; nombre: string; unidad: Unidad; rubro: { id: string; nombre: string } };
  cantidad: string;
  cantidadDeposito: string | null;
  cantidadComprada: string;
}

export interface ResumenHistorial {
  producto: { id: string; codigo: string; nombre: string; unidad: Unidad };
  veces: number;
  pedido: string;
  deposito: string;
  comprado: string;
}

export interface RespuestaHistorial {
  data: FilaHistorial[];
  meta: Meta;
  resumen: ResumenHistorial[];
}

function consulta(f: FiltroHistorial, extra: Record<string, string | number> = {}): string {
  const qs = new URLSearchParams();
  const todo: Record<string, string | number> = {
    desde: f.desde,
    hasta: f.hasta,
    proveedorId: f.proveedorId,
    sucursal: f.sucursal,
    q: f.q.trim(),
    estado: f.estado,
    ...extra,
  };
  for (const [k, v] of Object.entries(todo)) {
    if (v !== "") qs.set(k, String(v));
  }
  return qs.toString();
}

export const historialApi = {
  listar: (f: FiltroHistorial, page: number) =>
    api<RespuestaHistorial>(`/historial?${consulta(f, { page, limit: 20 })}`),

  proveedores: async (): Promise<{ id: string; nombre: string }[]> => {
    const todos: { id: string; nombre: string }[] = [];
    for (let page = 1; page <= 20; page++) {
      const r = await api<{ data: { id: string; nombre: string }[]; meta: Meta }>(
        `/admin/proveedores?page=${page}&limit=100`,
      );
      todos.push(...r.data.map((p) => ({ id: p.id, nombre: p.nombre })));
      if (page >= r.meta.totalPages) break;
    }
    return todos;
  },

  // Descarga el Excel con la sesión y el nombre que manda el servidor
  descargarExcel: async (f: FiltroHistorial): Promise<void> => {
    let res: Response;
    try {
      res = await fetch(`/api/historial/excel?${consulta(f)}`, { credentials: "include" });
    } catch {
      throw new ApiError(0, "No se pudo conectar con el servidor. Revisá tu conexión.");
    }
    if (!res.ok) {
      const data: unknown = await res.json().catch(() => null);
      const msg =
        data && typeof data === "object" && "error" in data && typeof data.error === "string"
          ? data.error
          : "No se pudo descargar el Excel.";
      throw new ApiError(res.status, msg);
    }
    const blob = await res.blob();
    const disp = res.headers.get("Content-Disposition") ?? "";
    const m = /filename\*=UTF-8''([^;]+)/i.exec(disp) ?? /filename="?([^";]+)"?/i.exec(disp);
    const nombre = m?.[1] ? decodeURIComponent(m[1]) : "historial.xlsx";
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
