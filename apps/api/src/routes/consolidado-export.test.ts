import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { EstadoPeriodo, PrismaClient, Rol, Sucursal, UnidadMedida } from "@prisma/client";
import * as XLSX from "xlsx";
import { buildApp } from "../app.js";
import { ENCABEZADOS, nombreDeArchivo, nombreDeHoja } from "../lib/export-consolidado.js";
import { loginToken, pedirCon } from "../test/helpers.js";

// Corre contra la BD de desarrollo con datos propios (prefijo en nombres y
// códigos). Los consolidados se crean directo en la BD sobre un período de
// prueba CERRADO: no se toca el período del seed.
const PREFIJO = "test-exp-";

const prisma = new PrismaClient();
let app: FastifyInstance;
let pedir: ReturnType<typeof pedirCon>;
let periodoId: string;
let rubroId: string;

const empiezaCon = { startsWith: PREFIJO };

async function limpiar() {
  await prisma.consolidado.deleteMany({ where: { periodo: { nombre: empiezaCon } } });
  await prisma.periodo.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { nombre: empiezaCon } });
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
}

async function producto(
  codigo: string,
  nombre: string,
  proveedorId: string | null,
  unidad: UnidadMedida = UnidadMedida.UN,
) {
  return prisma.producto.create({
    data: { codigo: `${PREFIJO}${codigo}`, nombre, rubroId, proveedorId, unidad },
  });
}

type ItemDePrueba = { productoId: string; cantidadTotal: number; cantidadEditada?: number; observacion?: string };

async function consolidado(items: ItemDePrueba[]) {
  return prisma.consolidado.create({ data: { periodoId, items: { create: items } } });
}

function exportar(id: string) {
  return pedir("GET", `/consolidados/${id}/export`);
}

// Filas de cada hoja del Excel descargado
function leerExcel(res: LightMyRequestResponse) {
  const libro = XLSX.read(res.rawPayload, { type: "buffer" });
  return {
    hojas: libro.SheetNames,
    filas: (hoja: string) => XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets[hoja], { header: 1 }),
  };
}

beforeEach(async () => {
  await limpiar();
  periodoId = (
    await prisma.periodo.create({
      data: { nombre: `${PREFIJO}Período Noviembre`, fechaApertura: new Date(), estado: EstadoPeriodo.CERRADO },
    })
  ).id;
  rubroId = (await prisma.rubro.create({ data: { nombre: `${PREFIJO}Rubro` } })).id;
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

describe("GET /consolidados/:id/export: acceso", () => {
  it("sin auth: 401", async () => {
    const { id } = await consolidado([]);
    expect((await app.inject({ method: "GET", url: `/consolidados/${id}/export` })).statusCode).toBe(401);
  });

  it("con auth de repositor: 403", async () => {
    const { id } = await consolidado([]);
    const repositor = await prisma.usuario.findFirstOrThrow({
      where: { rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_1, deletedAt: null, email: null },
      orderBy: { createdAt: "asc" },
    });
    const comoRepositor = pedirCon(
      app,
      await loginToken(app, { tipo: "repositor", usuarioId: repositor.id, pin: "1234" }),
    );

    expect((await comoRepositor("GET", `/consolidados/${id}/export`)).statusCode).toBe(403);
  });

  it("consolidado inexistente: 404", async () => {
    const res = await exportar("no-existe");

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: "Consolidado no encontrado" });
  });
});

