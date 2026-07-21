/**
 * @module mapPanel
 * Leaflet-based map WebView panel for the Earth Engine extension.
 *
 * Renders a full-screen Leaflet map with dark/light/satellite base
 * layers, a layer control panel, and a status bar. Receives tile layer,
 * GeoJSON, and viewport commands from Python scripts via the bridge server.
 */

import * as vscode from 'vscode';
import { EditorPanel } from '../shared/baseComponents.js';
import { MapBridgeServer, MapCommand } from './mapBridgeServer.js';

// ── MapPanel ────────────────────────────────────────────────────────

/** Editor panel hosting a Leaflet map that visualises Earth Engine layers. */
export class MapPanel extends EditorPanel {
	private bridgeServer: MapBridgeServer;
	private commandDisposable: vscode.Disposable | undefined;

	constructor() {
		super();
		this.bridgeServer = new MapBridgeServer();
	}

	/** Starts the bridge server, creates the WebView, and wires up commands. */
	async open(): Promise<void> {
		await this.bridgeServer.start();

		const panel = this.createPanel(
			'earthengine.map',
			'Earth Engine Map',
			vscode.ViewColumn.Beside,
			{ enableScripts: true, retainContextWhenHidden: true },
		);

		if (this.commandDisposable) { return; } // Already wired

		panel.webview.html = MapPanel.getHtml();

		this.commandDisposable = this.bridgeServer.onCommand((cmd: MapCommand) => {
			if (this.panel) {
				this.panel.webview.postMessage(cmd);
			}
		});
	}

	protected override onDidDispose(): void {
		this.commandDisposable?.dispose();
		this.commandDisposable = undefined;
	}

	override dispose(): void {
		this.bridgeServer.stop();
		super.dispose();
	}

	/** Registers the `earthengine.openMap` command. */
	register(context: vscode.ExtensionContext): void {
		context.subscriptions.push(
			vscode.commands.registerCommand('earthengine.openMap', () => this.open()),
			this,
		);
	}

