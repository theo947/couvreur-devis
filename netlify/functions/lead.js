/**
 * Netlify Function — Dépôt de lead chez ViteUnDevis.com
 *
 * Le navigateur poste les données du formulaire ici (JSON).
 * On valide, on mappe vers les paramètres de l'API ViteUnDevis,
 * puis on POST vers get.php. Le token reste côté serveur (env var).
 *
 * Variables d'environnement Netlify :
 *   VUD_API_KEY   (obligatoire) — clé/token ViteUnDevis
 *   VUD_API_TEST  (optionnel)   — "1" => appelle get.php?test=1 (aucune insertion réelle)
 */

const VUD_ENDPOINT = 'https://www.viteundevis.com/api/get.php';
const SITE_NAME = 'deviscouvreurfrance.com';

// Mapping slug de service -> ID_TRAVAUX ViteUnDevis (miroir de src/data/services.json)
const CAT_MAP = {
  'reparation-toiture': 143,
  'renovation-toiture': 143,
  'urgence-toiture': 143,
  'toiture-tuile': 80,
  'toiture-ardoise': 80,
  'toiture-zinc': 80,
  'toiture-bac-acier': 80,
  'nettoyage-toiture': 81,
  'charpente': 8,
  'zinguerie': 84,
  'toiture-plate': 83,
  'etancheite-toiture': 83,
  'velux-fenetre-toit': 166,
  'isolation-toiture': 103,
};

const jsonResponse = (statusCode, body) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { ok: false, message: 'Méthode non autorisée.' });
  }

  const apiKey = process.env.VUD_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { ok: false, message: 'Configuration serveur manquante.' });
  }

  let data;
  try {
    data = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { ok: false, message: 'Données invalides.' });
  }

  // Nettoyage basique
  const s = (v) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v));
  const travaux = s(data.travaux);
  const nom = s(data.nom);
  const prenom = s(data.prenom);
  const email = s(data.email);
  const tel = s(data.tel).replace(/\s+/g, '');
  const adresse1 = s(data.adresse);
  const cp = s(data.cp);
  const ville = s(data.ville);
  const description = s(data.description);
  const typeBien = s(data.type_bien);
  const situation = s(data.situation);
  const delais = s(data.delais);

  // Validation côté serveur (miroir des champs requis par l'API)
  const errors = [];
  const catId = CAT_MAP[travaux];
  if (!catId) errors.push('Type de travaux invalide.');
  if (!nom) errors.push('Nom requis.');
  if (!prenom) errors.push('Prénom requis.');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) errors.push('Email invalide.');
  if (!/^[\d.\-\s]{10,14}$/.test(tel)) errors.push('Téléphone invalide.');
  if (!adresse1) errors.push('Adresse requise.');
  if (!/^\d{5}$/.test(cp)) errors.push('Code postal invalide.');
  if (!ville) errors.push('Ville requise.');
  if (!description) errors.push('Description requise.');
  if (!['1', '2', '3', '4', '6'].includes(typeBien)) errors.push('Type de bien invalide.');
  if (!['1', '2', '3', '4'].includes(situation)) errors.push('Situation invalide.');
  if (!['1', '2', '3', '4'].includes(delais)) errors.push('Délai invalide.');

  if (errors.length) {
    return jsonResponse(400, { ok: false, message: errors.join(' ') });
  }

  // Construction du payload ViteUnDevis
  const params = new URLSearchParams({
    key: apiKey,
    cat_id: String(catId),
    nom,
    prenom,
    email,
    tel,
    adresse1,
    cp,
    ville,
    cp_projet: cp,
    ville_projet: ville,
    pays: 'fr',
    tp: '1', // particulier
    type_bien: typeBien,
    situation,
    delais,
    description,
    site_name: SITE_NAME,
    format_return: 'json',
  });

  const url = process.env.VUD_API_TEST === '1' ? `${VUD_ENDPOINT}?test=1` : VUD_ENDPOINT;

  let apiJson;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': `partenaire-apivud-${apiKey}`,
      },
      body: params.toString(),
    });
    const text = await res.text();
    try {
      apiJson = JSON.parse(text);
    } catch {
      return jsonResponse(502, { ok: false, message: 'Réponse API illisible.', raw: text.slice(0, 500) });
    }
  } catch {
    return jsonResponse(502, { ok: false, message: 'Service de devis injoignable.' });
  }

  // Analyse du retour : code_retour[0].code == 200 => OK
  const codes = Array.isArray(apiJson?.code_retour) ? apiJson.code_retour : [];
  const ok = codes.some((c) => String(c.code) === '200');

  if (ok) {
    const dd = apiJson.devis_data || {};
    return jsonResponse(200, {
      ok: true,
      devis_id: dd.devis_id ?? null,
      devis_hash: dd.devis_hash ?? null,
    });
  }

  return jsonResponse(422, {
    ok: false,
    message: 'Votre demande n\'a pas pu être enregistrée.',
    codes: codes.map((c) => ({ code: c.code, texte: c.code_texte })),
  });
};
