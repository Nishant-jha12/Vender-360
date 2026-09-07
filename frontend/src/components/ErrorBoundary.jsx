import { Component } from 'react';

/**
 * Catches a render that throws, so the app never goes to a blank white page.
 *
 * A shopkeeper mid-sale with a white screen has no idea whether the bill was
 * saved, and no way forward. This shows what happened and offers a way out.
 *
 * Deliberately plain: no i18n, no router, no icon library, no design tokens
 * that depend on anything having loaded. It runs when other things are already
 * broken, so it may not assume they work -- colours are literals for the same
 * reason, with both themes handled by a media query in index.css.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Nothing collects these yet, so the console is the only record.
    console.error('Vendor360 crashed:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const { title, onReset, resetLabel } = this.props;

    return (
      <div className="crash-screen" role="alert">
        <div className="crash-card">
          <h1>{title || 'Something broke on this screen'}</h1>
          <p>
            Your data is safe — nothing is lost. Anything you had already saved
            is still there.
          </p>

          <div className="crash-actions">
            {onReset && (
              <button
                type="button"
                onClick={() => {
                  this.setState({ error: null });
                  onReset();
                }}
              >
                {resetLabel || 'Go back'}
              </button>
            )}
            <button
              type="button"
              className="crash-primary"
              onClick={() => window.location.reload()}
            >
              Reload the app
            </button>
          </div>

          {/* The message, for a screenshot to whoever supports this shop. */}
          <details>
            <summary>Technical details</summary>
            <pre>{String(this.state.error?.message || this.state.error)}</pre>
          </details>
        </div>
      </div>
    );
  }
}
