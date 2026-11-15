import { Component, type ReactNode } from 'react';

export class EarthViewBoundary extends Component<{
  children: ReactNode;
  label: string;
  onReturnSurvey: () => void;
}, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="es-compare-fallback" role="alert">
      <h3>{this.props.label} could not be opened</h3>
      <p>Your survey results are still available.</p>
      <button className="es-btn-accent" onClick={this.props.onReturnSurvey}>Return to survey map</button>
    </div>;
  }
}
