import './style.css';
import { App } from './ui/app.ts';

const app = new App(document.getElementById('app')!);
// Handle for the smoke test and for poking at a run from the console.
(window as unknown as { unfolding: App }).unfolding = app;
