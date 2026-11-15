import {
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
} from '@ui-sdk/react/segmented-control';
import { ArrowLeft, Orbit } from 'lucide-react';
import type { ExplorerBody, ExplorerHeaderProps } from './unifiedTypes';
import './earth-stage.css';

const WORLDS: { id: ExplorerBody; index: string; label: string }[] = [
  { id: 'earth', index: '00', label: 'Earth' },
  { id: 'moon', index: '01', label: 'Moon' },
  { id: 'mars', index: '02', label: 'Mars' },
];

export function ExplorerHeader({
  body,
  contextLabel,
  isTerrain,
  onBodyChange,
  onReturnToOrbit,
  actions,
}: ExplorerHeaderProps) {
  return (
    <header className="px-nav es-header" data-terrain={isTerrain}>
      <div className="px-nav-left">
        <a
          className="px-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            if (isTerrain) onReturnToOrbit();
          }}
        >
          <Orbit size={18} className="px-brand-icon" aria-hidden="true" />
          <span className="px-brand-text">ASTRAS</span>
        </a>
        {contextLabel && (
          <>
            <span className="px-context-sep" aria-hidden="true">
              /
            </span>
            <span className="px-context-label" title={contextLabel}>
              {contextLabel}
            </span>
          </>
        )}
      </div>

      <div className="px-nav-center es-header-center">
        <SegmentedControl
          value={body}
          onValueChange={(next) => {
            if (next === 'earth' || next === 'moon' || next === 'mars') {
              onBodyChange(next);
            }
          }}
          aria-label="Select world"
          className="px-segmented"
        >
          <SegmentedControlIndicator className="px-segmented-indicator" />
          {WORLDS.map((world) => (
            <SegmentedControlItem
              key={world.id}
              value={world.id}
              className="px-segmented-item"
            >
              <span className="px-body-index">{world.index}</span>
              <span>{world.label}</span>
            </SegmentedControlItem>
          ))}
        </SegmentedControl>

        {isTerrain && (
          <button
            type="button"
            className="px-return-btn es-return-btn"
            onClick={onReturnToOrbit}
            title="Return to orbit"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>Return to orbit</span>
          </button>
        )}
      </div>

      <nav className="px-nav-actions es-header-actions" aria-label="Workspace navigation">
        {actions}
      </nav>
    </header>
  );
}

export default ExplorerHeader;
