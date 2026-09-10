export type StreetOrderStatus = 'pendiente' | 'visto' | 'nota' | 'armado' | 'retirado' | 'cancelado';

export interface StreetOrderItem {
  code?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface NearbyClient {
  name: string;
  address: string;
}

export interface StreetOrder {
  id: string;
  streetKey: string;
  streetLabel: string;
  courierId: string;
  courierName: string;
  items: StreetOrderItem[];
  total: number;
  notes?: string;
  nearbyClients: NearbyClient[];
  clientName?: string;
  status: StreetOrderStatus;
  createdAt: number;
}

export type StaffRole = 'admin' | 'repartidor';

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
}

export interface Session {
  token: string;
  staff: Staff;
}

// ─── Clientes de reparto ────────────────────────────────────────────────────

export type FieldClientType = 'cliente' | 'taller';

export interface FieldClient {
  id: string;
  name: string;
  address: string;
  phone?: string;
  notes?: string;
  type: FieldClientType;
  active: boolean;
}

// ─── Catálogo de reparto ────────────────────────────────────────────────────

export interface CatalogProduct {
  code: string;
  description: string;
  unitPrice: number;
  stock: number;
  costPrice?: number;
  ivaRate: number;
}

// ─── Rutas del día ──────────────────────────────────────────────────────────

export type RouteStopStatus = 'pendiente' | 'en_camino' | 'entregado' | 'problema';

export interface RouteStop {
  id: string;
  courierId: string;
  courierName: string;
  clientId: string;
  clientName: string;
  clientAddress: string;
  orderNum: number;
  status: RouteStopStatus;
  adminNotes?: string;
  courierNotes?: string;
  scheduledDate: string;
  arrivedAt?: number;
  leftAt?: number;
}

// ─── Turnos ─────────────────────────────────────────────────────────────────

export interface Shift {
  id: string;
  courierId: string;
  courierName: string;
  startedAt: number;
  endedAt?: number;
  completedCount: number;
  totalCount: number;
  minutesOnRoute?: number;
}

// ─── Cobros ─────────────────────────────────────────────────────────────────

export type PaymentMethod = 'efectivo' | 'transferencia' | 'cheque' | 'otro';

export interface Payment {
  id: string;
  clientId?: string;
  clientName: string;
  courierId: string;
  courierName: string;
  amount: number;
  method: PaymentMethod;
  checkNumber?: string;
  bank?: string;
  notes?: string;
  createdAt: number;
}

// ─── Equipo ─────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
}

// ─── Trackers GPS físicos ───────────────────────────────────────────────────

export interface Tracker {
  imei: string;
  courierId: string;
  name: string;
  active: boolean;
  lastContact?: number;
}

export interface LivePosition {
  courierId: string;
  courierName: string;
  lat: number;
  lng: number;
  timestampMs: number;
}

// ─── Planificación ──────────────────────────────────────────────────────────

export interface DeliveryList {
  id: string;
  name: string;
  weekdays: number[];
  courierId?: string;
  courierName?: string;
  clientCount: number;
}

export interface DeliveryListClient {
  id: string;
  name: string;
  address: string;
  orderNum: number;
}

// ─── Historial ──────────────────────────────────────────────────────────────

export interface ShiftStop {
  clientName: string;
  clientAddress: string;
  status: RouteStopStatus;
  adminNotes?: string;
  courierNotes?: string;
  arrivedAt?: number;
  leftAt?: number;
}

// ─── Ventas (cargos a cuenta de cliente) ─────────────────────────────────────

export interface Sale {
  id: string;
  clientId?: string;
  clientName: string;
  courierId: string;
  courierName: string;
  amount: number;
  description?: string;
  items: StreetOrderItem[];
  createdAt: number;
}

// ─── Cotizaciones (no descuentan stock ni afectan la cuenta corriente) ───────

export interface Quote {
  id: string;
  clientName?: string;
  staffName: string;
  items: StreetOrderItem[];
  total: number;
  notes?: string;
  createdAt: number;
}

// ─── Cuentas de clientes ──────────────────────────────────────────────────────

export interface ClientAccount {
  id: string;
  name: string;
  address: string;
  phone?: string;
  type: FieldClientType;
  charged: number;
  paid: number;
  balance: number;
}

export interface ClientStatementEntry {
  id: string;
  amount: number;
  createdAt: number;
  courierName: string;
  description?: string;
  method?: PaymentMethod;
}

export interface ClientStatement {
  sales: ClientStatementEntry[];
  payments: ClientStatementEntry[];
}

// ─── Objetivos de repartidores ────────────────────────────────────────────────

export type GoalPeriod = 'semanal' | 'mensual';
export type GoalMetric = 'cobros' | 'ventas' | 'ambos';

export interface CourierGoal {
  id: string;
  courierId: string;
  courierName: string;
  periodType: GoalPeriod;
  periodStart: string;
  targetAmount: number;
  metric: GoalMetric;
  achieved: number;
  ventas: number;
  cobros: number;
}

// ─── Proveedores y deudas ──────────────────────────────────────────────────────

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  notes?: string;
  active: boolean;
}

export type SupplierDebtStatus = 'pendiente' | 'pagado';
export type SupplierPaymentMethod = 'efectivo' | 'transferencia' | 'cheque' | 'echeq' | 'otro';

export interface SupplierDebt {
  id: string;
  supplierId: string;
  supplierName: string;
  invoiceNumber?: string;
  amount: number;
  issueDate?: string;
  dueDate?: string;
  status: SupplierDebtStatus;
  paymentMethod?: SupplierPaymentMethod;
  echeqNumber?: string;
  echeqDate?: string;
  notes?: string;
  createdAt: number;
}

// ─── Estadísticas / proyecciones (admin) ───────────────────────────────────────

export interface StatsPeriod {
  actualCobros: number;
  actualVentas: number;
  proyeccionCobros: number;
  proyeccionVentas: number;
}

export interface Stats {
  avgDailyCobros: number;
  avgDailyVentas: number;
  semana: StatsPeriod;
  mes: StatsPeriod;
}

// ─── Log de actividad ──────────────────────────────────────────────────────────

export interface ActivityLogEntry {
  id: string;
  staffId: string;
  staffName: string;
  staffRole: StaffRole;
  action: string;
  summary: string;
  createdAt: number;
}
