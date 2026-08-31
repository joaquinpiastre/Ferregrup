import { pool } from './client.js';

const seedStaff: { id: string; name: string; pin: string; role: 'superadmin' | 'admin' | 'repartidor' }[] = [
  { id: 'superadmin', name: 'Superadmin', pin: '1234', role: 'superadmin' },
  { id: 'mostrador', name: 'Mostrador', pin: '1234', role: 'admin' },
  { id: 'repartidor', name: 'Repartidor', pin: '1234', role: 'repartidor' },
];

const seedClients = [
  { id: 'cl-1', name: 'Taller García', address: 'Av. Rivadavia 2345, CABA', phone: '011-2345-6789', type: 'taller' as const },
  { id: 'cl-2', name: 'Ferretería El Tornillo', address: 'Corrientes 1890, CABA', phone: '011-3456-7890', type: 'cliente' as const },
  { id: 'cl-3', name: 'Ferretería Central', address: 'Belgrano 3400, CABA', phone: '011-5678-9012', type: 'cliente' as const },
];

const seedCatalog = [
  { code: 'TAL-001', description: 'Taladro Percutor 13mm', unitPrice: 62000 },
  { code: 'CIN-001', description: 'Cinta métrica 5m', unitPrice: 2900 },
  { code: 'TOR-001', description: 'Tornillo tirafondo 6x50 (caja 200u)', unitPrice: 1400 },
];

async function main() {
  for (const s of seedStaff) {
    await pool.query(
      `insert into staff (id, name, pin, role) values ($1,$2,$3,$4)
       on conflict (id) do update set name = excluded.name, pin = excluded.pin, role = excluded.role`,
      [s.id, s.name, s.pin, s.role]
    );
  }
  for (const c of seedClients) {
    await pool.query(
      `insert into clients (id, name, address, phone, type) values ($1,$2,$3,$4,$5)
       on conflict (id) do update set name = excluded.name, address = excluded.address, phone = excluded.phone, type = excluded.type`,
      [c.id, c.name, c.address, c.phone, c.type]
    );
  }
  for (const p of seedCatalog) {
    await pool.query(
      `insert into catalog_products (code, description, unit_price) values ($1,$2,$3)
       on conflict (code) do update set description = excluded.description, unit_price = excluded.unit_price`,
      [p.code, p.description, p.unitPrice]
    );
  }
  console.log('Usuarios, clientes y catálogo de ejemplo creados (PIN 1234).');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
