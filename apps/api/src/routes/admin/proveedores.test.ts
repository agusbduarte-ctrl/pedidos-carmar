import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient } from "@prisma/client";
import { buildApp } from "../../app.js";

// Corre contra la BD de desarrollo en paralelo con otros archivos de test:
// solo crea/borra registros con este prefijo.
const PREFIJO = "test-prov-";

const prisma = new PrismaClient();
let app: FastifyInstance;
let token: string;

async function limpiar() {
  const empiezaCon = { startsWith: PREFIJO, mode: "insensitive" as const };
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } });
}

function pedir(method: "GET" | "POST" | "PATCH" | "DELETE", url: string, payload?: object) {
  return app.inject({ method, url, payload, cookies: { token } });
}

beforeEach(async () => {
  await limpiar();
  app = await buildApp(prisma, { logger: false });
  const login = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { tipo: "email", email: "admin@carmar.com", password: "admin123" },
  });
  token = login.cookies.find((c) => c.name === "token")!.value;
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("/admin/proveedores", () => {
  it("POST con body válido: 201", async () => {
    const res = await pedir("POST", "/admin/proveedores", {
      nombre: `${PREFIJO}Norte`,
      email: "ventas@norte.example",
      telefono: "011 4444-5555",
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      nombre: `${PREFIJO}Norte`,
      email: "ventas@norte.example",
      telefono: "011 4444-5555",
      deletedAt: null,
    });
  });

  it("POST con email inválido: 400 con detalles", async () => {
    const res = await pedir("POST", "/admin/proveedores", { nombre: `${PREFIJO}Sur`, email: "no-es-un-email" });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe("Datos inválidos");
    expect(body.detalles).toEqual([expect.stringMatching(/^email: /)]);
  });

  it("PATCH con datos válidos: 200", async () => {
    const creado = (await pedir("POST", "/admin/proveedores", { nombre: `${PREFIJO}Centro` })).json().data;

    const res = await pedir("PATCH", `/admin/proveedores/${creado.id}`, {
      nombre: `${PREFIJO}Centro SA`,
      telefono: "0351 555-1234",
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({
      id: creado.id,
      nombre: `${PREFIJO}Centro SA`,
      telefono: "0351 555-1234",
    });
  });

  it("DELETE sin productos: 200 y deja de listarse", async () => {
    const creado = (await pedir("POST", "/admin/proveedores", { nombre: `${PREFIJO}Oeste` })).json().data;

    const res = await pedir("DELETE", `/admin/proveedores/${creado.id}`);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect((await pedir("GET", `/admin/proveedores?q=${PREFIJO}Oeste`)).json().data).toEqual([]);
  });

  it("GET ?q= filtra por nombre sin distinguir mayúsculas", async () => {
    await pedir("POST", "/admin/proveedores", { nombre: `${PREFIJO}Lacteos Del Valle` });
    await pedir("POST", "/admin/proveedores", { nombre: `${PREFIJO}Bebidas Andinas` });

    const res = await pedir("GET", `/admin/proveedores?q=${PREFIJO}LACTEOS`);

    expect(res.statusCode).toBe(200);
    const { data, meta } = res.json();
    expect(data.map((p: { nombre: string }) => p.nombre)).toEqual([`${PREFIJO}Lacteos Del Valle`]);
    expect(meta).toEqual({ total: 1, page: 1, limit: 20, totalPages: 1 });
  });

  it("PATCH con null vacía email y teléfono", async () => {
    const creado = (
      await pedir("POST", "/admin/proveedores", {
        nombre: `${PREFIJO}Vaciar`,
        email: "a@vaciar.example",
        telefono: "111",
      })
    ).json().data;

    const res = await pedir("PATCH", `/admin/proveedores/${creado.id}`, { email: null, telefono: null });

    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ email: null, telefono: null, nombre: `${PREFIJO}Vaciar` });
  });

  it("DELETE con un producto activo asociado: 400", async () => {
    const proveedor = await prisma.proveedor.create({ data: { nombre: `${PREFIJO}ConProductos` } });
    const rubro = await prisma.rubro.create({ data: { nombre: `${PREFIJO}Rubro` } });
    await prisma.producto.create({
      data: { codigo: `${PREFIJO}001`, nombre: "Producto de prueba", rubroId: rubro.id, proveedorId: proveedor.id },
    });

    const res = await pedir("DELETE", `/admin/proveedores/${proveedor.id}`);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "No se puede borrar un proveedor con productos activos" });
  });

  it("POST con nombre de un proveedor borrado: lo restaura con los datos nuevos", async () => {
    const creado = (
      await pedir("POST", "/admin/proveedores", { nombre: `${PREFIJO}Este`, email: "viejo@este.example" })
    ).json().data;
    await pedir("DELETE", `/admin/proveedores/${creado.id}`);

    const res = await pedir("POST", "/admin/proveedores", { nombre: `${PREFIJO}Este`, telefono: "123" });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ id: creado.id, email: null, telefono: "123", deletedAt: null });
  });
});
