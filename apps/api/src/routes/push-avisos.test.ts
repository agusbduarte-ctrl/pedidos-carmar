import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { EstadoPedido, PrismaClient, Rol, Sucursal, UnidadMedida } from "@prisma/client";
import { buildApp } from "../app.js";
import type { EmisorPush } from "../lib/notificaciones.js";
import { loginToken, pedirCon } from "../test/helpers.js";

// Avisos push que disparan enviar, revisión, aprobar y devolver, con un emisor falso.
const PREFIJO = "test-avisos-";
const PASSWORD = "avisos-test-123";
const PIN = "4321";
const EP = (n: string) => `https://push.test/test-avisos-${n}`;

const prisma = new PrismaClient();
let app: FastifyInstance;
let enviados: { endpoint: string; payload: { titulo: string; cuerpo: string; url: string } }[];
let falla: Record<string, number>;
let ids: Record<"repositor" | "deposito" | "encargada" | "otroDeposito", string>;
let proveedorId: string;
let productoId: string;
const empiezaCon = { startsWith: PREFIJO };

const emisor: EmisorPush = async (s, payload) => {
  if (falla[s.endpoint]) throw Object.assign(new Error("push"), { statusCode: falla[s.endpoint] });
  enviados.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
};

async function limpiar() {
  await prisma.pedido.deleteMany({ where: { repositor: { nombre: empiezaCon } } });
  await prisma.suscripcionPush.deleteMany({ where: { endpoint: { startsWith: "https://push.test/test-avisos-" } } });
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.usuario.deleteMany({ where: { nombre: empiezaCon } });
}

const loginEmail = (n: string) =>
  loginToken(app, { tipo: "email", email: `test-avisos-${n}@carmar.test`, password: PASSWORD });
const loginRepositor = () => loginToken(app, { tipo: "repositor", usuarioId: ids.repositor, pin: PIN });

async function crearPedido(estado: EstadoPedido, cantidadDeposito?: number) {
  return prisma.pedido.create({
    data: {
      repositorId: ids.repositor,
      creadoPorId: ids.repositor,
      sucursal: Sucursal.CARMAR_2,
      proveedorId,
      estado,
      fechaEnvio: estado === EstadoPedido.BORRADOR ? null : new Date(),
      items: { create: [{ productoId, cantidad: 5, cantidadDeposito }] },
    },
    include: { items: true },
  });
}

const para = (n: string) => enviados.filter((e) => e.endpoint === EP(n));

