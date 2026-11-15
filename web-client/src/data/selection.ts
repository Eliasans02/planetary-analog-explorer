import type { Analog, Comparison, Location, LocationsDataset } from '@shared/types/analog-location';

export interface LocationOption {
  key: string;
  location: Location;
  comparison: Comparison;
  label: string;
}

export interface ComparisonSelection { targetId: string; profileId: string; locationId: string }
export interface ResolvedComparisonSelection {
  selection: ComparisonSelection; comparison: Comparison; location: Location; analog: Analog | null;
}
export interface ComparisonSelectionOption extends ResolvedComparisonSelection { key: string; label: string }
export function selectionKey(selection: ComparisonSelection): string;
export function selectionKey(comparison: Comparison, locationId: string): string;
export function selectionKey(value: ComparisonSelection | Comparison, locationId?: string): string {
  const selection = 'target' in value
    ? {targetId: value.target.id, profileId: value.profile_id, locationId: locationId!} : value;
  return JSON.stringify([selection.targetId, selection.profileId, selection.locationId]);
}
export function resolveSelection(dataset: LocationsDataset, selection: ComparisonSelection | null): ResolvedComparisonSelection | null {
  if (!selection) return null;
  const comparisons = dataset.comparisons.filter(c => c.target.id === selection.targetId && c.profile_id === selection.profileId);
  if (comparisons.length !== 1) return null;
  const comparison = comparisons[0];
  if (comparison.target.id === selection.locationId) return {selection, comparison, location: comparison.target, analog: null};
  const analogs = comparison.analogs.filter(a => a.location.id === selection.locationId);
  return analogs.length === 1 ? {selection, comparison, location: analogs[0].location, analog: analogs[0]} : null;
}
export function listSelectionOptions(dataset: LocationsDataset): ComparisonSelectionOption[] {
  return buildLocationOptions(dataset.comparisons).flatMap(option => {
    const selection = {targetId: option.comparison.target.id, profileId: option.comparison.profile_id, locationId: option.location.id};
    const resolved = resolveSelection(dataset, selection);
    return resolved ? [{...resolved, key: option.key, label: option.label}] : [];
  });
}
/** Reload keeps the exact valid context; otherwise first prepared target, or null. */
export function reconcileSelection(dataset: LocationsDataset, selection: ComparisonSelection | null): ComparisonSelection | null {
  return resolveSelection(dataset, selection)?.selection ?? listSelectionOptions(dataset)[0]?.selection ?? null;
}

/** The same Earth site can have a different result for each planetary target. */
export function buildLocationOptions(comparisons: Comparison[]): LocationOption[] {
  return comparisons.flatMap((comparison) => [
    {
      key: selectionKey(comparison, comparison.target.id),
      location: comparison.target,
      comparison,
      label: `${comparison.target.body.toUpperCase()} · ${comparison.target.name} · ${comparison.profile_id}`,
    },
    ...comparison.analogs.map((analog) => ({
      key: selectionKey(comparison, analog.location.id),
      location: analog.location,
      comparison,
      label: `EARTH #${analog.rank} · ${analog.location.name} — ${comparison.target.name} (${analog.similarity_score.toFixed(1)}%, ${comparison.profile_id})`,
    })),
  ]);
}

export function findLocationOption(
  options: LocationOption[],
  locationId: string,
  comparison?: Comparison | null,
): LocationOption | null {
  if (comparison) {
    const matches = options.filter((option) => option.key === selectionKey(comparison, locationId));
    return matches.length === 1 ? matches[0] : null;
  }
  const matches = options.filter((option) => option.location.id === locationId);
  // An ambiguous globe selection must not silently switch the active comparison.
  return matches.length === 1 ? matches[0] : null;
}
