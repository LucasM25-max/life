import { NextResponse } from 'next/server';

const GBIF = 'https://api.gbif.org/v1/species/search';
const COL_XR = '7ddf754f-d193-4cc9-b351-99906754a03b';
const ALLOWED_RANKS = new Set(['SPECIES', 'SUBSPECIES', 'VARIETY', 'FORM']);

function virusLike(item: Record<string, unknown>) {
  const text = [item.kingdom, item.phylum, item.class, item.order, item.family].filter(Boolean).join(' ');
  return /(?:viruses|viria|viricota|viricetes|virales|viridae)/i.test(text);
}

function score(item: Record<string, unknown>, needle: string) {
  const common = String(item.vernacularName ?? '').toLowerCase();
  const scientific = String(item.canonicalName ?? item.name ?? item.scientificName ?? '').toLowerCase();
  const rank = String(item.rank ?? '').toUpperCase();
  let value = virusLike(item) ? 5000 : 0;
  if (common === needle) value -= 500;
  else if (common.startsWith(needle)) value -= 300;
  else if (common.includes(needle)) value -= 100;
  if (scientific === needle) value -= 450;
  else if (scientific.startsWith(needle)) value -= 250;
  else if (scientific.includes(needle)) value -= 80;
  if (rank === 'SPECIES') value -= 20;
  else if (rank === 'SUBSPECIES') value -= 10;
  return value;
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

    const response = await fetch(upstream, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!response.ok) return NextResponse.json({ results: [], error: `Taxonomy search returned ${response.status}.` }, { status: 502 });

    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    const results = (data.results ?? [])
      .filter((item) => ALLOWED_RANKS.has(String(item.rank ?? '').toUpperCase()))
      .filter((item) => !virusLike(item))
      .sort((a, b) => score(a, q.toLowerCase()) - score(b, q.toLowerCase()))
      .slice(0, limit)
      .map((item) => ({
        usageKey: String(item.acceptedKey ?? item.key ?? ''),
        originalUsageKey: String(item.key ?? ''),
        name: String(item.vernacularName ?? item.name ?? item.scientificName ?? ''),
        canonicalName: String(item.canonicalName ?? item.name ?? ''),
        scientificName: String(item.scientificName ?? item.name ?? ''),
        status: String(item.status ?? item.taxonomicStatus ?? 'UNKNOWN'),
        rank: String(item.rank ?? 'SPECIES').toUpperCase(),
        genus: String(item.genus ?? ''),
        family: String(item.family ?? ''),
        order: String(item.order ?? ''),
        className: String(item.class ?? ''),
        phylum: String(item.phylum ?? ''),
        kingdom: String(item.kingdom ?? ''),
        synonym: Boolean(item.synonym ?? false) || Boolean(item.acceptedKey),
        acceptedKey: item.acceptedKey ? String(item.acceptedKey) : undefined,
      }));

    const unique = Array.from(new Map(results.map((item) => [`${item.usageKey}:${item.rank}`, item])).values());
    return NextResponse.json({ results: unique, source: 'GBIF Species API', taxonomy: 'Catalogue of Life XR', checklistKey: COL_XR });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Taxonomy search timed out.' : 'Taxonomy service is unavailable.';
    return NextResponse.json({ results: [], error: message }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
