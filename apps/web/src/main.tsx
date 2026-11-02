import { StrictMode, Component, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { lockCrypto } from './crypto-client';
import './styles.css';

class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    lockCrypto();
  }
  render() {
    if (this.state.failed)
      return (
        <main className="loading-screen">
          <h1>Your vault has been locked.</h1>
          <p>Something unexpected happened. Reload to start a fresh session.</p>
          <button className="button primary" onClick={() => location.reload()}>
            Reload Vaultline
          </button>
        </main>
      );
    return this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
