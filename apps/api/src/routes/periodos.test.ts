import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { EstadoPeriodo, PrismaClient, Rol, Sucursal } from "@prisma/client";
import { buildApp } from "../app.js";
import { ADMIN_SEED, loginToken, pedirCon } from "../test/helpers.js";

// Corre contra la BD de desarrollo. Los períodos de prueba se crean CERRADOS
// (no chocan con el único ABIERTO) y llevan este prefijo.
const PREFIJO = "test-periodos-lectura-";

const prisma = new PrismaClient();
let app: FastifyInstance;
let pedir: ReturnType<typeof pedirCon>;

const deTest = { nombre: { startsWith: PREFIJO } };
const ENCARGADA = { tipo: "email", email: "encargada@carmar.com", password: "encargada123" };

interface PeriodoRes {
  id: string;
  nombre: string;
  estado: string;
  fechaApertura: string;
}

beforeEach(async () => {
  await prisma.periodo.deleteMany({ where: deTest });
  await prisma.periodo.createMany({
    data: [
      { nombre: `${PREFIJO}A`, fechaApertura: new Date("2001-01-01T00:00:00Z"), estado: EstadoPeriodo.CERRADO },
      { nombre: `${PREFIJO}B`, fechaApertura: new Date("2001-02-01T00:00:00Z"), estado: EstadoPeriodo.CERRADO },
      { nombre: `${PREFIJO}C`, fechaApertura: new Date("2001-03-01T00:00:00Z"), estado: EstadoPeriodo.CERRADO },
    ],
  });
  app = await buildApp(prisma, { logger: false });
  pedir = pedirCon(app, await loginToken(app, ENCARGADA));
});

afterEach(async () => {
  await app?.close();
  await prisma.periodo.deleteMany({ where: deTest });
});

afterAll(async () => {
  await prisma.periodo.deleteMany({ where: deTest });
  await prisma.$disconnect();
});

describe("GET /periodos", () => {
  it("sin auth: 401", async () => {
    const res = await app.inject({ method: "GET", url: "/periodos" });
    expect(res.statusCode).toBe(401);
  });

  it("repositor: 403", async () => {
    const repositor = await prisma.usuario.findFirstOrThrow({
      where: { rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_1, deletedAt: null, email: null },
      orderBy: { createdAt: "asc" },
    });
    const comoRepositor = pedirCon(
      app,
      await loginToken(app, { tipo: "repositor", usuarioId: repositor.id, pin: "1234" }),
    );
    expect((await comoRepositor("GET", "/periodos")).statusCode).toBe(403);
  });

  it("encargada: 200 con { data, meta }", async () => {
    const res = await pedir("GET", "/periodos?limit=100");
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.meta).toMatchObject({ page: 1, limit: 100 });
    expect(body.data.filter((p: PeriodoRes) => p.nombre.startsWith(PREFIJO))).toHaveLength(3);
  });

  it("admin: 200", async () => {
    const admin = pedirCon(app, await loginToken(app, ADMIN_SEED));
    expect((await admin("GET", "/periodos")).statusCode).toBe(200);
  });

  it("filtra por estado", async () => {
    const cerrados = (await pedir("GET", "/periodos?estado=CERRADO&limit=100")).json().data as PeriodoRes[];
    expect(cerrados.length).toBeGreaterThanOrEqual(3);
    expect(cerrados.every((p) => p.estado === "CERRADO")).toBe(true);

    const abiertos = (await pedir("GET", "/periodos?estado=ABIERTO&limit=100")).json().data as PeriodoRes[];
    expect(abiertos.every((p) => p.estado === "ABIERTO")).toBe(true);
    expect(abiertos.some((p) => p.nombre.startsWith(PREFIJO))).toBe(false);
  });

  it("estado inválido: 400", async () => {
    expect((await pedir("GET", "/periodos?estado=XXX")).statusCode).toBe(400);
  });

  it("ordena por fechaApertura descendente", async () => {
    const data = (await pedir("GET", "/periodos?limit=100")).json().data as PeriodoRes[];
    const fechas = data.map((p) => new Date(p.fechaApertura).getTime());
    expect(fechas).toEqual([...fechas].sort((a, b) => b - a));
    const propios = data.filter((p) => p.nombre.startsWith(PREFIJO)).map((p) => p.nombre.slice(PREFIJO.length));
    expect(propios).toEqual(["C", "B", "A"]);
  });

  it("pagina con page y limit", async () => {
    const todos = (await pedir("GET", "/periodos?limit=100")).json();
    const pag1 = (await pedir("GET", "/periodos?limit=2&page=1")).json();
    const pag2 = (await pedir("GET", "/periodos?limit=2&page=2")).json();

    expect(pag1.data).toHaveLength(2);
    expect(pag1.meta).toMatchObject({ total: todos.meta.total, page: 1, limit: 2 });
    expect(pag1.meta.totalPages).toBe(Math.ceil(todos.meta.total / 2));
    expect(pag2.data.map((p: PeriodoRes) => p.id)).toEqual(
      todos.data.slice(2, 4).map((p: PeriodoRes) => p.id),
    );
  });
});
