/* Aperçu en direct de l'éditeur : la page est rendue avec les vrais gabarits et le vrai style du site,
   au fil de la saisie, et les textes y sont modifiables directement (clic sur un texte → saisie →
   report automatique dans le formulaire de gauche). Même logique de rendu que build.js. */
(function () {
  'use strict';
  if (!window.CMS) return;

  // ------------------------------------------------------------------ utilitaires (identiques à build.js)
  var esc = function (s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); };
  var md = function (s) {
    if (!s) return '';
    var html = window.marked ? marked.parse(String(s)) : '<p>' + esc(s) + '</p>';
    return html.replace(/<a href="((?:https?:\/\/|[^"]*\.(?:pdf|docx?|xlsx?|pptx?))[^"]*)"(?![^>]*target=)/gi, '<a href="$1" target="_blank" rel="noopener"');
  };
  var fill = function (tpl, data) {
    return tpl
      .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, function (_, k) { return data[k] == null ? '' : String(data[k]); })
      .replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, k) { return esc(data[k]); });
  };
  var pad2 = function (n) { return String(n).length < 2 ? '0' + n : String(n); };

  // Gabarits et réglages du site, générés par build.js (admin/gabarits.json)
  var G = { blocs: null, site: null };
  fetch('gabarits.json?' + Date.now()).then(function (r) { return r.json(); }).then(function (j) { G.blocs = j.blocs; G.site = j.site; });

  // Chemin d'image : image fraîchement téléversée (pas encore publiée) ou chemin du site
  function img(getAsset, p) {
    if (!p) return '';
    try { var a = getAsset(p); var s = a && a.toString(); if (s && s !== p) return s; } catch (e) { /* ignore */ }
    if (/^(https?:)?\/\//.test(p) || p.charAt(0) === '/') return p;
    return '/' + p;
  }

  // ------------------------------------------------------------------ marqueurs de champs modifiables
  // Les valeurs sont entourées de caractères de contrôle qui traversent l'échappement des gabarits,
  // puis remplacés après coup par des éléments contenteditable portant le chemin du champ.
  var S0 = '', S1 = '', S2 = '';
  var T = function (path, v, ph) { return S0 + 'S|' + path + '|' + (ph || '') + S1 + (v == null ? '' : v) + S2; };        // texte court
  var M = function (path, v) { return S0 + 'M|' + path + '|' + S1 + md(v) + S2; };                                        // texte riche (markdown)
  function marquer(html) {
    return html
      .replace(/S\|([\w.]+)\|([^]*)([\s\S]*?)/g, function (_, p, ph, v) {
        return '<span class="esej-edit" data-champ="' + p + '" data-type="s" data-ph="' + esc(ph) + '" contenteditable="true" spellcheck="false">' + v + '</span>';
      })
      .replace(/M\|([\w.]+)\|([\s\S]*?)/g, function (_, p, v) {
        return '<div class="esej-edit esej-edit-md" data-champ="' + p + '" data-type="m" contenteditable="true">' + (v || '<p><br></p>') + '</div>';
      });
  }

  // ------------------------------------------------------------------ rendu (même logique que build.js)
  function renderBlock(b, i, getAsset) {
    var B = G.blocs, P = 'blocs.' + i + '.';
    switch (b.type) {
      case 'intro': return fill(B.intro, Object.assign({}, b, { titre: T(P + 'titre', b.titre), titre_accent: T(P + 'titre_accent', b.titre_accent, 'partie dorée'), texte: M(P + 'texte', b.texte), image_fond: img(getAsset, b.image_fond) }));
      case 'texte_image': {
        var name = (b.image_a_gauche ? 'image_texte' : 'texte_image') + (b.fond === 'dore' ? '_fonce' : '');
        return fill(B[name], Object.assign({}, b, { titre: T(P + 'titre', b.titre), titre_accent: T(P + 'titre_accent', b.titre_accent, 'partie dorée'), texte: M(P + 'texte', b.texte), image: img(getAsset, b.image) }));
      }
      case 'texte': return fill(B.texte, Object.assign({}, b, { titre: T(P + 'titre', b.titre), titre_accent: T(P + 'titre_accent', b.titre_accent, 'partie dorée'), texte: M(P + 'texte', b.texte) }));
      case 'deux_colonnes': return fill(B.deux_colonnes, Object.assign({}, b, {
        titre1: T(P + 'titre1', b.titre1), titre_accent1: T(P + 'titre_accent1', b.titre_accent1, 'partie dorée'), texte1: M(P + 'texte1', b.texte1),
        titre2: T(P + 'titre2', b.titre2), titre_accent2: T(P + 'titre_accent2', b.titre_accent2, 'partie dorée'), texte2: M(P + 'texte2', b.texte2) }));
      case 'texte_long': return fill(B.texte_long, { texte: M(P + 'texte', b.texte) });
      case 'liste_promos': {
        var els = b.elements || [], n = els.length;
        var lignes = els.map(function (el, j) {
          var Q = P + 'elements.' + j + '.';
          return fill(j % 2 === 0 ? B.liste_promos__ligne_droite : B.liste_promos__ligne_gauche,
            Object.assign({}, el, { numero: T(Q + 'numero', el.numero || pad2(j + 1)), titre: T(Q + 'titre', el.titre), texte: M(Q + 'texte', el.texte), image: img(getAsset, el.image), marge: (j > 0 && j < n - 1) ? '50px' : '0px' }));
        }).join('\n');
        return fill(B.liste_promos, { lignes: lignes });
      }
      default: return '';
    }
  }

  var cta = function () { var s = G.site; return fill(G.blocs.cta, { titre: s.appel_don_titre, texte: s.appel_don_texte, bouton: s.appel_don_bouton, lien: s.appel_don_lien }); };

  function renderPage(p, getAsset) {
    var r = p.reglages || {}, c = p.contact || {}, s = G.site;
    var gabarit = r.gabarit || p.gabarit || 'standard';
    var titres = { titre: T('titre', p.titre), titre_accent: T('titre_accent', p.titre_accent, 'partie dorée') };
    if (gabarit === 'contact') {
      var lat = +s.carte_lat || 49.2707, lng = +s.carte_lng || 4.0071, z = +s.carte_zoom || 17, d = 0.0025 * Math.pow(2, 17 - z);
      var carte_url = 'https://www.openstreetmap.org/export/embed.html?bbox=' + (lng - d * 2.2).toFixed(6) + ',' + (lat - d).toFixed(6) + ',' + (lng + d * 2.2).toFixed(6) + ',' + (lat + d).toFixed(6) + '&layer=mapnik&marker=' + lat + ',' + lng;
      return fill(G.blocs.page_contact, Object.assign({}, s, p, titres, { carte_url: carte_url, contact_titre: T('contact.titre', c.titre, 'titre du formulaire'), contact_texte: M('contact.texte', c.texte) }));
    }
    if (gabarit === 'don') return fill(G.blocs.page_don, Object.assign({}, s, p, titres, { contact_titre: T('contact.titre', c.titre, 'titre du formulaire'), contact_texte: M('contact.texte', c.texte) }));
    var html = fill(G.blocs.titre_page, titres);
    (p.blocs || []).forEach(function (b, i) { html += '\n' + renderBlock(b, i, getAsset); });
    if (r.afficher_appel_don !== false && p.afficher_appel_don !== false) html += '\n' + cta();
    return html;
  }

  function renderAccueil(a, getAsset) {
    var d = Object.assign({}, a), s = G.site;
    ['hero_texte', 'zoom_texte', 'atout1_texte', 'atout2_texte', 'atout3_texte', 'photos_texte', 'mission_texte'].forEach(function (k) { d[k] = M(k, a[k]); });
    ['hero_titre', 'hero_titre_accent', 'hero_bouton', 'zoom_titre', 'atout1_titre', 'atout2_titre', 'atout3_titre', 'photos_titre'].forEach(function (k) { d[k] = T(k, a[k], /accent/.test(k) ? 'partie dorée' : ''); });
    ['hero_image', 'photo1', 'photo2', 'photo3', 'photo4'].forEach(function (k) { d[k] = img(getAsset, a[k]); });
    Object.assign(d, { cta_titre: s.appel_don_titre, cta_texte: s.appel_don_texte, cta_bouton: s.appel_don_bouton, cta_lien: s.appel_don_lien });
    return fill(G.blocs.page_accueil, d);
  }

  // Enveloppe reproduisant la structure de la page (les styles Divi s'appuient sur ces classes)
  var BODY_CLASSES = 'wp-singular page-template-default page custom-background wp-theme-Divi et_pb_button_helper_class et_fixed_nav et_show_nav et_secondary_nav_enabled et_header_style_left et_pb_footer_columns3 et_cover_background et_pb_gutter windows et_pb_gutters3 et_pb_pagebuilder_layout et_no_sidebar et_divi_theme et-db';
  function enveloppe(contenu) {
    return '<div id="page-container" style="padding-top:0!important"><div id="et-main-area"><div id="main-content"><article class="page type-page status-publish hentry"><div class="entry-content"><div class="et-l et-l--post"><div class="et_builder_inner_content et_pb_gutters3">' + contenu + '</div></div></div></article></div></div></div>' +
      '<div class="esej-astuce">✎ Cliquez sur un texte pour le modifier directement</div>';
  }

  // ------------------------------------------------------------------ écriture dans l'éditeur (état Decap)
  var Store = { ref: null };
  function trouverStore() {
    if (Store.ref) return Store.ref;
    try {
      var root = document.getElementById('nc-root');
      var key = Object.keys(root).find(function (k) { return k.indexOf('__reactContainer') === 0 || k.indexOf('_reactRootContainer') === 0; });
      var fiber = root[key]; if (fiber && fiber._internalRoot) fiber = fiber._internalRoot.current;
      var pile = [fiber], n = 0;
      while (pile.length && n < 5000) {
        var f = pile.pop(); n++; if (!f) continue;
        var p = f.memoizedProps;
        if (p && p.store && typeof p.store.getState === 'function' && typeof p.store.dispatch === 'function') { Store.ref = p.store; return Store.ref; }
        if (f.child) pile.push(f.child); if (f.sibling) pile.push(f.sibling);
      }
    } catch (e) { /* structure inattendue : l'édition directe est simplement désactivée */ }
    return null;
  }
  function champsDuFormulaire(st) {
    var draft = st.entryDraft, entry = draft.get('entry');
    var coll = st.collections.get(entry.get('collection'));
    if (!coll) return null;
    if (coll.get('files')) { var f = coll.get('files').find(function (x) { return x.get('name') === entry.get('slug'); }); return f && f.get('fields'); }
    return coll.get('fields');
  }
  function ecrire(chemin, valeur) {
    var store = trouverStore(); if (!store) return false;
    var st = store.getState(), draft = st.entryDraft;
    var fields = champsDuFormulaire(st); if (!fields) return false;
    var segs = chemin.split('.').map(function (s) { return /^\d+$/.test(s) ? +s : s; });
    var field = fields.find(function (f) { return f.get('name') === segs[0]; }); if (!field) return false;
    var data = draft.getIn(['entry', 'data']);
    var actuel = data.getIn(segs);
    if (actuel === valeur || (actuel == null && valeur === '')) return true;
    var nouvelleValeur = segs.length === 1 ? valeur : data.setIn(segs, valeur).get(segs[0]);
    store.dispatch({ type: 'DRAFT_CHANGE_FIELD', payload: { field: field, value: nouvelleValeur, metadata: undefined, entries: [], i18n: undefined } });
    return true;
  }

  // Exposé à cms.html : y a-t-il des modifications non publiées ?
  window.esejEditeur = { modifie: function () { var st = trouverStore(); return !!(st && st.getState().entryDraft && st.getState().entryDraft.get('hasChanged')); } };

  // HTML (saisie dans l'aperçu) -> markdown (valeur du champ)
  var td = null;
  function versMarkdown(html) {
    if (!window.TurndownService) return null;
    if (!td) {
      td = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced', emDelimiter: '*' });
      // paragraphes vides (espacement voulu) conservés tels quels, comme dans le contenu d'origine
      td.addRule('paragrapheVide', { filter: function (n) { return n.nodeName === 'P' && !n.textContent.replace(/ /g, '').trim() && !n.querySelector('img'); }, replacement: function () { return '\n\n<p>&nbsp;</p>\n\n'; } });
      td.addRule('sautDeLigne', { filter: 'br', replacement: function () { return '  \n'; } });
      // titres vides (présents dans certains textes d'origine) conservés pour ne pas modifier l'espacement
      td.addRule('titreVide', { filter: function (n) { return /^H[1-6]$/.test(n.nodeName) && !n.textContent.trim(); }, replacement: function (_, n) { return '\n\n' + '#'.repeat(+n.nodeName.charAt(1)) + ' \n\n'; } });
    }
    return td.turndown(html).replace(/\n{3,}/g, '\n\n').trim();
  }

  // ------------------------------------------------------------------ édition directe dans l'aperçu
  var EDIT = { actif: false, timer: null, onFin: null };
  function valeurDe(el) {
    if (el.getAttribute('data-type') === 'm') { var m = versMarkdown(el.innerHTML); return m == null ? undefined : m; }
    return el.textContent.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  }
  function reporter(el) {
    var v = valeurDe(el); if (v === undefined) return;
    ecrire(el.getAttribute('data-champ'), v);
  }
  function brancher(doc) {
    if (!doc || doc.__esejBranche) return;
    doc.__esejBranche = true;
    // liens, boutons et formulaires inertes dans l'aperçu (sauf à l'intérieur d'un texte en cours d'édition)
    doc.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a,button'); if (a && !e.target.closest('.esej-edit')) e.preventDefault(); if (a && e.target.closest('.esej-edit')) e.preventDefault(); }, true);
    doc.addEventListener('submit', function (e) { e.preventDefault(); }, true);
    doc.addEventListener('focusin', function (e) { var el = e.target.closest && e.target.closest('.esej-edit'); if (el) { EDIT.actif = true; } });
    doc.addEventListener('input', function (e) {
      var el = e.target.closest && e.target.closest('.esej-edit'); if (!el) return;
      EDIT.actif = true; // une saisie en cours : l'aperçu ne doit pas être reconstruit sous le curseur
      clearTimeout(EDIT.timer); EDIT.timer = setTimeout(function () { reporter(el); }, 400);
    });
    doc.addEventListener('keydown', function (e) {
      var el = e.target.closest && e.target.closest('.esej-edit'); if (!el) return;
      if (e.key === 'Enter' && el.getAttribute('data-type') === 's') { e.preventDefault(); el.blur(); }
      if (e.key === 'Escape') { el.blur(); }
    });
    doc.addEventListener('focusout', function (e) {
      var el = e.target.closest && e.target.closest('.esej-edit'); if (!el) return;
      clearTimeout(EDIT.timer); reporter(el);
      EDIT.actif = false;
      if (EDIT.onFin) setTimeout(EDIT.onFin, 0);
    });
    // collage en texte brut pour les textes courts
    doc.addEventListener('paste', function (e) {
      var el = e.target.closest && e.target.closest('.esej-edit'); if (!el || el.getAttribute('data-type') !== 's') return;
      e.preventDefault(); var t = (e.clipboardData || window.clipboardData).getData('text/plain').replace(/\s+/g, ' ');
      doc.execCommand('insertText', false, t);
    });
  }

  var Apercu = function (render) {
    return createClass({
      componentDidMount: function () { this.ajuster(); },
      componentDidUpdate: function () { this.ajuster(); },
      componentWillUnmount: function () { if (EDIT.onFin === this._fin) EDIT.onFin = null; },
      ajuster: function () {
        var doc = this.props.document; if (!doc || !doc.body) return;
        if (doc.body.className !== BODY_CLASSES) doc.body.className = BODY_CLASSES;
        brancher(doc);
        var self = this; this._fin = this._fin || function () { self.forceUpdate(); }; EDIT.onFin = this._fin;
      },
      render: function () {
        if (!G.blocs || !this.props.entry || !this.props.entry.getIn) return h('div', { style: { padding: '40px', fontFamily: 'Montserrat, sans-serif', color: '#021d51' } }, 'Chargement de l’aperçu…');
        // pendant une saisie dans l'aperçu, on ne touche pas au DOM (le curseur resterait sinon perdu)
        if (EDIT.actif && this._html) return h('div', { dangerouslySetInnerHTML: { __html: this._html } });
        var data = this.props.entry.getIn(['data']); data = data && data.toJS ? data.toJS() : (data || {});
        var html;
        try { html = enveloppe(marquer(render(data, this.props.getAsset))); }
        catch (e) { html = '<p style="padding:20px;color:#c0392b">Aperçu indisponible : ' + esc(e.message) + '</p>'; }
        this._html = html;
        return h('div', { dangerouslySetInnerHTML: { __html: html } });
      },
    });
  };

  var Sans = createClass({ render: function () {
    return h('div', { style: { padding: '40px', fontFamily: 'Montserrat, Arial, sans-serif', color: '#021d51', lineHeight: 1.6 } },
      h('h2', { style: { marginTop: 0 } }, 'Réglages du site'),
      h('p', null, 'Ces réglages (coordonnées, réseaux sociaux, pied de page, don, formulaire) s’appliquent à toutes les pages ; il n’y a pas d’aperçu pour cet écran. Après « Publier », le site est mis à jour en 1 à 2 minutes.'));
  } });

  // Styles du site dans l'aperçu (mêmes feuilles que les pages publiées) + habillage de l'édition directe
  CMS.registerPreviewStyle('https://fonts.googleapis.com/css?family=Montserrat:100,200,300,regular,500,600,700,800,900,100italic,200italic,300italic,italic,500italic,600italic,700italic,800italic,900italic|Mr+Dafoe:regular&subset=latin,latin-ext&display=swap');
  CMS.registerPreviewStyle('/assets/theme.css');
  CMS.registerPreviewStyle('/assets/blocks.css');
  CMS.registerPreviewStyle(
    'body{background:#fff;margin:0}#page-container{padding-top:0!important}' +
    '.et_pb_section,.et_pb_row,.et_pb_column,.et_pb_module,.et-waypoint,.et_animated{opacity:1!important;animation:none!important}' +
    'iframe{pointer-events:none}' +
    '.esej-edit{cursor:text;border-radius:3px;transition:box-shadow .15s,background .15s;outline:none}' +
    '.esej-edit:hover{box-shadow:0 0 0 1px rgba(2,29,81,.35);background:rgba(229,174,71,.10)}' +
    '.esej-edit:focus{box-shadow:0 0 0 2px #e5ae47;background:rgba(229,174,71,.12)}' +
    '.esej-edit-md{display:block}.esej-edit-md:hover,.esej-edit-md:focus{box-shadow:0 0 0 1px rgba(2,29,81,.35);padding:2px 6px;margin:-2px -6px}' +
    '.esej-edit:empty::before{content:attr(data-ph);opacity:.35;font-style:italic;font-weight:400}' +
    '.esej-astuce{position:fixed;right:14px;bottom:14px;z-index:99999;background:#021d51;color:#fff;font:600 12px/1 Montserrat,Arial,sans-serif;padding:9px 13px;border-radius:999px;opacity:.85;pointer-events:none}',
    { raw: true });

  CMS.registerPreviewTemplate('pages', Apercu(renderPage));
  CMS.registerPreviewTemplate('accueil', Apercu(renderAccueil));
  CMS.registerPreviewTemplate('site', Sans);
})();
