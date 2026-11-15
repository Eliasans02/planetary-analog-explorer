import { Component, lazy, Suspense, useState, type ReactNode } from 'react';
import { PlanetExplorer } from './components/PlanetExplorer';

const SurfaceExplorer = lazy(() => import('./components/SurfaceExplorer').then(module => ({
  default: module.SurfaceExplorer,
})));
const SimilarityWorkspace = lazy(() => import('./SimilarityWorkspace').then(module => ({
  default: module.SimilarityWorkspace,
})));

class WorkspaceBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return <div className="px-message" role="alert">
        <p>This workspace could not be opened. Return to the planet explorer or reload the app to try again.</p>
        <button onClick={() => window.location.reload()}>Reload app</button>
      </div>;
    }
    return this.props.children;
  }
}

export default function App() {
  const workspace = new URLSearchParams(window.location.search).get('workspace');
  const [view, setView] = useState<'planets' | 'surfaces' | 'similarity'>(() => workspace === 'calibrated' ? 'similarity' : 'planets');
  const [initialBody, setInitialBody] = useState<'earth' | 'moon'>(workspace === 'earth' ? 'earth' : 'moon');
  if (view === 'planets') {
    return <PlanetExplorer initialBody={initialBody} onSurfaces={() => setView('surfaces')} />;
  }
  return <>
    <button className="px-section-return" onClick={() => setView('planets')}>← Planet explorer</button>
    <WorkspaceBoundary key={view}>
      <Suspense fallback={<div className="px-message" role="status">Opening workspace…</div>}>
        {view === 'surfaces'
          ? <SurfaceExplorer onWorkspace={() => { setInitialBody('earth'); setView('planets'); }} />
          : <SimilarityWorkspace />}
      </Suspense>
    </WorkspaceBoundary>
  </>;
}
