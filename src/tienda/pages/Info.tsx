import { useEffect, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { useStore } from '../context';
import { whatsappLink } from '../data';

export function Ayuda() {
  const { catalog } = useStore();
  const n = catalog?.settings.cuotas ?? 3;
  const transfer = catalog?.settings.transferPct ?? 0;
  const wa = whatsappLink(catalog?.settings.whatsapp ?? '5492604696700', 'Hola El Maná! Tengo una consulta sobre una compra.');
  useEffect(() => {
    document.title = 'Ayuda · El Maná Distribuidora';
    const id = window.location.hash.slice(1);
    if (id) window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }, []);
  return (
    <div className="tn-wrap tn-page tn-info">
      <h1 className="tn-page-title">Ayuda</h1>
      <section id="como-comprar">
        <h2>Cómo comprar</h2>
        <ol>
          <li>Elegí los productos y agregalos al carrito.</li>
          <li>Tocá «Iniciar compra», completá tus datos y elegí entrega y forma de pago.</li>
          <li>Confirmá el pedido: no se cobra nada en ese momento.</li>
          <li>Te escribimos por WhatsApp para confirmar stock, el día de entrega y el pago.</li>
        </ol>
      </section>
      <section id="envios">
        <h2>Envíos y retiro</h2>
        <p>{catalog?.settings.shippingNote || 'Envío a domicilio en San Rafael y alrededores. Retiro sin cargo en Av. Granaderos 575.'}</p>
        <p>Para envíos a otras localidades, consultanos: buscamos la mejor opción para que te llegue.</p>
      </section>
      <section id="pagos">
        <h2>Medios de pago</h2>
        <ul>
          <li>
            <b>Tarjetas de crédito:</b> {n > 1 ? `hasta ${n} cuotas sin interés (CFT 0,00%).` : 'en un pago.'} Te enviamos un link de pago seguro.
          </li>
          <li>
            <b>Tarjetas de débito.</b>
          </li>
          <li>
            <b>Transferencia bancaria</b>
            {transfer > 0 ? ` con ${transfer}% de descuento.` : '.'}
          </li>
          <li>
            <b>Efectivo</b> al retirar o al recibir.
          </li>
        </ul>
        <p>Todos los precios publicados son finales e incluyen IVA.</p>
      </section>
      <section id="garantia">
        <h2>Garantía y cambios</h2>
        <p>Todos los productos son originales y tienen la garantía oficial del fabricante. Si algo no funciona o no es lo que esperabas, escribinos y lo resolvemos.</p>
        <p>
          Podés arrepentirte de una compra dentro de los 10 días corridos desde que la recibiste, sin costo ni explicaciones, desde el <a href="/arrepentimiento">Botón de arrepentimiento</a>.
        </p>
      </section>
      <a className="tn-btn wa lg" href={wa} target="_blank" rel="noreferrer">
        <MessageCircle size={18} /> Hablar con nosotros
      </a>
    </div>
  );
}

export function Arrepentimiento() {
  const { catalog } = useStore();
  const [order, setOrder] = useState('');
  const [name, setName] = useState('');
  useEffect(() => {
    document.title = 'Botón de arrepentimiento · El Maná Distribuidora';
  }, []);
  const text = `Hola El Maná. Quiero revocar mi compra (botón de arrepentimiento).\nPedido: ${order || '(sin número)'}\nNombre: ${name || '(sin nombre)'}`;
  return (
    <div className="tn-wrap tn-page tn-info">
      <h1 className="tn-page-title">Botón de arrepentimiento</h1>
      <p>
        Tenés derecho a revocar la compra de cualquier producto dentro de los <b>10 días corridos</b> desde que lo recibiste o retiraste, sin costo ni responsabilidad (Ley 24.240 de Defensa del Consumidor y Resolución
        424/2020). El producto tiene que estar sin uso y en las mismas condiciones en que lo recibiste.
      </p>
      <p>Completá estos datos y mandanos la solicitud. Te respondemos con un código de identificación de tu pedido de revocación dentro de las 24 horas.</p>
      <div className="tn-fields" style={{ maxWidth: 560 }}>
        <label>
          Número de pedido
          <input value={order} onChange={(e) => setOrder(e.target.value)} placeholder="Ej.: 125" />
        </label>
        <label>
          Nombre y apellido
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
      </div>
      <a className="tn-btn primary lg" href={whatsappLink(catalog?.settings.whatsapp ?? '5492604696700', text)} target="_blank" rel="noreferrer">
        Enviar solicitud de arrepentimiento
      </a>
    </div>
  );
}
