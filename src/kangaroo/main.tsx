import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../index.css';
import { KangarooPage } from './KangarooPage';

/**
 * The standalone entry. Kangaroo has nothing to do with the card prototype it
 * shares a repo with, so it ships as its own page rather than as a mode behind
 * the game's menu — that is what lets it be handed over as one self-contained
 * offline file. The in-app button stays as a convenience during development.
 */
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <KangarooPage />
  </StrictMode>,
);
