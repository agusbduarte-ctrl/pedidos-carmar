import { api } from "./api";

export type EstadoAvisos = "no-soportado" | "bloqueado" | "activo" | "inactivo";

export function soportado(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** Clave pública del servidor, o null si los avisos están desactivados allá. */
export async function claveAvisos(): Promise<string | null> {
  const r = await api<{ data: { clave: string | null } }>("/push/clave-publica");
  return r.data.clave;
}

async function registro(): Promise<ServiceWorkerRegistration | null> {
  // Sin service worker registrado (desarrollo) ready nunca se resuelve.
  const existente = await navigator.serviceWorker.getRegistration();
  if (!existente) return null;
  return navigator.serviceWorker.ready;
}

export async function estadoAvisos(): Promise<EstadoAvisos> {
  if (!soportado()) return "no-soportado";
  if (Notification.permission === "denied") return "bloqueado";
  const reg = await registro();
  if (!reg) return "no-soportado";
  const sub = await reg.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "activo" : "inactivo";
}

function aUint8(base64url: string): Uint8Array<ArrayBuffer> {
  const relleno = "=".repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + relleno).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function enviar(sub: PushSubscription) {
  return api("/push/suscripciones", { method: "POST", body: sub.toJSON() });
}

/** Si ya hay suscripción, la reenvía al servidor (idempotente). Silencioso. */
export async function resincronizarAvisos(): Promise<void> {
  try {
    if (!soportado() || Notification.permission !== "granted") return;
    const reg = await registro();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await enviar(sub);
  } catch {
    // Si falla, se reintenta en la próxima carga.
  }
}

export async function activarAvisos(clave: string): Promise<void> {
  const permiso = await Notification.requestPermission();
  if (permiso !== "granted") {
    throw new Error(
      permiso === "denied"
        ? "Avisos bloqueados: habilitalos en el candado de la barra del navegador"
        : "No se activaron los avisos.",
    );
  }
  const reg = await registro();
  if (!reg) throw new Error("Los avisos no están disponibles en este momento.");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aUint8(clave) }));
  await enviar(sub);
}

export async function desactivarAvisos(): Promise<void> {
  const reg = await registro();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await api("/push/suscripciones", { method: "DELETE", body: { endpoint } }).catch(() => {});
}
