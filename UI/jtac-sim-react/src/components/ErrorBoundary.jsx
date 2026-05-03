import { Component } from 'react';

// Catches render-time errors anywhere in the panel tree so a single bad
// click doesn't blow up the whole app. Surfaces a recoverable error card
// instead of a white screen.

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Log so we can find the culprit in dev console.
    console.error('Panel error:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="error-card">
        <div className="error-title">Panel error</div>
        <div className="error-msg">{String(this.state.error?.message ?? this.state.error)}</div>
        <button className="error-reset" onClick={this.reset}>Recover</button>
      </div>
    );
  }
}
