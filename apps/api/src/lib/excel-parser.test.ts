import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { COLUMNAS, parsearCatalogo } from "./excel-parser.js";

// No usa el Excel real: cada test arma un .xlsx chico en una carpeta temporal
const carpeta = mkdtempSync(join(tmpdir(), "catalogo-test-"));
let n = 0;

const ENCABEZADO = [
  COLUMNAS.codigo,
  COLUMNAS.nombre,
  COLUMNAS.codigosBarras,
  COLUMNAS.rubroCodigo,
  COLUMNAS.rubroNombre,
];

function excel(filas: unknown[][], encabezado: string[] = ENCABEZADO): string {
  const hoja = XLSX.utils.aoa_to_sheet([encabezado, ...filas]);
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, "base de datos");
  const ruta = join(carpeta, `catalogo-${++n}.xlsx`);
  writeFileSync(ruta, XLSX.write(libro, { type: "buffer", bookType: "xlsx" }));
  return ruta;
}

afterAll(() => {
  rmSync(carpeta, { recursive: true, force: true });
});

describe("parsearCatalogo", () => {
  it("lee 5 filas con todos los campos (y limpia ceros a la izquierda)", () => {
    const ruta = excel([
      ["000000000000106", "MIEL STACUL 250G", "7790000000106", "73", "ENDULZANTES"],
      ["000000000119951", "CHOCOLATE KITKAT BCO 41.5G", 7891000249239, 94, "CHOCOLATES"],
      ["000000000100044", "TABLETA SHOT 35G", "77914217", "5", "GOLOSINAS"],
      ["UNI000000008937", "CERV.QUILMES CLAS.340ML", "7792798000017", "52", "CERVEZAS"],
      ["112393", "CAFE LA MORENITA CLASICO 250GR", "7790170901872", "74", "CAFE/CACAO/MALT"],
    ]);

    const filas = parsearCatalogo(ruta);

    expect(filas).toHaveLength(5);
    expect(filas[0]).toEqual({
      codigo: "106",
      nombre: "MIEL STACUL 250G",
      codigosBarras: ["7790000000106"],
      rubroCodigo: "73",
      rubroNombre: "ENDULZANTES",
    });
    // Valores numéricos en la celda: se leen crudos, sin notación científica
    expect(filas[1]).toMatchObject({ codigo: "119951", codigosBarras: ["7891000249239"], rubroCodigo: "94" });
    expect(filas.map((f) => f.codigo)).toEqual(["106", "119951", "100044", "UNI000000008937", "112393"]);
  });

  it("deduplica por código y se queda con la primera aparición", () => {
    const ruta = excel([
      ["000000000000106", "MIEL STACUL 250G", "7790000000106", "73", "ENDULZANTES"],
      ["000000000000106", "MIEL STACUL 250G", "7790000000106", "73", "ENDULZANTES"],
      ["106", "OTRO NOMBRE", "", "1", "OTRO"],
      ["000000000100044", "TABLETA SHOT 35G", "77914217", "5", "GOLOSINAS"],
    ]);

    const filas = parsearCatalogo(ruta);

    expect(filas.map((f) => f.codigo)).toEqual(["106", "100044"]);
    expect(filas[0].nombre).toBe("MIEL STACUL 250G");
  });

  it("separa los códigos de barras por coma, sin vacíos ni repetidos", () => {
    const ruta = excel([
      ["1", "VINO FC BARCELONA MALBEC 750ML", "7790314009754,7790314009778, 7790314010354", "51", "VINOS"],
      ["2", "PLUMERO 1U", "693429310,,6934293100243,693429310", "9", "VARIOS"],
      ["3", "SIN CODIGO DE BARRAS", "", "9", "VARIOS"],
    ]);

    const filas = parsearCatalogo(ruta);

    expect(filas[0].codigosBarras).toEqual(["7790314009754", "7790314009778", "7790314010354"]);
    expect(filas[1].codigosBarras).toEqual(["693429310", "6934293100243"]);
    expect(filas[2].codigosBarras).toEqual([]);
  });

  it("descarta filas sin código o sin nombre", () => {
    const ruta = excel([
      ["", "SIN CODIGO", "123", "1", "X"],
      ["10", "", "456", "1", "X"],
      ["11", "   ", "789", "1", "X"],
      ["12", "VALIDO", "", "1", "X"],
    ]);

    expect(parsearCatalogo(ruta).map((f) => f.codigo)).toEqual(["12"]);
  });

  it("si faltan columnas esperadas, falla con un error claro", () => {
    const ruta = excel([["1", "ALGO", "123"]], ["Cod. Art. Local", "Articulo", "Barras"]);

    expect(() => parsearCatalogo(ruta)).toThrow(
      "Faltan columnas en el Excel: Artículo, Códigos Barras, Cod. Rubro, Rubro",
    );
  });
});
