import type { Collection, LifeData, Location, Observation, Taxon, Trip, Venue, Visit } from './types';
import { canonicalize, emptyData, makeId, normalizeTaxon, now } from './store-core';
import { sameCanonicalTaxon } from './taxonomy-utils';
const KEY='life:v3';
export { makeId };
export function loadData():LifeData{if(typeof window==='undefined')return emptyData();try{const raw=localStorage.getItem(KEY);if(raw)return canonicalize(JSON.parse(raw));for(const key of ['life:v2','life:v1']){const legacy=localStorage.getItem(key);if(legacy){const data=canonicalize({...emptyData(),...JSON.parse(legacy)});writeData(data);return data;}}}catch{}return emptyData();}
export function writeData(data:LifeData){if(typeof window!=='undefined')localStorage.setItem(KEY,JSON.stringify(canonicalize(data)));}
export function persist(data:LifeData){const next=canonicalize(data);writeData(next);return next;}
export function saveObservation(o:Observation,d:LifeData){if(!d.taxa[o.taxonId])throw new Error('Taxon is not cached.');return persist({...d,observations:[{...o,id:o.id||makeId('obs'),createdAt:o.createdAt||now(),updatedAt:now(),count:Math.max(1,Math.floor(Number(o.count)||1))},...d.observations],recentTaxonIds:[o.taxonId,...d.recentTaxonIds.filter(x=>x!==o.taxonId)].slice(0,30)});}
export function updateObservation(o:Observation,d:LifeData){if(!d.taxa[o.taxonId])throw new Error('Taxon is not cached.');return persist({...d,observations:d.observations.map(x=>x.id===o.id?{...o,updatedAt:now()}:x)});}
export function deleteObservation(id:string,d:LifeData){return persist({...d,observations:d.observations.filter(x=>x.id!==id)});}
function upsert<T extends Location|Venue|Trip|Visit|Collection>(key:'locations'|'venues'|'trips'|'visits'|'collections',item:T,d:LifeData){const array=d[key] as unknown as T[];const next=array.some(x=>x.id===item.id)?array.map(x=>x.id===item.id?item:x):[item,...array];return persist({...d,[key]:next} as LifeData);}
export const upsertLocation=(item:Location,d:LifeData)=>upsert('locations',item,d);export const upsertVenue=(item:Venue,d:LifeData)=>upsert('venues',item,d);export const upsertTrip=(item:Trip,d:LifeData)=>upsert('trips',item,d);export const upsertVisit=(item:Visit,d:LifeData)=>upsert('visits',item,d);export const upsertCollection=(item:Collection,d:LifeData)=>upsert('collections',item,d);
export function deleteCollection(id:string,d:LifeData){return persist({...d,collections:d.collections.filter(x=>x.id!==id)});}
export function setTargets(ids:string[],d:LifeData){return persist({...d,targets:[...new Set(ids)].filter(id=>Boolean(d.taxa[id]))});}
export function upsertTaxon(t:Taxon,d:LifeData){const data=canonicalize(d);const incoming=normalizeTaxon(t);const match=Object.values(data.taxa).find(x=>sameCanonicalTaxon(x,incoming));const merged=match?{...match,...incoming,commonNames:[...new Map([...match.commonNames,...incoming.commonNames].map(x=>[x.name.toLowerCase(),x])).values()]}:incoming;return persist({...data,taxa:{...data.taxa,[merged.id]:merged},recentTaxonIds:[merged.id,...data.recentTaxonIds.filter(id=>id!==merged.id)].slice(0,30)});}
export function replaceData(data:LifeData){return persist({...emptyData(),...data});}
export function clearData(){const data=emptyData();writeData(data);return data;}
