import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { asignarUnidad, leerRubros, leerUnidad } from "./asignar-unidad.js";

const PREFIJO = "test-unid-";
const prisma = new PrismaClient();
const empiezaCon = { startsWith: PREFIJO };

async function limpiar() {
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } });
  await prisma.rubro.deleteMany({ where: { OR: [{ nombre: empiezaCon }, { codigo: empiezaCon }] } });
}

async function unidades() {
  const ps = await prisma.producto.findMany({ where: { codigo: empiezaCon }, orderBy: { codigo: "asc" } });
  return Object.fromEntries(ps.map((p) => [p.codigo.slice(PREFIJO.length), p.unidad]));
}

beforeEach(async () => {
  await limpiar();
  const r1 = await prisma.rubro.create({ data: { codigo: `${PREFIJO}R1`, nombre: `${PREFIJO}Uno` } });
  const r2 = await prisma.rubro.create({ data: { codigo: `${PREFIJO}R2`, nombre: `${PREFIJO}Dos` } });
  const p = (n: string, rubroId: string, extra = {}) =>
    ({ codigo: `${PREFIJO}${n}`, nombre: `${PREFIJO}${n}`, rubroId, ...extra });
  await prisma.producto.createMany({
    data: [
      p("a", r1.id),
      p("b", r1.id, { unidad: "KG" }),
      p("c", r1.id, { deletedAt: new Date() }),
      p("d", r2.id),
    ],
  });
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("leerUnidad / leerRubros", () => {
  it("valida contra el enum", () => {
    expect(leerUnidad(" kg ")).toBe("KG");
    expect(() => leerUnidad(undefined)).toThrow(/Falta UNIDAD/);
    expect(() => leerUnidad("BOLSA")).toThrow(/no es válida/);
  });
  it("exige rubros", () => {
    expect(leerRubros("1, 02")).toEqual(["1", "02"]);
    expect(() => leerRubros("")).toThrow(/Falta RUBROS/);
  });
});

describe("asignarUnidad", () => {
  it("simulacro: cuenta y no cambia nada", async () => {
    const antes = await unidades();
    const r = await asignarUnidad(prisma, { unidad: "KG", rubros: [`${PREFIJO}R1`] });
    expect(r.aplicado).toBe(false);
    expect(r.porRubro).toHaveLength(1);
    expect(r.porRubro[0]).toMatchObject({ cambian: 1, yaTienen: 1 }); // ignora el borrado
    expect(await unidades()).toEqual(antes);
  });

  it("aplicar: cambia solo los rubros pedidos y no toca borrados", async () => {
    const r = await asignarUnidad(prisma, { unidad: "KG", rubros: [`${PREFIJO}R1`], aplicar: true });
    expect(r.actualizados).toBe(1);
    expect(await unidades()).toEqual({ a: "KG", b: "KG", c: "UN", d: "UN" });
  });

  it("avisa rubros inexistentes", async () => {
    const r = await asignarUnidad(prisma, { unidad: "KG", rubros: [`${PREFIJO}R2`, `${PREFIJO}nada`] });
    expect(r.inexistentes).toEqual([`${PREFIJO}nada`]);
    expect(r.porRubro).toHaveLength(1);
  });
});
