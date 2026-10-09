<!-- DatePicker: themed calendar input with optional local time selection -->
<script>
  import { trackViewportChanges } from './viewportAnchor.ts';

  let {
    value = $bindable(''),
    mode = 'date',
    label = 'Choose a date',
    disabled = false,
    onchange,
  } = $props();

  const monthFormatter = new Intl.DateTimeFormat('en-US', { month: 'short' });
  const dayFormatter = new Intl.DateTimeFormat('en-US', { weekday: 'short' });
  const displayFormatter = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium' });
  const firstYear = 1970;
  const currentYear = new Date().getFullYear();
  const years = Array.from(
    { length: currentYear - firstYear + 1 },
    (_, index) => firstYear + index,
  );
  const hours = Array.from({ length: 24 }, (_, index) => String(index).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, '0'));
  const pad = (number) => String(number).padStart(2, '0');

  // ----------------------------------------------------------------
  // STATE
  // ----------------------------------------------------------------
  let open = $state(false);
  let trigger = $state(null);
  let viewedMonth = $state(new Date().getMonth());
  let viewedYear = $state(new Date().getFullYear());
  let hour = $state('00');
  let minute = $state('00');

  // ----------------------------------------------------------------
  // DERIVED
  // ----------------------------------------------------------------
  const selectedDate = $derived(/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : '');
  const display = $derived.by(() => {
    if (!selectedDate) {
      return '';
    }
    const date = parseDate(selectedDate);
    if (!date) {
      return '';
    }
    return (
      displayFormatter.format(date) +
      (mode === 'datetime' ? ` ${value.slice(11, 16) || '00:00'}` : '')
    );
  });
  const days = $derived.by(() => {
    const first = new Date(viewedYear, viewedMonth, 1);
    const offset = (first.getDay() + 6) % 7;
    const count = new Date(viewedYear, viewedMonth + 1, 0).getDate();
    return Array.from({ length: 42 }, (_, index) =>
      index < offset || index >= offset + count ? 0 : index - offset + 1,
    );
  });
  const weekdays = Array.from({ length: 7 }, (_, index) =>
    dayFormatter.format(new Date(2024, 0, index + 1)),
  );
  const months = Array.from({ length: 12 }, (_, index) =>
    monthFormatter.format(new Date(2024, index, 1)),
  );

  // ----------------------------------------------------------------
  // HELPERS
  // ----------------------------------------------------------------
  function parseDate(iso) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!match) {
      return null;
    }
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return date.getFullYear() === Number(match[1]) &&
      date.getMonth() === Number(match[2]) - 1 &&
      date.getDate() === Number(match[3])
      ? date
      : null;
  }

  function formatDate(date) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function anchor(node) {
    const place = () => {
      const rect = trigger?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      const gap = 4;
      const height = node.offsetHeight;
      node.style.left = `${Math.max(gap, Math.min(rect.left, window.innerWidth - node.offsetWidth - gap))}px`;
      node.style.top = `${Math.max(gap, rect.bottom + height + gap > window.innerHeight && rect.top > height ? rect.top - height - gap : rect.bottom + gap)}px`;
    };
    return trackViewportChanges(place);
  }

  // ----------------------------------------------------------------
  // ACTIONS
  // ----------------------------------------------------------------
  function toggle() {
    if (disabled) {
      return;
    }
    if (!open) {
      const date = parseDate(selectedDate) ?? new Date();
      viewedMonth = date.getMonth();
      viewedYear = Math.max(firstYear, Math.min(currentYear, date.getFullYear()));
      hour = value.slice(11, 13) || '00';
      minute = value.slice(14, 16) || '00';
    }
    open = !open;
  }

  function commit(date) {
    value = date ? date + (mode === 'datetime' ? `T${hour}:${minute}` : '') : '';
    onchange?.(value);
    if (mode === 'date' || !date) {
      open = false;
    }
  }

  function changeMonth(offset) {
    const date = new Date(viewedYear, viewedMonth + offset, 1);
    if (date.getFullYear() < firstYear || date.getFullYear() > currentYear) {
      return;
    }
    viewedMonth = date.getMonth();
    viewedYear = date.getFullYear();
  }

  function changeTime(part, input) {
    if (part === 'hour') {
      hour = input;
    } else {
      minute = input;
    }
    if (selectedDate) {
      commit(selectedDate);
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (open && event.key === 'Escape') {
      event.stopPropagation();
      open = false;
      trigger?.focus();
    }
  }}
