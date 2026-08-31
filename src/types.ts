export type ProductCategory =
  | 'Herramientas'
  | 'Electricidad'
  | 'Plomería'
  | 'Pintura'
  | 'Construcción'
  | 'Fijaciones'
  | 'Seguridad'
  | 'Jardín'
  | 'Otros';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  brand: string;
  sku: string;
  stock: number;
  minStock: number;
  costPrice: number;
  salePrice: number;
  unit: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Deudores ────────────────────────────────────────────────────────────────

export type ClientType = 'persona' | 'empresa';
export type PaymentFrequency = 'semanal' | 'mensual';
export type DebtStatus = 'activo' | 'parcial' | 'pagado';

export interface DebtPayment {
  id: string;
  amount: number;
  date: string;
  note: string;
}

export interface Debtor {
  id: string;
  type: ClientType;
  name: string;
  company?: string;
  phone: string;
  email: string;
  address: string;
  cuit?: string;
  totalDebt: number;
  amountPaid: number;
  installmentAmount: number;
  paymentFrequency: PaymentFrequency;
  nextPaymentDate: string;
  status: DebtStatus;
  payments: DebtPayment[];
  notes: string;
  createdAt: string;
}

// ─── Pedidos de compra ────────────────────────────────────────────────────────

export type OrderStatus = 'pendiente' | 'en_camino' | 'recibido' | 'cancelado';

export interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unitCost: number;
}

export interface Order {
  id: string;
  supplier: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  orderDate: string;
  estimatedDate: string;
  receivedDate?: string;
  notes: string;
  invoiceNumber: string;
}

// ─── Clientes (distribución) ──────────────────────────────────────────────────

export type ClientCategory = 'taller' | 'ferreteria' | 'otro';

export interface Client {
  id: string;
  name: string;
  category: ClientCategory;
  contact: string;
  phone: string;
  email: string;
  address: string;
  zone: string;
  cuit: string;
  creditLimit: number;
  currentBalance: number;
  routeId: string;
  notes: string;
  createdAt: string;
}

// ─── Ventas / Remitos ─────────────────────────────────────────────────────────

export type RemitStatus = 'borrador' | 'entregado' | 'cobrado' | 'cancelado';

export interface RemitItem {
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
}

export interface Remit {
  id: string;
  number: string;
  clientId: string;
  clientName: string;
  items: RemitItem[];
  subtotal: number;
  discount: number;
  total: number;
  status: RemitStatus;
  date: string;
  deliveredDate: string;
  notes: string;
  routeId: string;
}

// ─── Rutas de distribución ────────────────────────────────────────────────────

export type RouteDay = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado';

export interface Route {
  id: string;
  name: string;
  day: RouteDay;
  clientIds: string[];
  color: string;
  notes: string;
}

// ─── AppData ──────────────────────────────────────────────────────────────────

export interface AppData {
  products: Product[];
  debtors: Debtor[];
  orders: Order[];
  clients: Client[];
  remits: Remit[];
  routes: Route[];
}
