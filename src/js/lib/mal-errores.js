// Mensajes de usuario para los códigos de error que devuelve el proceso
// principal al consultar MyAnimeList.
//
// Antes cualquier fallo acababa en un único "Error al conectar con MyAnimeList",
// que mezclaba tres situaciones muy distintas y con acciones distintas: no tener
// Client ID configurado, que el servicio esté caído, o que la búsqueda
// sencillamente no devuelva nada.

const MENSAJES = {
  'sin-credencial':      'Configura tu Client ID de MyAnimeList en Ajustes para poder buscar.',
  'credencial-invalida': 'El Client ID de MyAnimeList no es válido o fue revocado. Revísalo en Ajustes.',
  'consulta-corta':      'Escribe al menos 3 caracteres para buscar.',
  'no-encontrado':       'No se encontró esa entrada en MyAnimeList.',
  'limite':              'Demasiadas peticiones seguidas. Espera unos segundos y reinténtalo.',
  'servicio-caido':      'MyAnimeList no responde ahora mismo. Inténtalo dentro de un rato.',
  'red':                 'Sin conexión a internet.',
};

export function mensajeErrorMal(codigo, respaldo) {
  return MENSAJES[codigo] || respaldo || 'No se pudo consultar MyAnimeList.';
}
