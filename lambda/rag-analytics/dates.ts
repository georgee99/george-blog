export type AnalyticsTimeZone = 'UTC' | 'Australia/Sydney';

const DAY_MS = 24 * 60 * 60 * 1000;
const dayFormatters: Record<AnalyticsTimeZone, Intl.DateTimeFormat> = {
  UTC: new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }),
  'Australia/Sydney': new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit',
  }),
};

export function addDays(day: string, count: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + count * DAY_MS).toISOString().slice(0, 10);
}

export function dayInZone(timestamp: string | number, timeZone: AnalyticsTimeZone): string {
  const parts = dayFormatters[timeZone].formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

function midnightUtc(day: string, timeZone: AnalyticsTimeZone): string {
  const midnight = Date.parse(`${day}T00:00:00Z`);
  if (timeZone === 'UTC') return new Date(midnight).toISOString();
  const formatter = new Intl.DateTimeFormat('en-AU', { timeZone, timeZoneName: 'shortOffset' });
  let instant = midnight;
  for (let i = 0; i < 3; i++) {
    const offset = formatter.formatToParts(new Date(instant)).find((p) => p.type === 'timeZoneName')?.value;
    const match = offset?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) throw new Error('Unable to determine timezone offset');
    const minutes = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1);
    const next = midnight - minutes * 60_000;
    if (next === instant) break;
    instant = next;
  }
  return new Date(instant).toISOString();
}

export function dateBounds(from: string, to: string, timeZone: AnalyticsTimeZone) {
  return { start: midnightUtc(from, timeZone), end: midnightUtc(addDays(to, 1), timeZone) };
}
