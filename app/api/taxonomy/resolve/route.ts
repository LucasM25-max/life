import { NextResponse } from 'next/server';
import { COL_XR_CHECKLIST } from '../../../../lib/taxonomy';
import { normalizeRank, normalizeTaxonomyText, isSupportedTaxonRank } from '../../../../lib/taxonomy-utils';

const MATCH = 'https://api.gbif.org/v2/species/match';
const SEARCH = 'https://api.gbif.org/v1/species/search';
const VERNACULAR = 'https://api.gbif.org/v1/species';
const SPECIES = 'https://api.gbif.org/v1/species';
const COL_XR = COL_XR_CHECKLIST;

async function json(url: URL, signal?: AbortSignal) {
  const response = await fetch(url, { signal, headers: { accept: 'application/json' }, next: { revalidate: 86400 } });
  if (!response.ok) throw new Error(`Taxonomy upstream returned ${response.status}`);
  return response.json();
}

function classificationMap(items: Array<{ name?: string; rank?: string }>) {
  const result: Record<string, string> = {};
  for (const item of items) if (item.rank && item.name) result[item.rank.toLowerCase()] = item.name;
  return result;
}

function externalKey(usage: Record<string, unknown>) { return String(usage.key ?? usage.nubKey ?? ''); }

function virusLike(item: Record<string, unknown>) {
  const text = [item.kingdom, item.phylum, item.class, item.order, item.family, item.name, item.canonicalName].filter(Boolean).join(' ');
  return /(?:virus|viruses|viria|viricota|viricetes|virales|viridae|polyomavirus|adenovirus|cytomegalovirus|herpesvirus|lymphocryptovirus)/i.test(text);
}

async function resolveAcceptedByKey(key: string, signal: AbortSignal) {
  if (!/^\d+$/.test(key)) return undefined;
  try {
    const data = await json(new URL(`${SPECIES}/${encodeURIComponent(key)}`), signal) as Record<string, unknown>;
    if (virusLike(data)) return undefined;
    if (!isSupportedTaxonRank(data.rank)) return undefined;
    if (String(data.status ?? '').toUpperCase() !== 'ACCEPTED') return undefined;
    return data;
  } catch { return undefined; }
}

