import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { PrismaClient, Rol, Sucursal } from "@prisma/client";
import bcrypt from "bcryptjs";
import { buildApp } from "../../app.js";
import { ADMIN_SEED, loginToken, pedirCon } from "../../test/helpers.js";

// Corre contra la BD de desarrollo en paralelo con otros archivos de test.
// Usuarios de prueba: nombre con este prefijo y, si tienen email, este dominio
// (distinto de @carmar.test, que limpia auth.test.ts).
const PREFIJO = "test-user-";
const DOMINIO = "@usuarios.test";

const prisma = new PrismaClient();
let app: FastifyInstance;

async function limpiar() {
  await prisma.usuario.deleteMany({
    where: { OR: [{ nombre: { startsWith: PREFIJO } }, { email: { endsWith: DOMINIO } }] },
  });
  // Las asignaciones se borran en cascada con los usuarios
  await prisma.rubro.deleteMany({ where: { nombre: { startsWith: PREFIJO } } });
}

// Admin de prueba para los casos "sobre sí mismo": nunca se toca al admin del seed
async function adminDePrueba() {
  const email = `${PREFIJO}admin${DOMINIO}`;
  const usuario = await prisma.usuario.create({
    data: {
      email,
      nombre: `${PREFIJO}Admin`,
      rol: Rol.ADMIN,
      passwordHash: await bcrypt.hash("admin-prueba-123", 10),
    },
  });
  const token = await loginToken(app, { tipo: "email", email, password: "admin-prueba-123" });
  return { usuario, pedir: pedirCon(app, token) };
}

beforeEach(async () => {
  await limpiar();
  app = await buildApp(prisma, { logger: false });
});

afterEach(async () => {
  await app.close();
});

afterAll(async () => {
  await limpiar();
  await prisma.$disconnect();
});

const comoAdmin = async () => pedirCon(app, await loginToken(app, ADMIN_SEED));

describe("GET /admin/usuarios", () => {
  it("filtra por rol y nunca devuelve hashes", async () => {
    const pedir = await comoAdmin();

    const res = await pedir("GET", "/admin/usuarios?rol=REPOSITOR");

    expect(res.statusCode).toBe(200);
    const { data } = res.json();
    expect(data.length).toBeGreaterThan(0);
    for (const u of data) {
      expect(u.rol).toBe("REPOSITOR");
      expect(u).not.toHaveProperty("passwordHash");
      expect(u).not.toHaveProperty("pinHash");
    }
  });
});

describe("POST /admin/usuarios", () => {
  it("encargada válida: 201, sin hashes, y puede loguearse", async () => {
    const pedir = await comoAdmin();
    const email = `${PREFIJO}encargada${DOMINIO}`;

    const res = await pedir("POST", "/admin/usuarios", {
      nombre: `${PREFIJO}Encargada`,
      rol: "ENCARGADA",
      email: email.toUpperCase(),
      password: "segura1234",
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ email, rol: "ENCARGADA", activo: true });
    expect(res.json().data).not.toHaveProperty("passwordHash");
    await expect(loginToken(app, { tipo: "email", email, password: "segura1234" })).resolves.toBeTruthy();
  });

  it("repositor válido: 201 y puede loguearse con su PIN", async () => {
    const pedir = await comoAdmin();

    const res = await pedir("POST", "/admin/usuarios", {
      nombre: `${PREFIJO}Repositor`,
      rol: "REPOSITOR",
      pin: "4321",
      sucursal: "CARMAR_2",
    });

    expect(res.statusCode).toBe(201);
    const { id } = res.json().data;
    await expect(loginToken(app, { tipo: "repositor", usuarioId: id, pin: "4321" })).resolves.toBeTruthy();
  });

  it("admin sin password: 400 con detalle", async () => {
    const pedir = await comoAdmin();

    const res = await pedir("POST", "/admin/usuarios", {
      nombre: `${PREFIJO}SinPass`,
      rol: "ADMIN",
      email: `${PREFIJO}sinpass${DOMINIO}`,
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().detalles).toEqual(["password: Requerida para admin y encargada"]);
  });

  it("repositor con PIN que no es de 4 dígitos: 400", async () => {
    const pedir = await comoAdmin();

    const res = await pedir("POST", "/admin/usuarios", {
      nombre: `${PREFIJO}PinMalo`,
      rol: "REPOSITOR",
      pin: "12a",
      sucursal: "CARMAR_2",
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().detalles).toEqual(["pin: El PIN debe tener exactamente 4 dígitos"]);
  });

  it("email duplicado, aunque cambien mayúsculas: 409", async () => {
    const pedir = await comoAdmin();
    const datos = { nombre: `${PREFIJO}Dup`, rol: "ENCARGADA", password: "segura1234" };
    await pedir("POST", "/admin/usuarios", { ...datos, email: `${PREFIJO}dup${DOMINIO}` });

    const res = await pedir("POST", "/admin/usuarios", { ...datos, email: `${PREFIJO}DUP${DOMINIO}` });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: "El email ya está en uso" });
  });

  it("email de un usuario borrado: lo restaura (201, mismo id)", async () => {
    const pedir = await comoAdmin();
    const datos = {
      nombre: `${PREFIJO}Vuelve`,
      rol: "ENCARGADA",
      email: `${PREFIJO}vuelve${DOMINIO}`,
      password: "segura1234",
    };
    const creado = (await pedir("POST", "/admin/usuarios", datos)).json().data;
    await pedir("DELETE", `/admin/usuarios/${creado.id}`);

    const res = await pedir("POST", "/admin/usuarios", { ...datos, password: "otra-clave-99" });

    expect(res.statusCode).toBe(201);
    expect(res.json().data).toMatchObject({ id: creado.id, deletedAt: null });
    await expect(
      loginToken(app, { tipo: "email", email: datos.email, password: "otra-clave-99" }),
    ).resolves.toBeTruthy();
  });
});

