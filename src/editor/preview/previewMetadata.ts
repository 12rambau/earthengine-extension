/** @module previewMetadata — edit and render asset preview metadata. */

import * as vscode from 'vscode';
import { marked, Renderer } from 'marked';
import dayjs from 'dayjs';
import {
  EEAsset,
  getAsset,
  moveAsset,
  updateAssetMetadata,
} from '../../sidebar/assets/eeApiClient.js';
import { escapeHtml } from '../../shared/index.js';

const descriptionRenderer = Object.assign(new Renderer(), {
  html({ text }: { text: string }) {
    return escapeHtml(text);
  },
  link(
    this: Renderer,
    { href, title, tokens }: { href: string; title: string | null; tokens: any[] },
  ) {
    const label = this.parser.parseInline(tokens);
    if (!/^https?:\/\//i.test(href)) {
      return label;
    }
    return `<a href="${escapeHtml(href)}"${title ? ` title="${escapeHtml(title)}"` : ''}>${label}</a>`;
  },
});

/** Fields shared by the image, image collection and table previews. */
export function previewMetadata(asset: EEAsset) {
  const description = String(asset.properties?.['description'] ?? '');
  return {
    title: asset.id || asset.name.split('/').pop() || 'Asset',
    assetId: asset.name,
    name: asset.name.split('/').pop() || '',
    startTime: asset.startTime ?? '',
    endTime: asset.endTime ?? '',
    startDate: asset.startTime
      ? dayjs.utc(asset.startTime).format('YYYY-MM-DD HH:mm:ss [UTC]')
      : 'N/A',
    endDate: asset.endTime ? dayjs.utc(asset.endTime).format('YYYY-MM-DD HH:mm:ss [UTC]') : 'N/A',
    description,
    propertyEntries: Object.entries(asset.properties ?? {})
      .filter(([key]) => key !== 'description' && !key.startsWith('system:'))
      .sort(([first], [second]) => first.localeCompare(second)),
    descriptionHtml: description
      ? `<div class="description-text">${marked.parse(description, { renderer: descriptionRenderer })}</div>`
      : '<p class="empty-state">No description.</p>',
  };
}

/** Applies edits and reports the persisted state back to a preview WebView. */
export async function savePreviewMetadata(
  msg: {
    name?: string;
    startTime?: string;
    endTime?: string;
    description?: string;
    properties?: { key: string; value: unknown }[];
  },
  asset: EEAsset,
  accessToken: string,
  panel: vscode.WebviewPanel,
): Promise<void> {
  try {
    if (
      typeof msg.name !== 'string' ||
      !/^[A-Za-z0-9_-]+$/.test(msg.name) ||
      typeof msg.startTime !== 'string' ||
      typeof msg.endTime !== 'string' ||
      typeof msg.description !== 'string'
    ) {
      throw new Error('Enter a valid asset name and metadata.');
    }
    const parseTime = (value: string): string | null => {
      if (!value) {
        return null;
      }
      const date = new Date(value);
      if (
        !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?Z$/.test(value) ||
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 19) !== value.slice(0, 19)
      ) {
        throw new Error('Enter valid UTC dates.');
      }
      return date.toISOString();
    };
    const startTime = parseTime(msg.startTime);
    const endTime = parseTime(msg.endTime);
    if (startTime && endTime && startTime > endTime) {
      throw new Error('Start time must not be after end time.');
    }
    if (
      !Array.isArray(msg.properties) ||
      msg.properties.some(
        (entry) =>
          !entry ||
          typeof entry.key !== 'string' ||
          !entry.key.trim() ||
          entry.key === 'description' ||
          entry.key.startsWith('system:') ||
          !('value' in entry) ||
          entry.value === undefined,
      )
    ) {
      throw new Error('Enter valid property names and values.');
    }
    const propertyNames = msg.properties.map((entry) => entry.key);
    if (new Set(propertyNames).size !== propertyNames.length) {
      throw new Error('Property names must be unique.');
    }
    const properties = Object.fromEntries(msg.properties.map(({ key, value }) => [key, value]));
    const destination = `${asset.name.slice(0, asset.name.lastIndexOf('/') + 1)}${msg.name}`;
    const changed =
      startTime !== (asset.startTime ? new Date(asset.startTime).toISOString() : null) ||
      endTime !== (asset.endTime ? new Date(asset.endTime).toISOString() : null) ||
      msg.description !== String(asset.properties?.['description'] ?? '') ||
      JSON.stringify(
        Object.entries(asset.properties ?? {})
          .filter(([key]) => key !== 'description' && !key.startsWith('system:'))
          .sort(([first], [second]) => first.localeCompare(second)),
      ) !==
        JSON.stringify(
          Object.entries(properties).sort(([first], [second]) => first.localeCompare(second)),
        );
    if (changed) {
      await updateAssetMetadata(asset.name, accessToken, {
        startTime,
        endTime,
        description: msg.description,
        properties,
      });
    }
    if (destination !== asset.name) {
      await moveAsset(asset.name, destination, accessToken);
    }
    const saved = await getAsset(destination, accessToken);
    for (const key of Object.keys(asset)) {
      Reflect.deleteProperty(asset, key);
    }
    Object.assign(asset, saved);
    panel.title = destination.split('/').pop() || panel.title;
    panel.webview.postMessage({ type: 'metadataSaved', metadata: previewMetadata(saved) });
    await vscode.commands
      .executeCommand('earthengine.refreshAssets')
      .then(undefined, () => undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    panel.webview.postMessage({ type: 'metadataError', message });
  }
}
