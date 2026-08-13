const LIMA_TIME_ZONE = 'America/Lima';

const LIMA_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: LIMA_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function currentLimaBusinessDate(now: Date = new Date()): string {
  const parts = new Map(
    LIMA_DATE_FORMATTER.formatToParts(now).map((part) => [part.type, part.value]),
  );
  const year = parts.get('year');
  const month = parts.get('month');
  const day = parts.get('day');
  if (year === undefined || month === undefined || day === undefined) {
    throw new Error('No se pudo determinar la fecha local del negocio.');
  }
  return `${year}-${month}-${day}`;
}
