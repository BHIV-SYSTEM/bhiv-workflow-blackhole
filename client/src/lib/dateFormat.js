/**
 * Format a calendar date as DD/MM/YYYY (UK-style day-first).
 * Returns "—" for invalid or missing values.
 */
export function formatDate(value) {
  if (value == null || value === "") return "—"
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  const day = String(d.getDate()).padStart(2, "0")
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const year = d.getFullYear()
  return `${day}/${month}/${year}`
}

/**
 * Format as DD/MM/YYYY, HH:mm (24-hour, local time).
 */
export function formatDateTime(value) {
  if (value == null || value === "") return "—"
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  const date = formatDate(d)
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${date}, ${h}:${m}`
}

/**
 * Local time as HH:mm (24-hour).
 */
export function formatTime(value) {
  if (value == null || value === "") return "—"
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return "—"
  const h = String(d.getHours()).padStart(2, "0")
  const m = String(d.getMinutes()).padStart(2, "0")
  return `${h}:${m}`
}
