/**
 * Return true only for a real ISO calendar date in YYYY-MM-DD form.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isIsoCalendarDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}
