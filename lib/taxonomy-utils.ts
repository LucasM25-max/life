import type { Taxon } from './types';

export const SUPPORTED_RANKS = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM']);
export const normalizeTaxonomyText = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const normalizeRank = (value: unknown) => String(value ?? '').trim().toUpperCase();
export const isSupportedTaxonRank = (value: unknown) => SUPPORTED_RANKS.has(normalizeRank(value));

export function canonicalExternalId(taxon: Taxon): string | undefined { return taxon.externalIds.catalogueOfLife || taxon.externalIds.gbif; }

export function taxonomyFallbackIdentity(taxon: Pick<Taxon, 'canonicalName'|'rank'|'kingdom'|'phylum'|'className'|'order'|'family'|'genus'|'species'>): string {
  return [taxon.canonicalName, taxon.rank, taxon.kingdom, taxon.phylum, taxon.className, taxon.order, taxon.family, taxon.genus, taxon.species]
    .map(normalizeTaxonomyText)
    .join('|');
}

export function canonicalTaxonIdentity(taxon: Taxon): string {
  const external = canonicalExternalId(taxon);
  return external ? `external:${external}|${normalizeRank(taxon.rank)}` : `name:${taxonomyFallbackIdentity(taxon)}`;
}

export function sameCanonicalTaxon(a: Taxon, b: Taxon): boolean {
  if (a.id === b.id) return true;
  const rankA = normalizeRank(a.rank), rankB = normalizeRank(b.rank);
  if (rankA !== rankB) return false;
  if (a.acceptedTaxonId && a.acceptedTaxonId === b.id) return true;
  if (b.acceptedTaxonId && b.acceptedTaxonId === a.id) return true;
  const ae = canonicalExternalId(a), be = canonicalExternalId(b);
  if (ae && be && ae === be) return true;
  return taxonomyFallbackIdentity(a) === taxonomyFallbackIdentity(b);
}

export function searchCanonicalIdentity(item: Record<string, unknown>): string {
  const rank = normalizeRank(item.rank);
  const acceptedKey = item.acceptedKey ?? item.acceptedTaxonKey ?? item.acceptedUsageKey;
  const name = normalizeTaxonomyText(item.canonicalName ?? item.name ?? item.scientificName);
  return acceptedKey ? `accepted:${String(acceptedKey)}|${rank}` : `name:${name}|${rank}`;
}

const rankWeight: Record<string, number> = { SPECIES: 40, SUBSPECIES: 32, VARIETY: 24, FORM: 16 };
const organismSignal = (item: Record<string, unknown>) => {
  const text = normalizeTaxonomyText([item.name, item.canonicalName, item.scientificName, item.kingdom].filter(Boolean).join(' '));
  if (/\b(virus|viridae|phage|viroid)\b/.test(text)) return -1000;
  const kingdom = normalizeTaxonomyText(item.kingdom);
  if (kingdom === 'animalia' || kingdom === 'plantae' || kingdom === 'fungi') return 20;
  if (kingdom) return 5;
  return 0;
};

export function taxonomySearchScore(item: Record<string, unknown>, query: string): number {
  const q = normalizeTaxonomyText(query);
  const name = normalizeTaxonomyText(item.name);
  const canonical = normalizeTaxonomyText(item.canonicalName ?? item.scientificName);
  const scientific = normalizeTaxonomyText(item.scientificName);
  let score = rankWeight[normalizeRank(item.rank)] ?? 0;
  score += organismSignal(item);
  if (item.synonym === false) score += 8;
  if (item.acceptedKey || item.acceptedTaxonKey || item.acceptedUsageKey) score += 4;
  if (canonical === q) score += 120;
  else if (name === q) score += 115;
  else if (scientific === q) score += 110;
  else if (canonical.startsWith(`${q} `)) score += 55;
  else if (name.startsWith(`${q} `)) score += 50;
  else if (canonical.includes(q)) score += 25;
  else if (name.includes(q) || scientific.includes(q)) score += 20;
  return score;
}

export function compareTaxonomySearchResults(a: Record<string, unknown>, b: Record<string, unknown>, query: string): number {
  const scoreDelta = taxonomySearchScore(b, query) - taxonomySearchScore(a, query);
  if (scoreDelta) return scoreDelta;
  const nameA = normalizeTaxonomyText(a.canonicalName ?? a.name ?? a.scientificName);
  const nameB = normalizeTaxonomyText(b.canonicalName ?? b.name ?? b.scientificName);
  return nameA.localeCompare(nameB) || normalizeRank(a.rank).localeCompare(normalizeRank(b.rank));
}

export function taxonIdsEquivalent(a: Taxon, b: Taxon): boolean { return sameCanonicalTaxon(a, b); }
