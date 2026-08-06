/** @module panelTasksView.webview — Mounts the Svelte app. */
import { mount } from 'svelte';
import App from './PanelTasksView.svelte';

mount(App, { target: document.getElementById('app') });
