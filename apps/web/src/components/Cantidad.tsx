const formato = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 });

export default function Cantidad({
  valor,
  unidad,
  variante = "pedida",
}: {
  valor: number | string;
  unidad: string;
  variante?: "pedida" | "ajustada";
}) {
  const n = Number(valor);
  const texto = Number.isFinite(n) ? formato.format(n) : String(valor);
  const ajustada = variante === "ajustada";
  return (
    <span
      className={ajustada ? "cantidad ajustada" : "cantidad"}
      aria-label={`${ajustada ? "Cantidad ajustada" : "Cantidad"}: ${texto} ${unidad}`}
    >
      <span className="cantidad-valor" aria-hidden="true">
        {texto}
      </span>
      <span className="cantidad-unidad" aria-hidden="true">
        {unidad}
      </span>
    </span>
  );
}
