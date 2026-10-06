export function fmtShortDate(d: string) {
  const [, m, day] = d.split('-');
  return `${day}/${m}`;
}
