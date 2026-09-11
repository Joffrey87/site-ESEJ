# Site de l'École du Saint-Enfant-Jésus

Site statique généré par `build.js` à partir de `content/` (édité via Decap CMS : tableau de bord `/admin/`, éditeur `/admin/cms.html`).

Comptes : Netlify Identity avec rôles `maitre` / `admin` / `en_attente` ; fonctions `netlify/functions/identity-signup.js` (inscription → en attente + e-mail au trésorier) et `comptes.js` (validation par le Grand Administrateur).

- `npm install && npm run build` → génère `dist/` (publié par Netlify, voir `netlify.toml` à la racine du dépôt).
- Voir `LISEZ-MOI.txt` pour le mode d'emploi de l'administration.
