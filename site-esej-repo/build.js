#!/usr/bin/env node
/* Génération du site statique à partir du contenu (/content) et des gabarits (/templates).
   Sortie : /dist (publiée par Netlify). Aucune dépendance hormis "marked" (Markdown -> HTML). */
'use strict';
const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

const ROOT = __dirname;
const DIST = path.join(ROOT, 'dist');
const T = (name) => fs.readFileSync(path.join(ROOT, 'templates', name), 'utf8');
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

marked.setOptions({ gfm: true, breaks: false });

// ------------------------------------------------------------------ utilitaires
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Markdown -> HTML ; les liens externes et documents (PDF…) s'ouvrent dans un nouvel onglet
const md = (s) => (s ? marked.parse(String(s)).replace(/<a href="((?:https?:\/\/|[^"]*\.(?:pdf|docx?|xlsx?|pptx?))[^"]*)"(?![^>]*target=)/gi, '<a href="$1" target="_blank" rel="noopener"') : '');
const fill = (tpl, data) => tpl
  .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, k) => (data[k] == null ? '' : String(data[k])))
  .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => esc(data[k]));
const slugify = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const pad2 = (n) => String(n).padStart(2, '0');

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

// ------------------------------------------------------------------ contenu
const site = readJSON(path.join(ROOT, 'content', 'site.json'));
const accueil = readJSON(path.join(ROOT, 'content', 'accueil.json'));
const pagesDir = path.join(ROOT, 'content', 'pages');
const pages = fs.readdirSync(pagesDir).filter((f) => f.endsWith('.json')).map((f) => {
  const p = readJSON(path.join(pagesDir, f));
  p.slug = slugify(path.basename(f, '.json')); // l'URL découle du nom de fichier créé par le CMS
  return p;
});

const menuPages = [
  { slug: 'index', titre_menu: accueil.titre_menu || 'Accueil', ordre: -1, afficher_menu: true, pied_de_page: true, ordre_pied: 0 },
  ...pages,
];

function menu(items, current, ulClassItem) {
  return items.map((p) => {
    const cur = p.slug === current;
    const cls = ['menu-item', 'menu-item-type-post_type', 'menu-item-object-page', cur ? 'current-menu-item current_page_item' : ''].join(' ').trim();
    return `<li class="${cls}"><a${cur ? ' aria-current="page"' : ''} href="${p.slug}.html">${esc(p.titre_menu)}</a></li>`;
  }).join('\n');
}
const menuPrincipal = (current) => menu(menuPages.filter((p) => p.afficher_menu !== false).sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)), current);
const menuPied = (current) => menu(menuPages.filter((p) => p.pied_de_page).sort((a, b) => (a.ordre_pied ?? 99) - (b.ordre_pied ?? 99)), current);

// ------------------------------------------------------------------ blocs
const B = {};
for (const f of fs.readdirSync(path.join(ROOT, 'templates', 'blocks'))) B[path.basename(f, '.html')] = T(path.join('blocks', f));

function renderBlock(b) {
  switch (b.type) {
    case 'intro':
      return fill(B.intro, { ...b, texte: md(b.texte) });
    case 'texte_image': {
      const name = (b.image_a_gauche ? 'image_texte' : 'texte_image') + (b.fond === 'dore' ? '_fonce' : '');
      return fill(B[name], { ...b, texte: md(b.texte) });
    }
    case 'texte':
      return fill(B.texte, { ...b, texte: md(b.texte) });
    case 'deux_colonnes':
      return fill(B.deux_colonnes, { ...b, texte1: md(b.texte1), texte2: md(b.texte2) });
    case 'texte_long':
      return fill(B.texte_long, { texte: md(b.texte) });
    case 'liste_promos': {
      const n = (b.elements || []).length;
      const lignes = (b.elements || []).map((el, i) => fill(i % 2 === 0 ? B.liste_promos__ligne_droite : B.liste_promos__ligne_gauche,
        { ...el, numero: el.numero || pad2(i + 1), texte: md(el.texte), marge: (i > 0 && i < n - 1) ? '50px' : '0px' })).join('\n');
      return fill(B.liste_promos, { lignes });
    }
    default:
      console.warn('Type de bloc inconnu :', b.type);
      return '';
  }
}

const ctaHtml = () => fill(B.cta, { titre: site.appel_don_titre, texte: site.appel_don_texte, bouton: site.appel_don_bouton, lien: site.appel_don_lien });
const titrePage = (p) => fill(B.titre_page, { titre: p.titre, titre_accent: p.titre_accent });

