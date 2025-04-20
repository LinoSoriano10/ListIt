function cargarPeliculas() {
  window.api.getDatos().then(peliculas => {
    const lista = document.getElementById('lista');
    lista.innerHTML = ''; // Limpiar antes de recargar

    peliculas.forEach(pelicula => {
      const item = document.createElement('div');
      item.textContent = `${pelicula.titulo} (${pelicula.anio})`;
      item.classList.add('item');
      item.dataset.id = pelicula.id;

      item.addEventListener('click', () => {
        window.api.abrirDetalle(pelicula.id);
      });

      lista.appendChild(item);
    });
  });
}

document.getElementById('formulario').addEventListener('submit', (e) => {
  e.preventDefault();

  const titulo = document.getElementById('titulo').value;
  const descripcion = document.getElementById('descripcion').value;
  const anio = parseInt(document.getElementById('anio').value);

  if (titulo && descripcion && anio) {
    const pelicula = { titulo, descripcion, anio };

    window.api.guardarDatos(pelicula).then(() => {
      // Recargar listado
      cargarPeliculas();

      // Limpiar formulario
      document.getElementById('formulario').reset();
    });
  }
});

// Al iniciar, cargar listado
cargarPeliculas();

window.api.abrirDetalle(pelicula.id);
