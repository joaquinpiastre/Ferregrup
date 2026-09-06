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
alter table staff add constraint staff_role_check check (role in ('superadmin', 'admin', 'repartidor'));

-- migration: se consolidan los roles a solo 2 — 'admin' (con todo lo del ex superadmin) y 'repartidor'
alter table staff drop constraint if exists staff_role_check;
update staff set role = 'admin' where role = 'superadmin';
alter table staff add constraint staff_role_check check (role in ('admin', 'repartidor'));

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
