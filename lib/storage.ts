import type { LifeData, Location, Observation } from './types';

const STORAGE_KEY = 'life:v1';
const EMPTY: LifeData = { observations: [], locations: [], version: 1 };

function read(): LifeData {
  if (typeof window === 'undefined') return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as LifeData;
    if (parsed?.version !== 1) return EMPTY;
    return { observations: parsed.observations ?? [], locations: parsed.locations ?? [], version: 1 };
  } catch {
    return EMPTY;
  }
}

function write(data: LifeData) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function loadData(): LifeData { return read(); }

export function saveObservation(observation: Observation, data = read()): LifeData {
  const next = { ...data, observations: [observation, ...data.observations], version: 1 as const };
  write(next);
  return next;
}

export function updateObservation(observation: Observation, data = read()): LifeData {
  const next = { ...data, observations: data.observations.map((item) => item.id === observation.id ? observation : item), version: 1 as const };
  write(next);
  return next;
}

export function deleteObservation(id: string, data = read()): LifeData {
  const next = { ...data, observations: data.observations.filter((item) => item.id !== id), version: 1 as const };
  write(next);
  return next;
}

export function upsertLocation(location: Location, data = read()): LifeData {
  const exists = data.locations.some((item) => item.id === location.id);
  const locations = exists ? data.locations.map((item) => item.id === location.id ? location : item) : [location, ...data.locations];
  const next = { ...data, locations, version: 1 as const };
  write(next);
  return next;
}

export function replaceData(data: LifeData): LifeData {
  const next = { ...data, version: 1 as const };
  write(next);
  return next;
}

export function clearData(): LifeData {
  const next = EMPTY;
  write(next);
  return next;
}

export function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const sampleLocations: Location[] = [
  { id: 'sample-zoo-berlin', name: 'Zoo Berlin', city: 'Berlin', country: 'Germany', venueType: 'Zoo', lastUsedAt: '2026-08-13T08:30:00.000Z' },
  { id: 'sample-london-wetlands', name: 'London Wetland Centre', city: 'London', country: 'United Kingdom', venueType: 'Wildlife park', lastUsedAt: '2026-04-20T10:00:00.000Z' },
  { id: 'sample-serengeti', name: 'Serengeti National Park', city: 'Seronera', country: 'Tanzania', venueType: 'Reserve', lastUsedAt: '2025-09-03T07:00:00.000Z' },
];

export const sampleObservations: Observation[] = [
  { id:'sample-1', speciesId:'giraffe', observedDate:'2026-08-13', locationId:'sample-zoo-berlin', locationSnapshot:{name:'Zoo Berlin',city:'Berlin',country:'Germany',venueType:'Zoo'}, observationType:'Captive', count:2, notes:'Adult pair in the outdoor giraffe house.', createdAt:'2026-08-13T08:31:00.000Z', updatedAt:'2026-08-13T08:31:00.000Z' },
  { id:'sample-2', speciesId:'okapi', observedDate:'2026-08-13', locationId:'sample-zoo-berlin', locationSnapshot:{name:'Zoo Berlin',city:'Berlin',country:'Germany',venueType:'Zoo'}, observationType:'Captive', count:1, notes:'Single okapi visible from the viewing area.', createdAt:'2026-08-13T08:40:00.000Z', updatedAt:'2026-08-13T08:40:00.000Z' },
  { id:'sample-3', speciesId:'gorilla', observedDate:'2026-08-13', locationId:'sample-zoo-berlin', locationSnapshot:{name:'Zoo Berlin',city:'Berlin',country:'Germany',venueType:'Zoo'}, observationType:'Captive', count:4, notes:'Family group resting near the indoor viewing windows.', createdAt:'2026-08-13T08:52:00.000Z', updatedAt:'2026-08-13T08:52:00.000Z' },
  { id:'sample-4', speciesId:'red-fox', observedDate:'2026-05-12', locationId:'sample-london-wetlands', locationSnapshot:{name:'London Wetland Centre',city:'London',country:'United Kingdom',venueType:'Wildlife park'}, observationType:'Wild', count:1, notes:'Brief sighting along the reedbed edge.', createdAt:'2026-05-12T17:00:00.000Z', updatedAt:'2026-05-12T17:00:00.000Z' },
  { id:'sample-5', speciesId:'osprey', observedDate:'2026-04-20', locationId:'sample-london-wetlands', locationSnapshot:{name:'London Wetland Centre',city:'London',country:'United Kingdom',venueType:'Wildlife park'}, observationType:'Wild', count:1, notes:'Flying over the main lagoon.', createdAt:'2026-04-20T10:02:00.000Z', updatedAt:'2026-04-20T10:02:00.000Z' },
  { id:'sample-6', speciesId:'lion', observedDate:'2025-09-03', locationId:'sample-serengeti', locationSnapshot:{name:'Serengeti National Park',city:'Seronera',country:'Tanzania',venueType:'Reserve'}, observationType:'Wild', count:7, notes:'Pride resting in shade beside the track.', createdAt:'2025-09-03T07:20:00.000Z', updatedAt:'2025-09-03T07:20:00.000Z' },
  { id:'sample-7', speciesId:'giraffe', observedDate:'2025-09-03', locationId:'sample-serengeti', locationSnapshot:{name:'Serengeti National Park',city:'Seronera',country:'Tanzania',venueType:'Reserve'}, observationType:'Wild', count:12, notes:'Several individuals scattered across open grassland.', createdAt:'2025-09-03T07:35:00.000Z', updatedAt:'2025-09-03T07:35:00.000Z' },
];
