import type { FastifyInstance, FastifyRequest } from "fastify";
import { Rol, Sucursal, type Usuario } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authenticate } from "../lib/auth.js";
import { COOKIE_NAME, COOKIE_OPTIONS, signToken } from "../lib/jwt.js";

const MAX_FALLOS = 10;
const VENTANA_BLOQUEO_MS = 15 * 60 * 1000;

const CREDENCIALES_INVALIDAS = { error: "Credenciales inválidas" };

// Hash de relleno: si el usuario no existe se compara igual contra esto,
// para que la respuesta tarde lo mismo y no revele qué ids/emails existen.
const HASH_RELLENO = bcrypt.hashSync("relleno-no-es-una-credencial", 10);

const repositoresQuery = z.object({
  sucursal: z.nativeEnum(Sucursal),
});

const loginBody = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("repositor"),
    usuarioId: z.string().min(1),
    pin: z.string().min(1),
  }),
  z.object({
    tipo: z.literal("email"),
    email: z.string().trim().toLowerCase().email(),
    password: z.string().min(1),
  }),
]);

interface RegistroFallos {
  count: number;
  desde: number;
  bloqueadoHasta: number;
}

function claveUsuario(request: FastifyRequest): string {
  const body = request.body as { usuarioId?: unknown; email?: unknown } | undefined;
  if (typeof body?.usuarioId === "string") return `usuario:${body.usuarioId}`;
  if (typeof body?.email === "string") return `email:${body.email.trim().toLowerCase()}`;
  return `ip:${request.ip}`;
}

function datosPublicos(usuario: Usuario) {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    rol: usuario.rol,
    sucursal: usuario.sucursal,
  };
}

export async function authRoutes(app: FastifyInstance) {
  // Fallos de PIN por repositor (en memoria, por instancia de la app)
  const fallos = new Map<string, RegistroFallos>();

  const estaBloqueado = (usuarioId: string, ahora: number) =>
    (fallos.get(usuarioId)?.bloqueadoHasta ?? 0) > ahora;

  const registrarFallo = (usuarioId: string, ahora: number) => {
    const registro = fallos.get(usuarioId);
    if (!registro || ahora - registro.desde > VENTANA_BLOQUEO_MS) {
      fallos.set(usuarioId, { count: 1, desde: ahora, bloqueadoHasta: 0 });
      return;
    }
    registro.count += 1;
    if (registro.count >= MAX_FALLOS) {
      registro.bloqueadoHasta = ahora + VENTANA_BLOQUEO_MS;
    }
  };

  // 10/min por usuario. El límite por IP va en la config de la ruta; este
  // necesita el body ya parseado, así que se aplica dentro del handler.
  const limitePorUsuario = app.createRateLimit({
    max: 10,
    timeWindow: "1 minute",
    keyGenerator: (request) => `login-${claveUsuario(request)}`,
  });

  app.get("/repositores", async (request, reply) => {
    const query = repositoresQuery.safeParse(request.query);
    if (!query.success) {
      return reply.code(400).send({ error: "Sucursal inválida" });
    }

    return app.db.usuario.findMany({
      where: {
        rol: Rol.REPOSITOR,
        sucursal: query.data.sucursal,
        activo: true,
        deletedAt: null,
      },
      select: { id: true, nombre: true, sucursal: true },
      orderBy: { nombre: "asc" },
    });
  });

  app.post(
    "/login",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = loginBody.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "Datos inválidos" });
      }

      // isAllowed solo es true para keys en allowList; el límite lo marca isExceeded
      const limite = await limitePorUsuario(request);
      if (!limite.isAllowed && limite.isExceeded) {
        return reply.code(429).send({ error: "Demasiados intentos, intentá en un minuto" });
      }

      const ahora = Date.now();
      let usuario: Usuario | null;

      if (body.data.tipo === "repositor") {
        const { usuarioId, pin } = body.data;

        if (estaBloqueado(usuarioId, ahora)) {
          return reply.code(429).send({ error: "Demasiados intentos, intentá en 15 min" });
        }

        usuario = await app.db.usuario.findFirst({
          where: { id: usuarioId, rol: Rol.REPOSITOR, activo: true, deletedAt: null },
        });
        const ok = await bcrypt.compare(pin, usuario?.pinHash ?? HASH_RELLENO);
        if (!usuario || !usuario.pinHash || !ok) {
          if (usuario) registrarFallo(usuario.id, ahora);
          return reply.code(401).send(CREDENCIALES_INVALIDAS);
        }
        fallos.delete(usuario.id);
      } else {
        const { email, password } = body.data;

        usuario = await app.db.usuario.findFirst({
          where: {
            email,
            rol: { in: [Rol.ADMIN, Rol.ENCARGADA] },
            activo: true,
            deletedAt: null,
          },
        });
        const ok = await bcrypt.compare(password, usuario?.passwordHash ?? HASH_RELLENO);
        if (!usuario || !usuario.passwordHash || !ok) {
          return reply.code(401).send(CREDENCIALES_INVALIDAS);
        }
      }

      const token = await signToken(app, {
        sub: usuario.id,
        rol: usuario.rol,
        ...(usuario.sucursal ? { sucursal: usuario.sucursal } : {}),
      });
      reply.setCookie(COOKIE_NAME, token, COOKIE_OPTIONS);

      return { usuario: datosPublicos(usuario) };
    },
  );

  app.post("/logout", { preHandler: authenticate }, async (_request, reply) => {
    reply.clearCookie(COOKIE_NAME, COOKIE_OPTIONS);
    return { ok: true };
  });

  app.get("/me", { preHandler: authenticate }, async (request) => {
    return { usuario: request.user };
  });
}
