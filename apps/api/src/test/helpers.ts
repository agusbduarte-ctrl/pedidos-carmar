import type { FastifyInstance, LightMyRequestResponse } from "fastify";

// Helpers compartidos por los tests de rutas admin.
// Los repositores de prueba van en CARMAR_2: auth.test.ts espera exactamente
// un repositor (el del seed) en CARMAR_1 y los archivos corren en paralelo.

export const ADMIN_SEED = { tipo: "email", email: "admin@carmar.com", password: "admin123" };

export function cookieToken(res: LightMyRequestResponse): string | undefined {
  return res.cookies.find((c) => c.name === "token")?.value;
}

export async function loginToken(app: FastifyInstance, payload: Record<string, string>) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload });
  const token = cookieToken(res);
  if (!token) throw new Error(`Login falló (${res.statusCode}): ${res.body}`);
  return token;
}

export type Metodo = "GET" | "POST" | "PATCH" | "DELETE";

export function pedirCon(app: FastifyInstance, token?: string) {
  return (method: Metodo, url: string, payload?: object) =>
    app.inject({ method, url, payload, ...(token ? { cookies: { token } } : {}) });
}
