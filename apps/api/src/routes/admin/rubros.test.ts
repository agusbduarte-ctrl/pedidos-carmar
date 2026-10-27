import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient, Rol, Sucursal } from "@prisma/client";
import { buildApp } from "../../app.js";

// Corre contra la BD de desarrollo en paralelo con otros archivos de test:
// solo crea/borra registros con este prefijo.
const PREFIJO = "test-rubros-";

const prisma = new PrismaClient();
let app: FastifyInstance;

async function limpiar() {
  const empiezaCon = { startsWith: PREFIJO, mode: "insensitive" as const };
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.usuario.deleteMany({ where: { nombre: empiezaCon } }); // borra sus asignaciones en cascada
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } });
}

async function tokenDe(body: Record<string, string>) {
  const res = await app.inject({ method: "POST", url: "/auth/login", payload: body });
  return res.cookies.find((c) => c.name === "token")!.value;
}

const tokenAdmin = () =>
  tokenDe({ tipo: "email", email: "admin@carmar.com", password: "admin123" });

async function tokenRepositor() {
  const repositor = await prisma.usuario.findFirstOrThrow({
    where: { rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_1, deletedAt: null },
  });
  return tokenDe({ tipo: "repositor", usuarioId: repositor.id, pin: "1234" });
}

function pedir(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, token?: string, payload?: object) {
  return app.inject({ method, url, payload, ...(token ? { cookies: { token } } : {}) });
}

beforeEach(async () => {
  await limpiar();
  app = await buildApp(prisma, { logger: false });
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("acceso a /admin/rubros", () => {
  it("sin auth: 401", async () => {
    const res = await pedir("GET", "/admin/rubros");
    expect(res.statusCode).toBe(401);
  });

  it("con auth de repositor: 403", async () => {
    const res = await pedir("GET", "/admin/rubros", await tokenRepositor());
    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "No autorizado" });
  });

  it("con auth de admin: 200 con { data, meta } paginado", async () => {
    // Filtra por el prefijo: otros archivos de test crean rubros en paralelo
    await prisma.rubro.createMany({
      data: ["A", "B", "C"].map((l) => ({ nombre: `${PREFIJO}Pagina ${l}` })),
    });

    const res = await pedir("GET", `/admin/rubros?q=${PREFIJO}Pagina&page=2&limit=2`, await tokenAdmin());

    expect(res.statusCode).toBe(200);
    const { data, meta } = res.json();
    expect(data.map((r: { nombre: string }) => r.nombre)).toEqual([`${PREFIJO}Pagina C`]);
    expect(meta).toEqual({ total: 3, page: 2, limit: 2, totalPages: 2 });
  });
});

describe("POST /admin/rubros", () => {
  it("con body válido: 201", async () => {
    const res = await pedir("POST", "/admin/rubros", await tokenAdmin(), { nombre: `${PREFIJO}Nuevo` });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ nombre: `${PREFIJO}Nuevo`, deletedAt: null });
  });

  it("con nombre duplicado, aunque cambien mayúsculas: 409", async () => {
    const token = await tokenAdmin();
    await pedir("POST", "/admin/rubros", token, { nombre: `${PREFIJO}Bazar` });

    const res = await pedir("POST", "/admin/rubros", token, { nombre: `${PREFIJO}BAZAR` });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "El rubro ya existe" });
  });

  it("con nombre de un rubro borrado: lo restaura (201, mismo id)", async () => {
    const token = await tokenAdmin();
    const creado = (await pedir("POST", "/admin/rubros", token, { nombre: `${PREFIJO}Viejo` })).json().data;
    await pedir("DELETE", `/admin/rubros/${creado.id}`, token);

    const res = await pedir("POST", "/admin/rubros", token, { nombre: `${PREFIJO}VIEJO` });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ id: creado.id, nombre: `${PREFIJO}VIEJO`, deletedAt: null });
  });
});

describe("PATCH /admin/rubros/:id", () => {
  it("renombrar a un nombre de un rubro borrado: 409, no lo restaura", async () => {
    const token = await tokenAdmin();
    const borrado = (await pedir("POST", "/admin/rubros", token, { nombre: `${PREFIJO}Borrado` })).json().data;
    await pedir("DELETE", `/admin/rubros/${borrado.id}`, token);
    const otro = (await pedir("POST", "/admin/rubros", token, { nombre: `${PREFIJO}Otro` })).json().data;

    const res = await pedir("PATCH", `/admin/rubros/${otro.id}`, token, { nombre: `${PREFIJO}borrado` });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "Existe un rubro borrado con ese nombre" });
    const sigueBorrado = await prisma.rubro.findUniqueOrThrow({ where: { id: borrado.id } });
    expect(sigueBorrado.deletedAt).not.toBeNull();
  });
});

describe("DELETE /admin/rubros/:id", () => {
  it("con un producto activo asociado: 400", async () => {
    const token = await tokenAdmin();
    const rubro = await prisma.rubro.create({ data: { nombre: `${PREFIJO}ConProductos` } });
    const proveedor = await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Proveedor` } });
    await prisma.producto.create({
      data: { codigo: `${PREFIJO}001`, nombre: "Producto de prueba", rubroId: rubro.id, proveedorId: proveedor.id },
    });

    const res = await pedir("DELETE", `/admin/rubros/${rubro.id}`, token);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "No se puede borrar un rubro con productos activos" });
  });

  it("asignado a un repositor activo: 400", async () => {
    const token = await tokenAdmin();
    const rubro = await prisma.rubro.create({ data: { nombre: `${PREFIJO}Asignado` } });
    await prisma.usuario.create({
      data: {
        nombre: `${PREFIJO}Repositor`,
        rol: Rol.REPOSITOR,
        sucursal: Sucursal.CARMAR_2,
        rubrosAsignados: { create: { rubroId: rubro.id, sucursal: Sucursal.CARMAR_2 } },
      },
    });

    const res = await pedir("DELETE", `/admin/rubros/${rubro.id}`, token);

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/asignado a repositores activos/);
  });

  it("asignado solo a un repositor inactivo: se puede borrar", async () => {
    const token = await tokenAdmin();
    const rubro = await prisma.rubro.create({ data: { nombre: `${PREFIJO}AsignadoInactivo` } });
    await prisma.usuario.create({
      data: {
        nombre: `${PREFIJO}RepositorInactivo`,
        rol: Rol.REPOSITOR,
        sucursal: Sucursal.CARMAR_2,
        activo: false,
        rubrosAsignados: { create: { rubroId: rubro.id, sucursal: Sucursal.CARMAR_2 } },
      },
    });

    const res = await pedir("DELETE", `/admin/rubros/${rubro.id}`, token);

    expect(res.statusCode).toBe(200);
  });

  it("sin productos: 200, y el GET posterior no lo muestra", async () => {
    const token = await tokenAdmin();
    const rubro = await prisma.rubro.create({ data: { nombre: `${PREFIJO}SinProductos` } });

    const res = await pedir("DELETE", `/admin/rubros/${rubro.id}`, token);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    const lista = await pedir("GET", `/admin/rubros?q=${PREFIJO}SinProductos`, token);
    expect(lista.json().data).toEqual([]);
    expect((await prisma.rubro.findUniqueOrThrow({ where: { id: rubro.id } })).deletedAt).not.toBeNull();
  });
});
