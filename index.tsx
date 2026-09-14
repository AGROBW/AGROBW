
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { installAppErrorReporter } from './src/utils/installAppErrorReporter';
import { getLegacyHashRouteDestination } from './src/lib/legacyHashRoute';

const legacyDestination = getLegacyHashRouteDestination(window.location.origin, window.location.hash);

if (legacyDestination) {
  window.location.replace(legacyDestination);
} else {
  installAppErrorReporter();

  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
