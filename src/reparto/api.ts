import type {
  ActivityLogEntry,
  AiConversation,
  AiConversationSummary,
  AiEvent,
  AiLimitMode,
  AiMe,
  AiOverview,
  AiSettings,
  CatalogProduct,
  ClientAccount,
  ClientStatement,
  CourierWeeklyGoals,
  DeliveryList,
  DeliveryListClient,
  FieldClient,
  LivePosition,
  OverdueReport,
  Payment,
  PaymentMethod,
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
  VanItem,
  VanMovement,
  VanMovementKind,
  WebCategory,
  WebOrder,
  WebOrderStatus,
  WebProduct,
  WebProductPatch,
  WebSettings,
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
    if (res.status === 401 && token) expireSession();
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<T>;
}

let expiring = false;
/** El token venció o el usuario fue desactivado: se cierra la sesión y se vuelve al login. */
function expireSession(): void {
  if (expiring) return;
  expiring = true;
  saveSession(null);
  window.location.reload();
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

export async function updateCatalogProduct(
  token: string,
  code: string,
  patch: { description?: string; unitPrice?: number; costPrice?: number | null; ivaRate?: number; supplier?: string | null }
): Promise<void> {
  await request(`/catalog/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(patch) }, token);
}

export async function deleteCatalogProduct(token: string, code: string): Promise<void> {
  await request(`/catalog/${encodeURIComponent(code)}`, { method: 'DELETE' }, token);
}

export async function adjustStock(
  token: string,
  code: string,
  adjustment: { mode: 'add' | 'set'; quantity: number }
): Promise<{ stock: number; prev: number }> {
  return request(`/catalog/${encodeURIComponent(code)}/stock`, { method: 'PATCH', body: JSON.stringify(adjustment) }, token);
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

export async function updatePayment(
  token: string,
  id: string,
  patch: { amount?: number; method?: PaymentMethod; checkNumber?: string | null; bank?: string | null; notes?: string | null }
): Promise<void> {
  await request(`/payments/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, token);
}

export async function deletePayment(token: string, id: string): Promise<void> {
  await request(`/payments/${id}`, { method: 'DELETE' }, token);
}

// ─── Camioneta ──────────────────────────────────────────────────────────────

export async function fetchVan(token: string): Promise<{ items: VanItem[]; movements: VanMovement[] }> {
  return request('/van', {}, token);
}

export async function moveVanStock(
  token: string,
  move: { code: string; quantity: number; kind: VanMovementKind; courierId?: string; notes?: string }
): Promise<void> {
  await request('/van/move', { method: 'POST', body: JSON.stringify(move) }, token);
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
    installments?: { count: number; firstDueDate: string; frequency: 'semanal' | 'mensual' };
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

export async function fetchGoals(token: string): Promise<CourierWeeklyGoals[]> {
  const data = await request<{ couriers: CourierWeeklyGoals[] }>('/goals', {}, token);
  return data.couriers;
}

export function subscribeGoals(token: string, onChange: (couriers: CourierWeeklyGoals[]) => void): () => void {
  return poll(() => fetchGoals(token), onChange);
}

// ─── Atrasados (cuotas vencidas en semanas anteriores y sin cobrar) ───────────

export async function fetchOverdue(token: string): Promise<OverdueReport> {
  return request<OverdueReport>('/overdue', {}, token);
}

export function subscribeOverdue(token: string, onChange: (report: OverdueReport) => void, onError?: (err: unknown) => void): () => void {
  return poll(() => fetchOverdue(token), onChange, onError);
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

// ─── Asistente de IA ─────────────────────────────────────────────────────────────

export async function fetchAiMe(token: string): Promise<AiMe> {
  return request<AiMe>('/ai/me', {}, token);
}

export async function fetchAiConversations(token: string): Promise<AiConversationSummary[]> {
  const data = await request<{ conversations: AiConversationSummary[] }>('/ai/conversations', {}, token);
  return data.conversations;
}

export async function createAiConversation(token: string): Promise<string> {
  const data = await request<{ id: string }>('/ai/conversations', { method: 'POST' }, token);
  return data.id;
}

export async function fetchAiConversation(token: string, id: string): Promise<AiConversation> {
  return request<AiConversation>(`/ai/conversations/${encodeURIComponent(id)}`, {}, token);
}

export async function deleteAiConversation(token: string, id: string): Promise<void> {
  await request(`/ai/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' }, token);
}

/** La respuesta de la IA llega en streaming: una línea JSON por evento. */
async function streamAi(token: string, path: string, body: unknown, onEvent: (e: AiEvent) => void): Promise<void> {
  if (!API_URL) throw new Error('El servidor de reparto no está configurado (falta VITE_API_URL).');
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) {
    if (res.status === 401) expireSession();
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Error ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as AiEvent);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as AiEvent);
}

export function sendAiMessage(
  token: string,
  conversationId: string,
  text: string,
  onEvent: (e: AiEvent) => void,
  attachments: string[] = []
): Promise<void> {
  return streamAi(token, `/ai/conversations/${encodeURIComponent(conversationId)}/messages`, { text, attachments }, onEvent);
}

export interface UploadedFile {
  id: string;
  name: string;
  size: number;
}

/** Sube un archivo para adjuntarlo en el chat de la IA (solo administradores). */
export async function uploadAiFile(token: string, file: File): Promise<UploadedFile> {
  if (!API_URL) throw new Error('El servidor de reparto no está configurado (falta VITE_API_URL).');
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}/files`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  if (!res.ok) {
    if (res.status === 401) expireSession();
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Error ${res.status}`);
  }
  return res.json() as Promise<UploadedFile>;
}

export function confirmAiActions(token: string, conversationId: string, approve: boolean, onEvent: (e: AiEvent) => void): Promise<void> {
  return streamAi(token, `/ai/conversations/${encodeURIComponent(conversationId)}/confirm`, { approve }, onEvent);
}

export async function fetchAiOverview(token: string): Promise<AiOverview> {
  return request<AiOverview>('/ai/admin/overview', {}, token);
}

export async function saveAiSettings(token: string, patch: Partial<AiSettings>): Promise<void> {
  await request('/ai/admin/settings', { method: 'PUT', body: JSON.stringify(patch) }, token);
}

export async function saveAiUserSettings(
  token: string,
  staffId: string,
  body: { access: 'default' | 'off' | 'read' | 'write'; model: string | null; limitMode: AiLimitMode; monthlyLimitUsd?: number | null }
): Promise<void> {
  await request(`/ai/admin/users/${encodeURIComponent(staffId)}`, { method: 'PUT', body: JSON.stringify(body) }, token);
}

export async function testAiConnection(token: string): Promise<{ ok: boolean; error?: string; models?: { id: string; available: boolean }[] }> {
  return request('/ai/admin/test', { method: 'POST' }, token);
}

// ─── Tienda online ──────────────────────────────────────────────────────────

export async function fetchWebOrders(token: string): Promise<WebOrder[]> {
  const { orders } = await request<{ orders: WebOrder[] }>('/store/admin/orders', {}, token);
  return orders;
}

export function subscribeWebOrders(token: string, onChange: (orders: WebOrder[]) => void, onError?: (err: unknown) => void): () => void {
  return poll(() => fetchWebOrders(token), onChange, onError);
}

/** Cantidad de pedidos web sin atender (para el aviso del menú). */
export function subscribeNewWebOrders(token: string, onChange: (count: number) => void): () => void {
  return poll(() => request<{ newOrders: number }>('/store/admin/summary', {}, token).then((r) => r.newOrders), onChange);
}

export async function updateWebOrder(token: string, id: number, patch: { status?: WebOrderStatus; adminNotes?: string | null }): Promise<void> {
  await request(`/store/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }, token);
}

export async function fetchWebProducts(token: string, q: string, only: 'published' | 'all'): Promise<{ categories: WebCategory[]; products: WebProduct[] }> {
  return request(`/store/admin/products?${new URLSearchParams({ q, only })}`, {}, token);
}

export async function updateWebProduct(token: string, code: string, patch: WebProductPatch): Promise<void> {
  await request(`/store/admin/products/${encodeURIComponent(code)}`, { method: 'PATCH', body: JSON.stringify(patch) }, token);
}

/** Sube la foto de un producto de la tienda (ya achicada en el navegador). */
export async function uploadWebProductImage(token: string, code: string, image: Blob): Promise<void> {
  if (!API_URL) throw new Error('El servidor de reparto no está configurado (falta VITE_API_URL).');
  const form = new FormData();
  form.append('image', image, image.type === 'image/webp' ? 'foto.webp' : image.type === 'image/png' ? 'foto.png' : 'foto.jpg');
  const res = await fetch(`${API_URL}/store/admin/products/${encodeURIComponent(code)}/image`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  if (!res.ok) {
    if (res.status === 401) expireSession();
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? `Error ${res.status}`);
  }
}

export async function fetchWebSettings(token: string): Promise<WebSettings> {
  return request<WebSettings>('/store/admin/settings', {}, token);
}

export async function saveWebSettings(token: string, settings: WebSettings): Promise<void> {
  await request('/store/admin/settings', { method: 'PUT', body: JSON.stringify(settings) }, token);
}
