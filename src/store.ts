import type { AppData } from './types';

const STORAGE_KEY = 'ferregrup_data';

const defaultData: AppData = {
  products: [
    { id: '1', name: 'Taladro Percutor 13mm', category: 'Herramientas', brand: 'Bosch', sku: 'TAL-001', stock: 8, minStock: 3, costPrice: 45000, salePrice: 62000, unit: 'unidad', description: 'Taladro percutor 650W con maletín', createdAt: '2026-04-10', updatedAt: '2026-04-10' },
    { id: '2', name: 'Cinta métrica 5m', category: 'Herramientas', brand: 'Stanley', sku: 'CIN-001', stock: 25, minStock: 10, costPrice: 1800, salePrice: 2900, unit: 'unidad', description: 'Cinta métrica con freno automático', createdAt: '2026-04-10', updatedAt: '2026-04-10' },
    { id: '3', name: 'Cable Unipolar 2.5mm x 100m', category: 'Electricidad', brand: 'Prysmian', sku: 'CAB-001', stock: 5, minStock: 5, costPrice: 18000, salePrice: 24500, unit: 'rollo', description: 'Cable unipolar IRAM 2,5mm²', createdAt: '2026-04-10', updatedAt: '2026-04-10' },
    { id: '4', name: 'Pintura látex interior blanco 20L', category: 'Pintura', brand: 'Sinteplast', sku: 'PIN-001', stock: 12, minStock: 5, costPrice: 9500, salePrice: 14200, unit: 'balde', description: 'Pintura látex interior acabado mate', createdAt: '2026-04-10', updatedAt: '2026-04-10' },
    { id: '5', name: 'Tornillo tirafondo 6x50 (caja 200u)', category: 'Fijaciones', brand: 'Genérico', sku: 'TOR-001', stock: 2, minStock: 8, costPrice: 850, salePrice: 1400, unit: 'caja', description: 'Tornillo tirafondo con cabeza Phillips', createdAt: '2026-04-10', updatedAt: '2026-04-10' },
    { id: '6', name: 'Caño PVC 110mm x 3m', category: 'Plomería', brand: 'Nicoll', sku: 'CAÑ-001', stock: 18, minStock: 6, costPrice: 2200, salePrice: 3400, unit: 'unidad', description: 'Caño PVC presión roscado', createdAt: '2026-04-10', updatedAt: '2026-04-10' },
  ],
  debtors: [
    { id: '1', type: 'empresa', name: 'Carlos Rodríguez', company: 'Constructora Rodríguez SRL', phone: '011-4567-8901', email: 'carlos@constructora.com', address: 'Av. San Martín 1234', cuit: '30-71234567-8', totalDebt: 185000, amountPaid: 60000, installmentAmount: 30000, paymentFrequency: 'mensual', nextPaymentDate: '2026-05-01', status: 'parcial', payments: [{ id: '1', amount: 30000, date: '2026-03-01', note: 'Cuota marzo' }, { id: '2', amount: 30000, date: '2026-04-01', note: 'Cuota abril' }], notes: 'Paga el primer lunes de cada mes.', createdAt: '2026-03-01' },
    { id: '2', type: 'persona', name: 'María González', phone: '011-5678-9012', email: 'maria.g@gmail.com', address: 'Corrientes 567 3°B', cuit: '', totalDebt: 32000, amountPaid: 24000, installmentAmount: 4000, paymentFrequency: 'semanal', nextPaymentDate: '2026-05-11', status: 'parcial', payments: [{ id: '1', amount: 4000, date: '2026-04-20', note: 'Cuota semana 1' }, { id: '2', amount: 4000, date: '2026-04-27', note: 'Cuota semana 2' }, { id: '3', amount: 4000, date: '2026-05-04', note: 'Cuota semana 3' }, { id: '4', amount: 4000, date: '2026-05-11', note: 'Cuota semana 4' }, { id: '5', amount: 4000, date: '2026-05-11', note: 'Cuota semana 5' }, { id: '6', amount: 4000, date: '2026-05-11', note: 'Cuota semana 6' }], notes: 'Compró materiales para reforma del baño.', createdAt: '2026-04-15' },
    { id: '3', type: 'empresa', name: 'Diego Fernández', company: 'ElectroDiego SA', phone: '011-6789-0123', email: 'info@electrodiego.com', address: 'Florida 890', cuit: '30-65432198-7', totalDebt: 95000, amountPaid: 95000, installmentAmount: 0, paymentFrequency: 'mensual', nextPaymentDate: '2026-06-01', status: 'pagado', payments: [{ id: '1', amount: 95000, date: '2026-05-01', note: 'Cancelación total' }], notes: 'Excelente cliente, siempre puntual.', createdAt: '2026-03-01' },
  ],
  orders: [
    { id: '1', supplier: 'Distribuidora Norte SRL', items: [{ productId: '5', productName: 'Tornillo tirafondo 6x50 (caja 200u)', quantity: 20, unitCost: 850 }, { productId: '3', productName: 'Cable Unipolar 2.5mm x 100m', quantity: 5, unitCost: 18000 }], total: 107000, status: 'en_camino', orderDate: '2026-05-08', estimatedDate: '2026-05-15', notes: 'Pedido urgente por stock bajo', invoiceNumber: 'A-00234' },
    { id: '2', supplier: 'Bosch Argentina', items: [{ productId: '1', productName: 'Taladro Percutor 13mm', quantity: 4, unitCost: 45000 }], total: 180000, status: 'pendiente', orderDate: '2026-05-10', estimatedDate: '2026-05-22', notes: '', invoiceNumber: '' },
    { id: '3', supplier: 'Pinturas del Sur', items: [{ productId: '4', productName: 'Pintura látex interior blanco 20L', quantity: 10, unitCost: 9500 }], total: 95000, status: 'recibido', orderDate: '2026-04-20', estimatedDate: '2026-04-27', receivedDate: '2026-04-26', notes: 'Llegó un día antes', invoiceNumber: 'B-00891' },
  ],
  routes: [
    { id: 'r1', name: 'Ruta Norte', day: 'lunes', clientIds: ['c1', 'c3'], color: '#60a5fa', notes: 'Zona norte, salir 8am' },
    { id: 'r2', name: 'Ruta Centro', day: 'miercoles', clientIds: ['c2', 'c4'], color: '#4ade80', notes: 'Zona centro' },
    { id: 'r3', name: 'Ruta Sur', day: 'viernes', clientIds: ['c5'], color: '#fb923c', notes: 'Zona sur, confirmar antes' },
  ],
  clients: [
    { id: 'c1', name: 'Taller García', category: 'taller', contact: 'Juan García', phone: '011-2345-6789', email: 'juan@tallergarcia.com', address: 'Av. Rivadavia 2345, CABA', zone: 'Norte', cuit: '20-28345678-1', creditLimit: 200000, currentBalance: 85000, routeId: 'r1', notes: 'Pide herramientas y fijaciones. Buen pagador.', createdAt: '2026-02-01' },
    { id: 'c2', name: 'Ferretería El Tornillo', category: 'ferreteria', contact: 'Marta López', phone: '011-3456-7890', email: 'marta@eltornillo.com', address: 'Corrientes 1890, CABA', zone: 'Centro', cuit: '30-55678901-4', creditLimit: 500000, currentBalance: 230000, routeId: 'r2', notes: 'Gran volumen. Paga a 30 días.', createdAt: '2026-01-15' },
    { id: 'c3', name: 'Mecánica Rápida SA', category: 'taller', contact: 'Pablo Sosa', phone: '011-4567-8901', email: 'pablo@mecanicaRapida.com', address: 'Independencia 567, CABA', zone: 'Norte', cuit: '30-44556677-8', creditLimit: 150000, currentBalance: 0, routeId: 'r1', notes: 'Compra poco pero seguido.', createdAt: '2026-02-10' },
    { id: 'c4', name: 'Ferretería Central', category: 'ferreteria', contact: 'Roberto Díaz', phone: '011-5678-9012', email: 'info@ferrcentral.com', address: 'Belgrano 3400, CABA', zone: 'Centro', cuit: '30-66778899-2', creditLimit: 350000, currentBalance: 120000, routeId: 'r2', notes: 'Segundo mejor cliente. Siempre paga puntual.', createdAt: '2026-01-20' },
    { id: 'c5', name: 'Autoservicio Mecánico Sur', category: 'taller', contact: 'Claudia Torres', phone: '011-6789-0123', email: 'claudia@mecasur.com', address: 'Av. Vélez Sarsfield 890, CABA', zone: 'Sur', cuit: '27-35678901-3', creditLimit: 100000, currentBalance: 45000, routeId: 'r3', notes: 'Prefiere entrega antes del mediodía.', createdAt: '2026-03-05' },
  ],
  remits: [
    { id: 'rem1', number: 'R-0001', clientId: 'c2', clientName: 'Ferretería El Tornillo', items: [{ productId: '2', productName: 'Cinta métrica 5m', quantity: 10, unitPrice: 2900 }, { productId: '5', productName: 'Tornillo tirafondo 6x50 (caja 200u)', quantity: 5, unitPrice: 1400 }], subtotal: 36000, discount: 0, total: 36000, status: 'cobrado', date: '2026-04-30', deliveredDate: '2026-04-30', notes: '', routeId: 'r2' },
    { id: 'rem2', number: 'R-0002', clientId: 'c1', clientName: 'Taller García', items: [{ productId: '1', productName: 'Taladro Percutor 13mm', quantity: 1, unitPrice: 62000 }, { productId: '2', productName: 'Cinta métrica 5m', quantity: 3, unitPrice: 2900 }], subtotal: 70700, discount: 5000, total: 65700, status: 'entregado', date: '2026-05-05', deliveredDate: '2026-05-05', notes: 'Descuento por volumen', routeId: 'r1' },
    { id: 'rem3', number: 'R-0003', clientId: 'c4', clientName: 'Ferretería Central', items: [{ productId: '4', productName: 'Pintura látex interior blanco 20L', quantity: 5, unitPrice: 14200 }, { productId: '6', productName: 'Caño PVC 110mm x 3m', quantity: 8, unitPrice: 3400 }], subtotal: 98200, discount: 0, total: 98200, status: 'entregado', date: '2026-05-07', deliveredDate: '2026-05-07', notes: '', routeId: 'r2' },
    { id: 'rem4', number: 'R-0004', clientId: 'c5', clientName: 'Autoservicio Mecánico Sur', items: [{ productId: '3', productName: 'Cable Unipolar 2.5mm x 100m', quantity: 2, unitPrice: 24500 }], subtotal: 49000, discount: 4000, total: 45000, status: 'borrador', date: '2026-05-12', deliveredDate: '', notes: 'Para la ruta del viernes', routeId: 'r3' },
  ],
};

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppData;
      // Migrations for new fields
      parsed.debtors = parsed.debtors.map(d => ({ ...d, installmentAmount: d.installmentAmount ?? 0 }));
      if (!parsed.clients) parsed.clients = defaultData.clients;
      if (!parsed.remits) parsed.remits = defaultData.remits;
      if (!parsed.routes) parsed.routes = defaultData.routes;
      return parsed;
    }
  } catch {}
  return defaultData;
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

export function advancePaymentDate(date: string, frequency: 'semanal' | 'mensual'): string {
  const d = new Date(date + 'T12:00:00');
  if (frequency === 'semanal') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d.toISOString().slice(0, 10);
}

export function isOverdue(nextPaymentDate: string): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(nextPaymentDate + 'T00:00:00') < today;
}

export function nextRemitNumber(remits: AppData['remits']): string {
  const max = remits.reduce((n, r) => {
    const num = parseInt(r.number.replace('R-', ''), 10);
    return isNaN(num) ? n : Math.max(n, num);
  }, 0);
  return `R-${String(max + 1).padStart(4, '0')}`;
}
