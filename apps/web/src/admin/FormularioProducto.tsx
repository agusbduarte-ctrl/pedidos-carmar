import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Unidad } from "../lib/pedidosApi";
import { adminApi, type NuevoProducto, type Opcion, type ProductoAdmin } from "../lib/adminApi";
import { NOMBRE_UNIDAD, UNIDADES, leerPrecio, textoError, textoPrecio } from "./comun";

interface Props {
  // null = alta
  producto: ProductoAdmin | null;
  rubros: Opcion[];
  proveedores: Opcion[];
  alEmpezar: () => void;
  alGuardar: (p: ProductoAdmin) => void;
  alCerrar: () => void;
}

export default function FormularioProducto({
  producto,
  rubros,
  proveedores,
  alEmpezar,
  alGuardar,
  alCerrar,
}: Props) {
  const qc = useQueryClient();
  const editando = producto !== null;

  const [codigo, setCodigo] = useState(producto?.codigo ?? "");
  const [nombre, setNombre] = useState(producto?.nombre ?? "");
  const [rubroId, setRubroId] = useState(producto?.rubroId ?? "");
  const [proveedorId, setProveedorId] = useState(producto?.proveedorId ?? "");
  const [unidad, setUnidad] = useState<Unidad>(producto?.unidad ?? "UN");
  const [precio, setPrecio] = useState(textoPrecio(producto?.precioReferencia ?? null));
  const [activo, setActivo] = useState(producto?.activo ?? true);
  const [error, setError] = useState("");

  const mutacion = useMutation({
    mutationFn: async (valorPrecio: number | null): Promise<ProductoAdmin> => {
      if (producto) {
        return adminApi.editarProducto(producto.id, {
          nombre: nombre.trim(),
          rubroId,
          proveedorId: proveedorId || null,
          unidad,
          precioReferencia: valorPrecio,
          activo,
        });
      }
      const nuevo: NuevoProducto = {
        codigo: codigo.trim(),
        nombre: nombre.trim(),
        rubroId,
        unidad,
        activo,
        ...(proveedorId ? { proveedorId } : {}),
        ...(valorPrecio !== null ? { precioReferencia: valorPrecio } : {}),
      };
      return adminApi.crearProducto(nuevo);
    },
    onSuccess: (guardado) => {
      setError("");
      void qc.invalidateQueries({ queryKey: ["admin", "productos", "lista"] });
      alGuardar(guardado);
    },
    onError: (err) => {
      setError(textoError(err, "No se pudo guardar el producto."));
    },
  });

  const enviar = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    alEmpezar();
    if (!editando && codigo.trim() === "") return setError("Escribí el código.");
    if (nombre.trim().length < 2) return setError("El nombre tiene que tener al menos 2 letras.");
    if (!rubroId) return setError("Elegí el rubro.");
    const lectura = leerPrecio(precio);
    if (!lectura.ok) return setError(lectura.mensaje);
    mutacion.mutate(lectura.valor);
  };

  return (
    <section
      className="tarjeta panel-form"
      aria-label={editando ? "Editar producto" : "Nuevo producto"}
    >
      <h2>{editando ? "Editar producto" : "Nuevo producto"}</h2>
      <form onSubmit={enviar} noValidate>
        {editando ? (
          <p className="chico">
            Código: <strong>{producto.codigo}</strong> (no se puede cambiar)
          </p>
        ) : (
          <label>
            Código
            <input value={codigo} onChange={(e) => setCodigo(e.target.value)} autoComplete="off" />
          </label>
        )}
        <label>
          Nombre
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" />
        </label>
        <label>
          Rubro
          <select value={rubroId} onChange={(e) => setRubroId(e.target.value)}>
            <option value="">Elegí un rubro</option>
            {rubros.map((r) => (
              <option key={r.id} value={r.id}>
                {r.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Proveedor
          <select value={proveedorId} onChange={(e) => setProveedorId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidad
          <select value={unidad} onChange={(e) => setUnidad(e.target.value as Unidad)}>
            {UNIDADES.map((u) => (
              <option key={u} value={u}>
                {NOMBRE_UNIDAD[u]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Precio de referencia (opcional)
          <input
            inputMode="decimal"
            placeholder="Ej: 1250,50"
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
          />
        </label>
        <label className="casilla">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
          Producto activo
        </label>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="acciones">
          <button className="boton" type="submit" disabled={mutacion.isPending}>
            {mutacion.isPending ? "Guardando..." : editando ? "Guardar cambios" : "Crear producto"}
          </button>
          <button className="boton secundario sin-margen" type="button" onClick={alCerrar}>
            {editando ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </form>
    </section>
  );
}
