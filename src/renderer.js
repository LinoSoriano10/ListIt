window.api.getDatos().then(datos => {
    actualizarLista(datos);
  });
  
  function agregar() {
    const titulo = document.getElementById('titulo').value;
    const tipo = document.getElementById('tipo').value;
  
    if (titulo.trim() === "") return;
  
    window.api.getDatos().then(datos => {
      datos.peliculas.push({ titulo, tipo });
      window.api.guardarDatos(datos).then(() => {
        actualizarLista(datos);
        document.getElementById('titulo').value = '';
      });
    });
  }
  
  function actualizarLista(datos) {
    const lista = document.getElementById('lista');
    lista.innerHTML = '';
    datos.peliculas.forEach(item => {
      const li = document.createElement('li');
      li.textContent = `${item.titulo} (${item.tipo})`;
      lista.appendChild(li);
    });
  }
  