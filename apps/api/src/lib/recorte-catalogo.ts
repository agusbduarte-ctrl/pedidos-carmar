import type { FilaCatalogo } from "./excel-parser.js";

export interface OpcionesRecorte {
  rubros?: string[];
  limitePorRubro?: number;
}

// Compara códigos sin espacios y sin ceros a la izquierda ("070" == "70")
export function normalizar(codigo: string): string {
  const limpio = codigo.trim().replace(/^0+/, "");
  return limpio === "" && codigo.trim() !== "" ? "0" : limpio;
}

// "70, 6,47" -> ["70", "6", "47"]. Devuelve undefined si no hay valor.
export function parsearListaRubros(valor: string | undefined): string[] | undefined {
  if (valor === undefined) return undefined;
  const lista = valor
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c !== "");
  return lista.length > 0 ? lista : undefined;
}

// Devuelve el entero positivo, undefined si no hay valor, o tira error en castellano.
export function parsearLimitePorRubro(valor: string | undefined): number | undefined {
  if (valor === undefined || valor.trim() === "") return undefined;
  const texto = valor.trim();
  const n = Number(texto);
  if (!/^\d+$/.test(texto) || !Number.isSafeInteger(n) || n <= 0) {
    throw new Error(
      `CATALOGO_LIMITE_POR_RUBRO tiene que ser un número entero mayor a 0 (recibí "${valor}").`,
    );
  }
  return n;
}

// Códigos pedidos que no aparecen en ninguna fila (para avisar por consola)
export function rubrosInexistentes(filas: FilaCatalogo[], rubros: string[]): string[] {
  const existentes = new Set(filas.map((f) => normalizar(f.rubroCodigo)));
  return rubros.filter((r) => !existentes.has(normalizar(r)));
}

export function recortarCatalogo(filas: FilaCatalogo[], opciones: OpcionesRecorte): FilaCatalogo[] {
  const { rubros, limitePorRubro } = opciones;
  const permitidos = rubros && rubros.length > 0 ? new Set(rubros.map(normalizar)) : null;
  const contador = new Map<string, number>();
  const resultado: FilaCatalogo[] = [];

  for (const fila of filas) {
    const rubro = normalizar(fila.rubroCodigo);
    if (permitidos && !permitidos.has(rubro)) continue;
    if (limitePorRubro !== undefined) {
      const usados = contador.get(rubro) ?? 0;
      if (usados >= limitePorRubro) continue;
      contador.set(rubro, usados + 1);
    }
    resultado.push(fila);
  }
  return resultado;
}
