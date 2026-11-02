import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { EstadoPedido, EstadoPeriodo, PrismaClient, Rol, Sucursal, UnidadMedida } from "@prisma/client";
import { buildApp } from "../app.js";
import { ADMIN_SEED, loginToken, pedirCon } from "../test/helpers.js";

// Corre contra la BD de desarrollo con datos propios (prefijo en nombres y
// códigos). Los pedidos se crean directo en la BD; el repositor es de
// CARMAR_2 para no pisar al del seed.
const PREFIJO = "test-dep-";
const EMAIL = "test-dep-rodrigo@carmar.test";
const PASSWORD = "deposito-test-123";
const PIN = "4321";

const prisma = new PrismaClient();
let app: FastifyInstance;
let pedir: ReturnType<typeof pedirCon>;
let periodoId: string;
let repositorId: string;
let depositoId: string;
let proveedorId: string;
const prod = { un: "", kg: "", otro: "" };

const empiezaCon = { startsWith: PREFIJO };

async function limpiar() {
  await prisma.consolidado.deleteMany({ where: { periodo: { nombre: empiezaCon } } });
  await prisma.pedido.deleteMany({
    where: { OR: [{ periodo: { nombre: empiezaCon } }, { repositor: { nombre: empiezaCon } }] },
  });
  await prisma.periodo.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.usuario.deleteMany({ where: { nombre: empiezaCon } });
}

async function pedido(
  estado: EstadoPedido,
  items: [productoId: string, cantidad: number, cantidadDeposito?: number][],
  extra: { fechaEnvio?: Date; fechaAprobacion?: Date; periodoId?: string } = {},
) {
  return prisma.pedido.create({
    data: {
      repositorId,
      creadoPorId: repositorId,
      sucursal: Sucursal.CARMAR_2,
      periodoId,
      proveedorId,
      estado,
      fechaEnvio: estado === EstadoPedido.BORRADOR ? null : new Date(),
      fechaAprobacion: estado === EstadoPedido.APROBADO ? new Date() : null,
      ...extra,
      items: {
        create: items.map(([productoId, cantidad, cantidadDeposito]) => ({
          productoId,
          cantidad,
          cantidadDeposito,
        })),
      },
    },
    include: { items: true },
  });
}

