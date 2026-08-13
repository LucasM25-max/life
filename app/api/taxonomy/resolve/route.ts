import { NextResponse } from 'next/server';

const MATCH = 'https://api.gbif.org/v2/species/match';
const SEARCH = 'https://api.gbif.org/v1/species/search';
const VERNACULAR = 'https://api.gbif.org/v1/species';
const COL_XR = '7ddf754f-d193-4cc9-b351-99906754a03b';
const ALLOWED_RANKS = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM']);

async function json(url: URL, signal?: AbortSignal) {
  const response = await fetch(url, {
    signal,
    headers: { accept: 'application/json' },
    next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error(`Taxonomy upstream returned ${response.status}`);
  return response.json();
}

function classificationMap(items: Array<{ name?: string; rank?: string }>) {
  const result: Record<string, string> = {};
  for (const item of items) {
    if (item.rank && item.name) result[item.rank.toLowerCase()] = item.name;
  }
  return result;
}

function externalKey(usage: Record<string, unknown>) {
  return String(usage.key ?? usage.nubKey ?? '');
}

async function resolveAccepted(query: string, rank: string | undefined, signal: AbortSignal) {
  const url = new URL(SEARCH);
  url.searchParams.set('q', query);
  url.searchParams.set('status', 'ACCEPTED');
  url.searchParams.set('limit', '20');
  url.searchParams.set('checklistKey', COL_XR);
  if (rank) url.searchParams.set('rank', rank);
  const data = await json(url, signal) as { results?: Array<Record<string, unknown>> };
  return (data.results ?? []).find((item) => {
    const itemName = String(item.canonicalName ?? item.name ?? '').trim().toLowerCase();
    return itemName === query.trim().toLowerCase() && ALLOWED_RANKS.has(String(item.rank ?? '').toUpperCase());
  });
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

    if (!usage || !ALLOWED_RANKS.has(String(usage.rank ?? '').toUpperCase())) {
      return NextResponse.json({ error: 'No supported species or subspecies taxon could be resolved.' }, { status: 404 });
    }

    const usageStatus = String(usage.status ?? 'UNKNOWN').toUpperCase();
    if (usageStatus !== 'ACCEPTED') {
      synonym = true;
      const acceptedKey = usage.acceptedKey ?? usage.acceptedTaxonKey;
      if (acceptedKey) {
        const acceptedMatchUrl = new URL(MATCH);
        acceptedMatchUrl.searchParams.set('scientificName', String(usage.canonicalName ?? name));
        acceptedMatchUrl.searchParams.set('checklistKey', COL_XR);
        acceptedMatchUrl.searchParams.set('verbose', 'true');
        const accepted = await json(acceptedMatchUrl, controller.signal) as typeof match;
        if (accepted.usage && String(accepted.usage.status ?? '').toUpperCase() === 'ACCEPTED') {
          usage = accepted.usage;
          classification = accepted.classification ?? classification;
        }
      }

      if (String(usage.status ?? '').toUpperCase() !== 'ACCEPTED') {
        const acceptedName = String(usage.canonicalName ?? usage.name ?? name);
        const accepted = await resolveAccepted(acceptedName, String(usage.rank ?? ''), controller.signal);
        if (accepted) {
          const acceptedMatchUrl = new URL(MATCH);
          acceptedMatchUrl.searchParams.set('scientificName', String(accepted.canonicalName ?? accepted.name));
          acceptedMatchUrl.searchParams.set('checklistKey', COL_XR);
          acceptedMatchUrl.searchParams.set('verbose', 'true');
          const acceptedMatch = await json(acceptedMatchUrl, controller.signal) as typeof match;
          usage = acceptedMatch.usage ?? usage;
          classification = acceptedMatch.classification ?? classification;
        }
      }
    }

    if (!usage) return NextResponse.json({ error: 'No canonical taxon could be resolved.' }, { status: 404 });
    const rank = String(usage.rank ?? 'SPECIES').toUpperCase();
    if (!ALLOWED_RANKS.has(rank)) return NextResponse.json({ error: 'The matched taxon is not a supported life-list rank.' }, { status: 422 });

    const classes = classificationMap(classification);
    const gbifKey = externalKey(usage);

    let commonNames: Array<{ name: string; language?: string }> = [];
    if (gbifKey) {
      try {
        const namesUrl = new URL(`${VERNACULAR}/${encodeURIComponent(gbifKey)}/vernacularNames`);
        namesUrl.searchParams.set('limit', '50');
        const names = await json(namesUrl, controller.signal) as { results?: Array<{ vernacularName?: string; language?: string }> };
        commonNames = (names.results ?? [])
          .filter((item) => item.vernacularName)
          .map((item) => ({ name: String(item.vernacularName), language: item.language ? String(item.language) : undefined }))
          .slice(0, 20);
      } catch {
        commonNames = [];
      }
    }

    return NextResponse.json({
      taxon: {
        externalId: gbifKey,
        scientificName: String(usage.name ?? usage.canonicalName ?? name),
        canonicalName: String(usage.canonicalName ?? usage.name ?? name),
        commonNames,
        authorship: usage.authorship ? String(usage.authorship) : undefined,
        rank,
        status: 'ACCEPTED',
        synonyms: synonym ? [String(match.usage?.name ?? name)] : [],
        kingdom: classes.kingdom,
        phylum: classes.phylum,
        className: classes.class,
        order: classes.order,
        family: classes.family,
        genus: classes.genus,
        species: classes.species,
        externalIds: { gbif: gbifKey },
        taxonomySource: 'Catalogue of Life',
        taxonomyVersion: '2026-07-17 XR',
        source: 'GBIF Species API / COL XR',
        confidence: match.diagnostics?.confidence,
        matchType: match.diagnostics?.matchType,
        classification: classification
          .filter((item) => item.key && item.name && item.rank)
          .map((item) => ({ key: String(item.key), name: String(item.name), rank: String(item.rank) })),
      },
    });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError'
      ? 'Canonical taxonomy resolution timed out.'
      : 'Canonical taxonomy resolution is currently unavailable.';
    return NextResponse.json({ error: message }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
