/**
 * IndexNow — Submit all URLs to Bing/Yandex for fast indexing
 * Run: node scripts/indexnow.js
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST = join(__dirname, '..', 'dist');
const SITE_URL = 'https://deviscouvreurfrance.com';
const INDEX_NOW_KEY = 'b4d7c2e8f1a3956d0e7b4c8a2f1d3e5b';

// Parse sitemap to extract URLs
const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf-8');
const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);

console.log(`📡 IndexNow — Submitting ${urls.length} URLs...\n`);

// IndexNow API accepts max 10,000 URLs per request
const BATCH_SIZE = 500;
let submitted = 0;

for (let i = 0; i < urls.length; i += BATCH_SIZE) {
  const batch = urls.slice(i, i + BATCH_SIZE);

  const payload = {
    host: 'deviscouvreurfrance.com',
    key: INDEX_NOW_KEY,
    keyLocation: `${SITE_URL}/${INDEX_NOW_KEY}.txt`,
    urlList: batch
  };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    submitted += batch.length;
    console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} URLs → ${res.status} ${res.statusText}`);
  } catch (err) {
    console.error(`  ✗ Batch ${Math.floor(i / BATCH_SIZE) + 1} failed:`, err.message);
  }
}

console.log(`\n✅ ${submitted}/${urls.length} URLs submitted to IndexNow`);
console.log('📌 Bing and Yandex will process these URLs within hours.');
