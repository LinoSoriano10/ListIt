export const state = {
  // Filtros y vista
  filtroEstado:           'todos',
  filtroOrden:            'reciente',  // 'reciente'|'alfabetico'|'anio'|'completado'
  filtroTag:              null,
  idActual:               null,
  vistaActual:            'grid',      // 'grid' | 'dashboard'
  cardSize:               'normal',    // 'compact'|'normal'|'large' (B.2)

  // Modal de entrada
  modoModal:              'nuevo',
  tagsModal:              new Set(),
  tagsDisponibles:        [],
  todosLosItems:          [],
  nombresModal:           [],
  malDataImportado:       null,
  malEntregasPendientes:  [],
  itemEditando:           null,
  xmlParseado:            [],

  // A.6 Multi-selección
  seleccionMultiple:      new Set(),
  modoSeleccion:          false,
  onCardCtrlClick:        null,    // inyectado por bulk-actions
  onCardSelectClick:      null,    // inyectado por bulk-actions

  // B.7 Undo
  undoStack:              [],          // [{tipo, snapshot, descripcion}]
};
