/**
 * Récupère les données géographiques depuis l'API geo.api.gouv.fr
 * et les sauvegarde en JSON pour la génération du site.
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'src', 'data');

function slugify(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

async function fetchRegions() {
  console.log('📍 Récupération des régions...');
  const raw = await fetchJSON('https://geo.api.gouv.fr/regions');

  const regions = raw
    .filter(r => r.code !== 'COM') // Exclure les collectivités d'outre-mer spéciales
    .map(r => ({
      code: r.code,
      nom: r.nom,
      slug: slugify(r.nom),
    }));

  console.log(`  ✓ ${regions.length} régions récupérées`);
  return regions;
}

async function fetchDepartements() {
  console.log('📍 Récupération des départements...');
  const raw = await fetchJSON('https://geo.api.gouv.fr/departements');

  const departements = raw.map(d => ({
    code: d.code,
    nom: d.nom,
    slug: slugify(d.nom),
    codeRegion: d.codeRegion,
  }));

  console.log(`  ✓ ${departements.length} départements récupérés`);
  return departements;
}

async function fetchCommunes(minPopulation = 5000) {
  console.log(`📍 Récupération des communes (population >= ${minPopulation})...`);

  // L'API geo.api.gouv.fr permet de filtrer par champs
  const url = `https://geo.api.gouv.fr/communes?fields=nom,code,codesPostaux,codeDepartement,codeRegion,population,centre&format=json`;
  const raw = await fetchJSON(url);

  // Filtrer par population
  const communes = raw
    .filter(c => c.population && c.population >= minPopulation)
    .map(c => ({
      code: c.code,
      nom: c.nom,
      slug: slugify(c.nom),
      codePostal: c.codesPostaux?.[0] || '',
      codeDepartement: c.codeDepartement,
      codeRegion: c.codeRegion,
      population: c.population || 0,
      lat: c.centre?.coordinates?.[1] || null,
      lon: c.centre?.coordinates?.[0] || null,
    }))
    .sort((a, b) => b.population - a.population);

  console.log(`  ✓ ${communes.length} communes récupérées (>= ${minPopulation} hab.)`);
  return communes;
}

// Calcul de distance entre deux points GPS (formule de Haversine)
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function enrichData(regions, departements, communes) {
  console.log('🔧 Enrichissement des données...');

  // Map region code -> region
  const regionMap = new Map(regions.map(r => [r.code, r]));

  // Attacher les départements aux régions
  for (const r of regions) {
    r.departements = departements
      .filter(d => d.codeRegion === r.code)
      .map(d => d.code);
  }

  // Map département code -> département
  const deptMap = new Map(departements.map(d => [d.code, d]));

  // Attacher nom/slug de la région aux départements
  for (const d of departements) {
    const region = regionMap.get(d.codeRegion);
    d.regionNom = region?.nom || '';
    d.regionSlug = region?.slug || '';
    d.communes = communes
      .filter(c => c.codeDepartement === d.code)
      .map(c => c.code);
  }

  // Attacher infos parent aux communes + calculer villes proches
  for (const c of communes) {
    const dept = deptMap.get(c.codeDepartement);
    c.departementNom = dept?.nom || '';
    c.departementSlug = dept?.slug || '';
    c.regionNom = dept?.regionNom || '';
    c.regionSlug = dept?.regionSlug || '';
    c.codeRegion = dept?.codeRegion || c.codeRegion;
  }

  // Calculer les villes proches pour chaque commune (même département, max 10)
  console.log('  📐 Calcul des villes proches...');
  for (const c of communes) {
    if (!c.lat || !c.lon) {
      c.villesProches = [];
      continue;
    }
    const sameDept = communes.filter(
      v => v.codeDepartement === c.codeDepartement && v.code !== c.code && v.lat && v.lon
    );
    c.villesProches = sameDept
      .map(v => ({
        code: v.code,
        nom: v.nom,
        slug: v.slug,
        distance: haversineDistance(c.lat, c.lon, v.lat, v.lon),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 10)
      .map(v => ({ code: v.code, nom: v.nom, slug: v.slug }));
  }

  // Calculer les départements limitrophes (approximation par distance entre communes)
  console.log('  📐 Calcul des départements limitrophes...');
  // On utilise une approche simplifiée : les départements de la même région sont considérés comme "proches"
  for (const d of departements) {
    const samRegionDepts = departements
      .filter(d2 => d2.codeRegion === d.codeRegion && d2.code !== d.code)
      .map(d2 => ({ code: d2.code, nom: d2.nom, slug: d2.slug }));
    d.departementsProches = samRegionDepts.slice(0, 5);
  }

  // Calculer les régions limitrophes (approximation)
  const regionAdjacency = {
    '84': ['27', '93', '44', '76'], // Auvergne-Rhône-Alpes
    '27': ['84', '44', '75', '32'], // Bourgogne-Franche-Comté
    '53': ['75', '52', '28'], // Bretagne
    '24': ['75', '32', '44', '27'], // Centre-Val de Loire
    '94': ['44', '32'], // Corse
    '44': ['84', '27', '32', '24', '94', '93'], // Grand Est
    '32': ['75', '24', '44', '84', '93'], // Hauts-de-France
    '11': ['32', '24', '75', '27', '44'], // Île-de-France
    '28': ['53', '75', '52'], // Normandie
    '75': ['53', '28', '11', '24', '32', '52'], // Nouvelle-Aquitaine
    '76': ['84', '93'], // Occitanie
    '52': ['75', '53', '28'], // Pays de la Loire
    '93': ['84', '76', '32'], // Provence-Alpes-Côte d'Azur
  };

  for (const r of regions) {
    const adjCodes = regionAdjacency[r.code] || [];
    r.regionsLimitrophes = adjCodes
      .map(code => regionMap.get(code))
      .filter(Boolean)
      .map(r2 => ({ code: r2.code, nom: r2.nom, slug: r2.slug }));
  }

  console.log('  ✓ Données enrichies');
  return { regions, departements, communes };
}

async function main() {
  mkdirSync(DATA_DIR, { recursive: true });

  try {
    const regions = await fetchRegions();
    const departements = await fetchDepartements();
    const communes = await fetchCommunes(5000);

    const enriched = enrichData(regions, departements, communes);

    writeFileSync(
      join(DATA_DIR, 'regions.json'),
      JSON.stringify(enriched.regions, null, 2)
    );
    writeFileSync(
      join(DATA_DIR, 'departements.json'),
      JSON.stringify(enriched.departements, null, 2)
    );
    writeFileSync(
      join(DATA_DIR, 'communes.json'),
      JSON.stringify(enriched.communes, null, 2)
    );

    // Stats
    console.log('\n📊 Résumé :');
    console.log(`  Régions    : ${enriched.regions.length}`);
    console.log(`  Départements: ${enriched.departements.length}`);
    console.log(`  Communes   : ${enriched.communes.length}`);
    console.log(`\n✅ Données sauvegardées dans ${DATA_DIR}`);
  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

main();
