import type { FastifyInstance } from "fastify";
import { EstadoPedido, Prisma, Rol } from "@prisma/client";
import { z } from "zod";
import { authenticate, requireRole } from "../lib/auth.js";
import { buildMeta, parsePagination, skipTake } from "../lib/pagination.js";
import { cantidadValida } from "../lib/pedidos-helpers.js";
import { sendValidationError } from "../lib/zod-helpers.js";

const ID_NOMBRE = { select: { id: true, nombre: true } } as const;

const FILA = {
  proveedor: ID_NOMBRE,
  repositor: ID_NOMBRE,
  _count: { select: { items: true } },
} satisfies Prisma.PedidoInclude;

const DETALLE = {
  proveedor: ID_NOMBRE,
  repositor: ID_NOMBRE,
  revisadoDepositoPor: ID_NOMBRE,
  _count: { select: { items: true } },
  items: {
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      cantidad: true,
      cantidadDeposito: true,
      observacion: true,
      producto: {
        select: {
          id: true,
          codigo: true,
          nombre: true,
          unidad: true,
          rubro: ID_NOMBRE,
        },
      },
    },
  },
} satisfies Prisma.PedidoInclude;

const listaQuery = z.object({ vista: z.enum(["revisar", "trasladar"]).default("revisar") });
const idParams = z.object({ id: z.string().min(1) });
const revisionBody = z.object({
  items: z
    .array(
      z.object({
        itemId: z.string().min(1),
        // Decimal(10, 2) en la BD
        cantidadDeposito: z.number().min(0).max(99_999_999.99),
      }),
    )
    .max(1000),
});

const NO_ENCONTRADO = { error: "Pedido no encontrado" };
const NO_REVISABLE = { error: "Solo se pueden revisar pedidos enviados" };
const YA_CAMBIO = { error: "El pedido cambió de estado, actualizá la pantalla" };

const VISIBLES: EstadoPedido[] = [EstadoPedido.ENVIADO, EstadoPedido.APROBADO];

// Pedidos aprobados con algo para mandar a las sucursales y todavía sin marcar
const PARA_TRASLADAR = {
  estado: EstadoPedido.APROBADO,
  fechaTrasladoEnviado: null,
  items: { some: { cantidadDeposito: { gt: 0 } } },
} satisfies Prisma.PedidoWhereInput;

export default async function depositoRoutes(app: FastifyInstance) {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireRole(Rol.DEPOSITO));

  const detalle = (id: string) => app.db.pedido.findUniqueOrThrow({ where: { id }, include: DETALLE });

  app.get("/pedidos", async (request, reply) => {
    const query = listaQuery.safeParse(request.query);
    if (!query.success) return sendValidationError(reply, query.error);
    const pagination = parsePagination(request.query);

    const revisar = query.data.vista === "revisar";
    const where: Prisma.PedidoWhereInput = revisar ? { estado: EstadoPedido.ENVIADO } : PARA_TRASLADAR;
    const [data, total] = await Promise.all([
      app.db.pedido.findMany({
        where,
        include: FILA,
        orderBy: revisar
          ? [{ fechaEnvio: "asc" }, { id: "asc" }]
          : [{ fechaAprobacion: "asc" }, { id: "asc" }],
        ...skipTake(pagination),
      }),
      app.db.pedido.count({ where }),
    ]);
    return { data, meta: buildMeta(total, pagination.page, pagination.limit) };
  });

  app.get("/pedidos/:id", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const data = await app.db.pedido.findFirst({
      where: { id: params.data.id, estado: { in: VISIBLES } },
      include: DETALLE,
    });
    if (!data) return reply.code(404).send(NO_ENCONTRADO);
    return { data };
  });

  app.put("/pedidos/:id/revision", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);
    const body = revisionBody.safeParse(request.body);
    if (!body.success) return sendValidationError(reply, body.error);

    const pedido = await app.db.pedido.findUnique({
      where: { id: params.data.id },
      select: {
        id: true,
        estado: true,
        items: {
          select: { id: true, cantidad: true, producto: { select: { codigo: true, nombre: true, unidad: true } } },
        },
      },
    });
    if (!pedido) return reply.code(404).send(NO_ENCONTRADO);
    if (pedido.estado !== EstadoPedido.ENVIADO) return reply.code(409).send(NO_REVISABLE);

    const porItem = new Map(pedido.items.map((it) => [it.id, it]));
    const detalles: string[] = [];
    const vistos = new Set<string>();
    for (const { itemId, cantidadDeposito } of body.data.items) {
      const item = porItem.get(itemId);
      if (!item) {
        detalles.push(`items: el ítem ${itemId} no es de este pedido`);
        continue;
      }
      const quien = `${item.producto.codigo} (${item.producto.nombre})`;
      if (vistos.has(itemId)) {
        detalles.push(`${quien}: está repetido`);
        continue;
      }
      vistos.add(itemId);
      if (!cantidadValida(cantidadDeposito, item.producto.unidad)) {
        detalles.push(`${quien}: tiene que ser un número entero para productos en ${item.producto.unidad}`);
      }
      if (cantidadDeposito > item.cantidad.toNumber()) {
        detalles.push(`${quien}: no puede ser mayor a lo pedido (${item.cantidad.toString()})`);
      }
    }
    for (const item of pedido.items) {
      if (!vistos.has(item.id)) {
        detalles.push(`${item.producto.codigo} (${item.producto.nombre}): falta cargar cuánto hay en el depósito`);
      }
    }
    if (detalles.length > 0) return reply.code(400).send({ error: "Datos inválidos", detalles });

    const ahora = new Date();
    const aplicado = await app.db.$transaction(async (tx) => {
      // Condicionado a que siga ENVIADO (por si la encargada lo aprueba o devuelve en paralelo)
      const { count } = await tx.pedido.updateMany({
        where: { id: pedido.id, estado: EstadoPedido.ENVIADO },
        data: { revisadoDepositoPorId: request.user.id, fechaRevisionDeposito: ahora },
      });
      if (count === 0) return false;
      for (const { itemId, cantidadDeposito } of body.data.items) {
        await tx.itemPedido.update({ where: { id: itemId }, data: { cantidadDeposito } });
      }
      return true;
    });
    if (!aplicado) return reply.code(409).send(YA_CAMBIO);

    return { data: await detalle(pedido.id) };
  });

  app.post("/pedidos/:id/traslado-enviado", async (request, reply) => {
    const params = idParams.safeParse(request.params);
    if (!params.success) return sendValidationError(reply, params.error);

    const pedido = await app.db.pedido.findUnique({
      where: { id: params.data.id },
      select: { id: true, estado: true, fechaTrasladoEnviado: true },
    });
    if (!pedido) return reply.code(404).send(NO_ENCONTRADO);
    if (pedido.estado !== EstadoPedido.APROBADO) {
      return reply.code(409).send({ error: "Solo se puede marcar como enviado un pedido aprobado" });
    }
    if (pedido.fechaTrasladoEnviado) {
      return reply.code(409).send({ error: "Este pedido ya se marcó como enviado a la sucursal" });
    }

    // Atómico: si dos lo marcan a la vez, el segundo no cuenta
    const { count } = await app.db.pedido.updateMany({
      where: { id: pedido.id, ...PARA_TRASLADAR },
      data: { trasladoEnviadoPorId: request.user.id, fechaTrasladoEnviado: new Date() },
    });
    if (count === 0) {
      return reply.code(409).send({ error: "No hay nada del depósito para mandar en este pedido" });
    }
    return { data: await detalle(pedido.id) };
  });
}
