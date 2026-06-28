const { contextBridge, ipcRenderer } = require('electron');

// Mensajes que el proceso principal envía a la ventana principal (refrescos).
const ALLOWED_EVENTS = ['detalle-refrescar'];
contextBridge.exposeInMainWorld('events', {
  on: (canal, fn) => {
    if (!ALLOWED_EVENTS.includes(canal)) return;
    ipcRenderer.on(canal, (_, payload) => fn(payload));
  },
});

contextBridge.exposeInMainWorld('api', {
  // Contenido
  getContenido:        (filtros) => ipcRenderer.invoke('get-contenido', filtros),
  getDetalle:          (id)      => ipcRenderer.invoke('get-detalle', id),
  guardarContenido:    (item)    => ipcRenderer.invoke('guardar-contenido', item),
  actualizarContenido: (item)    => ipcRenderer.invoke('actualizar-contenido', item),
  eliminarContenido:   (id)      => ipcRenderer.invoke('eliminar-contenido', id),
  contarEstados:       ()        => ipcRenderer.invoke('contar-estados'),

  // Imágenes y diálogos
  seleccionarImagen: () => ipcRenderer.invoke('seleccionar-imagen'),

  // Nombres alternativos
  getNombres:  (id)          => ipcRenderer.invoke('get-nombres', id),
  setNombres:  (id, nombres) => ipcRenderer.invoke('set-nombres', { id, nombres }),

  // Entregas
  getEntregas:           (contenidoId) => ipcRenderer.invoke('get-entregas', contenidoId),
  guardarEntrega:        (entrega)     => ipcRenderer.invoke('guardar-entrega', entrega),
  toggleEntrega:         (id)          => ipcRenderer.invoke('toggle-entrega', id),
  renombrarEntrega:      (id, titulo)  => ipcRenderer.invoke('renombrar-entrega', { id, titulo }),
  renombrarNumero:       (id, numero)  => ipcRenderer.invoke('renombrar-numero', { id, numero }),
  epEntregaDelta:        (id, delta)   => ipcRenderer.invoke('ep-entrega-delta', { id, delta }),
  setEpTotalEntrega:     (id, total)   => ipcRenderer.invoke('set-ep-total-entrega', { id, total }),
  eliminarEntrega:       (id)          => ipcRenderer.invoke('eliminar-entrega', id),
  guardarEntregaCompleta:(e)           => ipcRenderer.invoke('guardar-entrega-completa', e),

  // Tags
  getTags:          ()           => ipcRenderer.invoke('get-tags'),
  crearTag:         (nombre)     => ipcRenderer.invoke('crear-tag', nombre),
  eliminarTag:      (id)         => ipcRenderer.invoke('eliminar-tag', id),
  getTagsContenido: (id)         => ipcRenderer.invoke('get-tags-contenido', id),
  setTagsContenido: (id, tagIds) => ipcRenderer.invoke('set-tags-contenido', { id, tagIds }),
  actualizarTag:    (id, nombre) => ipcRenderer.invoke('actualizar-tag', { id, nombre }),
  contarPorTag:     ()           => ipcRenderer.invoke('contar-por-tag'),

  // Dashboard
  estadisticasGenerales: ()       => ipcRenderer.invoke('estadisticas-generales'),
  actividadPorMes:       (limite) => ipcRenderer.invoke('actividad-por-mes', limite),
  obtenerActividad:      (limite) => ipcRenderer.invoke('obtener-actividad', limite),

  // Settings
  getSetting: (key)         => ipcRenderer.invoke('get-setting', key),
  setSetting: (key, value)  => ipcRenderer.invoke('set-setting', { key, value }),

  // Exportación
  exportarBd:       () => ipcRenderer.invoke('exportar-bd'),

  // B.5 Caché de imágenes
  vaciarCacheImagenes: () => ipcRenderer.invoke('vaciar-cache-imagenes'),

  // (B) Marca de emisión de la franquicia
  setEmisionFranquicia: (id, estado) => ipcRenderer.invoke('set-emision-franquicia', { id, estado }),

  // A.4 Duplicados
  buscarTituloSimilar: (titulo, excludeId) =>
    ipcRenderer.invoke('buscar-titulo-similar', { titulo, excludeId }),

  // C.2 Reordenar entregas
  reordenarEntregas: (contenidoId, idsOrdenados) =>
    ipcRenderer.invoke('reordenar-entregas', { contenidoId, idsOrdenados }),

  // C.3 Actualización desde MAL
  actualizarDesdeMal: (id, mal) =>
    ipcRenderer.invoke('actualizar-desde-mal', { id, mal }),
  vincularDatosMal: (id, datos) =>
    ipcRenderer.invoke('vincular-datos-mal', { id, datos }),

  // A.7 Sincronización masiva MAL
  obtenerEntradasConMalId: () => ipcRenderer.invoke('obtener-entradas-con-mal-id'),
});
