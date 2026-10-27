import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  EstadoConsolidado,
  EstadoPedido,
  EstadoPeriodo,
  PrismaClient,
  Rol,
  Sucursal,
  UnidadMedida,
} from "@prisma/client";
import { buildApp } from "../app.js";
import { ADMIN_SEED, loginToken, pedirCon } from "../test/helpers.js";

// Corre contra la BD de desarrollo con datos propios (prefijo en nombres y
// códigos). El consolidado no necesita un período abierto y los pedidos se
// crean directo en la BD, así que se usa un período de prueba CERRADO y no
// se toca el período del seed.
const PREFIJO = "test-cons-";

const prisma = new PrismaClient();
let app: FastifyInstance;
let pedir: ReturnType<typeof pedirCon>;
let periodoId: string;
let repositorId: string;
const prod: Record<"un" | "kg" | "otro", string> = { un: "", kg: "", otro: "" };

const empiezaCon = { startsWith: PREFIJO };

async function limpiar() {
  await prisma.consolidado.deleteMany({ where: { periodo: { nombre: empiezaCon } } });
  await prisma.pedido.deleteMany({ where: { periodo: { nombre: empiezaCon } } });
  await prisma.periodo.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.usuario.deleteMany({ where: { nombre: empiezaCon } });
}

// Pedido creado directo en la BD, en el estado indicado
async function pedido(estado: EstadoPedido, items: [productoId: string, cantidad: number][]) {
  return prisma.pedido.create({
    data: {
      repositorId,
      creadoPorId: repositorId,
      sucursal: Sucursal.CARMAR_2,
      periodoId,
      estado,
      items: { create: items.map(([productoId, cantidad]) => ({ productoId, cantidad })) },
    },
  });
}

function generar(id = periodoId) {
  return pedir("POST", "/consolidados", { periodoId: id });
}

function cantidades(res: Awaited<ReturnType<typeof generar>>) {
  return Object.fromEntries(
    res.json().data.items.map((i: { producto: { codigo: string }; cantidadTotal: string }) => [
      i.producto.codigo,
      i.cantidadTotal,
    ]),
  );
}

