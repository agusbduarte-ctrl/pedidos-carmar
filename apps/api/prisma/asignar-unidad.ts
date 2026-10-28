// Cambia la unidad de medida de los productos de ciertos rubros.
// Uso: pnpm --filter api asignar-unidad
// Variables: UNIDAD (UN, CAJA, PACK, KG, LT), RUBROS (códigos separados por coma), APLICAR=1 para aplicar.
// Sin APLICAR=1 es solo un simulacro: no cambia nada.
import { PrismaClient } from "@prisma/client";
import { asignarUnidad, leerRubros, leerUnidad } from "../src/lib/asignar-unidad.js";

const prisma = new PrismaClient();

async function main() {
  const unidad = leerUnidad(process.env.UNIDAD);
  const rubros = leerRubros(process.env.RUBROS);
  const aplicar = process.env.APLICAR === "1";

  console.log(aplicar ? `Aplicando unidad ${unidad}...` : `SIMULACRO (no se cambia nada). Unidad ${unidad}.`);
  const r = await asignarUnidad(prisma, { unidad, rubros, aplicar });

  for (const x of r.porRubro) {
    console.log(`   Rubro ${x.codigo} (${x.nombre}): ${x.cambian} cambian, ${x.yaTienen} ya tienen ${unidad}`);
  }
  if (r.inexistentes.length > 0) {
    console.warn(`⚠️  Rubros que no existen en la base: ${r.inexistentes.join(", ")}`);
  }
  if (aplicar) {
    console.log(`\n✅ ${r.actualizados} productos actualizados.`);
  } else {
    console.log("\nNo se cambió nada. Para aplicar los cambios, correr con APLICAR=1.");
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
