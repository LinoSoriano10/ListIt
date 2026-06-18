import { api } from '../api.js';

export async function actualizarContadores() {
  const conteos = await api.contarEstados();
  const map = {};
  conteos.forEach(r => (map[r.estado] = r.total));

  const total = conteos.reduce((s, r) => s + r.total, 0);
  document.getElementById('badge-todos').textContent       = total;
  document.getElementById('badge-viendo').textContent      = map.viendo     || 0;
  document.getElementById('badge-completado').textContent  = map.completado || 0;
  document.getElementById('badge-pendiente').textContent   = map.pendiente  || 0;
  document.getElementById('badge-en_pausa').textContent    = map.en_pausa   || 0;
  document.getElementById('badge-abandonado').textContent  = map.abandonado || 0;
}
