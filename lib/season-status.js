// Lógica pura de completitud de temporadas, extraída de db.js para poder
// testearla sin better-sqlite3 (Tier 1). Una entrega cuenta como completa si
// está vista o si tiene todos sus episodios. Sin entregas → no completa.
//
// Camino B: las entregas con `no_emitido` (temporadas anunciadas pero aún sin
// emitir) NO cuentan — ni para bloquear ni para sumar. Una serie cuyas únicas
// entregas son no emitidas tampoco se considera completa (no ha salido nada).
function todasCompletas(entregas) {
  const contables = entregas.filter(e => !e.no_emitido);
  return contables.length > 0 && contables.every(e =>
    e.visto || (e.episodios_totales > 0 && e.episodio_actual >= e.episodios_totales));
}

module.exports = { todasCompletas };
