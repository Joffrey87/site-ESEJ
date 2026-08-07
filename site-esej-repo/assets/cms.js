/* Applique le contenu éditable (modifié depuis /admin) sur la page d'accueil. */
(async function () {
  try {
    var res = await fetch('content/accueil.json', { cache: 'no-store' });
    if (!res.ok) return;
    var d = await res.json();
    var esc = function (s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    // Texte simple
    document.querySelectorAll('[data-cms]').forEach(function (el) {
      var k = el.getAttribute('data-cms');
      if (d[k] != null) el.textContent = d[k];
    });
    // Lien (href)
    document.querySelectorAll('[data-cms-href]').forEach(function (el) {
      var k = el.getAttribute('data-cms-href');
      if (d[k] != null) el.setAttribute('href', d[k]);
    });
    // Paragraphes (une ligne vide = nouveau paragraphe)
    document.querySelectorAll('[data-cms-para]').forEach(function (el) {
      var k = el.getAttribute('data-cms-para');
      if (d[k] != null) {
        el.innerHTML = String(d[k])
          .split(/\n\s*\n/)
          .map(function (t) { return '<p>' + esc(t.trim()) + '</p>'; })
          .join('');
      }
    });
  } catch (e) { /* silencieux */ }
})();
