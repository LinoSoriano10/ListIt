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

  const pelicula = await window.api.getDetalle(id);

  if (pelicula) {
    document.getElementById('tituloDetalle').textContent = pelicula.titulo;
    document.getElementById('anioDetalle').textContent = `Año: ${pelicula.anio}`;
    document.getElementById('descripcionDetalle').textContent = pelicula.descripcion;
    const rutaImagen = pelicula.imagen ? pelicula.imagen : 'img/no-image.png';
    document.getElementById('imagenDetalle').src = rutaImagen;

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

function limpiarDetalle() {
  document.getElementById('detalle').style.display = 'none';
  document.getElementById('tituloDetalle').textContent = '';
  document.getElementById('anioDetalle').textContent = '';
  document.getElementById('descripcionDetalle').textContent = '';
  document.getElementById('imagenDetalle').src = '';
}

document.getElementById('formulario').addEventListener('submit', (e) => {
  e.preventDefault();
  const titulo = document.getElementById('titulo').value;
  const descripcion = document.getElementById('descripcion').value;
  const anio = parseInt(document.getElementById('anio').value);
  const imagen = document.getElementById('imagen').value;

  if (titulo && descripcion && anio) {
    const pelicula = { titulo, descripcion, anio, imagen };
    window.api.guardarDatos(pelicula).then(() => {
      cargarPeliculas();
      document.getElementById('formulario').reset();
      document.getElementById('formulario').style.display = 'none';
    });
  }
});

document.getElementById('btnNuevaPelicula').addEventListener('click', () => {
  const formulario = document.getElementById('formulario');
  formulario.style.display = (formulario.style.display === 'none') ? 'block' : 'none';
});

// Inicial
cargarPeliculas();
