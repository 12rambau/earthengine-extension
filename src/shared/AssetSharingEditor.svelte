<!-- AssetSharingEditor: view and edit asset IAM reader and writer grants -->
<script>
  import { vscode } from './vscode.ts';

  let { editing, saving, sharing = $bindable(null) } = $props();

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let policy = $state(null);
  let error = $state('');
  let publicRead = $state(false);
  let users = $state([]);
  let otherGrants = $state([]);
  let original = $state('');

  // ----------------------------------------------------------------
  // MESSAGES
  // ----------------------------------------------------------------
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'sharingError') {
      error = `Unable to load sharing: ${msg.message}`;
      policy = null;
      sharing = null;
    } else if (msg.type === 'sharingSaveError') {
      error = msg.message;
    } else if (msg.type === 'sharingLoaded') {
      policy = msg.policy;
      error = '';
      publicRead = false;
      users = [];
      otherGrants = [];
      for (const binding of policy.bindings ?? []) {
        const role = binding.role === 'roles/viewer' ? 'reader'
          : binding.role === 'roles/editor' ? 'writer'
          : binding.role === 'roles/owner' ? 'owner' : binding.role;
        for (const member of binding.members ?? []) {
          if (!binding.condition && member === 'allUsers' && role === 'reader') {
            publicRead = true;
          } else if (!binding.condition && member.startsWith('user:') && (role === 'reader' || role === 'writer')) {
            const email = member.slice(5);
            const existing = users.find((user) => user.email === email);
            if (existing) {
              if (role === 'writer') { existing.role = 'writer'; }
            } else {
              users.push({ email, role });
            }
          } else {
            otherGrants.push({ member, role: binding.condition ? `${role} (conditional)` : role });
          }
        }
      }
      original = JSON.stringify({ publicRead, users });
      sharing = null;
    }
  });

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function update() {
    const current = { publicRead, users: users.map(({ email, role }) => ({ email: email.trim(), role })) };
    sharing = JSON.stringify(current) === original
      ? null : { ...current, etag: policy.etag ?? '' };
  }

  function addUser() {
    users = [...users, { email: '', role: 'reader' }];
    update();
  }

  function removeUser(index) {
    users = users.filter((_, i) => i !== index);
    update();
  }
</script>

