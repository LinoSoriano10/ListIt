// Lógica pura de completitud de temporadas, extraída de db.js para poder
// testearla sin better-sqlite3 (Tier 1). Una entrega cuenta como completa si
// está vista o si tiene todos sus episodios. Sin entregas → no completa.
function todasCompletas(entregas) {
  return entregas.length > 0 && entregas.every(e =>
    e.visto || (e.episodios_totales > 0 && e.episodio_actual >= e.episodios_totales));
}

module.exports = { todasCompletas };
