import type { FastifyInstance } from "fastify";
import type { Rol, Sucursal } from "@prisma/client";

export interface TokenPayload {
  sub: string;
  rol: Rol;
  sucursal?: Sucursal;
}

// Lo que el middleware deja en request.user (leído de la BD, no del token)
export interface AuthUser {
  id: string;
  nombre: string;
  rol: Rol;
  sucursal: Sucursal | null;
}

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: TokenPayload;
    user: AuthUser;
  }
}

export const COOKIE_NAME = "token";

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  // En segundos. Fijo en 7 días: si se cambia JWT_EXPIRES_IN, actualizar
  // esto también, o la cookie y el token vencen en momentos distintos.
  maxAge: 7 * 24 * 60 * 60,
};

export async function signToken(
  app: FastifyInstance,
  payload: TokenPayload,
): Promise<string> {
  return app.jwt.sign(payload);
}

export async function verifyToken(
  app: FastifyInstance,
  token: string,
): Promise<TokenPayload> {
  try {
    return app.jwt.verify<TokenPayload>(token);
  } catch (err) {
    throw new Error(`Token inválido: ${(err as Error).message}`, { cause: err });
  }
}
