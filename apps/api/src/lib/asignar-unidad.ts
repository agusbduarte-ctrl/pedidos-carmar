import { UnidadMedida, type PrismaClient } from "@prisma/client";
import { normalizar, parsearListaRubros } from "./recorte-catalogo.js";

export interface ResumenRubro {
  codigo: string;
  nombre: string;
  cambian: number;
  yaTienen: number;
}

export interface ResultadoAsignacion {
  porRubro: ResumenRubro[];
  inexistentes: string[];
  aplicado: boolean;
  actualizados: number;
}

export function leerUnidad(valor: string | undefined): UnidadMedida {
  const validas = Object.values(UnidadMedida);
  const texto = (valor ?? "").trim().toUpperCase();
  if (texto === "") throw new Error(`Falta UNIDAD. Valores posibles: ${validas.join(", ")}.`);
  if (!(validas as string[]).includes(texto)) {
    throw new Error(`UNIDAD "${valor}" no es válida. Valores posibles: ${validas.join(", ")}.`);
  }
  return texto as UnidadMedida;
}

export function leerRubros(valor: string | undefined): string[] {
  const rubros = parsearListaRubros(valor);
  if (!rubros) throw new Error("Falta RUBROS: códigos de rubro separados por coma, por ejemplo RUBROS=70,6,47.");
  return rubros;
}

// Simulacro por defecto; con aplicar=true cambia la unidad de los productos (no borrados) de esos rubros.
export async function asignarUnidad(
  prisma: PrismaClient,
  opciones: { unidad: UnidadMedida; rubros: string[]; aplicar?: boolean },
): Promise<ResultadoAsignacion> {
  const pedidos = new Set(opciones.rubros.map(normalizar));
  const rubrosBase = await prisma.rubro.findMany({
    where: { deletedAt: null, codigo: { not: null } },
    select: { id: true, codigo: true, nombre: true },
  });
  const elegidos = rubrosBase.filter((r) => pedidos.has(normalizar(r.codigo!)));
  const existentes = new Set(elegidos.map((r) => normalizar(r.codigo!)));
  const inexistentes = opciones.rubros.filter((c) => !existentes.has(normalizar(c)));

  const porRubro: ResumenRubro[] = [];
  let actualizados = 0;
  for (const r of elegidos) {
    const base = { rubroId: r.id, deletedAt: null };
    const yaTienen = await prisma.producto.count({ where: { ...base, unidad: opciones.unidad } });
    const cambian = await prisma.producto.count({ where: { ...base, unidad: { not: opciones.unidad } } });
    if (opciones.aplicar && cambian > 0) {
      const res = await prisma.producto.updateMany({
        where: { ...base, unidad: { not: opciones.unidad } },
        data: { unidad: opciones.unidad },
      });
      actualizados += res.count;
    }
    porRubro.push({ codigo: r.codigo!, nombre: r.nombre, cambian, yaTienen });
  }
  return { porRubro, inexistentes, aplicado: opciones.aplicar === true, actualizados };
}
