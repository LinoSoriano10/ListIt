// Marquee al hover para títulos largos. El texto va en un <span class="mq__i">
// dentro del contenedor .mq; al pasar el ratón, el CSS lo desliza con
// transform: translateX (compositado, suave) para mostrar el resto, y vuelve al
// salir. El span interior tiene pointer-events:none, así su movimiento nunca
// re-dispara el hover (evita el bucle adelante/atrás). El JS solo mide una vez.

// Parte pura (testeable): dado el ancho del contenido y el visible, devuelve el
// desplazamiento (negativo) y la duración en segundos, o null si el texto cabe.
export function calcMarquee(scrollWidth, clientWidth) {
  const overflow = scrollWidth - clientWidth;
  if (overflow <= 2) return null;                 // 2px no merece animación
  return { shift: -overflow, dur: Math.max(0.4, overflow / 100) };  // ~100 px/s
}

// Delegación en un ancestro estable (por defecto el body): cubre todos los .mq
// actuales y futuros (modal, detalle, dashboard…).
export function instalarMarquee(root = document.body) {
  root.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('.mq');
    if (!el || el.__mqW === el.clientWidth) return;  // medir solo 1 vez por ancho
    el.__mqW = el.clientWidth;
    const inner = el.querySelector('.mq__i');
    if (!inner) return;
    const m = calcMarquee(inner.scrollWidth, el.clientWidth);
    if (!m) {
      el.style.removeProperty('--mq-shift');
      el.style.removeProperty('--mq-dur');
      return;
    }
    // La duración debe quedar fijada ANTES de cambiar --mq-shift; si cambian a la
    // vez, la 1ª animación tomaría 0s (salto). Por eso el shift va el frame siguiente.
    el.style.setProperty('--mq-dur', `${m.dur}s`);
    requestAnimationFrame(() => el.style.setProperty('--mq-shift', `${m.shift}px`));
  });
}
