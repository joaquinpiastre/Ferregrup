import type {
  ActivityLogEntry,
  CatalogProduct,
  ClientAccount,
  ClientStatement,
  CourierGoal,
  DeliveryList,
  DeliveryListClient,
  FieldClient,
  GoalMetric,
  GoalPeriod,
  LivePosition,
  Payment,
  Quote,
  RouteStop,
  RouteStopStatus,
  Sale,
  Session,
  Shift,
  ShiftStop,
  Staff,
  StaffRole,
  Stats,
  StreetOrder,
  StreetOrderItem,
  StreetOrderStatus,
  Supplier,
  SupplierDebt,
  SupplierPaymentMethod,
  TeamMember,
  Tracker,
} from './types';

const API_URL = import.meta.env.VITE_API_URL as string | undefined;
const SESSION_KEY = 'ferregrup_reparto_session';
const POLL_INTERVAL_MS = 8000;

export function apiEnabled(): boolean {
  return !!API_URL;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(session: Session | null): void {
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
}

async function request<T>(path: string, options: RequestInit = {}, token?: string): Promise<T> {
  if (!API_URL) throw new Error('El servidor de reparto no está configurado (falta VITE_API_URL).');
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

export async function fetchStaffList(token: string): Promise<Staff[]> {
  const data = await request<{ staff: Staff[] }>('/staff', {}, token);
  return data.staff;
}

export async function login(id: string, pin: string): Promise<Session> {
  return request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ id, pin }) });
}

// ─── Pedidos en la calle ────────────────────────────────────────────────────

export async function fetchStreetOrders(token: string): Promise<StreetOrder[]> {
  const data = await request<{ orders: StreetOrder[] }>('/street-orders', {}, token);
  return data.orders;
}

export async function createStreetOrder(
  token: string,
  order: Omit<StreetOrder, 'id' | 'createdAt'>
): Promise<StreetOrder> {
  const createdAt = Date.now();
  const full: StreetOrder = {
    ...order,
    createdAt,
    id: `pc-${createdAt}-${Math.random().toString(36).slice(2, 7)}`,
  };
  await request('/street-orders', { method: 'POST', body: JSON.stringify(full) }, token);
  return full;
}

export async function updateStreetOrderStatus(
  token: string,
  id: string,
  status: StreetOrderStatus,
  note?: string
): Promise<void> {
  await request(`/street-orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, note }) }, token);
}

export async function updateStreetOrderNotes(token: string, id: string, notes: string): Promise<void> {
  await request(`/street-orders/${id}/notes`, { method: 'PATCH', body: JSON.stringify({ notes }) }, token);
}

export async function deleteStreetOrder(token: string, id: string): Promise<void> {
  await request(`/street-orders/${id}`, { method: 'DELETE' }, token);
}

export function subscribeStreetOrders(
  token: string,
  onChange: (orders: StreetOrder[]) => void,
  onError?: (err: unknown) => void
): () => void {
  return poll(() => fetchStreetOrders(token), onChange, onError);
}

function poll<T>(fetcher: () => Promise<T>, onChange: (v: T) => void, onError?: (err: unknown) => void): () => void {
  let cancelled = false;
  const load = async () => {
    try {
      const v = await fetcher();
      if (!cancelled) onChange(v);
    } catch (err) {
      if (!cancelled) onError?.(err);
    }
  };
  void load();
  const interval = setInterval(() => void load(), POLL_INTERVAL_MS);
  return () => {
    cancelled = true;
    clearInterval(interval);
  };
}

// ─── Clientes de reparto ────────────────────────────────────────────────────

export async function fetchClients(token: string): Promise<FieldClient[]> {
  const data = await request<{ clients: FieldClient[] }>('/clients', {}, token);
  return data.clients;
}

export async function createClient(token: string, client: Omit<FieldClient, 'active'>): Promise<void> {
  await request('/clients', { method: 'POST', body: JSON.stringify(client) }, token);
}

export async function updateClient(token: string, id: string, patch: Partial<Omit<FieldClient, 'id' | 'active'>>): Promise<void> {
  await request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, token);
}

export async function deleteClient(token: string, id: string): Promise<void> {
  await request(`/clients/${id}`, { method: 'DELETE' }, token);
}

export function subscribeClients(token: string, onChange: (clients: FieldClient[]) => void): () => void {
  return poll(() => fetchClients(token), onChange);
}

// ─── Catálogo de reparto ────────────────────────────────────────────────────

export async function fetchCatalog(token: string): Promise<CatalogProduct[]> {
  const data = await request<{ products: CatalogProduct[] }>('/catalog', {}, token);
  return data.products;
}

export async function upsertCatalogProduct(token: string, product: CatalogProduct): Promise<void> {
  await request('/catalog', { method: 'POST', body: JSON.stringify(product) }, token);
}

export async function deleteCatalogProduct(token: string, code: string): Promise<void> {
  await request(`/catalog/${encodeURIComponent(code)}`, { method: 'DELETE' }, token);
}

export interface CatalogImportPreview {
  rows: CatalogProduct[];
  skipped: number;
  total: number;
  fileName: string;
}

export async function previewCatalogImport(token: string, file: File): Promise<CatalogImportPreview> {
  if (!API_URL) throw new Error('El servidor de reparto no está configurado (falta VITE_API_URL).');
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch(`${API_URL}/catalog/import/preview`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<CatalogImportPreview>;
}

export async function confirmCatalogImport(token: string, rows: CatalogProduct[]): Promise<{ imported: number }> {
  return request('/catalog/import/confirm', { method: 'POST', body: JSON.stringify({ rows }) }, token);
}

// ─── Rutas del día ──────────────────────────────────────────────────────────

export async function fetchRouteStops(token: string, date: string, courierId?: string): Promise<RouteStop[]> {
  const qs = new URLSearchParams({ date, ...(courierId ? { courierId } : {}) });
  const data = await request<{ stops: RouteStop[] }>(`/route-stops?${qs.toString()}`, {}, token);
  return data.stops;
}

export function subscribeRouteStops(
  token: string,
  date: string,
  courierId: string | undefined,
  onChange: (stops: RouteStop[]) => void
): () => void {
  return poll(() => fetchRouteStops(token, date, courierId), onChange);
}

export async function assignRouteStops(
  token: string,
  payload: { courierId: string; courierName: string; scheduledDate: string; clients: { id: string; name: string; address: string }[] }
): Promise<void> {
  await request('/route-stops/bulk', { method: 'POST', body: JSON.stringify(payload) }, token);
}

export async function updateRouteStopStatus(
  token: string,
  id: string,
  status: RouteStopStatus,
  courierNotes?: string
): Promise<void> {
  await request(`/route-stops/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status, courierNotes }) }, token);
}