describe("GET /consolidados/:id/export: contenido", () => {
  it("devuelve un .xlsx descargable con el nombre del período sin tildes", async () => {
    const { id } = await consolidado([]);

    const res = await exportar(id);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    const hoy = new Date().toISOString().slice(0, 10);
    expect(res.headers["content-disposition"]).toBe(
      `attachment; filename="consolidado-test-exp-Periodo-Noviembre-${hoy}.xlsx"`,
    );
  });

  it("consolidado vacío: una sola hoja VACÍO", async () => {
    const { id } = await consolidado([]);

    const excel = leerExcel(await exportar(id));

    expect(excel.hojas).toEqual(["VACÍO"]);
    expect(excel.filas("VACÍO")).toEqual([["El consolidado no tiene productos."]]);
  });

  it("ítems de 2 proveedores: una hoja por proveedor, usando cantidadEditada cuando existe", async () => {
    const norte = await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Norte` } });
    const sur = await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Sur` } });
    const lavandina = await producto("001", "Lavandina 1L", norte.id);
    const detergente = await producto("002", "Detergente 500ml", norte.id);
    const pan = await producto("003", "Pan francés", sur.id, UnidadMedida.KG);
    const { id } = await consolidado([
      { productoId: lavandina.id, cantidadTotal: 10 },
      { productoId: detergente.id, cantidadTotal: 4, cantidadEditada: 6, observacion: "media caja más" },
      { productoId: pan.id, cantidadTotal: 3.75 },
    ]);

    const excel = leerExcel(await exportar(id));

    expect(excel.hojas).toEqual([`${PREFIJO}Norte`, `${PREFIJO}Sur`]);
    expect(excel.filas(`${PREFIJO}Norte`)).toEqual([
      ENCABEZADOS,
      [`${PREFIJO}002`, "Detergente 500ml", "UN", 6, "media caja más"], // editada (6), no total (4)
      [`${PREFIJO}001`, "Lavandina 1L", "UN", 10, ""],
    ]);
    expect(excel.filas(`${PREFIJO}Sur`)).toEqual([ENCABEZADOS, [`${PREFIJO}003`, "Pan francés", "KG", 3.75, ""]]);
  });

  it("ítems sin proveedor: van a la hoja SIN ASIGNAR, al final", async () => {
    const norte = await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Norte` } });
    const conProveedor = await producto("010", "Con proveedor", norte.id);
    const sinProveedor = await producto("011", "Sin proveedor", null);
    const { id } = await consolidado([
      { productoId: sinProveedor.id, cantidadTotal: 2 },
      { productoId: conProveedor.id, cantidadTotal: 1 },
    ]);

    const excel = leerExcel(await exportar(id));

    expect(excel.hojas).toEqual([`${PREFIJO}Norte`, "SIN ASIGNAR"]);
    expect(excel.filas("SIN ASIGNAR")).toEqual([ENCABEZADOS, [`${PREFIJO}011`, "Sin proveedor", "UN", 2, ""]]);
  });
});

describe("nombres de hoja y de archivo", () => {
  it("nombreDeHoja: saca caracteres inválidos, corta a 31 y no repite (sin distinguir mayúsculas)", () => {
    const usados = new Set<string>();

    // \ / ? * [ ] : pasan a "_" y se corta en 31
    expect(nombreDeHoja("Distribuidora / Norte [S.A.]: Sucursal*?", usados)).toBe(
      "Distribuidora _ Norte _S.A.__ S",
    );
    // Dos nombres que coinciden en los primeros 31 caracteres
    expect(nombreDeHoja("Distribuidora Mayorista del Norte S.A.", usados)).toBe("Distribuidora Mayorista del Nor");
    expect(nombreDeHoja("Distribuidora Mayorista del Norte S.R.L.", usados)).toBe(
      "Distribuidora Mayorista del (2)",
    );
    expect(nombreDeHoja("MAYORISTA", usados)).toBe("MAYORISTA");
    expect(nombreDeHoja("mayorista", usados)).toBe("mayorista (2)");
    expect(nombreDeHoja("  ", usados)).toBe("Proveedor");
    for (const nombre of usados) expect(nombre.length).toBeLessThanOrEqual(31);
  });

  it("nombreDeArchivo: sin tildes ni caracteres raros", () => {
    expect(nombreDeArchivo("Período Octubre 2026", new Date("2026-10-27T12:00:00Z"))).toBe(
      "consolidado-Periodo-Octubre-2026-2026-10-27.xlsx",
    );
  });
});
