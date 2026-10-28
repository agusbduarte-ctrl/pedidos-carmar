import { describe, expect, it } from "vitest";
import type { FilaCatalogo } from "./excel-parser.js";
import {
  parsearLimitePorRubro,
  parsearListaRubros,
  recortarCatalogo,
  rubrosInexistentes,
} from "./recorte-catalogo.js";

function fila(codigo: string, rubroCodigo: string): FilaCatalogo {
  return { codigo, nombre: `ART ${codigo}`, codigosBarras: [], rubroCodigo, rubroNombre: `R${rubroCodigo}` };
}

const FILAS = [fila("1", "70"), fila("2", "6"), fila("3", "70"), fila("4", "47"), fila("5", "70"), fila("6", "6")];
const codigos = (fs: FilaCatalogo[]) => fs.map((f) => f.codigo);

describe("recortarCatalogo", () => {
  it("sin opciones devuelve todo", () => {
    expect(recortarCatalogo(FILAS, {})).toEqual(FILAS);
  });

  it("filtra por rubros ignorando ceros a la izquierda y espacios", () => {
    expect(codigos(recortarCatalogo(FILAS, { rubros: ["070", " 6 "] }))).toEqual(["1", "2", "3", "5", "6"]);
  });

  it("toma las primeras N filas de cada rubro, en orden", () => {
    expect(codigos(recortarCatalogo(FILAS, { limitePorRubro: 2 }))).toEqual(["1", "2", "3", "4", "6"]);
  });

  it("combina rubros y límite", () => {
    expect(codigos(recortarCatalogo(FILAS, { rubros: ["70"], limitePorRubro: 1 }))).toEqual(["1"]);
  });
});

describe("rubrosInexistentes", () => {
  it("lista los códigos que no están en el Excel", () => {
    expect(rubrosInexistentes(FILAS, ["070", "99", "5"])).toEqual(["99", "5"]);
  });
});

describe("parsearListaRubros", () => {
  it("separa por coma y limpia espacios", () => {
    expect(parsearListaRubros("70, 6,,47 ")).toEqual(["70", "6", "47"]);
  });
  it("sin valor devuelve undefined", () => {
    expect(parsearListaRubros(undefined)).toBeUndefined();
    expect(parsearListaRubros("  ")).toBeUndefined();
  });
});

describe("parsearLimitePorRubro", () => {
  it("acepta enteros positivos", () => {
    expect(parsearLimitePorRubro("5")).toBe(5);
    expect(parsearLimitePorRubro(undefined)).toBeUndefined();
  });
  it.each(["0", "-3", "2.5", "abc"])("rechaza %s con mensaje claro", (v) => {
    expect(() => parsearLimitePorRubro(v)).toThrow(/entero mayor a 0/);
  });
});
