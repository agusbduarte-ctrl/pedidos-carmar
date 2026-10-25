import type { FastifyReply, FastifyRequest } from "fastify";
import type { Rol } from "@prisma/client";
import { COOKIE_NAME, verifyToken } from "./jwt.js";

function tokenDeRequest(request: FastifyRequest): string | undefined {
  const cookie = request.cookies[COOKIE_NAME];
  if (cookie) return cookie;

  const header = request.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice("Bearer ".length);

  return undefined;
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const token = tokenDeRequest(request);
  if (!token) {
    return reply.code(401).send({ error: "No autenticado" });
  }

  let sub: string;
  try {
    ({ sub } = await verifyToken(request.server, token));
  } catch {
    return reply.code(401).send({ error: "No autenticado" });
  }

  // Revocación: el usuario tiene que seguir existiendo y activo en la BD
  const usuario = await request.server.db.usuario.findFirst({
    where: { id: sub, activo: true, deletedAt: null },
    select: { id: true, nombre: true, rol: true, sucursal: true },
  });
  if (!usuario) {
    return reply.code(401).send({ error: "Usuario no válido" });
  }

  request.user = usuario;
}

export function requireRole(...roles: Rol[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.user || !roles.includes(request.user.rol)) {
      return reply.code(403).send({ error: "No autorizado" });
    }
  };
}
