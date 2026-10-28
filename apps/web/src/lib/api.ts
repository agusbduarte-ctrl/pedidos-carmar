export type Rol = "ADMIN" | "ENCARGADA" | "REPOSITOR";
export type Sucursal = "CARMAR_1" | "CARMAR_2";

export interface AuthUser {
  id: string;
  nombre: string;
  rol: Rol;
  sucursal: Sucursal | null;
}

export interface RepositorItem {
  id: string;
  nombre: string;
  sucursal: Sucursal;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detalles: string[];
  constructor(status: number, message: string, detalles: string[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detalles = detalles;
  }
}

function mensajePorEstado(status: number, errorApi?: string): string {
  switch (status) {
    case 0:
      return "No se pudo conectar con el servidor. Revisá tu conexión.";
    case 400:
      return errorApi && errorApi !== "Datos inválidos"
        ? errorApi
        : "Revisá los datos ingresados.";
    case 401:
      return "Datos incorrectos. Revisá e intentá de nuevo.";
    case 403:
      return "No tenés permiso para hacer esto.";
    case 429:
      return errorApi ?? "Demasiados intentos. Esperá un rato e intentá de nuevo.";
    default:
      return status >= 500
        ? "El servidor tuvo un problema. Intentá de nuevo en un rato."
        : (errorApi ?? "Ocurrió un error inesperado.");
  }
}

export async function api<T>(
  path: string,
  options: { method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE"; body?: unknown } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, mensajePorEstado(0));
  }

  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const errorApi =
      data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : undefined;
    const detalles =
      data && typeof data === "object" && "detalles" in data && Array.isArray(data.detalles)
        ? data.detalles.filter((d): d is string => typeof d === "string")
        : [];
    throw new ApiError(res.status, mensajePorEstado(res.status, errorApi), detalles);
  }
  return data as T;
}

export type LoginInput =
  | { tipo: "email"; email: string; password: string }
  | { tipo: "repositor"; usuarioId: string; pin: string };

export const authApi = {
  me: () => api<{ usuario: AuthUser }>("/auth/me").then((r) => r.usuario),
  login: (input: LoginInput) =>
    api<{ usuario: AuthUser }>("/auth/login", { method: "POST", body: input }).then(
      (r) => r.usuario,
    ),
  logout: () => api<{ ok: true }>("/auth/logout", { method: "POST" }),
  repositores: (sucursal: Sucursal) =>
    api<RepositorItem[]>(`/auth/repositores?sucursal=${sucursal}`),
};
