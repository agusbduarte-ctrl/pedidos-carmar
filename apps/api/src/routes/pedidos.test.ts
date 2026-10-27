import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { EstadoPedido, EstadoPeriodo, PrismaClient, Rol, Sucursal, type Usuario } from "@prisma/client";
import { buildApp } from "../app.js";
import { loginToken, pedirCon } from "../test/helpers.js";

// Corre contra la BD de desarrollo. Cada test:
// - cierra temporalmente el período abierto del seed y crea uno propio;
// - crea rubros, proveedor y productos propios, y le asigna un rubro al
//   repositor del seed (CARMAR_1, PIN 1234);
// - al terminar borra todo lo suyo y vuelve a abrir el período del seed.
const PREFIJO = "test-ped-";

const prisma = new PrismaClient();
let app: FastifyInstance;
let pedir: ReturnType<typeof pedirCon>;
let repositor: Usuario;
let periodoId: string;
let rubroAsignadoId: string;
let proveedorId: string;
let abiertosDelSeed: string[] = [];
const productos: Record<"asignado" | "asignado2" | "noAsignado" | "inactivo", string> = {
  asignado: "",
  asignado2: "",
  noAsignado: "",
  inactivo: "",
};

const empiezaCon = { startsWith: PREFIJO };

async function limpiar() {
  await prisma.pedido.deleteMany({
    where: { OR: [{ periodo: { nombre: empiezaCon } }, { repositor: { nombre: empiezaCon } }] },
  });
  await prisma.periodo.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } }); // asignaciones en cascada
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.usuario.deleteMany({ where: { nombre: empiezaCon } });
  if (abiertosDelSeed.length > 0) {
    await prisma.periodo.updateMany({
      where: { id: { in: abiertosDelSeed } },
      data: { estado: EstadoPeriodo.ABIERTO },
    });
    abiertosDelSeed = [];
  }
}

