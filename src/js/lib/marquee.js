// Marquee al hover para títulos largos. Cuando un elemento .mq no cabe, se
// desliza horizontalmente para mostrar el resto y vuelve al salir el ratón.
// El deslizamiento se hace por CSS (text-indent); aquí solo se mide y se fijan
// las variables --mq-shift y --mq-dur.

// Parte pura (testeable): dado el ancho del contenido y el visible, devuelve el
// desplazamiento (negativo) y la duración, o null si el texto cabe.
export function calcMarquee(scrollWidth, clientWidth) {
  const overflow = scrollWidth - clientWidth;
  if (overflow <= 2) return null;               // margen: 2px no merece animación
  return { shift: -overflow, dur: Math.max(0.35, overflow / 50) };
}

// Instala el marquee por delegación en un ancestro estable (por defecto el body),
// así cubre todos los .mq actuales y futuros (grid, modal, detalle, dashboard).
export function instalarMarquee(root = document.body) {
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.mq');
    if (!el || el.__mqW === el.clientWidth) return;  // ya medido para este ancho
    el.__mqW = el.clientWidth;                        // mide 1 vez por ancho (sin shift)
    const m = calcMarquee(el.scrollWidth, el.clientWidth);
    if (m) {
      el.style.setProperty('--mq-shift', `${m.shift}px`);
      el.style.setProperty('--mq-dur', `${m.dur.toFixed(2)}s`);
    } else {
      el.style.removeProperty('--mq-shift');
    }
  });
}
