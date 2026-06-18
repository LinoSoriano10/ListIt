const fs   = require('fs');
const path = require('path');

let logPath = null;

function getPath() {
  if (!logPath) {
    try {
      const { app } = require('electron');
      logPath = path.join(app.getPath('userData'), 'listit.log');
    } catch (_) {
      logPath = path.join(__dirname, '..', 'listit.log');
    }
  }
  return logPath;
}

function write(level, ...args) {
  const msg = `[${new Date().toISOString()}] [${level}] ${args.map(String).join(' ')}\n`;
  process.stdout.write(msg);
  try {
    const p = getPath();
    fs.appendFileSync(p, msg, 'utf-8');
    // Rotar si supera 2 MB
    if (fs.statSync(p).size > 2 * 1024 * 1024) fs.writeFileSync(p, msg, 'utf-8');
  } catch (_) {}
}

module.exports = {
  info:  (...a) => write('INFO',  ...a),
  warn:  (...a) => write('WARN',  ...a),
  error: (...a) => write('ERROR', ...a),
};
