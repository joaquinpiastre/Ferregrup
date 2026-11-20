import { useEffect, useState } from 'react';
import { ChevronRight, CreditCard, Landmark, Lock, MessageCircle, Store, Truck, Wallet } from 'lucide-react';
import { Link, navigate } from '../router';
import { useCart } from '../cart';
import { useStore } from '../context';
import { createOrder, cuota, money, money2, type OrderInput } from '../data';
import { ProductImage, Stepper } from '../ui';

const SAVED = 'elmana_ultimo_pedido';
const CONTACT = 'elmana_datos_compra';

interface Form {
  name: string;
  phone: string;
  email: string;
  delivery: 'envio' | 'retiro';
  address: string;
  city: string;
  payment: 'tarjeta' | 'transferencia' | 'efectivo';
  notes: string;
  website: string;
}

function readContact(): Partial<Form> {
  try {
    return JSON.parse(localStorage.getItem(CONTACT) ?? '{}');
  } catch {
    return {};
  }
}

export default function Checkout() {
  const { lines, setQty, clear } = useCart();
  const { byCode, catalog } = useStore();
  const n = catalog?.settings.cuotas ?? 3;
  const transfer = catalog?.settings.transferPct ?? 0;
  const [form, setForm] = useState<Form>(() => ({
    name: '',
    phone: '',
    email: '',
    delivery: 'envio',
    address: '',
    city: 'San Rafael',
    payment: 'tarjeta',
    notes: '',
    website: '',
    ...readContact(),
  }));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    document.title = 'Finalizar compra · El Maná Distribuidora';
  }, []);

  const items = lines.map((l) => ({ ...l, p: byCode.get(l.code) })).filter((x) => x.p);
  const subtotal = items.reduce((s, x) => s + x.p!.price * x.qty, 0);
  const discount = form.payment === 'transferencia' && transfer > 0 ? Math.round(subtotal * (transfer / 100)) : 0;
  const total = subtotal - discount;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setError('');
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (form.name.trim().length < 2) return setError('Contanos tu nombre.');
    if (form.phone.replace(/\D/g, '').length < 8) return setError('Dejanos un teléfono o WhatsApp válido (con característica).');
    if (form.delivery === 'envio' && form.address.trim().length < 4) return setError('Para el envío necesitamos la dirección.');
    if (sending || items.length === 0) return;
    setSending(true);
    const input: OrderInput = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim() || undefined,
      delivery: form.delivery,
      address: form.delivery === 'envio' ? form.address.trim() : undefined,
      city: form.delivery === 'envio' ? form.city.trim() : undefined,
      payment: form.payment,
      notes: form.notes.trim() || undefined,
      website: form.website,
      items: items.map((x) => ({ code: x.code, qty: x.qty })),
    };
    try {
      const result = await createOrder(input);
      try {
        localStorage.setItem(CONTACT, JSON.stringify({ name: input.name, phone: input.phone, email: input.email ?? '', address: form.address, city: form.city }));
        sessionStorage.setItem(SAVED, JSON.stringify({ ...result, input }));
      } catch {
        /* sin almacenamiento */
      }
      clear();
      navigate(`/pedido/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos registrar el pedido.');
    } finally {
      setSending(false);
    }
  }

  if (catalog && items.length === 0) {
    return (
      <div className="tn-wrap tn-page">
        <div className="tn-empty">
          <h1>Tu carrito está vacío</h1>
          <p>Agregá productos para iniciar la compra.</p>
          <Link to="/productos" className="tn-btn primary">
            Ver productos
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="tn-wrap tn-page">
      <nav className="tn-crumbs" aria-label="Estás en">
        <Link to="/">Inicio</Link>
        <ChevronRight size={14} />
        <span>Finalizar compra</span>
      </nav>
      <h1 className="tn-page-title">Finalizar compra</h1>
      <form className="tn-checkout" onSubmit={submit} noValidate>
        <div className="tn-co-main">
          <section className="tn-co-box">
            <h2>
              <span>1</span> Tus datos
            </h2>
            <div className="tn-fields">
              <label>
                Nombre y apellido
                <input value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" required />
              </label>
              <label>
                Teléfono / WhatsApp
                <input value={form.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" autoComplete="tel" placeholder="260 4123456" required />
              </label>
              <label className="full">
                Email (opcional)
                <input value={form.email} onChange={(e) => set('email', e.target.value)} type="email" autoComplete="email" />
              </label>
              <label className="tn-hp" aria-hidden="true">
                Sitio web
                <input tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => set('website', e.target.value)} />
              </label>
            </div>
          </section>

          <section className="tn-co-box">
            <h2>
              <span>2</span> Entrega
            </h2>
            <div className="tn-options">
              <button type="button" className={form.delivery === 'envio' ? 'on' : ''} onClick={() => set('delivery', 'envio')}>
                <Truck size={20} />
                <span>
                  <b>Envío a domicilio</b>
                  <small>San Rafael y alrededores. El costo y el día los coordinamos por WhatsApp.</small>
                </span>
              </button>
              <button type="button" className={form.delivery === 'retiro' ? 'on' : ''} onClick={() => set('delivery', 'retiro')}>
                <Store size={20} />
                <span>
                  <b>Retiro en el local</b>
                  <small>Sin cargo · Av. Granaderos 575, San Rafael.</small>
                </span>
              </button>
            </div>
            {form.delivery === 'envio' && (
              <div className="tn-fields">
                <label className="full">
                  Dirección
                  <input value={form.address} onChange={(e) => set('address', e.target.value)} autoComplete="street-address" placeholder="Calle, número, barrio" />
                </label>
                <label>
                  Localidad
                  <input value={form.city} onChange={(e) => set('city', e.target.value)} autoComplete="address-level2" />
                </label>
              </div>
            )}
          </section>

          <section className="tn-co-box">
            <h2>
              <span>3</span> Forma de pago
            </h2>
            <div className="tn-options">
              <button type="button" className={form.payment === 'tarjeta' ? 'on' : ''} onClick={() => set('payment', 'tarjeta')}>
                <CreditCard size={20} />
                <span>
                  <b>Tarjeta de crédito o débito</b>
                  <small>{n > 1 ? `Hasta ${n} cuotas sin interés de ${money2(cuota(total, n))}.` : 'En un pago.'} Te enviamos el link de pago seguro.</small>
                </span>
              </button>
              <button type="button" className={form.payment === 'transferencia' ? 'on' : ''} onClick={() => set('payment', 'transferencia')}>
                <Landmark size={20} />
                <span>
                  <b>Transferencia bancaria{transfer > 0 ? ` · ${transfer}% OFF` : ''}</b>
                  <small>Te pasamos los datos de la cuenta al confirmar el pedido.</small>
                </span>
              </button>
              <button type="button" className={form.payment === 'efectivo' ? 'on' : ''} onClick={() => set('payment', 'efectivo')}>
                <Wallet size={20} />
                <span>
                  <b>Efectivo</b>
                  <small>Al retirar en el local o al recibir el pedido.</small>
                </span>
              </button>
            </div>
            <label className="tn-notes">
              Comentarios (opcional)
              <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} placeholder="Horario de entrega, referencias, factura A, etc." />
            </label>
          </section>
        </div>

        <aside className="tn-co-side">
          <div className="tn-co-box sticky">
            <h2>Tu pedido</h2>
            <div className="tn-co-items">
              {items.map(({ code, qty, p }) => (
                <div className="tn-co-item" key={code}>
                  <span className="img">
                    <ProductImage product={p!} size="thumb" />
                  </span>
                  <div>
                    <div className="name">{p!.name}</div>
                    <div className="row">
                      <Stepper small value={qty} min={0} onChange={(v) => setQty(code, v)} />
                      <b>{money(p!.price * qty)}</b>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="tn-sum-row">
              <span>Subtotal</span>
              <span>{money(subtotal)}</span>
            </div>
            {discount > 0 && (
              <div className="tn-sum-row green">
                <span>Descuento por transferencia</span>
                <span>−{money(discount)}</span>
              </div>
            )}
            <div className="tn-sum-row">
              <span>Envío</span>
              <span>{form.delivery === 'retiro' ? 'Sin cargo' : 'A coordinar'}</span>
            </div>
            <div className="tn-sum-row total">
              <span>Total</span>
              <b>{money(total)}</b>
            </div>
            {form.payment === 'tarjeta' && n > 1 && (
              <div className="tn-cuotas center">
                <b>{n} cuotas sin interés</b> de {money2(cuota(total, n))}
              </div>
            )}
            {error && <div className="tn-alert">{error}</div>}
            <button type="submit" className="tn-btn primary block lg" disabled={sending}>
              {sending ? 'Enviando pedido…' : 'Confirmar pedido'}
            </button>
            <p className="tn-co-note">
              <Lock size={13} /> No te cobramos nada ahora. Te escribimos por WhatsApp para confirmar stock, entrega y el pago.
            </p>
            <p className="tn-co-note">
              <MessageCircle size={13} /> ¿Dudas? Consultanos antes de comprar.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
