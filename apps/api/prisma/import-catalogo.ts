// Importa el catálogo de artículos exportado del sistema de Carmar.
// Uso: pnpm --filter api import-catalogo
// Lee la ruta del Excel de CATALOGO_XLSX_PATH (en apps/api/.env), relativa a la
// raíz del repo o absoluta. Es idempotente: se puede correr las veces que haga falta.
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { PrismaClient } from "@prisma/client";
import { parsearCatalogo } from "../src/lib/excel-parser.js";
import { importarCatalogo } from "../src/lib/importar-catalogo.js";

const RAIZ_REPO = resolve(__dirname, "../../..");
const MAX_AVISOS_EN_PANTALLA = 20;

const prisma = new PrismaClient();

function rutaDelExcel(): string {
  const valor = process.env.CATALOGO_XLSX_PATH;
  if (!valor) {
    throw new Error(
      "Falta CATALOGO_XLSX_PATH. Agregala a apps/api/.env, por ejemplo:\n" +
        "  CATALOGO_XLSX_PATH=./data/catalogo.xlsx   (relativa a la raíz del repo)",
    );
  }
  const ruta = isAbsolute(valor) ? valor : resolve(RAIZ_REPO, valor);
  if (!existsSync(ruta)) {
    throw new Error(`No existe el archivo ${ruta} (CATALOGO_XLSX_PATH=${valor})`);
  }
  return ruta;
}

async function main() {
  const ruta = rutaDelExcel();
  console.log(`📄 Leyendo ${ruta}...`);
  const filas = parsearCatalogo(ruta);
  console.log(`   ${filas.length} artículos únicos`);

  const inicio = Date.now();
  const r = await importarCatalogo(prisma, filas, { log: (m) => console.log(`   ${m}`) });
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(`\n✅ Importación terminada en ${segundos} s`);
  console.log(`   Rubros:     ${r.rubros.creados} creados, ${r.rubros.actualizados} actualizados, ${r.rubros.restaurados} restaurados`);
  console.log(
    `   Productos:  ${r.productos.creados} creados, ${r.productos.actualizados} actualizados, ` +
      `${r.productos.sinCambios} sin cambios, ${r.productos.omitidosBorrados} omitidos (borrados por un admin)`,
  );
  console.log(`   Cód. barras: ${r.codigosBarras.creados} creados, ${r.codigosBarras.omitidos} omitidos`);

  if (r.avisos.length > 0) {
    console.log(`\n⚠️  ${r.avisos.length} avisos:`);
    for (const aviso of r.avisos.slice(0, MAX_AVISOS_EN_PANTALLA)) console.log(`   - ${aviso}`);
    if (r.avisos.length > MAX_AVISOS_EN_PANTALLA) {
      console.log(`   ... y ${r.avisos.length - MAX_AVISOS_EN_PANTALLA} más`);
    }
  }
  if (r.errores.length > 0) {
    console.error(`\n❌ ${r.errores.length} lotes fallaron (los demás se importaron; se puede volver a correr):`);
    for (const error of r.errores) console.error(`   - ${error}`);
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(`❌ ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
