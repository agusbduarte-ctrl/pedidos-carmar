import { useQuery } from "@tanstack/react-query";
import { adminApi, type PeriodoAdmin } from "../lib/adminApi";

function cantidad(n: number | null): string {
  return n === null ? "no se pudo calcular" : String(n);
}

// Aviso que se muestra antes de cerrar un período
export default function ResumenCierre({ periodo }: { periodo: PeriodoAdmin }) {
  const conteo = useQuery({
    queryKey: ["admin", "periodos", "conteo", periodo.id],
    queryFn: () => adminApi.conteoCierre(periodo.id),
    gcTime: 0,
    staleTime: 0,
  });

  return (
    <>
      <p>¿Cerrar el período {periodo.nombre}? No se puede reabrir.</p>
      {conteo.isPending && <p className="chico">Calculando pedidos...</p>}
      {conteo.isError && (
        <p className="chico">No se pudo calcular el estado de los pedidos. Igual podés cerrarlo.</p>
      )}
      {conteo.data && (
        <ul className="resumen-cierre">
          <li>
            Pedidos sin enviar (borrador): <strong>{cantidad(conteo.data.borradores)}</strong>. No
            se van a poder enviar.
          </li>
          <li>
            Pedidos devueltos: <strong>{cantidad(conteo.data.devueltos)}</strong>. No se van a
            poder volver a enviar.
          </li>
          <li>
            Pedidos enviados esperando aprobación: <strong>{cantidad(conteo.data.enviados)}</strong>
            . La encargada todavía puede aprobarlos o devolverlos.
          </li>
          <li>
            Consolidado aprobado:{" "}
            <strong>
              {conteo.data.aprobado === null
                ? "no se pudo calcular"
                : conteo.data.aprobado
                  ? "sí"
                  : "no"}
            </strong>
          </li>
        </ul>
      )}
    </>
  );
}
