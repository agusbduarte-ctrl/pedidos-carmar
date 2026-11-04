import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../lib/auth.js";
import { sendValidationError } from "../lib/zod-helpers.js";

const suscripcionBody = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(1).max(500),
    auth: z.string().min(1).max(500),
  }),
});
const borrarBody = z.object({ endpoint: z.string().min(1).max(2000) });

export default async function pushRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);

  app.get("/clave-publica", async () => ({ data: { clave: app.clavePublicaPush } }));

  app.post("/suscripciones", async (request, reply) => {
    const body = suscripcionBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);
    const { endpoint, keys } = body.data;

    // Si el dispositivo cambió de usuario, la suscripción pasa al usuario actual
    await app.db.suscripcionPush.upsert({
      where: { endpoint },
      create: { endpoint, p256dh: keys.p256dh, auth: keys.auth, usuarioId: request.user.id },
      update: { p256dh: keys.p256dh, auth: keys.auth, usuarioId: request.user.id },
    });
    return reply.code(201).send({ data: { ok: true } });
  });

  app.delete("/suscripciones", async (request, reply) => {
    const body = borrarBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);

    await app.db.suscripcionPush.deleteMany({
      where: { endpoint: body.data.endpoint, usuarioId: request.user.id },
    });
    return reply.code(204).send();
  });
}