export async function reorderRouteStop(token: string, id: string, direction: 'up' | 'down'): Promise<void> {
  await request(`/route-stops/${id}/reorder`, { method: 'PATCH', body: JSON.stringify({ direction }) }, token);
}

export async function deleteRouteStop(token: string, id: string): Promise<void> {
  await request(`/route-stops/${id}`, { method: 'DELETE' }, token);
}

// ─── Turnos ─────────────────────────────────────────────────────────────────

export async function fetchActiveShift(token: string, courierId?: string): Promise<Shift | null> {
  const qs = courierId ? `?courierId=${encodeURIComponent(courierId)}` : '';
  const data = await request<{ shift: Shift | null }>(`/shifts/active${qs}`, {}, token);
  return data.shift;
}

export async function startShift(token: string, courierId: string, courierName: string): Promise<string> {
  const data = await request<{ id: string }>('/shifts/start', { method: 'POST', body: JSON.stringify({ courierId, courierName }) }, token);
  return data.id;
}

export async function endShift(token: string, id: string): Promise<{ completedCount: number; totalCount: number; minutesOnRoute: number }> {
  return request(`/shifts/${id}/end`, { method: 'POST' }, token);
}

export async function fetchShifts(token: string): Promise<Shift[]> {
  const data = await request<{ shifts: Shift[] }>('/shifts', {}, token);
  return data.shifts;
}

// ─── Cobros ─────────────────────────────────────────────────────────────────

export async function fetchPayments(token: string): Promise<Payment[]> {
  const data = await request<{ payments: Payment[] }>('/payments', {}, token);
  return data.payments;
}

export function subscribePayments(token: string, onChange: (payments: Payment[]) => void): () => void {
  return poll(() => fetchPayments(token), onChange);
}

export async function createPayment(token: string, payment: Omit<Payment, 'id' | 'createdAt'>): Promise<Payment> {
  const data = await request<{ id: string; createdAt: number }>('/payments', { method: 'POST', body: JSON.stringify(payment) }, token);
  return { ...payment, id: data.id, createdAt: data.createdAt };
}

// ─── Equipo ─────────────────────────────────────────────────────────────────

export async function fetchTeam(token: string): Promise<TeamMember[]> {
  const data = await request<{ staff: TeamMember[] }>('/team', {}, token);
  return data.staff;
}

