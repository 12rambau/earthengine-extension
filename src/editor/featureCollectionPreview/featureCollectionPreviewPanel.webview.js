/** @module featureCollectionPreviewPanel.webview — Mounts the Svelte app. */
import { mount } from 'svelte';
import App from './FeatureCollectionPreview.svelte';

mount(App, { target: document.getElementById('app') });
