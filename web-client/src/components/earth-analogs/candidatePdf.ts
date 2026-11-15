import type { jsPDF } from 'jspdf';
import type { DiscoveryCandidate, DiscoverySource, DiscoveryTarget, EarthDiscovery } from '@shared/types/earth-discovery';

type Pdf = jsPDF;

const NAVY = [19, 43, 59] as const;
const CYAN = [0, 139, 163] as const;
const ORANGE = [203, 104, 45] as const;
const MUTED = [80, 102, 116] as const;
const PALE = [236, 244, 247] as const;
const LINE = [205, 218, 225] as const;

function ascii(value: unknown): string {
  return String(value)
    .replace(/[–—]/g, '-')
    .replace(/×/g, 'x')
    .replace(/°/g, ' deg')
    .replace(/²/g, '2')
    .replace(/©/g, '(c)')
    .replace(/·/g, ' | ')
    .normalize('NFKD')
    .replace(/[^\x20-\x7e\n]/g, '');
}

function number(value: number, digits = 2): string {
  return Number.isFinite(value) ? value.toFixed(digits).replace(/\.0+$|(?<=\.[0-9]*?)0+$/g, '') : '-';
}

function coordinates(latitude: number, longitude: number): string {
  return `${number(Math.abs(latitude), 5)} ${latitude < 0 ? 'S' : 'N'}, ${number(Math.abs(longitude), 5)} ${longitude < 0 ? 'W' : 'E'}`;
}

function safeHttps(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.href : 'Unsafe source URL omitted';
  } catch {
    return 'Invalid source URL omitted';
  }
}

function textBlock(doc: Pdf, value: string, x: number, y: number, width: number, options: { size?: number; color?: readonly [number, number, number]; line?: number; bold?: boolean } = {}): number {
  const size = options.size ?? 8.5;
  const line = options.line ?? size * 0.42;
  doc.setFont('helvetica', options.bold ? 'bold' : 'normal');
  doc.setFontSize(size);
  doc.setTextColor(...(options.color ?? NAVY));
  const lines = doc.splitTextToSize(ascii(value), width) as string[];
  doc.text(lines, x, y);
  return y + lines.length * line;
}

function pageTitle(doc: Pdf, eyebrow: string, title: string, detail?: string): number {
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, 210, 31, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(105, 225, 239);
  doc.setFontSize(7.5);
  doc.text(ascii(eyebrow).toUpperCase(), 15, 10);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(17);
  doc.text(ascii(title), 15, 20);
  if (detail) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(207, 225, 232);
    doc.text(ascii(detail), 15, 27);
  }
  return 42;
}

function heading(doc: Pdf, title: string, y: number): number {
  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.8);
  doc.line(15, y, 19, y);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...NAVY);
  doc.setFontSize(10);
  doc.text(ascii(title).toUpperCase(), 22, y + 1.1);
  return y + 7;
}

function metricCard(doc: Pdf, x: number, y: number, width: number, label: string, value: string, note?: string): void {
  doc.setFillColor(...PALE);
  doc.roundedRect(x, y, width, 24, 2, 2, 'F');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(ascii(label).toUpperCase(), x + 4, y + 6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...NAVY);
  doc.text(ascii(value), x + 4, y + 15);
  if (note) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED);
    doc.text(ascii(note), x + 4, y + 20.5);
  }
}

function ramp(value: number, minimum: number, maximum: number): [number, number, number] {
  const t = maximum === minimum ? 0.5 : Math.max(0, Math.min(1, (value - minimum) / (maximum - minimum)));
  const stops: [number, number, number][] = [[13, 54, 75], [0, 139, 163], [117, 207, 190], [244, 199, 92], [191, 76, 48]];
  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  return stops[index].map((channel, i) => Math.round(channel + (stops[index + 1][i] - channel) * mix)) as [number, number, number];
}

