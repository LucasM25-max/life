import { NextResponse } from 'next/server';

const GBIF_MATCH = 'https://api.gbif.org/v2/species/match';
const GBIF_SEARCH = 'https://api.gbif.org/v1/species/search';
const COL_XR = '7ddf754f-d193-4cc9-b351-99906754a03b';

function classificationMap(items: Array<{ name?: string; rank?: string }>) {
  const map: Record<string, string> = {};
  for (const item of items) if (item.rank && item.name) map[item.rank.toLowerCase()] = item.name;
  return map;
}

async function fetchJson(url: URL) {
  const response = await fetch(url, { headers: { accept: 'application/json' }, next: { revalidate: 86400 } });
  if (!response.ok) throw new Error(`Upstream taxonomy error ${response.status}`);
  return response.json();
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name')?.trim();
  if (!name) return NextResponse.json({ error: 'A scientific name is required.' }, { status: 400 });

  try {
    const matchUrl = new URL(GBIF_MATCH);
    matchUrl.searchParams.set('scientificName', name);
    matchUrl.searchParams.set('checklistKey', COL_XR);
    matchUrl.searchParams.set('verbose', 'true');
    const match = await fetchJson(matchUrl) as {
      usage?: Record<string, unknown>;
      classification?: Array<{ key?: string; name?: string; rank?: string }>;
      diagnostics?: { matchType?: string; confidence?: number };
      synonym?: boolean;
      additionalStatus?: Array<{ status?: string; statusCode?: string; datasetAlias?: string }>;
    };

    let usage = match.usage;
    let classification = match.classification ?? [];
    let synonym = Boolean(match.synonym);

    if (usage && usage.status !== 'ACCEPTED') {
      const searchUrl = new URL(GBIF_SEARCH);
      searchUrl.searchParams.set('q', String(usage.canonicalName ?? usage.name ?? name));
      searchUrl.searchParams.set('rank', 'SPECIES');
      searchUrl.searchParams.set('status', 'ACCEPTED');
      searchUrl.searchParams.set('limit', '10');
      searchUrl.searchParams.set('checklistKey', COL_XR);
      const search = await fetchJson(searchUrl) as { results?: Array<Record<string, unknown>> };
      const exact = (search.results ?? []).find((r) => String(r.canonicalName ?? r.name ?? '').toLowerCase() === String(usage?.canonicalName ?? '').toLowerCase());
      if (exact) {
        const canonicalUrl = new URL(GBIF_MATCH);
        canonicalUrl.searchParams.set('scientificName', String(exact.canonicalName ?? exact.name));
        canonicalUrl.searchParams.set('checklistKey', COL_XR);
        canonicalUrl.searchParams.set('verbose', 'true');
        const canonical = await fetchJson(canonicalUrl) as typeof match;
        usage = canonical.usage ?? usage;
        classification = canonical.classification ?? classification;
        synonym = true;
        match.diagnostics = canonical.diagnostics ?? match.diagnostics;
        match.additionalStatus = canonical.additionalStatus ?? match.additionalStatus;
      }
    }

    if (!usage) return NextResponse.json({ error: 'No canonical taxon could be resolved.' }, { status: 404 });
    const classes = classificationMap(classification);
    const iucn = match.additionalStatus?.find((item) => item.datasetAlias?.toLowerCase() === 'iucn');
    return NextResponse.json({
      taxon: {
        externalId: String(usage.key ?? ''),
        scientificName: String(usage.name ?? usage.canonicalName ?? name),
        canonicalName: String(usage.canonicalName ?? usage.name ?? name),
        commonNames: [],
        authorship: usage.authorship ? String(usage.authorship) : undefined,
        rank: String(usage.rank ?? 'SPECIES'),
        status: String(usage.status ?? 'ACCEPTED'),
        kingdom: classes.kingdom,
        phylum: classes.phylum,
        className: classes.class,
        order: classes.order,
        family: classes.family,
        genus: classes.genus,
        species: classes.species ?? String(usage.canonicalName ?? name),
        synonym,
        taxonomySource: 'Catalogue of Life',
        taxonomyVersion: '2026-07-17 XR',
        source: 'GBIF Species API / COL XR',
        conservationStatus: iucn?.status,
        iucnCode: iucn?.statusCode,
        confidence: match.diagnostics?.confidence,
        matchType: match.diagnostics?.matchType,
        classification,
      },
    });
  } catch {
    return NextResponse.json({ error: 'Canonical taxonomy resolution is currently unavailable.' }, { status: 503 });
  }
}
