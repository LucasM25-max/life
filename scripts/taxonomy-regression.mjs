const base = process.env.LIFE_BASE_URL || 'http://localhost:3000';

async function get(path) {
  const response = await fetch(`${base}${path}`);
  const body = await response.json();
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${body.error || 'unknown error'}`);
  return body;
}

const gorilla = await get('/api/taxonomy/search?q=Gorilla&limit=18');
const names = gorilla.results.map((r) => `${r.canonicalName}|${r.rank}`);
if (new Set(names).size !== names.length) throw new Error('Duplicate canonical search results detected');
if (gorilla.results.some((r) => /virus|viridae|virales/i.test(`${r.name} ${r.canonicalName}`))) throw new Error('Virus/non-organism result leaked into Gorilla search');
if (gorilla.results.filter((r) => r.canonicalName === 'Gorilla gorilla').length !== 1) throw new Error('Gorilla gorilla did not collapse to one search result');

const resolved = await get('/api/taxonomy/resolve?name=Gorilla%20gorilla');
if (resolved.taxon.status !== 'ACCEPTED') throw new Error('Resolver returned non-accepted taxon');
if (resolved.taxon.rank !== 'SPECIES') throw new Error(`Unexpected Gorilla rank: ${resolved.taxon.rank}`);
if (!resolved.taxon.externalIds?.gbif) throw new Error('Resolver omitted stable GBIF identifier');

console.log('Taxonomy regression checks passed.');
