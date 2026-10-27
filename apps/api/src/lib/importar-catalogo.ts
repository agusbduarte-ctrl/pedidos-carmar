import { UnidadMedida, type PrismaClient } from "@prisma/client";
import type { FilaCatalogo } from "./excel-parser.js";

export const PROVEEDOR_SIN_ASIGNAR = "SIN ASIGNAR";

export interface OpcionesImportacion {
  /** Nombre del proveedor para productos sin proveedor (los tests usan uno propio) */
  proveedorSinAsignar?: string;
  /** Productos por transacción */
  tamanoLote?: number;
  log?: (mensaje: string) => void;
}

export interface ResultadoImportacion {
  rubros: { creados: number; actualizados: number; restaurados: number };
  productos: { creados: number; actualizados: number; sinCambios: number; omitidosBorrados: number };
  codigosBarras: { creados: number; omitidos: number };
  avisos: string[];
  errores: string[];
}

const TIMEOUT_LOTE_MS = 60_000;

// Idempotente: correrlo dos veces con el mismo Excel no duplica nada.
// Nunca borra: los rubros y productos que no están en el Excel quedan como están.
export async function importarCatalogo(
  db: PrismaClient,
  filas: FilaCatalogo[],
  opciones: OpcionesImportacion = {},
): Promise<ResultadoImportacion> {
  const { proveedorSinAsignar = PROVEEDOR_SIN_ASIGNAR, tamanoLote = 500, log = () => {} } = opciones;
  const resultado: ResultadoImportacion = {
    rubros: { creados: 0, actualizados: 0, restaurados: 0 },
    productos: { creados: 0, actualizados: 0, sinCambios: 0, omitidosBorrados: 0 },
    codigosBarras: { creados: 0, omitidos: 0 },
    avisos: [],
    errores: [],
  };

  const proveedor = await db.proveedor.upsert({
    where: { nombre: proveedorSinAsignar },
    update: { deletedAt: null },
    create: { nombre: proveedorSinAsignar },
  });

  const rubroIdPorCodigo = await importarRubros(db, filas, resultado);
  log(`Rubros: ${rubroIdPorCodigo.size} (${resultado.rubros.creados} creados)`);

  let procesados = 0;
  for (let inicio = 0; inicio < filas.length; inicio += tamanoLote) {
    const lote = filas.slice(inicio, inicio + tamanoLote);
    try {
      await db.$transaction(
        (tx) => importarLote(tx as PrismaClient, lote, rubroIdPorCodigo, proveedor.id, resultado),
        { timeout: TIMEOUT_LOTE_MS },
      );
    } catch (err) {
      const hasta = inicio + lote.length;
      resultado.errores.push(`Lote de filas ${inicio + 1}-${hasta}: ${(err as Error).message}`);
    }
    const antes = procesados;
    procesados += lote.length;
    if (Math.floor(procesados / 1000) > Math.floor(antes / 1000) || procesados === filas.length) {
      log(`Productos: ${procesados}/${filas.length}`);
    }
  }

  return resultado;
}

// Rubros: se buscan por código y, si no, por nombre (sin distinguir mayúsculas).
// Devuelve el id de rubro para cada código del Excel.
async function importarRubros(
  db: PrismaClient,
  filas: FilaCatalogo[],
  resultado: ResultadoImportacion,
): Promise<Map<string, string>> {
  const nombrePorCodigo = new Map<string, string>();
  for (const f of filas) {
    if (!nombrePorCodigo.has(f.rubroCodigo)) nombrePorCodigo.set(f.rubroCodigo, f.rubroNombre);
  }

  const existentes = await db.rubro.findMany();
  const idPorCodigo = new Map<string, string>();

  for (const [codigo, nombre] of nombrePorCodigo) {
    const porCodigo = existentes.find((r) => r.codigo === codigo);
    const porNombre = existentes.find((r) => r.nombre.toLowerCase() === nombre.toLowerCase());
    const rubro = porCodigo ?? porNombre;

    if (!rubro) {
      const creado = await db.rubro.create({ data: { codigo, nombre } });
      existentes.push(creado);
      idPorCodigo.set(codigo, creado.id);
      resultado.rubros.creados++;
      continue;
    }

    const cambios: { codigo?: string; nombre?: string; deletedAt?: null } = {};
    if (rubro.codigo === null) {
      cambios.codigo = codigo;
    } else if (rubro.codigo !== codigo) {
      resultado.avisos.push(
        `Rubro "${nombre}" (código ${codigo}): ya existe con el código ${rubro.codigo}; se usa ese`,
      );
    }
    // Si el Excel le cambió el nombre y no choca con otro rubro, se actualiza
    if (porCodigo && porCodigo.nombre !== nombre && (!porNombre || porNombre.id === porCodigo.id)) {
      cambios.nombre = nombre;
    }
    if (rubro.deletedAt) {
      cambios.deletedAt = null;
      resultado.rubros.restaurados++;
    } else if (Object.keys(cambios).length > 0) {
      resultado.rubros.actualizados++;
    }
    if (Object.keys(cambios).length > 0) {
      Object.assign(rubro, await db.rubro.update({ where: { id: rubro.id }, data: cambios }));
    }
    idPorCodigo.set(codigo, rubro.id);
  }

  return idPorCodigo;
}

