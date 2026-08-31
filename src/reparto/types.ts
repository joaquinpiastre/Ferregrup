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

export type StaffRole = 'superadmin' | 'admin' | 'repartidor';

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
