/** Local time as `HH:MM`. */
export function hhmm(t: Date | number): string {
  const d = t instanceof Date ? t : new Date(t);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
