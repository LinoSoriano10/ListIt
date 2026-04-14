// ─── Estado de la app ─────────────────────────────────────────────────────────
let filtroEstado    = 'todos';
let filtroTag       = null;          // tag activo para filtrar el grid (nombre o null)
let idActual        = null;          // ID del item abierto en el panel de detalle
let modoModal       = 'nuevo';       // 'nuevo' | 'editar'
let tagsModal       = new Set();     // IDs de tags seleccionados en el modal
let tagsDisponibles = [];            // cache de todos los tags del sistema
let todosLosItems   = [];            // cache para búsqueda local

// ─── Helpers de color ─────────────────────────────────────────────────────────
const STATUS_COLOR = {
  viendo:     '#22c55e',
  completado: '#3b82f6',
  pendiente:  '#94a3b8',
  en_pausa:   '#f59e0b',
  abandonado: '#ef4444',
};

const STATUS_LABEL = {
  viendo:     'Viendo',
  completado: 'Completado',
  pendiente:  'Pendiente',
  en_pausa:   'En Pausa',
  abandonado: 'Abandonado',
};

function getImageSrc(imagen) {
  if (!imagen) return 'img/no-image.png';
  if (imagen.startsWith('http')) return imagen;
  // Ruta local → file URL (Windows: C:\... → file:///C:/...)
  const normalized = imagen.replace(/\\/g, '/');
  return `file:///${normalized.replace(/^\//, '')}`;
}

