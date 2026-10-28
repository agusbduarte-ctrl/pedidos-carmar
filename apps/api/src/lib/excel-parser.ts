import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";

export interface FilaCatalogo {
  codigo: string;
  nombre: string;
  codigosBarras: string[];
  rubroCodigo: string;
  rubroNombre: string;
}

// Encabezados del export "BASE DE DATOS DE ARTICULOS" del sistema de Carmar
export const COLUMNAS = {
  codigo: "Cod. Art. Local",
  nombre: "Artículo",
  codigosBarras: "Códigos Barras",
  rubroCodigo: "Cod. Rubro",
  rubroNombre: "Rubro",
} as const;

function texto(valor: unknown): string {
  return valor === null || valor === undefined ? "" : String(valor).trim();
}

// "000000000119951" -> "119951"; los códigos con prefijo (UNI…) no cambian
function sinCerosIzquierda(codigo: string): string {
  return codigo.replace(/^0+(?=.)/, "");
}

function separarCodigosBarras(valor: unknown): string[] {
  const codigos = texto(valor)
    .split(",")
    .map((c) => c.trim())
    .filter((c) => c.length > 0);
  return [...new Set(codigos)];
}

export function parsearCatalogo(rutaArchivo: string): FilaCatalogo[] {
  // Se lee el archivo a mano (en vez de XLSX.readFile) para que funcione igual
  // con el build CommonJS (tsx) y con el ESM (vitest), que no trae fs.
  const libro = XLSX.read(readFileSync(rutaArchivo), { type: "buffer" });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  if (!hoja) throw new Error(`El archivo ${rutaArchivo} no tiene hojas`);

  // raw: true -> valores crudos (un código de barras numérico no pasa a "7.79E+12")
  const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(hoja, { raw: true, defval: "" });

  const encabezados = new Set(Object.keys(filas[0] ?? {}));
  const faltantes = Object.values(COLUMNAS).filter((c) => !encabezados.has(c));
  if (filas.length > 0 && faltantes.length > 0) {
    throw new Error(`Faltan columnas en el Excel: ${faltantes.join(", ")}`);
  }

  // Deduplicar por código: queda la primera aparición
  const porCodigo = new Map<string, FilaCatalogo>();
  for (const fila of filas) {
    const codigo = sinCerosIzquierda(texto(fila[COLUMNAS.codigo]));
    const nombre = texto(fila[COLUMNAS.nombre]);
    if (!codigo || !nombre || porCodigo.has(codigo)) continue;

    porCodigo.set(codigo, {
      codigo,
      nombre,
      codigosBarras: separarCodigosBarras(fila[COLUMNAS.codigosBarras]),
      rubroCodigo: texto(fila[COLUMNAS.rubroCodigo]),
      rubroNombre: texto(fila[COLUMNAS.rubroNombre]),
    });
  }

  return [...porCodigo.values()];
}
