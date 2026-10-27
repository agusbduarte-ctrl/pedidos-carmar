import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../app.js";
import { ADMIN_SEED, loginToken, pedirCon } from "../../test/helpers.js";

// Corre contra la BD de desarrollo en paralelo con otros archivos de test:
// solo crea/borra registros con este prefijo (código de producto, nombre de
// rubro y de proveedor).
const PREFIJO = "test-prod-";

const prisma = new PrismaClient();
let app: FastifyInstance;
let pedir: ReturnType<typeof pedirCon>;
let rubroId: string;
let proveedorId: string;

async function limpiar() {
  const empiezaCon = { startsWith: PREFIJO, mode: "insensitive" as const };
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
}

function nuevo(codigo: string, extra: object = {}) {
  return pedir("POST", "/admin/productos", {
    codigo: `${PREFIJO}${codigo}`,
    nombre: `Producto ${codigo}`,
    rubroId,
    proveedorId,
    ...extra,
  });
}

beforeEach(async () => {
  await limpiar();
  rubroId = (await prisma.rubro.create({ data: { nombre: `${PREFIJO}Rubro` } })).id;
  proveedorId = (await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Proveedor` } })).id;
  app = await buildApp(prisma, { logger: false });
  pedir = pedirCon(app, await loginToken(app, ADMIN_SEED));
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("POST /admin/productos", () => {
  it("válido: 201 con defaults (unidad UN, activo true) y rubro/proveedor", async () => {
    const res = await nuevo("001", { precioReferencia: 1234.5 });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      codigo: `${PREFIJO}001`,
      unidad: "UN",
      activo: true,
      precioReferencia: "1234.5",
      rubro: { id: rubroId, nombre: `${PREFIJO}Rubro` },
      proveedor: { id: proveedorId, nombre: `${PREFIJO}Proveedor` },
    });
  });

  it("código duplicado: 409", async () => {
    await nuevo("002");

    const res = await nuevo("002");

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "El código ya existe" });
  });

  it("rubro borrado: 400", async () => {
    await prisma.rubro.update({ where: { id: rubroId }, data: { deletedAt: new Date() } });

    const res = await nuevo("003");

    expect(res.statusCode).toBe(400);
    expect(res.json().detalles).toEqual(["rubroId: El rubro no existe o está borrado"]);
  });

  it("precio negativo: 400", async () => {
    const res = await nuevo("004", { precioReferencia: -10 });

    expect(res.statusCode).toBe(400);
    expect(res.json().detalles[0]).toMatch(/^precioReferencia: /);
  });

  it("código de un producto borrado: lo restaura (201, mismo id) con activo como estaba", async () => {
    const creado = (await nuevo("005", { activo: false })).json().data;
    await pedir("DELETE", `/admin/productos/${creado.id}`);

    const res = await nuevo("005", { nombre: "Nombre nuevo" });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ id: creado.id, nombre: "Nombre nuevo", activo: false, deletedAt: null });
  });
});

describe("GET /admin/productos", () => {
  it("por defecto oculta inactivos; con incluirInactivos=true los muestra", async () => {
    await nuevo("010");
    await nuevo("011", { activo: false });

    const normal = await pedir("GET", `/admin/productos?q=${PREFIJO}01`);
    const todos = await pedir("GET", `/admin/productos?q=${PREFIJO}01&incluirInactivos=true`);

    const codigos = (res: typeof normal) => res.json().data.map((p: { codigo: string }) => p.codigo).sort();
    expect(codigos(normal)).toEqual([`${PREFIJO}010`]);
    expect(codigos(todos)).toEqual([`${PREFIJO}010`, `${PREFIJO}011`]);
  });

  it("q busca por código y filtra por rubroId", async () => {
    await nuevo("020");
    const otroRubro = await prisma.rubro.create({ data: { nombre: `${PREFIJO}Otro Rubro` } });
    await nuevo("021", { rubroId: otroRubro.id });

    const res = await pedir("GET", `/admin/productos?q=${PREFIJO}02&rubroId=${otroRubro.id}`);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.map((p: { codigo: string }) => p.codigo)).toEqual([`${PREFIJO}021`]);
    expect(res.json().meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });
});

describe("PATCH / DELETE /admin/productos/:id", () => {
  it("PATCH precioReferencia null lo vacía; el código no se puede cambiar", async () => {
    const creado = (await nuevo("030", { precioReferencia: 500 })).json().data;

    const vaciar = await pedir("PATCH", `/admin/productos/${creado.id}`, { precioReferencia: null });
    const cambiarCodigo = await pedir("PATCH", `/admin/productos/${creado.id}`, { codigo: "otro" });

    expect(vaciar.statusCode).toBe(200);
    expect(vaciar.json().data.precioReferencia).toBeNull();
    expect(cambiarCodigo.statusCode).toBe(400);
  });

  it("DELETE: 200, soft delete y deja de listarse", async () => {
    const creado = (await nuevo("040")).json().data;

    const res = await pedir("DELETE", `/admin/productos/${creado.id}`);

    expect(res.statusCode).toBe(200);
    expect((await pedir("GET", `/admin/productos?q=${PREFIJO}040&incluirInactivos=true`)).json().data).toEqual([]);
    expect((await prisma.producto.findUniqueOrThrow({ where: { id: creado.id } })).deletedAt).not.toBeNull();
  });
});