beforeEach(async () => {
  await limpiar();
  periodoId = (
    await prisma.periodo.create({
      data: { nombre: `${PREFIJO}Periodo`, fechaApertura: new Date(), estado: EstadoPeriodo.CERRADO },
    })
  ).id;
  repositorId = (
    await prisma.usuario.create({
      data: { nombre: `${PREFIJO}Repositor`, rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_2 },
    })
  ).id;
  const rubroId = (await prisma.rubro.create({ data: { nombre: `${PREFIJO}Rubro` } })).id;
  const proveedorId = (await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Proveedor` } })).id;
  const producto = async (codigo: string, unidad: UnidadMedida) =>
    (
      await prisma.producto.create({
        data: { codigo: `${PREFIJO}${codigo}`, nombre: `${PREFIJO}Producto ${codigo}`, rubroId, proveedorId, unidad },
      })
    ).id;
  prod.un = await producto("UN", UnidadMedida.UN);
  prod.kg = await producto("KG", UnidadMedida.KG);
  prod.otro = await producto("OTRO", UnidadMedida.UN);

  app = await buildApp(prisma, { logger: false });
  pedir = pedirCon(
    app,
    await loginToken(app, { tipo: "email", email: "encargada@carmar.com", password: "encargada123" }),
  );
});

afterEach(async () => {
  try {
    await app?.close();
  } finally {
    await limpiar();
  }
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("acceso", () => {
  it("sin auth: 401", async () => {
    const res = await app.inject({ method: "POST", url: "/consolidados", payload: { periodoId } });
    expect(res.statusCode).toBe(401);
  });

  it("con auth de repositor: 403", async () => {
    const repositor = await prisma.usuario.findFirstOrThrow({
      where: { rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_1, deletedAt: null, email: null },
      orderBy: { createdAt: "asc" },
    });
    const comoRepositor = pedirCon(
      app,
      await loginToken(app, { tipo: "repositor", usuarioId: repositor.id, pin: "1234" }),
    );

    expect((await comoRepositor("POST", "/consolidados", { periodoId })).statusCode).toBe(403);
  });

  it("admin también puede generar: 201", async () => {
    const admin = pedirCon(app, await loginToken(app, ADMIN_SEED));
    expect((await admin("POST", "/consolidados", { periodoId })).statusCode).toBe(201);
  });
});

describe("POST /consolidados", () => {
  it("período inexistente: 404", async () => {
    const res = await generar("no-existe");

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Período no encontrado" });
  });

  it("suma los pedidos ENVIADOS por producto (con decimales en KG)", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 3], [prod.kg, 1.5]]);
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2], [prod.kg, 2.25]]);

    const res = await generar();

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ periodoId, estado: "BORRADOR" });
    expect(cantidades(res)).toEqual({ [`${PREFIJO}UN`]: "5", [`${PREFIJO}KG`]: "3.75" });
    expect(res.json().data.items[0].cantidadEditada).toBeNull();
  });

  it("suma los pedidos APROBADOS junto con los ENVIADOS", async () => {
    await pedido(EstadoPedido.APROBADO, [[prod.un, 4]]);
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 1], [prod.otro, 7]]);

    const res = await generar();

    expect(res.statusCode).toBe(201);
    expect(cantidades(res)).toEqual({ [`${PREFIJO}UN`]: "5", [`${PREFIJO}OTRO`]: "7" });
  });

  it("no incluye pedidos BORRADOR ni DEVUELTO", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 1]]);
    await pedido(EstadoPedido.BORRADOR, [[prod.un, 100], [prod.otro, 100]]);
    await pedido(EstadoPedido.DEVUELTO, [[prod.un, 100]]);

    const res = await generar();

    expect(cantidades(res)).toEqual({ [`${PREFIJO}UN`]: "1" });
  });

  it("sin pedidos consolidables: crea el consolidado vacío", async () => {
    const res = await generar();

    expect(res.statusCode).toBe(201);
    expect(res.json().data.items).toEqual([]);
  });

  it("con un BORRADOR existente: lo reemplaza (id nuevo, sin cantidades editadas)", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2]]);
    const primero = (await generar()).json().data;
    await pedir("PATCH", `/consolidados/${primero.id}/items/${primero.items[0].id}`, { cantidadEditada: 10 });
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 3]]);

    const res = await generar();

    expect(res.statusCode).toBe(201);
    const segundo = res.json().data;
    expect(segundo.id).not.toBe(primero.id);
    expect(segundo.items[0]).toMatchObject({ cantidadTotal: "5", cantidadEditada: null });
    expect(await prisma.consolidado.findUnique({ where: { id: primero.id } })).toBeNull();
    expect(await prisma.consolidado.count({ where: { periodoId } })).toBe(1);
  });

  it("dos generaciones simultáneas del mismo período dejan un solo BORRADOR", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2]]);

    const resultados = await Promise.all([generar(), generar(), generar()]);

    expect(resultados.map((r) => r.statusCode)).toEqual([201, 201, 201]);
    expect(await prisma.consolidado.count({ where: { periodoId } })).toBe(1);
  });

  it("con un APROBADO existente: 409 y no lo toca", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2]]);
    const aprobado = (await generar()).json().data;
    await pedir("POST", `/consolidados/${aprobado.id}/aprobar`);

    const res = await generar();

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "Ya hay un consolidado aprobado para este período" });
    expect(await prisma.consolidado.count({ where: { periodoId } })).toBe(1);
  });
});

describe("PATCH /consolidados/:id/items/:itemId", () => {
  it("actualiza cantidadEditada y observación sin tocar cantidadTotal; null la vuelve a vaciar", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2]]);
    const consolidado = (await generar()).json().data;
    const url = `/consolidados/${consolidado.id}/items/${consolidado.items[0].id}`;

    const res = await pedir("PATCH", url, { cantidadEditada: 6, observacion: "redondeo a media caja" });
    const vaciar = await pedir("PATCH", url, { cantidadEditada: null });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      cantidadTotal: "2",
      cantidadEditada: "6",
      observacion: "redondeo a media caja",
      producto: { codigo: `${PREFIJO}UN`, proveedor: { nombre: `${PREFIJO}Proveedor` } },
    });
    expect(vaciar.json().data).toMatchObject({ cantidadEditada: null, observacion: "redondeo a media caja" });
  });

  it("decimal en un producto en UN o cantidad 0: 400", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2]]);
    const consolidado = (await generar()).json().data;
    const url = `/consolidados/${consolidado.id}/items/${consolidado.items[0].id}`;

    expect((await pedir("PATCH", url, { cantidadEditada: 2.5 })).statusCode).toBe(400);
    expect((await pedir("PATCH", url, { cantidadEditada: 0 })).statusCode).toBe(400);
  });

  it("un ítem de otro consolidado: 404", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2]]);
    const consolidado = (await generar()).json().data;
    const otroPeriodo = await prisma.periodo.create({
      data: { nombre: `${PREFIJO}Otro periodo`, fechaApertura: new Date(), estado: EstadoPeriodo.CERRADO },
    });
    const otro = await prisma.consolidado.create({
      data: {
        periodoId: otroPeriodo.id,
        items: { create: { productoId: prod.otro, cantidadTotal: 1 } },
      },
      include: { items: true },
    });

    const res = await pedir("PATCH", `/consolidados/${consolidado.id}/items/${otro.items[0].id}`, {
      cantidadEditada: 3,
    });

    expect(res.statusCode).toBe(404);
  });
});

describe("POST /consolidados/:id/aprobar", () => {
  it("pasa a APROBADO con quién y cuándo", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2]]);
    const consolidado = (await generar()).json().data;

    const res = await pedir("POST", `/consolidados/${consolidado.id}/aprobar`);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      estado: "APROBADO",
      aprobadoPor: { nombre: "Encargada de Compras" },
    });
    expect(res.json().data.fechaAprobacion).not.toBeNull();
  });

  it("aprobado queda congelado: PATCH de un ítem y aprobar de nuevo dan 400", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2]]);
    const consolidado = (await generar()).json().data;
    await pedir("POST", `/consolidados/${consolidado.id}/aprobar`);

    const editar = await pedir("PATCH", `/consolidados/${consolidado.id}/items/${consolidado.items[0].id}`, {
      cantidadEditada: 9,
    });
    const aprobarOtraVez = await pedir("POST", `/consolidados/${consolidado.id}/aprobar`);

    for (const res of [editar, aprobarOtraVez]) {
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "El consolidado está aprobado y no se puede modificar" });
    }
    expect((await prisma.consolidado.findUniqueOrThrow({ where: { id: consolidado.id } })).estado).toBe(
      EstadoConsolidado.APROBADO,
    );
  });
});

describe("GET /consolidados", () => {
  it("lista con filtros y detalle por id", async () => {
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 2], [prod.otro, 1]]);
    const consolidado = (await generar()).json().data;

    const lista = await pedir("GET", `/consolidados?periodoId=${periodoId}&estado=BORRADOR`);
    const aprobados = await pedir("GET", `/consolidados?periodoId=${periodoId}&estado=APROBADO`);
    const detalle = await pedir("GET", `/consolidados/${consolidado.id}`);
    const inexistente = await pedir("GET", "/consolidados/no-existe");

    expect(lista.json().meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(lista.json().data[0]).toMatchObject({
      id: consolidado.id,
      periodo: { nombre: `${PREFIJO}Periodo` },
      _count: { items: 2 },
    });
    expect(aprobados.json().data).toEqual([]);
    expect(detalle.json().data.items).toHaveLength(2);
    expect(inexistente.statusCode).toBe(404);
  });
});
