let imagenBase64 = '';

document.getElementById('fileInput').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) {
    const reader = new FileReader();
    reader.onload = (event) => {
      imagenBase64 = event.target.result;
      document.getElementById('imagen').src = imagenBase64;
    };
    reader.readAsDataURL(file);
  }
});

document.getElementById('guardar').addEventListener('click', () => {
  const titulo = document.getElementById('titulo').value;
  const anio = parseInt(document.getElementById('anio').value);
  const descripcion = document.getElementById('descripcion').value;

  if (titulo && descripcion && anio) {
    const pelicula = { titulo, descripcion, anio, imagen: imagenBase64 };
    window.api.guardarDatos(pelicula).then(() => {
      window.close();  // cerrar ventana al guardar
    });
  }
});
