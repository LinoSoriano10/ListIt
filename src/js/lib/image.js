export function getImageSrc(imagen) {
  if (!imagen) return 'img/no-image.png';
  if (imagen.startsWith('http')) return imagen;
  const normalized = imagen.replace(/\\/g, '/');
  return `file:///${normalized.replace(/^\//, '')}`;
}

/**
 * Instala un fallback global para imágenes rotas, sin usar handlers `onerror`
 * inline (que una CSP estricta con `script-src 'self'` bloquea).
 * El evento `error` de <img> no burbujea, pero sí se intercepta en la fase de
 * captura a nivel de documento.
 * - Imágenes con clase `mal-result-img`: se ocultan.
 * - El resto: caen a `img/no-image.png` (con guarda para no entrar en bucle).
 */
export function instalarFallbackImagenes(doc = document) {
  doc.addEventListener('error', (e) => {
    const el = e.target;
    if (!el || el.tagName !== 'IMG') return;
    if (el.classList.contains('mal-result-img')) {
      el.style.display = 'none';
      return;
    }
    // Si la imagen ya es el placeholder, no reintentar (evita bucle si no-image fallara).
    if (el.src.endsWith('no-image.png')) return;
    el.src = 'img/no-image.png';
  }, true);
}
