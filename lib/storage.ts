import { speciesById, species } from './species';
import type { LifeData, Location, Observation, Taxon } from './types';

const STORAGE_KEY = 'life:v2';
const LEGACY_KEY = 'life:v1';
const EMPTY: LifeData = { observations: [], locations: [], taxa: {}, recentTaxonIds: [], version: 2 };

const now = () => new Date().toISOString();
const norm = (value: string | undefined) => (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
const legacyTaxonId = (speciesId: string) => `legacy:${speciesId}`;

function legacyToTaxon(s: (typeof species)[number]): Taxon {
  const timestamp = now();
  return {
    id: legacyTaxonId(s.id),
    scientificName: s.scientificName,
    canonicalName: s.scientificName,
    commonNames: [{ name: s.commonName, language: 'en' }],
    authorship: s.authority,
    rank: 'SPECIES',
    status: 'ACCEPTED',
    synonyms: s.synonyms ?? [],
    kingdom: s.kingdom,
    className: s.className,
    order: s.order,
    family: s.family,
    genus: s.genus,
    species: s.scientificName,
    conservationStatus: s.conservationStatus,
    externalIds: {},
    taxonomySource: 'Life V1 seed catalogue',
    taxonomyVersion: 'legacy',
    source: 'Legacy migration',
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function sameTaxon(a: Taxon, b: Taxon) {
  const aExternal = a.externalIds.catalogueOfLife || a.externalIds.gbif;
  const bExternal = b.externalIds.catalogueOfLife || b.externalIds.gbif;
  if (aExternal && bExternal && aExternal === bExternal) return true;
  if (a.acceptedTaxonId && a.acceptedTaxonId === b.id) return true;
  if (b.acceptedTaxonId && b.acceptedTaxonId === a.id) return true;
  if (a.status === 'SYNONYM' || b.status === 'SYNONYM') return false;
  return norm(a.canonicalName) === norm(b.canonicalName)
    && norm(a.rank) === norm(b.rank)
    && norm(a.genus) === norm(b.genus)
    && norm(a.family) === norm(b.family);
}

function preferTaxon(a: Taxon, b: Taxon) {
  if (a.status !== 'ACCEPTED' && b.status === 'ACCEPTED') return b;
  if (!a.externalIds.gbif && b.externalIds.gbif) return b;
  if (!a.commonNames.length && b.commonNames.length) return b;
  return a;
}

function mergeTaxa(a: Taxon, b: Taxon): Taxon {
  const preferred = preferTaxon(a, b);
  const other = preferred.id === a.id ? b : a;
  const commonNames = Array.from(new Map(
    [...preferred.commonNames, ...other.commonNames]
      .filter((x) => x.name)
      .map((x) => [norm(x.name), x]),
  ).values());
  const synonyms = Array.from(new Set([
    ...preferred.synonyms,
    ...other.synonyms,
    ...(other.canonicalName !== preferred.canonicalName ? [other.canonicalName] : []),
  ].filter(Boolean)));
  return {
    ...preferred,
    commonNames,
    synonyms,
    externalIds: { ...other.externalIds, ...preferred.externalIds },
    classification: preferred.classification?.length ? preferred.classification : other.classification,
    createdAt: preferred.createdAt < other.createdAt ? preferred.createdAt : other.createdAt,
    updatedAt: now(),
  };
}

function canonicalize(data: LifeData): LifeData {
  const entries = Object.values(data.taxa);
  const canonical: Taxon[] = [];
  const aliases = new Map<string, string>();

  for (const taxon of entries) {
    const existing = canonical.find((candidate) => sameTaxon(candidate, taxon));
    if (!existing) {
      canonical.push(taxon);
      continue;
    }
    const merged = mergeTaxa(existing, taxon);
    const index = canonical.findIndex((item) => item.id === existing.id);
    canonical[index] = merged;
    aliases.set(taxon.id, merged.id);
    aliases.set(existing.id, merged.id);
  }

  const taxa: Record<string, Taxon> = {};
  for (const taxon of canonical) taxa[taxon.id] = taxon;

  // Resolve explicit synonym links after the first pass.
  for (const taxon of Object.values(taxa)) {
    if (taxon.acceptedTaxonId) {
      const target = aliases.get(taxon.acceptedTaxonId) ?? taxon.acceptedTaxonId;
      if (target !== taxon.id && taxa[target]) taxon.acceptedTaxonId = target;
    }
  }

  const observations = data.observations.map((observation) => ({
    ...observation,
    taxonId: aliases.get(observation.taxonId) ?? observation.taxonId,
    speciesId: undefined,
  }));
  const recentTaxonIds = Array.from(new Set(
    data.recentTaxonIds
      .map((id) => aliases.get(id) ?? id)
      .filter((id) => Boolean(taxa[id])),
  )).slice(0, 24);

  return { ...data, observations, taxa, recentTaxonIds, version: 2 };
}

function migrateLegacy(parsed: any): LifeData {
  const taxa: Record<string, Taxon> = {};
  for (const s of species) taxa[legacyTaxonId(s.id)] = legacyToTaxon(s);
  const observations: Observation[] = (parsed?.observations ?? []).map((o: any) => {
    const oldId = String(o.taxonId ?? o.speciesId ?? '');
    const canonical = oldId.startsWith('legacy:') ? oldId : legacyTaxonId(oldId);
    if (!taxa[canonical] && speciesById.has(oldId)) taxa[canonical] = legacyToTaxon(speciesById.get(oldId)!);
    return { ...o, taxonId: canonical, speciesId: undefined } as Observation;
  });
  return canonicalize({ observations, locations: parsed?.locations ?? [], taxa, recentTaxonIds: observations.map((o) => o.taxonId), version: 2 });
}

function read(): LifeData {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as LifeData;
      if (parsed?.version === 2) {
        const normalized = canonicalize({
          ...EMPTY,
          ...parsed,
          observations: parsed.observations ?? [],
          locations: parsed.locations ?? [],
          taxa: parsed.taxa ?? {},
          recentTaxonIds: parsed.recentTaxonIds ?? [],
        });
        if (JSON.stringify(normalized) !== JSON.stringify(parsed)) write(normalized);
        return normalized;
      }
    }
    const legacyRaw = window.localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const migrated = migrateLegacy(JSON.parse(legacyRaw));
      write(migrated);
      return migrated;
    }
  } catch {
    return EMPTY;
  }
  return EMPTY;
}

