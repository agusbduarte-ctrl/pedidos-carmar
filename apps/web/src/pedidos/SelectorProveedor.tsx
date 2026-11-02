import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { pedidosApi } from "../lib/pedidosApi";

interface Props {
  deshabilitado: boolean;
  alElegir: (proveedorId: string | undefined) => void;
  alCancelar: () => void;
}

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export default function SelectorProveedor({ deshabilitado, alElegir, alCancelar }: Props) {
  const [texto, setTexto] = useState("");
  const proveedores = useQuery({ queryKey: ["pedidos", "proveedores"], queryFn: pedidosApi.proveedores });
  const filtro = sinTildes(texto.trim());
  const lista = (proveedores.data ?? []).filter((p) => sinTildes(p.nombre).includes(filtro));

  return (
    <div>
      <label>
        ¿A qué proveedor le pedís?
        <input
          type="search"
          value={texto}
          placeholder="Buscá por nombre"
          onChange={(e) => setTexto(e.target.value)}
        />
      </label>
      {proveedores.isPending && <p className="chico">Cargando proveedores...</p>}
      {proveedores.isError && (
        <p className="error" role="alert">
          {proveedores.error instanceof ApiError
            ? proveedores.error.message
            : "No se pudo cargar los proveedores."}
        </p>
      )}
      {proveedores.data && lista.length === 0 && (
        <p className="chico">No hay proveedores con ese nombre.</p>
      )}
      <ul className="lista lista-plana">
        {lista.map((p) => (
          <li key={p.id}>
            <button
              className="boton secundario"
              type="button"
              disabled={deshabilitado}
              onClick={() => alElegir(p.id)}
            >
              {p.nombre}
            </button>
          </li>
        ))}
        <li>
          <button
            className="boton secundario"
            type="button"
            disabled={deshabilitado}
            onClick={() => alElegir(undefined)}
          >
            Otro / sin proveedor
          </button>
        </li>
      </ul>
      <button className="boton secundario" type="button" disabled={deshabilitado} onClick={alCancelar}>
        Cancelar
      </button>
    </div>
  );
}
