import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { registerServiceWorker } from './services/pushNotificationService';
import { setupVitePreloadErrorHandler } from './utils/lazyImportWithRetry';

document.documentElement.lang = 'ar';
document.documentElement.dir = 'rtl';

// Catch Vite dynamic chunk loading errors and auto-reload on new deployment
setupVitePreloadErrorHandler();

// Register PWA / FCM Service Worker
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerServiceWorker();
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

