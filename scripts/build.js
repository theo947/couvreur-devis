/**
 * Build script — Génère l'intégralité du site statique
 * Pages : accueil, régions, départements, villes, services, guides
 * + sitemap.xml, robots.txt
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SRC = join(ROOT, 'src');
const DIST = join(ROOT, 'dist');
const DATA = join(SRC, 'data');

const SITE_NAME = 'Devis Couvreur';
const SITE_URL = 'https://deviscouvreurfrance.com';


// ---------------------
// Load data
// ---------------------
const regions = JSON.parse(readFileSync(join(DATA, 'regions.json'), 'utf-8'));
const departements = JSON.parse(readFileSync(join(DATA, 'departements.json'), 'utf-8'));
const communes = JSON.parse(readFileSync(join(DATA, 'communes.json'), 'utf-8'));
const services = JSON.parse(readFileSync(join(DATA, 'services.json'), 'utf-8'));
const guides = JSON.parse(readFileSync(join(DATA, 'guides.json'), 'utf-8'));
const enrichment = JSON.parse(readFileSync(join(DATA, 'enrichment.json'), 'utf-8'));

// Build lookup maps
const regionByCode = new Map(regions.map(r => [r.code, r]));
const deptByCode = new Map(departements.map(d => [d.code, d]));
const communesByDept = new Map();
for (const c of communes) {
  if (!communesByDept.has(c.codeDepartement)) communesByDept.set(c.codeDepartement, []);
  communesByDept.get(c.codeDepartement).push(c);
}

let allUrls = [];

// ---------------------
// Enrichment helpers
// ---------------------

function getClimatZone(regionCode) {
  for (const [key, zone] of Object.entries(enrichment.zonesClimatiques)) {
    if (zone.regions.includes(regionCode)) return { code: key, ...zone };
  }
  return { code: 'H1b', label: 'Climat tempéré', description: 'Climat tempéré avec quatre saisons marquées.', risques: ['pluies', 'gel hivernal'], isolation: 'Isolation performante recommandée', regions: [] };
}

function getMateriaux(regionCode) {
  return enrichment.materiauxParRegion[regionCode] || {
    principal: 'Tuile mécanique et ardoise',
    detail: 'Les matériaux de couverture varient selon les traditions architecturales et les contraintes climatiques locales.',
    plu: 'Consultez le PLU de votre commune pour connaître les matériaux autorisés.'
  };
}

function getPrixCoeff(regionCode) {
  return enrichment.prixCoefficients[regionCode] || 1.0;
}

function formatPrix(base, coeff) {
  const min = Math.round(base.min * coeff / 5) * 5;
  const max = Math.round(base.max * coeff / 5) * 5;
  return `${min} — ${max} ${base.unite}`;
}

function getDeptDetail(deptCode) {
  return enrichment.departementDetails[deptCode] || null;
}

function getVilleCategorie(population) {
  for (const cat of Object.values(enrichment.villeCategories).sort((a, b) => b.seuil - a.seuil)) {
    if (population >= cat.seuil) return cat;
  }
  return enrichment.villeCategories.commune;
}

function getDeptPrep(dept) {
  const detail = getDeptDetail(dept.code);
  if (detail) return detail.prep;
  // Fallback intelligent
  const nom = dept.nom;
  if (nom.startsWith('Le ')) return 'dans le ' + nom.slice(3);
  if (nom.startsWith('La ')) return 'dans la ' + nom.slice(3);
  if (nom.startsWith("L'")) return "dans l'" + nom.slice(2);
  if (nom.startsWith('Les ')) return 'dans les ' + nom.slice(4);
  const voyelles = 'AEIOUHÉÈÊÀÂÔÙÛ';
  if (voyelles.includes(nom[0]?.toUpperCase())) return "en " + nom;
  return 'dans le ' + nom;
}

// ---------------------
// Template helpers
// ---------------------

function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function layout(title, metaDesc, canonical, breadcrumbs, bodyContent, schemaJsonLd = '') {
  const breadcrumbHtml = breadcrumbs.map((b, i) =>
    i < breadcrumbs.length - 1
      ? `<a href="${b.url}">${escHtml(b.label)}</a><span>›</span>`
      : `<span style="color:var(--gray-700)">${escHtml(b.label)}</span>`
  ).join(' ');

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "itemListElement": breadcrumbs.map((b, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": b.label,
      ...(i < breadcrumbs.length - 1 ? { "item": SITE_URL + b.url } : {})
    }))
  };

  // Noindex for legal pages
  const isLegal = canonical.startsWith('/mentions-legales') || canonical.startsWith('/politique-confidentialite');
  const robotsMeta = isLegal ? 'noindex, follow' : 'index, follow';

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escHtml(title)}</title>
<meta name="description" content="${escHtml(metaDesc)}">
<link rel="canonical" href="${SITE_URL}${canonical}">
<meta name="robots" content="${robotsMeta}">
<link rel="alternate" hreflang="fr-FR" href="${SITE_URL}${canonical}">
<meta property="og:title" content="${escHtml(title)}">
<meta property="og:description" content="${escHtml(metaDesc)}">
<meta property="og:url" content="${SITE_URL}${canonical}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:locale" content="fr_FR">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
<meta name="twitter:description" content="${escHtml(metaDesc)}">
<meta name="theme-color" content="#e67e22">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" onload="this.rel='stylesheet'">
<noscript><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet"></noscript>
<link rel="stylesheet" href="/assets/css/style.css">
<script type="application/ld+json">${JSON.stringify(breadcrumbSchema)}</script>
${schemaJsonLd ? `<script type="application/ld+json">${schemaJsonLd}</script>` : ''}
</head>
<body>

<header class="site-header">
<div class="header-inner">
  <a href="/" class="site-logo">Devis<span>Couvreur</span></a>
  <button class="mobile-toggle" aria-label="Menu">☰</button>
  <nav class="main-nav">
    <a href="/">Accueil</a>
    <a href="/services/">Services</a>
    <a href="/guide/">Guides</a>
    <a href="#quote-form-1" class="nav-cta">Devis gratuit</a>
  </nav>
</div>
</header>

<div class="reassurance">
<div class="reassurance-inner">
  <div class="reassurance-item"><span class="check">✓</span> Gratuit et sans engagement</div>
  <div class="reassurance-item"><span class="check">✓</span> Artisans certifiés RGE</div>
  <div class="reassurance-item"><span class="check">✓</span> Réponse sous 48h</div>
  <div class="reassurance-item"><span class="check">✓</span> Jusqu'à 3 devis comparatifs</div>
</div>
</div>

<div class="breadcrumb"><div class="container">${breadcrumbHtml}</div></div>

${bodyContent}

<footer class="site-footer">
<div class="container">
<div class="footer-grid">
  <div class="footer-col">
    <h4>Devis<span style="color:var(--primary)">Couvreur</span></h4>
    <p>Trouvez rapidement un couvreur qualifié près de chez vous. Comparez jusqu'à 3 devis gratuits et sans engagement pour tous vos travaux de toiture.</p>
  </div>
  <div class="footer-col">
    <h4>Services</h4>
    <ul>
      ${services.slice(0, 6).map(s => `<li><a href="/services/${s.slug}/">${s.nom}</a></li>`).join('\n      ')}
    </ul>
  </div>
  <div class="footer-col">
    <h4>Guides</h4>
    <ul>
      ${guides.slice(0, 5).map(g => `<li><a href="/guide/${g.slug}/">${g.titre.split('—')[0].trim()}</a></li>`).join('\n      ')}
    </ul>
  </div>
  <div class="footer-col">
    <h4>Régions</h4>
    <ul>
      ${regions.filter(r => !r.code.startsWith('0')).slice(0, 8).map(r => `<li><a href="/couvreur/${r.slug}/">${r.nom}</a></li>`).join('\n      ')}
    </ul>
  </div>
</div>
<div class="footer-bottom">
  © 2026 ${SITE_NAME} — Tous droits réservés |
  <a href="/mentions-legales/">Mentions légales</a> |
  <a href="/politique-confidentialite/">Politique de confidentialité</a>
</div>
</div>
</footer>

<script src="/assets/js/main.js" defer></script>
</body>
</html>`;
}

let formCounter = 0;
function quoteFormHtml(lieu = '') {
  const uid = ++formCounter;
  const lieuPlaceholder = lieu || 'Votre ville ou code postal';
  return `
<div class="quote-form-card">
  <h2>Demandez vos devis gratuits</h2>
  <p class="subtitle">Recevez jusqu'à 3 devis de couvreurs qualifiés${lieu ? ' à ' + escHtml(lieu) : ''}</p>
  <form class="quote-form" id="quote-form-${uid}" action="https://api.web3forms.com/submit" method="POST">
    <input type="hidden" name="access_key" value="6b3293a5-195f-4d6b-8d4c-b3e21c37c613">
    <input type="hidden" name="subject" value="Nouveau devis couvreur${lieu ? ' — ' + escHtml(lieu) : ''}">
    <input type="hidden" name="from_name" value="Devis Couvreur France">
    <input type="checkbox" name="botcheck" style="display:none">
    <input type="hidden" name="redirect" value="${SITE_URL}/merci.html">
    <div class="form-group">
      <label for="travaux-${uid}">Type de travaux *</label>
      <select id="travaux-${uid}" name="travaux" required>
        <option value="">Sélectionnez...</option>
        ${services.map(s => `<option value="${s.slug}">${s.nom}</option>`).join('\n        ')}
      </select>
    </div>
    <div class="form-group">
      <label for="ville-${uid}">Ville ou code postal *</label>
      <input type="text" id="ville-${uid}" name="ville" placeholder="${escHtml(lieuPlaceholder)}" value="${lieu ? escHtml(lieu) : ''}" required>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label for="nom-${uid}">Nom *</label>
        <input type="text" id="nom-${uid}" name="nom" placeholder="Votre nom" required>
      </div>
      <div class="form-group">
        <label for="email-${uid}">Email *</label>
        <input type="email" id="email-${uid}" name="email" placeholder="votre@email.fr" required>
      </div>
    </div>
    <div class="form-group">
      <label for="description-${uid}">Description du projet (optionnel)</label>
      <textarea id="description-${uid}" name="description" placeholder="Décrivez brièvement vos travaux..."></textarea>
    </div>
    <button type="submit" class="btn-primary">Recevoir mes devis gratuits</button>
    <div class="form-trust">
      <div class="form-trust-item"><span class="lock-icon">🔒</span> Données protégées</div>
      <div class="form-trust-item"><span class="lock-icon">✓</span> Sans engagement</div>
      <div class="form-trust-item"><span class="lock-icon">⚡</span> Réponse 48h</div>
    </div>
  </form>
</div>`;
}

function howItWorksHtml() {
  return `
<section class="steps-section">
<div class="container">
  <h2 class="section-title">Comment ça marche ?</h2>
  <p class="section-subtitle">Obtenez vos devis en 3 étapes simples</p>
  <div class="steps-grid">
    <div class="step-card">
      <div class="step-number">1</div>
      <h3>Décrivez votre projet</h3>
      <p>Remplissez le formulaire en 2 minutes : type de travaux, ville et coordonnées.</p>
    </div>
    <div class="step-card">
      <div class="step-number">2</div>
      <h3>Recevez 3 devis</h3>
      <p>Des couvreurs qualifiés et assurés de votre secteur vous contactent sous 48h.</p>
    </div>
    <div class="step-card">
      <div class="step-number">3</div>
      <h3>Comparez et choisissez</h3>
      <p>Comparez les prix, avis et garanties. Choisissez le meilleur artisan, sans engagement.</p>
    </div>
  </div>
</div>
</section>`;
}

function testimonialsHtml() {
  return `
<section class="section">
<div class="container">
  <h2 class="section-title">Ce que disent nos clients</h2>
  <p class="section-subtitle">Des milliers de propriétaires nous font confiance</p>
  <div class="testimonial-grid">
    <div class="testimonial-card">
      <div class="testimonial-stars">★★★★★</div>
      <p class="testimonial-text">Service rapide et efficace. J'ai reçu 3 devis en moins de 24h pour la rénovation de ma toiture. Le couvreur choisi était très professionnel.</p>
      <div class="testimonial-author">
        <div class="testimonial-avatar">ML</div>
        <div class="testimonial-info"><strong>Marie L.</strong><span>Rénovation toiture — Lyon</span></div>
      </div>
    </div>
    <div class="testimonial-card">
      <div class="testimonial-stars">★★★★★</div>
      <p class="testimonial-text">Excellent rapport qualité-prix. Le comparatif m'a permis d'économiser plus de 2 000 € sur mes travaux d'isolation de toiture. Je recommande.</p>
      <div class="testimonial-author">
        <div class="testimonial-avatar">PD</div>
        <div class="testimonial-info"><strong>Philippe D.</strong><span>Isolation toiture — Nantes</span></div>
      </div>
    </div>
    <div class="testimonial-card">
      <div class="testimonial-stars">★★★★★</div>
      <p class="testimonial-text">Très pratique pour trouver un couvreur de confiance. Les artisans étaient tous certifiés RGE, ce qui m'a permis de bénéficier des aides.</p>
      <div class="testimonial-author">
        <div class="testimonial-avatar">SC</div>
        <div class="testimonial-info"><strong>Sophie C.</strong><span>Réparation fuite — Toulouse</span></div>
      </div>
    </div>
  </div>
</div>
</section>`;
}

function ctaBannerHtml(lieu = '') {
  return `
<section class="cta-banner">
<div class="container">
  <h2>Prêt à lancer vos travaux de toiture${lieu ? ' à ' + escHtml(lieu) : ''} ?</h2>
  <p>Recevez jusqu'à 3 devis gratuits de couvreurs qualifiés${lieu ? ' à ' + escHtml(lieu) : ' près de chez vous'}.</p>
  <a href="#quote-form-1" class="btn-primary">Demander mes devis gratuits</a>
</div>
</section>`;
}

function faqHtml(faqs) {
  if (!faqs || !faqs.length) return '';
  return `
<div class="faq-section">
  <h2>Questions fréquentes</h2>
  ${faqs.map(f => `
  <div class="faq-item">
    <div class="faq-question"><span>${escHtml(f.question)}</span><span class="toggle">+</span></div>
    <div class="faq-answer"><p>${escHtml(f.reponse)}</p></div>
  </div>`).join('')}
</div>`;
}

function faqSchema(faqs) {
  if (!faqs || !faqs.length) return '';
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map(f => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": { "@type": "Answer", "text": f.reponse }
    }))
  });
}

function serviceSchema(lieu) {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": `Couvreur à ${lieu}`,
    "description": `Trouvez un couvreur qualifié à ${lieu}. Devis gratuit et sans engagement.`,
    "specialty": "Couverture et toiture",
    "about": {
      "@type": "Service",
      "serviceType": "Travaux de couverture",
      "areaServed": { "@type": "Place", "name": lieu }
    }
  });
}

function writePage(urlPath, html) {
  const dir = join(DIST, urlPath);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html);
  allUrls.push(urlPath);
}

// ---------------------
// Generate: Homepage
// ---------------------
function buildHomepage() {
  const title = 'Devis Couvreur Gratuit en Ligne — Comparez 3 Artisans (2026)';
  const desc = 'Comparez jusqu\'à 3 devis de couvreurs certifiés RGE en 2 min. Réparation, rénovation, démoussage, isolation. 100 % gratuit et sans engagement.';

  const body = `
<section class="hero">
<div class="container hero-inner">
  <div>
    <h1>Devis Couvreur — Trouvez un <span>couvreur qualifié</span> près de chez vous</h1>
    <p>Besoin de travaux de toiture ? Comparez gratuitement les devis de couvreurs certifiés dans votre ville. Réparation, rénovation, nettoyage, isolation : recevez jusqu'à 3 propositions sous 48h.</p>
    <div class="trust-badges">
      <div class="trust-badge"><div class="icon">✓</div> Gratuit</div>
      <div class="trust-badge"><div class="icon">✓</div> Sans engagement</div>
      <div class="trust-badge"><div class="icon">✓</div> Artisans RGE</div>
      <div class="trust-badge"><div class="icon">✓</div> Réponse 48h</div>
    </div>
  </div>
  ${quoteFormHtml()}
</div>
</section>

<section class="section">
<div class="container">
  <div class="stats-bar">
    <div class="stat-item"><div class="stat-number">2 500+</div><div class="stat-label">Couvreurs partenaires</div></div>
    <div class="stat-item"><div class="stat-number">35 000+</div><div class="stat-label">Devis envoyés</div></div>
    <div class="stat-item"><div class="stat-number">98%</div><div class="stat-label">Clients satisfaits</div></div>
    <div class="stat-item"><div class="stat-number">48h</div><div class="stat-label">Délai de réponse</div></div>
  </div>
</div>
</section>

${howItWorksHtml()}

<section class="section bg-gray">
<div class="container">
  <h2 class="section-title">Nos services de couverture</h2>
  <p class="section-subtitle">Des artisans qualifiés pour tous vos travaux de toiture</p>
  <div class="grid-3">
    ${services.map(s => `
    <div class="card">
      <div class="card-icon">🏠</div>
      <h3><a href="/services/${s.slug}/">${escHtml(s.nom)}</a></h3>
      <p>${escHtml(s.description)}</p>
    </div>`).join('')}
  </div>
</div>
</section>

${testimonialsHtml()}

<section class="section bg-gray">
<div class="container">
  <h2 class="section-title">Trouvez un couvreur par région</h2>
  <p class="section-subtitle">Couvreurs qualifiés dans toute la France</p>
  <div class="link-grid">
    ${regions.map(r => `
    <a href="/couvreur/${r.slug}/" class="link-item">
      Couvreur en ${escHtml(r.nom)} <span class="arrow">→</span>
    </a>`).join('')}
  </div>
</div>
</section>

<section class="section">
<div class="container">
  <h2 class="section-title">Pourquoi passer par ${SITE_NAME} ?</h2>
  <div class="grid-3">
    <div class="card">
      <h3>100% gratuit et sans engagement</h3>
      <p>Notre service de mise en relation est entièrement gratuit. Vous recevez des devis sans aucune obligation de votre part.</p>
    </div>
    <div class="card">
      <h3>Artisans vérifiés et certifiés</h3>
      <p>Tous nos couvreurs partenaires sont assurés (décennale), certifiés RGE et évalués par nos clients.</p>
    </div>
    <div class="card">
      <h3>Jusqu'à 3 devis comparatifs</h3>
      <p>Comparez les offres de plusieurs artisans pour obtenir le meilleur rapport qualité-prix.</p>
    </div>
  </div>
</div>
</section>

${ctaBannerHtml()}

<section class="section">
<div class="container">
  <h2 class="section-title">Guides et conseils toiture</h2>
  <div class="grid-3">
    ${guides.map(g => `
    <div class="card">
      <h3><a href="/guide/${g.slug}/">${escHtml(g.titre.split('—')[0].trim())}</a></h3>
      <p>${escHtml(g.metaDescription)}</p>
    </div>`).join('')}
  </div>
</div>
</section>`;

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": SITE_NAME,
    "url": SITE_URL
  });
  writePage('/', layout(title, desc, '/', [{ label: 'Accueil', url: '/' }], body, schema));
}

// ---------------------
// Generate: Region pages
// ---------------------
function buildRegionPages() {
  for (const region of regions) {
    const url = `/couvreur/${region.slug}/`;
    const regionDepts = departements.filter(d => d.codeRegion === region.code);
    const climat = getClimatZone(region.code);
    const materiaux = getMateriaux(region.code);
    const coeff = getPrixCoeff(region.code);

    const title = `Couvreur ${region.nom} — Devis Gratuit en Ligne (2026)`;
    const desc = `Trouvez un couvreur en ${region.nom} : comparez 3 devis gratuits d'artisans certifiés RGE. Prix, matériaux (${materiaux.principal.split(',')[0].toLowerCase()}) et avis. Réponse sous 48h.`;
    const pb = enrichment.prixBase;

    const linkedServices = [...services].sort(() => Math.random() - 0.5).slice(0, 4);

    const faqs = [
      { question: `Combien coûte un couvreur en ${region.nom} ?`, reponse: `En ${region.nom}, les tarifs sont ${coeff > 1.1 ? 'supérieurs à la moyenne nationale' : coeff < 0.95 ? 'légèrement inférieurs à la moyenne nationale' : 'proches de la moyenne nationale'}. Comptez ${formatPrix(pb.toiture_neuve_tuile, coeff)} pour une couverture en tuile, ${formatPrix(pb.demoussage, coeff)} pour un démoussage, et ${formatPrix(pb.reparation, coeff)} pour une réparation. Ces prix incluent la main-d'œuvre.` },
      { question: `Comment trouver un bon couvreur en ${region.nom} ?`, reponse: `Vérifiez l'assurance décennale (obligatoire), la certification RGE pour bénéficier des aides, et les avis clients vérifiés. En ${region.nom}, privilégiez un artisan qui maîtrise la pose de ${escHtml(materiaux.principal).toLowerCase()}, les matériaux traditionnels de la région. Comparez au moins 3 devis.` },
      { question: `Quels matériaux de toiture sont utilisés en ${region.nom} ?`, reponse: `En ${region.nom}, les matériaux traditionnels sont : ${escHtml(materiaux.principal).toLowerCase()}. ${escHtml(materiaux.plu)} Le choix dépend aussi du PLU de votre commune et de la zone climatique (${climat.label}).` },
      { question: `Quels risques climatiques pour les toitures en ${region.nom} ?`, reponse: `La région ${region.nom} est en zone climatique ${climat.code} (${climat.label}). Les principaux risques sont : ${climat.risques.join(', ')}. ${climat.isolation}. Un couvreur local connaît ces contraintes et adapte ses préconisations.` },
    ];

    const body = `
<section class="hero">
<div class="container hero-inner">
  <div>
    <h1>Couvreur en <span>${escHtml(region.nom)}</span> — Devis Gratuit et Sans Engagement</h1>
    <p>Trouvez un couvreur qualifié en ${escHtml(region.nom)} pour vos travaux de toiture. La région, située en zone climatique ${climat.code} (${escHtml(climat.label)}), présente des contraintes spécifiques que nos artisans partenaires maîtrisent parfaitement.</p>
    <div class="trust-badges">
      <div class="trust-badge"><div class="icon">✓</div> Gratuit</div>
      <div class="trust-badge"><div class="icon">✓</div> ${regionDepts.length} départements couverts</div>
      <div class="trust-badge"><div class="icon">✓</div> Certifiés RGE</div>
    </div>
  </div>
  ${quoteFormHtml(region.nom)}
</div>
</section>

<section class="section">
<div class="container page-layout">
  <div class="content-area">
    <h2>Climat et contraintes de toiture en ${escHtml(region.nom)}</h2>
    <p>${escHtml(climat.description)}</p>
    <p>Les principaux risques pour les toitures de la région sont : <strong>${climat.risques.join(', ')}</strong>. En matière d'isolation, ${climat.isolation.toLowerCase()}. Ces facteurs influencent directement le choix des matériaux, les techniques de pose et la fréquence d'entretien de votre toiture.</p>

    <h2>Matériaux de couverture traditionnels</h2>
    <p>Les matériaux de prédilection en ${escHtml(region.nom)} sont <strong>${escHtml(materiaux.principal).toLowerCase()}</strong>. ${escHtml(materiaux.detail)}</p>
    <p><strong>Réglementation locale :</strong> ${escHtml(materiaux.plu)}</p>

    <h2>Prix des travaux de toiture en ${escHtml(region.nom)}</h2>
    <p>Les prix en ${escHtml(region.nom)} sont ${coeff > 1.1 ? 'supérieurs de ' + Math.round((coeff - 1) * 100) + ' % à la moyenne nationale, en raison du coût de la vie et de la forte demande' : coeff < 0.95 ? 'inférieurs de ' + Math.round((1 - coeff) * 100) + ' % à la moyenne nationale' : 'proches de la moyenne nationale'}.</p>
    <table class="price-table">
      <thead><tr><th>Prestation</th><th>Prix en ${escHtml(region.nom)}</th></tr></thead>
      <tbody>
        <tr><td>Couverture tuile (pose)</td><td>${formatPrix(pb.toiture_neuve_tuile, coeff)}</td></tr>
        <tr><td>Couverture ardoise (pose)</td><td>${formatPrix(pb.toiture_neuve_ardoise, coeff)}</td></tr>
        <tr><td>Couverture zinc (pose)</td><td>${formatPrix(pb.toiture_neuve_zinc, coeff)}</td></tr>
        <tr><td>Rénovation complète</td><td>${formatPrix(pb.renovation, coeff)}</td></tr>
        <tr><td>Démoussage et nettoyage</td><td>${formatPrix(pb.demoussage, coeff)}</td></tr>
        <tr><td>Isolation de toiture</td><td>${formatPrix(pb.isolation, coeff)}</td></tr>
        <tr><td>Réparation</td><td>${formatPrix(pb.reparation, coeff)}</td></tr>
      </tbody>
    </table>
    <p><em>Prix indicatifs TTC en ${escHtml(region.nom)}, main-d'œuvre incluse. Source : observatoire des prix de la construction, actualisé en mars 2026.</em></p>

    <h2>Couvreurs par département en ${escHtml(region.nom)}</h2>
    <div class="link-grid">
      ${regionDepts.map(d => `
      <a href="/couvreur/${region.slug}/${d.slug}/" class="link-item">
        ${escHtml(d.nom)} (${d.code}) <span class="arrow">→</span>
      </a>`).join('')}
    </div>

    <h2>Services de couverture disponibles</h2>
    <div class="grid-2" style="margin-top:1rem">
      ${linkedServices.map(s => `
      <a href="/services/${s.slug}/" class="link-item">${escHtml(s.nom)} <span class="arrow">→</span></a>`).join('')}
    </div>

    ${region.regionsLimitrophes && region.regionsLimitrophes.length > 0 ? `
    <h2>Régions limitrophes</h2>
    <div class="link-grid">
      ${region.regionsLimitrophes.map(r => `
      <a href="/couvreur/${r.slug}/" class="link-item">
        Couvreur en ${escHtml(r.nom)} <span class="arrow">→</span>
      </a>`).join('')}
    </div>` : ''}

    ${faqHtml(faqs)}
  </div>
  <div class="sidebar">
    ${quoteFormHtml(region.nom)}
  </div>
</div>
</section>`;

    const schemas = [serviceSchema(region.nom), faqSchema(faqs)].filter(Boolean).join('</script>\n<script type="application/ld+json">');
    writePage(url, layout(title, desc, url,
      [{ label: 'Accueil', url: '/' }, { label: region.nom, url }],
      body, schemas));
  }
}

// ---------------------
// Generate: Department pages
// ---------------------
function buildDepartmentPages() {
  for (const dept of departements) {
    const region = regionByCode.get(dept.codeRegion);
    if (!region) continue;

    const prep = getDeptPrep(dept);
    const url = `/couvreur/${region.slug}/${dept.slug}/`;
    const deptCommunes = communesByDept.get(dept.code) || [];
    const topCommunes = deptCommunes.slice(0, 30);
    const climat = getClimatZone(region.code);
    const materiaux = getMateriaux(region.code);

    const coeff = getPrixCoeff(region.code);
    const pb = enrichment.prixBase;
    const deptDetail = getDeptDetail(dept.code);

    const title = `Couvreur ${dept.nom} (${dept.code}) — Devis Gratuit (2026)`;
    const desc = `Couvreur ${prep} : comparez 3 devis gratuits d'artisans certifiés. Prix ${formatPrix(pb.toiture_neuve_tuile, coeff)} (tuile), matériaux locaux. Sans engagement.`;
    const totalPop = deptCommunes.reduce((s, c) => s + (c.population || 0), 0);

    const linkedServices = [...services].sort(() => Math.random() - 0.5).slice(0, 4);

    const faqs = [
      { question: `Quel est le prix d'un couvreur ${prep} ?`, reponse: `${prep.charAt(0).toUpperCase() + prep.slice(1)}, les prix sont ${coeff > 1.1 ? 'supérieurs à la moyenne nationale (+' + Math.round((coeff-1)*100) + ' %)' : coeff < 0.95 ? 'inférieurs à la moyenne (-' + Math.round((1-coeff)*100) + ' %)' : 'proches de la moyenne nationale'}. Comptez ${formatPrix(pb.toiture_neuve_tuile, coeff)} pour une couverture en tuile, ${formatPrix(pb.demoussage, coeff)} pour un démoussage. Demandez un devis gratuit pour un chiffrage précis.` },
      { question: `Comment trouver un couvreur certifié ${prep} (${dept.code}) ?`, reponse: `Vérifiez l'assurance décennale et la certification RGE. ${prep.charAt(0).toUpperCase() + prep.slice(1)}, privilégiez un artisan maîtrisant la pose de ${materiaux.principal.toLowerCase()}, le matériau traditionnel local. Comparez au moins 3 devis via notre plateforme gratuite.` },
      { question: `Quelles aides pour la toiture ${prep} ?`, reponse: `Outre les aides nationales (MaPrimeRénov' jusqu'à 75 €/m², éco-PTZ jusqu'à 30 000 €, CEE), le département ${dept.nom} peut proposer des aides locales complémentaires. Consultez l'ADIL du ${dept.code} et votre mairie. Un artisan RGE est requis.` },
      { question: `Quel matériau de toiture choisir ${prep} ?`, reponse: `${prep.charAt(0).toUpperCase() + prep.slice(1)}, les matériaux traditionnels sont ${materiaux.principal.toLowerCase()}. ${materiaux.plu} La zone climatique ${climat.code} (${climat.label}) impose des contraintes spécifiques : ${climat.risques.slice(0, 2).join(', ')}.` },
    ];

    const body = `
<section class="hero">
<div class="container hero-inner">
  <div>
    <h1>Couvreur <span>${escHtml(prep)}</span> (${dept.code}) — Devis Gratuit</h1>
    <p>Trouvez un couvreur qualifié ${escHtml(prep)} pour vos travaux de toiture.${deptDetail ? ' ' + escHtml(deptDetail.specificites).split('.')[0] + '.' : ''} Comparez les devis d'artisans certifiés près de chez vous.</p>
    <div class="trust-badges">
      <div class="trust-badge"><div class="icon">✓</div> ${deptCommunes.length} villes couvertes</div>
      <div class="trust-badge"><div class="icon">✓</div> Artisans du ${dept.code}</div>
      <div class="trust-badge"><div class="icon">✓</div> Devis 48h</div>
    </div>
  </div>
  ${quoteFormHtml(dept.nom)}
</div>
</section>

<section class="section">
<div class="container page-layout">
  <div class="content-area">
    <h2>Couverture et toiture ${escHtml(prep)}</h2>
    ${deptDetail ? `<p>${escHtml(deptDetail.specificites)}</p>` : ''}
    <p>Le département ${escHtml(dept.nom)} (${dept.code}), en région ${escHtml(region.nom)}, se situe en zone climatique <strong>${climat.code}</strong> (${escHtml(climat.label)}). Les principaux risques pour les toitures sont : ${climat.risques.join(', ')}. ${climat.isolation}.</p>
    <p>Les matériaux de couverture traditionnels ${escHtml(prep)} sont <strong>${escHtml(materiaux.principal).toLowerCase()}</strong>. ${escHtml(materiaux.detail)}</p>

    <h2>Prix des travaux de toiture ${escHtml(prep)}</h2>
    <table class="price-table">
      <thead><tr><th>Prestation</th><th>Prix ${escHtml(prep)}</th></tr></thead>
      <tbody>
        <tr><td>Couverture tuile (pose)</td><td>${formatPrix(pb.toiture_neuve_tuile, coeff)}</td></tr>
        <tr><td>Couverture ardoise (pose)</td><td>${formatPrix(pb.toiture_neuve_ardoise, coeff)}</td></tr>
        <tr><td>Rénovation complète</td><td>${formatPrix(pb.renovation, coeff)}</td></tr>
        <tr><td>Démoussage et nettoyage</td><td>${formatPrix(pb.demoussage, coeff)}</td></tr>
        <tr><td>Isolation de toiture</td><td>${formatPrix(pb.isolation, coeff)}</td></tr>
        <tr><td>Réparation ponctuelle</td><td>${formatPrix(pb.reparation, coeff)}</td></tr>
        <tr><td>Pose de Velux</td><td>${formatPrix(pb.velux, coeff)}</td></tr>
        <tr><td>Zinguerie / gouttières</td><td>${formatPrix(pb.zinguerie, coeff)}</td></tr>
      </tbody>
    </table>
    <p><em>Prix indicatifs TTC ${escHtml(prep)}, main-d'œuvre incluse — mars 2026.</em></p>

    ${topCommunes.length > 0 ? `
    <h2>Couvreurs par ville ${escHtml(prep)}</h2>
    <div class="link-grid">
      ${topCommunes.map(c => `
      <a href="/couvreur/${region.slug}/${dept.slug}/${c.slug}/" class="link-item">
        ${escHtml(c.nom)}${c.population ? ' (' + Math.round(c.population/1000) + 'k hab.)' : ''} <span class="arrow">→</span>
      </a>`).join('')}
    </div>` : ''}

    <h2>Services de couverture</h2>
    <div class="grid-2" style="margin-top:1rem">
      ${linkedServices.map(s => `
      <a href="/services/${s.slug}/" class="link-item">${escHtml(s.nom)} <span class="arrow">→</span></a>`).join('')}
    </div>

    ${dept.departementsProches && dept.departementsProches.length > 0 ? `
    <h2>Départements proches</h2>
    <div class="link-grid">
      ${dept.departementsProches.map(d2 => {
        const r2 = regionByCode.get(departements.find(x => x.code === d2.code)?.codeRegion);
        return r2 ? `<a href="/couvreur/${r2.slug}/${d2.slug}/" class="link-item">${escHtml(d2.nom)} <span class="arrow">→</span></a>` : '';
      }).join('')}
    </div>` : ''}

    <p style="margin-top:1.5rem"><a href="/couvreur/${region.slug}/" class="link-item" style="display:inline-flex">← Couvreur en ${escHtml(region.nom)}</a></p>

    ${faqHtml(faqs)}
  </div>
  <div class="sidebar">
    ${quoteFormHtml(dept.nom)}
  </div>
</div>
</section>`;

    const schemas = [serviceSchema(dept.nom), faqSchema(faqs)].filter(Boolean).join('</script>\n<script type="application/ld+json">');
    writePage(url, layout(title, desc, url,
      [{ label: 'Accueil', url: '/' }, { label: region.nom, url: `/couvreur/${region.slug}/` }, { label: `${dept.nom} (${dept.code})`, url }],
      body, schemas));
  }
}

// ---------------------
// Generate: City pages
// ---------------------
function buildCityPages() {
  const pb = enrichment.prixBase;

  for (const commune of communes) {
    const dept = deptByCode.get(commune.codeDepartement);
    const region = regionByCode.get(commune.codeRegion);
    if (!dept || !region) continue;

    const url = `/couvreur/${region.slug}/${dept.slug}/${commune.slug}/`;
    const nom = commune.nom;
    const cp = commune.codePostal || dept.code;
    const pop = commune.population || 0;

    // Enrichment data
    const coeff = getPrixCoeff(region.code);
    const climat = getClimatZone(region.code);
    const materiaux = getMateriaux(region.code);
    const villeCat = getVilleCategorie(pop);
    const deptDetail = getDeptDetail(dept.code);
    const prep = getDeptPrep(dept);

    const title = `Couvreur ${nom} (${cp}) — Devis Gratuit (2026)`;
    const desc = `Couvreur à ${nom} (${dept.nom}) : comparez 3 devis gratuits d'artisans certifiés. Prix, avis et intervention rapide. 100 % gratuit, sans engagement.`;

    // Deterministic service selection based on commune slug hash
    const hash = commune.slug.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const linkedServices = [...services].sort((a, b) => (a.slug.charCodeAt(0) + hash) - (b.slug.charCodeAt(0) + hash)).slice(0, 5);
    const nearbyStr = (commune.villesProches || []).slice(0, 8);

    // Population-aware intro text
    const popText = pop >= 200000
      ? `${nom}, avec ses ${pop.toLocaleString('fr-FR')} habitants, est une grande métropole où le marché de la couverture est très concurrentiel.`
      : pop >= 100000
      ? `Avec ${pop.toLocaleString('fr-FR')} habitants, ${nom} offre un large choix de couvreurs qualifiés pour vos travaux de toiture.`
      : pop >= 30000
      ? `${nom} (${pop.toLocaleString('fr-FR')} habitants) bénéficie d'un tissu artisanal local solide, avec des couvreurs connaissant les spécificités de votre commune.`
      : pop >= 10000
      ? `À ${nom} (${pop.toLocaleString('fr-FR')} habitants), les couvreurs locaux et des communes voisines assurent un suivi personnalisé de vos travaux de toiture.`
      : pop > 0
      ? `Les couvreurs intervenant à ${nom} (${pop.toLocaleString('fr-FR')} habitants) se déplacent depuis les villes voisines du département.`
      : `Les couvreurs intervenant à ${nom} couvrent votre commune et ses environs.`;

    // Dept-specific text (if available)
    const deptSpecText = deptDetail ? `<p>${deptDetail.specificites}</p>` : '';

    // Climate-adapted FAQs
    const faqs = [
      { question: `Combien coûte un couvreur à ${nom} ?`, reponse: `À ${nom} (${cp}), les tarifs couvreur tiennent compte du marché local ${prep}. Comptez ${formatPrix(pb.reparation, coeff)} pour une réparation, ${formatPrix(pb.renovation, coeff)} pour une rénovation complète, et ${formatPrix(pb.demoussage, coeff)} pour un démoussage. Le matériau dominant (${materiaux.principal.toLowerCase()}) influence également le budget.` },
      { question: `Quels matériaux de toiture à ${nom} ?`, reponse: `${prep.charAt(0).toUpperCase() + prep.slice(1)}, les toitures sont principalement en ${materiaux.principal.toLowerCase()}. ${materiaux.plu} Consultez le PLU de ${nom} avant d'engager des travaux modifiant l'aspect extérieur.` },
      { question: `Comment trouver un bon couvreur à ${nom} ?`, reponse: `Pour trouver un couvreur fiable à ${nom}, vérifiez l'assurance décennale, la certification RGE et demandez des références locales. ${villeCat.detail} Comparez au moins 3 devis avant de vous engager.` },
      { question: `Quels risques climatiques pour les toitures à ${nom} ?`, reponse: `${nom} se situe en zone climatique ${climat.code} (${climat.label}). ${climat.description.split('.')[0]}. Les principaux risques sont : ${climat.risques.join(', ')}. ${climat.isolation}.` },
    ];

    const body = `
<section class="hero">
<div class="container hero-inner">
  <div>
    <h1>Couvreur à <span>${escHtml(nom)}</span> (${cp}) — Devis Gratuit</h1>
    <p>Vous recherchez un couvreur à ${escHtml(nom)} ${prep !== 'à ' + nom ? `(${escHtml(dept.nom)})` : ''} ? Comparez gratuitement jusqu'à 3 devis de couvreurs qualifiés pour vos travaux de toiture. Matériau local : ${materiaux.principal.toLowerCase()}.</p>
    <div class="trust-badges">
      <div class="trust-badge"><div class="icon">✓</div> Artisans ${prep}</div>
      <div class="trust-badge"><div class="icon">✓</div> Devis gratuit 48h</div>
      <div class="trust-badge"><div class="icon">✓</div> Garantie décennale</div>
    </div>
  </div>
  ${quoteFormHtml(nom)}
</div>
</section>

<section class="section">
<div class="container page-layout">
  <div class="content-area">
    <h2>Couvreur à ${escHtml(nom)} : votre toiture entre de bonnes mains</h2>
    <p>${popText} Les professionnels maîtrisent les spécificités des toitures en ${materiaux.principal.toLowerCase()}, matériau dominant ${prep}.</p>
    ${deptSpecText}
    <p>En zone climatique <strong>${climat.code} (${climat.label})</strong>, les toitures à ${escHtml(nom)} sont exposées aux risques de ${climat.risques.slice(0, 2).join(' et ')}. ${climat.isolation}.</p>

    <h2>Prix couvreur à ${escHtml(nom)} — Tarifs ${new Date().getFullYear()}</h2>
    <table class="price-table">
      <thead><tr><th>Prestation</th><th>Prix à ${escHtml(nom)}</th></tr></thead>
      <tbody>
        <tr><td>Réparation de toiture</td><td>${formatPrix(pb.reparation, coeff)}</td></tr>
        <tr><td>Rénovation complète</td><td>${formatPrix(pb.renovation, coeff)}</td></tr>
        <tr><td>Démoussage et nettoyage</td><td>${formatPrix(pb.demoussage, coeff)}</td></tr>
        <tr><td>Isolation de toiture</td><td>${formatPrix(pb.isolation, coeff)}</td></tr>
        <tr><td>Pose de Velux</td><td>${formatPrix(pb.velux, coeff)}</td></tr>
        <tr><td>Zinguerie (gouttières)</td><td>${formatPrix(pb.zinguerie, coeff)}</td></tr>
        <tr><td>Toiture neuve (${materiaux.principal.split(' ')[0].toLowerCase()})</td><td>${formatPrix(pb.toiture_neuve_tuile, coeff)}</td></tr>
      </tbody>
    </table>
    <p><em>Prix indicatifs à ${escHtml(nom)} (coefficient régional ${coeff.toFixed(2)}). Demandez vos devis pour un chiffrage adapté à votre projet.</em></p>

    <h2>Matériaux de toiture à ${escHtml(nom)}</h2>
    <p>${materiaux.detail}</p>
    <p><strong>Réglementation locale :</strong> ${materiaux.plu}</p>

    <h2>Services de couverture à ${escHtml(nom)}</h2>
    <div class="grid-2" style="margin-top:1rem">
      ${linkedServices.map(s => `
      <a href="/services/${s.slug}/" class="link-item">${escHtml(s.nom)} <span class="arrow">→</span></a>`).join('')}
    </div>

    ${nearbyStr.length > 0 ? `
    <h2>Couvreurs dans les villes proches de ${escHtml(nom)}</h2>
    <div class="link-grid">
      ${nearbyStr.map(v => `
      <a href="/couvreur/${region.slug}/${dept.slug}/${v.slug}/" class="link-item">
        Couvreur à ${escHtml(v.nom)} <span class="arrow">→</span>
      </a>`).join('')}
    </div>` : ''}

    <h2>Couvreur ${prep} : votre département et votre région</h2>
    <div style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:.75rem">
      <a href="/couvreur/${region.slug}/${dept.slug}/" class="link-item" style="display:inline-flex">
        ← Couvreur ${prep} (${dept.code})
      </a>
      <a href="/couvreur/${region.slug}/" class="link-item" style="display:inline-flex">
        ← Couvreur en ${escHtml(region.nom)}
      </a>
    </div>

    ${faqHtml(faqs)}
  </div>
  <div class="sidebar">
    ${quoteFormHtml(nom)}
  </div>
</div>
</section>

${howItWorksHtml()}

${ctaBannerHtml(nom)}`;

    const schemas = [serviceSchema(nom), faqSchema(faqs)].filter(Boolean).join('</script>\n<script type="application/ld+json">');
    writePage(url, layout(title, desc, url,
      [
        { label: 'Accueil', url: '/' },
        { label: region.nom, url: `/couvreur/${region.slug}/` },
        { label: `${dept.nom} (${dept.code})`, url: `/couvreur/${region.slug}/${dept.slug}/` },
        { label: nom, url }
      ],
      body, schemas));
  }
}

// ---------------------
// Generate: Service index page
// ---------------------
function buildServiceIndexPage() {
  const url = '/services/';
  const title = 'Services Couvreur — Réparation, Rénovation, Démoussage (2026)';
  const desc = 'Tous nos services de couverture : réparation, rénovation, démoussage, isolation, zinguerie, Velux, charpente. Devis gratuit en ligne, artisans certifiés.';
  const pb = enrichment.prixBase;

  const body = `
<section class="hero">
<div class="container hero-inner">
  <div>
    <h1>Services de <span>Couverture</span> — Devis Gratuit</h1>
    <p>Quel que soit votre besoin en toiture, nos artisans couvreurs qualifiés interviennent partout en France. Réparation, rénovation complète, démoussage, isolation, zinguerie ou urgence : comparez jusqu'à 3 devis gratuits.</p>
    <div class="trust-badges">
      <div class="trust-badge"><div class="icon">✓</div> 13 services</div>
      <div class="trust-badge"><div class="icon">✓</div> Artisans certifiés RGE</div>
      <div class="trust-badge"><div class="icon">✓</div> Devis gratuit 48h</div>
    </div>
  </div>
  ${quoteFormHtml()}
</div>
</section>

<section class="section">
<div class="container page-layout">
  <div class="content-area">
    <h2>Tous nos services de couverture</h2>
    <div class="link-grid">
      ${services.map(s => `
      <a href="/services/${s.slug}/" class="link-item" style="flex-direction:column;align-items:flex-start;gap:.25rem">
        <strong>${escHtml(s.nom)}</strong>
        <span style="font-size:.85rem;color:var(--gray-500)">${escHtml(s.description.slice(0, 100))}...</span>
      </a>`).join('')}
    </div>

    <h2>Prix indicatifs par prestation</h2>
    <table class="price-table">
      <thead><tr><th>Prestation</th><th>Prix moyen France</th></tr></thead>
      <tbody>
        <tr><td>Réparation de toiture</td><td>${pb.reparation.min} — ${pb.reparation.max} ${pb.reparation.unite}</td></tr>
        <tr><td>Rénovation complète</td><td>${pb.renovation.min} — ${pb.renovation.max} ${pb.renovation.unite}</td></tr>
        <tr><td>Démoussage et nettoyage</td><td>${pb.demoussage.min} — ${pb.demoussage.max} ${pb.demoussage.unite}</td></tr>
        <tr><td>Isolation de toiture</td><td>${pb.isolation.min} — ${pb.isolation.max} ${pb.isolation.unite}</td></tr>
        <tr><td>Pose de Velux</td><td>${pb.velux.min} — ${pb.velux.max} ${pb.velux.unite}</td></tr>
        <tr><td>Zinguerie (gouttières)</td><td>${pb.zinguerie.min} — ${pb.zinguerie.max} ${pb.zinguerie.unite}</td></tr>
        <tr><td>Charpente</td><td>${pb.charpente.min} — ${pb.charpente.max} ${pb.charpente.unite}</td></tr>
        <tr><td>Toiture neuve tuile</td><td>${pb.toiture_neuve_tuile.min} — ${pb.toiture_neuve_tuile.max} ${pb.toiture_neuve_tuile.unite}</td></tr>
        <tr><td>Toiture neuve ardoise</td><td>${pb.toiture_neuve_ardoise.min} — ${pb.toiture_neuve_ardoise.max} ${pb.toiture_neuve_ardoise.unite}</td></tr>
        <tr><td>Toiture neuve zinc</td><td>${pb.toiture_neuve_zinc.min} — ${pb.toiture_neuve_zinc.max} ${pb.toiture_neuve_zinc.unite}</td></tr>
      </tbody>
    </table>
    <p><em>Prix moyens constatés en France. Les tarifs varient de -15% à +35% selon votre région. <a href="/guide/prix-toiture-m2/">Consultez notre guide prix complet</a>.</em></p>

    <h2>Trouvez un couvreur par région</h2>
    <div class="link-grid">
      ${regions.filter(r => !r.code.startsWith('0')).map(r => `
      <a href="/couvreur/${r.slug}/" class="link-item">Couvreur en ${escHtml(r.nom)} <span class="arrow">→</span></a>`).join('')}
    </div>

    <h2>Nos guides pratiques</h2>
    <div class="link-grid">
      ${guides.map(g => `
      <a href="/guide/${g.slug}/" class="link-item">${escHtml(g.titre.split('—')[0].trim())} <span class="arrow">→</span></a>`).join('')}
    </div>
  </div>
  <div class="sidebar">
    ${quoteFormHtml()}
  </div>
</div>
</section>`;

  const schema = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "WebPage",
    "name": "Services de Couverture",
    "description": desc,
    "url": SITE_URL + url
  });
  writePage(url, layout(title, desc, url,
    [{ label: 'Accueil', url: '/' }, { label: 'Services', url }],
    body, schema));
}

// ---------------------
// Generate: Service pages
// ---------------------
function buildServicePages() {
  const pb = enrichment.prixBase;

  // Map service slugs to prixBase keys
  const prixMap = {
    'reparation-toiture': 'reparation',
    'renovation-toiture': 'renovation',
    'nettoyage-toiture': 'demoussage',
    'isolation-toiture': 'isolation',
    'pose-velux': 'velux',
    'zinguerie': 'zinguerie',
    'charpente': 'charpente',
    'toiture-tuile': 'toiture_neuve_tuile',
    'toiture-ardoise': 'toiture_neuve_ardoise',
    'toiture-zinc': 'toiture_neuve_zinc',
  };

  for (const service of services) {
    const url = `/services/${service.slug}/`;
    const title = `${service.titre} — Prix et Devis Gratuit (2026)`;
    const desc = `${service.description.slice(0, 130)}${service.description.length > 130 ? '...' : ''} Comparez 3 devis gratuits.`;
    const c = service.contenu;

    // All regions for geo links
    const allRegions = regions.filter(r => !r.code.startsWith('0'));
    const otherServices = services.filter(s => s.slug !== service.slug).slice(0, 6);

    // Regional price table for this specific service
    const basePrixKey = prixMap[service.slug];
    const basePrix = basePrixKey ? pb[basePrixKey] : null;

    // Top cities for this service (pick 1 from each of 8 top regions)
    const topRegionCodes = ['11', '93', '84', '75', '44', '53', '32', '76'];
    const topCities = topRegionCodes.map(rc => {
      const r = regionByCode.get(rc);
      if (!r) return null;
      const depts = departements.filter(d => d.codeRegion === rc);
      for (const d of depts) {
        const cs = communesByDept.get(d.code);
        if (cs && cs.length > 0) {
          const biggest = cs.sort((a, b) => (b.population || 0) - (a.population || 0))[0];
          return { nom: biggest.nom, url: `/couvreur/${r.slug}/${deptByCode.get(biggest.codeDepartement)?.slug}/${biggest.slug}/`, region: r.nom };
        }
      }
      return null;
    }).filter(Boolean);

    const body = `
<section class="hero">
<div class="container hero-inner">
  <div>
    <h1>${escHtml(service.titre)} — <span>Devis Gratuit</span></h1>
    <p>${escHtml(c.intro)}</p>
    <div class="trust-badges">
      <div class="trust-badge"><div class="icon">✓</div> Artisans certifiés RGE</div>
      <div class="trust-badge"><div class="icon">✓</div> Devis gratuit 48h</div>
      <div class="trust-badge"><div class="icon">✓</div> Garantie décennale</div>
    </div>
  </div>
  ${quoteFormHtml()}
</div>
</section>

<section class="section">
<div class="container page-layout">
  <div class="content-area">
    ${c.sections.map(s => `
    <h2>${escHtml(s.h2)}</h2>
    <p>${escHtml(s.texte)}</p>`).join('')}

    ${basePrix ? `
    <h2>Prix ${escHtml(service.nom.toLowerCase())} par région</h2>
    <table class="price-table">
      <thead><tr><th>Région</th><th>Prix indicatif</th></tr></thead>
      <tbody>
        ${allRegions.slice(0, 10).map(r => {
          const coeff = getPrixCoeff(r.code);
          return `<tr><td><a href="/couvreur/${r.slug}/">${escHtml(r.nom)}</a></td><td>${formatPrix(basePrix, coeff)}</td></tr>`;
        }).join('\n        ')}
      </tbody>
    </table>
    <p><em>Les prix varient selon la région, le matériau local et la complexité du chantier. Demandez vos devis pour un chiffrage précis.</em></p>` : ''}

    <h2>${escHtml(service.nom)} dans les grandes villes</h2>
    <div class="link-grid">
      ${topCities.map(c => `
      <a href="${c.url}" class="link-item">${escHtml(service.nom)} à ${escHtml(c.nom)} <span class="arrow">→</span></a>`).join('')}
    </div>

    <h2>Demandez un devis par région</h2>
    <div class="link-grid">
      ${allRegions.map(r => `
      <a href="/couvreur/${r.slug}/" class="link-item">
        ${escHtml(service.nom)} en ${escHtml(r.nom)} <span class="arrow">→</span>
      </a>`).join('')}
    </div>

    <h2>Autres services de couverture</h2>
    <div class="link-grid">
      ${otherServices.map(s => `
      <a href="/services/${s.slug}/" class="link-item">
        ${escHtml(s.nom)} <span class="arrow">→</span>
      </a>`).join('')}
    </div>

    ${faqHtml(c.faq)}
  </div>
  <div class="sidebar">
    ${quoteFormHtml()}
  </div>
</div>
</section>`;

    const schema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Service",
      "name": service.titre,
      "description": service.description,
      "serviceType": service.nom,
      "areaServed": { "@type": "Country", "name": "France" },
      "provider": { "@type": "Organization", "name": SITE_NAME, "url": SITE_URL }
    });
    const schemas = [schema, faqSchema(c.faq)].filter(Boolean).join('</script>\n<script type="application/ld+json">');

    writePage(url, layout(title, desc, url,
      [{ label: 'Accueil', url: '/' }, { label: 'Services', url: '/services/' }, { label: service.nom, url }],
      body, schemas));
  }
}

// ---------------------
// Generate: Guide index page
// ---------------------
function buildGuideIndexPage() {
  const url = '/guide/';
  const title = 'Guides Toiture — Prix, Conseils et Aides 2026';
  const desc = 'Guides pratiques toiture : prix au m², comment choisir un couvreur, aides financières (MaPrimeRénov\'), entretien, matériaux. Conseils d\'experts.';

  const body = `
<section class="hero">
<div class="container hero-inner">
  <div>
    <h1>Guides <span>Toiture</span> — Conseils d'Experts</h1>
    <p>Retrouvez tous nos guides pratiques pour vos travaux de toiture. Prix, matériaux, réglementations, aides financières : des informations fiables pour préparer votre projet.</p>
    <div class="trust-badges">
      <div class="trust-badge"><div class="icon">✓</div> ${guides.length} guides complets</div>
      <div class="trust-badge"><div class="icon">✓</div> Mis à jour 2026</div>
      <div class="trust-badge"><div class="icon">✓</div> Conseils d'experts</div>
    </div>
  </div>
  ${quoteFormHtml()}
</div>
</section>

<section class="section">
<div class="container page-layout">
  <div class="content-area">
    <h2>Tous nos guides toiture</h2>
    <div class="link-grid">
      ${guides.map(g => `
      <a href="/guide/${g.slug}/" class="link-item" style="flex-direction:column;align-items:flex-start;gap:.25rem">
        <strong>${escHtml(g.titre.split('—')[0].trim())}</strong>
        <span style="font-size:.85rem;color:var(--gray-500)">${escHtml(g.metaDescription.slice(0, 120))}...</span>
      </a>`).join('')}
    </div>

    <h2>Nos services de couverture</h2>
    <div class="link-grid">
      ${services.slice(0, 8).map(s => `
      <a href="/services/${s.slug}/" class="link-item">${escHtml(s.nom)} <span class="arrow">→</span></a>`).join('')}
    </div>

    <h2>Trouvez un couvreur par région</h2>
    <div class="link-grid">
      ${regions.filter(r => !r.code.startsWith('0')).slice(0, 10).map(r => `
      <a href="/couvreur/${r.slug}/" class="link-item">Couvreur en ${escHtml(r.nom)} <span class="arrow">→</span></a>`).join('')}
    </div>
  </div>
  <div class="sidebar">
    ${quoteFormHtml()}
  </div>
</div>
</section>`;

  writePage(url, layout(title, desc, url,
    [{ label: 'Accueil', url: '/' }, { label: 'Guides', url }],
    body));
}

// ---------------------
// Generate: Guide pages
// ---------------------
function buildGuidePages() {
  for (const guide of guides) {
    const url = `/guide/${guide.slug}/`;
    const title = `${guide.titre} — Guide Complet (2026)`;
    const desc = guide.metaDescription;
    const c = guide.contenu;

    const otherGuides = guides.filter(g => g.slug !== guide.slug);
    // Link to relevant services
    const relatedServices = services.slice(0, 4);

    const body = `
<section class="hero" style="padding:2rem 0">
<div class="container">
  <div class="updated-badge">📅 Mis à jour en mars 2026</div>
  <h1 style="font-size:2rem">${escHtml(guide.titre)}</h1>
  <p style="color:var(--gray-300);margin-top:.5rem">${escHtml(guide.metaDescription)}</p>
</div>
</section>

<section class="section">
<div class="container page-layout">
  <div class="content-area">
    <p><strong>${escHtml(c.intro)}</strong></p>

    ${c.sections.map(s => {
      // Support optional sous-sections (h3 array)
      let html = `\n    <h2>${escHtml(s.h2)}</h2>\n    <p>${escHtml(s.texte)}</p>`;
      if (s.sousSections) {
        html += s.sousSections.map(ss => `\n    <h3>${escHtml(ss.h3)}</h3>\n    <p>${escHtml(ss.texte)}</p>`).join('');
      }
      return html;
    }).join('')}

    ${faqHtml(c.faq)}

    <h2 style="margin-top:2.5rem">Services associés</h2>
    <div class="grid-2" style="margin-top:1rem">
      ${relatedServices.map(s => `
      <a href="/services/${s.slug}/" class="link-item">${escHtml(s.nom)} <span class="arrow">→</span></a>`).join('')}
    </div>

    <h2>Autres guides utiles</h2>
    <div class="link-grid">
      ${otherGuides.map(g => `
      <a href="/guide/${g.slug}/" class="link-item">
        ${escHtml(g.titre.split('—')[0].trim())} <span class="arrow">→</span>
      </a>`).join('')}
    </div>
  </div>
  <div class="sidebar">
    ${quoteFormHtml()}
  </div>
</div>
</section>

${ctaBannerHtml()}`;

    const articleSchema = JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Article",
      "headline": guide.titre,
      "description": guide.metaDescription,
      "author": { "@type": "Organization", "name": SITE_NAME },
      "publisher": { "@type": "Organization", "name": SITE_NAME },
      "datePublished": "2026-03-30",
      "dateModified": "2026-03-30"
    });
    const schemas = [articleSchema, faqSchema(c.faq)].filter(Boolean).join('</script>\n<script type="application/ld+json">');

    writePage(url, layout(title, desc, url,
      [{ label: 'Accueil', url: '/' }, { label: 'Guides', url: '/guide/' }, { label: guide.titre.split('—')[0].trim(), url }],
      body, schemas));
  }
}

// ---------------------
// Generate: Legal pages
// ---------------------
function buildLegalPages() {
  const pages = [
    {
      slug: 'mentions-legales',
      title: 'Mentions Légales',
      content: `<h2>Éditeur du site</h2><p>${SITE_NAME}<br>Site internet : ${SITE_URL}</p><h2>Hébergement</h2><p>Ce site est hébergé par un prestataire professionnel garantissant la sécurité et la disponibilité du service.</p><h2>Propriété intellectuelle</h2><p>L'ensemble du contenu de ce site (textes, images, graphismes) est protégé par le droit d'auteur. Toute reproduction est interdite sans autorisation préalable.</p><h2>Responsabilité</h2><p>${SITE_NAME} s'efforce de fournir des informations exactes et à jour mais ne peut garantir l'absence d'erreurs. Les prix indiqués sont donnés à titre indicatif.</p>`
    },
    {
      slug: 'politique-confidentialite',
      title: 'Politique de Confidentialité',
      content: `<h2>Données collectées</h2><p>Nous collectons les données que vous nous transmettez via le formulaire de devis : nom, email, ville et description du projet. Ces données sont utilisées exclusivement pour vous mettre en relation avec des couvreurs qualifiés.</p><h2>Utilisation des données</h2><p>Vos données sont transmises aux artisans couvreurs de votre secteur géographique afin qu'ils puissent vous contacter et vous proposer un devis. Nous ne vendons pas vos données à des tiers.</p><h2>Durée de conservation</h2><p>Vos données sont conservées pendant 3 ans maximum à compter de votre dernière interaction avec notre service.</p><h2>Vos droits</h2><p>Conformément au RGPD, vous disposez d'un droit d'accès, de rectification, de suppression et de portabilité de vos données. Contactez-nous pour exercer ces droits.</p><h2>Cookies</h2><p>Ce site utilise des cookies techniques nécessaires au fonctionnement du service et des cookies analytiques pour mesurer l'audience. Vous pouvez paramétrer votre navigateur pour refuser les cookies.</p>`
    }
  ];

  for (const page of pages) {
    const url = `/${page.slug}/`;
    const body = `
<section class="section">
<div class="container">
  <div class="content-area" style="max-width:800px;margin:0 auto">
    <h1>${page.title}</h1>
    ${page.content}
  </div>
</div>
</section>`;

    writePage(url, layout(`${page.title} | ${SITE_NAME}`, page.title, url,
      [{ label: 'Accueil', url: '/' }, { label: page.title, url }],
      body));
  }
}

// ---------------------
// Generate: 404 page
// ---------------------
function build404Page() {
  const body = `
<section class="section" style="padding:4rem 0;text-align:center">
<div class="container">
  <div style="font-size:5rem;margin-bottom:1rem;color:var(--primary)">404</div>
  <h1 style="font-size:2rem;margin-bottom:1rem">Page introuvable</h1>
  <p style="color:var(--gray-500);max-width:500px;margin:0 auto 2rem">La page que vous recherchez n'existe pas ou a été déplacée. Retrouvez un couvreur qualifié en utilisant les liens ci-dessous.</p>

  <div style="display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;margin-bottom:3rem">
    <a href="/" class="btn-primary" style="display:inline-flex;text-decoration:none">Retour à l'accueil</a>
    <a href="/services/" class="link-item" style="display:inline-flex">Nos services</a>
    <a href="/guide/" class="link-item" style="display:inline-flex">Nos guides</a>
  </div>

  <h2>Trouvez un couvreur par région</h2>
  <div class="link-grid" style="max-width:800px;margin:1rem auto 0">
    ${regions.filter(r => !r.code.startsWith('0')).map(r => `
    <a href="/couvreur/${r.slug}/" class="link-item">Couvreur en ${escHtml(r.nom)} <span class="arrow">→</span></a>`).join('')}
  </div>
</div>
</section>`;

  const html = layout('Page introuvable | ' + SITE_NAME, 'La page demandée n\'existe pas.', '/404.html',
    [{ label: 'Accueil', url: '/' }, { label: '404', url: '/404.html' }],
    body);
  writeFileSync(join(DIST, '404.html'), html);
  console.log('  📄 404.html');
}

function buildMerciPage() {
  const body = `
<section class="section" style="padding:4rem 0;text-align:center">
<div class="container">
  <div style="font-size:4rem;margin-bottom:1rem;color:#27ae60">✓</div>
  <h1 style="font-size:2rem;margin-bottom:1rem">Demande envoyée avec succès !</h1>
  <p style="color:var(--gray-500);max-width:550px;margin:0 auto 2rem">Merci pour votre demande de devis. Vous recevrez jusqu'à 3 propositions de couvreurs qualifiés sous 48 heures.</p>
  <a href="/" class="btn-primary" style="display:inline-flex;text-decoration:none">Retour à l'accueil</a>
</div>
</section>`;

  const html = layout('Demande envoyée | ' + SITE_NAME, 'Votre demande de devis couvreur a bien été envoyée.', '/merci.html',
    [{ label: 'Accueil', url: '/' }, { label: 'Confirmation', url: '/merci.html' }],
    body);
  writeFileSync(join(DIST, 'merci.html'), html);
  console.log('  📄 merci.html');
}

// ---------------------
// Generate: Sitemap, Robots, llms.txt
// ---------------------
function buildSitemap() {
  const today = '2026-03-30';

  // Exclude legal pages from sitemap (they are noindex)
  const sitemapUrls = allUrls.filter(u => !u.startsWith('/mentions-legales') && !u.startsWith('/politique-confidentialite'));

  const entries = sitemapUrls.map(url => {
    let priority = '0.5';
    let changefreq = 'monthly';
    if (url === '/') { priority = '1.0'; changefreq = 'daily'; }
    else if (url.startsWith('/services/') && url.split('/').filter(Boolean).length === 1) { priority = '0.9'; changefreq = 'weekly'; }
    else if (url.split('/').filter(Boolean).length === 2 && url.startsWith('/couvreur/')) { priority = '0.9'; changefreq = 'weekly'; }
    else if (url.startsWith('/couvreur/') && url.split('/').filter(Boolean).length === 3) { priority = '0.8'; changefreq = 'weekly'; }
    else if (url.startsWith('/couvreur/')) { priority = '0.7'; changefreq = 'monthly'; }
    else if (url.startsWith('/services/')) { priority = '0.8'; changefreq = 'monthly'; }
    else if (url.startsWith('/guide/')) { priority = '0.7'; changefreq = 'monthly'; }
    return `  <url>
    <loc>${SITE_URL}${url}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
  });

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.join('\n')}
</urlset>`;

  writeFileSync(join(DIST, 'sitemap.xml'), sitemap);
  console.log(`  📄 sitemap.xml (${sitemapUrls.length} URLs)`);

  // Robots.txt — enrichi
  const robots = `User-agent: *
Allow: /
Disallow: /mentions-legales/
Disallow: /politique-confidentialite/

# Crawl budget optimization
Crawl-delay: 1

Sitemap: ${SITE_URL}/sitemap.xml

# AI crawlers welcome
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Googlebot
Allow: /`;
  writeFileSync(join(DIST, 'robots.txt'), robots);
  console.log('  📄 robots.txt');

  // llms.txt — GEO optimization for AI crawlers
  const llmsTxt = `# ${SITE_NAME}
> Plateforme de mise en relation avec des couvreurs qualifiés partout en France. Comparez jusqu'à 3 devis gratuits pour tous vos travaux de toiture.

## Services de couverture
${services.map(s => `- [${s.nom}](${SITE_URL}/services/${s.slug}/): ${s.description}`).join('\n')}

## Guides pratiques
${guides.map(g => `- [${g.titre.split('—')[0].trim()}](${SITE_URL}/guide/${g.slug}/): ${g.metaDescription}`).join('\n')}

## Couverture géographique
${regions.filter(r => !r.code.startsWith('0')).map(r => `- [Couvreur en ${r.nom}](${SITE_URL}/couvreur/${r.slug}/)`).join('\n')}

## Informations clés
- Prix moyen toiture France : 60-200 €/m² selon le matériau
- Matériaux : tuile terre cuite, ardoise naturelle, zinc, bac acier
- 101 départements couverts, plus de 2200 communes
- Artisans certifiés RGE avec assurance décennale
- Devis gratuit et sans engagement sous 48h
`;
  writeFileSync(join(DIST, 'llms.txt'), llmsTxt);
  console.log('  📄 llms.txt');
}

// ---------------------
// Copy assets
// ---------------------
function copyAssets() {
  const srcAssets = join(SRC, 'assets');
  const distAssets = join(DIST, 'assets');
  cpSync(srcAssets, distAssets, { recursive: true });
  console.log('  📁 Assets copiés');
}

// ---------------------
// Main build
// ---------------------
(async () => {
  console.log('🏗️  Build du site Couvreur Devis\n');

  // Clean dist
  const { rmSync } = await import('fs');
  if (existsSync(DIST)) {
    rmSync(DIST, { recursive: true });
  }
  mkdirSync(DIST, { recursive: true });

  console.log('📄 Génération des pages...');

  const t0 = Date.now();

  buildHomepage();
  console.log('  ✓ Accueil');

  buildRegionPages();
  console.log(`  ✓ ${regions.length} pages régions`);

  buildDepartmentPages();
  console.log(`  ✓ ${departements.length} pages départements`);

  buildCityPages();
  console.log(`  ✓ ${communes.length} pages villes`);

  buildServiceIndexPage();
  buildServicePages();
  console.log(`  ✓ ${services.length + 1} pages services (index + ${services.length})`);

  buildGuideIndexPage();
  buildGuidePages();
  console.log(`  ✓ ${guides.length + 1} pages guides (index + ${guides.length})`);

  buildLegalPages();
  build404Page();
  buildMerciPage();
  console.log('  ✓ Pages légales + 404 + merci');

  console.log('\n📦 Assets et fichiers techniques...');
  copyAssets();
  buildSitemap();

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Build terminé en ${elapsed}s`);
  console.log(`📊 Total : ${allUrls.length} pages générées`);
  console.log(`📂 Output : ${DIST}`);
})();
