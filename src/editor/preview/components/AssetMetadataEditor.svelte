<!-- AssetMetadataEditor: save preview metadata and edit the Markdown description -->
<script>
  import { vscode } from '../../../shared/vscode.ts';
  import * as monaco from 'monaco-editor/editor/editor.api';
  import { conf, language } from 'monaco-editor/languages/definitions/markdown/markdown';
  import workerCode from 'monaco-worker-text';
  import dayjs from 'dayjs';
  import utc from 'dayjs/plugin/utc.js';
  dayjs.extend(utc);

  let {
    metadata = $bindable(), editing = $bindable(),
    name = $bindable(''), startTime = $bindable(''), endTime = $bindable(''),
    properties = $bindable([]),
    sharing = $bindable(null),
    saving = $bindable(false),
  } = $props();
  let description = $state('');
  let error = $state('');
  let workerUrl;

  function propertyKind(value) {
    if (typeof value === 'number') { return 'number'; }
    if (typeof value === 'boolean') { return 'boolean'; }
    return typeof value === 'string' ? 'string' : 'json';
  }

  function propertyValue(value) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  monaco.languages.register({ id: 'markdown' });
  monaco.languages.setMonarchTokensProvider('markdown', language);
  monaco.languages.setLanguageConfiguration('markdown', conf);

  function mountEditor(node) {
    workerUrl = URL.createObjectURL(new Blob([workerCode], { type: 'text/javascript' }));
    globalThis.MonacoEnvironment = {
      getWorker: () => new Worker(workerUrl),
    };

    const applyTheme = () => {
      const style = getComputedStyle(document.body);
      const colors = Object.fromEntries([
        ['editor.background', '--vscode-editor-background'],
        ['editor.foreground', '--vscode-editor-foreground'],
        ['editorCursor.foreground', '--vscode-editorCursor-foreground'],
        ['editor.selectionBackground', '--vscode-editor-selectionBackground'],
        ['editorLineNumber.foreground', '--vscode-editorLineNumber-foreground'],
      ].map(([key, token]) => [key, style.getPropertyValue(token).trim()]).filter(([, value]) => value));
      const base = document.body.classList.contains('vscode-high-contrast') ? 'hc-black'
        : document.body.classList.contains('vscode-high-contrast-light') ? 'hc-light'
        : document.body.classList.contains('vscode-dark') ? 'vs-dark' : 'vs';
      monaco.editor.defineTheme('vscee-markdown', { base, inherit: true, rules: [], colors });
      monaco.editor.setTheme('vscee-markdown');
    };
    applyTheme();
    const themeObserver = new MutationObserver(applyTheme);
    themeObserver.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-vscode-theme-id'] });

    const style = getComputedStyle(document.body);
    const editor = monaco.editor.create(node, {
      value: description,
      language: 'markdown',
      ariaLabel: 'Description (Markdown)',
      automaticLayout: true,
      minimap: { enabled: false },
      lineNumbers: 'off',
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      fontFamily: style.getPropertyValue('--vscode-editor-font-family').trim() || 'monospace',
      fontSize: parseInt(style.getPropertyValue('--vscode-editor-font-size'), 10) || 13,
    });
    const model = editor.getModel();
    const changes = editor.onDidChangeModelContent(() => (description = editor.getValue()));

    return {
      update({ value, disabled }) {
        if (value !== editor.getValue()) { editor.setValue(value); }
        editor.updateOptions({ readOnly: disabled });
      },
      destroy() {
        changes.dispose();
        themeObserver.disconnect();
        editor.dispose();
        model?.dispose();
        URL.revokeObjectURL(workerUrl);
      },
    };
  }

  $effect(() => {
    if (editing) {
      name = metadata.name;
      startTime = metadata.startTime ? dayjs.utc(metadata.startTime).format('YYYY-MM-DDTHH:mm:ss') : '';
      endTime = metadata.endTime ? dayjs.utc(metadata.endTime).format('YYYY-MM-DDTHH:mm:ss') : '';
      description = metadata.description;
      properties = metadata.propertyEntries.map(([key, value]) => ({
        key, value: propertyValue(value), kind: propertyKind(value),
      }));
      error = '';
    }
  });

  window.addEventListener('message', (event) => {
    if (event.data.type === 'metadataSaved') {
      metadata = event.data.metadata;
      saving = false;
      editing = false;
    } else if (event.data.type === 'metadataError') {
      error = event.data.message;
      saving = false;
    }
  });

  function save(event) {
    event.preventDefault();
    if (saving) {
      return;
    }
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      error = 'Enter a valid asset name.';
      return;
    }
    const entries = [];
    const keys = new Set();
    try {
      for (const row of properties) {
        if (!row.key.trim() || row.key === 'description' || row.key.startsWith('system:') || keys.has(row.key)) {
          throw new Error('Property names must be unique and cannot be empty, description, or system:*');
        }
        keys.add(row.key);
        let value = row.value;
        if (row.kind === 'number') {
          value = Number(row.value);
          if (!row.value.trim() || !Number.isFinite(value)) { throw new Error(`Invalid number for ${row.key}`); }
        } else if (row.kind === 'boolean') {
          if (row.value !== 'true' && row.value !== 'false') { throw new Error(`Use true or false for ${row.key}`); }
          value = row.value === 'true';
        } else if (row.kind === 'json') {
          value = JSON.parse(row.value);
        }
        entries.push({ key: row.key, value });
      }
    } catch (invalid) {
      error = invalid instanceof Error ? invalid.message : 'Invalid property value.';
      return;
    }
    saving = true;
    error = '';
    vscode.postMessage({
      type: 'saveMetadata',
      name,
      startTime: toUtc(startTime),
      endTime: toUtc(endTime),
      description,
      properties: entries,
      // $state proxies are not structured-cloneable, so postMessage would throw.
      sharing: sharing ? $state.snapshot(sharing) : null,
    });
  }

  function toUtc(value) {
    return value ? `${value.length === 16 ? `${value}:00` : value}Z` : '';
  }
</script>

{#if editing}
  <form id="asset-metadata-form" onsubmit={save}>
    <span class="editor-label">Description (Markdown)</span>
    <div class="markdown-editor" use:mountEditor={{ value: description, disabled: saving }}></div>
    {#if error}<p role="alert">{error}</p>{/if}
  </form>
{:else}
  {@html metadata.descriptionHtml}
{/if}

<style>
  form {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-lg);
    height: 100%;
    min-height: 0;
  }
  .editor-label { margin-bottom: calc(-1 * var(--vscee-space-sm)); }
  .markdown-editor {
    flex: 1;
    min-height: 0;
    border: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    border-radius: var(--vscee-radius-md);
    overflow: hidden;
  }
  p {
    color: var(--vscee-color-error);
  }
</style>
