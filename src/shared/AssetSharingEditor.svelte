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
    <table>
      <thead><tr><th>Principal</th><th>Access</th>{#if editing}<th>Actions</th>{/if}</tr></thead>
      <tbody>
        <tr>
          <td>Everyone</td>
          <td>
            {#if editing}
              <label><input type="checkbox" bind:checked={publicRead} onchange={update} disabled={saving} /> Can read</label>
            {:else}
              {publicRead ? 'Reader' : 'No access'}
            {/if}
          </td>
          {#if editing}<td></td>{/if}
        </tr>
        {#each users as user, i}
          <tr>
            <td>
              {#if editing}
                <input type="email" aria-label="User email" placeholder="user@example.com" bind:value={user.email} oninput={update} disabled={saving} />
              {:else}
                {user.email}
              {/if}
            </td>
            <td>
              {#if editing}
                <select aria-label="Access for {user.email || 'new user'}" bind:value={user.role} onchange={update} disabled={saving}>
                  <option value="reader">Reader</option>
                  <option value="writer">Writer</option>
                </select>
              {:else}
                {user.role === 'writer' ? 'Writer' : 'Reader'}
              {/if}
            </td>
            {#if editing}
              <td><button type="button" class="remove" title="Revoke access for {user.email}" aria-label="Revoke access for {user.email}" disabled={saving} onclick={() => removeUser(i)}><i class="codicon codicon-trash"></i></button></td>
            {/if}
          </tr>
        {/each}
        {#each otherGrants as grant}
          <tr><td>{grant.member}</td><td>{grant.role}</td>{#if editing}<td></td>{/if}</tr>
        {/each}
      </tbody>
    </table>
    {#if editing}
      <button type="button" class="add" disabled={saving} onclick={addUser}><i class="codicon codicon-add"></i> Add user</button>
    {/if}
  </div>
{/if}

<style>
  .sharing-editor { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: var(--vscee-font-sm); }
  th, td { text-align: left; padding: var(--vscee-space-sm) var(--vscee-space-lg); border-bottom: var(--vscee-border-sm) solid var(--vscee-color-panel-border); }
  th { background: var(--vscee-color-list-hover); }
  td:first-child { overflow-wrap: anywhere; }
  input[type="email"], select {
    width: 100%;
    min-width: 10em;
    padding: var(--vscee-space-xs);
    background: var(--vscee-color-input-background);
    color: var(--vscee-color-foreground);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
  }
  input[type="checkbox"] { margin-right: var(--vscee-space-xs); }
  button {
    padding: var(--vscee-space-xs) var(--vscee-space-sm);
    color: var(--vscee-color-foreground);
    background: var(--vscee-color-button-secondary-background);
    border: none;
    cursor: pointer;
  }
  .add { margin-top: var(--vscee-space-lg); }
  .remove { background: none; color: var(--vscee-color-error); }
  button:disabled { opacity: 0.5; cursor: default; }
  p[role="alert"] { color: var(--vscee-color-error); }
</style>
