/** Fecha de hoy (AAAA-MM-DD) en hora de Argentina; toISOString() es UTC y desde las 21 hs da mañana. */
export function arToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
}

export function fmtShortDate(d: string) {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}