function write(data: LifeData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadData(): LifeData { return read(); }

export function saveObservation(observation: Observation, data = read()): LifeData {
  const normalized = canonicalize(data);
  const nextRecent = [observation.taxonId, ...normalized.recentTaxonIds.filter((id) => id !== observation.taxonId)].slice(0, 24);
  const next = canonicalize({ ...normalized, observations: [observation, ...normalized.observations], recentTaxonIds: nextRecent, version: 2 });
  write(next);
  return next;
}

export function updateObservation(observation: Observation, data = read()): LifeData {
  const normalized = canonicalize(data);
  const next = canonicalize({ ...normalized, observations: normalized.observations.map((item) => item.id === observation.id ? observation : item), recentTaxonIds: [observation.taxonId, ...normalized.recentTaxonIds.filter((id) => id !== observation.taxonId)].slice(0, 24), version: 2 });
  write(next);
  return next;
}

export function deleteObservation(id: string, data = read()): LifeData {
  const next = canonicalize({ ...data, observations: data.observations.filter((item) => item.id !== id), version: 2 });
  write(next);
  return next;
}

export function upsertLocation(location: Location, data = read()): LifeData {
  const exists = data.locations.some((item) => item.id === location.id);
  const locations = exists ? data.locations.map((item) => item.id === location.id ? location : item) : [location, ...data.locations];
  const next = { ...data, locations, version: 2 as const };
  write(next); return next;
}

export function upsertTaxon(taxon: Taxon, data = read()): LifeData {
  const normalized = canonicalize(data);
  const matched = Object.values(normalized.taxa).find((candidate) => sameTaxon(candidate, taxon));
  const canonicalTaxon = matched ? mergeTaxa(matched, taxon) : taxon;
  const taxa = { ...normalized.taxa, [canonicalTaxon.id]: canonicalTaxon };
  if (matched && matched.id !== canonicalTaxon.id) delete taxa[matched.id];
  const nextRecent = [canonicalTaxon.id, ...normalized.recentTaxonIds.filter((id) => id !== canonicalTaxon.id)].slice(0, 24);
  const next = canonicalize({ ...normalized, taxa, recentTaxonIds: nextRecent, version: 2 });
  write(next); return next;
}

export function replaceData(data: LifeData): LifeData {
  const next = canonicalize({ ...EMPTY, ...data, version: 2 });
  write(next); return next;
}

export function clearData(): LifeData { write(EMPTY); return EMPTY; }
export function makeId(prefix: string): string { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`; }

export const sampleLocations: Location[] = [
  { id: 'sample-zoo-berlin', name: 'Zoo Berlin', city: 'Berlin', country: 'Germany', venueType: 'Zoo', lastUsedAt: '2026-08-13T08:30:00.000Z' },
  { id: 'sample-london-wetlands', name: 'London Wetland Centre', city: 'London', country: 'United Kingdom', venueType: 'Wildlife park', lastUsedAt: '2026-04-20T10:00:00.000Z' },
  { id: 'sample-serengeti', name: 'Serengeti National Park', city: 'Seronera', country: 'Tanzania', venueType: 'Reserve', lastUsedAt: '2025-09-03T07:00:00.000Z' },
];

const seed = (id: string) => legacyTaxonId(id);
export const sampleObservations: Observation[] = [
  { id:'sample-1', taxonId:seed('giraffe'), observedDate:'2026-08-13', locationId:'sample-zoo-berlin', locationSnapshot:{name:'Zoo Berlin',city:'Berlin',country:'Germany',venueType:'Zoo'}, observationType:'Captive', count:2, notes:'Adult pair in the outdoor giraffe house.', createdAt:'2026-08-13T08:31:00.000Z', updatedAt:'2026-08-13T08:31:00.000Z' },
  { id:'sample-2', taxonId:seed('okapi'), observedDate:'2026-08-13', locationId:'sample-zoo-berlin', locationSnapshot:{name:'Zoo Berlin',city:'Berlin',country:'Germany',venueType:'Zoo'}, observationType:'Captive', count:1, notes:'Single okapi visible from the viewing area.', createdAt:'2026-08-13T08:40:00.000Z', updatedAt:'2026-08-13T08:40:00.000Z' },
  { id:'sample-3', taxonId:seed('gorilla'), observedDate:'2026-08-13', locationId:'sample-zoo-berlin', locationSnapshot:{name:'Zoo Berlin',city:'Berlin',country:'Germany',venueType:'Zoo'}, observationType:'Captive', count:4, notes:'Family group resting near the indoor viewing windows.', createdAt:'2026-08-13T08:52:00.000Z', updatedAt:'2026-08-13T08:52:00.000Z' },
  { id:'sample-4', taxonId:seed('red-fox'), observedDate:'2026-05-12', locationId:'sample-london-wetlands', locationSnapshot:{name:'London Wetland Centre',city:'London',country:'United Kingdom',venueType:'Wildlife park'}, observationType:'Wild', count:1, notes:'Brief sighting along the reedbed edge.', createdAt:'2026-05-12T17:00:00.000Z', updatedAt:'2026-05-12T17:00:00.000Z' },
  { id:'sample-5', taxonId:seed('osprey'), observedDate:'2026-04-20', locationId:'sample-london-wetlands', locationSnapshot:{name:'London Wetland Centre',city:'London',country:'United Kingdom',venueType:'Wildlife park'}, observationType:'Wild', count:1, notes:'Flying over the main lagoon.', createdAt:'2026-04-20T10:02:00.000Z', updatedAt:'2026-04-20T10:02:00.000Z' },
  { id:'sample-6', taxonId:seed('lion'), observedDate:'2025-09-03', locationId:'sample-serengeti', locationSnapshot:{name:'Serengeti National Park',city:'Seronera',country:'Tanzania',venueType:'Reserve'}, observationType:'Wild', count:7, notes:'Pride resting in shade beside the track.', createdAt:'2025-09-03T07:20:00.000Z', updatedAt:'2025-09-03T07:20:00.000Z' },
  { id:'sample-7', taxonId:seed('giraffe'), observedDate:'2025-09-03', locationId:'sample-serengeti', locationSnapshot:{name:'Serengeti National Park',city:'Seronera',country:'Tanzania',venueType:'Reserve'}, observationType:'Wild', count:12, notes:'Several individuals scattered across open grassland.', createdAt:'2025-09-03T07:35:00.000Z', updatedAt:'2025-09-03T07:35:00.000Z' },
];
