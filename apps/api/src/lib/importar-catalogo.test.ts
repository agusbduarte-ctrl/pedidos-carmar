import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import type { FilaCatalogo } from "./excel-parser.js";
import { importarCatalogo } from "./importar-catalogo.js";

// Corre contra la BD de desarrollo con datos propios (prefijo en códigos y
// nombres) y un proveedor "sin asignar" propio, para no tocar el real.
const PREFIJO = "test-cat-";
const SIN_ASIGNAR = `${PREFIJO}SIN ASIGNAR`;

const prisma = new PrismaClient();
const silencio = { proveedorSinAsignar: SIN_ASIGNAR, tamanoLote: 2 }; // lotes chicos: prueba el corte por lotes

const empiezaCon = { startsWith: PREFIJO };

async function limpiar() {
  await prisma.producto.deleteMany({ where: { codigo: empiezaCon } }); // códigos de barras en cascada
  await prisma.rubro.deleteMany({ where: { OR: [{ nombre: empiezaCon }, { codigo: empiezaCon }] } });
  await prisma.proveedor.deleteMany({ where: { nombre: empiezaCon } });
}

function fila(n: string, extra: Partial<FilaCatalogo> = {}): FilaCatalogo {
  return {
    codigo: `${PREFIJO}${n}`,
    nombre: `${PREFIJO}Producto ${n}`,
    codigosBarras: [`${PREFIJO}CB${n}`],
    rubroCodigo: `${PREFIJO}R1`,
    rubroNombre: `${PREFIJO}Rubro uno`,
    ...extra,
  };
}

const CATALOGO: FilaCatalogo[] = [
  fila("001"),
  fila("002", { codigosBarras: [`${PREFIJO}CB002a`, `${PREFIJO}CB002b`] }),
  fila("003", { codigosBarras: [] }),
  fila("004", { rubroCodigo: `${PREFIJO}R2`, rubroNombre: `${PREFIJO}Rubro dos` }),
  fila("005", { rubroCodigo: `${PREFIJO}R2`, rubroNombre: `${PREFIJO}Rubro dos` }),
];

beforeEach(limpiar);

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

async function productosDePrueba() {
  return prisma.producto.findMany({
    where: { codigo: empiezaCon },
    include: { rubro: true, proveedor: true, codigosBarras: true },
    orderBy: { codigo: "asc" },
  });
}

describe("importarCatalogo", () => {
  it("crea rubros con código, productos (UN, activos, proveedor SIN ASIGNAR) y códigos de barras", async () => {
    const r = await importarCatalogo(prisma, CATALOGO, silencio);

    expect(r).toMatchObject({
      rubros: { creados: 2, actualizados: 0, restaurados: 0 },
      productos: { creados: 5, actualizados: 0, sinCambios: 0, omitidosBorrados: 0 },
      codigosBarras: { creados: 5, omitidos: 0 },
      errores: [],
    });
    const productos = await productosDePrueba();
    expect(productos).toHaveLength(5);
    expect(productos.every((p) => p.unidad === "UN" && p.activo && p.proveedor?.nombre === SIN_ASIGNAR)).toBe(true);
    expect(productos[3].rubro).toMatchObject({ codigo: `${PREFIJO}R2`, nombre: `${PREFIJO}Rubro dos` });
    expect(productos[1].codigosBarras.map((c) => c.codigo).sort()).toEqual([`${PREFIJO}CB002a`, `${PREFIJO}CB002b`]);
  });

  it("es idempotente: la segunda corrida no crea ni duplica nada", async () => {
    await importarCatalogo(prisma, CATALOGO, silencio);

    const r = await importarCatalogo(prisma, CATALOGO, silencio);

    expect(r).toMatchObject({
      rubros: { creados: 0, actualizados: 0 },
      productos: { creados: 0, actualizados: 0, sinCambios: 5 },
      codigosBarras: { creados: 0, omitidos: 0 },
      avisos: [],
      errores: [],
    });
    expect(await prisma.producto.count({ where: { codigo: empiezaCon } })).toBe(5);
    expect(await prisma.codigoBarras.count({ where: { codigo: empiezaCon } })).toBe(5);
    expect(await prisma.proveedor.count({ where: { nombre: SIN_ASIGNAR } })).toBe(1);
  });

  it("actualiza nombre y rubro; no pisa un proveedor real y completa uno vacío", async () => {
    await importarCatalogo(prisma, CATALOGO, silencio);
    const real = await prisma.proveedor.create({ data: { nombre: `${PREFIJO}Proveedor real` } });
    await prisma.producto.update({ where: { codigo: `${PREFIJO}001` }, data: { proveedorId: real.id } });
    await prisma.producto.update({ where: { codigo: `${PREFIJO}003` }, data: { proveedorId: null } });

    const cambiado = CATALOGO.map((f) =>
      f.codigo === `${PREFIJO}001`
        ? { ...f, nombre: `${PREFIJO}Nombre nuevo`, rubroCodigo: `${PREFIJO}R2`, rubroNombre: `${PREFIJO}Rubro dos` }
        : f,
    );
    const r = await importarCatalogo(prisma, cambiado, silencio);

    expect(r.productos).toMatchObject({ creados: 0, actualizados: 2, sinCambios: 3 });
    const [p1, , p3] = await productosDePrueba();
    expect(p1).toMatchObject({ nombre: `${PREFIJO}Nombre nuevo`, proveedorId: real.id });
    expect(p1.rubro.codigo).toBe(`${PREFIJO}R2`);
    expect(p3.proveedor?.nombre).toBe(SIN_ASIGNAR);
  });

  it("omite códigos de barras de otro producto y productos borrados por un admin", async () => {
    await importarCatalogo(prisma, CATALOGO, silencio);
    await prisma.producto.update({ where: { codigo: `${PREFIJO}005` }, data: { deletedAt: new Date() } });
    const conCbAjeno = CATALOGO.map((f) =>
      f.codigo === `${PREFIJO}003` ? { ...f, codigosBarras: [`${PREFIJO}CB001`] } : f,
    );

    const r = await importarCatalogo(prisma, conCbAjeno, silencio);

    expect(r.productos.omitidosBorrados).toBe(1);
    expect(r.codigosBarras).toEqual({ creados: 0, omitidos: 1 });
    expect(r.avisos).toEqual([
      `Código de barras ${PREFIJO}CB001 (artículo ${PREFIJO}003): ya pertenece a otro producto; se omite`,
    ]);
    const p5 = await prisma.producto.findUniqueOrThrow({ where: { codigo: `${PREFIJO}005` } });
    expect(p5.deletedAt).not.toBeNull();
  });

  it("reutiliza un rubro existente con el mismo nombre (le asigna el código) y restaura uno borrado", async () => {
    const existente = await prisma.rubro.create({ data: { nombre: `${PREFIJO}RUBRO UNO` } });
    const borrado = await prisma.rubro.create({
      data: { codigo: `${PREFIJO}R2`, nombre: `${PREFIJO}Rubro dos`, deletedAt: new Date() },
    });

    const r = await importarCatalogo(prisma, CATALOGO, silencio);

    expect(r.rubros).toEqual({ creados: 0, actualizados: 1, restaurados: 1 });
    expect(await prisma.rubro.findUniqueOrThrow({ where: { id: existente.id } })).toMatchObject({
      codigo: `${PREFIJO}R1`,
      nombre: `${PREFIJO}RUBRO UNO`,
    });
    expect((await prisma.rubro.findUniqueOrThrow({ where: { id: borrado.id } })).deletedAt).toBeNull();
    expect(await prisma.rubro.count({ where: { nombre: empiezaCon } })).toBe(2);
  });
});
