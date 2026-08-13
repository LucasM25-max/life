import type { Taxon } from './types';

export const SUPPORTED_RANKS = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM']);

export const normalizeTaxonomyText = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
export const normalizeRank = (value: unknown) => String(value ?? '').trim().toUpperCase();
export const isSupportedTaxonRank = (value: unknown) => SUPPORTED_RANKS.has(normalizeRank(value));

export function canonicalExternalId(taxon: Taxon): string | undefined {
  return taxon.externalIds.catalogueOfLife || taxon.externalIds.gbif;
}

export function taxonomyFallbackIdentity(taxon: Pick<Taxon, 'canonicalName'|'rank'|'kingdom'|'phylum'|'className'|'order'|'family'|'genus'|'species'>): string {
  return [
    normalizeTaxonomyText(taxon.canonicalName),
    normalizeRank(taxon.rank),
    normalizeTaxonomyText(taxon.kingdom),
    normalizeTaxonomyText(taxon.phylum),
    normalizeTaxonomyText(taxon.className),
    normalizeTaxonomyText(taxon.order),
    normalizeTaxonomyText(taxon.family),
    normalizeTaxonomyText(taxon.genus),
    normalizeTaxonomyText(taxon.species),
  ].join('|');
}

export function canonicalTaxonIdentity(taxon: Taxon): string {
  const external = canonicalExternalId(taxon);
  return external
    ? `external:${external}|${normalizeRank(taxon.rank)}`
    : `name:${taxonomyFallbackIdentity(taxon)}`;
}

export function sameCanonicalTaxon(a: Taxon, b: Taxon): boolean {
  if (a.acceptedTaxonId && a.acceptedTaxonId === b.id) return true;
  if (b.acceptedTaxonId && b.acceptedTaxonId === a.id) return true;
  const aExternal = canonicalExternalId(a);
  const bExternal = canonicalExternalId(b);
  if (aExternal && bExternal && aExternal === bExternal && normalizeRank(a.rank) === normalizeRank(b.rank)) return true;
  return taxonomyFallbackIdentity(a) === taxonomyFallbackIdentity(b);
}

export function searchCanonicalIdentity(item: Record<string, unknown>): string {
  const rank = normalizeRank(item.rank);
  const acceptedKey = item.acceptedKey ?? item.acceptedTaxonKey ?? item.acceptedUsageKey;
  if (acceptedKey) return `accepted:${String(acceptedKey)}|${rank}`;
  return [
    normalizeTaxonomyText(item.canonicalName ?? item.name ?? item.scientificName),
    rank,
    normalizeTaxonomyText(item.kingdom),
    normalizeTaxonomyText(item.phylum),
    normalizeTaxonomyText(item.class),
    normalizeTaxonomyText(item.order),
    normalizeTaxonomyText(item.family),
    normalizeTaxonomyText(item.genus),
  ].join('|');
}
