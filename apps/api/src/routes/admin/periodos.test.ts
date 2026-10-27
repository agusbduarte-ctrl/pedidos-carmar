import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { EstadoPeriodo, PrismaClient } from "@prisma/client";
import { buildApp } from "../../app.js";
import { ADMIN_SEED, loginToken, pedirCon } from "../../test/helpers.js";

// Corre contra la BD de desarrollo. Solo puede haber un período ABIERTO y el
// seed ya tiene uno: cada test lo cierra temporalmente (directo en la BD) y lo
// vuelve a abrir al terminar. Los períodos de prueba usan este prefijo.
const PREFIJO = "test-periodo-";

const prisma = new PrismaClient();
let app: FastifyInstance;
let pedir: ReturnType<typeof pedirCon>;
let abiertosDelSeed: string[] = [];

const deTest = { nombre: { startsWith: PREFIJO } };

async function restaurarSeed() {
  await prisma.periodo.deleteMany({ where: deTest });
  if (abiertosDelSeed.length > 0) {
    await prisma.periodo.updateMany({
      where: { id: { in: abiertosDelSeed } },
      data: { estado: EstadoPeriodo.ABIERTO },
    });
    abiertosDelSeed = [];
  }
}

function nuevo(nombre: string, extra: object = {}) {
  return pedir("POST", "/admin/periodos", {
    nombre: `${PREFIJO}${nombre}`,
    fechaApertura: "2026-11-01T00:00:00.000Z",
    ...extra,
  });
}

beforeEach(async () => {
  await prisma.periodo.deleteMany({ where: deTest });
  const abiertos = await prisma.periodo.findMany({
    where: { estado: EstadoPeriodo.ABIERTO, NOT: deTest },
    select: { id: true },
  });
  abiertosDelSeed = abiertos.map((p) => p.id);
  await prisma.periodo.updateMany({
    where: { id: { in: abiertosDelSeed } },
    data: { estado: EstadoPeriodo.CERRADO },
  });
  app = await buildApp(prisma, { logger: false });
  pedir = pedirCon(app, await loginToken(app, ADMIN_SEED));
});

afterEach(async () => {
  // finally: el período del seed se reabre aunque app.close() falle (por
  // ejemplo, si el beforeEach se cortó después de cerrarlo y antes de crear la app)
  try {
    await app?.close();
  } finally {
    await restaurarSeed();
  }
});

afterAll(async () => {
  await restaurarSeed();
  await prisma.$disconnect();
});

describe("POST /admin/periodos", () => {
  it("válido: 201 y queda ABIERTO", async () => {
    const res = await nuevo("Noviembre", { fechaCierre: "2026-11-30T00:00:00.000Z" });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({
      nombre: `${PREFIJO}Noviembre`,
      estado: "ABIERTO",
      fechaApertura: "2026-11-01T00:00:00.000Z",
      fechaCierre: "2026-11-30T00:00:00.000Z",
    });
  });

  it("con otro período abierto: 409", async () => {
    await nuevo("Primero");

    const res = await nuevo("Segundo");

    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe(`Ya hay un período abierto: ${PREFIJO}Primero`);
  });

  it("fechaCierre anterior a fechaApertura: 400", async () => {
    const res = await nuevo("Al revés", { fechaCierre: "2026-10-01T00:00:00.000Z" });

    expect(res.statusCode).toBe(400);
    expect(res.json().detalles).toEqual(["fechaCierre: No puede ser anterior a la fecha de apertura"]);
  });

  it("nombre duplicado (sin distinguir mayúsculas): 409", async () => {
    const creado = (await nuevo("Repetido")).json().data;
    await pedir("POST", `/admin/periodos/${creado.id}/cerrar`);

    const res = await pedir("POST", "/admin/periodos", {
      nombre: `${PREFIJO}REPETIDO`,
      fechaApertura: "2026-12-01T00:00:00.000Z",
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "Ya existe un período con ese nombre" });
  });
});

describe("PATCH y cierre", () => {
  it("PATCH de un período abierto: 200; estado no se puede tocar", async () => {
    const creado = (await nuevo("Editable")).json().data;

    const res = await pedir("PATCH", `/admin/periodos/${creado.id}`, { nombre: `${PREFIJO}Editado` });
    const reabrir = await pedir("PATCH", `/admin/periodos/${creado.id}`, { estado: "ABIERTO" });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.nombre).toBe(`${PREFIJO}Editado`);
    expect(reabrir.statusCode).toBe(400);
  });

  it("cerrar: pasa a CERRADO con fechaCierre; cerrar de nuevo: 409; PATCH: 409", async () => {
    const creado = (await nuevo("A cerrar")).json().data;

    const cerrar = await pedir("POST", `/admin/periodos/${creado.id}/cerrar`);
    const otraVez = await pedir("POST", `/admin/periodos/${creado.id}/cerrar`);
    const editar = await pedir("PATCH", `/admin/periodos/${creado.id}`, { nombre: `${PREFIJO}Tarde` });

    expect(cerrar.statusCode).toBe(200);
    expect(cerrar.json().data.estado).toBe("CERRADO");
    expect(cerrar.json().data.fechaCierre).not.toBeNull();
    expect(otraVez.statusCode).toBe(409);
    expect(editar.statusCode).toBe(409);
    expect(editar.json()).toEqual({ error: "Solo se puede editar un período abierto" });
  });

  it("GET ?estado=CERRADO solo devuelve cerrados", async () => {
    const creado = (await nuevo("Para listar")).json().data;
    await pedir("POST", `/admin/periodos/${creado.id}/cerrar`);

    const res = await pedir("GET", "/admin/periodos?estado=CERRADO&limit=100");

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.every((p: { estado: string }) => p.estado === "CERRADO")).toBe(true);
    expect(data.map((p: { id: string }) => p.id)).toContain(creado.id);
  });
});
