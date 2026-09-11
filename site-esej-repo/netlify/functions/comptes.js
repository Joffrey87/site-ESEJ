/* Gestion des comptes administrateurs, consultation par tout administrateur, actions par le Grand Administrateur (rôle « maitre »).
   Appelée depuis le tableau de bord (/admin/) avec le jeton de connexion de l'utilisateur.
   Actions (POST JSON) :
     { action: "lister" }                 -> liste des comptes et de leur statut
     { action: "valider", id }            -> le compte passe au rôle « admin » (accès complet)
     { action: "refuser", id }            -> le compte est supprimé
     { action: "retirer", id }            -> un admin repasse « en_attente » (accès suspendu)
   Les rôles : maitre (Grand Administrateur, gère les comptes) · admin (peut tout modifier) · en_attente (rien). */
'use strict';

const reply = (statusCode, data) => ({ statusCode, headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(data) });

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') return reply(405, { erreur: 'Méthode non autorisée' });

  const cc = context.clientContext || {};
  const appelant = cc.user;
  const identity = cc.identity;
  if (!appelant || !identity) return reply(401, { erreur: 'Connexion requise' });

  const rolesAppelant = ((appelant.app_metadata && appelant.app_metadata.roles) || []).map((r) => String(r).toLowerCase());
  const estAdmin = rolesAppelant.includes('admin') || rolesAppelant.includes('maitre');
  const estGrand = rolesAppelant.includes('maitre');
  if (!estAdmin) return reply(403, { erreur: 'Réservé aux administrateurs' });

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch (e) { return reply(400, { erreur: 'Requête illisible' }); }
  // la consultation est ouverte à tous les administrateurs ; les actions au seul Grand Administrateur
  if (body.action !== 'lister' && !estGrand) return reply(403, { erreur: 'Réservé au Grand Administrateur' });

  const api = async (path, method, data) => {
    const r = await fetch(identity.url + path, {
      method: method || 'GET',
      headers: { Authorization: 'Bearer ' + identity.token, 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
    });
    if (r.status === 204) return {};
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.msg || j.error || ('Erreur Identity ' + r.status));
    return j;
  };

  const resume = (u) => ({
    id: u.id,
    nom: (u.user_metadata && u.user_metadata.full_name) || '',
    email: u.email,
    roles: (u.app_metadata && u.app_metadata.roles) || [],
    cree_le: u.created_at,
    confirme: !!u.confirmed_at,
    derniere_connexion: u.last_login || null,
  });

  try {
    switch (body.action) {
      case 'lister': {
        const j = await api('/admin/users?per_page=200');
        return reply(200, { comptes: (j.users || []).map(resume) });
      }
      case 'valider': {
        if (!body.id) return reply(400, { erreur: 'Identifiant manquant' });
        const u = await api('/admin/users/' + body.id, 'PUT', { app_metadata: { roles: ['admin'] } });
        return reply(200, { compte: resume(u) });
      }
      case 'retirer': {
        if (!body.id) return reply(400, { erreur: 'Identifiant manquant' });
        if (body.id === appelant.sub) return reply(400, { erreur: 'Le Grand Administrateur ne peut pas se retirer lui-même' });
        const u = await api('/admin/users/' + body.id, 'PUT', { app_metadata: { roles: ['en_attente'] } });
        return reply(200, { compte: resume(u) });
      }
      case 'refuser': {
        if (!body.id) return reply(400, { erreur: 'Identifiant manquant' });
        if (body.id === appelant.sub) return reply(400, { erreur: 'Le Grand Administrateur ne peut pas se supprimer lui-même' });
        await api('/admin/users/' + body.id, 'DELETE');
        return reply(200, { supprime: body.id });
      }
      case 'transferer': {
        // Transmission du rôle de Grand Administrateur à un autre compte : le nouveau devient « maitre »,
        // l'ancien (celui qui fait la demande) redevient simple administrateur.
        if (!body.id) return reply(400, { erreur: 'Identifiant manquant' });
        if (body.id === appelant.sub) return reply(400, { erreur: 'Ce compte est déjà le Grand Administrateur' });
        const cible = await api('/admin/users/' + body.id);
        if (!cible.confirmed_at) return reply(400, { erreur: 'Ce compte n’a pas encore confirmé son adresse e-mail' });
        const nouveau = await api('/admin/users/' + body.id, 'PUT', { app_metadata: { roles: ['maitre'] } });
        let ancien = null;
        try {
          ancien = await api('/admin/users/' + appelant.sub, 'PUT', { app_metadata: { roles: ['admin'] } });
        } catch (e) {
          // Le nouveau Grand Administrateur est en place ; on signale que l'ancien rôle n'a pas pu être retiré
          return reply(200, { compte: resume(nouveau), avertissement: 'Nouveau Grand Administrateur en place, mais l’ancien rôle n’a pas pu être retiré : ' + e.message });
        }
        return reply(200, { compte: resume(nouveau), ancien: ancien ? resume(ancien) : null });
      }
      default:
        return reply(400, { erreur: 'Action inconnue' });
    }
  } catch (e) {
    return reply(500, { erreur: e.message });
  }
};
