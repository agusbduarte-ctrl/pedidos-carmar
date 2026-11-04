import { useEffect, useState } from "react";
import {
  activarAvisos,
  claveAvisos,
  desactivarAvisos,
  estadoAvisos,
  resincronizarAvisos,
  type EstadoAvisos,
} from "../lib/push";

const MSJ_BLOQUEADO = "Avisos bloqueados: habilitalos en el candado de la barra del navegador";

export default function BotonAvisos() {
  const [clave, setClave] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoAvisos>("no-soportado");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const c = await claveAvisos();
        if (!vivo || !c) return;
        const e = await estadoAvisos();
        if (!vivo) return;
        setClave(c);
        setEstado(e);
        if (e === "activo") void resincronizarAvisos();
      } catch {
        // Sin clave o sin conexión: el botón queda oculto.
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (!clave || estado === "no-soportado") return null;

  const tocar = async () => {
    if (estado === "bloqueado") return;
    setOcupado(true);
    setError(null);
    try {
      if (estado === "activo") await desactivarAvisos();
      else await activarAvisos(clave);
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : "No se pudo cambiar los avisos. Probá de nuevo.");
    } finally {
      setEstado(await estadoAvisos().catch(() => "inactivo" as const));
      setOcupado(false);
    }
  };

  return (
    <div className="avisos">
      <div className="avisos-interior">
        {estado === "bloqueado" ? (
          <span className="avisos-texto">{MSJ_BLOQUEADO}</span>
        ) : (
          <button className="avisos-boton" onClick={tocar} disabled={ocupado} aria-pressed={estado === "activo"}>
            {estado === "activo" ? "Avisos activados" : "Activar avisos"}
          </button>
        )}
        {error && estado !== "bloqueado" && (
          <span className="avisos-texto" role="alert">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