export async function createTeamMember(token: string, member: { id: string; name: string; pin: string; role: StaffRole }): Promise<void> {
  await request('/team', { method: 'POST', body: JSON.stringify(member) }, token);
}

export async function updateTeamMember(token: string, id: string, patch: { name?: string; pin?: string; active?: boolean; role?: StaffRole }): Promise<void> {
  await request(`/team/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) }, token);
}

// ─── Trackers GPS físicos ───────────────────────────────────────────────────

export async function fetchTrackers(token: string): Promise<Tracker[]> {
  const data = await request<{ trackers: Tracker[] }>('/trackers', {}, token);
  return data.trackers;
}

export function subscribeTrackers(token: string, onChange: (trackers: Tracker[]) => void): () => void {
  return poll(() => fetchTrackers(token), onChange);
}

export async function createTracker(token: string, tracker: { imei: string; courierId: string; name: string }): Promise<void> {
  await request('/trackers', { method: 'POST', body: JSON.stringify(tracker) }, token);
}

export async function deleteTracker(token: string, imei: string): Promise<void> {
  await request(`/trackers/${encodeURIComponent(imei)}`, { method: 'DELETE' }, token);
}

export async function postGpsUpdate(token: string, lat: number, lng: number): Promise<void> {
  await request('/gps/update', { method: 'POST', body: JSON.stringify({ lat, lng }) }, token);
}

export async function fetchLivePositions(token: string): Promise<LivePosition[]> {
  const data = await request<{ positions: LivePosition[] }>('/gps/live', {}, token);
  return data.positions;
}

export function subscribeLivePositions(token: string, onChange: (positions: LivePosition[]) => void): () => void {
  return poll(() => fetchLivePositions(token), onChange);
}

// ─── Planificación ──────────────────────────────────────────────────────────

export async function fetchLists(token: string): Promise<DeliveryList[]> {
  const data = await request<{ lists: DeliveryList[] }>('/lists', {}, token);
  return data.lists;
}

export function subscribeLists(token: string, onChange: (lists: DeliveryList[]) => void): () => void {
  return poll(() => fetchLists(token), onChange);
}

export async function createList(token: string, name: string, weekdays: number[]): Promise<string> {
  const data = await request<{ id: string }>('/lists', { method: 'POST', body: JSON.stringify({ name, weekdays }) }, token);
  return data.id;
}

export async function updateList(
  token: string,
  id: string,
  patch: { name?: string; weekdays?: number[]; courierId?: string | null; courierName?: string | null }
): Promise<void> {
  await request(`/lists/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, token);
}

export async function deleteList(token: string, id: string): Promise<void> {
  await request(`/lists/${id}`, { method: 'DELETE' }, token);
}

export async function fetchListClients(token: string, id: string): Promise<DeliveryListClient[]> {
  const data = await request<{ clients: DeliveryListClient[] }>(`/lists/${id}/clients`, {}, token);
  return data.clients;
}

export async function addClientToList(token: string, id: string, clientId: string): Promise<void> {
  await request(`/lists/${id}/clients`, { method: 'POST', body: JSON.stringify({ clientId }) }, token);
}

export async function removeClientFromList(token: string, id: string, clientId: string): Promise<void> {
  await request(`/lists/${id}/clients/${clientId}`, { method: 'DELETE' }, token);
}

export async function applyList(token: string, id: string): Promise<{ added: number }> {
  return request(`/lists/${id}/apply`, { method: 'POST' }, token);
}

// ─── Historial ──────────────────────────────────────────────────────────────

export async function fetchShiftStops(token: string, shiftId: string): Promise<ShiftStop[]> {
  const data = await request<{ stops: ShiftStop[] }>(`/shifts/${shiftId}/stops`, {}, token);
  return data.stops;
}

// ─── Cuentas de clientes (saldo = ventas cargadas - cobros) ──────────────────

export async function fetchClientAccounts(token: string): Promise<ClientAccount[]> {
  const data = await request<{ accounts: ClientAccount[] }>('/clients/accounts', {}, token);
  return data.accounts;
}

export async function fetchClientBalance(token: string, clientId: string): Promise<{ charged: number; paid: number; balance: number }> {
  return request(`/clients/${encodeURIComponent(clientId)}/balance`, {}, token);
}

export async function fetchClientStatement(token: string, clientId: string): Promise<ClientStatement> {
  return request(`/clients/${encodeURIComponent(clientId)}/statement`, {}, token);
}

// ─── Ventas (cargos a cuenta de cliente, para objetivos del repartidor) ──────

