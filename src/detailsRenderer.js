window.api.onCargarDetalle((id) => {
    window.api.getDetalle(id).then(pelicula => {
      if (pelicula) {
        document.getElementById('detalle').innerHTML = `
          <h1>${pelicula.titulo}</h1>
          <p><strong>Año:</strong> ${pelicula.anio}</p>
          <div>${window.api.parseMarkdown(pelicula.descripcion)}</div>
        `;
      } else {
        document.getElementById('detalle').innerHTML = '<p>Película no encontrada</p>';
      }
    });
  });
  