/>

<div class="date-picker">
  <button
    type="button"
    class="trigger"
    aria-label={label}
    aria-haspopup="dialog"
    aria-expanded={open}
    title={label}
    bind:this={trigger}
    {disabled}
    onclick={toggle}
  >
    <span class:empty={!display}
      >{display || (mode === 'datetime' ? 'Select date and time' : 'Select date')}</span
    >
    <i class="codicon codicon-calendar" aria-hidden="true"></i>
  </button>
  {#if open}
    <div class="backdrop" role="presentation" onclick={() => (open = false)}></div>
    <div
      class="popup"
      class:with-time={mode === 'datetime'}
      role="dialog"
      aria-label={label}
      use:anchor
    >
      <div class="picker-body">
        <div class="calendar-panel">
          <div class="navigation">
            <button
              type="button"
              title="Previous month"
              aria-label="Previous month"
              disabled={viewedYear === firstYear && viewedMonth === 0}
              onclick={() => changeMonth(-1)}><i class="codicon codicon-chevron-left"></i></button
            >
            <select
              aria-label="Month"
              value={viewedMonth}
              onchange={(event) => (viewedMonth = Number(event.currentTarget.value))}
            >
              {#each months as month, index}<option value={index}>{month}</option>{/each}
            </select>
            <select
              aria-label="Year"
              value={viewedYear}
              onchange={(event) => (viewedYear = Number(event.currentTarget.value))}
            >
              {#each years as year}<option value={year}>{year}</option>{/each}
            </select>
            <button
              type="button"
              title="Next month"
              aria-label="Next month"
              disabled={viewedYear === currentYear && viewedMonth === 11}
              onclick={() => changeMonth(1)}><i class="codicon codicon-chevron-right"></i></button
            >
          </div>
          <div class="calendar">
            {#each weekdays as weekday}
              <span class="weekday">{weekday}</span>
            {/each}
            {#each days as day}
              {#if day}
                {@const iso = `${viewedYear}-${pad(viewedMonth + 1)}-${pad(day)}`}
                <button
                  type="button"
                  class:selected={iso === selectedDate}
                  class:today={iso === formatDate(new Date())}
                  aria-label={displayFormatter.format(new Date(viewedYear, viewedMonth, day))}
                  aria-pressed={iso === selectedDate}
                  onclick={() => commit(iso)}>{day}</button
                >
              {:else}
                <span></span>
              {/if}
            {/each}
          </div>
        </div>
        {#if mode === 'datetime'}
          <div class="time">
            <i class="codicon codicon-clock" aria-hidden="true"></i>
            <label
              >Hour
              <select
                value={hour}
                onchange={(event) => changeTime('hour', event.currentTarget.value)}
              >
                {#each hours as option}<option value={option}>{option}</option>{/each}
              </select>
            </label>
            <label
              >Minute
              <select
                value={minute}
                onchange={(event) => changeTime('minute', event.currentTarget.value)}
              >
                {#each minutes as option}<option value={option}>{option}</option>{/each}
              </select>
            </label>
          </div>
        {/if}
      </div>
      <div class="actions">
        <button
          type="button"
          class="today-action"
          onclick={() => {
            const now = new Date();
            hour = pad(now.getHours());
            minute = pad(now.getMinutes());
            viewedMonth = now.getMonth();
            viewedYear = now.getFullYear();
            commit(formatDate(now));
          }}>Today</button
        >
        <div class="action-end">
          <button type="button" class="clear-action" onclick={() => commit('')}>Clear</button>
          {#if mode === 'datetime'}<button
              type="button"
              class="done-action"
              onclick={() => (open = false)}>Done</button
            >{/if}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .date-picker {
    min-width: 0;
    width: 100%;
    font-family: var(--vscee-font-family);
    font-size: var(--vscee-font-compact-md);
  }
  button {
    font: inherit;
    cursor: pointer;
  }
  .trigger {
    width: 100%;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--vscee-space-sm);
    padding: var(--vscee-space-xs) var(--vscee-space-sm);
    background: var(--vscee-color-input-background);
    color: var(--vscee-color-input-foreground);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-md);
    text-align: left;
    span {
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .empty {
      color: var(--vscee-color-muted);
    }
    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 3000;
  }
  .popup {
    position: fixed;
    z-index: 3001;
    width: min(272px, calc(100vw - 8px));
    max-height: calc(100vh - 8px);
    overflow-y: auto;
    box-sizing: border-box;
    padding: var(--vscee-space-sm);
    background: var(--vscee-color-editor-widget-background);
    color: var(--vscee-color-foreground);
    border: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    border-radius: var(--vscee-radius-md);
    box-shadow: var(--vscee-shadow-lg);
    &.with-time {
      width: min(390px, calc(100vw - 8px));
    }
  }
  .picker-body {
    display: flex;
    gap: var(--vscee-space-sm);
  }
  .calendar-panel {
    flex: 1;
    min-width: 0;
  }
  .navigation {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--vscee-space-xs);
    margin-bottom: var(--vscee-space-sm);
  }
  .navigation select {
    min-width: 0;
    padding: var(--vscee-space-xs);
    font: inherit;
    color: var(--vscee-color-input-foreground);
    background: var(--vscee-color-input-background);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-sm);
  }
  .navigation select:first-of-type {
    flex: 1;
  }
  .navigation select:last-of-type {
    width: 58px;
  }
  .navigation button,
  .actions button {
    background: none;
    color: var(--vscee-color-foreground);
    border: 0;
    border-radius: var(--vscee-radius-sm);
    padding: var(--vscee-space-xs) var(--vscee-space-sm);
  }
  .navigation button:hover,
  .actions button:hover,
  .calendar button:hover {
    background: var(--vscee-color-list-hover);
  }
  .navigation button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .calendar {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    text-align: center;
    gap: 2px;
  }
  .calendar .weekday {
    color: var(--vscee-color-muted);
    font-size: var(--vscee-font-compact-xs);
    padding: var(--vscee-space-xs) 0;
  }
  .calendar button {
    height: 30px;
    padding: 0;
    border: 0;
    border-radius: var(--vscee-radius-sm);
    background: transparent;
    color: inherit;
  }
  .calendar button.today {
    outline: var(--vscee-border-sm) solid var(--vscee-color-focus);
    outline-offset: -1px;
  }
  .calendar button.selected {
    background: var(--vscee-color-list-selection-background);
    color: var(--vscee-color-list-selection-foreground);
  }
  .time {
    display: flex;
    flex: 0 0 106px;
    flex-direction: column;
    align-items: stretch;
    gap: var(--vscee-space-md);
    border-left: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    padding: var(--vscee-space-sm);
    box-sizing: border-box;
    > i {
      text-align: center;
      color: var(--vscee-color-muted);
    }
  }
  .time label {
    display: flex;
    flex-direction: column;
    gap: var(--vscee-space-xs);
    color: var(--vscee-color-muted);
  }
  .time select {
    box-sizing: border-box;
    width: 100%;
    padding: var(--vscee-space-xs);
    font: inherit;
    color: var(--vscee-color-input-foreground);
    background: var(--vscee-color-input-background);
    border: var(--vscee-border-sm) solid var(--vscee-color-input-border);
    border-radius: var(--vscee-radius-sm);
  }
  .actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--vscee-space-xs);
    border-top: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
    margin-top: var(--vscee-space-sm);
    padding-top: var(--vscee-space-sm);
  }
  .action-end {
    display: flex;
    gap: var(--vscee-space-xs);
    margin-left: auto;
  }
  .actions .today-action,
  .actions .done-action {
    background: var(--vscee-color-button-background);
    color: var(--vscee-color-button-foreground);
    &:hover {
      background: var(--vscee-color-button-hover);
    }
  }
  .actions .clear-action {
    background: var(--vscee-color-button-secondary-background);
    color: var(--vscee-color-button-secondary-foreground);
    &:hover {
      background: var(--vscee-color-button-secondary-hover);
    }
  }
  @media (max-width: 340px) {
    .picker-body {
      flex-direction: column;
    }
    .time {
      flex: none;
      flex-direction: row;
      align-items: center;
      border-left: 0;
      border-top: var(--vscee-border-sm) solid var(--vscee-color-widget-border);
      > i {
        display: none;
      }
      label {
        flex: 1;
      }
    }
  }
  .trigger:focus-visible,
  .popup button:focus-visible,
  .popup select:focus-visible {
    outline: var(--vscee-border-md) solid var(--vscee-color-focus);
    outline-offset: 1px;
  }
</style>