export async function fetchSales(token: string): Promise<Sale[]> {
  const data = await request<{ sales: Sale[] }>('/sales', {}, token);
  return data.sales;
}

export function subscribeSales(token: string, onChange: (sales: Sale[]) => void): () => void {
  return poll(() => fetchSales(token), onChange);
}

export async function createSale(
  token: string,
  sale: {
    clientId?: string;
    clientName: string;
    courierId: string;
    courierName: string;
    description?: string;
    items: StreetOrderItem[];
  }
): Promise<void> {
  await request('/sales', { method: 'POST', body: JSON.stringify(sale) }, token);
}

export async function deleteSale(token: string, id: string): Promise<void> {
  await request(`/sales/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
}

// ─── Cotizaciones (no descuentan stock ni afectan la cuenta corriente) ───────

export async function fetchQuotes(token: string): Promise<Quote[]> {
  const data = await request<{ quotes: Quote[] }>('/quotes', {}, token);
  return data.quotes;
}

export function subscribeQuotes(token: string, onChange: (quotes: Quote[]) => void): () => void {
  return poll(() => fetchQuotes(token), onChange);
}

export async function createQuote(
  token: string,
  quote: { clientName?: string; notes?: string; items: StreetOrderItem[] }
): Promise<{ id: string; total: number; createdAt: number }> {
  return request('/quotes', { method: 'POST', body: JSON.stringify(quote) }, token);
}

export async function deleteQuote(token: string, id: string): Promise<void> {
  await request(`/quotes/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
}

// ─── Estadísticas / proyecciones (admin) ─────────────────────────────────────

export async function fetchStats(token: string): Promise<Stats> {
  return request('/stats/dashboard', {}, token);
}

// ─── Objetivos de repartidores ────────────────────────────────────────────────

export async function fetchGoals(token: string): Promise<CourierGoal[]> {
  const data = await request<{ goals: CourierGoal[] }>('/goals', {}, token);
  return data.goals;
}

export function subscribeGoals(token: string, onChange: (goals: CourierGoal[]) => void): () => void {
  return poll(() => fetchGoals(token), onChange);
}

export async function setGoal(
  token: string,
  goal: { courierId: string; courierName: string; periodType: GoalPeriod; periodStart: string; targetAmount: number; metric: GoalMetric }
): Promise<void> {
  await request('/goals', { method: 'POST', body: JSON.stringify(goal) }, token);
}

export async function deleteGoal(token: string, id: string): Promise<void> {
  await request(`/goals/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
}

// ─── Proveedores y deudas ──────────────────────────────────────────────────────

export async function fetchSuppliers(token: string): Promise<Supplier[]> {
  const data = await request<{ suppliers: Supplier[] }>('/suppliers', {}, token);
  return data.suppliers;
}

export async function createSupplier(token: string, supplier: { id: string; name: string; phone?: string; notes?: string }): Promise<void> {
  await request('/suppliers', { method: 'POST', body: JSON.stringify(supplier) }, token);
}

export async function deleteSupplier(token: string, id: string): Promise<void> {
  await request(`/suppliers/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
}

export async function fetchSupplierDebts(token: string): Promise<SupplierDebt[]> {
  const data = await request<{ debts: SupplierDebt[] }>('/supplier-debts', {}, token);
  return data.debts;
}

export async function createSupplierDebt(
  token: string,
  debt: { supplierId: string; supplierName: string; invoiceNumber?: string; amount: number; issueDate?: string; dueDate?: string; notes?: string }
): Promise<void> {
  await request('/supplier-debts', { method: 'POST', body: JSON.stringify(debt) }, token);
}

export async function paySupplierDebt(
  token: string,
  id: string,
  payload: { paymentMethod: SupplierPaymentMethod; echeqNumber?: string; echeqDate?: string }
): Promise<void> {
  await request(`/supplier-debts/${encodeURIComponent(id)}/pay`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
}

export async function deleteSupplierDebt(token: string, id: string): Promise<void> {
  await request(`/supplier-debts/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
}

// ─── Log de actividad ──────────────────────────────────────────────────────────

export async function fetchLogs(token: string, staffId?: string): Promise<ActivityLogEntry[]> {
  const qs = staffId ? `?staffId=${encodeURIComponent(staffId)}` : '';
  const data = await request<{ logs: ActivityLogEntry[] }>(`/logs${qs}`, {}, token);
  return data.logs;
}

export function subscribeLogs(token: string, staffId: string | undefined, onChange: (logs: ActivityLogEntry[]) => void): () => void {
  return poll(() => fetchLogs(token, staffId), onChange);
}