async function importarLote(
  tx: PrismaClient,
  lote: FilaCatalogo[],
  rubroIdPorCodigo: Map<string, string>,
  proveedorSinAsignarId: string,
  resultado: ResultadoImportacion,
) {
  // Contadores locales: si la transacción falla, no se suman al resultado
  const parcial = { creados: 0, actualizados: 0, sinCambios: 0, omitidosBorrados: 0, cbCreados: 0, cbOmitidos: 0 };
  const avisos: string[] = [];

  const existentes = await tx.producto.findMany({
    where: { codigo: { in: lote.map((f) => f.codigo) } },
    select: { id: true, codigo: true, nombre: true, rubroId: true, proveedorId: true, deletedAt: true },
  });
  const existentePorCodigo = new Map(existentes.map((p) => [p.codigo, p]));

  const nuevos = lote.filter((f) => !existentePorCodigo.has(f.codigo));
  if (nuevos.length > 0) {
    const { count } = await tx.producto.createMany({
      data: nuevos.map((f) => ({
        codigo: f.codigo,
        nombre: f.nombre,
        rubroId: rubroIdPorCodigo.get(f.rubroCodigo)!,
        proveedorId: proveedorSinAsignarId,
        unidad: UnidadMedida.UN,
        activo: true,
      })),
    });
    parcial.creados += count;
  }

  for (const fila of lote) {
    const producto = existentePorCodigo.get(fila.codigo);
    if (!producto) continue;
    if (producto.deletedAt) {
      // Lo borró un admin: no se toca ni se restaura
      parcial.omitidosBorrados++;
      continue;
    }
    const rubroId = rubroIdPorCodigo.get(fila.rubroCodigo)!;
    const cambios = {
      ...(producto.nombre !== fila.nombre ? { nombre: fila.nombre } : {}),
      ...(producto.rubroId !== rubroId ? { rubroId } : {}),
      // No se pisa un proveedor real: solo se completa si está vacío
      ...(producto.proveedorId === null ? { proveedorId: proveedorSinAsignarId } : {}),
    };
    if (Object.keys(cambios).length > 0) {
      await tx.producto.update({ where: { id: producto.id }, data: cambios });
      parcial.actualizados++;
    } else {
      parcial.sinCambios++;
    }
  }

  // Códigos de barras de los productos del lote (los borrados no)
  const idPorCodigo = new Map(
    (
      await tx.producto.findMany({
        where: { codigo: { in: lote.map((f) => f.codigo) }, deletedAt: null },
        select: { id: true, codigo: true },
      })
    ).map((p) => [p.codigo, p.id]),
  );
  const pedidos = lote.flatMap((f) => {
    const productoId = idPorCodigo.get(f.codigo);
    return productoId ? f.codigosBarras.map((codigo) => ({ codigo, productoId, articulo: f.codigo })) : [];
  });
  const yaCargados = new Map(
    (
      await tx.codigoBarras.findMany({
        where: { codigo: { in: pedidos.map((c) => c.codigo) } },
        select: { codigo: true, productoId: true },
      })
    ).map((c) => [c.codigo, c.productoId]),
  );

  const aCrear: { codigo: string; productoId: string }[] = [];
  for (const { codigo, productoId, articulo } of pedidos) {
    const propietario = yaCargados.get(codigo);
    if (propietario === productoId) continue; // ya estaba, nada que hacer
    if (propietario !== undefined) {
      avisos.push(`Código de barras ${codigo} (artículo ${articulo}): ya pertenece a otro producto; se omite`);
      parcial.cbOmitidos++;
      continue;
    }
    yaCargados.set(codigo, productoId); // evita repetirlo dentro del mismo lote
    aCrear.push({ codigo, productoId });
  }
  if (aCrear.length > 0) {
    parcial.cbCreados += (await tx.codigoBarras.createMany({ data: aCrear })).count;
  }

  resultado.productos.creados += parcial.creados;
  resultado.productos.actualizados += parcial.actualizados;
  resultado.productos.sinCambios += parcial.sinCambios;
  resultado.productos.omitidosBorrados += parcial.omitidosBorrados;
  resultado.codigosBarras.creados += parcial.cbCreados;
  resultado.codigosBarras.omitidos += parcial.cbOmitidos;
  resultado.avisos.push(...avisos);
}
