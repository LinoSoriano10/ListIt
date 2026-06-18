const root = document.documentElement;
const cssVar = (name) => getComputedStyle(root).getPropertyValue(name).trim();

export const STATUS_COLOR = {
  viendo:     cssVar('--viendo')     || '#10b981',
  completado: cssVar('--completado') || '#6366f1',
  pendiente:  cssVar('--pendiente')  || '#5a6480',
  en_pausa:   cssVar('--en_pausa')   || '#f59e0b',
  abandonado: cssVar('--abandonado') || '#f43f5e',
};

export const STATUS_LABEL = {
  viendo:     'Viendo',
  completado: 'Completado',
  pendiente:  'Pendiente',
  en_pausa:   'En Pausa',
  abandonado: 'Abandonado',
};
