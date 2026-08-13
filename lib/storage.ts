import { speciesById, species } from './species';
import { sameCanonicalTaxon, normalizeRank, normalizeTaxonomyText } from './taxonomy-utils';
import type { LifeData, Location, Observation, Taxon } from './types';

const STORAGE_KEY = 'life:v2';
const LEGACY_KEY = 'life:v1';
const EMPTY: LifeData = { observations: [], locations: [], taxa: {}, recentTaxonIds: [], version: 2 };
const now = () => new Date().toISOString();
const legacyTaxonId = (speciesId: string) => `legacy:${speciesId}`;

function normalizeTaxonRecord(input: Taxon): Taxon {
  return {
    ...input,
    rank: normalizeRank(input.rank || 'SPECIES') || 'SPECIES',
    status: input.status === 'ACCEPTED' || input.status === 'SYNONYM' ? input.status : 'UNKNOWN',
    canonicalName: String(input.canonicalName ?? input.scientificName ?? '').trim(),
    scientificName: String(input.scientificName ?? input.canonicalName ?? '').trim(),
    commonNames: Array.isArray(input.commonNames)
      ? input.commonNames.filter((x) => x && String(x.name ?? '').trim()).map((x) => ({ name: String(x.name).trim(), language: x.language }))
      : [],
    synonyms: Array.from(new Set((Array.isArray(input.synonyms) ? input.synonyms : []).map(String).map((x) => x.trim()).filter(Boolean))),
    externalIds: { ...(input.externalIds ?? {}) },
    createdAt: input.createdAt || now(),
    updatedAt: input.updatedAt || now(),
  };
}

function legacyToTaxon(s: (typeof species)[number]): Taxon {
  const timestamp = now();
  return { id: legacyTaxonId(s.id), scientificName: s.scientificName, canonicalName: s.scientificName, commonNames: [{ name: s.commonName, language: 'en' }], authorship: s.authority, rank: 'SPECIES', status: 'ACCEPTED', synonyms: s.synonyms ?? [], kingdom: s.kingdom, className: s.className, order: s.order, family: s.family, genus: s.genus, species: s.scientificName, conservationStatus: s.conservationStatus, externalIds: {}, taxonomySource: 'Life V1 seed catalogue', taxonomyVersion: 'legacy', source: 'Legacy migration', createdAt: timestamp, updatedAt: timestamp };
}

function sameTaxon(a: Taxon, b: Taxon) { return sameCanonicalTaxon(a, b); }

function mergeTaxa(a: Taxon, b: Taxon): Taxon {
  const preferred = preferTaxon(a, b);
  const other = preferred.id === a.id ? b : a;
  const commonNames = Array.from(new Map([...preferred.commonNames, ...other.commonNames].filter((x) => x.name).map((x) => [normalizeTaxonomyText(x.name), x])).values());
  const synonyms = Array.from(new Set([
    ...preferred.synonyms,
    ...other.synonyms,
    ...(normalizeTaxonomyText(other.canonicalName) !== normalizeTaxonomyText(preferred.canonicalName) ? [other.canonicalName] : []),
  ].filter(Boolean)));
  return {
    ...preferred,
    commonNames,
    synonyms,
    acceptedTaxonId: preferred.acceptedTaxonId ?? other.acceptedTaxonId,
    externalIds: { ...other.externalIds, ...preferred.externalIds },
    classification: preferred.classification?.length ? preferred.classification : other.classification,
    parentTaxonId: preferred.parentTaxonId ?? other.parentTaxonId,
    conservationStatus: preferred.conservationStatus ?? other.conservationStatus,
    iucnCode: preferred.iucnCode ?? other.iucnCode,
    createdAt: preferred.createdAt < other.createdAt ? preferred.createdAt : other.createdAt,
    updatedAt: now(),
  };
}

function preferTaxon(a: Taxon, b: Taxon) {
  if (a.status !== 'ACCEPTED' && b.status === 'ACCEPTED') return b;
  if (!a.externalIds.catalogueOfLife && b.externalIds.catalogueOfLife) return b;
  if (!a.externalIds.gbif && b.externalIds.gbif) return b;
  if (!a.commonNames.length && b.commonNames.length) return b;
  if (a.id.startsWith('legacy:') && !b.id.startsWith('legacy:')) return b;
  return a;
}

function followRedirect(id: string, redirects: Map<string, string>): string {
  let current = id;
  const seen = new Set<string>();
  while (redirects.has(current) && !seen.has(current)) {
    seen.add(current);
    current = redirects.get(current)!;
  }
  return current;
}

