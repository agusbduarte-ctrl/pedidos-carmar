// Cuántos proxies hay delante de la API. En producción con Caddy es 1.
// Si TRUST_PROXY_HOPS es un entero >= 1 se usa ese número; si no, se confía en todos (true),
// como en la prueba en Netlify/Render.
export function leerTrustProxy(valor: string | undefined): number | true {
  const texto = valor?.trim();
  if (texto && /^\d+$/.test(texto)) {
    const saltos = Number(texto);
    if (saltos >= 1) return saltos;
  }
  return true;
}