{#if error}
  <p role="alert">{error}</p>
{:else if !policy}
  <p>Loading sharing settings…</p>
{:else}
  <div class="sharing-editor">
    <div class="public-access">
      <label class="switch">
        <input type="checkbox" role="switch" aria-label="Everyone can read this asset" bind:checked={publicRead} onchange={update} disabled={!editing || saving} />
        <span class="track"><span class="knob"></span></span>
      </label>
      <span class="public-access-label">
        <strong>Everyone</strong>
        <span class="hint">{publicRead ? 'Anyone can read this asset' : 'Only the principals below have access'}</span>
      </span>
    </div>
    {#if editing}
      <div class="sharing-rows">
        {#each users as user, i}
          <div class="sharing-row">
            <input type="email" aria-label="User email" placeholder="user@example.com" bind:value={user.email} oninput={update} disabled={saving} />
            <select aria-label="Access for {user.email || 'new user'}" bind:value={user.role} onchange={update} disabled={saving}>
              <option value="reader">Reader</option>
              <option value="writer">Writer</option>
            </select>
            <button type="button" class="remove-user" title="Revoke access" aria-label="Revoke access for {user.email}" disabled={saving} onclick={() => removeUser(i)}><i class="codicon codicon-trash" aria-hidden="true"></i></button>
          </div>
        {/each}
      </div>
      <button type="button" class="add-user" disabled={saving} onclick={addUser}>+ Add user</button>
      {#if otherGrants.length}
        <p class="grants-caption">Grants managed outside this editor</p>
        <table class="grants-table">
          <thead><tr><th>Principal</th><th>Access</th></tr></thead>
          <tbody>
            {#each otherGrants as grant}
              <tr><td>{grant.member}</td><td>{grant.role}</td></tr>
            {/each}
          </tbody>
        </table>
      {/if}
    {:else if users.length || otherGrants.length}
      <table class="grants-table">
        <thead><tr><th>Principal</th><th>Access</th></tr></thead>
        <tbody>
          {#each users as user}
            <tr><td>{user.email}</td><td>{user.role === 'writer' ? 'Writer' : 'Reader'}</td></tr>
          {/each}
          {#each otherGrants as grant}
            <tr><td>{grant.member}</td><td>{grant.role}</td></tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <p class="empty-state">No individual grants.</p>
    {/if}
  </div>
{/if}

<style>
  /* ==================================================================
     LAYOUT
     ================================================================== */
  .sharing-editor { overflow-x: auto; }

  /* ==================================================================
     PUBLIC ACCESS SWITCH
     ================================================================== */
  .public-access {
    display: flex;
    align-items: center;
    gap: var(--vscee-space-lg);
    margin-bottom: var(--vscee-space-xl);
    padding: var(--vscee-space-md) var(--vscee-space-lg);
    border: var(--vscee-border-sm) solid var(--vscee-color-panel-border);
    border-radius: var(--vscee-radius-md);
  }
  .public-access-label {
    display: flex;
    flex-direction: column;
    font-size: var(--vscee-font-sm);

    .hint { color: var(--vscee-color-muted); }
  }
  .switch {
    position: relative;
    display: inline-flex;
    flex-shrink: 0;

    input {
      position: absolute;
      inset: 0;
      margin: 0;
      opacity: 0;
      cursor: pointer;

      &:checked + .track {
        background: var(--vscee-color-button-background);
        border-color: var(--vscee-color-button-background);

        .knob {
          background: var(--vscee-color-button-foreground);
          transform: translateX(12px);
        }
      }
      &:focus-visible + .track {
        outline: var(--vscee-border-sm) solid var(--vscee-color-focus);
        outline-offset: var(--vscee-space-xxs);
      }
      &:disabled {
        cursor: default;
        + .track { opacity: 0.6; }
      }
    }
    .track {
      display: inline-flex;
      align-items: center;
      width: 28px;
      height: 16px;
      padding: 0 var(--vscee-space-xxs);
      border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
      border-radius: 999px;
      background: var(--vscee-color-button-secondary-background);
      transition: background 0.15s;
    }
    .knob {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: var(--vscee-color-foreground);
      transition: transform 0.15s;
    }
  }

  /* ==================================================================
     GRANTS TABLE
     ================================================================== */
  .grants-table { width: 100%; border-collapse: collapse; font-size: var(--vscee-font-sm); }
  th, td { text-align: left; padding: var(--vscee-space-sm) var(--vscee-space-lg); border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border); }
  th { background: var(--vscee-color-list-hover); }
  td:first-child { overflow-wrap: anywhere; }
  .grants-caption {
    margin: var(--vscee-space-xl) 0 var(--vscee-space-sm);
    color: var(--vscee-color-muted);
    font-size: var(--vscee-font-sm);
  }
  .empty-state { color: var(--vscee-color-muted); }

  /* ==================================================================
     GRANT ROW EDITOR
     ================================================================== */
  .sharing-rows {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-xxs);
  }
  .sharing-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--vscee-space-xxs);
    padding: var(--vscee-space-xxs);
    border-radius: var(--vscee-radius-sm);
    background: var(--vscee-color-editor-widget-background);
  }
  input[type="email"], select {
    min-width: 0;
    background: var(--vscee-color-input-background);
    color: var(--vscee-color-input-foreground);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-md);
    font: inherit;
    padding: var(--vscee-space-xxs) var(--vscee-space-xs);
  }
  input[type="email"] { flex: 1 1 180px; }
  select { flex: 0 0 96px; }
  .remove-user {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--vscee-color-foreground);
    opacity: 0.65;
    cursor: pointer;
  }
  .add-user {
    margin-top: var(--vscee-space-sm);
    padding: var(--vscee-space-xs) var(--vscee-space-md);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-md);
    background: var(--vscee-color-button-secondary-background);
    color: var(--vscee-color-button-secondary-foreground);
    cursor: pointer;

    &:hover { background: var(--vscee-color-button-secondary-hover); }
  }
  button:disabled { opacity: 0.5; cursor: default; }
  p[role="alert"] { color: var(--vscee-color-error); }
</style>