describe("PATCH /admin/usuarios/:id", () => {
  it("cambiar password: el usuario entra con la nueva", async () => {
    const pedir = await comoAdmin();
    const email = `${PREFIJO}clave${DOMINIO}`;
    const creado = (
      await pedir("POST", "/admin/usuarios", {
        nombre: `${PREFIJO}Clave`,
        rol: "ENCARGADA",
        email,
        password: "vieja-clave-1",
      })
    ).json().data;

    const res = await pedir("PATCH", `/admin/usuarios/${creado.id}`, { password: "nueva-clave-2" });

    expect(res.statusCode).toBe(200);
    await expect(loginToken(app, { tipo: "email", email, password: "nueva-clave-2" })).resolves.toBeTruthy();
  });

  it("el rol no se puede cambiar: 400", async () => {
    const { usuario, pedir } = await adminDePrueba();

    const res = await pedir("PATCH", `/admin/usuarios/${usuario.id}`, { rol: "ENCARGADA" });

    expect(res.statusCode).toBe(400);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).rol).toBe(Rol.ADMIN);
  });

  it("un admin no puede desactivarse a sí mismo: 400", async () => {
    const { usuario, pedir } = await adminDePrueba();

    const res = await pedir("PATCH", `/admin/usuarios/${usuario.id}`, { activo: false });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "No podés desactivar tu propio usuario" });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).activo).toBe(true);
  });
});

describe("DELETE /admin/usuarios/:id", () => {
  it("un admin no puede borrarse a sí mismo: 400", async () => {
    const { usuario, pedir } = await adminDePrueba();

    const res = await pedir("DELETE", `/admin/usuarios/${usuario.id}`);

    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: "No podés borrar tu propio usuario" });
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: usuario.id } })).deletedAt).toBeNull();
  });

  it("borrar otro usuario: 200, soft delete y deja de poder entrar", async () => {
    const pedir = await comoAdmin();
    const repositor = await prisma.usuario.create({
      data: {
        nombre: `${PREFIJO}ABorrar`,
        rol: Rol.REPOSITOR,
        sucursal: Sucursal.CARMAR_2,
        pinHash: await bcrypt.hash("1111", 10),
      },
    });

    const res = await pedir("DELETE", `/admin/usuarios/${repositor.id}`);

    expect(res.statusCode).toBe(200);
    expect((await prisma.usuario.findUniqueOrThrow({ where: { id: repositor.id } })).deletedAt).not.toBeNull();
    const login = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: { tipo: "repositor", usuarioId: repositor.id, pin: "1111" },
    });
    expect(login.statusCode).toBe(401);
  });
});

