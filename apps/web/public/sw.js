// Service worker mínimo: solo cachea el "app shell". Nunca toca /api.
// Subir la versión fuerza a descartar cachés viejas.
const VERSION = "v2";
const CACHE = `carmar-shell-${VERSION}`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.add("/"))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k.startsWith("carmar-shell-") && k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

// Avisos (Web Push): payload JSON { titulo, cuerpo, url }.
self.addEventListener("push", (event) => {
  let datos = {};
  if (event.data) {
    try {
      datos = event.data.json();
    } catch {
      datos = { cuerpo: event.data.text() };
    }
  }
  const titulo = datos.titulo || "Carmar";
  event.waitUntil(
    self.registration.showNotification(titulo, {
      body: datos.cuerpo || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: datos.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ventanas) => {
      const ventana = ventanas.find((v) => new URL(v.url).origin === self.location.origin);
      if (ventana) {
        return ventana.focus().then((v) => (v && "navigate" in v ? v.navigate(url) : undefined));
      }
      return self.clients.openWindow(url);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // API y service worker: siempre a la red, sin caché.
  if (url.pathname.startsWith("/api") || url.pathname === "/sw.js") return;

  // Navegaciones: red primero, caché de respaldo.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put("/", copy));
          }
          return res;
        })
        .catch(() => caches.match("/").then((r) => r || Response.error())),
    );
    return;
  }

  // Assets con hash de Vite: caché primero (son inmutables).
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
  }
});
