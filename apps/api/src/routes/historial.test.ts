import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import * as XLSX from "xlsx";
import { EstadoPedido, PrismaClient, Rol, Sucursal, UnidadMedida } from "@prisma/client";
import { buildApp } from "../app.js";
import { ADMIN_SEED, loginToken, pedirCon } from "../test/helpers.js";

// Corre contra la BD de desarrollo con datos propios (prefijo). Todas las
// consultas filtran por el proveedor de prueba para no mezclarse con datos reales.
const PREFIJO = "test-hist-";
const PASSWORD = "historial-test-123";
const EMAIL_ENCARGADA = "test-hist-encargada@carmar.test";
const EMAIL_DEPOSITO = "test-hist-deposito@carmar.test";
const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

const prisma = new PrismaClient();
let app: FastifyInstance;
let encargada: ReturnType<typeof pedirCon>;
let admin: ReturnType<typeof pedirCon>;
let repositorId: string;
let proveedorId: string;
let otroProveedorId: string;
let prod: { leche: string; yerba: string; arroz: string };

const empiezaCon = { startsWith: PREFIJO };

async function limpiar() {
  await prisma.pedido.deleteMany({ where: { repositor: { nombre: empiezaCon } } });
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.usuario.deleteMany({ where: { nombre: empiezaCon } });
}

async function pedido(
  fechaEnvio: string,
  items: [productoId: string, cantidad: number, cantidadDeposito?: number][],
  extra: Partial<{
    estado: EstadoPedido;
    sucursal: Sucursal;
    proveedorId: string | null;
    titulo: string;
    fechaAprobacion: Date;
  }> = {},
) {
  return prisma.pedido.create({
    data: {
      repositorId,
      creadoPorId: repositorId,
      sucursal: extra.sucursal ?? Sucursal.CARMAR_2,
      proveedorId: extra.proveedorId === undefined ? proveedorId : extra.proveedorId,
      titulo: extra.titulo,
      estado: extra.estado ?? EstadoPedido.APROBADO,
      fechaEnvio: new Date(fechaEnvio),
      fechaAprobacion: extra.fechaAprobacion,
      items: {
        create: items.map(([productoId, cantidad, cantidadDeposito]) => ({
          productoId,
          cantidad,
          cantidadDeposito,
        })),
      },
    },
  });
}

const hoyMenos = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