beforeEach(async () => {
  await limpiar();
  enviados = [];
  falla = {};
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  const mk = async (n: string, rol: Rol) =>
    (
      await prisma.usuario.create({
        data: {
          nombre: `${PREFIJO}${n}`,
          rol,
          email: `test-avisos-${n}@carmar.test`,
          passwordHash,
          ...(rol === Rol.REPOSITOR ? { sucursal: Sucursal.CARMAR_2, pinHash: await bcrypt.hash(PIN, 4) } : {}),
        },
      })
    ).id;
  ids = {
    repositor: await mk("repositor", Rol.REPOSITOR),
    deposito: await mk("deposito", Rol.DEPOSITO),
    otroDeposito: await mk("otroDeposito", Rol.DEPOSITO),
    encargada: await mk("encargada", Rol.ENCARGADA),
  };
  for (const [n, usuarioId] of Object.entries(ids)) {
    await prisma.suscripcionPush.create({ data: { usuarioId, endpoint: EP(n), p256dh: "p", auth: "a" } });
  }
  const rubro = await prisma.rubro.create({
    data: {
      nombre: `${PREFIJO}Rubro`,
      repositorRubros: { create: { usuarioId: ids.repositor, sucursal: Sucursal.CARMAR_2 } },
    },
  });
  proveedorId = (await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Proveedor` } })).id;
  productoId = (
    await prisma.producto.create({
      data: { codigo: `${PREFIJO}p1`, nombre: "Producto 1", rubroId: rubro.id, proveedorId, unidad: UnidadMedida.UN },
    })
  ).id;
  app = await buildApp(prisma, { logger: false, emisorPush: emisor, clavePublicaPush: "k" });
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

describe("avisos push", () => {
  it("enviar avisa al depósito y a la encargada, no al repositor", async () => {
    const p = await crearPedido(EstadoPedido.BORRADOR);
    const res = await pedirCon(app, await loginRepositor())("POST", `/pedidos/${p.id}/enviar`);
    expect(res.statusCode).toBe(200);
    await app.esperarNotificaciones();

    expect(para("repositor")).toHaveLength(0);
    const dep = para("deposito");
    expect(dep).toHaveLength(1);
    expect(dep[0].payload).toEqual({
      titulo: "Pedido nuevo para revisar",
      cuerpo: `${PREFIJO}repositor pidió a ${PREFIJO}Proveedor (Cármar 2). Fijate cuánto hay en el galpón.`,
      url: `/deposito/${p.id}`,
    });
    expect(para("otroDeposito")).toHaveLength(1);
    const enc = para("encargada");
    expect(enc).toHaveLength(1);
    expect(enc[0].payload).toEqual({
      titulo: "Pedido nuevo",
      cuerpo: `${PREFIJO}repositor pidió a ${PREFIJO}Proveedor (Cármar 2). Esperá la revisión del depósito.`,
      url: `/revision/${p.id}`,
    });
  });

  it("enviar un pedido vacío (error) no avisa a nadie", async () => {
    const p = await prisma.pedido.create({
      data: { repositorId: ids.repositor, creadoPorId: ids.repositor, sucursal: Sucursal.CARMAR_2, proveedorId },
    });
    const res = await pedirCon(app, await loginRepositor())("POST", `/pedidos/${p.id}/enviar`);
    expect(res.statusCode).toBe(400);
    await app.esperarNotificaciones();
    expect(enviados).toHaveLength(0);
  });

  it("la primera revisión avisa a la encargada; la segunda no", async () => {
    const p = await crearPedido(EstadoPedido.ENVIADO);
    const pedir = pedirCon(app, await loginEmail("deposito"));
    const body = { items: [{ itemId: p.items[0].id, cantidadDeposito: 2 }] };

    expect((await pedir("PUT", `/deposito/pedidos/${p.id}/revision`, body)).statusCode).toBe(200);
    await app.esperarNotificaciones();
    expect(enviados).toHaveLength(1);
    expect(enviados[0].endpoint).toBe(EP("encargada"));
    expect(enviados[0].payload).toEqual({
      titulo: "Depósito revisó un pedido",
      cuerpo: `${PREFIJO}Proveedor (Cármar 2) ya tiene lo del galpón cargado. Podés aprobarlo.`,
      url: `/revision/${p.id}`,
    });

    body.items[0].cantidadDeposito = 3;
    expect((await pedir("PUT", `/deposito/pedidos/${p.id}/revision`, body)).statusCode).toBe(200);
    await app.esperarNotificaciones();
    expect(enviados).toHaveLength(1);
  });

  it("aprobar avisa al repositor y al depósito si hay algo del galpón", async () => {
    const p = await crearPedido(EstadoPedido.ENVIADO, 2);
    const res = await pedirCon(app, await loginEmail("encargada"))("POST", `/pedidos/${p.id}/aprobar`);
    expect(res.statusCode).toBe(200);
    await app.esperarNotificaciones();

    expect(para("repositor").map((e) => e.payload)).toEqual([
      { titulo: "Pedido aprobado", cuerpo: `Tu pedido a ${PREFIJO}Proveedor fue aprobado.`, url: `/pedido/${p.id}` },
    ]);
    expect(para("deposito").map((e) => e.payload)).toEqual([
      {
        titulo: "Hay cosas para mandar",
        cuerpo: `Mandá a Cármar 2 lo del pedido a ${PREFIJO}Proveedor.`,
        url: "/deposito",
      },
    ]);
    expect(para("encargada")).toHaveLength(0);
  });

  it("aprobar no avisa al depósito si no hay nada del galpón", async () => {
    const p = await crearPedido(EstadoPedido.ENVIADO, 0);
    const res = await pedirCon(app, await loginEmail("encargada"))("POST", `/pedidos/${p.id}/aprobar`);
    expect(res.statusCode).toBe(200);
    await app.esperarNotificaciones();
    expect(para("repositor")).toHaveLength(1);
    expect(para("deposito")).toHaveLength(0);
    expect(para("otroDeposito")).toHaveLength(0);
  });

  it("aprobar un pedido que no está enviado no avisa", async () => {
    const p = await crearPedido(EstadoPedido.BORRADOR);
    const res = await pedirCon(app, await loginEmail("encargada"))("POST", `/pedidos/${p.id}/aprobar`);
    expect(res.statusCode).toBe(400);
    await app.esperarNotificaciones();
    expect(enviados).toHaveLength(0);
  });

  it("devolver avisa al repositor con el motivo", async () => {
    const p = await crearPedido(EstadoPedido.ENVIADO);
    const res = await pedirCon(app, await loginEmail("encargada"))("POST", `/pedidos/${p.id}/devolver`, {
      comentario: "Falta el código",
    });
    expect(res.statusCode).toBe(200);
    await app.esperarNotificaciones();
    expect(enviados).toHaveLength(1);
    expect(enviados[0].endpoint).toBe(EP("repositor"));
    expect(enviados[0].payload).toEqual({
      titulo: "Te devolvieron un pedido",
      cuerpo: `Pedido a ${PREFIJO}Proveedor: Falta el código`,
      url: `/pedido/${p.id}`,
    });
  });

  it("una suscripción que responde 410 se borra y las demás reciben igual", async () => {
    falla[EP("deposito")] = 410;
    const p = await crearPedido(EstadoPedido.BORRADOR);
    await pedirCon(app, await loginRepositor())("POST", `/pedidos/${p.id}/enviar`);
    await app.esperarNotificaciones();

    expect(await prisma.suscripcionPush.count({ where: { endpoint: EP("deposito") } })).toBe(0);
    expect(para("otroDeposito")).toHaveLength(1);
    expect(para("encargada")).toHaveLength(1);
  });

  it("un error distinto de 404/410 no borra la suscripción ni rompe la respuesta", async () => {
    falla[EP("encargada")] = 500;
    const p = await crearPedido(EstadoPedido.BORRADOR);
    const res = await pedirCon(app, await loginRepositor())("POST", `/pedidos/${p.id}/enviar`);
    expect(res.statusCode).toBe(200);
    await app.esperarNotificaciones();
    expect(await prisma.suscripcionPush.count({ where: { endpoint: EP("encargada") } })).toBe(1);
  });

  it("no avisa a usuarios inactivos", async () => {
    await prisma.usuario.update({ where: { id: ids.otroDeposito }, data: { activo: false } });
    const p = await crearPedido(EstadoPedido.BORRADOR);
    await pedirCon(app, await loginRepositor())("POST", `/pedidos/${p.id}/enviar`);
    await app.esperarNotificaciones();
    expect(para("otroDeposito")).toHaveLength(0);
    expect(para("deposito")).toHaveLength(1);
  });
});