async function resolveAcceptedByName(query: string, rank: string | undefined, signal: AbortSignal) {
  const url = new URL(SEARCH);
  url.searchParams.set('q', query);
  url.searchParams.set('status', 'ACCEPTED');
  url.searchParams.set('limit', '30');
  url.searchParams.set('checklistKey', COL_XR);
  if (rank) url.searchParams.set('rank', rank);
  const data = await json(url, signal) as { results?: Array<Record<string, unknown>> };
  const normalized = normalizeTaxonomyText(query);
  return (data.results ?? [])
    .filter((item) => isSupportedTaxonRank(item.rank))
    .filter((item) => !virusLike(item))
    .sort((a, b) => {
      const aExact = normalizeTaxonomyText(a.canonicalName ?? a.name) === normalized ? 0 : 1;
      const bExact = normalizeTaxonomyText(b.canonicalName ?? b.name) === normalized ? 0 : 1;
      return aExact - bExact;
    })[0];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name')?.trim();
  if (!name) return NextResponse.json({ error: 'A scientific name is required.' }, { status: 400 });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const matchUrl = new URL(MATCH);
    matchUrl.searchParams.set('scientificName', name);
    matchUrl.searchParams.set('checklistKey', COL_XR);
    matchUrl.searchParams.set('verbose', 'true');
    const match = await json(matchUrl, controller.signal) as {
      usage?: Record<string, unknown>;
      classification?: Array<{ key?: string; name?: string; rank?: string }>;
      diagnostics?: { matchType?: string; confidence?: number };
    };

    let usage = match.usage;
    let classification = match.classification ?? [];
    let synonym = false;
    const originalName = name;

    if (!usage || !isSupportedTaxonRank(usage.rank) || virusLike(usage)) {
      return NextResponse.json({ error: 'No supported organism taxon could be resolved.' }, { status: 404 });
    }

    if (String(usage.status ?? 'UNKNOWN').toUpperCase() !== 'ACCEPTED') {
      synonym = true;
      const acceptedKey = String(usage.acceptedKey ?? usage.acceptedTaxonKey ?? '');
      const acceptedByKey = acceptedKey ? await resolveAcceptedByKey(acceptedKey, controller.signal) : undefined;
      if (acceptedByKey) {
        usage = acceptedByKey;
        const acceptedMatchUrl = new URL(MATCH);
        acceptedMatchUrl.searchParams.set('scientificName', String(usage.canonicalName ?? usage.name ?? originalName));
        acceptedMatchUrl.searchParams.set('checklistKey', COL_XR);
        acceptedMatchUrl.searchParams.set('verbose', 'true');
        const acceptedMatch = await json(acceptedMatchUrl, controller.signal) as typeof match;
        classification = acceptedMatch.classification ?? classification;
      } else {
        const acceptedName = String(usage.canonicalName ?? usage.name ?? originalName);
        const accepted = await resolveAcceptedByName(acceptedName, normalizeRank(usage.rank), controller.signal);
        if (accepted) {
          const acceptedKey2 = externalKey(accepted);
          usage = accepted;
          const acceptedMatchUrl = new URL(MATCH);
          acceptedMatchUrl.searchParams.set('scientificName', String(accepted.canonicalName ?? accepted.name));
          acceptedMatchUrl.searchParams.set('checklistKey', COL_XR);
          acceptedMatchUrl.searchParams.set('verbose', 'true');
          const acceptedMatch = await json(acceptedMatchUrl, controller.signal) as typeof match;
          classification = acceptedMatch.classification ?? classification;
          if (!acceptedKey2) return NextResponse.json({ error: 'The accepted taxon has no stable upstream identifier.' }, { status: 422 });
        }
      }
    }

    if (!usage || !isSupportedTaxonRank(usage.rank) || virusLike(usage)) return NextResponse.json({ error: 'No canonical organism taxon could be resolved.' }, { status: 404 });
    if (String(usage.status ?? '').toUpperCase() !== 'ACCEPTED') return NextResponse.json({ error: 'The matched name did not resolve to an accepted taxon.' }, { status: 422 });

    const rank = normalizeRank(usage.rank);
    const classes = classificationMap(classification);
    const gbifKey = externalKey(usage);
    if (!gbifKey) return NextResponse.json({ error: 'The canonical taxon has no stable upstream identifier.' }, { status: 422 });

    let commonNames: Array<{ name: string; language?: string }> = [];
    try {
      const namesUrl = new URL(`${VERNACULAR}/${encodeURIComponent(gbifKey)}/vernacularNames`);
      namesUrl.searchParams.set('limit', '50');
      const names = await json(namesUrl, controller.signal) as { results?: Array<{ vernacularName?: string; language?: string }> };
      commonNames = (names.results ?? []).filter((item) => item.vernacularName).map((item) => ({ name: String(item.vernacularName), language: item.language ? String(item.language) : undefined })).slice(0, 20);
    } catch {}

    const scientificName = String(usage.name ?? usage.canonicalName ?? originalName);
    return NextResponse.json({
      taxon: {
        externalId: gbifKey,
        scientificName,
        canonicalName: String(usage.canonicalName ?? usage.name ?? originalName),
        commonNames,
        authorship: usage.authorship ? String(usage.authorship) : undefined,
        rank,
        status: 'ACCEPTED',
        synonyms: synonym && normalizeTaxonomyText(originalName) !== normalizeTaxonomyText(scientificName) ? [originalName] : [],
        kingdom: classes.kingdom,
        phylum: classes.phylum,
        className: classes.class,
        order: classes.order,
        family: classes.family,
        genus: classes.genus,
        species: classes.species,
        externalIds: { gbif: gbifKey },
        taxonomySource: 'Catalogue of Life XR',
        taxonomyVersion: '2026-07-17 XR',
        source: 'GBIF Species API / COL XR',
        confidence: match.diagnostics?.confidence,
        matchType: match.diagnostics?.matchType,
        classification: classification.filter((item) => item.key && item.name && item.rank).map((item) => ({ key: String(item.key), name: String(item.name), rank: String(item.rank) })),
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Canonical taxonomy resolution timed out.' : 'Canonical taxonomy resolution is currently unavailable.';
    return NextResponse.json({ error: message }, { status: 503 });
  } finally { clearTimeout(timeout); }
}
