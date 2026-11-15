import { Component, type ReactNode } from 'react';

export class StageBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    return this.state.failed ? <div className="px-message" role="alert">
      <p>This world could not be opened. You can switch worlds above or reload to retry.</p>
      <button onClick={() => window.location.reload()}>Reload app</button>
    </div> : this.props.children;
  }
}
