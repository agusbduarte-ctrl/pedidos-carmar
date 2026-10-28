import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { crearAdmin, leerDatosAdmin } from "./crear-admin.js";

const PREFIJO = "test-admin-";
const EMAIL = `${PREFIJO}uno@example.com`;
const prisma = new PrismaClient();

async function limpiar() {
  await prisma.usuario.deleteMany({ where: { email: { startsWith: PREFIJO } } });
}

beforeEach(limpiar);
afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

describe("leerDatosAdmin", () => {
  it("usa Administrador por defecto y normaliza el email", () => {
    const d = leerDatosAdmin({ ADMIN_EMAIL: "  Foo@Example.com ", ADMIN_PASSWORD: "1234567890" });
    expect(d).toEqual({ email: "foo@example.com", password: "1234567890", nombre: "Administrador" });
  });

  it("exige email y contraseña", () => {
    expect(() => leerDatosAdmin({ ADMIN_PASSWORD: "1234567890" })).toThrow(/ADMIN_EMAIL/);
    expect(() => leerDatosAdmin({ ADMIN_EMAIL: "a@b.com" })).toThrow(/ADMIN_PASSWORD/);
  });

  it("rechaza contraseñas cortas sin mostrarla", () => {
    expect.assertions(2);
    try {
      leerDatosAdmin({ ADMIN_EMAIL: "a@b.com", ADMIN_PASSWORD: "corta123" });
    } catch (e) {
      expect((e as Error).message).toMatch(/al menos 10/);
      expect((e as Error).message).not.toContain("corta123");
    }
  });
});

describe("crearAdmin", () => {
  it("crea un ADMIN con la contraseña hasheada", async () => {
    const creado = await crearAdmin(prisma, { email: EMAIL, password: "clave-larga-123", nombre: "Test Admin" });
    expect(creado.rol).toBe("ADMIN");
    const u = await prisma.usuario.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(u.passwordHash).not.toBe("clave-larga-123");
    expect(await bcrypt.compare("clave-larga-123", u.passwordHash!)).toBe(true);
    expect(u.activo).toBe(true);
  });

  it("no pisa un usuario existente, sin distinguir mayúsculas", async () => {
    await crearAdmin(prisma, { email: EMAIL, password: "clave-larga-123", nombre: "Original" });
    await expect(
      crearAdmin(prisma, { email: EMAIL.toUpperCase(), password: "otra-clave-456", nombre: "Otro" }),
    ).rejects.toThrow(/Ya existe un usuario/);
    const u = await prisma.usuario.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(u.nombre).toBe("Original");
    expect(await bcrypt.compare("clave-larga-123", u.passwordHash!)).toBe(true);
  });
});
