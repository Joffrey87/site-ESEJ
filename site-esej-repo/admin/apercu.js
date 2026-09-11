/* Aperçu en direct de l'éditeur : la page est rendue avec les vrais gabarits et le vrai style du site,
   au fil de la saisie. Même logique que build.js (côté serveur), portée ici en JavaScript navigateur. */
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

  function renderBlock(b, getAsset) {
    var B = G.blocs;
    switch (b.type) {
      case 'intro': return fill(B.intro, Object.assign({}, b, { texte: md(b.texte), image_fond: img(getAsset, b.image_fond) }));
      case 'texte_image': {
        var name = (b.image_a_gauche ? 'image_texte' : 'texte_image') + (b.fond === 'dore' ? '_fonce' : '');
        return fill(B[name], Object.assign({}, b, { texte: md(b.texte), image: img(getAsset, b.image) }));
      }
      case 'texte': return fill(B.texte, Object.assign({}, b, { texte: md(b.texte) }));
      case 'deux_colonnes': return fill(B.deux_colonnes, Object.assign({}, b, { texte1: md(b.texte1), texte2: md(b.texte2) }));
      case 'texte_long': return fill(B.texte_long, { texte: md(b.texte) });
      case 'liste_promos': {
        var els = b.elements || [], n = els.length;
        var lignes = els.map(function (el, i) {
          return fill(i % 2 === 0 ? B.liste_promos__ligne_droite : B.liste_promos__ligne_gauche,
            Object.assign({}, el, { numero: el.numero || pad2(i + 1), texte: md(el.texte), image: img(getAsset, el.image), marge: (i > 0 && i < n - 1) ? '50px' : '0px' }));
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
    if (gabarit === 'contact') {
      var lat = +s.carte_lat || 49.2707, lng = +s.carte_lng || 4.0071, z = +s.carte_zoom || 17, d = 0.0025 * Math.pow(2, 17 - z);
      var carte_url = 'https://www.openstreetmap.org/export/embed.html?bbox=' + (lng - d * 2.2).toFixed(6) + ',' + (lat - d).toFixed(6) + ',' + (lng + d * 2.2).toFixed(6) + ',' + (lat + d).toFixed(6) + '&layer=mapnik&marker=' + lat + ',' + lng;
      return fill(G.blocs.page_contact, Object.assign({}, s, p, { carte_url: carte_url, contact_titre: c.titre, contact_texte: md(c.texte) }));
    }
    if (gabarit === 'don') return fill(G.blocs.page_don, Object.assign({}, s, p, { contact_titre: c.titre, contact_texte: md(c.texte) }));
    var html = fill(G.blocs.titre_page, { titre: p.titre, titre_accent: p.titre_accent });
    (p.blocs || []).forEach(function (b) { html += '\n' + renderBlock(b, getAsset); });
    if (r.afficher_appel_don !== false && p.afficher_appel_don !== false) html += '\n' + cta();
    return html;
  }

  function renderAccueil(a, getAsset) {
    var d = Object.assign({}, a), s = G.site;
    ['hero_texte', 'zoom_texte', 'atout1_texte', 'atout2_texte', 'atout3_texte', 'photos_texte', 'mission_texte'].forEach(function (k) { d[k] = md(a[k]); });
    ['hero_image', 'photo1', 'photo2', 'photo3', 'photo4'].forEach(function (k) { d[k] = img(getAsset, a[k]); });
    Object.assign(d, { cta_titre: s.appel_don_titre, cta_texte: s.appel_don_texte, cta_bouton: s.appel_don_bouton, cta_lien: s.appel_don_lien });
    return fill(G.blocs.page_accueil, d);
  }

  // Enveloppe reproduisant la structure de la page (les styles Divi s'appuient sur ces classes)
  var BODY_CLASSES = 'wp-singular page-template-default page custom-background wp-theme-Divi et_pb_button_helper_class et_fixed_nav et_show_nav et_secondary_nav_enabled et_header_style_left et_pb_footer_columns3 et_cover_background et_pb_gutter windows et_pb_gutters3 et_pb_pagebuilder_layout et_no_sidebar et_divi_theme et-db';
  function enveloppe(contenu) {
    return '<div id="page-container" style="padding-top:0!important"><div id="et-main-area"><div id="main-content"><article class="page type-page status-publish hentry"><div class="entry-content"><div class="et-l et-l--post"><div class="et_builder_inner_content et_pb_gutters3">' + contenu + '</div></div></div></article></div></div></div>';
  }

  var Apercu = function (render) {
    return createClass({
      componentDidMount: function () { this.ajusterCorps(); },
      componentDidUpdate: function () { this.ajusterCorps(); },
      ajusterCorps: function () {
        var doc = this.props.document; if (!doc || !doc.body) return;
        if (doc.body.className !== BODY_CLASSES) doc.body.className = BODY_CLASSES;
        // liens et formulaires inertes dans l'aperçu
        if (!doc.__esejInerte) { doc.__esejInerte = true; doc.addEventListener('click', function (e) { var a = e.target.closest && e.target.closest('a,button'); if (a) e.preventDefault(); }, true); doc.addEventListener('submit', function (e) { e.preventDefault(); }, true); }
      },
      render: function () {
        if (!G.blocs) return h('div', { style: { padding: '40px', fontFamily: 'Montserrat, sans-serif', color: '#021d51' } }, 'Chargement de l’aperçu…');
        var data = this.props.entry.getIn(['data']); data = data && data.toJS ? data.toJS() : (data || {});
        var html;
        try { html = enveloppe(render(data, this.props.getAsset)); }
        catch (e) { html = '<p style="padding:20px;color:#c0392b">Aperçu indisponible : ' + esc(e.message) + '</p>'; }
        return h('div', { dangerouslySetInnerHTML: { __html: html } });
      },
    });
  };

  var Sans = createClass({ render: function () {
    return h('div', { style: { padding: '40px', fontFamily: 'Montserrat, Arial, sans-serif', color: '#021d51', lineHeight: 1.6 } },
      h('h2', { style: { marginTop: 0 } }, 'Réglages du site'),
      h('p', null, 'Ces réglages (coordonnées, réseaux sociaux, pied de page, don, formulaire) s’appliquent à toutes les pages ; il n’y a pas d’aperçu pour cet écran. Après « Publier », le site est mis à jour en 1 à 2 minutes.'));
  } });

  // Styles du site dans l'aperçu (mêmes feuilles que les pages publiées)
  CMS.registerPreviewStyle('https://fonts.googleapis.com/css?family=Montserrat:100,200,300,regular,500,600,700,800,900,100italic,200italic,300italic,italic,500italic,600italic,700italic,800italic,900italic|Mr+Dafoe:regular&subset=latin,latin-ext&display=swap');
  CMS.registerPreviewStyle('/assets/theme.css');
  CMS.registerPreviewStyle('/assets/blocks.css');
  CMS.registerPreviewStyle('body{background:#fff;margin:0}#page-container{padding-top:0!important}.et_pb_section,.et_pb_row,.et_pb_column,.et_pb_module,.et-waypoint,.et_animated{opacity:1!important;animation:none!important}iframe{pointer-events:none}', { raw: true });

  CMS.registerPreviewTemplate('pages', Apercu(renderPage));
  CMS.registerPreviewTemplate('accueil', Apercu(renderAccueil));
  CMS.registerPreviewTemplate('site', Sans);
})();