function canonicalize(data: LifeData): LifeData {
  const entries = Object.values(data.taxa ?? {}).map(normalizeTaxonRecord).filter((taxon) => Boolean(taxon.canonicalName));
  const groups: Taxon[][] = [];
  for (const taxon of entries) {
    const group = groups.find((candidateGroup) => candidateGroup.some((candidate) => sameTaxon(candidate, taxon)));
    if (group) group.push(taxon); else groups.push([taxon]);
  }

  const aliases = new Map<string, string>();
  const taxa: Record<string, Taxon> = {};
  for (const group of groups) {
    const canonical = group.reduce((current, item) => mergeTaxa(current, item));
    taxa[canonical.id] = canonical;
    for (const item of group) aliases.set(item.id, canonical.id);
  }

  // Collapse explicit synonym -> accepted links after duplicate merging.
  const redirects = new Map<string, string>();
  for (const taxon of Object.values(taxa)) {
    if (!taxon.acceptedTaxonId) continue;
    const target = aliases.get(taxon.acceptedTaxonId) ?? taxon.acceptedTaxonId;
    if (target && target !== taxon.id && taxa[target]) {
      taxa[target] = mergeTaxa(taxa[target], { ...taxon, status: 'ACCEPTED', acceptedTaxonId: undefined });
      redirects.set(taxon.id, target);
      delete taxa[taxon.id];
    } else if (target && target !== taxon.id) {
      taxon.acceptedTaxonId = target;
    } else {
      taxon.acceptedTaxonId = undefined;
    }
  }

  for (const [from, to] of aliases) aliases.set(from, followRedirect(to, redirects));
  for (const [from] of redirects) aliases.set(from, followRedirect(from, redirects));
  for (const taxon of Object.values(taxa)) if (taxon.acceptedTaxonId) taxon.acceptedTaxonId = aliases.get(taxon.acceptedTaxonId) ?? followRedirect(taxon.acceptedTaxonId, redirects);

  const observations = (data.observations ?? []).map((observation) => ({
    ...observation,
    taxonId: aliases.get(observation.taxonId) ?? followRedirect(observation.taxonId, redirects),
    speciesId: undefined,
  })).filter((observation) => Boolean(taxa[observation.taxonId]));

  const recentTaxonIds = Array.from(new Set((data.recentTaxonIds ?? []).map((id) => aliases.get(id) ?? followRedirect(id, redirects)).filter((id) => Boolean(taxa[id])))).slice(0, 24);
  return { observations, locations: Array.isArray(data.locations) ? data.locations : [], taxa, recentTaxonIds, version: 2 };
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
        const normalized = canonicalize(parsed);
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

function write(data: LifeData) { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }

export function repairData(data: LifeData = read()): LifeData {
  const next = canonicalize(data);
  write(next);
  return next;
}

export function loadData(): LifeData { return read(); }

export function saveObservation(observation: Observation, data = read()): LifeData {
  const normalized = canonicalize(data);
  const taxonId = normalized.taxa[observation.taxonId]
    ? observation.taxonId
    : Object.values(normalized.taxa).find((taxon) => taxon.id === observation.taxonId)?.id;
  if (!taxonId || !normalized.taxa[taxonId]) throw new Error('The selected taxon is not available in the local taxonomy cache.');
  const next = canonicalize({
    ...normalized,
    observations: [{ ...observation, taxonId, speciesId: undefined }, ...normalized.observations],
    recentTaxonIds: [taxonId, ...normalized.recentTaxonIds.filter((id) => id !== taxonId)].slice(0, 24),
    version: 2,
  });
  write(next);
  return next;
}

export function updateObservation(observation: Observation, data = read()): LifeData {
  const normalized = canonicalize(data);
  const taxonId = normalized.taxa[observation.taxonId]
    ? observation.taxonId
    : normalized.observations.find((item) => item.id === observation.id)?.taxonId;
  if (!taxonId || !normalized.taxa[taxonId]) throw new Error('The edited observation references an unavailable taxon.');
  const next = canonicalize({
    ...normalized,
    observations: normalized.observations.map((item) => item.id === observation.id ? { ...observation, taxonId, speciesId: undefined } : item),
    recentTaxonIds: [taxonId, ...normalized.recentTaxonIds.filter((id) => id !== taxonId)].slice(0, 24),
    version: 2,
  });
  write(next);
  return next;
}

export function deleteObservation(id: string, data = read()): LifeData {
  const next = canonicalize({ ...data, observations: data.observations.filter((item) => item.id !== id), version: 2 });
  write(next);
  return next;
}

export function upsertLocation(location: Location, data = read()): LifeData {
  const normalized = canonicalize(data);
  const exists = normalized.locations.some((item) => item.id === location.id);
  const locations = exists ? normalized.locations.map((item) => item.id === location.id ? location : item) : [location, ...normalized.locations];
  const next = { ...normalized, locations, version: 2 as const };
  write(next);
  return next;
}

export function upsertTaxon(taxon: Taxon, data = read()): LifeData {
  const normalized = canonicalize(data);
  const incoming = normalizeTaxonRecord(taxon);
  const matched = Object.values(normalized.taxa).find((candidate) => sameTaxon(candidate, incoming));
  const canonicalTaxon = matched ? mergeTaxa(matched, incoming) : incoming;
  const taxa = { ...normalized.taxa, [canonicalTaxon.id]: canonicalTaxon };
  if (matched && matched.id !== canonicalTaxon.id) delete taxa[matched.id];
  const next = canonicalize({ ...normalized, taxa, recentTaxonIds: [canonicalTaxon.id, ...normalized.recentTaxonIds.filter((id) => id !== canonicalTaxon.id)].slice(0, 24), version: 2 });
  write(next);
  return next;
}

export function replaceData(data: LifeData): LifeData {
  const next = canonicalize({ ...EMPTY, ...data, version: 2 });
  write(next);
  return next;
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
