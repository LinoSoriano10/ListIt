window.api.onCargarDetalle(async (id) => {
    const pelicula = await window.api.getDetalle(id);
  
    if (pelicula) {
      document.getElementById('titulo').textContent = pelicula.titulo;
      document.getElementById('anio').textContent = pelicula.anio;
      document.getElementById('descripcion').innerHTML = marked.parse(pelicula.descripcion);
    } else {
      document.getElementById('titulo').textContent = 'Película no encontrada';
    }
  });
  