function heatmap(doc: Pdf, values: number[], size: number, x: number, y: number, width: number, minimum: number, maximum: number, label: string): void {
  const cell = width / size;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);
  doc.text(ascii(label), x, y - 3);
  values.forEach((value, index) => {
    doc.setFillColor(...ramp(value, minimum, maximum));
    doc.rect(x + index % size * cell, y + Math.floor(index / size) * cell, cell + 0.08, cell + 0.08, 'F');
  });
  doc.setDrawColor(...NAVY);
  doc.setLineWidth(0.25);
  doc.rect(x, y, width, width);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(...MUTED);
  doc.text('Source-grid order', x, y + width + 5);
}

function elevationLegend(doc: Pdf, x: number, y: number, width: number, minimum: number, maximum: number): void {
  for (let i = 0; i < 60; i += 1) {
    doc.setFillColor(...ramp(minimum + (maximum - minimum) * i / 59, minimum, maximum));
    doc.rect(x + i * width / 60, y, width / 60 + 0.08, 4, 'F');
  }
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...MUTED);
  doc.text(`${number(minimum, 1)} m`, x, y + 8);
  doc.text(`${number(maximum, 1)} m`, x + width, y + 8, { align: 'right' });
  doc.text('Shared relative-elevation colour scale', x + width / 2, y + 8, { align: 'center' });
}

function profileChart(doc: Pdf, earth: number[], target: number[], spacing: number, x: number, y: number, width: number, height: number, targetLabel: string): void {
  const maximum = Math.max(1, ...earth, ...target);
  doc.setDrawColor(...LINE);
  doc.setLineWidth(0.2);
  for (const fraction of [0, 0.5, 1]) {
    const lineY = y + height - fraction * height;
    doc.line(x, lineY, x + width, lineY);
    doc.setFontSize(5.8);
    doc.setTextColor(...MUTED);
    doc.text(`${number(maximum * fraction, 1)} m`, x - 2, lineY + 1.5, { align: 'right' });
  }
  const draw = (values: number[], color: readonly [number, number, number]) => {
    doc.setDrawColor(...color);
    doc.setLineWidth(0.9);
    for (let i = 1; i < values.length; i += 1) {
      doc.line(x + (i - 1) * width / (values.length - 1), y + height - values[i - 1] / maximum * height, x + i * width / (values.length - 1), y + height - values[i] / maximum * height);
    }
  };
  draw(earth, CYAN);
  draw(target, ORANGE);
  doc.setFontSize(6.2);
  doc.setTextColor(...MUTED);
  doc.text('0 m', x, y + height + 5);
  doc.text(`${(earth.length - 1) * spacing} m`, x + width, y + height + 5, { align: 'right' });
  doc.setTextColor(...CYAN);
  doc.text('Earth', x, y - 3);
  doc.setTextColor(...ORANGE);
  doc.text(targetLabel, x + 18, y - 3);
}

function histogram(doc: Pdf, earth: number[], target: number[], bins: number[], x: number, y: number, width: number, height: number): void {
  const maximum = Math.max(0.01, ...earth, ...target);
  const group = width / earth.length;
  doc.setDrawColor(...LINE);
  doc.line(x, y + height, x + width, y + height);
  earth.forEach((value, index) => {
    const barWidth = group * 0.28;
    doc.setFillColor(...CYAN);
    doc.rect(x + index * group + group * 0.18, y + height - value / maximum * height, barWidth, value / maximum * height, 'F');
    doc.setFillColor(...ORANGE);
    doc.rect(x + index * group + group * 0.52, y + height - target[index] / maximum * height, barWidth, target[index] / maximum * height, 'F');
    doc.setFontSize(5.6);
    doc.setTextColor(...MUTED);
    const label = index === earth.length - 1 ? `${bins[index]}-${bins[index + 1]}` : `${bins[index]}-${bins[index + 1]}`;
    doc.text(label, x + index * group + group / 2, y + height + 5, { align: 'center' });
  });
  doc.setFontSize(6.2);
  doc.setTextColor(...CYAN);
  doc.text('Earth', x, y - 3);
  doc.setTextColor(...ORANGE);
  doc.text('Target', x + 17, y - 3);
  doc.setTextColor(...MUTED);
  doc.text('Slope bin (deg); bar height = measured fraction', x + width / 2, y + height + 11, { align: 'center' });
}

