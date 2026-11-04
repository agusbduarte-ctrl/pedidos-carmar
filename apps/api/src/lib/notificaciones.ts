import type { PrismaClient, Rol, Sucursal } from "@prisma/client";
import webpush from "web-push";

export interface SuscripcionPlana {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Envía un payload a una suscripción. Si falla, tira un error con statusCode (como web-push).
export type EmisorPush = (suscripcion: SuscripcionPlana, payload: string) => Promise<void>;

export interface DestinoPush {
  roles?: Rol[];
  usuarioIds?: string[];
  excepto?: string;
}

export interface MensajePush {
  titulo: string;
  cuerpo: string;
  url: string;
}

export type Notificar = (destino: DestinoPush, mensaje: MensajePush) => Promise<void>;

export interface LogPush {
  warn: (obj: unknown, msg?: string) => void;
}

export interface ConfigVapid {
  publica: string;
  privada: string;
  subject: string;
}

export function leerVapid(env: NodeJS.ProcessEnv): ConfigVapid | null {
  const publica = env.VAPID_PUBLIC_KEY?.trim();
  const privada = env.VAPID_PRIVATE_KEY?.trim();
  const subject = env.VAPID_SUBJECT?.trim();
  if (!publica || !privada || !subject) return null;
  return { publica, privada, subject };
}

export function crearEmisorWebPush(config: ConfigVapid): EmisorPush {
  webpush.setVapidDetails(config.subject, config.publica, config.privada);
  return async (s, payload) => {
    await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
      TTL: 60 * 60 * 24,
    });
  };
}

const NOMBRE_SUCURSAL: Record<Sucursal, string> = { CARMAR_1: "Cármar 1", CARMAR_2: "Cármar 2" };
export const nombreSucursal = (s: Sucursal) => NOMBRE_SUCURSAL[s];

function statusDe(err: unknown): number | undefined {
  if (typeof err === "object" && err !== null && "statusCode" in err) {
    const code = (err as { statusCode: unknown }).statusCode;
    return typeof code === "number" ? code : undefined;
  }
  return undefined;
}

// Nunca tira error: un aviso que falla no puede romper la acción del usuario.
export async function notificar(
  db: PrismaClient,
  emisor: EmisorPush,
  destino: DestinoPush,
  mensaje: MensajePush,
  log?: LogPush,
): Promise<void> {
  try {
    const condiciones = [
      ...(destino.roles?.length ? [{ rol: { in: destino.roles } }] : []),
      ...(destino.usuarioIds?.length ? [{ id: { in: destino.usuarioIds } }] : []),
    ];
    if (condiciones.length === 0) return;

    const suscripciones = await db.suscripcionPush.findMany({
      where: {
        usuario: {
          activo: true,
          deletedAt: null,
          OR: condiciones,
          ...(destino.excepto ? { id: { not: destino.excepto } } : {}),
        },
      },
      select: { id: true, endpoint: true, p256dh: true, auth: true },
    });
    if (suscripciones.length === 0) return;

    const payload = JSON.stringify({ titulo: mensaje.titulo, cuerpo: mensaje.cuerpo, url: mensaje.url });
    await Promise.all(
      suscripciones.map(async (s) => {
        try {
          await emisor(s, payload);
        } catch (err) {
          const status = statusDe(err);
          if (status === 404 || status === 410) {
            await db.suscripcionPush.deleteMany({ where: { id: s.id } });
          } else {
            log?.warn({ err, status }, "No se pudo enviar un aviso push");
          }
        }
      }),
    );
  } catch (err) {
    log?.warn({ err }, "Falló el envío de avisos push");
  }
}

export interface DatosAviso {
  repositorId: string;
  repositor: string;
  // Nombre del proveedor; si el pedido no tiene, su título; si tampoco, un texto genérico
  proveedor: string;
  sucursal: string;
  comentarioDevolucion: string | null;
}

export async function datosAviso(db: PrismaClient, pedidoId: string): Promise<DatosAviso | null> {
  const p = await db.pedido.findUnique({
    where: { id: pedidoId },
    select: {
      repositorId: true,
      sucursal: true,
      titulo: true,
      comentarioDevolucion: true,
      repositor: { select: { nombre: true } },
      proveedor: { select: { nombre: true } },
    },
  });
  if (!p) return null;
  return {
    repositorId: p.repositorId,
    repositor: p.repositor.nombre,
    proveedor: p.proveedor?.nombre ?? p.titulo ?? "un proveedor",
    sucursal: nombreSucursal(p.sucursal),
    comentarioDevolucion: p.comentarioDevolucion,
  };
}
