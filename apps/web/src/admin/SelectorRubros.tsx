import { useState } from "react";
import type { Opcion } from "../lib/adminApi";

interface Props {
  rubros: Opcion[];
  elegidos: string[];
  alCambiar: (ids: string[]) => void;
  deshabilitado?: boolean;
}

function sinTildes(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export default function SelectorRubros({ rubros, elegidos, alCambiar, deshabilitado }: Props) {
  const [buscar, setBuscar] = useState("");
  const clave = sinTildes(buscar.trim());
  const visibles = clave ? rubros.filter((r) => sinTildes(r.nombre).includes(clave)) : rubros;

  const alternar = (id: string) => {
    alCambiar(elegidos.includes(id) ? elegidos.filter((x) => x !== id) : [...elegidos, id]);
  };

  return (
    <div className="selector-rubros">
      <input
        type="search"
        placeholder="Buscar rubro"
        aria-label="Buscar rubro"
        value={buscar}
        onChange={(e) => setBuscar(e.target.value)}
      />
      <div className="lista-rubros">
        {visibles.length === 0 && <p className="chico">No hay rubros con ese nombre.</p>}
        {visibles.map((r) => (
          <label key={r.id} className="casilla">
            <input
              type="checkbox"
              checked={elegidos.includes(r.id)}
              disabled={deshabilitado}
              onChange={() => alternar(r.id)}
            />
            {r.nombre}
          </label>
        ))}
      </div>
    </div>
  );
}
