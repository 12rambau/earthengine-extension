/** @module tasksPanel.webview — Mounts the Svelte app. */
import { mount } from 'svelte';
import App from './TasksPanel.svelte';

mount(App, { target: document.getElementById('app') });
