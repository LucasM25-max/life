import type { Taxon } from './types';

export const SUPPORTED_RANKS = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM']);
export const normalizeTaxonomyText = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const normalizeRank = (value: unknown) => String(value ?? '').trim().toUpperCase();
export const isSupportedTaxonRank = (value: unknown) => SUPPORTED_RANKS.has(normalizeRank(value));

export function canonicalExternalId(taxon: Taxon): string | undefined { return taxon.externalIds.catalogueOfLife || taxon.externalIds.gbif; }
export function taxonomyFallbackIdentity(taxon: Pick<Taxon, 'canonicalName'|'rank'>): string { return `${normalizeTaxonomyText(taxon.canonicalName)}|${normalizeRank(taxon.rank)}`; }
export function canonicalTaxonIdentity(taxon: Taxon): string { const external = canonicalExternalId(taxon); return external ? `external:${external}|${normalizeRank(taxon.rank)}` : `name:${taxonomyFallbackIdentity(taxon)}`; }
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
export function taxonIdsEquivalent(a: Taxon, b: Taxon): boolean { return sameCanonicalTaxon(a, b); }
