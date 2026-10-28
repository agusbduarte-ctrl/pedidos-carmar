import { useEffect, useState } from "react";
import { ApiError, type Rol } from "../lib/api";
import type { Meta, Unidad } from "../lib/pedidosApi";

export const ETIQUETA_ROL: Record<Rol, string> = {
  ADMIN: "Administrador/a",
  ENCARGADA: "Encargada de compras",
  REPOSITOR: "Repositor",
};

export const NOMBRE_UNIDAD: Record<Unidad, string> = {
  UN: "Unidad (UN)",
  KG: "Kilo (KG)",
  LT: "Litro (LT)",
  CAJA: "Caja (CAJA)",
  PACK: "Pack (PACK)",
};

export const UNIDADES: Unidad[] = ["UN", "KG", "LT", "CAJA", "PACK"];

// Muestra el mensaje de la API y, si trae, el detalle de cada campo
export function textoError(err: unknown, porDefecto: string): string {
  if (!(err instanceof ApiError)) return porDefecto;
  return err.detalles.length > 0 ? `${err.message} ${err.detalles.join(". ")}` : err.message;
}

export function useDemorado(valor: string, ms = 350): string {
  const [demorado, setDemorado] = useState(valor);
  useEffect(() => {
    const t = setTimeout(() => setDemorado(valor), ms);
    return () => clearTimeout(t);
  }, [valor, ms]);
  return demorado;
}

// Vacío = sin precio (null). Acepta coma como decimal.
export type LecturaPrecio = { ok: true; valor: number | null } | { ok: false; mensaje: string };

export function leerPrecio(texto: string): LecturaPrecio {
  const limpio = texto.trim().replace(",", ".");
  if (limpio === "") return { ok: true, valor: null };
  if (!/^\d+(\.\d{1,2})?$/.test(limpio)) {
    return { ok: false, mensaje: "El precio tiene que ser un número con hasta 2 decimales." };
  }
  const valor = Number(limpio);
  if (valor <= 0) return { ok: false, mensaje: "El precio tiene que ser mayor a 0." };
  if (valor > 99_999_999.99) return { ok: false, mensaje: "El precio es demasiado grande." };
  return { ok: true, valor };
}

export function textoPrecio(p: string | number | null): string {
  return p === null ? "" : String(Number(p)).replace(".", ",");
}

export function formatearPrecio(p: string | number | null): string {
  if (p === null) return "-";
  return Number(p).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 2,
  });
}

// Fechas de período: la API las guarda en UTC a medianoche, así que se muestran en UTC
// para que no se corran un día por la zona horaria de Argentina.
export function formatearDia(iso: string | null): string {
  if (!iso) return "-";
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return "-";
  return fecha.toLocaleDateString("es-AR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" });
}

// ISO de la API -> yyyy-mm-dd para un input date
export function aInputFecha(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

// Hoy en hora local, como yyyy-mm-dd
export function hoyInput(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function Paginacion({
  meta,
  ocupado,
  alCambiar,
}: {
  meta: Meta;
  ocupado: boolean;
  alCambiar: (page: number) => void;
}) {
  return (
    <div className="paginas">
      <button
        type="button"
        className="boton secundario"
        disabled={meta.page <= 1 || ocupado}
        onClick={() => alCambiar(meta.page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {meta.page} de {Math.max(meta.totalPages, 1)} ({meta.total} en total)
      </span>
      <button
        type="button"
        className="boton secundario"
        disabled={meta.page >= meta.totalPages || ocupado}
        onClick={() => alCambiar(meta.page + 1)}
      >
        Siguiente
      </button>
    </div>
  );
}
