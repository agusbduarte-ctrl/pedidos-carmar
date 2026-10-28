import { useMemo, useState } from "react";
import type { ItemConsolidado } from "../lib/consolidadoApi";
import FilaItem from "./FilaItem";
import { agruparPorProveedor } from "./utilidades";

interface Props {
  consolidadoId: string;
  items: ItemConsolidado[];
  editable: boolean;
  alGuardar: (item: ItemConsolidado) => void;
}

function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function TablaItems({ consolidadoId, items, editable, alGuardar }: Props) {
  const [busqueda, setBusqueda] = useState("");

  const grupos = useMemo(() => {
    const q = normalizar(busqueda.trim());
    const filtrados =
      q === ""
        ? items
        : items.filter(
            (it) =>
              normalizar(it.producto.nombre).includes(q) ||
              normalizar(it.producto.codigo).includes(q),
          );
    return agruparPorProveedor(filtrados);
  }, [items, busqueda]);

  return (
    <section className="bloque">
      <label className="filtro">
        Buscar producto
        <input
          type="search"
          placeholder="Nombre o código"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
      </label>

      {grupos.length === 0 && <p className="estado">No hay productos que coincidan.</p>}

      {grupos.map((g) => (
        <div className="grupo-proveedor" key={g.proveedor}>
          <h3>
            {g.proveedor} <span className="chico">({g.items.length})</span>
          </h3>
          <div className="tabla-scroll">
            <table className="tabla-items">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Producto</th>
                  <th>Unidad</th>
                  <th className="num">Suma</th>
                  <th className="num">Ajustada</th>
                  <th>Observación</th>
                  {editable && <th />}
                </tr>
              </thead>
              <tbody>
                {g.items.map((it) => (
                  <FilaItem
                    key={it.id}
                    consolidadoId={consolidadoId}
                    item={it}
                    editable={editable}
                    alGuardar={alGuardar}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