function metricTable(doc: Pdf, candidate: DiscoveryCandidate, target: DiscoveryTarget, targetLabel: string, y: number): number {
  const rows: [string, number, number, string][] = [
    ['Mean slope', candidate.metrics.mean_slope_deg, target.metrics.mean_slope_deg, 'deg'],
    ['95th percentile slope', candidate.metrics.p95_slope_deg, target.metrics.p95_slope_deg, 'deg'],
    ['Relief', candidate.metrics.relief_m, target.metrics.relief_m, 'm'],
    ['Roughness', candidate.metrics.roughness_m, target.metrics.roughness_m, 'm'],
    ['Valid coverage', candidate.metrics.valid_fraction * 100, target.metrics.valid_fraction * 100, '%'],
  ];
  const heights = 9;
  doc.setFillColor(...NAVY);
  doc.rect(15, y, 180, heights, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('METRIC', 19, y + 5.7);
  doc.text('EARTH', 136, y + 5.7, { align: 'right' });
  doc.text(ascii(targetLabel).toUpperCase(), 190, y + 5.7, { align: 'right' });
  rows.forEach((row, index) => {
    const rowY = y + heights + index * heights;
    if (index % 2 === 0) {
      doc.setFillColor(...PALE);
      doc.rect(15, rowY, 180, heights, 'F');
    }
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...NAVY);
    doc.text(row[0], 19, rowY + 5.8);
    doc.text(`${number(row[1], 3)} ${row[3]}`, 136, rowY + 5.8, { align: 'right' });
    doc.text(`${number(row[2], 3)} ${row[3]}`, 190, rowY + 5.8, { align: 'right' });
  });
  return y + heights * (rows.length + 1);
}

function sourceEntry(doc: Pdf, source: DiscoverySource, y: number, selected: boolean): number {
  const fill: readonly [number, number, number] = selected ? PALE : [248, 250, 251];
  doc.setFillColor(...fill);
  doc.roundedRect(15, y, 180, 38, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.4);
  doc.setTextColor(...NAVY);
  doc.text(doc.splitTextToSize(ascii(`${source.title} | ${source.provider} | ${source.role}`), 172) as string[], 19, y + 5);
  textBlock(doc, `${source.bytes.toLocaleString('en-US')} bytes | SHA-256 ${source.sha256}`, 19, y + 13, 172, { size: 6.3, line: 2.7, color: MUTED });
  textBlock(doc, source.hash_scope, 19, y + 19, 172, { size: 5.8, line: 2.4, color: MUTED });
  textBlock(doc, source.license, 19, y + 25, 172, { size: 5.8, line: 2.4, color: MUTED });
  textBlock(doc, safeHttps(source.url), 19, y + 33, 172, { size: 5.2, line: 2.1, color: CYAN });
  return y + 41;
}

function validate(discovery: EarthDiscovery, candidate: DiscoveryCandidate, target: DiscoveryTarget): void {
  const size = discovery.method.grid_size;
  const complete = (values: number[]) => values.length === size * size && values.every(Number.isFinite);
  if (!candidate.comparisons[target.id] || !Number.isInteger(size) || size < 2 || size > 100 || !complete(candidate.heights_m) || !complete(target.heights_m)) {
    throw new Error('A complete measured candidate comparison is required for the PDF report.');
  }
  if (!discovery.targets.some(item => item.id === target.id) || !discovery.candidates.some(item => item.id === candidate.id)) {
    throw new Error('The candidate and target must belong to this discovery run.');
  }
}

