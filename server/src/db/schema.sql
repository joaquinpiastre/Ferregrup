create extension if not exists "pgcrypto";

create table if not exists staff (
  id text primary key,
  name text not null,
  pin text not null,
  role text not null check (role in ('superadmin', 'admin', 'repartidor')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- migration: the 'mostrador' role was renamed to 'admin'
alter table staff drop constraint if exists staff_role_check;
update staff set role = 'admin' where role = 'mostrador';
alter table staff add constraint staff_role_check check (role in ('superadmin', 'admin', 'repartidor', 'vendedor'));

-- migration: se consolidan los roles — 'admin' (con todo lo del ex superadmin), 'repartidor'
-- (vende, cobra y reparte) y 'vendedor' (vende y cobra, sin reparto)
alter table staff drop constraint if exists staff_role_check;
update staff set role = 'admin' where role = 'superadmin';
alter table staff add constraint staff_role_check check (role in ('admin', 'repartidor', 'vendedor'));

create table if not exists street_orders (
  id text primary key,
  street_key text not null,
  street_label text not null,
  courier_id text not null references staff(id),
  courier_name text not null,
  total numeric(12,2) not null default 0,
  notes text,
  nearby_clients jsonb not null default '[]'::jsonb,
  client_name text,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'visto', 'nota', 'armado', 'retirado', 'cancelado')),
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_street_orders_status_created
  on street_orders (status, created_at_ms desc);

create table if not exists street_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references street_orders(id) on delete cascade,
  code text,
  description text not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

-- ─── Clientes de reparto (directorio compartido admin/repartidor) ──────────────

create table if not exists clients (
  id text primary key,
  name text not null,
  address text not null,
  phone text,
  notes text,
  type text not null default 'cliente' check (type in ('cliente', 'taller')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_clients_active on clients (active);

-- ─── Catálogo de productos para reparto (independiente del inventario local) ───

create table if not exists catalog_products (
  code text primary key,
  description text not null,
  unit_price numeric(12,2) not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

-- ─── Rutas del día (asignaciones) ──────────────────────────────────────────────

create table if not exists route_stops (
  id text primary key,
  courier_id text not null references staff(id),
  courier_name text not null,
  client_id text not null references clients(id),
  client_name text not null,
  client_address text not null,
  order_num integer not null default 0,
  status text not null default 'pendiente'
    check (status in ('pendiente', 'en_camino', 'entregado', 'problema')),
  admin_notes text,
  courier_notes text,
  scheduled_date date not null,
  arrived_at_ms bigint,
  left_at_ms bigint,
  created_at timestamptz not null default now()
);

create index if not exists idx_route_stops_courier_date
  on route_stops (courier_id, scheduled_date, order_num);

-- ─── Turnos de reparto ──────────────────────────────────────────────────────────

create table if not exists shifts (
  id text primary key,
  courier_id text not null references staff(id),
  courier_name text not null,
  started_at_ms bigint not null,
  ended_at_ms bigint,
  completed_count integer not null default 0,
  total_count integer not null default 0,
  minutes_on_route integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_shifts_courier_started
  on shifts (courier_id, started_at_ms desc);

-- ─── Cobros ─────────────────────────────────────────────────────────────────────

create table if not exists payments (
  id text primary key,
  client_id text,
  client_name text not null,
  courier_id text not null references staff(id),
  courier_name text not null,
  amount numeric(12,2) not null,
  method text not null check (method in ('efectivo', 'transferencia', 'cheque', 'otro')),
  check_number text,
  bank text,
  notes text,
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_created
  on payments (created_at_ms desc);

-- ─── GPS: posiciones y trackers físicos ─────────────────────────────────────────

create table if not exists gps_points (
  id uuid primary key default gen_random_uuid(),
  courier_id text not null references staff(id),
  lat double precision not null,
  lng double precision not null,
  timestamp_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_gps_points_courier_ts
  on gps_points (courier_id, timestamp_ms desc);

create table if not exists trackers (
  imei text primary key,
  courier_id text not null references staff(id),
  name text not null,
  active boolean not null default true,
  last_contact_ms bigint,
  created_at timestamptz not null default now()
);

-- ─── Planificación: listas semanales de clientes ────────────────────────────────

create table if not exists delivery_lists (
  id text primary key,
  name text not null,
  weekdays integer[] not null default '{}',
  courier_id text references staff(id),
  courier_name text,
  created_at timestamptz not null default now()
);

create table if not exists delivery_list_clients (
  list_id text not null references delivery_lists(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  order_num integer not null default 0,
  primary key (list_id, client_id)
);

-- ─── Ventas (cargos a cuenta de un cliente, asignados a un repartidor) ──────────
-- Junto con "payments" (cobros) arman la cuenta corriente del cliente y el
-- avance de los objetivos de venta/cobro de cada repartidor.

create table if not exists sales (
  id text primary key,
  client_id text references clients(id),
  client_name text not null,
  courier_id text not null references staff(id),
  courier_name text not null,
  amount numeric(12,2) not null,
  description text,
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_sales_client on sales (client_id);
create index if not exists idx_sales_courier_created on sales (courier_id, created_at_ms desc);

-- ─── Objetivos de repartidores (semanales / mensuales) ──────────────────────────

create table if not exists courier_goals (
  id text primary key,
  courier_id text not null references staff(id),
  courier_name text not null,
  period_type text not null check (period_type in ('semanal', 'mensual')),
  period_start date not null,
  target_amount numeric(12,2) not null,
  metric text not null default 'ambos' check (metric in ('cobros', 'ventas', 'ambos')),
  created_at timestamptz not null default now(),
  unique (courier_id, period_type, period_start)
);

-- ─── Proveedores y deudas con proveedores ───────────────────────────────────────

create table if not exists suppliers (
  id text primary key,
  name text not null,
  phone text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists supplier_debts (
  id text primary key,
  supplier_id text not null references suppliers(id),
  supplier_name text not null,
  invoice_number text,
  amount numeric(12,2) not null,
  issue_date date,
  due_date date,
  status text not null default 'pendiente' check (status in ('pendiente', 'pagado')),
  payment_method text check (payment_method in ('efectivo', 'transferencia', 'cheque', 'echeq', 'otro')),
  echeq_number text,
  echeq_date date,
  paid_at_ms bigint,
  notes text,
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_debts_supplier on supplier_debts (supplier_id);
create index if not exists idx_supplier_debts_status on supplier_debts (status, due_date);

-- ─── Log de actividad (auditoría) ───────────────────────────────────────────────

create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  staff_id text not null references staff(id),
  staff_name text not null,
  staff_role text not null,
  action text not null,
  summary text not null,
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_activity_log_created on activity_log (created_at_ms desc);
create index if not exists idx_activity_log_staff on activity_log (staff_id, created_at_ms desc);

-- ─── Stock, costo e IVA por producto ────────────────────────────────────────────

alter table catalog_products add column if not exists stock integer not null default 0;
alter table catalog_products add column if not exists cost_price numeric(12,2);
alter table catalog_products add column if not exists iva_rate numeric(5,2) not null default 21;

-- ─── Ítems de venta (las ventas ahora son por producto, no un monto suelto) ─────

create table if not exists sale_items (
  id uuid primary key default gen_random_uuid(),
  sale_id text not null references sales(id) on delete cascade,
  code text,
  description text not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

create index if not exists idx_sale_items_sale on sale_items (sale_id);

-- ─── Cotizaciones (como una venta, pero no descuentan stock ni afectan cuentas) ─

create table if not exists quotes (
  id text primary key,
  client_id text references clients(id),
  client_name text,
  staff_id text not null references staff(id),
  staff_name text not null,
  total numeric(12,2) not null default 0,
  notes text,
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create table if not exists quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id text not null references quotes(id) on delete cascade,
  code text,
  description text not null,
  quantity integer not null,
  unit_price numeric(12,2) not null,
  subtotal numeric(12,2) not null
);

create index if not exists idx_quotes_created on quotes (created_at_ms desc);

-- ─── Ventas en cuotas ────────────────────────────────────────────────────────
-- Una venta se puede dividir en N cuotas (partes iguales, con vencimiento semanal
-- a partir de la fecha de la 1ra). El total de la venta (sales.amount) no cambia;
-- las cuotas son solo el desglose de cómo se va a cobrar. Un cobro puede apuntar
-- a una cuota puntual (payments.installment_id) para saber qué está pagado.

alter table sales add column if not exists installments_total integer;

create table if not exists sale_installments (
  id text primary key,
  sale_id text not null references sales(id) on delete cascade,
  number integer not null,
  amount numeric(12,2) not null,
  due_date date,
  created_at timestamptz not null default now(),
  unique (sale_id, number)
);

create index if not exists idx_sale_installments_sale on sale_installments (sale_id, number);

alter table payments add column if not exists installment_id text references sale_installments(id) on delete set null;

create index if not exists idx_payments_installment on payments (installment_id);

-- Orden estable de los ítems en una venta/cotización: sin esto, json_agg los devuelve
-- en un orden no garantizado y un recibo puede mostrar los productos mezclados.
alter table sale_items add column if not exists position integer not null default 0;
alter table quote_items add column if not exists position integer not null default 0;

-- ─── Camioneta: stock de mercadería que se llevan los repartidores ──────────────
-- La mercadería que sube a la camioneta sale del stock del depósito (catalog_products.stock)
-- y queda acá hasta que se devuelve al depósito o se da de baja como muestra.

create table if not exists van_stock (
  code text primary key references catalog_products(code),
  quantity integer not null default 0
);

create table if not exists van_movements (
  id uuid primary key default gen_random_uuid(),
  code text not null,
  description text not null,
  quantity integer not null,
  kind text not null check (kind in ('carga', 'devolucion', 'muestra')),
  courier_id text references staff(id),
  courier_name text,
  notes text,
  staff_id text not null references staff(id),
  staff_name text not null,
  created_at_ms bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_van_movements_created on van_movements (created_at_ms desc);

-- ─── Asistente de IA ────────────────────────────────────────────────────────────
-- Cada usuario tiene sus propias conversaciones; el admin elige el modelo, quién puede
-- usarlo (sin acceso / solo consultas / consultas y cambios) y cuánto puede gastar por mes.
-- La IA solo toca datos del negocio a través de las mismas rutas de la API (nunca el código).

create table if not exists ai_settings (
  id integer primary key default 1 check (id = 1),
  enabled boolean not null default true,
  default_model text not null default 'claude-opus-5-5',
  effort text not null default 'auto' check (effort in ('auto', 'low', 'medium', 'high')),
  require_confirmation boolean not null default true,
  global_monthly_limit_usd numeric(12,4),
  default_user_limit_usd numeric(12,4) default 5,
  updated_at timestamptz not null default now()
);

insert into ai_settings (id) values (1) on conflict (id) do nothing;

create table if not exists ai_user_settings (
  staff_id text primary key references staff(id),
  -- null = el acceso por defecto de su rol (admin: cambios, repartidor: solo consultas)
  access text check (access in ('off', 'read', 'write')),
  -- null = el modelo por defecto
  model text,
  -- 'default' = el límite general por usuario, 'none' = sin límite, 'custom' = monthly_limit_usd
  limit_mode text not null default 'default' check (limit_mode in ('default', 'none', 'custom')),
  monthly_limit_usd numeric(12,4),
  updated_at timestamptz not null default now()
);

create table if not exists ai_conversations (
  id text primary key,
  staff_id text not null references staff(id),
  staff_role text not null,
  title text not null default 'Nueva conversación',
  -- Se congela al crear la conversación: cambiarlo a mitad de charla invalida el
  -- razonamiento guardado de los turnos anteriores y el caché de prompts.
  system_prompt text not null,
  -- Cambios propuestos por la IA esperando que el usuario los confirme.
  pending json,
  -- Tamaño del contexto en la última respuesta (para sugerir empezar un chat nuevo).
  context_tokens integer not null default 0,
  created_at_ms bigint not null,
  updated_at_ms bigint not null
);

create index if not exists idx_ai_conversations_staff on ai_conversations (staff_id, updated_at_ms desc);

-- Historial tal cual se le manda a la API (solo se agregan filas, nunca se editan).
-- Es `json` y no `jsonb` a propósito: jsonb reordena las claves de los objetos y el historial
-- tiene que volver idéntico (el caché de prompts y el razonamiento guardado dependen de eso).
create table if not exists ai_messages (
  id bigserial primary key,
  conversation_id text not null references ai_conversations(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content json not null,
  meta json,
  created_at_ms bigint not null
);

create index if not exists idx_ai_messages_conversation on ai_messages (conversation_id, id);

-- Consumo por llamada a la API (sin FK a la conversación: el gasto queda aunque se borre el chat).
create table if not exists ai_usage (
  id bigserial primary key,
  staff_id text not null references staff(id),
  conversation_id text,
  model text not null,
  input_tokens integer not null default 0,
  output_tokens integer not null default 0,
  cache_read_tokens integer not null default 0,
  cache_write_tokens integer not null default 0,
  cost_usd numeric(12,6) not null,
  created_at_ms bigint not null
);

create index if not exists idx_ai_usage_staff_created on ai_usage (staff_id, created_at_ms desc);
create index if not exists idx_ai_usage_created on ai_usage (created_at_ms desc);
