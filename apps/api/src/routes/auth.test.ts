import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import type { LightMyRequestResponse } from "fastify";
import { PrismaClient, Rol, Sucursal } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildApp } from "../app.js";
import { authenticate, requireRole } from "../lib/auth.js";

// Corre contra la BD de desarrollo: usa los datos del seed y solo crea/borra
// usuarios de prueba con emails en este dominio.
const DOMINIO_PRUEBA = "@carmar.test";

const prisma = new PrismaClient();
let app: FastifyInstance;

async function limpiarUsuariosDePrueba() {
  await prisma.usuario.deleteMany({ where: { email: { endsWith: DOMINIO_PRUEBA } } });
}

async function repositorDelSeed() {
  return prisma.usuario.findFirstOrThrow({
    where: { rol: Rol.REPOSITOR, sucursal: Sucursal.CARMAR_1, deletedAt: null },
  });
}

function cookieToken(res: LightMyRequestResponse) {
  return res.cookies.find((c) => c.name === "token");
}

function login(body: Record<string, string>, remoteAddress?: string) {
  return app.inject({ method: "POST", url: "/auth/login", payload: body, remoteAddress });
}

beforeEach(async () => {
  await limpiarUsuariosDePrueba();
  // App nueva por test: el rate limit y los bloqueos viven en memoria
  app = await buildApp(prisma, { logger: false });
});

afterEach(async () => {
  vi.restoreAllMocks();
  await app.close();
});

afterAll(async () => {
  await limpiarUsuariosDePrueba();
  await prisma.$disconnect();
});

describe("GET /auth/repositores", () => {
  it("devuelve los repositores de la sucursal, solo id/nombre/sucursal", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/repositores?sucursal=CARMAR_1" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0].nombre).toBe("Jorge Repositor");
    expect(Object.keys(body[0]).sort()).toEqual(["id", "nombre", "sucursal"]);
  });

  it("sin sucursal responde 400", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/repositores" });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "Sucursal inválida" });
  });
});

describe("POST /auth/login", () => {
  it("repositor con PIN correcto: 200 y cookie httpOnly", async () => {
    const repositor = await repositorDelSeed();

    const res = await login({ tipo: "repositor", usuarioId: repositor.id, pin: "1234" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      usuario: { id: repositor.id, nombre: "Jorge Repositor", rol: "REPOSITOR", sucursal: "CARMAR_1" },
    });
    const cookie = cookieToken(res);
    expect(cookie?.value).toBeTruthy();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("Lax");
    expect(cookie?.path).toBe("/");
  });

  it("repositor con PIN incorrecto: 401 genérico y sin cookie", async () => {
    const repositor = await repositorDelSeed();

    const res = await login({ tipo: "repositor", usuarioId: repositor.id, pin: "9999" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Credenciales inválidas" });
    expect(cookieToken(res)).toBeUndefined();
  });

  it("admin con email y password correctos: 200", async () => {
    const res = await login({ tipo: "email", email: "admin@carmar.com", password: "admin123" });

    expect(res.statusCode).toBe(200);
    expect(res.json().usuario).toMatchObject({ rol: "ADMIN", sucursal: null });
    expect(cookieToken(res)?.value).toBeTruthy();
  });

  it("email inexistente: 401 genérico", async () => {
    const res = await login({ tipo: "email", email: "nadie@carmar.com", password: "admin123" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Credenciales inválidas" });
  });
});

describe("POST /auth/login: fuerza bruta", () => {
  it("más de 5 intentos por minuto desde la misma IP: 429", async () => {
    const intento = () => login({ tipo: "email", email: "nadie@carmar.com", password: "x" });

    for (let i = 0; i < 5; i++) {
      expect((await intento()).statusCode).toBe(401);
    }
    expect((await intento()).statusCode).toBe(429);
  });

  it("más de 10 intentos por minuto al mismo usuario, desde IPs distintas: 429", async () => {
    const intento = (i: number) =>
      login({ tipo: "email", email: "admin@carmar.com", password: "x" }, `10.0.0.${i}`);

    for (let i = 1; i <= 10; i++) {
      expect((await intento(i)).statusCode).toBe(401);
    }
    const res = await intento(11);
    expect(res.statusCode).toBe(429);
    expect(res.json()).toEqual({ error: "Demasiados intentos, intentá en un minuto" });
  });

  it("10 PIN fallidos en 15 min bloquean al repositor 15 min, aun con el PIN correcto", async () => {
    let ahora = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => ahora);
    const repositor = await repositorDelSeed();
    let ip = 0;
    const intento = (pin: string) =>
      login({ tipo: "repositor", usuarioId: repositor.id, pin }, `10.0.1.${++ip}`);

    // 10 fallos repartidos en dos minutos, para no tocar el límite de 10/min
    for (let i = 0; i < 10; i++) {
      if (i === 5) ahora += 61_000;
      expect((await intento("9999")).statusCode).toBe(401);
    }

    ahora += 61_000;
    const bloqueado = await intento("1234");
    expect(bloqueado.statusCode).toBe(429);
    expect(bloqueado.json()).toEqual({ error: "Demasiados intentos, intentá en 15 min" });

    ahora += 15 * 60_000;
    expect((await intento("1234")).statusCode).toBe(200);
  });
});

describe("GET /auth/me", () => {
  it("sin cookie: 401", async () => {
    const res = await app.inject({ method: "GET", url: "/auth/me" });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "No autenticado" });
  });

  it("con cookie válida: 200 con el usuario", async () => {
    const loginRes = await login({ tipo: "email", email: "admin@carmar.com", password: "admin123" });
    const token = cookieToken(loginRes)!.value;

    const res = await app.inject({ method: "GET", url: "/auth/me", cookies: { token } });

    expect(res.statusCode).toBe(200);
    expect(res.json().usuario).toMatchObject({ nombre: "Admin", rol: "ADMIN", sucursal: null });
  });

  it("con token de un usuario desactivado después del login: 401", async () => {
    const usuario = await prisma.usuario.create({
      data: {
        email: `desactivado${DOMINIO_PRUEBA}`,
        passwordHash: await bcrypt.hash("prueba123", 10),
        nombre: "Usuario de prueba",
        rol: Rol.ENCARGADA,
      },
    });
    const loginRes = await login({ tipo: "email", email: usuario.email!, password: "prueba123" });
    expect(loginRes.statusCode).toBe(200);
    const token = cookieToken(loginRes)!.value;

    await prisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } });
    const res = await app.inject({ method: "GET", url: "/auth/me", cookies: { token } });

    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: "Usuario no válido" });
  });
});

describe("requireRole", () => {
  // Ninguna ruta real usa requireRole todavía: se registra una de prueba
  // antes del primer inject (la app todavía no está ready).
  beforeEach(() => {
    app.get("/solo-admin", { preHandler: [authenticate, requireRole(Rol.ADMIN)] }, async () => ({
      ok: true,
    }));
  });

  it("permite el acceso a un rol incluido: 200", async () => {
    const loginRes = await login({ tipo: "email", email: "admin@carmar.com", password: "admin123" });
    const token = cookieToken(loginRes)!.value;

    const res = await app.inject({ method: "GET", url: "/solo-admin", cookies: { token } });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("bloquea a un rol no incluido: 403", async () => {
    const repositor = await repositorDelSeed();
    const loginRes = await login({ tipo: "repositor", usuarioId: repositor.id, pin: "1234" });
    const token = cookieToken(loginRes)!.value;

    const res = await app.inject({ method: "GET", url: "/solo-admin", cookies: { token } });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ error: "No autorizado" });
  });
});
