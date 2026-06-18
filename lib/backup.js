const fs   = require('fs');
const path = require('path');

function hacerBackupDiario(dbPath) {
  if (!fs.existsSync(dbPath)) return;

  const dir = path.join(path.dirname(dbPath), 'backups');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const hoy     = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const destino = path.join(dir, `listit-${hoy}.db`);

  if (!fs.existsSync(destino)) {
    fs.copyFileSync(dbPath, destino);
    console.log(`[backup] Copia diaria: ${destino}`);
  }

  // Rotar: conservar máximo 10 backups
  const archivos = fs.readdirSync(dir)
    .filter(f => /^listit-\d{4}-\d{2}-\d{2}\.db$/.test(f))
    .sort();
  while (archivos.length > 10) {
    fs.unlinkSync(path.join(dir, archivos.shift()));
  }
}

function exportarBd(dbPath, destino) {
  fs.copyFileSync(dbPath, destino);
}

module.exports = { hacerBackupDiario, exportarBd };
