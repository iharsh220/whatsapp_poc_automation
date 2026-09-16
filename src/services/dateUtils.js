function isSameDay(dateA, dateB = new Date()) {
  if (!dateA) return false;
  const a = new Date(dateA);
  const b = new Date(dateB);
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatPhone(phone) {
  if (!phone) return null;
  let p = String(phone).trim();
  if (p.startsWith('+91')) return p;
  if (p.startsWith('91') && p.length === 12) return '+' + p;
  if (p.length === 10 && /^\d+$/.test(p)) return '+91' + p;
  return '+' + p;
}

module.exports = { isSameDay, formatPhone };
