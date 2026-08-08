import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { App } from './App.js';
import './app.css';

// Circuits run locally against an in-memory ledger; nothing is submitted to a network.
// The testnet provider would set this to 'preview' when it connects.
setNetworkId('undeployed');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
