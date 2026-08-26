const { contextBridge, ipcRenderer } = require('electron');

// Mensajes que el proceso principal envía a la ventana principal (refrescos).
const ALLOWED_EVENTS = ['detalle-refrescar', 'biblioteca-recargada'];
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

  // Camino B: temporadas anunciadas pero aún no emitidas
  getEntregasNoEmitidasCandidatas: ()    => ipcRenderer.invoke('get-entregas-no-emitidas-candidatas'),
  marcarEntregasNoEmitidas:        (ids) => ipcRenderer.invoke('marcar-entregas-no-emitidas', ids),
  marcarEntregaEmitida: (id, episodios_totales) =>
    ipcRenderer.invoke('marcar-entrega-emitida', { id, episodios_totales }),

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
  estadisticasAmpliadas: ()       => ipcRenderer.invoke('estadisticas-ampliadas'),
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

  // Calendario de emisión. Los datos vienen de AniList (fecha exacta por
  // episodio) y se guardan en local, así que siguen sirviendo si su API cae.
  calendarioObtener:   (desde, hasta) => ipcRenderer.invoke('calendario-obtener', { desde, hasta }),
  calendarioRefrescar: ()             => ipcRenderer.invoke('calendario-refrescar'),

  // Tipos de contenido (anime, serie, película, manwa…). Cada uno declara su
  // unidad, su duración y si cuenta como tiempo de visionado.
  tiposObtener:    ()               => ipcRenderer.invoke('tipos-obtener'),
  tiposActualizar: (clave, campos)  => ipcRenderer.invoke('tipos-actualizar', { clave, campos }),

  // Consultas a MyAnimeList. El fetch lo hace el proceso principal (API oficial,
  // con Jikan de reserva); aquí solo viaja el resultado ya normalizado.
  // Todas devuelven { ok: true, fuente, datos } o { ok: false, codigo, mensaje }.
  malBuscar:     (query, limite) => ipcRenderer.invoke('mal-buscar', { query, limite }),
  malDetalle:    (malId)         => ipcRenderer.invoke('mal-detalle', malId),
  malRelaciones: (malId)         => ipcRenderer.invoke('mal-relaciones', malId),

  // Credencial de MyAnimeList. El Client ID solo entra: `estado` informa de si
  // hay uno guardado, pero nunca lo devuelve.
  malCredencialEstado:  ()         => ipcRenderer.invoke('mal-credencial-estado'),
  malCredencialGuardar: (clientId) => ipcRenderer.invoke('mal-credencial-guardar', clientId),
  malCredencialBorrar:  ()         => ipcRenderer.invoke('mal-credencial-borrar'),

  // Sincronización con Firestore (opcional, desactivada por defecto).
  // La configuración y la contraseña solo entran; `estado` nunca las devuelve.
  syncEstado:      ()        => ipcRenderer.invoke('sync-estado'),
  syncConfigurar:  (datos)   => ipcRenderer.invoke('sync-configurar', datos),
  syncDesactivar:  ()        => ipcRenderer.invoke('sync-desactivar'),
  syncSubir:       (opts)    => ipcRenderer.invoke('sync-subir', opts || {}),
  syncBajar:       (opts)    => ipcRenderer.invoke('sync-bajar', opts || {}),
});
