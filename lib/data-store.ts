import type { Collection, LifeData, Location, Observation, Taxon, Trip, Venue, Visit } from './types';
import { canonicalize, emptyData, makeId, now, normalizeTaxon } from './store-core';
import { sameCanonicalTaxon } from './taxonomy-utils';
const KEY='life:v3';
export function loadData():LifeData{if(typeof window==='undefined')return emptyData();try{const v=localStorage.getItem(KEY);if(v)return canonicalize(JSON.parse(v));for(const k of ['life:v2','life:v1']){const old=localStorage.getItem(k);if(old){const d=canonicalize({...emptyData(),...JSON.parse(old)});writeData(d);return d;}}}catch{}return emptyData();}
export function writeData(d:LifeData){if(typeof window!=='undefined')localStorage.setItem(KEY,JSON.stringify(canonicalize(d)));}
export function persist(d:LifeData){const x=canonicalize(d);writeData(x);return x;}
export const saveObservation=(o:Observation,d:LifeData)=>{if(!d.taxa[o.taxonId])throw new Error('Taxon is not cached.');return persist({...d,observations:[{...o,id:o.id||makeId('obs'),createdAt:o.createdAt||now(),updatedAt:now(),count:Math.max(1,Math.floor(Number(o.count)||1))},...d.observations],recentTaxonIds:[o.taxonId,...d.recentTaxonIds.filter(x=>x!==o.taxonId)].slice(0,30)});};
export const updateObservation=(o:Observation,d:LifeData)=>persist({...d,observations:d.observations.map(x=>x.id===o.id?{...o,updatedAt:now()}:x)});
export const deleteObservation=(id:string,d:LifeData)=>persist({...d,observations:d.observations.filter(x=>x.id!==id)});
const upsert=<T extends {id:string}>(key:keyof LifeData,x:T,d:LifeData)=>persist({...d,[key]:((d[key] as T[])||[]).some(v=>v.id===x.id)?(d[key] as T[]).map(v=>v.id===x.id?x:v):[x,...(d[key] as T[])]});
export const upsertLocation=(x:Location,d:LifeData)=>upsert('locations',x,d); export const upsertVenue=(x:Venue,d:LifeData)=>upsert('venues',x,d); export const upsertTrip=(x:Trip,d:LifeData)=>upsert('trips',x,d); export const upsertVisit=(x:Visit,d:LifeData)=>upsert('visits',x,d); export const upsertCollection=(x:Collection,d:LifeData)=>upsert('collections',x,d);
export const deleteCollection=(id:string,d:LifeData)=>persist({...d,collections:d.collections.filter(x=>x.id!==id)}); export const setTargets=(ids:string[],d:LifeData)=>persist({...d,targets:[...new Set(ids)].filter(id=>Boolean(d.taxa[id]))});
export function upsertTaxon(t:Taxon,d:LifeData){const x=canonicalize(d);const n=normalizeTaxon(t);const hit=Object.values(x.taxa).find(v=>sameCanonicalTaxon(v,n));const merged=hit?{...hit,...n,commonNames:[...new Map([...hit.commonNames,...n.commonNames].map(v=>[v.name.toLowerCase(),v])).values()]}:n;return persist({...x,taxa:{...x.taxa,[merged.id]:merged},recentTaxonIds:[merged.id,...x.recentTaxonIds.filter(id=>id!==merged.id)].slice(0,30)});}
export const replaceData=(d:LifeData)=>persist({...emptyData(),...d}); export const clearData=()=>{const d=emptyData();writeData(d);return d;};
