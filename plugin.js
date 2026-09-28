// Plugin AnimeAV1 para Kino
// Fuente: https://animeav1.com

const BASE_URL = "https://animeav1.com";
const CDN_URL = "https://cdn.animeav1.com";

// ─── HOME ────────────────────────────────────────────────────────────────────
// Devuelve filas de contenido para la pantalla principal
export async function home() {
  const html = await kino.fetch(BASE_URL).then(r => r.text());

  const rows = [];

  // Fila: Episodios recientes
  const recentEpisodes = parseRecentEpisodes(html);
  if (recentEpisodes.length > 0) {
    rows.push({
      id: "recientes",
      title: "Episodios Recientes",
      items: recentEpisodes,
    });
  }

  // Fila: Animes recientemente agregados
  const recentAnimes = parseRecentAnimes(html);
  if (recentAnimes.length > 0) {
    rows.push({
      id: "nuevos",
      title: "Animes Nuevos",
      items: recentAnimes,
    });
  }

  return rows;
}

// ─── BROWSE ──────────────────────────────────────────────────────────────────
// Se llama cuando el usuario explora un catálogo o una fila específica
export async function browse(ref, cursor) {
  // ref: identificador de la fila / página
  // cursor: paginación
  const page = cursor ? parseInt(cursor) : 1;

  if (ref === "catalogo" || !ref) {
    const url = `${BASE_URL}/catalogo?page=${page}`;
    const html = await kino.fetch(url).then(r => r.text());
    const items = parseCatalog(html);
    return {
      items,
      cursor: items.length >= 20 ? String(page + 1) : null,
    };
  }

  // Géneros u otros filtros
  const url = `${BASE_URL}/catalogo?genre=${ref}&page=${page}`;
  const html = await kino.fetch(url).then(r => r.text());
  const items = parseCatalog(html);
  return {
    items,
    cursor: items.length >= 20 ? String(page + 1) : null,
  };
}

// ─── SEARCH ──────────────────────────────────────────────────────────────────
export async function search({ query }) {
  const url = `${BASE_URL}/catalogo?q=${encodeURIComponent(query)}`;
  const html = await kino.fetch(url).then(r => r.text());
  return parseCatalog(html);
}

// ─── META (antes "detail") ───────────────────────────────────────────────────
// Devuelve info de un anime + lista de episodios
export async function meta({ ref }) {
  // ref = slug del anime, ej: "one-piece"
  const url = `${BASE_URL}/media/${ref}`;
  const html = await kino.fetch(url).then(r => r.text());
  return parseDetail(html, ref);
}

// ─── STREAM ──────────────────────────────────────────────────────────────────
// Devuelve las URLs de reproducción para un episodio
export async function stream({ ref }) {
  // ref = "slug-anime/numero-episodio"
  const url = `${BASE_URL}/media/${ref}`;
  const html = await kino.fetch(url).then(r => r.text());
  return parseStreams(html);
}

// ═══════════════════════════════════════════════════════════════════════════
//  PARSERS
// ═══════════════════════════════════════════════════════════════════════════

function parseRecentEpisodes(html) {
  const items = [];
  // Episodios recientes: cada entrada tiene thumbnail, título y link de episodio
  const thumbMatches = html.match(/cdn\.animeav1\.com\/thumbnails\/(\d+)\.jpg/g) || [];
  const linkMatches = html.match(/href="\/media\/([^"\/]+)\/(\d+)"/g) || [];
  const titleMatches = html.match(/Ver\s([^<]+?)\s-\s*\d+<\/a>/g) || [];

  const count = Math.min(linkMatches.length, 20);
  for (let i = 0; i < count; i++) {
    const linkMatch = linkMatches[i].match(/href="\/media\/([^"\/]+)\/(\d+)"/);
    if (!linkMatch) continue;
    const slug = linkMatch[1];
    const ep = linkMatch[2];
    const thumb = thumbMatches[i]
      ? `https://${thumbMatches[i]}`
      : `${CDN_URL}/covers/${slug}.jpg`;

    let title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    if (titleMatches[i]) {
      const tm = titleMatches[i].match(/Ver\s(.+?)\s-/);
      if (tm) title = tm[1];
    }

    items.push({
      id: `${slug}/${ep}`,
      ref: `${slug}/${ep}`,
      title: `${title} - Ep. ${ep}`,
      poster: thumb,
      type: "episode",
    });
  }
  return items;
}

