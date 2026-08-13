export type ObservationType = 'Wild' | 'Captive' | 'Semi-wild' | 'Unknown';
export type VenueType = 'Zoo' | 'Wildlife park' | 'Reserve' | 'Natural location' | 'Aquarium' | 'Museum / other';

export interface Taxon {
  id: string;
  scientificName: string;
  canonicalName: string;
  commonNames: Array<{ name: string; language?: string }>;
  authorship?: string;
  rank: string;
  status: 'ACCEPTED' | 'SYNONYM' | 'UNKNOWN';
  acceptedTaxonId?: string;
  synonyms: string[];
  parentTaxonId?: string;
  kingdom?: string;
  phylum?: string;
  className?: string;
  order?: string;
  family?: string;
  genus?: string;
  species?: string;
  conservationStatus?: string;
  iucnCode?: string;
  externalIds: { catalogueOfLife?: string; gbif?: string; other?: Record<string, string> };
  taxonomySource: string;
  taxonomyVersion: string;
  source: string;
  confidence?: number;
  matchType?: string;
  classification?: Array<{ key: string; name: string; rank: string }>;
  createdAt: string;
  updatedAt: string;
}

/** Legacy shape retained for compatibility with the original V1 dataset. */
export interface Species {
  id: string;
  commonName: string;
  scientificName: string;
  genus: string;
  family: string;
  order: string;
  className: string;
  kingdom: string;
  conservationStatus?: string;
  authority?: string;
  synonyms?: string[];
}

export interface Location {
  id: string;
  name: string;
  city?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  venueType: VenueType;
  lastUsedAt?: string;
}

export interface Observation {
  id: string;
  taxonId: string;
  /** V1 compatibility; no new observations should rely on this field. */
  speciesId?: string;
  observedDate: string;
  observedTime?: string;
  locationId?: string;
  locationSnapshot?: { name: string; city?: string; country?: string; venueType?: VenueType };
  country?: string;
  city?: string;
  latitude?: number;
  longitude?: number;
  observationType: ObservationType;
  count: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LifeData {
  observations: Observation[];
  locations: Location[];
  taxa: Record<string, Taxon>;
  recentTaxonIds: string[];
  version: 2;
}

export interface LifeListItem {
  taxon: Taxon;
  observations: Observation[];
  firstObservation: Observation;
  lastObservation: Observation;
  observationCount: number;
  individualCount: number;
  countries: string[];
}
