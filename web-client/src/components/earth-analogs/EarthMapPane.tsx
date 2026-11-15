import { Component, lazy, Suspense, useCallback, useState, type ReactNode } from 'react';
import { Globe, Map } from 'lucide-react';
import { SurveyMap, type SurveyMapProps } from './SurveyMap';

const EarthSurveyGlobe = lazy(() => import('./EarthSurveyGlobe').then(module => ({ default: module.EarthSurveyGlobe })));

class GlobeBoundary extends Component<{ children: ReactNode; onShowMap: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div role="alert" className="eaf-globe-fallback">
      <p>The Earth globe could not be opened. Your survey results are still available.</p>
      <button className="eaf-btn-subtle" onClick={this.props.onShowMap}>Return to survey map</button>
    </div> : this.props.children;
  }
}

export function EarthMapPane(props: SurveyMapProps) {
  const [view, setView] = useState<'map' | 'globe'>('map');
  const showMap = useCallback(() => setView('map'), []);
  return <div className="eaf-pane-map">
    <div className="eaf-map-view-controls" role="group" aria-label="Earth map view">
      <button className="eaf-btn-subtle" aria-pressed={view === 'map'} onClick={showMap}>
        <Map size={14} aria-hidden="true" /> 2D survey
      </button>
      <button className="eaf-btn-subtle" aria-pressed={view === 'globe'} onClick={() => setView('globe')}>
        <Globe size={14} aria-hidden="true" /> 3D Earth
      </button>
    </div>
    {view === 'map' ? <SurveyMap {...props} /> : <GlobeBoundary onShowMap={showMap}>
      <Suspense fallback={<p role="status">Opening Earth globe…</p>}>
        <EarthSurveyGlobe discovery={props.discovery} selectedCandidateId={props.selectedCandidateId} onShowMap={showMap} />
      </Suspense>
    </GlobeBoundary>}
  </div>;
}
