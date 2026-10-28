import bcrypt from "bcryptjs";
import type { PrismaClient } from "@prisma/client";

export const LARGO_MINIMO_PASSWORD = 10;

export interface DatosAdmin {
  email: string;
  password: string;
  nombre: string;
}

// Valida las variables de entorno (ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NOMBRE). Nunca incluye la contraseña en los errores.
export function leerDatosAdmin(env: Record<string, string | undefined>): DatosAdmin {
  const email = (env.ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = env.ADMIN_PASSWORD ?? "";
  const nombre = (env.ADMIN_NOMBRE ?? "").trim() || "Administrador";

  if (email === "") throw new Error("Falta ADMIN_EMAIL (el email del administrador).");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`ADMIN_EMAIL no parece un email válido ("${email}").`);
  }
  if (password === "") throw new Error("Falta ADMIN_PASSWORD (la contraseña del administrador).");
  if (password.length < LARGO_MINIMO_PASSWORD) {
    throw new Error(`ADMIN_PASSWORD es muy corta: tiene que tener al menos ${LARGO_MINIMO_PASSWORD} caracteres.`);
  }
  return { email, password, nombre };
}

// Crea un usuario ADMIN. No pisa ni borra nada: si el email ya existe, tira error.
export async function crearAdmin(prisma: PrismaClient, datos: DatosAdmin) {
  const email = datos.email.trim().toLowerCase();
  const existente = await prisma.usuario.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existente) {
    throw new Error(`Ya existe un usuario con el email ${email}. No se hizo ningún cambio.`);
  }
  const passwordHash = await bcrypt.hash(datos.password, 10);
  return prisma.usuario.create({
    data: { email, passwordHash, nombre: datos.nombre, rol: "ADMIN", activo: true },
    select: { id: true, email: true, nombre: true, rol: true },
  });
}