// itemId -> cantidad según el producto, para armar el body de la revisión
function bodyRevision(p: Awaited<ReturnType<typeof pedido>>, porProducto: Record<string, number>) {
  return {
    items: p.items.map((it) => ({ itemId: it.id, cantidadDeposito: porProducto[it.productoId] ?? 0 })),
  };
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
      data: {
        nombre: `${PREFIJO}Repositor`,
        rol: Rol.REPOSITOR,
        sucursal: Sucursal.CARMAR_2,
        pinHash: await bcrypt.hash(PIN, 4),
      },
    })
  ).id;
  depositoId = (
    await prisma.usuario.create({
      data: {
        nombre: `${PREFIJO}Rodrigo`,
        rol: Rol.DEPOSITO,
        email: EMAIL,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    })
  ).id;
  const rubro = await prisma.rubro.create({
    data: {
      nombre: `${PREFIJO}Rubro`,
      repositorRubros: { create: { usuarioId: repositorId, sucursal: Sucursal.CARMAR_2 } },
    },
  });
  proveedorId = (await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Proveedor` } })).id;
  const crear = async (codigo: string, unidad: UnidadMedida) =>
    (
      await prisma.producto.create({
        data: { codigo: `${PREFIJO}${codigo}`, nombre: `Producto ${codigo}`, rubroId: rubro.id, proveedorId, unidad },
      })
    ).id;
  prod.un = await crear("un", UnidadMedida.UN);
  prod.kg = await crear("kg", UnidadMedida.KG);
  prod.otro = await crear("otro", UnidadMedida.UN);

  app = await buildApp(prisma, { logger: false });
  pedir = pedirCon(app, await loginToken(app, { tipo: "email", email: EMAIL, password: PASSWORD }));
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

describe("login y permisos", () => {
  it("el usuario DEPOSITO entra por email y /auth/me devuelve su rol", async () => {
    const res = await pedir("GET", "/auth/me");
    expect(res.statusCode).toBe(200);
    expect(res.json().usuario.rol).toBe("DEPOSITO");
    expect(res.json().usuario.id).toBe(depositoId);
  });

  it("401 sin sesión en todas las rutas", async () => {
    const sin = pedirCon(app);
    expect((await sin("GET", "/deposito/pedidos")).statusCode).toBe(401);
    expect((await sin("GET", "/deposito/pedidos/x")).statusCode).toBe(401);
    expect((await sin("PUT", "/deposito/pedidos/x/revision", { items: [] })).statusCode).toBe(401);
    expect((await sin("POST", "/deposito/pedidos/x/traslado-enviado")).statusCode).toBe(401);
  });

  it("403 para admin y repositor", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5]]);
    const admin = pedirCon(app, await loginToken(app, ADMIN_SEED));
    const repo = pedirCon(app, await loginToken(app, { tipo: "repositor", usuarioId: repositorId, pin: PIN }));
    for (const quien of [admin, repo]) {
      expect((await quien("GET", "/deposito/pedidos")).statusCode).toBe(403);
      expect((await quien("GET", `/deposito/pedidos/${p.id}`)).statusCode).toBe(403);
      expect(
        (await quien("PUT", `/deposito/pedidos/${p.id}/revision`, bodyRevision(p, {}))).statusCode,
      ).toBe(403);
      expect((await quien("POST", `/deposito/pedidos/${p.id}/traslado-enviado`)).statusCode).toBe(403);
    }
  });

  it("el admin crea y edita usuarios DEPOSITO con email y contraseña, sin sucursal", async () => {
    const admin = pedirCon(app, await loginToken(app, ADMIN_SEED));
    const email = "test-dep-nuevo@carmar.test";
    const alta = await admin("POST", "/admin/usuarios", {
      nombre: `${PREFIJO}Nuevo`,
      rol: "DEPOSITO",
      email,
      password: "otra-clave-123",
    });
    expect(alta.statusCode).toBe(201);
    expect(alta.json().data).toMatchObject({ rol: "DEPOSITO", sucursal: null });
    const edicion = await admin("PATCH", `/admin/usuarios/${alta.json().data.id}`, {
      password: "clave-nueva-123",
    });
    expect(edicion.statusCode).toBe(200);
    expect((await admin("POST", "/admin/usuarios", { nombre: `${PREFIJO}Sin`, rol: "DEPOSITO" })).statusCode).toBe(400);
    await loginToken(app, { tipo: "email", email, password: "clave-nueva-123" });
  });

  it("el depósito no entra a las rutas de la encargada", async () => {
    expect((await pedir("GET", "/pedidos")).statusCode).toBe(403);
    expect((await pedir("GET", "/consolidados")).statusCode).toBe(403);
  });
});

describe("listas", () => {
  it("revisar: solo ENVIADO, por fechaEnvio ascendente, con la forma de la fila", async () => {
    const viejo = await pedido(EstadoPedido.ENVIADO, [[prod.un, 1]], { fechaEnvio: new Date("2026-01-01") });
    const nuevo = await pedido(EstadoPedido.ENVIADO, [[prod.un, 1]], { fechaEnvio: new Date("2026-02-01") });
    await pedido(EstadoPedido.BORRADOR, [[prod.un, 1]]);
    await pedido(EstadoPedido.APROBADO, [[prod.un, 1, 1]]);

    const res = await pedir("GET", "/deposito/pedidos?limit=200");
    expect(res.statusCode).toBe(200);
    const ids: string[] = res.json().data.map((p: { id: string }) => p.id);
    expect(ids.indexOf(viejo.id)).toBeGreaterThanOrEqual(0);
    expect(ids.indexOf(viejo.id)).toBeLessThan(ids.indexOf(nuevo.id));
    const fila = res.json().data.find((p: { id: string }) => p.id === viejo.id);
    expect(fila).toMatchObject({
      estado: "ENVIADO",
      sucursal: "CARMAR_2",
      proveedor: { nombre: `${PREFIJO}Proveedor` },
      repositor: { nombre: `${PREFIJO}Repositor` },
      fechaRevisionDeposito: null,
      _count: { items: 1 },
    });
    expect(res.json().meta).toBeDefined();
  });

  it("trasladar: APROBADO con ítems de depósito > 0 y sin traslado marcado", async () => {
    const conDeposito = await pedido(EstadoPedido.APROBADO, [[prod.un, 5, 2], [prod.otro, 3, 0]]);
    const sinDeposito = await pedido(EstadoPedido.APROBADO, [[prod.un, 5, 0]]);
    const sinRevisar = await pedido(EstadoPedido.APROBADO, [[prod.un, 5]]);
    const yaEnviado = await pedido(EstadoPedido.APROBADO, [[prod.un, 5, 5]]);
    await prisma.pedido.update({ where: { id: yaEnviado.id }, data: { fechaTrasladoEnviado: new Date() } });
    const enviado = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5, 5]]);

    const res = await pedir("GET", "/deposito/pedidos?vista=trasladar&limit=200");
    expect(res.statusCode).toBe(200);
    const ids: string[] = res.json().data.map((p: { id: string }) => p.id);
    expect(ids).toContain(conDeposito.id);
    for (const p of [sinDeposito, sinRevisar, yaEnviado, enviado]) expect(ids).not.toContain(p.id);
  });

  it("vista inválida: 400", async () => {
    expect((await pedir("GET", "/deposito/pedidos?vista=otra")).statusCode).toBe(400);
  });
});

describe("GET /deposito/pedidos/:id", () => {
  it("devuelve el detalle con ítems y rubro", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5], [prod.kg, 2.5]]);
    const res = await pedir("GET", `/deposito/pedidos/${p.id}`);
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.revisadoDepositoPor).toBeNull();
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({
      cantidadDeposito: null,
      producto: { codigo: `${PREFIJO}un`, unidad: "UN", rubro: { nombre: `${PREFIJO}Rubro` } },
    });
  });

  it("404 si no existe o está en otro estado", async () => {
    const borrador = await pedido(EstadoPedido.BORRADOR, [[prod.un, 1]]);
    expect((await pedir("GET", "/deposito/pedidos/no-existe")).statusCode).toBe(404);
    expect((await pedir("GET", `/deposito/pedidos/${borrador.id}`)).statusCode).toBe(404);
  });
});

describe("PUT /deposito/pedidos/:id/revision", () => {
  it("guarda las cantidades, quién y cuándo", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5], [prod.kg, 2.5]]);
    const res = await pedir(
      "PUT",
      `/deposito/pedidos/${p.id}/revision`,
      bodyRevision(p, { [prod.un]: 3, [prod.kg]: 1.5 }),
    );
    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.revisadoDepositoPor).toEqual({ id: depositoId, nombre: `${PREFIJO}Rodrigo` });
    expect(data.fechaRevisionDeposito).not.toBeNull();
    const porCodigo = Object.fromEntries(
      data.items.map((i: { producto: { codigo: string }; cantidadDeposito: string }) => [
        i.producto.codigo,
        i.cantidadDeposito,
      ]),
    );
    expect(porCodigo).toEqual({ [`${PREFIJO}un`]: "3", [`${PREFIJO}kg`]: "1.5" });
  });

  it("falta un ítem: 400 y no guarda nada", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5], [prod.kg, 2]]);
    const res = await pedir("PUT", `/deposito/pedidos/${p.id}/revision`, {
      items: [{ itemId: p.items[0].id, cantidadDeposito: 1 }],
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Datos inválidos");
    expect(res.json().detalles.join(" ")).toMatch(/falta/);
    const items = await prisma.itemPedido.findMany({ where: { pedidoId: p.id } });
    expect(items.every((i) => i.cantidadDeposito === null)).toBe(true);
    expect((await prisma.pedido.findUniqueOrThrow({ where: { id: p.id } })).fechaRevisionDeposito).toBeNull();
  });

  it("ítem de más o repetido: 400", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5]]);
    const otro = await pedido(EstadoPedido.ENVIADO, [[prod.otro, 5]]);
    const url = `/deposito/pedidos/${p.id}/revision`;
    const ajeno = await pedir("PUT", url, {
      items: [
        { itemId: p.items[0].id, cantidadDeposito: 1 },
        { itemId: otro.items[0].id, cantidadDeposito: 1 },
      ],
    });
    expect(ajeno.statusCode).toBe(400);
    expect(ajeno.json().detalles.join(" ")).toMatch(/no es de este pedido/);

    const repetido = await pedir("PUT", url, {
      items: [
        { itemId: p.items[0].id, cantidadDeposito: 1 },
        { itemId: p.items[0].id, cantidadDeposito: 2 },
      ],
    });
    expect(repetido.statusCode).toBe(400);
    expect(repetido.json().detalles.join(" ")).toMatch(/repetido/);
  });

  it("más de lo pedido o negativo: 400", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5]]);
    const url = `/deposito/pedidos/${p.id}/revision`;
    const mucho = await pedir("PUT", url, bodyRevision(p, { [prod.un]: 6 }));
    expect(mucho.statusCode).toBe(400);
    expect(mucho.json().detalles[0]).toContain(`${PREFIJO}un (Producto un)`);
    expect(mucho.json().detalles[0]).toMatch(/mayor a lo pedido/);
    const negativo = await pedir("PUT", url, bodyRevision(p, { [prod.un]: -1 }));
    expect(negativo.statusCode).toBe(400);
  });

  it("decimal en un producto en UN: 400; en KG se acepta", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5], [prod.kg, 2.5]]);
    const url = `/deposito/pedidos/${p.id}/revision`;
    const mal = await pedir("PUT", url, bodyRevision(p, { [prod.un]: 1.5, [prod.kg]: 0.5 }));
    expect(mal.statusCode).toBe(400);
    expect(mal.json().detalles).toHaveLength(1);
    expect(mal.json().detalles[0]).toMatch(/entero/);
    const bien = await pedir("PUT", url, bodyRevision(p, { [prod.un]: 0, [prod.kg]: 0.5 }));
    expect(bien.statusCode).toBe(200);
  });

  it("pedido que no está ENVIADO: 409; inexistente: 404", async () => {
    const aprobado = await pedido(EstadoPedido.APROBADO, [[prod.un, 5]]);
    const res = await pedir("PUT", `/deposito/pedidos/${aprobado.id}/revision`, bodyRevision(aprobado, {}));
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "Solo se pueden revisar pedidos enviados" });
    expect((await pedir("PUT", "/deposito/pedidos/no-existe/revision", { items: [] })).statusCode).toBe(404);
  });

  it("body sin items: 400", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5]]);
    expect((await pedir("PUT", `/deposito/pedidos/${p.id}/revision`, {})).statusCode).toBe(400);
  });

  it("se puede volver a revisar mientras siga ENVIADO", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5]]);
    const url = `/deposito/pedidos/${p.id}/revision`;
    expect((await pedir("PUT", url, bodyRevision(p, { [prod.un]: 1 }))).statusCode).toBe(200);
    const res = await pedir("PUT", url, bodyRevision(p, { [prod.un]: 4 }));
    expect(res.statusCode).toBe(200);
    expect(res.json().data.items[0].cantidadDeposito).toBe("4");
  });

  it("la encargada ve la revisión en su lista y detalle", async () => {
    const p = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5]]);
    await pedir("PUT", `/deposito/pedidos/${p.id}/revision`, bodyRevision(p, { [prod.un]: 2 }));
    const admin = pedirCon(app, await loginToken(app, ADMIN_SEED));
    const detalle = (await admin("GET", `/pedidos/${p.id}`)).json().data;
    expect(detalle.revisadoDepositoPor).toEqual({ id: depositoId, nombre: `${PREFIJO}Rodrigo` });
    expect(detalle.fechaRevisionDeposito).not.toBeNull();
    expect(detalle.fechaTrasladoEnviado).toBeNull();
    expect(detalle.items[0].cantidadDeposito).toBe("2");
    const lista = (await admin("GET", `/pedidos?estado=ENVIADO&limit=200`)).json().data;
    const fila = lista.find((x: { id: string }) => x.id === p.id);
    expect(fila.revisadoDepositoPor.id).toBe(depositoId);
    expect(fila.fechaRevisionDeposito).not.toBeNull();
    expect(fila).toHaveProperty("fechaTrasladoEnviado");
    // La lista trae el proveedor para mostrar "Proveedor – dd/mm"
    expect(fila).toHaveProperty("proveedor");
  });
});

describe("POST /deposito/pedidos/:id/traslado-enviado", () => {
  it("marca el traslado y lo saca de la lista; repetido: 409", async () => {
    const p = await pedido(EstadoPedido.APROBADO, [[prod.un, 5, 2]]);
    const url = `/deposito/pedidos/${p.id}/traslado-enviado`;
    const res = await pedir("POST", url);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.fechaTrasladoEnviado).not.toBeNull();
    const db = await prisma.pedido.findUniqueOrThrow({ where: { id: p.id } });
    expect(db.trasladoEnviadoPorId).toBe(depositoId);

    const lista = (await pedir("GET", "/deposito/pedidos?vista=trasladar&limit=200")).json().data;
    expect(lista.map((x: { id: string }) => x.id)).not.toContain(p.id);

    const otra = await pedir("POST", url);
    expect(otra.statusCode).toBe(409);
    expect(otra.json().error).toMatch(/ya se marcó/);
  });

  it("409 si no está aprobado o no hay nada del depósito; 404 si no existe", async () => {
    const enviado = await pedido(EstadoPedido.ENVIADO, [[prod.un, 5, 2]]);
    const sinNada = await pedido(EstadoPedido.APROBADO, [[prod.un, 5, 0]]);
    expect((await pedir("POST", `/deposito/pedidos/${enviado.id}/traslado-enviado`)).statusCode).toBe(409);
    const res = await pedir("POST", `/deposito/pedidos/${sinNada.id}/traslado-enviado`);
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toMatch(/nada del depósito/);
    expect((await pedir("POST", "/deposito/pedidos/no-existe/traslado-enviado")).statusCode).toBe(404);
  });
});

describe("integración con pedidos y consolidado", () => {
  it("reenviar desde el repositor limpia la revisión", async () => {
    const abierto = await prisma.periodo.create({
      data: { nombre: `${PREFIJO}Abierto`, fechaApertura: new Date(), estado: EstadoPeriodo.ABIERTO },
    });
    const p = await pedido(EstadoPedido.DEVUELTO, [[prod.un, 5, 3]], { periodoId: abierto.id });
    await prisma.pedido.update({
      where: { id: p.id },
      data: { revisadoDepositoPorId: depositoId, fechaRevisionDeposito: new Date() },
    });

    const repo = pedirCon(app, await loginToken(app, { tipo: "repositor", usuarioId: repositorId, pin: PIN }));
    const res = await repo("POST", `/pedidos/${p.id}/enviar`);
    expect(res.statusCode).toBe(200);

    const db = await prisma.pedido.findUniqueOrThrow({ where: { id: p.id }, include: { items: true } });
    expect(db.estado).toBe(EstadoPedido.ENVIADO);
    expect(db.revisadoDepositoPorId).toBeNull();
    expect(db.fechaRevisionDeposito).toBeNull();
    expect(db.items[0].cantidadDeposito).toBeNull();
  });

  it("el consolidado descuenta lo del depósito y omite lo que no hay que comprar", async () => {
    // un: 5+4, depósito 3 y 4 -> 2 | kg: 2.5 con depósito 2.5 -> omitido | otro: sin revisar -> 6
    await pedido(EstadoPedido.ENVIADO, [[prod.un, 5, 3], [prod.kg, 2.5, 2.5], [prod.otro, 6]]);
    await pedido(EstadoPedido.APROBADO, [[prod.un, 4, 4]]);

    const admin = pedirCon(app, await loginToken(app, ADMIN_SEED));
    const res = await admin("POST", "/consolidados", { periodoId });
    expect(res.statusCode).toBe(201);
    const cant = Object.fromEntries(
      res.json().data.items.map((i: { producto: { codigo: string }; cantidadTotal: string }) => [
        i.producto.codigo,
        i.cantidadTotal,
      ]),
    );
    expect(cant).toEqual({ [`${PREFIJO}un`]: "2", [`${PREFIJO}otro`]: "6" });
  });
});
