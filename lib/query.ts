import type { Collection, LifeData, LifeListItem, Observation, QueryDefinition, Taxon, Venue } from './types';
import { normalizeTaxonomyText } from './taxonomy-utils';

export function matchesText(data: LifeData, observation: Observation, taxon: Taxon, q: string): boolean {
  const text = normalizeTaxonomyText([taxon.canonicalName,taxon.scientificName,...taxon.commonNames.map(x=>x.name),...taxon.synonyms,taxon.genus,taxon.family,taxon.order,taxon.className,taxon.kingdom,observation.notes,observation.city,observation.country,observation.locationSnapshot?.name].filter(Boolean).join(' '));
  return !q || text.includes(normalizeTaxonomyText(q));
}
function dateKey(o: Observation){ return o.observedDate || '9999-99-99'; }
function withinRadius(o: Observation, r: QueryDefinition['radius']) { if(!r || o.latitude==null || o.longitude==null) return false; const p=Math.PI/180; const a=Math.sin((o.latitude-r.lat)*p/2)**2+Math.cos(o.latitude*p)*Math.cos(r.lat*p)*Math.sin((o.longitude-r.lon)*p/2)**2; return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))<=r.km; }
export function buildLifeList(data: LifeData): LifeListItem[] {
  const map=new Map<string,Observation[]>();
  for(const o of data.observations){ if(data.taxa[o.taxonId]) map.set(o.taxonId,[...(map.get(o.taxonId)??[]),o]); }
  return [...map.entries()].map(([taxonId, observations])=>{
    const ordered=[...observations].sort((a,b)=>dateKey(a).localeCompare(dateKey(b))||String(a.observedTime??'').localeCompare(String(b.observedTime??''))||a.createdAt.localeCompare(b.createdAt));
    return {taxon:data.taxa[taxonId],observations,firstObservation:ordered[0],lastObservation:ordered.at(-1)!,observationCount:observations.length,individualCount:observations.reduce((n,o)=>n+Math.max(1,o.count||0),0),countries:[...new Set(observations.map(o=>o.country??o.locationSnapshot?.country).filter(Boolean) as string[])],venues:[...new Set(observations.map(o=>o.venueId).filter(Boolean) as string[])]};
  }).sort((a,b)=>dateKey(a.firstObservation).localeCompare(dateKey(b.firstObservation))||a.taxon.canonicalName.localeCompare(b.taxon.canonicalName));
}
export function queryObservations(data: LifeData, query: QueryDefinition={}): Observation[] {
  const list=buildLifeList(data); const byTaxon=new Map(list.map(x=>[x.taxon.id,x]));
  return data.observations.filter(o=>{
    const t=data.taxa[o.taxonId]; if(!t) return false;
    if(!matchesText(data,o,t,query.text??'')) return false;
    for(const [field] of [['kingdom'],['phylum'],['className'],['order'],['family'],['genus']] as const){ const v=query[field]; if(v && normalizeTaxonomyText(t[field]??'')!==normalizeTaxonomyText(v)) return false; }
    if(query.taxonId && t.id!==query.taxonId && t.acceptedTaxonId!==query.taxonId) return false;
    if(query.taxonomicStatus && t.status!==query.taxonomicStatus) return false;
    const country=o.country??o.locationSnapshot?.country; const city=o.city??o.locationSnapshot?.city;
    if(query.country && normalizeTaxonomyText(country??'')!==normalizeTaxonomyText(query.country)) return false;
    if(query.city && normalizeTaxonomyText(city??'')!==normalizeTaxonomyText(query.city)) return false;
    if(query.venueId && o.venueId!==query.venueId) return false;
    if(query.venueType){ const venue=o.venueId?data.venues.find(v=>v.id===o.venueId):undefined; if((venue?.type??o.locationSnapshot?.venueType)!==query.venueType) return false; }
    if(query.radius && !withinRadius(o,query.radius)) return false;
    const d=new Date(`${o.observedDate||'1970-01-01'}T12:00:00`); if(query.year && d.getUTCFullYear()!==query.year) return false; if(query.month && d.getUTCMonth()+1!==query.month) return false;
    if(query.from && o.observedDate<query.from) return false; if(query.to && o.observedDate>query.to) return false; if(query.includeApproximate===false && o.approximate) return false;
    if(query.observationType && o.observationType!==query.observationType) return false; if(query.minCount!=null && o.count<query.minCount) return false; if(query.maxCount!=null && o.count>query.maxCount) return false;
    if(query.evidence && (o.evidence??'UNVERIFIED')!==query.evidence) return false; if(query.confidence && (o.confidence??'CERTAIN')!==query.confidence) return false;
    if(query.hasPhoto!=null && Boolean(o.photoIds?.length)!==query.hasPhoto) return false;
    const item=byTaxon.get(t.id); if(query.seen===true && !item) return false; if(query.seenExactlyOnce===true && item?.observationCount!==1) return false; if(query.seenMultipleTimes===true && !(item?.observationCount&&item.observationCount>1)) return false;
    return true;
  });
}
export function queryLifeList(data: LifeData, query: QueryDefinition={}): LifeListItem[] { const obs=queryObservations(data,query); const ids=new Set(obs.map(o=>o.taxonId)); return buildLifeList(data).filter(x=>ids.has(x.taxon.id)); }
export function evaluateCollection(data: LifeData, collection: Collection){ return queryLifeList(data,collection.queryDefinition); }
export function searchTaxa(data: LifeData, q: string): Taxon[] { const n=normalizeTaxonomyText(q); return Object.values(data.taxa).filter(t=>[t.canonicalName,t.scientificName,t.kingdom,t.phylum,t.className,t.order,t.family,t.genus,...t.commonNames.map(x=>x.name),...t.synonyms].some(v=>normalizeTaxonomyText(v??'').includes(n))).sort((a,b)=>a.canonicalName.localeCompare(b.canonicalName)); }
export function findVenue(data: LifeData,id?:string):Venue|undefined{return id?data.venues.find(v=>v.id===id):undefined;}
export function collectionCounts(data: LifeData, collection: Collection){return evaluateCollection(data,collection).length;}