beforeEach(async () => {
  await limpiar();

  const abiertos = await prisma.periodo.findMany({
    where: { estado: EstadoPeriodo.ABIERTO },
    select: { id: true },
  });
  abiertosDelSeed = abiertos.map((p) => p.id);
  await prisma.periodo.updateMany({
    where: { id: { in: abiertosDelSeed } },
    data: { estado: EstadoPeriodo.CERRADO },
  });
  periodoId = (
    await prisma.periodo.create({ data: { nombre: `${PREFIJO}Periodo`, fechaApertura: new Date() } })
  ).id;

  repositor = await prisma.usuario.findFirstOrThrow({
    where: { rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_1, deletedAt: null, email: null },
    orderBy: { createdAt: "asc" },
  });
  proveedorId = (await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Proveedor` } })).id;
  const asignado = await prisma.rubro.create({
    data: {
      nombre: `${PREFIJO}Asignado`,
      repositorRubros: { create: { usuarioId: repositor.id, sucursal: Sucursal.CARMAR_1 } },
    },
  });
  rubroAsignadoId = asignado.id;
  const noAsignado = await prisma.rubro.create({ data: { nombre: `${PREFIJO}NoAsignado` } });
  const crearProducto = async (codigo: string, rubroId: string, activo = true) =>
    (
      await prisma.producto.create({
        data: { codigo: `${PREFIJO}${codigo}`, nombre: `Producto ${codigo}`, rubroId, proveedorId, activo },
      })
    ).id;
  productos.asignado = await crearProducto("001", asignado.id);
  productos.asignado2 = await crearProducto("002", asignado.id);
  productos.noAsignado = await crearProducto("003", noAsignado.id);
  productos.inactivo = await crearProducto("004", asignado.id, false);

  app = await buildApp(prisma, { logger: false });
  pedir = pedirCon(
    app,
    await loginToken(app, { tipo: "repositor", usuarioId: repositor.id, pin: "1234" }),
  );
});

afterEach(async () => {
  // finally: se restaura el seed aunque app.close() falle
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

async function crearPedido() {
  const res = await pedir("POST", "/pedidos");
  expect(res.statusCode).toBe(201);
  return res.json().data as { id: string };
}

function agregar(pedidoId: string, productoId: string, cantidad: number, observacion?: string) {
  return pedir("POST", `/pedidos/${pedidoId}/items`, { productoId, cantidad, observacion });
}

describe("POST /pedidos", () => {
  it("sin período abierto: 400", async () => {
    await prisma.periodo.update({ where: { id: periodoId }, data: { estado: EstadoPeriodo.CERRADO } });

    const res = await pedir("POST", "/pedidos");

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "No hay período abierto" });
  });

  it("con período abierto: 201 en BORRADOR, con la sucursal del repositor", async () => {
    const res = await pedir("POST", "/pedidos");

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      repositorId: repositor.id,
      creadoPorId: repositor.id,
      sucursal: "CARMAR_1",
      estado: "BORRADOR",
      periodoId,
      items: [],
    });
  });

  it("si ya tiene un pedido en el período: 409", async () => {
    await crearPedido();

    const res = await pedir("POST", "/pedidos");

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "Ya tenés un pedido en este período" });
  });

  it("un usuario que no es repositor: 403", async () => {
    const encargada = pedirCon(
      app,
      await loginToken(app, { tipo: "email", email: "encargada@carmar.com", password: "encargada123" }),
    );

    expect((await encargada("POST", "/pedidos")).statusCode).toBe(403);
  });
});

describe("POST /pedidos/:id/items", () => {
  it("producto de un rubro no asignado: 403", async () => {
    const pedido = await crearPedido();

    const res = await agregar(pedido.id, productos.noAsignado, 1);

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "No tenés asignado ese rubro" });
  });

  it("producto inactivo: 404", async () => {
    const pedido = await crearPedido();

    expect((await agregar(pedido.id, productos.inactivo, 1)).statusCode).toBe(404);
  });

  it("producto válido: 200; repetido suma la cantidad y actualiza la observación", async () => {
    const pedido = await crearPedido();

    const primero = await agregar(pedido.id, productos.asignado, 2, "caja chica");
    const segundo = await agregar(pedido.id, productos.asignado, 3, "caja grande");

    expect(primero.statusCode).toBe(200);
    expect(segundo.statusCode).toBe(200);
    const { items } = segundo.json().data;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      cantidad: "5",
      observacion: "caja grande",
      producto: { id: productos.asignado, codigo: `${PREFIJO}001`, unidad: "UN" },
    });
  });

  it("decimal en un producto en UN: 400; en KG se acepta", async () => {
    const pedido = await crearPedido();
    const enKg = await prisma.producto.create({
      data: {
        codigo: `${PREFIJO}KG`,
        nombre: "Producto por kilo",
        unidad: "KG",
        rubroId: rubroAsignadoId,
        proveedorId,
      },
    });

    const enUn = await agregar(pedido.id, productos.asignado, 1.5);
    const kg = await agregar(pedido.id, enKg.id, 1.5);

    expect(enUn.statusCode).toBe(400);
    expect(enUn.json().detalles).toEqual(["cantidad: Tiene que ser un número entero para productos en UN"]);
    expect(kg.statusCode).toBe(200);
  });

  it("cantidad 0 u observación de más de 200 caracteres: 400", async () => {
    const pedido = await crearPedido();

    const cero = await agregar(pedido.id, productos.asignado, 0);
    const larga = await agregar(pedido.id, productos.asignado, 1, "x".repeat(201));

    expect(cero.statusCode).toBe(400);
    expect(larga.statusCode).toBe(400);
  });
});

describe("DELETE /pedidos/:id/items/:itemId", () => {
  it("borra el ítem: 200 y el pedido queda sin él", async () => {
    const pedido = await crearPedido();
    const item = (await agregar(pedido.id, productos.asignado, 1)).json().data.items[0];

    const res = await pedir("DELETE", `/pedidos/${pedido.id}/items/${item.id}`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect((await pedir("GET", `/pedidos/mis-pedidos/${pedido.id}`)).json().data.items).toEqual([]);
  });
});

describe("POST /pedidos/:id/enviar", () => {
  it("pedido vacío: 400", async () => {
    const pedido = await crearPedido();

    const res = await pedir("POST", `/pedidos/${pedido.id}/enviar`);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "El pedido está vacío" });
  });

  it("pedido con ítems: 200, queda ENVIADO con fecha y quién lo envió", async () => {
    const pedido = await crearPedido();
    await agregar(pedido.id, productos.asignado, 1);

    const res = await pedir("POST", `/pedidos/${pedido.id}/enviar`);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ estado: "ENVIADO", enviadoPorId: repositor.id });
    expect(res.json().data.fechaEnvio).not.toBeNull();
  });

  it("revalida al enviar: producto desactivado o rubro quitado después de cargarlo: 400", async () => {
    const pedido = await crearPedido();
    await agregar(pedido.id, productos.asignado, 1);
    await agregar(pedido.id, productos.asignado2, 1);
    await prisma.producto.update({ where: { id: productos.asignado }, data: { activo: false } });
    await prisma.repositorRubro.deleteMany({ where: { usuarioId: repositor.id, rubroId: rubroAsignadoId } });

    const res = await pedir("POST", `/pedidos/${pedido.id}/enviar`);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      error: "El pedido tiene ítems inválidos",
      detalles: [
        `${PREFIJO}001 (Producto 001): el producto ya no está activo`,
        `${PREFIJO}001 (Producto 001): ya no tenés asignado su rubro`,
        `${PREFIJO}002 (Producto 002): ya no tenés asignado su rubro`,
      ],
    });
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: pedido.id } })).estado).toBe("BORRADOR");
  });

  it("ENVIADO ya no se puede editar: agregar, borrar y reenviar dan 400", async () => {
    const pedido = await crearPedido();
    const item = (await agregar(pedido.id, productos.asignado, 1)).json().data.items[0];
    await pedir("POST", `/pedidos/${pedido.id}/enviar`);

    const agregarRes = await agregar(pedido.id, productos.asignado2, 1);
    const borrarRes = await pedir("DELETE", `/pedidos/${pedido.id}/items/${item.id}`);
    const reenviarRes = await pedir("POST", `/pedidos/${pedido.id}/enviar`);

    for (const res of [agregarRes, borrarRes, reenviarRes]) {
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "El pedido no se puede editar en estado ENVIADO" });
    }
  });

  it("si el período se cerró, el BORRADOR queda huérfano: no se edita ni se envía", async () => {
    const pedido = await crearPedido();
    await agregar(pedido.id, productos.asignado, 1);
    await prisma.periodo.update({ where: { id: periodoId }, data: { estado: EstadoPeriodo.CERRADO } });

    const agregarRes = await agregar(pedido.id, productos.asignado2, 1);
    const enviarRes = await pedir("POST", `/pedidos/${pedido.id}/enviar`);

    for (const res of [agregarRes, enviarRes]) {
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "El período del pedido está cerrado" });
    }
  });
});

describe("GET /pedidos/mis-pedidos", () => {
  it("solo devuelve los pedidos del repositor logueado", async () => {
    const propio = await crearPedido();
    const otro = await prisma.usuario.create({
      data: { nombre: `${PREFIJO}Otro repositor`, rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_2 },
    });
    const ajeno = await prisma.pedido.create({
      data: {
        repositorId: otro.id,
        creadoPorId: otro.id,
        sucursal: Sucursal.CARMAR_2,
        periodoId,
        estado: EstadoPedido.BORRADOR,
      },
    });

    const lista = await pedir("GET", "/pedidos/mis-pedidos");
    const detalleAjeno = await pedir("GET", `/pedidos/mis-pedidos/${ajeno.id}`);

    expect(lista.statusCode).toBe(200);
    const ids = lista.json().data.map((p: { id: string }) => p.id);
    expect(ids).toContain(propio.id);
    expect(ids).not.toContain(ajeno.id);
    expect(lista.json().data.every((p: { repositorId: string }) => p.repositorId === repositor.id)).toBe(true);
    expect(detalleAjeno.statusCode).toBe(404);
  });
});

// ============================================================
// Encargada
// ============================================================

const comoEncargada = async () =>
  pedirCon(app, await loginToken(app, { tipo: "email", email: "encargada@carmar.com", password: "encargada123" }));

async function pedidoEnviado() {
  const pedido = await crearPedido();
  await agregar(pedido.id, productos.asignado, 2);
  expect((await pedir("POST", `/pedidos/${pedido.id}/enviar`)).statusCode).toBe(200);
  return pedido;
}

describe("GET /pedidos (encargada)", () => {
  it("con auth de repositor: 403", async () => {
    expect((await pedir("GET", "/pedidos")).statusCode).toBe(403);
  });

  it("con auth de encargada: 200 con { data, meta } y datos del repositor y período", async () => {
    const pedido = await pedidoEnviado();
    const encargada = await comoEncargada();

    const res = await encargada("GET", `/pedidos?periodoId=${periodoId}`);

    expect(res.statusCode).toBe(200);
    expect(res.json().meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
    expect(res.json().data[0]).toMatchObject({
      id: pedido.id,
      sucursal: "CARMAR_1",
      estado: "ENVIADO",
      repositor: { id: repositor.id, nombre: repositor.nombre },
      periodo: { id: periodoId, nombre: `${PREFIJO}Periodo` },
      _count: { items: 1 },
    });
  });

  it("?estado=ENVIADO solo devuelve enviados", async () => {
    const enviado = await pedidoEnviado();
    const otro = await prisma.usuario.create({
      data: { nombre: `${PREFIJO}Otro repositor`, rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_2 },
    });
    await prisma.pedido.create({
      data: { repositorId: otro.id, creadoPorId: otro.id, sucursal: Sucursal.CARMAR_2, periodoId },
    });
    const encargada = await comoEncargada();

    const res = await encargada("GET", `/pedidos?periodoId=${periodoId}&estado=ENVIADO`);

    expect(res.json().data.map((p: { id: string }) => p.id)).toEqual([enviado.id]);
  });

  it("sin filtro de estado excluye los BORRADOR; ?estado=BORRADOR devuelve solo esos", async () => {
    const enviado = await pedidoEnviado();
    const otro = await prisma.usuario.create({
      data: { nombre: `${PREFIJO}Otro repositor`, rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_2 },
    });
    const borrador = await prisma.pedido.create({
      data: { repositorId: otro.id, creadoPorId: otro.id, sucursal: Sucursal.CARMAR_2, periodoId },
    });
    const encargada = await comoEncargada();

    const sinFiltro = await encargada("GET", `/pedidos?periodoId=${periodoId}`);
    const soloBorradores = await encargada("GET", `/pedidos?periodoId=${periodoId}&estado=BORRADOR`);

    const ids = (res: typeof sinFiltro) => res.json().data.map((p: { id: string }) => p.id);
    expect(ids(sinFiltro)).toEqual([enviado.id]);
    expect(sinFiltro.json().meta.total).toBe(1);
    expect(ids(soloBorradores)).toEqual([borrador.id]);
  });

  it("GET /pedidos/:id: detalle con el rubro de cada producto y quién lo envió", async () => {
    const pedido = await pedidoEnviado();
    const encargada = await comoEncargada();

    const res = await encargada("GET", `/pedidos/${pedido.id}`);

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      enviadoPor: { id: repositor.id },
      items: [{ cantidad: "2", producto: { codigo: `${PREFIJO}001`, rubro: { nombre: `${PREFIJO}Asignado` } } }],
    });
  });

  it("admin puede consultar pero no aprobar: 200 / 403", async () => {
    const pedido = await pedidoEnviado();
    const admin = pedirCon(
      app,
      await loginToken(app, { tipo: "email", email: "admin@carmar.com", password: "admin123" }),
    );

    expect((await admin("GET", `/pedidos/${pedido.id}`)).statusCode).toBe(200);
    expect((await admin("POST", `/pedidos/${pedido.id}/aprobar`)).statusCode).toBe(403);
  });
});

describe("POST /pedidos/:id/devolver y /aprobar", () => {
  it("devolver un BORRADOR: 400", async () => {
    const pedido = await crearPedido();
    const encargada = await comoEncargada();

    const res = await encargada("POST", `/pedidos/${pedido.id}/devolver`, { comentario: "Falta cantidad" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Solo se pueden devolver pedidos ENVIADOS" });
  });

  it("devolver con comentario vacío: 400", async () => {
    const pedido = await pedidoEnviado();
    const encargada = await comoEncargada();

    const res = await encargada("POST", `/pedidos/${pedido.id}/devolver`, { comentario: "   " });

    expect(res.statusCode).toBe(400);
  });

  it("devolver un ENVIADO: 200 DEVUELTO; el repositor puede corregir y reenviar", async () => {
    const pedido = await pedidoEnviado();
    const encargada = await comoEncargada();
    const encargadaId = (await prisma.usuario.findUniqueOrThrow({ where: { email: "encargada@carmar.com" } })).id;

    const res = await encargada("POST", `/pedidos/${pedido.id}/devolver`, { comentario: "Revisá la lavandina" });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      estado: "DEVUELTO",
      comentarioDevolucion: "Revisá la lavandina",
      devueltoPor: { id: encargadaId },
    });
    expect(res.json().data.fechaDevolucion).not.toBeNull();
    expect((await agregar(pedido.id, productos.asignado2, 1)).statusCode).toBe(200);
    expect((await pedir("POST", `/pedidos/${pedido.id}/enviar`)).json().data.estado).toBe("ENVIADO");
  });

  it("aprobar un ENVIADO: 200 APROBADO", async () => {
    const pedido = await pedidoEnviado();
    const encargada = await comoEncargada();

    const res = await encargada("POST", `/pedidos/${pedido.id}/aprobar`);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.estado).toBe("APROBADO");
    expect(res.json().data.fechaAprobacion).not.toBeNull();
    expect(res.json().data.aprobadoPor).toMatchObject({ nombre: "Encargada de Compras" });
  });

  it("APROBADO es inmutable: enviar, devolver y aprobar de nuevo dan 400", async () => {
    const pedido = await pedidoEnviado();
    const encargada = await comoEncargada();
    await encargada("POST", `/pedidos/${pedido.id}/aprobar`);

    const enviar = await pedir("POST", `/pedidos/${pedido.id}/enviar`);
    const devolver = await encargada("POST", `/pedidos/${pedido.id}/devolver`, { comentario: "tarde" });
    const aprobar = await encargada("POST", `/pedidos/${pedido.id}/aprobar`);

    expect(enviar.statusCode).toBe(400);
    expect(enviar.json()).toEqual({ error: "El pedido no se puede editar en estado APROBADO" });
    expect(devolver.statusCode).toBe(400);
    expect(aprobar.statusCode).toBe(400);
  });
});
