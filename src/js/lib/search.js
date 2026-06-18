export function matchAll(termino, items) {
  const t = (termino || '').trim().toLowerCase();
  if (!t) return items;
  const words = t.split(/\s+/).filter(w => w);
  const matchStr = s => words.every(w => (s || '').toLowerCase().includes(w));
  return items.filter(i =>
    matchStr(i.titulo) || (i.nombres || []).some(n => matchStr(n))
  );
}
