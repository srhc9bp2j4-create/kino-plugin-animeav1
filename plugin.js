// Plugin AnimeAV1 para Kino
// Sigue el contrato oficial de Kino (apiVersion 1):
// search(query), home(), episodes(ref), resolve(ref)

const BASE = "https://animeav1.com";

// ─── Utilidades ──────────────────────────────────────────────────────────────

function limpiar(html) {
  return String(html)
    .replace(/\\u002F/gi, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&");
}

function titulo(slug) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Un fetch que avisa en español si el sitio no responde bien.
// (El await va primero, como pide la guía de Kino.)
async function pedir(url) {
  const r = await kino.fetch(url);
  if (!r.ok) throw new Error("AnimeAV1 respondió " + r.status);
  return limpiar(r.text());
}

function rutaSegura(ref) {
  return String(ref).split("/").map(encodeURIComponent).join("/");
}

// Saca los animes (slugs únicos) de cualquier página del sitio
function parsearAnimes(html) {
  const items = [];
  const vistos = {};
  const re = /href="\/media\/([A-Za-z0-9._~-]+)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const slug = m[1];
    if (vistos[slug]) continue;
    vistos[slug] = true;

    // Portada: la primera imagen de covers que aparece cerca del enlace
    const cerca = html.slice(m.index, m.index + 800);
    const c = cerca.match(/https:\/\/cdn\.animeav1\.com\/covers\/\d+\.jpg/);

    const item = {
      id: slug,
      ref: slug,
      title: titulo(slug),
      kind: "series",
    };
    if (c) item.poster = c[0];
    items.push(item);
  }
  return items;
}

// ─── search ──────────────────────────────────────────────────────────────────

export async function search(query) {
  const q = (query && query.q ? String(query.q) : "").trim();
  if (!q) return [];
  const html = await pedir(BASE + "/catalogo?search=" + encodeURIComponent(q));
  return parsearAnimes(html).slice(0, 50);
}

// ─── home ────────────────────────────────────────────────────────────────────

export async function home() {
  const rows = [];

  try {
    const html = await pedir(BASE);
    const items = parsearAnimes(html).slice(0, 40);
    if (items.length > 0) {
      rows.push({ id: "recientes", title: "Animes recientes", items });
    }
  } catch (e) {
    kino.log("home (portada) falló: " + e.message);
  }

  try {
    const html = await pedir(BASE + "/catalogo");
    const items = parsearAnimes(html).slice(0, 40);
    if (items.length > 0) {
      rows.push({ id: "catalogo", title: "Catálogo", items });
    }
  } catch (e) {
    kino.log("home (catálogo) falló: " + e.message);
  }

  return rows;
}

// ─── episodes ────────────────────────────────────────────────────────────────
// ref = slug del anime, por ejemplo "one-piece"

export async function episodes(ref) {
  const html = await pedir(BASE + "/media/" + rutaSegura(ref));

  // Título y portada
  const tm = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const cm = html.match(/https:\/\/cdn\.animeav1\.com\/covers\/\d+\.jpg/);
  const bm = html.match(/https:\/\/cdn\.animeav1\.com\/backdrops\/\d+\.jpg/);

  const series = { title: tm ? tm[1].trim() : titulo(ref) };
  if (cm) series.poster = cm[0];
  if (bm) series.backdrop = bm[0];

  // Números de episodio que aparecen en los enlaces
  const re = new RegExp('href="/media/' + ref.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '/(\\d+)"', "g");
  let max = 0;
  let m;
  while ((m = re.exec(html)) !== null) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }

  const lista = [];
  for (let n = 1; n <= max && n <= 2000; n++) {
    lista.push({
      season: 1,
      number: n,
      ref: ref + "/" + n,
      title: "Episodio " + n,
    });
  }

  return { series, episodes: lista };
}

// ─── resolve ─────────────────────────────────────────────────────────────────
// ref = "slug/numero", por ejemplo "one-piece/1"

export async function resolve(ref) {
  const html = await pedir(BASE + "/media/" + rutaSegura(ref));

  // Busca enlaces directos de video (.m3u8 / .mp4)
  const encontrados = html.match(/https:\/\/[^"'\s<>\\]+?\.(?:m3u8|mp4)[^"'\s<>\\]*/g) || [];

  // Kino solo reproduce videos que estén en los hosts declarados en el manifiesto
  const permitidos = encontrados.filter((u) => {
    const h = u.match(/^https:\/\/([^\/:?#]+)/);
    if (!h) return false;
    const host = h[1].toLowerCase();
    return host === "animeav1.com" || host.endsWith(".animeav1.com");
  });

  if (permitidos.length === 0) {
    throw new Error(
      "No encontré un video directo en AnimeAV1. Puede que use un reproductor externo."
    );
  }

  return { url: permitidos[0] };
}
