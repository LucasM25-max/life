export type ObservationType = 'Wild' | 'Captive' | 'Semi-wild' | 'Unknown';
export type VenueType = 'Zoo' | 'Wildlife park' | 'Reserve' | 'Natural location' | 'Aquarium' | 'Museum / other';

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
  speciesId: string;
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
  version: 1;
}

export interface LifeListItem {
  species: Species;
  observations: Observation[];
  firstObservation: Observation;
  lastObservation: Observation;
  observationCount: number;
  individualCount: number;
  countries: string[];
}