beforeEach(async () => {
  await limpiar();
  repositorId = (
    await prisma.usuario.create({
      data: { nombre: `${PREFIJO}Repositor`, rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_2, pinHash: await bcrypt.hash("4321", 4) },
    })
  ).id;
  await prisma.usuario.create({
    data: { nombre: `${PREFIJO}Encargada`, rol: Rol.ENCARGADA, email: EMAIL_ENCARGADA, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
  await prisma.usuario.create({
    data: { nombre: `${PREFIJO}Deposito`, rol: Rol.DEPOSITO, email: EMAIL_DEPOSITO, passwordHash: await bcrypt.hash(PASSWORD, 4) },
  });
  const rubro = await prisma.rubro.create({ data: { nombre: `${PREFIJO}Rubro` } });
  proveedorId = (await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Proveedor` } })).id;
  otroProveedorId = (await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Otro` } })).id;
  const crear = async (codigo: string, nombre: string, unidad: UnidadMedida) =>
    (await prisma.producto.create({ data: { codigo: `${PREFIJO}${codigo}`, nombre, rubroId: rubro.id, proveedorId, unidad } })).id;
  prod = {
    leche: await crear("leche", "Leche Entera", UnidadMedida.UN),
    yerba: await crear("yerba", "Yerba Mate", UnidadMedida.KG),
    arroz: await crear("arroz", "Arroz Largo", UnidadMedida.UN),
  };

  app = await buildApp(prisma, { logger: false });
  encargada = pedirCon(app, await loginToken(app, { tipo: "email", email: EMAIL_ENCARGADA, password: PASSWORD }));
  admin = pedirCon(app, await loginToken(app, ADMIN_SEED));
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

const url = (ruta: string, extra = "") => `${ruta}?proveedorId=${proveedorId}${extra}`;

describe("permisos", () => {
  it("401 sin sesión", async () => {
    const sin = pedirCon(app);
    expect((await sin("GET", "/historial")).statusCode).toBe(401);
    expect((await sin("GET", "/historial/excel")).statusCode).toBe(401);
  });

  it("403 para depósito y repositor", async () => {
    const deposito = pedirCon(app, await loginToken(app, { tipo: "email", email: EMAIL_DEPOSITO, password: PASSWORD }));
    const repositor = pedirCon(
      app,
      await loginToken(app, { tipo: "repositor", usuarioId: repositorId, pin: "4321" }),
    );
    expect((await deposito("GET", "/historial")).statusCode).toBe(403);
    expect((await deposito("GET", "/historial/excel")).statusCode).toBe(403);
    expect((await repositor("GET", "/historial")).statusCode).toBe(403);
    expect((await repositor("GET", "/historial/excel")).statusCode).toBe(403);
  });

  it("encargada y admin entran", async () => {
    expect((await encargada("GET", url("/historial"))).statusCode).toBe(200);
    expect((await admin("GET", url("/historial"))).statusCode).toBe(200);
  });
});

describe("GET /historial", () => {
  it("por defecto: últimos 30 días y solo APROBADO", async () => {
    await pedido(hoyMenos(1), [[prod.leche, 10]]);
    await pedido(hoyMenos(29), [[prod.leche, 1]]);
    await pedido(hoyMenos(40), [[prod.leche, 100]]);
    await pedido(hoyMenos(2), [[prod.leche, 1000]], { estado: EstadoPedido.ENVIADO });

    const res = await encargada("GET", url("/historial"));

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.map((f: { cantidad: string }) => f.cantidad)).toEqual(["10", "1"]);
    expect(body.meta.total).toBe(2);
    expect(body.resumen).toHaveLength(1);
  });

  it("estado=TODOS incluye ENVIADO, DEVUELTO y APROBADO pero no BORRADOR", async () => {
    await pedido(hoyMenos(1), [[prod.leche, 1]]);
    await pedido(hoyMenos(1), [[prod.leche, 2]], { estado: EstadoPedido.ENVIADO });
    await pedido(hoyMenos(1), [[prod.leche, 3]], { estado: EstadoPedido.DEVUELTO });
    await pedido(hoyMenos(1), [[prod.leche, 4]], { estado: EstadoPedido.BORRADOR });

    const res = await encargada("GET", url("/historial", "&estado=TODOS"));

    expect(res.json().meta.total).toBe(3);
    expect(res.json().data.map((f: { estado: string }) => f.estado).sort()).toEqual(["APROBADO", "DEVUELTO", "ENVIADO"]);
  });

  it("bordes del día en hora de Argentina", async () => {
    await pedido("2026-03-10T02:59:59Z", [[prod.leche, 1]]); // 09/03 23:59:59 AR
    await pedido("2026-03-10T03:00:00Z", [[prod.leche, 2]]); // 10/03 00:00 AR
    await pedido("2026-03-11T02:59:59Z", [[prod.leche, 3]]); // 10/03 23:59:59 AR
    await pedido("2026-03-11T03:00:00Z", [[prod.leche, 4]]); // 11/03 00:00 AR

    const res = await encargada("GET", url("/historial", "&desde=2026-03-10&hasta=2026-03-10"));

    expect(res.json().data.map((f: { cantidad: string }) => f.cantidad).sort()).toEqual(["2", "3"]);
  });

  it("filtra por proveedor y por sucursal", async () => {
    await pedido(hoyMenos(1), [[prod.leche, 1]]);
    await pedido(hoyMenos(1), [[prod.leche, 2]], { proveedorId: otroProveedorId });
    await pedido(hoyMenos(1), [[prod.leche, 3]], { sucursal: Sucursal.CARMAR_1 });

    const prov = await encargada("GET", `/historial?proveedorId=${otroProveedorId}`);
    expect(prov.json().data.map((f: { cantidad: string }) => f.cantidad)).toEqual(["2"]);

    const suc = await encargada("GET", url("/historial", "&sucursal=CARMAR_1"));
    expect(suc.json().data.map((f: { cantidad: string }) => f.cantidad)).toEqual(["3"]);
  });

  it("q busca en nombre o código sin distinguir mayúsculas", async () => {
    await pedido(hoyMenos(1), [
      [prod.leche, 1],
      [prod.yerba, 2],
    ]);

    const porNombre = await encargada("GET", url("/historial", "&q=%20YERBA%20"));
    expect(porNombre.json().data.map((f: { producto: { id: string } }) => f.producto.id)).toEqual([prod.yerba]);

    const porCodigo = await encargada("GET", url("/historial", `&q=${PREFIJO.toUpperCase()}LECHE`));
    expect(porCodigo.json().data.map((f: { producto: { id: string } }) => f.producto.id)).toEqual([prod.leche]);
  });

  it("fila completa: cantidadComprada con y sin depósito", async () => {
    const aprobacion = new Date();
    await pedido(hoyMenos(1), [
      [prod.leche, 10, 4],
      [prod.yerba, 2.5],
    ], { titulo: "Pedido especial", fechaAprobacion: aprobacion });

    const res = await encargada("GET", url("/historial"));
    const filas = res.json().data;
    const leche = filas.find((f: { producto: { id: string } }) => f.producto.id === prod.leche);
    const yerba = filas.find((f: { producto: { id: string } }) => f.producto.id === prod.yerba);

    expect(leche).toMatchObject({
      titulo: "Pedido especial",
      estado: "APROBADO",
      sucursal: "CARMAR_2",
      repositor: { id: repositorId, nombre: `${PREFIJO}Repositor` },
      proveedor: { id: proveedorId, nombre: `${PREFIJO}Proveedor` },
      producto: { codigo: `${PREFIJO}leche`, nombre: "Leche Entera", unidad: "UN", rubro: { nombre: `${PREFIJO}Rubro` } },
      cantidad: "10",
      cantidadDeposito: "4",
      cantidadComprada: "6",
      fechaAprobacion: aprobacion.toISOString(),
    });
    expect(yerba).toMatchObject({ cantidad: "2.5", cantidadDeposito: null, cantidadComprada: "2.5" });
  });

  it("título armado cuando el pedido no tiene", async () => {
    await pedido("2026-03-10T15:00:00Z", [[prod.leche, 1]]);
    await pedido("2026-03-11T15:00:00Z", [[prod.leche, 1]], { proveedorId: null });

    const res = await encargada("GET", "/historial?desde=2026-03-10&hasta=2026-03-11&q=" + PREFIJO);
    const titulos = res.json().data.map((f: { titulo: string }) => f.titulo).sort();
    expect(titulos).toEqual(["Pedido del 11/03", `${PREFIJO}Proveedor – 10/03`]);
  });

  it("orden por fechaEnvio desc y luego producto", async () => {
    await pedido("2026-03-10T15:00:00Z", [[prod.yerba, 1]]);
    await pedido("2026-03-12T15:00:00Z", [
      [prod.yerba, 1],
      [prod.arroz, 1],
    ]);

    const res = await encargada("GET", url("/historial", "&desde=2026-03-01&hasta=2026-03-31"));
    expect(res.json().data.map((f: { producto: { nombre: string } }) => f.producto.nombre)).toEqual([
      "Arroz Largo",
      "Yerba Mate",
      "Yerba Mate",
    ]);
  });

  it("resumen agregado sobre todo el filtro, no solo la página", async () => {
    await pedido(hoyMenos(1), [
      [prod.leche, 10, 4],
      [prod.yerba, 3],
    ]);
    await pedido(hoyMenos(2), [[prod.leche, 5]]);

    const res = await encargada("GET", url("/historial", "&limit=1"));
    const body = res.json();

    expect(body.data).toHaveLength(1);
    expect(body.meta).toMatchObject({ total: 3, limit: 1, totalPages: 3 });
    expect(body.resumen).toEqual([
      {
        producto: { id: prod.leche, codigo: `${PREFIJO}leche`, nombre: "Leche Entera", unidad: "UN" },
        veces: 2,
        pedido: "15",
        deposito: "4",
        comprado: "11",
      },
      {
        producto: { id: prod.yerba, codigo: `${PREFIJO}yerba`, nombre: "Yerba Mate", unidad: "KG" },
        veces: 1,
        pedido: "3",
        deposito: "0",
        comprado: "3",
      },
    ]);
  });
});

describe("validaciones", () => {
  it.each([
    ["fecha mal formada", "desde=10/03/2026"],
    ["fecha inexistente", "hasta=2026-02-31"],
    ["desde mayor que hasta", "desde=2026-03-10&hasta=2026-03-09"],
    ["rango de más de 400 días", "desde=2025-01-01&hasta=2026-03-01"],
    ["sucursal inválida", "sucursal=CARMAR_9"],
    ["estado inválido", "estado=BORRADOR"],
    ["q demasiado largo", `q=${"a".repeat(101)}`],
  ])("400 por %s", async (_nombre, query) => {
    expect((await encargada("GET", `/historial?${query}`)).statusCode).toBe(400);
    expect((await encargada("GET", `/historial/excel?${query}`)).statusCode).toBe(400);
  });

  it("400 con mensaje cuando desde > hasta", async () => {
    const res = await encargada("GET", "/historial?desde=2026-03-10&hasta=2026-03-09");
    expect(res.json().error).toMatch(/desde/);
  });

  it("exactamente 400 días es válido", async () => {
    const res = await encargada("GET", url("/historial", "&desde=2025-02-01&hasta=2026-03-07"));
    expect(res.statusCode).toBe(200);
  });
});

describe("GET /historial/excel", () => {
  it("devuelve un xlsx con las hojas Detalle y Resumen", async () => {
    await pedido("2026-03-11T02:30:00Z", [
      [prod.leche, 10, 4],
      [prod.yerba, 2.5],
    ], { fechaAprobacion: new Date("2026-03-12T15:00:00Z") });

    const res = await encargada("GET", url("/historial/excel", "&desde=2026-03-01&hasta=2026-03-31"));

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain(XLSX_MIME);
    expect(res.headers["content-disposition"]).toBe(
      'attachment; filename="historial-pedidos_2026-03-01_a_2026-03-31.xlsx"',
    );

    const libro = XLSX.read(res.rawPayload, { type: "buffer" });
    expect(libro.SheetNames).toEqual(["Detalle", "Resumen"]);

    const detalle = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets.Detalle, { header: 1 });
    expect(detalle[0]).toEqual([
      "Fecha envío", "Semana", "Mes", "Sucursal", "Repositor", "Proveedor", "Pedido", "Código",
      "Producto", "Rubro", "Unidad", "Pedido", "Del galpón", "Comprado", "Estado", "Fecha aprobación",
    ]);
    expect(detalle).toHaveLength(3);
    // 11/03 02:30 UTC = 10/03 23:30 AR (martes): serie de 2026-03-10, lunes 2026-03-09
    const fila = detalle.find((f) => f[7] === `${PREFIJO}leche`)!;
    expect(fila.slice(0, 7)).toEqual([46091, 46090, "2026-03", "Carmar 2", `${PREFIJO}Repositor`, `${PREFIJO}Proveedor`, `${PREFIJO}Proveedor – 10/03`]);
    expect(fila.slice(8)).toEqual(["Leche Entera", `${PREFIJO}Rubro`, "UN", 10, 4, 6, "Aprobado", 46093]);
    const yerba = detalle.find((f) => f[7] === `${PREFIJO}yerba`)!;
    expect(yerba.slice(11, 14)).toEqual([2.5, 0, 2.5]);
    expect(typeof yerba[11]).toBe("number");

    const resumen = XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets.Resumen, { header: 1 });
    expect(resumen[0]).toEqual(["Código", "Producto", "Unidad", "Veces pedido", "Total pedido", "Del galpón", "Comprado"]);
    expect(resumen[1]).toEqual([`${PREFIJO}leche`, "Leche Entera", "UN", 1, 10, 4, 6]);
    expect(resumen[2]).toEqual([`${PREFIJO}yerba`, "Yerba Mate", "KG", 1, 2.5, 0, 2.5]);
  });

  it("sin datos igual devuelve las dos hojas con encabezados", async () => {
    const res = await encargada("GET", url("/historial/excel", "&desde=2020-01-01&hasta=2020-01-31"));
    expect(res.statusCode).toBe(200);
    const libro = XLSX.read(res.rawPayload, { type: "buffer" });
    expect(libro.SheetNames).toEqual(["Detalle", "Resumen"]);
  });
});
