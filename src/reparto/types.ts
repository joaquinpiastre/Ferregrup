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

/** admin: todo · repartidor: vende, cobra y reparte · vendedor: vende y cobra (sin reparto). */
export type StaffRole = 'admin' | 'repartidor' | 'vendedor';

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
  installmentId?: string;
  createdAt: number;
}

// ─── Camioneta ──────────────────────────────────────────────────────────────

export type VanMovementKind = 'carga' | 'devolucion' | 'muestra';

export interface VanItem {
  code: string;
  description: string;
  unitPrice: number;
  quantity: number;
}

export interface VanMovement {
  id: string;
  code: string;
  description: string;
  quantity: number;
  kind: VanMovementKind;
  courierId?: string;
  courierName?: string;
  notes?: string;
  staffName: string;
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

export interface SaleInstallment {
  id: string;
  number: number;
  amount: number;
  dueDate?: string;
  paid: number;
}

export interface Sale {
  id: string;
  clientId?: string;
  clientName: string;
  courierId: string;
  courierName: string;
  amount: number;
  description?: string;
  items: StreetOrderItem[];
  installmentsTotal?: number;
  installments: SaleInstallment[];
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
  /** Vendedor que lo atiende: el de su venta más reciente. */
  seller?: string | null;
  sellerId?: string | null;
  /** Vencimiento (AAAA-MM-DD) de la cuota sin cobrar más próxima, y cuánto vence ese día. */
  nextDue?: string | null;
  nextDueAmount?: number | null;
  /** Cuotas vencidas en semanas anteriores y todavía sin cobrar (igual que el panel Atrasados). */
  overdue: number;
  overdueCount: number;
  /** Lo que le vence esta semana (lunes a domingo). */
  dueThisWeek: number;
}

export interface ClientStatementEntry {
  id: string;
  amount: number;
  createdAt: number;
  courierName: string;
  description?: string;
  method?: PaymentMethod;
  items?: StreetOrderItem[];
  installmentsTotal?: number;
  installments?: SaleInstallment[];
  installmentId?: string;
}

export interface ClientStatement {
  sales: ClientStatementEntry[];
  payments: ClientStatementEntry[];
}

// ─── Objetivos de repartidores ────────────────────────────────────────────────

export interface WeeklyGoal {
  weekStart: string;
  weekEnd: string;
  state: 'pasada' | 'actual' | 'futura';
  /** Cuotas que vencen esa semana. */
  due: number;
  /** Lo que venía sin cobrar de semanas anteriores. */
  carry: number;
  target: number;
  collected: number;
  /** Lo que falta cobrar (target - collected, nunca negativo). */
  pending: number;
}

export interface CourierWeeklyGoals {
  courierId: string;
  courierName: string;
  weeks: WeeklyGoal[];
}

// ─── Atrasados ────────────────────────────────────────────────────────────────

export interface OverdueInstallment {
  id: string;
  saleId: string;
  number: number;
  total: number;
  dueDate: string;
  weeksLate: number;
  amount: number;
  paid: number;
  remaining: number;
  courierName: string;
}

export interface OverdueClient {
  clientId: string | null;
  clientName: string;
  courierNames: string[];
  overdueCount: number;
  totalRemaining: number;
  maxWeeksLate: number;
  installments: OverdueInstallment[];
}

export interface OverdueReport {
  clients: OverdueClient[];
  totalRemaining: number;
  totalInstallments: number;
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

// ─── Asistente de IA ────────────────────────────────────────────────────────────

export type AiAccess = 'off' | 'read' | 'write';

export interface AiMe {
  enabled: boolean;
  globallyEnabled: boolean;
  access: AiAccess;
  apiConfigured: boolean;
  requireConfirmation: boolean;
  model: { id: string; name: string } | null;
  spentUsd: number;
  limitUsd: number | null;
}

export interface AiConversationSummary {
  id: string;
  title: string;
  updatedAt: number;
  hasPending: boolean;
}

export type AiToolStatus = 'ok' | 'error' | 'cancelado' | 'pendiente' | 'running';

export type AiChatItem =
  | { kind: 'user'; id: string; text: string; at?: number }
  | { kind: 'assistant'; id: string; text: string; at?: number }
  | { kind: 'tool'; id: string; name: string; label: string; status: AiToolStatus; summary?: string }
  | { kind: 'error'; id: string; text: string };

export interface AiConfirmAction {
  id: string;
  title: string;
  details: string[];
  warning?: string;
}

export interface AiConversation {
  id: string;
  title: string;
  items: AiChatItem[];
  pending: AiConfirmAction[] | null;
  contextTokens: number;
  running: boolean;
  roleChanged: boolean;
}

export type AiEvent =
  | { type: 'iteration' }
  | { type: 'retry' }
  | { type: 'text'; text: string }
  | { type: 'tool_start'; id: string; name: string; label: string }
  | { type: 'tool_end'; id: string; status: 'ok' | 'error' | 'cancelado'; summary: string }
  | { type: 'confirm'; actions: AiConfirmAction[] }
  | { type: 'usage'; costUsd: number; spentUsd: number; limitUsd: number | null }
  | { type: 'error'; message: string }
  | { type: 'done' };

export type AiEffort = 'auto' | 'low' | 'medium' | 'high';
export type AiLimitMode = 'default' | 'none' | 'custom';

export interface AiSettings {
  enabled: boolean;
  defaultModel: string;
  effort: AiEffort;
  requireConfirmation: boolean;
  globalMonthlyLimitUsd: number | null;
  defaultUserLimitUsd: number | null;
}

export interface AiModelInfo {
  id: string;
  name: string;
  bestFor: string;
  description: string;
  goodAt: string[];
  notIdealFor: string;
  speed: string;
  inputPerMTok: number;
  outputPerMTok: number;
  recommended?: boolean;
  note?: string;
  typicalQuestionUsd: number;
}

export interface AiUserRow {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  access: AiAccess | 'default';
  effectiveAccess: AiAccess;
  defaultAccess: AiAccess;
  model: string | null;
  effectiveModel: string;
  limitMode: AiLimitMode;
  customLimitUsd: number | null;
  limitUsd: number | null;
  spentUsd: number;
  spentPrevUsd: number;
  callsThisMonth: number;
  lastUsedAt: number | null;
}

export interface AiOverview {
  settings: AiSettings;
  apiConfigured: boolean;
  models: AiModelInfo[];
  users: AiUserRow[];
  totals: { spentUsd: number; spentPrevUsd: number };
  byModel: { model: string; name: string; costUsd: number; calls: number; inputTokens: number; outputTokens: number }[];
}
