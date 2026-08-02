/**
 * Launch the pre-installed Chromium.
 *
 * `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is set in this image, but the
 * npm `playwright` package pins a *different* browser build than the one baked
 * in (it wants chromium-1234, the image ships chromium-1194), so the automatic
 * lookup fails and an explicit executablePath is required. The directory is
 * resolved rather than hardcoded so a re-baked image does not break this.
 *
 *   import { launch } from './tools/browser.mjs';
 *   const browser = await launch();
 *
 * Never run `playwright install` — the browsers are already here.
 */
import { readdirSync } from 'node:fs';
import { chromium } from 'playwright';

const ROOT = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';

export function chromiumPath() {
  const dir = readdirSync(ROOT)
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort()
    .pop();
  if (!dir) throw new Error(`no chromium build under ${ROOT}`);
  return `${ROOT}/${dir}/chrome-linux/chrome`;
}

export function launch(opts = {}) {
  return chromium.launch({ executablePath: chromiumPath(), ...opts });
}