export async function buildCandidatePdf(discovery: EarthDiscovery, candidate: DiscoveryCandidate, target: DiscoveryTarget): Promise<Blob> {
  validate(discovery, candidate, target);
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: false, putOnlyUsedFonts: true });
  const comparison = candidate.comparisons[target.id];
  const targetLabel = target.body === 'moon' ? 'Moon' : 'Mars';
  const size = discovery.method.grid_size;
  const row = Math.min(4, size - 1);
  const earthProfile = candidate.heights_m.slice(row * size, (row + 1) * size);
  const targetProfile = target.heights_m.slice(row * size, (row + 1) * size);
  const allHeights = [...candidate.heights_m, ...target.heights_m];
  const minimum = Math.min(...allHeights);
  const maximum = Math.max(...allHeights);

  doc.setProperties({
    title: ascii(`${candidate.name} - ${target.name} scientific terrain report`),
    subject: ascii(`ASTRAS measured terrain comparison | Run ${discovery.run_id}`),
    author: 'ASTRAS Planetary Analog Explorer',
    keywords: ascii(`Earth ${targetLabel} terrain ${discovery.run_id} ${candidate.id} ${target.id}`),
    creator: 'ASTRAS Planetary Analog Explorer',
  });

  let y = pageTitle(doc, 'ASTRAS | Challenge 5 | Scientific candidate report', candidate.name, `Earth terrain comparison with ${target.name}`);
  y = heading(doc, 'Mission brief', y);
  y = textBlock(doc, `This report compares one measured 600 m Earth terrain window with the selected ${targetLabel} target on the same 10 x 10 aggregate grid. It is a reproducible exploratory terrain comparison, not a mission-suitability recommendation or a probability of similarity.`, 15, y, 180, { size: 9.3, line: 4.3 });
  metricCard(doc, 15, y + 6, 56, 'Exploratory distance', number(comparison.distance, 6), 'Lower is closer');
  metricCard(doc, 77, y + 6, 56, 'Rank in eligible cohort', `${comparison.rank} / ${discovery.domain.eligible_count}`, 'Bounded domain only');
  metricCard(doc, 139, y + 6, 56, 'Sensitivity rank', String(comparison.sensitivity_rank), '0.5 / 0.5 weights');
  y += 39;
  y = heading(doc, 'Selected locations', y);
  y = textBlock(doc, `Earth centre   ${coordinates(candidate.latitude, candidate.longitude)}   |   ${candidate.id}\n${targetLabel} centre   ${coordinates(target.latitude, target.longitude)}   |   ${target.id}`, 15, y, 180, { size: 9, line: 5.2, bold: true });
  y += 5;
  y = heading(doc, 'Measurement support', y);
  y = textBlock(doc, `${discovery.method.window_size_m} m window | ${size} x ${size} cells | ${discovery.method.grid_spacing_m} m aggregation spacing | ${(size - 1) * discovery.method.grid_spacing_m} m between outer cell centres\nSearch domain: ${discovery.domain.name} | ${number(discovery.domain.area_km2, 0)} km2 | ${discovery.domain.generated_count} generated | ${discovery.domain.eligible_count} eligible | ${discovery.domain.excluded_count} excluded | Survey CRS ${discovery.domain.crs}`, 15, y, 180, { size: 8.2, line: 4.3 });
  y += 4;
  y = heading(doc, 'Interpretation boundary', y);
  textBlock(doc, discovery.method.uncertainty, 15, y, 180, { size: 8.5, line: 4 });

  doc.addPage();
  y = pageTitle(doc, 'Measured terrain', 'Equal-scale elevation evidence', `Actual ${size} x ${size} grids; shared colours and shared metre axes`);
  heatmap(doc, candidate.heights_m, size, 15, y + 7, 80, minimum, maximum, 'Earth candidate');
  heatmap(doc, target.heights_m, size, 115, y + 7, 80, minimum, maximum, `${targetLabel} target`);
  elevationLegend(doc, 50, y + 94, 110, minimum, maximum);
  y += 115;
  y = heading(doc, `Vector profile | measured row ${row + 1}`, y);
  profileChart(doc, earthProfile, targetProfile, discovery.method.grid_spacing_m, 25, y + 7, 165, 48, targetLabel);
  textBlock(doc, `All ${size * size} coloured cells and all ${earthProfile.length} profile samples are values stored in run ${discovery.run_id}. Heights are metres above each window's own minimum. Connecting lines add no intermediate measurements and the grids do not imply a common geographic bearing.`, 15, y + 66, 180, { size: 7.5, line: 3.4, color: MUTED });

  doc.addPage();
  y = pageTitle(doc, 'Quantitative comparison', 'Terrain metrics and slope distributions', 'Values are calculated from the selected measured grids');
  y = metricTable(doc, candidate, target, targetLabel, y + 3) + 13;
  y = heading(doc, 'Slope histogram', y);
  histogram(doc, candidate.metrics.slope_histogram, target.metrics.slope_histogram, discovery.method.slope_bins_deg, 22, y + 8, 166, 54);
  y += 79;
  y = heading(doc, 'Ranking result', y);
  y = textBlock(doc, `Distance ${number(comparison.distance, 6)}; baseline rank ${comparison.rank} of ${discovery.domain.eligible_count}; sensitivity rank ${comparison.sensitivity_rank}. The candidate is ${comparison.shortlisted ? 'included in' : 'outside'} the spatially separated shortlist (${number(discovery.method.shortlist_separation_m, 0)} m minimum separation). Novelty status: ${candidate.novelty.replaceAll('_', ' ')}.`, 15, y, 180, { size: 8.4, line: 4 });
  y += 4;
  y = heading(doc, 'Distance definition', y);
  textBlock(doc, discovery.method.distance_formula, 15, y, 180, { size: 7.6, line: 3.6, color: MUTED });

  doc.addPage();
  y = pageTitle(doc, 'Scientific interpretation', 'Method, limits, and reproducibility', discovery.method.name);
  y = heading(doc, 'Method', y);
  y = textBlock(doc, `${discovery.method.description}\n${discovery.method.sensitivity}`, 15, y, 180, { size: 8.4, line: 4 }) + 5;
  y = heading(doc, 'What this result supports', y);
  y = textBlock(doc, `Within the frozen ${number(discovery.domain.area_km2, 0)} km2 search domain, this Earth window has rank ${comparison.rank} for the stated distance to the selected target. The comparison supports terrain-shape exploration at the declared 600 m support and 60 m aggregate spacing.`, 15, y, 180, { size: 8.4, line: 4 }) + 5;
  y = heading(doc, 'Scientific limitations', y);
  const limits = [
    `Rank is local to ${discovery.domain.eligible_count} eligible windows in one bounded Earth domain and ${discovery.targets.length} prepared targets; it is not a global-best or new-to-science claim.`,
    'Geology, climate, radiation, gravity, water ice, hazards, access and operational constraints were not measured.',
    'Terrain resemblance does not establish habitat suitability, landing safety, scientific value or a calibrated probability.',
    ...discovery.limitations,
    ...target.limitations,
  ];
  limits.forEach((limit, index) => {
    const next = textBlock(doc, `${index + 1}. ${limit}`, 18, y, 174, { size: 7.6, line: 3.5, color: index < 3 ? NAVY : MUTED });
    y = next + 2;
  });
  y = heading(doc, 'Run identity', Math.max(y + 2, 228));
  textBlock(doc, `Run ID ${discovery.run_id}\nGenerated ${discovery.generated_at}\nMethod profile SHA-256 ${discovery.method.profile_sha256}\nReference baseline SHA-256 ${discovery.baseline.sha256}`, 15, y, 180, { size: 7.2, line: 3.6, color: MUTED });

  doc.addPage();
  y = pageTitle(doc, 'Data provenance', 'Source catalogue and exact identities', 'Earth evidence and selected target sources used by this report');
  const selectedIds = new Set(target.source_ids);
  const sources = discovery.sources.filter(source => source.role.startsWith('Earth') || selectedIds.has(source.id));
  for (const source of sources) {
    y = sourceEntry(doc, source, y, selectedIds.has(source.id));
  }
  textBlock(doc, `Selected target source IDs: ${target.source_ids.join(', ')}. Source hashes and byte counts identify the exact objects or byte ranges described by each hash scope. Linked data providers do not endorse this exploratory comparison.`, 15, Math.min(y + 2, 258), 180, { size: 6.6, line: 3, color: MUTED });

  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...LINE);
    doc.setLineWidth(0.2);
    doc.line(15, 284, 195, 284);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.4);
    doc.setTextColor(...MUTED);
    doc.text(`ASTRAS scientific candidate report | ${ascii(discovery.run_id)}`, 15, 289);
    doc.text(`${page} / ${pages}`, 195, 289, { align: 'right' });
  }

  return doc.output('blob');
}
