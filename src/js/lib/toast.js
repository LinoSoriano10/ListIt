// Toasts no bloqueantes en la esquina inferior derecha.
// Usado por B.7 (undo) y otras notificaciones. No reemplaza alert/confirm
// existentes (esa es C.1, pendiente).

function getContainer() {
  let c = document.getElementById('toastContainer');
  if (!c) {
    c = document.createElement('div');
    c.id = 'toastContainer';
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

function show(opts) {
  const { texto, tipo = 'info', ms = 3500, accion } = opts;
  const el = document.createElement('div');
  el.className = `toast toast--${tipo}`;
  el.innerHTML = `<span>${texto}</span>`;
  if (accion) {
    const btn = document.createElement('button');
    btn.className = 'toast-undo-btn';
    btn.textContent = accion.label;
    btn.addEventListener('click', () => {
      accion.handler();
      el.remove();
    });
    el.appendChild(btn);
  }
  getContainer().appendChild(el);
  const timer = setTimeout(() => el.remove(), ms);
  el.addEventListener('click', e => {
    if (e.target === el) { clearTimeout(timer); el.remove(); }
  });
  return el;
}

export const toast = {
  info:    (texto, opts = {}) => show({ texto, tipo: 'info',    ...opts }),
  success: (texto, opts = {}) => show({ texto, tipo: 'success', ...opts }),
  error:   (texto, opts = {}) => show({ texto, tipo: 'error', ms: 5000, ...opts }),
};
