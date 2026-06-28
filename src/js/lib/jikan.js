// Cliente mínimo de Jikan v4 con reintento ante 429 (rate limit ~60 req/min).
// El ritmo base entre peticiones lo marca cada llamador con su propio delay; aquí
// solo se reintenta cuando la API responde 429 (demasiadas peticiones).
export async function jikanGet(url, intentos = 4, espera429 = 1500) {
  for (let i = 0; i < intentos; i++) {
    const resp = await fetch(url);
    if (resp.status === 429) { await new Promise(r => setTimeout(r, espera429)); continue; }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return (await resp.json()).data;
  }
  throw new Error('Jikan rate limit');
}
