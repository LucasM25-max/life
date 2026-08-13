import { NextResponse } from 'next/server';
import { COL_XR_CHECKLIST } from '../../../../lib/taxonomy';
import { normalizeRank, normalizeTaxonomyText, searchCanonicalIdentity } from '../../../../lib/taxonomy-utils';

const GBIF = 'https://api.gbif.org/v1/species/search';
const COL_XR = COL_XR_CHECKLIST;

function virusLike(item: Record<string, unknown>) {
  const text = [item.kingdom, item.phylum, item.class, item.order, item.family].filter(Boolean).join(' ');
  return /(?:virus|viruses|viria|viricota|viricetes|virales|viridae|polyomavirus|adenovirus|cytomegalovirus|herpesvirus|lymphocryptovirus)/i.test(text);
}
function score(item: Record<string, unknown>, needle: string) {
  const common = normalizeTaxonomyText(item.vernacularName);
  const scientific = normalizeTaxonomyText(item.canonicalName ?? item.name ?? item.scientificName);
  const rank = normalizeRank(item.rank);
  let value = virusLike(item) ? 5000 : 0;
  const status = String(item.status ?? item.taxonomicStatus ?? '').toUpperCase();
  if (status !== 'ACCEPTED') value += 45;
  if (common === needle) value -= 650;
  else if (common.startsWith(needle)) value -= 350;
  else if (common.includes(needle)) value -= 120;
  if (scientific === needle) value -= 600;
  else if (scientific.startsWith(needle)) value -= 300;
  else if (scientific.includes(needle)) value -= 100;
  if (rank === 'SPECIES') value -= 30;
  else if (rank === 'SUBSPECIES') value -= 20;
  else value -= 5;
  return value;
}
function chooseRepresentative(items: Array<Record<string, unknown>>, needle: string) {
  return [...items].sort((a, b) => {
    const aAccepted = String(a.status ?? a.taxonomicStatus ?? '').toUpperCase() === 'ACCEPTED';
    const bAccepted = String(b.status ?? b.taxonomicStatus ?? '').toUpperCase() === 'ACCEPTED';
    if (aAccepted !== bAccepted) return aAccepted ? -1 : 1;
    return score(a, needle) - score(b, needle);
  })[0];
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '18'), 1), 25);
  if (!q) return NextResponse.json({ results: [], source: 'GBIF Species API', taxonomy: 'COL XR' });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = new URL(GBIF);
    upstream.searchParams.set('q', q);
    upstream.searchParams.set('limit', '100');
    upstream.searchParams.set('checklistKey', COL_XR);
    const response = await fetch(upstream, { signal: controller.signal, headers: { accept: 'application/json' }, next: { revalidate: 300 } });
    if (!response.ok) return NextResponse.json({ results: [], error: `Taxonomy search returned ${response.status}.` }, { status: 502 });
    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    const candidates = (data.results ?? [])
      .filter((item) => ['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM'].includes(normalizeRank(item.rank)))
      .filter((item) => !virusLike(item));
    const grouped = new Map<string, Array<Record<string, unknown>>>();
    for (const item of candidates) {
      const key = searchCanonicalIdentity(item);
      const group = grouped.get(key) ?? [];
      group.push(item);
      grouped.set(key, group);
    }
    const results = Array.from(grouped.values())
      .map((group) => chooseRepresentative(group, q.toLowerCase()))
      .sort((a, b) => score(a, q.toLowerCase()) - score(b, q.toLowerCase()))
      .slice(0, limit)
      .map((item) => {
        const rank = normalizeRank(item.rank || 'SPECIES');
        const acceptedKey = item.acceptedKey ?? item.acceptedTaxonKey ?? item.acceptedUsageKey;
        const usageKey = String(acceptedKey ?? item.key ?? '');
        const acceptedStatus = String(item.status ?? item.taxonomicStatus ?? '').toUpperCase() === 'ACCEPTED';
        return {
          usageKey,
          originalUsageKey: String(item.key ?? ''),
          canonicalKey: usageKey ? `col:${usageKey}` : undefined,
          name: String(item.vernacularName ?? item.name ?? item.scientificName ?? ''),
          canonicalName: String(item.canonicalName ?? item.name ?? ''),
          scientificName: String(item.scientificName ?? item.name ?? ''),
          status: acceptedStatus ? 'ACCEPTED' : String(item.status ?? item.taxonomicStatus ?? 'UNKNOWN'),
          rank,
          genus: item.genus ? String(item.genus) : undefined,
          family: item.family ? String(item.family) : undefined,
          order: item.order ? String(item.order) : undefined,
          className: item.class ? String(item.class) : undefined,
          phylum: item.phylum ? String(item.phylum) : undefined,
          kingdom: item.kingdom ? String(item.kingdom) : undefined,
          synonym: !acceptedStatus || Boolean(acceptedKey),
          acceptedKey: acceptedKey ? String(acceptedKey) : undefined,
        };
      });
    return NextResponse.json({ results, source: 'GBIF Species API', taxonomy: 'Catalogue of Life XR', checklistKey: COL_XR });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Taxonomy search timed out.' : 'Taxonomy service is unavailable.';
    return NextResponse.json({ results: [], error: message }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
