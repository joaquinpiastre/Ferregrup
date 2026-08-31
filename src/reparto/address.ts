export function normalizeStreet(address: string): string {
  const base = address.split(/[,\n]/)[0]?.trim() ?? '';
  const withoutNumber = base.replace(/\s+\d+.*$/i, '').trim();
  return withoutNumber
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/\s+/g, ' ');
}

export function sameStreet(a: string, b: string): boolean {
  const na = normalizeStreet(a);
  const nb = normalizeStreet(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}
