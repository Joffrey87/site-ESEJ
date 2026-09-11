/* Déclenchée automatiquement par Netlify Identity à chaque inscription.
   - Le nouveau compte reçoit le rôle « en_attente » : il ne peut rien modifier tant que le Grand
     Administrateur (trésorier) ne l'a pas validé depuis le tableau de bord (/admin/).
   - Le Grand Administrateur (trésorier) est prévenu par e-mail via Web3Forms si la variable d'environnement
     WEB3FORMS_TRESORIER_KEY est définie dans Netlify (Site configuration → Environment variables). */
'use strict';

exports.handler = async (event) => {
  let user = {};
  try { user = JSON.parse(event.body || '{}').user || {}; } catch (e) { /* corps vide */ }

  const nom = (user.user_metadata && user.user_metadata.full_name) || '(sans nom)';
  const email = user.email || '';
  const siteUrl = process.env.URL || 'https://saint-enfant-jesus2.netlify.app';
  const key = process.env.WEB3FORMS_TRESORIER_KEY;

  if (key) {
    try {
      await fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          access_key: key,
          subject: `[Site de l'école] Nouveau compte administrateur à valider : ${nom}`,
          from_name: 'Site de l’école du Saint-Enfant-Jésus',
          message:
            `Bonjour,\n\nUne personne vient de créer un compte pour le mode édition du site de l'école :\n\n` +
            `  Nom : ${nom}\n  E-mail : ${email}\n\n` +
            `Ce compte est en attente : il ne peut rien modifier tant que vous ne l'avez pas validé.\n` +
            `Pour valider ou refuser ce compte, connectez-vous en tant que Grand Administrateur puis ouvrez le Menu administrateur → Comptes :\n` +
            `${siteUrl}/admin/#comptes\n\n— Message automatique du site de l'école`,
        }),
      });
    } catch (e) {
      console.error('Notification Web3Forms impossible :', e.message);
    }
  } else {
    console.warn('WEB3FORMS_TRESORIER_KEY non définie : pas de notification e-mail envoyée au Grand Administrateur.');
  }

  // Rôle initial : en attente de validation (les rôles sont contrôlés par Git Gateway)
  return {
    statusCode: 200,
    body: JSON.stringify({ app_metadata: { roles: ['en_attente'] } }),
  };
};