	private static getHtml(): string {
		return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"><\/script>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { width: 100vw; height: 100vh; overflow: hidden; font-family: var(--vscode-font-family, sans-serif); }
#map { width: 100%; height: 100%; }
.layer-control {
	position: absolute; top: 10px; right: 10px; z-index: 1000;
	background: var(--vscode-editor-background, #1e1e1e);
	color: var(--vscode-foreground, #ccc);
	border-radius: 6px; padding: 8px; min-width: 180px;
	box-shadow: 0 2px 8px rgba(0,0,0,0.4);
	font-size: 12px; max-height: 50vh; overflow-y: auto;
}
.layer-control h3 { font-size: 12px; margin-bottom: 6px; opacity: 0.7; }
.layer-item {
	display: flex; align-items: center; gap: 6px;
	padding: 3px 0; cursor: pointer;
}
.layer-item input { cursor: pointer; }
.layer-item label { cursor: pointer; flex: 1; }
.layer-item .remove-btn {
	background: none; border: none; color: var(--vscode-errorForeground, #f44);
	cursor: pointer; font-size: 14px; padding: 0 4px; opacity: 0.6;
}
.layer-item .remove-btn:hover { opacity: 1; }
.layer-item .opacity-slider { width: 60px; height: 4px; cursor: pointer; }
.status-bar {
	position: absolute; bottom: 0; left: 0; right: 0; z-index: 1000;
	background: var(--vscode-statusBar-background, #007acc);
	color: var(--vscode-statusBar-foreground, #fff);
	padding: 2px 10px; font-size: 11px;
	display: flex; justify-content: space-between;
}
</style>
</head>
<body>
<div id="map"></div>
<div class="layer-control" id="layerControl">
	<h3>Layers</h3>
	<div id="layerList"></div>
</div>
<div class="status-bar">
	<span id="coords">0.000, 0.000</span>
	<span id="zoom">Zoom: 2</span>
</div>
<script>
const vscode = acquireVsCodeApi();

// Init map
const map = L.map('map', {
	center: [0, 0],
	zoom: 2,
	zoomControl: true,
});

// Base layers
const osmDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
	maxZoom: 24,
	subdomains: 'abcd',
});
const osmLight = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
	attribution: '&copy; OSM &copy; CARTO',
	maxZoom: 24,
	subdomains: 'abcd',
});
const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
	attribution: '&copy; Esri',
	maxZoom: 24,
});

// Detect theme
const isDark = document.body.style.backgroundColor === '' ||
	getComputedStyle(document.body).backgroundColor.includes('30') ||
	getComputedStyle(document.body).backgroundColor.includes('1e');
(isDark ? osmDark : osmLight).addTo(map);

L.control.layers({
	'Dark': osmDark,
	'Light': osmLight,
	'Satellite': satellite,
}, {}, { position: 'topleft' }).addTo(map);

// Track layers
const overlayLayers = {};
let layerCounter = 0;

function updateLayerControl() {
	const list = document.getElementById('layerList');
	const keys = Object.keys(overlayLayers);
	if (keys.length === 0) {
		list.innerHTML = '<div style="opacity:0.5;padding:4px 0">No layers added</div>';
		return;
	}
	list.innerHTML = keys.map(key => {
		const layer = overlayLayers[key];
		const checked = map.hasLayer(layer.leafletLayer) ? 'checked' : '';
		const opacity = Math.round((layer.leafletLayer.options.opacity || 1) * 100);
		return '<div class="layer-item">'
			+ '<input type="checkbox" ' + checked + ' onchange="toggleLayer(\\'' + esc(key) + '\\', this.checked)">'
			+ '<label>' + esc(layer.name) + '</label>'
			+ '<input type="range" class="opacity-slider" min="0" max="100" value="' + opacity + '" onchange="setOpacity(\\'' + esc(key) + '\\', this.value/100)" title="Opacity">'
			+ '<button class="remove-btn" onclick="removeLayer(\\'' + esc(key) + '\\')" title="Remove">&times;</button>'
			+ '</div>';
	}).join('');
}

function esc(s) { return (s||'').replace(/'/g, "\\\\'").replace(/"/g, '&quot;'); }

function toggleLayer(key, visible) {
	const layer = overlayLayers[key];
	if (!layer) return;
	if (visible) { map.addLayer(layer.leafletLayer); }
	else { map.removeLayer(layer.leafletLayer); }
}

function setOpacity(key, opacity) {
	const layer = overlayLayers[key];
	if (!layer) return;
	layer.leafletLayer.setOpacity(opacity);
}

function removeLayer(key) {
	const layer = overlayLayers[key];
	if (!layer) return;
	map.removeLayer(layer.leafletLayer);
	delete overlayLayers[key];
	updateLayerControl();
}

// Status bar updates
map.on('mousemove', e => {
	document.getElementById('coords').textContent =
		e.latlng.lat.toFixed(4) + ', ' + e.latlng.lng.toFixed(4);
});
map.on('zoomend', () => {
	document.getElementById('zoom').textContent = 'Zoom: ' + map.getZoom();
});

// Handle messages from the extension (forwarded from Python)
window.addEventListener('message', e => {
	const msg = e.data;

	if (msg.type === 'addTileLayer') {
		const d = msg.data;
		const key = 'layer_' + (++layerCounter);
		const tileLayer = L.tileLayer(d.url, {
			maxZoom: 24,
			opacity: d.opacity || 1.0,
			attribution: 'Google Earth Engine',
		});
		if (d.shown !== false) { tileLayer.addTo(map); }
		overlayLayers[key] = { name: d.name || 'Layer', leafletLayer: tileLayer };
		updateLayerControl();
	}

	else if (msg.type === 'addGeoJson') {
		const d = msg.data;
		const key = 'layer_' + (++layerCounter);
		const style = d.style || {};
		const geoLayer = L.geoJSON(d.geojson, {
			style: {
				color: style.color || '#3388ff',
				weight: style.weight || 2,
				opacity: d.opacity || 1.0,
				fillOpacity: style.fillOpacity || 0.2,
			},
		});
		if (d.shown !== false) { geoLayer.addTo(map); }
		overlayLayers[key] = { name: d.name || 'Vector', leafletLayer: geoLayer };
		updateLayerControl();
	}

	else if (msg.type === 'centerObject') {
		const d = msg.data;
		if (d.bounds) {
			const bounds = L.latLngBounds(
				L.latLng(d.bounds[0], d.bounds[1]),
				L.latLng(d.bounds[2], d.bounds[3]),
			);
			if (d.zoom) {
				map.setView(bounds.getCenter(), d.zoom);
			} else {
				map.fitBounds(bounds);
			}
		}
	}

	else if (msg.type === 'setCenter') {
		const d = msg.data;
		map.setView([d.lat, d.lon], d.zoom || map.getZoom());
	}

	else if (msg.type === 'clear') {
		for (const key of Object.keys(overlayLayers)) {
			map.removeLayer(overlayLayers[key].leafletLayer);
			delete overlayLayers[key];
		}
		updateLayerControl();
	}
});

updateLayerControl();
</script>
</body></html>`;
	}
}
