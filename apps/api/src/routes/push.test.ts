import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { PrismaClient, Rol } from "@prisma/client";
import { buildApp } from "../app.js";
import { loginToken, pedirCon } from "../test/helpers.js";

const PREFIJO = "test-push-";
const EMAIL_A = "test-push-a@carmar.test";
const EMAIL_B = "test-push-b@carmar.test";
const PASSWORD = "push-test-123";
const URL_A = "https://push.test/test-push-a";
const URL_B = "https://push.test/test-push-b";
const KEYS = { p256dh: "clave-p256dh", auth: "clave-auth" };

const prisma = new PrismaClient();
let app: FastifyInstance;
let pedirA: ReturnType<typeof pedirCon>;
let idA: string;
let idB: string;

async function limpiar() {
  await prisma.suscripcionPush.deleteMany({ where: { endpoint: { startsWith: "https://push.test/test-push-" } } });
  await prisma.usuario.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
}

beforeEach(async () => {
  await limpiar();
  const passwordHash = await bcrypt.hash(PASSWORD, 4);
  idA = (
    await prisma.usuario.create({
      data: { nombre: `${PREFIJO}A`, rol: Rol.ENCARGADA, email: EMAIL_A, passwordHash },
    })
  ).id;
  idB = (
    await prisma.usuario.create({
      data: { nombre: `${PREFIJO}B`, rol: Rol.DEPOSITO, email: EMAIL_B, passwordHash },
    })
  ).id;
});

afterEach(async () => {
  try {
    await app?.close();
  } finally {
    await limpiar();
  }
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

async function iniciar(opciones: Parameters<typeof buildApp>[1] = {}) {
  app = await buildApp(prisma, { logger: false, ...opciones });
  pedirA = pedirCon(app, await loginToken(app, { tipo: "email", email: EMAIL_A, password: PASSWORD }));
}

describe("GET /push/clave-publica", () => {
  it("401 sin sesión", async () => {
    await iniciar();
    const res = await pedirCon(app)("GET", "/push/clave-publica");
    expect(res.statusCode).toBe(401);
  });

  it("devuelve null si el push está desactivado", async () => {
    const guardadas = { ...process.env };
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
    delete process.env.VAPID_SUBJECT;
    try {
      await iniciar();
    } finally {
      process.env = guardadas;
    }
    const res = await pedirA("GET", "/push/clave-publica");
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ data: { clave: null } });
  });

  it("devuelve la clave si el push está activo", async () => {
    await iniciar({ emisorPush: async () => {}, clavePublicaPush: "clave-de-prueba" });
    const res = await pedirA("GET", "/push/clave-publica");
    expect(res.json()).toEqual({ data: { clave: "clave-de-prueba" } });
  });
});

describe("POST /push/suscripciones", () => {
  it("401 sin sesión", async () => {
    await iniciar();
    const res = await pedirCon(app)("POST", "/push/suscripciones", { endpoint: URL_A, keys: KEYS });
    expect(res.statusCode).toBe(401);
  });

  it("400 con body inválido", async () => {
    await iniciar();
    expect((await pedirA("POST", "/push/suscripciones", {})).statusCode).toBe(400);
    expect((await pedirA("POST", "/push/suscripciones", { endpoint: "no-es-url", keys: KEYS })).statusCode).toBe(400);
    expect((await pedirA("POST", "/push/suscripciones", { endpoint: URL_A, keys: { p256dh: "x" } })).statusCode).toBe(400);
  });

  it("201 y guarda la suscripción para el usuario actual", async () => {
    await iniciar();
    const res = await pedirA("POST", "/push/suscripciones", { endpoint: URL_A, keys: KEYS });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ data: { ok: true } });
    const s = await prisma.suscripcionPush.findUniqueOrThrow({ where: { endpoint: URL_A } });
    expect(s).toMatchObject({ usuarioId: idA, p256dh: KEYS.p256dh, auth: KEYS.auth });
  });

  it("repetir el mismo endpoint no duplica y lo reasigna al usuario actual", async () => {
    await iniciar();
    await prisma.suscripcionPush.create({ data: { usuarioId: idB, endpoint: URL_A, p256dh: "viejo", auth: "viejo" } });
    const res = await pedirA("POST", "/push/suscripciones", { endpoint: URL_A, keys: KEYS });
    expect(res.statusCode).toBe(201);
    const todas = await prisma.suscripcionPush.findMany({ where: { endpoint: URL_A } });
    expect(todas).toHaveLength(1);
    expect(todas[0]).toMatchObject({ usuarioId: idA, p256dh: KEYS.p256dh });
  });
});

describe("DELETE /push/suscripciones", () => {
  it("401 sin sesión", async () => {
    await iniciar();
    const res = await pedirCon(app)("DELETE", "/push/suscripciones", { endpoint: URL_A });
    expect(res.statusCode).toBe(401);
  });

  it("400 con body inválido", async () => {
    await iniciar();
    expect((await pedirA("DELETE", "/push/suscripciones", {})).statusCode).toBe(400);
  });

  it("204 y borra la suscripción propia", async () => {
    await iniciar();
    await prisma.suscripcionPush.create({ data: { usuarioId: idA, endpoint: URL_A, ...KEYS } });
    const res = await pedirA("DELETE", "/push/suscripciones", { endpoint: URL_A });
    expect(res.statusCode).toBe(204);
    expect(await prisma.suscripcionPush.count({ where: { endpoint: URL_A } })).toBe(0);
  });

  it("no borra la suscripción de otro usuario", async () => {
    await iniciar();
    await prisma.suscripcionPush.create({ data: { usuarioId: idB, endpoint: URL_B, ...KEYS } });
    const res = await pedirA("DELETE", "/push/suscripciones", { endpoint: URL_B });
    expect(res.statusCode).toBe(204);
    expect(await prisma.suscripcionPush.count({ where: { endpoint: URL_B } })).toBe(1);
  });
});
