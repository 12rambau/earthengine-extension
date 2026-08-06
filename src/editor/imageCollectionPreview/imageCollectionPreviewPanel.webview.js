/** @module imageCollectionPreviewPanel.webview — Mounts the Svelte app. */
import { mount } from 'svelte';
import App from './ImageCollectionPreview.svelte';

mount(App, { target: document.getElementById('app') });