// ─── Contadores del sidebar ───────────────────────────────────────────────────
async function actualizarContadores() {
  const conteos = await window.api.contarEstados();
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

// ─── Renderizar grid ──────────────────────────────────────────────────────────
async function cargarContenido(termino = '') {
  const items = await window.api.getContenido({ estado: filtroEstado, tag: filtroTag });
  todosLosItems = items;

  const filtrados = termino
    ? items.filter(i => i.titulo.toLowerCase().includes(termino.toLowerCase()))
    : items;

  renderGrid(filtrados);
  await actualizarContadores();
}

function renderGrid(items) {
  const grid      = document.getElementById('grid');
  const empty     = document.getElementById('emptyState');
  grid.innerHTML  = '';

  if (items.length === 0) {
    empty.style.display = 'flex';
    return;
  }
  empty.style.display = 'none';

  items.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'card' + (item.id === idActual ? ' selected' : '');
    card.style.setProperty('--sc', STATUS_COLOR[item.estado]);
    card.style.animationDelay = `${index * 28}ms`;

    const tieneEntregas  = item.total_entregas > 0;
    const tags = item.tags || [];
    const soloEsPelicula = tags.length === 1 && tags[0] === 'pelicula';
    const tieneEpisodios = !soloEsPelicula && !tieneEntregas;
    const progreso = tieneEntregas
      ? `${item.entregas_vistas} / ${item.total_entregas} entregas`
      : tieneEpisodios && item.episodios_totales > 0
        ? `${item.episodio_actual} / ${item.episodios_totales} ep.`
        : (item.anio ? String(item.anio) : '');

    card.innerHTML = `
      <img class="card-img" src="${getImageSrc(item.imagen)}" alt="${item.titulo}"
           loading="lazy" onerror="this.src='img/no-image.png'">
      <div class="card-grad">
        <div class="card-title">${item.titulo}</div>
        <div class="card-sub">
          <span class="card-dot"></span>
          <span>${progreso}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => mostrarDetalle(item.id));
    grid.appendChild(card);
  });
}

// ─── Panel de detalle ─────────────────────────────────────────────────────────
async function mostrarDetalle(id) {
  idActual = id;
  const item = await window.api.getDetalle(id);
  if (!item) return;

  const panel = document.getElementById('detailPanel');
  const inner = document.getElementById('detailInner');
  panel.classList.add('open');

  const tags = item.tags || [];
  const soloEsPelicula = tags.length === 1 && tags[0] === 'pelicula';
  const tieneEpisodios = !soloEsPelicula;
  const color   = STATUS_COLOR[item.estado];
  const epActual = item.episodio_actual || 0;
  const epTotal  = item.episodios_totales || 0;
  const pct = epTotal > 0 ? Math.min(100, Math.round((epActual / epTotal) * 100)) : 0;
  const metaParts = [];
  if (item.anio) metaParts.push(item.anio);
  if (tieneEpisodios && epTotal > 0) metaParts.push(`${epTotal} ep.`);

  inner.innerHTML = `
    <div class="dh-hero">
      <img class="dh-img" src="${getImageSrc(item.imagen)}" alt="${item.titulo}"
           onerror="this.src='img/no-image.png'">
      <div class="dh-grad"></div>
      <div class="dh-overlay">
        <div class="dh-chips">${(item.tags || []).map(t =>
          `<span class="tag-chip${t === filtroTag ? ' active-filter' : ''}" data-tag="${t}">${t}</span>`
        ).join('')}</div>
        <div class="dh-title">${item.titulo}</div>
        <span class="dh-status">
          <span class="dh-status-dot" style="background:${color}"></span>
          <span style="color:${color}">${STATUS_LABEL[item.estado]}</span>
        </span>
      </div>
      <button class="dh-close" id="btnCerrarDetalle">×</button>
    </div>

    <div class="dh-body">
      <div class="dh-meta">${metaParts.join(' · ') || '&nbsp;'}</div>

      <div id="dhEntregas"></div>

      ${tieneEpisodios ? `
        <div id="dhEpGlobal" class="dh-ep">
          <div class="dh-ep-header">
            <span>Episodio actual</span>
            <span class="dh-ep-frac">${epActual} / ${epTotal || '?'}</span>
          </div>
          <div class="dh-ep-bar">
            <div class="dh-ep-fill" style="width:${pct}%"></div>
          </div>
          <div class="dh-ep-controls">
            <button class="dh-ep-btn" id="btnEpMenos" ${epActual <= 0 ? 'disabled' : ''}>−</button>
            <span class="dh-ep-num">Ep. ${epActual}${pct > 0 ? ` · ${pct}%` : ''}</span>
            <button class="dh-ep-btn" id="btnEpMas" ${epTotal > 0 && epActual >= epTotal ? 'disabled' : ''}>+</button>
          </div>
        </div>
      ` : ''}

      <div class="dh-desc">${item.descripcion || '<em style="opacity:.4">Sin descripción</em>'}</div>
    </div>

    <div class="dh-foot">
      <button class="dh-btn-edit" id="btnEditarDetalle">✏ Editar</button>
      <button class="dh-btn-del" id="btnEliminarDetalle">Eliminar</button>
    </div>
  `;

  const itemTags = item.tags || [];
  const soloEsPeliculaEntregas = itemTags.length === 1 && itemTags[0] === 'pelicula';
  await cargarEntregas(id, document.getElementById('dhEntregas'), soloEsPeliculaEntregas ? 'pelicula' : 'serie');

  // Clicks en tag chips → filtrar grid
  inner.querySelectorAll('.tag-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const tag = chip.dataset.tag;
      filtroTag = filtroTag === tag ? null : tag;
      actualizarTagFilterBar();
      cargarContenido(document.getElementById('searchBar').value);
    });
  });

  // Cerrar panel
  document.getElementById('btnCerrarDetalle').onclick = () => {
    idActual = null;
    panel.classList.remove('open');
    renderGrid(todosLosItems);
  };

  // Editar
  document.getElementById('btnEditarDetalle').onclick = () => abrirModalEditar(item);

  // Eliminar
  document.getElementById('btnEliminarDetalle').onclick = async () => {
    if (confirm(`¿Eliminar "${item.titulo}"?`)) {
      await window.api.eliminarContenido(id);
      idActual = null;
      panel.classList.remove('open');
      await cargarContenido();
    }
  };

  // Botones de episodio
  if (tieneEpisodios) {
    document.getElementById('btnEpMas').onclick = async () => {
      const updated = { ...item, episodio_actual: item.episodio_actual + 1 };
      await window.api.actualizarContenido(updated);
      mostrarDetalle(id);
      await cargarContenido();
    };

    document.getElementById('btnEpMenos').onclick = async () => {
      if (item.episodio_actual <= 0) return;
      const updated = { ...item, episodio_actual: item.episodio_actual - 1 };
      await window.api.actualizarContenido(updated);
      mostrarDetalle(id);
      await cargarContenido();
    };
  }

  // Resaltar card activa
  renderGrid(todosLosItems);
}

// ─── Tags: barra de filtro activo ─────────────────────────────────────────────
function actualizarTagFilterBar() {
  const bar   = document.getElementById('tagFilterBar');
  const label = document.getElementById('tagFilterLabel');
  if (filtroTag) {
    bar.style.display = '';
    label.textContent = filtroTag;
  } else {
    bar.style.display = 'none';
  }
}

// ─── Tags: render pills en el modal ───────────────────────────────────────────
function renderTagsModal() {
  const area = document.getElementById('modalTagsArea');
  area.innerHTML = '';
  tagsDisponibles.forEach(tag => {
    const btn = document.createElement('button');
    btn.className = 'tag-pill' + (tagsModal.has(tag.id) ? ' active' : '');
    btn.textContent = tag.nombre;
    btn.addEventListener('click', () => {
      if (tagsModal.has(tag.id)) tagsModal.delete(tag.id);
      else tagsModal.add(tag.id);
      renderTagsModal();
      actualizarVisibilidadAnime();
      actualizarVisibilidadEpisodios();
    });
    area.appendChild(btn);
  });
}

function actualizarVisibilidadAnime() {
  const tagAnime = tagsDisponibles.find(t => t.nombre === 'anime');
  const mostrar  = tagAnime && tagsModal.has(tagAnime.id);
  document.getElementById('animeSearchSection').style.display = mostrar ? 'flex' : 'none';
}

function actualizarVisibilidadEpisodios() {
  const tagPelicula = tagsDisponibles.find(t => t.nombre === 'pelicula');
  const soloEsPelicula = tagPelicula
    && tagsModal.size === 1
    && tagsModal.has(tagPelicula.id);
  document.getElementById('episodiosGroup').style.display = soloEsPelicula ? 'none' : 'flex';
}

// ─── Modal ────────────────────────────────────────────────────────────────────
function abrirModal(titulo) {
  document.getElementById('modalTitle').textContent = titulo;
  document.getElementById('modal').style.display = 'flex';
}

function cerrarModal() {
  document.getElementById('modal').style.display = 'none';
  document.getElementById('resultadosBusqueda').innerHTML = '';
  document.getElementById('buscarAnimeInput').value = '';
}

function abrirModalNuevo() {
  modoModal = 'nuevo';
  tagsModal = new Set();

  document.getElementById('modalTitulo').value      = '';
  document.getElementById('modalAnio').value        = '';
  document.getElementById('modalEstado').value      = 'pendiente';
  document.getElementById('modalEpActual').value    = '0';
  document.getElementById('modalEpTotal').value     = '0';
  document.getElementById('modalDescripcion').value = '';
  document.getElementById('modalImagen').value      = '';
  document.getElementById('modalPreview').src       = 'img/no-image.png';

  renderTagsModal();
  actualizarVisibilidadAnime();
  actualizarVisibilidadEpisodios();
  abrirModal('Añadir entrada');
}

async function abrirModalEditar(item) {
  modoModal = 'editar';

  document.getElementById('modalTitulo').value      = item.titulo;
  document.getElementById('modalAnio').value        = item.anio || '';
  document.getElementById('modalEstado').value      = item.estado;
  document.getElementById('modalEpActual').value    = item.episodio_actual || 0;
  document.getElementById('modalEpTotal').value     = item.episodios_totales || 0;
  document.getElementById('modalDescripcion').value = item.descripcion || '';
  document.getElementById('modalImagen').value      = item.imagen || '';
  document.getElementById('modalPreview').src       = getImageSrc(item.imagen);

  const tagsDeLItem = await window.api.getTagsContenido(item.id);
  tagsModal = new Set(tagsDeLItem.map(t => t.id));
  renderTagsModal();
  actualizarVisibilidadAnime();
  actualizarVisibilidadEpisodios();
  abrirModal('Editar entrada');
}

// Guardar desde modal
async function guardarDesdeModal() {
  const titulo = document.getElementById('modalTitulo').value.trim();
  if (!titulo) {
    alert('El título es obligatorio.');
    return;
  }

  // Derivar el campo `tipo` legacy del primer tag seleccionado (compatibilidad BD)
  const primerTag = tagsDisponibles.find(t => tagsModal.has(t.id));
  const tipoLegacy = primerTag ? primerTag.nombre : 'anime';

  const item = {
    titulo,
    tipo:              tipoLegacy,
    estado:            document.getElementById('modalEstado').value,
    episodio_actual:   parseInt(document.getElementById('modalEpActual').value)  || 0,
    episodios_totales: parseInt(document.getElementById('modalEpTotal').value)   || 0,
    descripcion:       document.getElementById('modalDescripcion').value.trim(),
    anio:              parseInt(document.getElementById('modalAnio').value)       || null,
    imagen:            document.getElementById('modalImagen').value.trim(),
    fecha_inicio:      '',
    fecha_fin:         '',
  };

  let contenidoId;
  if (modoModal === 'nuevo') {
    const res = await window.api.guardarContenido(item);
    contenidoId = res.lastInsertRowid;
  } else {
    await window.api.actualizarContenido({ id: idActual, ...item });
    contenidoId = idActual;
  }
  await window.api.setTagsContenido(contenidoId, [...tagsModal]);

  cerrarModal();
  await cargarContenido();

  // Si estamos editando, refrescar el panel de detalle
  if (modoModal === 'editar' && idActual) {
    mostrarDetalle(idActual);
  }
}

// ─── Búsqueda de anime (Jikan) ────────────────────────────────────────────────
async function buscarAnime() {
  const query = document.getElementById('buscarAnimeInput').value.trim();
  if (!query) return;

  const contenedor = document.getElementById('resultadosBusqueda');
  contenedor.innerHTML = '<div class="spinner"></div>';

  try {
    const resultados = await window.api.buscarAnime(query);
    contenedor.innerHTML = '';

    if (resultados.length === 0) {
      contenedor.innerHTML = '<small style="color:var(--text-muted)">Sin resultados</small>';
      return;
    }

    resultados.forEach(r => {
      const card = document.createElement('div');
      card.className = 'resultado-card';
      card.innerHTML = `
        <img src="${r.imagen || 'img/no-image.png'}" alt="${r.titulo}"
             onerror="this.src='img/no-image.png'">
        <p>${r.titulo}</p>
      `;
      card.addEventListener('click', () => {
        // Rellenar formulario con datos del resultado
        document.getElementById('modalTitulo').value      = r.titulo;
        document.getElementById('modalAnio').value        = r.anio || '';
        document.getElementById('modalDescripcion').value = r.descripcion || '';
        document.getElementById('modalImagen').value      = r.imagen || '';
        document.getElementById('modalPreview').src       = r.imagen || 'img/no-image.png';
        document.getElementById('modalEpTotal').value     = r.episodios_totales || 0;

        // Marcar card seleccionada
        contenedor.querySelectorAll('.resultado-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
      });
      contenedor.appendChild(card);
    });
  } catch (e) {
    contenedor.innerHTML = '<small style="color:var(--abandonado)">Error al buscar. Comprueba la conexión.</small>';
  }
}

// ─── Entregas ─────────────────────────────────────────────────────────────────

// Convierte un span en input inline; llama onSave(nuevoValor) al confirmar
function makeEditable(span, cssClass, onSave) {
  const oldText = span.textContent;
  const input   = document.createElement('input');
  input.value     = oldText;
  input.className = cssClass;
  span.replaceWith(input);
  input.focus();
  input.select();

  let saved = false;
  const guardar = async () => {
    if (saved) return;
    saved = true;
    const nuevo = input.value.trim() || oldText;
    await onSave(nuevo);
  };
  input.addEventListener('blur', guardar);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
    if (e.key === 'Escape') { saved = true; input.replaceWith(span); }
  });
}

async function cargarEntregas(contenidoId, container, tipo = 'anime') {
  const entregas  = await window.api.getEntregas(contenidoId);
  const total     = entregas.length;
  const vistas    = entregas.filter(e => e.visto).length;
  const pct       = total > 0 ? Math.round(vistas / total * 100) : 0;
  const conEp     = tipo !== 'pelicula'; // mostrar contador de episodios por entrega

  // Ocultar contador global de la serie si hay entregas (los eps van por entrega)
  const globalEl = document.getElementById('dhEpGlobal');
  if (globalEl) globalEl.style.display = total > 0 ? 'none' : '';

  const filaEntrega = (e) => {
    const epA = e.episodio_actual  || 0;
    const epT = e.episodios_totales || 0;
    const epDisabledMas   = epT > 0 && epA >= epT ? 'disabled' : '';
    const epDisabledMenos = epA <= 0 ? 'disabled' : '';
    return `
      <div class="entrega-item">
        <button class="entrega-check${e.visto ? ' checked' : ''}" data-id="${e.id}">✓</button>
        <span class="entrega-num"   data-id="${e.id}" title="Doble clic para editar">${e.numero}</span>
        <span class="entrega-titulo" data-id="${e.id}" title="Doble clic para renombrar">${e.titulo || ''}</span>
        ${conEp ? `
          <div class="entrega-ep">
            <button class="entrega-ep-btn" data-id="${e.id}" data-delta="-1" ${epDisabledMenos}>−</button>
            <span class="entrega-ep-actual">${epA}</span>
            <span class="entrega-ep-sep">/</span>
            <span class="entrega-ep-total" data-id="${e.id}" title="Clic para editar total">${epT || '?'}</span>
            <button class="entrega-ep-btn" data-id="${e.id}" data-delta="1"  ${epDisabledMas}>+</button>
          </div>` : ''}
        <button class="entrega-del" data-id="${e.id}" title="Eliminar">×</button>
      </div>`;
  };

  container.innerHTML = `
    <div class="dh-entregas">
      <div class="dh-entregas-header">
        <span class="dh-entregas-label">Entregas / Temporadas</span>
        ${total > 0 ? `<span class="dh-ep-frac">${vistas} / ${total}</span>` : ''}
      </div>
      ${total > 0 ? `
        <div class="dh-ep-bar" style="margin-bottom:10px">
          <div class="dh-ep-fill" style="width:${pct}%"></div>
        </div>` : ''}
      <div class="entrega-list">
        ${total === 0
          ? '<div class="entrega-empty">Sin entregas. Añade la primera abajo.</div>'
          : entregas.map(filaEntrega).join('')}
      </div>
      <div class="entrega-add">
        <input class="entrega-add-input" type="text" id="newEntregaInput" placeholder="Nombre de la entrega...">
        <button class="entrega-add-btn" id="btnAddEntrega">+</button>
      </div>
    </div>
  `;

  const refresh = () => {
    cargarEntregas(contenidoId, container, tipo);
    cargarContenido(document.getElementById('searchBar').value);
  };

  // Toggle visto
  container.querySelectorAll('.entrega-check').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.api.toggleEntrega(parseInt(btn.dataset.id));
      refresh();
    });
  });

  // Eliminar entrega
  container.querySelectorAll('.entrega-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.api.eliminarEntrega(parseInt(btn.dataset.id));
      refresh();
    });
  });

  // Botones +/- de episodio por entrega
  container.querySelectorAll('.entrega-ep-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      await window.api.epEntregaDelta(parseInt(btn.dataset.id), parseInt(btn.dataset.delta));
      refresh();
    });
  });

  // Editar total de episodios (clic en el número total)
  container.querySelectorAll('.entrega-ep-total').forEach(span => {
    span.addEventListener('click', () => {
      const oldVal = span.textContent === '?' ? '' : span.textContent;
      const input  = document.createElement('input');
      input.type      = 'number';
      input.value     = oldVal;
      input.min       = '0';
      input.className = 'entrega-ep-total-edit';
      span.replaceWith(input);
      input.focus();
      input.select();

      let saved = false;
      const guardar = async () => {
        if (saved) return;
        saved = true;
        await window.api.setEpTotalEntrega(parseInt(span.dataset.id), parseInt(input.value) || 0);
        refresh();
      };
      input.addEventListener('blur', guardar);
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { saved = true; input.replaceWith(span); }
      });
    });
  });

  // Editar número con doble clic
  container.querySelectorAll('.entrega-num').forEach(span => {
    span.addEventListener('dblclick', () => makeEditable(span, 'entrega-num-edit', async (nuevo) => {
      await window.api.renombrarNumero(parseInt(span.dataset.id), nuevo);
      refresh();
    }));
  });

  // Renombrar título con doble clic
  container.querySelectorAll('.entrega-titulo').forEach(span => {
    span.addEventListener('dblclick', () => makeEditable(span, 'entrega-titulo-edit', async (nuevo) => {
      await window.api.renombrarEntrega(parseInt(span.dataset.id), nuevo);
      refresh();
    }));
  });

  // Añadir nueva entrega
  const addEntrega = async () => {
    const inputEl = document.getElementById('newEntregaInput');
    const titulo  = inputEl.value.trim();
    await window.api.guardarEntrega({ contenido_id: contenidoId, titulo });
    inputEl.value = '';
    refresh();
  };
  document.getElementById('btnAddEntrega').addEventListener('click', addEntrega);
  document.getElementById('newEntregaInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') addEntrega();
  });
}

// ─── Filtros del sidebar ──────────────────────────────────────────────────────
document.querySelectorAll('.filter-btn[data-estado]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-btn[data-estado]').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    filtroEstado = btn.dataset.estado;
    cargarContenido(document.getElementById('searchBar').value);
  });
});

// ─── Sidebar: toggle completo ────────────────────────────────────────────────
document.getElementById('btnToggleSidebar').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('collapsed');
});

// ─── Header: limpiar filtro de tag ────────────────────────────────────────────
document.getElementById('btnClearTagFilter').addEventListener('click', () => {
  filtroTag = null;
  actualizarTagFilterBar();
  cargarContenido(document.getElementById('searchBar').value);
});

// ─── Búsqueda local ───────────────────────────────────────────────────────────
let searchTimeout = null;
document.getElementById('searchBar').addEventListener('input', (e) => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    renderGrid(
      e.target.value
        ? todosLosItems.filter(i => i.titulo.toLowerCase().includes(e.target.value.toLowerCase()))
        : todosLosItems
    );
  }, 200);
});

// ─── Botón añadir ─────────────────────────────────────────────────────────────
document.getElementById('btnNuevo').addEventListener('click', abrirModalNuevo);

// ─── Modal: añadir nueva etiqueta ────────────────────────────────────────────
async function crearYAnadirTag() {
  const input = document.getElementById('newTagInput');
  const nombre = input.value.trim().toLowerCase();
  if (!nombre) return;
  const tag = await window.api.crearTag(nombre);
  input.value = '';
  tagsDisponibles = await window.api.getTags();
  tagsModal.add(tag.id);
  renderTagsModal();
  actualizarVisibilidadAnime();
  actualizarVisibilidadEpisodios();
}
document.getElementById('btnAddTag').addEventListener('click', crearYAnadirTag);
document.getElementById('newTagInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') crearYAnadirTag();
});

// ─── Modal: buscar anime ──────────────────────────────────────────────────────
document.getElementById('btnBuscarAnime').addEventListener('click', buscarAnime);
document.getElementById('buscarAnimeInput').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') buscarAnime();
});

// ─── Modal: seleccionar imagen local ─────────────────────────────────────────
document.getElementById('btnSeleccionarImg').addEventListener('click', async () => {
  const ruta = await window.api.seleccionarImagen();
  if (ruta) {
    document.getElementById('modalImagen').value = ruta;
    document.getElementById('modalPreview').src  = getImageSrc(ruta);
  }
});

// ─── Modal: guardar / cerrar ──────────────────────────────────────────────────
document.getElementById('btnGuardarModal').addEventListener('click', guardarDesdeModal);
document.getElementById('btnCerrarModal').addEventListener('click', cerrarModal);
document.getElementById('btnCancelarModal').addEventListener('click', cerrarModal);

// Cerrar modal al clicar fuera
document.getElementById('modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modal')) cerrarModal();
});

// ─── Importación XML ──────────────────────────────────────────────────────────

const ESTADOS_VALIDOS = ['viendo', 'completado', 'pendiente', 'en_pausa', 'abandonado'];

const PLANTILLA_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  Formato de importación ListIt
  Campo obligatorio: <titulo>
  Todos los demás son opcionales.

  tipo:   anime | pelicula | serie
  estado: pendiente | viendo | completado | en_pausa | abandonado
  visto (en entrega): 1 = visto, 0 = no visto
-->
<listit>

  <!-- Ejemplo completo: anime con temporadas -->
  <entrada>
    <titulo>Attack on Titan</titulo>
    <tipo>anime</tipo>
    <estado>completado</estado>
    <anio>2013</anio>
    <descripcion>La humanidad vive encerrada tras enormes murallas que la protegen de los Titanes.</descripcion>
    <imagen>https://cdn.myanimelist.net/images/anime/10/47347.jpg</imagen>
    <episodio_actual>87</episodio_actual>
    <episodios_totales>87</episodios_totales>
    <entregas>
      <entrega>
        <numero>S1</numero>
        <titulo>Temporada 1</titulo>
        <visto>1</visto>
        <episodio_actual>25</episodio_actual>
        <episodios_totales>25</episodios_totales>
      </entrega>
      <entrega>
        <numero>S2</numero>
        <titulo>Temporada 2</titulo>
        <visto>1</visto>
        <episodio_actual>12</episodio_actual>
        <episodios_totales>12</episodios_totales>
      </entrega>
      <entrega>
        <numero>Final Season</numero>
        <titulo>Temporada Final</titulo>
        <visto>0</visto>
        <episodios_totales>28</episodios_totales>
      </entrega>
    </entregas>
  </entrada>

  <!-- Ejemplo: saga de películas -->
  <entrada>
    <titulo>Toy Story</titulo>
    <tipo>pelicula</tipo>
    <estado>viendo</estado>
    <anio>1995</anio>
    <entregas>
      <entrega>
        <numero>1</numero>
        <titulo>Toy Story</titulo>
        <visto>1</visto>
      </entrega>
      <entrega>
        <numero>2</numero>
        <titulo>Toy Story 2</titulo>
        <visto>1</visto>
      </entrega>
      <entrega>
        <numero>3</numero>
        <titulo>Toy Story 3</titulo>
        <visto>0</visto>
      </entrega>
    </entregas>
  </entrada>

  <!-- Ejemplo mínimo: solo título -->
  <entrada>
    <titulo>Breaking Bad</titulo>
  </entrada>

</listit>`;

function parsearXML(xmlStr) {
  const doc = new DOMParser().parseFromString(xmlStr, 'text/xml');

  if (doc.querySelector('parsererror')) {
    throw new Error('El archivo XML tiene errores de formato.');
  }

  const txt = (el, tag, def = '') => el.querySelector(tag)?.textContent?.trim() || def;
  const num = (el, tag)           => parseInt(txt(el, tag, '0')) || 0;

  const entradas = [];
  doc.querySelectorAll('entrada').forEach(el => {
    const titulo = txt(el, 'titulo');
    if (!titulo) return;

    const tipoXml = txt(el, 'tipo', 'anime').trim().toLowerCase() || 'anime';
    let estado    = txt(el, 'estado', 'pendiente');
    if (!ESTADOS_VALIDOS.includes(estado)) estado = 'pendiente';

    const contenido = {
      titulo,
      tipo: tipoXml,
      estado,
      anio:              num(el, 'anio') || null,
      descripcion:       txt(el, 'descripcion'),
      imagen:            txt(el, 'imagen'),
      episodio_actual:   num(el, 'episodio_actual'),
      episodios_totales: num(el, 'episodios_totales'),
      fecha_inicio:      txt(el, 'fecha_inicio'),
      fecha_fin:         txt(el, 'fecha_fin'),
    };

    const entregas = [];
    el.querySelectorAll('entregas > entrega').forEach((ent, i) => {
      entregas.push({
        numero:            txt(ent, 'numero') || String(i + 1),
        titulo:            txt(ent, 'titulo'),
        visto:             txt(ent, 'visto') === '1' ? 1 : 0,
        episodio_actual:   num(ent, 'episodio_actual'),
        episodios_totales: num(ent, 'episodios_totales'),
      });
    });

    entradas.push({ contenido, entregas });
  });

  return entradas;
}

// ── UI del modal de importación ───────────────────────────────────────────────

let xmlParseado = [];

function abrirImport() {
  xmlParseado = [];
  document.getElementById('importStep1').style.display   = '';
  document.getElementById('importStep2').style.display   = 'none';
  document.getElementById('importStep3').style.display   = 'none';
  document.getElementById('importTitle').textContent     = 'Importar desde XML';
  document.getElementById('importFooter').innerHTML      =
    '<button class="btn-secondary" id="btnCancelarImport">Cancelar</button>';
  document.getElementById('btnCancelarImport').onclick   = cerrarImport;
  document.getElementById('modalImport').style.display   = 'flex';
}

function cerrarImport() {
  document.getElementById('modalImport').style.display = 'none';
}

function mostrarPrevisualizacion(entradas, fileName) {
  xmlParseado = entradas;

  document.getElementById('importStep1').style.display = 'none';
  document.getElementById('importStep2').style.display = '';

  document.getElementById('importFileName').textContent = fileName;
  document.getElementById('importPreviewHeader').textContent =
    `${entradas.length} entrada${entradas.length !== 1 ? 's' : ''} encontrada${entradas.length !== 1 ? 's' : ''}`;

  const lista = document.getElementById('importPreviewList');
  lista.innerHTML = entradas.map(({ contenido, entregas }) => {
    const metaParts = [contenido.tipo || 'sin tipo'];
    if (entregas.length) metaParts.push(`${entregas.length} entregas`);
    if (contenido.anio) metaParts.push(contenido.anio);
    return `
      <div class="import-preview-item">
        <span class="sdot" style="background:${STATUS_COLOR[contenido.estado]}"></span>
        <span class="ipi-titulo">${contenido.titulo}</span>
        <span class="ipi-meta">${metaParts.join(' · ')}</span>
      </div>`;
  }).join('');

  // Footer con botón de confirmar
  document.getElementById('importFooter').innerHTML = `
    <button class="btn-secondary" id="btnCancelarImport2">Cancelar</button>
    <button class="btn-primary"   id="btnConfirmarImport">
      Importar (${entradas.length})
    </button>`;
  document.getElementById('btnCancelarImport2').onclick  = cerrarImport;
  document.getElementById('btnConfirmarImport').onclick  = ejecutarImport;
}

async function ejecutarImport() {
  document.getElementById('btnConfirmarImport').disabled    = true;
  document.getElementById('btnConfirmarImport').textContent = 'Importando...';

  let ok = 0, errores = 0;
  const fallos = [];

  for (const { contenido, entregas } of xmlParseado) {
    try {
      const res   = await window.api.guardarContenido(contenido);
      const newId = res.lastInsertRowid;

      // Crear o reusar el tag del campo tipo del XML y asignarlo
      if (contenido.tipo) {
        const tag = await window.api.crearTag(contenido.tipo);
        if (tag) await window.api.setTagsContenido(newId, [tag.id]);
      }

      for (const ent of entregas) {
        await window.api.guardarEntregaCompleta({ contenido_id: newId, ...ent });
      }
      ok++;
    } catch (e) {
      errores++;
      fallos.push(contenido.titulo);
      console.error('Import error:', contenido.titulo, e);
    }
  }

  // Paso 3: resultado
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importStep3').style.display = '';
  document.getElementById('importTitle').textContent   = 'Resultado de la importación';

  document.getElementById('importResult').innerHTML = `
    <div class="import-result-row import-result-ok">
      <span class="import-result-num">${ok}</span>
      <span>entrada${ok !== 1 ? 's' : ''} importada${ok !== 1 ? 's' : ''} correctamente</span>
    </div>
    ${errores > 0 ? `
    <div class="import-result-row import-result-err">
      <span class="import-result-num">${errores}</span>
      <span>con error: ${fallos.join(', ')}</span>
    </div>` : ''}
  `;

  document.getElementById('importFooter').innerHTML =
    '<button class="btn-primary" id="btnCerrarImportFin">Cerrar</button>';
  document.getElementById('btnCerrarImportFin').onclick = () => {
    cerrarImport();
    cargarContenido();
  };
}

// ── Listeners del modal de importación ───────────────────────────────────────

document.getElementById('btnImport').addEventListener('click', abrirImport);

document.getElementById('btnCerrarImport').addEventListener('click', cerrarImport);

document.getElementById('modalImport').addEventListener('click', (e) => {
  if (e.target === document.getElementById('modalImport')) cerrarImport();
});

document.getElementById('btnPickXml').addEventListener('click', async () => {
  const xmlStr = await window.api.seleccionarXml();
  if (!xmlStr) return;

  try {
    const entradas = parsearXML(xmlStr);
    if (entradas.length === 0) {
      alert('No se encontraron entradas válidas en el archivo.\nAsegúrate de que cada <entrada> tenga al menos un <titulo>.');
      return;
    }
    // Obtener nombre del archivo del diálogo (no disponible aquí, usamos genérico)
    mostrarPrevisualizacion(entradas, 'archivo.xml');
  } catch (e) {
    alert('Error al leer el XML:\n' + e.message);
  }
});

document.getElementById('btnDescargarPlantilla').addEventListener('click', async () => {
  await window.api.guardarPlantillaXml(PLANTILLA_XML);
});

// ─── Inicio ───────────────────────────────────────────────────────────────────
(async () => {
  tagsDisponibles = await window.api.getTags();
  actualizarTagFilterBar();
  await cargarContenido();
})();
