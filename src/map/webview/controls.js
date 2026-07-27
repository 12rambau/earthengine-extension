/**
 * @module controls
 * Satellite and plan-view toggle buttons with theme-sync observer.
 */

import { setBasemap, isDarkTheme } from './basemap.js';

// ==================================================================
// CONTROLS
// ==================================================================

let activeMode = 'theme'; // 'theme' | 'plan' | 'satellite'

const satelliteBtn = document.getElementById('satellite-toggle');
const planBtn = document.getElementById('plan-toggle');

let _satelliteBasemap, _planBasemap, _darkBasemap, _lightBasemap;

/**
 * Wires the control buttons to the given basemap provider IDs.
 * Must be called after `initBasemap`.
 *
 * @param {{ satelliteBasemap: string, planBasemap: string, darkBasemap: string, lightBasemap: string }} config
 */
export function initControls({ satelliteBasemap, planBasemap, darkBasemap, lightBasemap }) {
  _satelliteBasemap = satelliteBasemap;
  _planBasemap = planBasemap;
  _darkBasemap = darkBasemap;
  _lightBasemap = lightBasemap;
}

function activateMode(mode) {
  if (activeMode === mode) {
    activeMode = 'theme';
    satelliteBtn.classList.remove('active');
    planBtn.classList.remove('active');
    setBasemap(isDarkTheme() ? _darkBasemap : _lightBasemap);
  } else {
    activeMode = mode;
    satelliteBtn.classList.toggle('active', mode === 'satellite');
    planBtn.classList.toggle('active', mode === 'plan');
    setBasemap(mode === 'satellite' ? _satelliteBasemap : _planBasemap);
  }
}

new MutationObserver(() => {
  if (activeMode === 'theme' && _darkBasemap) {
    setBasemap(isDarkTheme() ? _darkBasemap : _lightBasemap);
  }
}).observe(document.body, { attributes: true, attributeFilter: ['class'] });

satelliteBtn.addEventListener('click', () => activateMode('satellite'));
planBtn.addEventListener('click', () => activateMode('plan'));
