export interface TaxonomySearchResult {
  usageKey: string;
  name: string;
  canonicalName: string;
  scientificName: string;
  status: string;
  rank: string;
  genus?: string;
  family?: string;
  order?: string;
  className?: string;
  phylum?: string;
  kingdom?: string;
  synonym?: boolean;
  acceptedKey?: string;
}
