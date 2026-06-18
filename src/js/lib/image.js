export function getImageSrc(imagen) {
  if (!imagen) return 'img/no-image.png';
  if (imagen.startsWith('http')) return imagen;
  const normalized = imagen.replace(/\\/g, '/');
  return `file:///${normalized.replace(/^\//, '')}`;
}
