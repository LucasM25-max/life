import { NextResponse } from 'next/server';

const GBIF = 'https://api.gbif.org/v1/species/search';
const COL_XR = '7ddf754f-d193-4cc9-b351-99906754a03b';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q')?.trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '16'), 1), 25);
  if (!q) return NextResponse.json({ results: [], source: 'GBIF Species API', taxonomy: 'COL XR' });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const upstream = new URL(GBIF);
    upstream.searchParams.set('q', q);
    upstream.searchParams.set('limit', String(limit));
    upstream.searchParams.set('rank', 'SPECIES');
    upstream.searchParams.set('checklistKey', COL_XR);
    const response = await fetch(upstream, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
      next: { revalidate: 300 },
    });
    if (!response.ok) return NextResponse.json({ results: [], error: `Taxonomy search returned ${response.status}.` }, { status: 502 });
    const data = await response.json() as { results?: Array<Record<string, unknown>> };
    const results = (data.results ?? []).filter((item) => item.rank === 'SPECIES').map((item) => ({
      usageKey: String(item.key ?? ''),
      name: String(item.name ?? item.scientificName ?? ''),
      canonicalName: String(item.canonicalName ?? item.name ?? ''),
      scientificName: String(item.scientificName ?? item.name ?? ''),
      status: String(item.status ?? item.taxonomicStatus ?? 'UNKNOWN'),
      rank: String(item.rank ?? 'SPECIES'),
      genus: String(item.genus ?? ''),
      family: String(item.family ?? ''),
      order: String(item.order ?? ''),
      className: String(item.class ?? ''),
      phylum: String(item.phylum ?? ''),
      kingdom: String(item.kingdom ?? ''),
      synonym: Boolean(item.synonym ?? false),
      acceptedKey: item.acceptedKey ? String(item.acceptedKey) : undefined,
    }));
    return NextResponse.json({ results, source: 'GBIF Species API', taxonomy: 'Catalogue of Life XR', checklistKey: COL_XR });
  } catch (error) {
    const message = error instanceof Error && error.name === 'AbortError' ? 'Taxonomy search timed out.' : 'Taxonomy service is unavailable.';
    return NextResponse.json({ results: [], error: message }, { status: 503 });
  } finally {
    clearTimeout(timeout);
  }
}
