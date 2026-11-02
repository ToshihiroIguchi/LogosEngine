import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ensureCrossOriginIsolation } from './utils/crossOriginIsolation';

// Settle isolation before the engine starts: the worker needs the shared buffers at creation time
void ensureCrossOriginIsolation().finally(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
});
