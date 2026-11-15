export interface ResearchRegion {
  id: string;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
  coordinate_note: string;
  coordinate_source_url: string;
  bodies: ('moon' | 'mars')[];
  theme: string;
  mission_title: string;
  finding: string;
  limitation: string;
  papers: { title: string; authors: string; year: number; doi: string; url: string }[];
  agency_url: string;
  discovery_path: string;
  question: string;
  choices: { label: string; correct: boolean; feedback: string }[];
}

function requireValue(condition: boolean): asserts condition {
  if (!condition) throw new Error('The worldwide research catalog is invalid.');
}
function https(value: unknown) {
  requireValue(typeof value === 'string');
  const url = new URL(value);
  requireValue(url.protocol === 'https:' && !url.username && !url.password);
}
export function validateGlobalAnalogs(value: unknown): ResearchRegion[] {
  const data = value as { schema_version?: string; regions?: ResearchRegion[] };
  requireValue(!!data && data.schema_version === '1.0.0' && Array.isArray(data.regions) && data.regions.length > 0 && data.regions.length <= 50);
  const regions = data.regions;
  requireValue(new Set(regions.map(region => region.id)).size === regions.length);
  for (const region of regions) {
    requireValue(/^[a-z][a-z0-9-]{1,50}$/.test(region.id) && region.id !== 'ustyurt');
    requireValue(Number.isFinite(region.latitude) && Math.abs(region.latitude) <= 90 && Number.isFinite(region.longitude) && Math.abs(region.longitude) <= 180);
    for (const key of ['name', 'country', 'coordinate_note', 'theme', 'mission_title', 'finding', 'limitation', 'question'] as const) {
      requireValue(typeof region[key] === 'string' && region[key].length > 0 && region[key].length <= 2000);
    }
    requireValue(Array.isArray(region.bodies) && region.bodies.length > 0 && region.bodies.every(body => body === 'moon' || body === 'mars'));
    requireValue(region.discovery_path === `/data/earth-regions/${region.id}.json`);
    https(region.agency_url); https(region.coordinate_source_url);
    requireValue(Array.isArray(region.papers) && region.papers.length > 0 && region.papers.length <= 5);
    for (const paper of region.papers) {
      requireValue(typeof paper.title === 'string' && typeof paper.authors === 'string' && Number.isInteger(paper.year) && paper.year >= 1900 && /^10\.\d{4,9}\/.+/.test(paper.doi));
      https(paper.url);
    }
    requireValue(Array.isArray(region.choices) && region.choices.length === 3 && region.choices.filter(choice => choice.correct === true).length === 1);
    requireValue(region.choices.every(choice => typeof choice.label === 'string' && typeof choice.feedback === 'string' && typeof choice.correct === 'boolean'));
  }
  return regions;
}
export async function loadGlobalAnalogs(signal?: AbortSignal): Promise<ResearchRegion[]> {
  const response = await fetch('/data/global_analogs.json', { signal, redirect: 'error' });
  if (!response.ok) throw new Error('Worldwide expeditions could not be loaded.');
  const content = await response.text();
  if (content.length > 200_000) throw new Error('Worldwide catalog exceeds its loading limit.');
  return validateGlobalAnalogs(JSON.parse(content));
}
