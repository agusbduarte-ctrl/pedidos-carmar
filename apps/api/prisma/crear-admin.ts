// Crea el primer usuario ADMIN de una instalación limpia.
// Uso: pnpm --filter api crear-admin
// Variables: ADMIN_EMAIL, ADMIN_PASSWORD (mínimo 10 caracteres), ADMIN_NOMBRE (opcional).
import { PrismaClient } from "@prisma/client";
import { crearAdmin, leerDatosAdmin } from "../src/lib/crear-admin.js";

const prisma = new PrismaClient();

async function main() {
  const datos = leerDatosAdmin(process.env);
  const admin = await crearAdmin(prisma, datos);
  console.log(`✅ Administrador creado: ${admin.nombre} (${admin.email})`);
}

main()
  .catch((e) => {
    console.error(`❌ ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