function renderPage(p) {
  switch (p.gabarit) {
    case 'contact': {
      const lat = +site.carte_lat || 49.2707, lng = +site.carte_lng || 4.0071, z = +site.carte_zoom || 17;
      const d = 0.0025 * Math.pow(2, 17 - z); // emprise ~ selon le zoom
      const carte_url = `https://www.openstreetmap.org/export/embed.html?bbox=${(lng - d * 2.2).toFixed(6)},${(lat - d).toFixed(6)},${(lng + d * 2.2).toFixed(6)},${(lat + d).toFixed(6)}&layer=mapnik&marker=${lat},${lng}`;
      return fill(B.page_contact, { ...site, ...p, carte_url, contact_texte: md(p.contact_texte) });
    }
    case 'don':
      return fill(B.page_don, { ...site, ...p, contact_texte: md(p.contact_texte) });
    default: {
      let html = titrePage(p);
      for (const b of p.blocs || []) html += '\n' + renderBlock(b);
      if (p.afficher_appel_don !== false) html += '\n' + ctaHtml();
      return html;
    }
  }
}

function renderAccueil() {
  const d = { ...accueil };
  for (const k of ['hero_texte', 'zoom_texte', 'atout1_texte', 'atout2_texte', 'atout3_texte', 'photos_texte', 'mission_texte']) d[k] = md(accueil[k]);
  Object.assign(d, { cta_titre: site.appel_don_titre, cta_texte: site.appel_don_texte, cta_bouton: site.appel_don_bouton, cta_lien: site.appel_don_lien });
  return fill(B.page_accueil, d);
}

// ------------------------------------------------------------------ enveloppe + écriture
const shell = T('shell.html');
function writePage(slug, titre, description, contenu) {
  const html = fill(shell, {
    site_nom: site.nom, site_logo: site.logo, facebook: site.facebook, instagram: site.instagram, pied_de_page: site.pied_de_page,
    page_titre: titre, page_description: description || '', page_url: slug + '.html', page_slug: slug,
    menu_principal: menuPrincipal(slug), menu_pied: menuPied(slug), contenu,
  });
  fs.writeFileSync(path.join(DIST, slug + '.html'), html);
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
for (const d of ['wp-content', 'wp-includes', 'assets', 'admin']) copyDir(path.join(ROOT, d), path.join(DIST, d));

writePage('index', accueil.titre || 'Accueil', accueil.description, renderAccueil());
for (const p of pages) writePage(p.slug, p.titre_menu || p.titre, p.description, renderPage(p));

// données du tableau de bord d'administration (vignettes des pages)
const abs = (u) => (u ? (/^(https?:)?\/\//.test(u) || u.startsWith('/') ? u : '/' + u) : '');
function imagePage(p) {
  for (const b of p.blocs || []) {
    if (b.image) return b.image;
    if (b.image_fond) return b.image_fond;
    for (const el of b.elements || []) if (el.image) return el.image;
  }
  return '';
}
const gabaritLabel = { standard: 'Page standard', contact: 'Page contact', don: 'Page de don' };
fs.writeFileSync(path.join(DIST, 'admin', 'pages.json'), JSON.stringify({
  genere_le: new Date().toISOString(),
  accueil: { titre: accueil.titre_menu || 'Accueil', sous_titre: 'Page d’accueil', image: abs(accueil.hero_image || site.logo), url: 'index.html' },
  pages: pages.sort((a, b) => (a.ordre ?? 99) - (b.ordre ?? 99)).map((p) => ({
    slug: p.slug, titre: p.titre_menu || p.titre, sous_titre: gabaritLabel[p.gabarit] || 'Page standard',
    image: abs(imagePage(p) || site.logo), url: p.slug + '.html', dans_menu: p.afficher_menu !== false, blocs: (p.blocs || []).length,
  })),
}, null, 2));

// page 404 sobre
fs.writeFileSync(path.join(DIST, '404.html'), fill(shell, {
  site_nom: site.nom, site_logo: site.logo, facebook: site.facebook, instagram: site.instagram, pied_de_page: site.pied_de_page,
  page_titre: 'Page introuvable', page_description: '', page_url: '404.html', page_slug: '404', menu_principal: menuPrincipal(''), menu_pied: menuPied(''),
  contenu: titrePage({ titre: 'Page', titre_accent: 'introuvable' }) + fill(B.texte, { titre: 'Cette page', titre_accent: "n'existe pas", texte: '<p>Le lien que vous avez suivi est peut-être obsolète. <a href="index.html">Retour à l’accueil</a>.</p>' }),
}));

console.log(`✔ ${pages.length + 1} pages générées dans dist/ : index, ${pages.map((p) => p.slug).join(', ')}`);