describe("rubros de un repositor", () => {
  const ENCARGADA = { tipo: "email", email: "encargada@carmar.com", password: "encargada123" };

  const put = (token: string | undefined, id: string, payload: object) =>
    app.inject({
      method: "PUT",
      url: `/admin/usuarios/${id}/rubros`,
      payload,
      ...(token ? { cookies: { token } } : {}),
    });

  async function repositor(nombre: string, sucursal: Sucursal | null = Sucursal.CARMAR_2) {
    return prisma.usuario.create({
      data: {
        nombre: `${PREFIJO}${nombre}`,
        rol: Rol.REPOSITOR,
        sucursal,
        pinHash: await bcrypt.hash("1234", 10),
      },
    });
  }

  const rubro = (nombre: string, deletedAt: Date | null = null) =>
    prisma.rubro.create({ data: { nombre: `${PREFIJO}${nombre}`, deletedAt } });

  const asignar = (usuarioId: string, rubroId: string, sucursal: Sucursal) =>
    prisma.repositorRubro.create({ data: { usuarioId, rubroId, sucursal } });

  const idsEnBd = async (usuarioId: string, sucursal: Sucursal) =>
    (await prisma.repositorRubro.findMany({ where: { usuarioId, sucursal } }))
      .map((a) => a.rubroId)
      .sort();

  describe("GET", () => {
    it("devuelve los rubros de su sucursal ordenados por nombre, sin borrados ni otra sucursal", async () => {
      const pedir = await comoAdmin();
      const u = await repositor("Repo");
      const b = await rubro("B");
      const a = await rubro("A");
      const borrado = await rubro("Borrado", new Date());
      const otraSucursal = await rubro("Otra");
      await asignar(u.id, b.id, Sucursal.CARMAR_2);
      await asignar(u.id, a.id, Sucursal.CARMAR_2);
      await asignar(u.id, borrado.id, Sucursal.CARMAR_2);
      await asignar(u.id, otraSucursal.id, Sucursal.CARMAR_1);

      const res = await pedir("GET", `/admin/usuarios/${u.id}/rubros`);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: [
          { id: a.id, nombre: a.nombre },
          { id: b.id, nombre: b.nombre },
        ],
      });
    });

    it("repositor sin sucursal: lista vacía", async () => {
      const pedir = await comoAdmin();
      const u = await repositor("SinSuc", null);
      const res = await pedir("GET", `/admin/usuarios/${u.id}/rubros`);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [] });
    });

    it("no repositor: 400", async () => {
      const { usuario, pedir } = await adminDePrueba();
      const res = await pedir("GET", `/admin/usuarios/${usuario.id}/rubros`);
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "Solo los repositores tienen rubros asignados" });
    });

    it("usuario inexistente o borrado: 404", async () => {
      const pedir = await comoAdmin();
      const u = await repositor("Borrado");
      await prisma.usuario.update({ where: { id: u.id }, data: { deletedAt: new Date() } });
      expect((await pedir("GET", "/admin/usuarios/no-existe/rubros")).statusCode).toBe(404);
      expect((await pedir("GET", `/admin/usuarios/${u.id}/rubros`)).statusCode).toBe(404);
    });

    it("sin sesión 401; ENCARGADA 403", async () => {
      const u = await repositor("Auth");
      const sin = await pedirCon(app)("GET", `/admin/usuarios/${u.id}/rubros`);
      expect(sin.statusCode).toBe(401);
      const enc = pedirCon(app, await loginToken(app, ENCARGADA));
      expect((await enc("GET", `/admin/usuarios/${u.id}/rubros`)).statusCode).toBe(403);
    });
  });

  describe("PUT", () => {
    it("reemplaza, agrega y quita sin tocar otra sucursal", async () => {
      const token = await loginToken(app, ADMIN_SEED);
      const u = await repositor("Repo");
      const r1 = await rubro("R1");
      const r2 = await rubro("R2");
      const r3 = await rubro("R3");
      await asignar(u.id, r1.id, Sucursal.CARMAR_2);
      await asignar(u.id, r2.id, Sucursal.CARMAR_2);
      await asignar(u.id, r1.id, Sucursal.CARMAR_1);

      const res = await put(token, u.id, { rubroIds: [r2.id, r3.id, r3.id] });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({
        data: [
          { id: r2.id, nombre: r2.nombre },
          { id: r3.id, nombre: r3.nombre },
        ],
      });
      expect(await idsEnBd(u.id, Sucursal.CARMAR_2)).toEqual([r2.id, r3.id].sort());
      expect(await idsEnBd(u.id, Sucursal.CARMAR_1)).toEqual([r1.id]);
    });

    it("lista vacía quita todos los de su sucursal", async () => {
      const token = await loginToken(app, ADMIN_SEED);
      const u = await repositor("Repo");
      const r1 = await rubro("R1");
      await asignar(u.id, r1.id, Sucursal.CARMAR_2);
      await asignar(u.id, r1.id, Sucursal.CARMAR_1);

      const res = await put(token, u.id, { rubroIds: [] });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ data: [] });
      expect(await idsEnBd(u.id, Sucursal.CARMAR_2)).toEqual([]);
      expect(await idsEnBd(u.id, Sucursal.CARMAR_1)).toEqual([r1.id]);
    });

    it("rubro inexistente o borrado: 400 y no cambia nada", async () => {
      const token = await loginToken(app, ADMIN_SEED);
      const u = await repositor("Repo");
      const r1 = await rubro("R1");
      const borrado = await rubro("Borrado", new Date());
      await asignar(u.id, r1.id, Sucursal.CARMAR_2);

      for (const ids of [[r1.id, "no-existe"], [borrado.id]]) {
        const res = await put(token, u.id, { rubroIds: ids });
        expect(res.statusCode).toBe(400);
        expect(res.json().error).toBe("Datos inválidos");
        expect(res.json().detalles.length).toBeGreaterThan(0);
      }
      expect(await idsEnBd(u.id, Sucursal.CARMAR_2)).toEqual([r1.id]);
    });

    it("body inválido: 400", async () => {
      const token = await loginToken(app, ADMIN_SEED);
      const u = await repositor("Repo");
      expect((await put(token, u.id, {})).statusCode).toBe(400);
      expect((await put(token, u.id, { rubroIds: "x" })).statusCode).toBe(400);
    });

    it("no repositor: 400", async () => {
      const { usuario } = await adminDePrueba();
      const token = await loginToken(app, ADMIN_SEED);
      const res = await put(token, usuario.id, { rubroIds: [] });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "Solo los repositores tienen rubros asignados" });
    });

    it("repositor sin sucursal: 400", async () => {
      const token = await loginToken(app, ADMIN_SEED);
      const u = await repositor("SinSuc", null);
      const res = await put(token, u.id, { rubroIds: [] });
      expect(res.statusCode).toBe(400);
    });

    it("usuario inexistente: 404", async () => {
      const token = await loginToken(app, ADMIN_SEED);
      expect((await put(token, "no-existe", { rubroIds: [] })).statusCode).toBe(404);
    });

    it("sin sesión 401; ENCARGADA y REPOSITOR 403", async () => {
      const u = await repositor("Auth");
      expect((await put(undefined, u.id, { rubroIds: [] })).statusCode).toBe(401);
      const enc = await loginToken(app, ENCARGADA);
      expect((await put(enc, u.id, { rubroIds: [] })).statusCode).toBe(403);
      const repo = await loginToken(app, { tipo: "repositor", usuarioId: u.id, pin: "1234" });
      expect((await put(repo, u.id, { rubroIds: [] })).statusCode).toBe(403);
    });

    it("tras el PUT, /pedidos/mis-rubros del repositor refleja el cambio", async () => {
      const token = await loginToken(app, ADMIN_SEED);
      const u = await repositor("Repo");
      const r1 = await rubro("R1");
      const r2 = await rubro("R2");
      const repoToken = await loginToken(app, { tipo: "repositor", usuarioId: u.id, pin: "1234" });
      const pedirRepo = pedirCon(app, repoToken);

      expect((await pedirRepo("GET", "/pedidos/mis-rubros")).json()).toEqual([]);
      await put(token, u.id, { rubroIds: [r2.id, r1.id] });

      expect((await pedirRepo("GET", "/pedidos/mis-rubros")).json()).toEqual([
        { id: r1.id, nombre: r1.nombre },
        { id: r2.id, nombre: r2.nombre },
      ]);
    });
  });
});
