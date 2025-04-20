window.api.onCargarDetalle(async (id) => {
  const pelicula = await window.api.getDetalle(id);

  if (pelicula) {
    document.getElementById('titulo').textContent = pelicula.titulo;
    document.getElementById('anio').textContent = pelicula.anio;
    document.getElementById('descripcion').innerHTML = marked.parse(pelicula.descripcion);

    const imagenEl = document.getElementById('imagen');
    imagenEl.src = pelicula.imagen ? pelicula.imagen : 'placeholder.png';
  } else {
    document.getElementById('titulo').textContent = 'Película no encontrada';
  }
});