function parseRecentAnimes(html) {
  const items = [];
  // Animes: sección "Recientemente Agregados"
  const covers = html.match(/cdn\.animeav1\.com\/covers\/(\d+)\.jpg/g) || [];
  const links = html.match(/href="\/media\/([^"\/]+)"(?!\/)(?:[^>]*)>[\s\S]*?Ver ahora/g) || [];

  const count = Math.min(links.length, 20);
  for (let i = 0; i < count; i++) {
    const linkMatch = links[i].match(/href="\/media\/([^"\/]+)"/);
    if (!linkMatch) continue;
    const slug = linkMatch[1];
    const poster = covers[i]
      ? `https://${covers[i]}`
      : null;
    const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    items.push({
      id: slug,
      ref: slug,
      title,
      poster,
      type: "series",
    });
  }
  return items;
}

function parseCatalog(html) {
  const items = [];
  let m;

  // Buscar slugs únicos
  const slugs = [];
  const slugRegex = /href="\/media\/([a-z0-9\-]+)"(?!\/)/g;
  while ((m = slugRegex.exec(html)) !== null) {
    if (!slugs.includes(m[1])) slugs.push(m[1]);
  }

  slugs.slice(0, 40).forEach(slug => {
    const title = slug.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    // Buscar poster específico del slug en el HTML
    const coverMatch = html.match(new RegExp(`covers/(\\d+)\\.jpg[^"]*"[\\s\\S]{0,500}?${slug}`)) ||
                       html.match(new RegExp(`${slug}[\\s\\S]{0,500}?covers/(\\d+)\\.jpg`));
    const poster = coverMatch
      ? `${CDN_URL}/covers/${coverMatch[1]}.jpg`
      : null;

    items.push({
      id: slug,
      ref: slug,
      title,
      poster,
      type: "series",
    });
  });

  return items;
}

function parseDetail(html, slug) {
  // Título
  const titleMatch = html.match(/<h1[^>]*>([^<]+)<\/h1>/);
  const title = titleMatch ? titleMatch[1].trim() : slug.replace(/-/g, " ");

  // Descripción
  const descMatch = html.match(/<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)<\/p>/) ||
                    html.match(/description[^>]*>([\s\S]{20,800}?)<\/[p\s]/);
  const description = descMatch
    ? descMatch[1].replace(/<[^>]+>/g, "").trim()
    : "";

  // Poster / Backdrop
  const backdropMatch = html.match(/cdn\.animeav1\.com\/backdrops\/(\d+)\.jpg/);
  const coverMatch = html.match(/cdn\.animeav1\.com\/covers\/(\d+)\.jpg/);
  const poster = coverMatch ? `${CDN_URL}/covers/${coverMatch[1]}.jpg` : null;
  const backdrop = backdropMatch ? `${CDN_URL}/backdrops/${backdropMatch[1]}.jpg` : null;

  // Géneros
  const genreMatches = html.match(/catalogo\?genre=([^"]+)"/g) || [];
  const genres = genreMatches.map(g => {
    const m = g.match(/genre=([^"]+)/);
    return m ? m[1].replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()) : "";
  }).filter(Boolean);

  // Episodios: buscar números de episodio disponibles
  const epLinks = html.match(/href="\/media\/[^"\/]+\/(\d+)"/g) || [];
  const episodes = [];
  const seen = new Set();
  epLinks.forEach(link => {
    const m = link.match(/\/media\/([^"\/]+)\/(\d+)/);
    if (m && !seen.has(m[2])) {
      seen.add(m[2]);
      episodes.push({
        id: `${slug}/${m[2]}`,
        ref: `${slug}/${m[2]}`,
        title: `Episodio ${m[2]}`,
        number: parseInt(m[2]),
      });
    }
  });

  episodes.sort((a, b) => a.number - b.number);

  return {
    id: slug,
    title,
    description,
    poster,
    backdrop,
    genres,
    type: "series",
    seasons: [
      {
        id: "1",
        title: "Episodios",
        episodes,
      },
    ],
  };
}

function parseStreams(html) {
  const streams = [];

  // Buscar iframes de reproductores
  const iframes = html.match(/<iframe[^>]+src="([^"]+)"/g) || [];
  iframes.forEach((iframe, i) => {
    const srcMatch = iframe.match(/src="([^"]+)"/);
    if (!srcMatch) return;
    const src = srcMatch[1];
    if (src.includes("youtube") || src.includes("youtu.be")) return; // skip trailers

    streams.push({
      id: `stream_${i}`,
      title: `Servidor ${i + 1}`,
      url: src,
      type: "iframe",
    });
  });

  // Buscar URLs directas de video (.m3u8, .mp4)
  const videoUrls = html.match(/https?:\/\/[^"'\s]+\.(?:m3u8|mp4)[^"'\s]*/g) || [];
  videoUrls.forEach((url, i) => {
    streams.push({
      id: `direct_${i}`,
      title: url.includes("m3u8") ? `HLS ${i + 1}` : `MP4 ${i + 1}`,
      url,
      type: url.includes("m3u8") ? "hls" : "mp4",
    });
  });

  return streams;
}
