let idActual = null;
let modo = null;

function cargarPeliculas() {
  window.api.getDatos().then(peliculas => {
    const contenedor = document.getElementById('peliculas');
    contenedor.innerHTML = '';

    peliculas.forEach(pelicula => {
      const item = document.createElement('div');
      item.classList.add('item');
      item.textContent = `${pelicula.titulo} (${pelicula.anio})`;
      item.addEventListener('click', () => mostrarDetalle(pelicula.id));
      contenedor.appendChild(item);
    });
  });
}

async function mostrarDetalle(id) {
  const detalle = document.getElementById('detalle');
  detalle.style.display = 'block';
  modo = 'ver';
  idActual = id;

  toggleModoEdicion(false);

  const pelicula = await window.api.getDetalle(id);

  if (pelicula) {
    document.getElementById('tituloDetalle').textContent = pelicula.titulo;
    document.getElementById('anioDetalle').textContent = `Año: ${pelicula.anio}`;
    document.getElementById('descripcionDetalle').textContent = pelicula.descripcion;
    document.getElementById('imagenDetalle').src = pelicula.imagen || 'img/no-image.png';

    document.getElementById('tituloDetalleInput').value = pelicula.titulo;
    document.getElementById('anioDetalleInput').value = pelicula.anio;
    document.getElementById('descripcionDetalleInput').value = pelicula.descripcion;
    document.getElementById('imagenDetalleInput').value = pelicula.imagen;

    document.getElementById('guardarBtn').style.display = 'none';
    document.getElementById('editarBtn').style.display = 'inline-block';
    document.getElementById('eliminarBtn').style.display = 'inline-block';

    document.getElementById('eliminarBtn').onclick = () => {
      if (confirm('¿Seguro que quieres eliminar esta película?')) {
        window.api.eliminarPelicula(id).then(() => {
          cargarPeliculas();
          limpiarDetalle();
        });
      }
    };
  }
}

function mostrarFormularioNuevaPelicula() {
  const detalle = document.getElementById('detalle');
  detalle.style.display = 'block';
  modo = 'nuevo';
  idActual = null;

  toggleModoEdicion(true);

  document.getElementById('tituloDetalleInput').value = '';
  document.getElementById('anioDetalleInput').value = '';
  document.getElementById('descripcionDetalleInput').value = '';
  document.getElementById('imagenDetalleInput').value = '';
  document.getElementById('imagenDetalle').src = 'img/no-image.png';

  document.getElementById('guardarBtn').style.display = 'inline-block';
  document.getElementById('editarBtn').style.display = 'none';
  document.getElementById('eliminarBtn').style.display = 'none';

  document.getElementById('guardarBtn').onclick = () => guardarPelicula();
}

function guardarPelicula() {
  const titulo = document.getElementById('tituloDetalleInput').value;
  const descripcion = document.getElementById('descripcionDetalleInput').value;
  const anio = parseInt(document.getElementById('anioDetalleInput').value);
  const imagen = document.getElementById('imagenDetalleInput').value;

  if (!titulo || !descripcion || isNaN(anio)) {
    alert('Por favor completa todos los campos.');
    return;
  }

  const pelicula = { titulo, descripcion, anio, imagen };

  if (modo === 'nuevo') {
    window.api.guardarDatos(pelicula).then(() => {
      cargarPeliculas();
      limpiarDetalle();
    });
  } else if (modo === 'editar' && idActual !== null) {
    window.api.actualizarPelicula({ id: idActual, ...pelicula }).then(() => {
      cargarPeliculas();
      limpiarDetalle();
    });
  }
}

function toggleModoEdicion(editar) {
  document.getElementById('tituloDetalle').style.display = editar ? 'none' : 'block';
  document.getElementById('tituloDetalleInput').style.display = editar ? 'block' : 'none';

  document.getElementById('anioDetalle').style.display = editar ? 'none' : 'block';
  document.getElementById('anioDetalleInput').style.display = editar ? 'block' : 'none';

  document.getElementById('descripcionDetalle').style.display = editar ? 'none' : 'block';
  document.getElementById('descripcionDetalleInput').style.display = editar ? 'block' : 'none';

  document.getElementById('imagenDetalleInput').style.display = editar ? 'block' : 'none';
}

function limpiarDetalle() {
  document.getElementById('detalle').style.display = 'none';
  document.getElementById('tituloDetalle').textContent = '';
  document.getElementById('anioDetalle').textContent = '';
  document.getElementById('descripcionDetalle').textContent = '';
  document.getElementById('imagenDetalle').src = '';
}

document.getElementById('btnNuevaPelicula').addEventListener('click', () => {
  mostrarFormularioNuevaPelicula();
});

document.getElementById('editarBtn').addEventListener('click', () => {
  modo = 'editar';
  toggleModoEdicion(true);
  document.getElementById('guardarBtn').style.display = 'inline-block';
  document.getElementById('editarBtn').style.display = 'none';
});

// Inicial
cargarPeliculas();
