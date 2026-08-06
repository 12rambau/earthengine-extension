/** @module datasetPanel.webview — Mounts the Svelte app. */
import { mount } from 'svelte';
import App from './DatasetPanel.svelte';

mount(App, { target: document.getElementById('app') });
