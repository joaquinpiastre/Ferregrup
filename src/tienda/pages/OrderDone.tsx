import { useEffect, useMemo } from 'react';
import { CheckCircle2, MessageCircle } from 'lucide-react';
import { Link } from '../router';
import { useStore } from '../context';
import { money, whatsappLink, type OrderInput, type OrderResult } from '../data';

const KEY = 'elmana_ultimo_pedido';
const PAY: Record<OrderInput['payment'], string> = { tarjeta: 'Tarjeta (cuotas sin interés)', transferencia: 'Transferencia', efectivo: 'Efectivo' };

export default function OrderDone({ id }: { id: string }) {
  const { catalog } = useStore();
  const saved = useMemo(() => {
    try {
      const o = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as (OrderResult & { input: OrderInput }) | null;
      return o && String(o.id) === id ? o : null;
    } catch {
      return null;
    }
  }, [id]);

  useEffect(() => {
    document.title = `Pedido #${id} recibido · El Maná Distribuidora`;
  }, [id]);

  const phone = saved?.whatsapp ?? catalog?.settings.whatsapp ?? '5492604696700';
  const text = saved
    ? [
        `Hola El Maná! Hice el pedido #${saved.id} en la tienda online:`,
        ...saved.items.map((i) => `• ${i.qty} x ${i.name} (${money(i.subtotal)})`),
        `Total: ${money(saved.total)}`,
        `Entrega: ${saved.input.delivery === 'envio' ? `envío a ${saved.input.address ?? ''}${saved.input.city ? `, ${saved.input.city}` : ''}` : 'retiro en el local'}`,
        `Pago: ${PAY[saved.input.payment]}`,
        `A nombre de: ${saved.input.name}`,
      ].join('\n')
    : `Hola El Maná! Hice el pedido #${id} en la tienda online.`;

  return (
    <div className="tn-wrap tn-page">
      <div className="tn-done">
        <CheckCircle2 size={56} className="ok" />
        <h1>¡Gracias! Recibimos tu pedido #{id}</h1>
        <p>Te vamos a escribir por WhatsApp para confirmar stock, entrega y el pago. Si querés agilizarlo, mandanos el pedido ahora:</p>
        <a className="tn-btn wa lg" href={whatsappLink(phone, text)} target="_blank" rel="noreferrer">
          <MessageCircle size={19} /> Enviar el pedido por WhatsApp
        </a>
        {saved && (
          <div className="tn-done-sum">
            {saved.items.map((i) => (
              <div key={i.code} className="tn-sum-row">
                <span>
                  {i.qty} x {i.name}
                </span>
                <span>{money(i.subtotal)}</span>
              </div>
            ))}
            {saved.discount > 0 && (
              <div className="tn-sum-row green">
                <span>Descuento por transferencia</span>
                <span>−{money(saved.discount)}</span>
              </div>
            )}
            <div className="tn-sum-row total">
              <span>Total</span>
              <b>{money(saved.total)}</b>
            </div>
          </div>
        )}
        <Link to="/" className="tn-btn ghost">
          Seguir comprando
        </Link>
      </div>
    </div>
  );
}
