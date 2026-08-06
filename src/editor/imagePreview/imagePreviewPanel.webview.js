/** @module imagePreviewPanel.webview — Mounts the Svelte app. */
import { mount } from 'svelte';
import App from './ImagePreview.svelte';

mount(App, { target: document.getElementById('app') });
