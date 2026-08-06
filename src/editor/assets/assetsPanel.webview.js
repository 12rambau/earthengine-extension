/** @module assetsPanel.webview — Mounts the Svelte app. */
import { mount } from 'svelte';
import App from './AssetsPanel.svelte';

mount(App, { target: document.getElementById('app') });
