import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { diaAR, historialQuery, lunesDe, resolverFiltros, tituloPedido, type FilaHistorial } from "./historial.js";
import { armarLibro, filaDetalle, serieExcel } from "./export-historial.js";

const resolver = (q: object, ahora?: Date) => resolverFiltros(historialQuery.parse(q), ahora);

describe("fechas en hora de Argentina", () => {
  it("diaAR corta el día a las 03:00 UTC", () => {
    expect(diaAR(new Date("2026-03-10T02:59:59Z"))).toBe("2026-03-09");
    expect(diaAR(new Date("2026-03-10T03:00:00Z"))).toBe("2026-03-10");
  });

  it("lunesDe y serieExcel", () => {
    expect(lunesDe("2026-03-10")).toBe("2026-03-09"); // martes
    expect(lunesDe("2026-03-09")).toBe("2026-03-09"); // lunes
    expect(lunesDe("2026-03-15")).toBe("2026-03-09"); // domingo
    expect(serieExcel("1900-03-01")).toBe(61);
    expect(serieExcel("2026-03-10")).toBe(46091);
  });
});

describe("resolverFiltros", () => {
  it("por defecto: 30 días incluyendo hoy (hoy según Argentina)", () => {
    const r = resolver({}, new Date("2026-03-10T01:00:00Z")); // 09/03 22:00 AR
    expect(r.ok && [r.filtros.desde, r.filtros.hasta]).toEqual(["2026-02-08", "2026-03-09"]);
    expect(r.ok && r.filtros.estado).toBe("APROBADO");
  });

  it("hasta es inclusivo: el límite es el inicio del día siguiente en AR", () => {
    const r = resolver({ desde: "2026-03-10", hasta: "2026-03-10" });
    expect(r.ok && r.filtros.desdeInstante.toISOString()).toBe("2026-03-10T03:00:00.000Z");
    expect(r.ok && r.filtros.hastaExclusivo.toISOString()).toBe("2026-03-11T03:00:00.000Z");
  });

  it("rechaza desde > hasta y rangos de más de 400 días", () => {
    expect(resolver({ desde: "2026-03-10", hasta: "2026-03-09" }).ok).toBe(false);
    expect(resolver({ desde: "2025-02-01", hasta: "2026-03-07" }).ok).toBe(true); // 400 días
    expect(resolver({ desde: "2025-02-01", hasta: "2026-03-08" }).ok).toBe(false); // 401
  });

  it("q vacío se ignora", () => {
    const r = resolver({ q: "   " });
    expect(r.ok && r.filtros.q).toBeUndefined();
  });
});

describe("tituloPedido", () => {
  const fecha = new Date("2026-03-10T15:00:00Z");
  it("usa el título, o lo arma", () => {
    expect(tituloPedido({ titulo: "Mío", fechaEnvio: fecha, proveedor: null })).toBe("Mío");
    expect(tituloPedido({ titulo: null, fechaEnvio: fecha, proveedor: { nombre: "Arcor" } })).toBe("Arcor – 10/03");
    expect(tituloPedido({ titulo: null, fechaEnvio: fecha, proveedor: null })).toBe("Pedido del 10/03");
  });
});

const fila = (extra: Partial<FilaHistorial> = {}): FilaHistorial => ({
  itemId: "i1",
  pedidoId: "p1",
  titulo: "Arcor – 10/03",
  fechaEnvio: new Date("2026-03-11T02:30:00Z"), // 10/03 AR
  fechaAprobacion: null,
  estado: "ENVIADO",
  sucursal: "CARMAR_1",
  repositor: { id: "u1", nombre: "Ana" },
  proveedor: null,
  producto: { id: "x", codigo: "A1", nombre: "Galletitas", unidad: "UN", rubro: { id: "r", nombre: "Almacén" } },
  cantidad: "7.00",
  cantidadDeposito: null,
  cantidadComprada: "7.00",
  ...extra,
});

describe("armarLibro", () => {
  it("fila de detalle: fechas Excel, textos y números", () => {
    expect(filaDetalle(fila())).toEqual([
      46091, 46090, "2026-03", "Carmar 1", "Ana", "Sin proveedor", "Arcor – 10/03", "A1", "Galletitas",
      "Almacén", "UN", 7, 0, 7, "Enviado", "",
    ]);
  });

  it("genera dos hojas con encabezados, números y formato de fecha", () => {
    const buffer = armarLibro(
      [fila(), fila({ estado: "DEVUELTO", sucursal: "CARMAR_2", cantidadDeposito: "2.00", cantidadComprada: "5.00" })],
      [{ producto: { id: "x", codigo: "A1", nombre: "Galletitas", unidad: "UN" }, veces: 2, pedido: "14", deposito: "2", comprado: "12" }],
    );
    const libro = XLSX.read(buffer, { type: "buffer" });
    expect(libro.SheetNames).toEqual(["Detalle", "Resumen"]);
    const detalle = libro.Sheets.Detalle;
    expect(detalle.A2.t).toBe("n");
    expect(detalle.A2.v).toBe(46091);
    expect(detalle.L2.v).toBe(7);
    expect(detalle.M3.v).toBe(2);
    expect(detalle.N3.v).toBe(5);
    expect(detalle.O3.v).toBe("Devuelto");
    expect(XLSX.utils.sheet_to_json<unknown[]>(libro.Sheets.Resumen, { header: 1 })[1]).toEqual([
      "A1", "Galletitas", "UN", 2, 14, 2, 12,
    ]);
  });
});
