import { useState } from "react";
import type { PedidoRevisionDetalle } from "../lib/revisionApi";
import { armarMensajeProveedor, cantidadAComprar } from "./mensajeProveedor";

export default function MensajeProveedor({ pedido }: { pedido: PedidoRevisionDetalle }) {
  const [copiado, setCopiado] = useState(false);
  const [errorCopia, setErrorCopia] = useState(false);
  const texto = armarMensajeProveedor(pedido.sucursal, pedido.items);
  const numero = (pedido.proveedor?.telefono ?? "").replace(/\D/g, "");

  const abrirWhatsApp = () => {
    const url = `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      setErrorCopia(false);
    } catch {
      setCopiado(false);
      setErrorCopia(true);
    }
  };

  if (!pedido.items.some((i) => cantidadAComprar(i) > 0)) {
    return (
      <section className="bloque">
        <h2>Mensaje para el proveedor</h2>
        <p className="estado">Todo sale del galpón: no hay nada para comprarle al proveedor.</p>
      </section>
    );
  }

  return (
    <section className="bloque">
      <h2>Mensaje para el proveedor</h2>
      <textarea readOnly rows={Math.min(14, texto.split("\n").length + 1)} value={texto} />
      {numero === "" && (
        <p className="chico">
          El proveedor no tiene WhatsApp cargado: vas a tener que elegir el contacto.
        </p>
      )}
      <div className="acciones">
        <button className="boton" type="button" onClick={abrirWhatsApp}>
          Enviar por WhatsApp
        </button>
        <button className="boton secundario" type="button" onClick={() => void copiar()}>
          Copiar
        </button>
      </div>
      {copiado && <p className="ok">Copiado</p>}
      {errorCopia && (
        <p className="error" role="alert">
          No se pudo copiar. Seleccioná el texto y copialo a mano.
        </p>
      )}
    </section>
  );
}
