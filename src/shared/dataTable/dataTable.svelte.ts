/** @module dataTable
 * Headless Svelte state model for sortable, filterable, paginated WebView tables.
 */

import type {} from 'svelte';
import type {
  TableColumn,
  TableComparisonFilter,
  TableFilterValue,
  TablePage,
  TablePreferences,
  TableSort,
  TableSortDirection,
  TableValue,
} from './tableTypes.js';

// ==================================================================
// INTERFACES
// ==================================================================
/** Options used to initialise a shared data-table model. */
export interface DataTableOptions<Row> {
  columns: readonly TableColumn<Row>[];
  defaultPageSize: number;
  defaultSort?: TableSort;
  preferences?: TablePreferences;
}

/** A reusable state model that deliberately has no knowledge of data loading. */
export interface DataTable<Row> {
  readonly columns: readonly TableColumn<Row>[];
  readonly visibleColumns: TableColumn<Row>[];
  readonly filteredRows: Row[];
  readonly sortedRows: Row[];
  readonly pageRows: Row[];
  readonly page: TablePage;
  readonly rangeText: string;
  readonly activeFilterCount: number;
  currentPage: number;
  pageSize: number;
  sort: TableSort | undefined;
  visibleCols: Set<string>;
  filters: Record<string, TableFilterValue>;
  setRows(rows: readonly Row[]): void;
  toggleSort(column: string): void;
  setPageSize(pageSize: number): void;
  setVisibleCols(columns: Iterable<string>): void;
  setFilter(column: string, filter: TableFilterValue | undefined): void;
  clearFilters(): void;
  applyPreferences(preferences: TablePreferences | undefined): void;
  exportPreferences(): TablePreferences;
}

// ==================================================================
// PUBLIC API
// ==================================================================
/**
 * Creates the client-side state for a data table.
 *
 * Call `setRows()` whenever a host-backed loader streams or refreshes data.
 */
export function createDataTable<Row>(options: DataTableOptions<Row>): DataTable<Row> {
  const validColumns = new Set(options.columns.map((column) => column.key));
  const initial = normalizeTablePreferences(options.columns, options.preferences);
  const initialVisibleCols = new Set<string>(
    initial.visibleCols ?? options.columns.map((column) => column.key),
  );
  for (const column of options.columns) {
    if (column.required) {
      initialVisibleCols.add(column.key);
    }
  }

  let rows = $state<Row[]>([]);
  let currentPage = $state(0);
  let pageSize = $state(initial.pageSize ?? options.defaultPageSize);
  let sort = $state<TableSort | undefined>(initial.sort ?? options.defaultSort);
  let visibleCols = $state<Set<string>>(initialVisibleCols);
  let filters = $state<Record<string, TableFilterValue>>(initial.filters ?? {});

  const visibleColumns = $derived(options.columns.filter((column) => visibleCols.has(column.key)));
  const filteredRows = $derived.by(() =>
    rows.filter((row) => matchesFilters(row, options.columns, filters)),
  );
  const sortedRows = $derived.by(() => sortRows(filteredRows, options.columns, sort));
  const totalPages = $derived(Math.max(1, Math.ceil(sortedRows.length / pageSize)));
  const boundedPage = $derived(Math.min(currentPage, totalPages - 1));
  const pageRows = $derived(sortedRows.slice(boundedPage * pageSize, (boundedPage + 1) * pageSize));
  const page = $derived<TablePage>({
    currentPage: boundedPage,
    totalPages,
    startIndex: boundedPage * pageSize,
    endIndex: Math.min((boundedPage + 1) * pageSize, sortedRows.length),
  });
  const rangeText = $derived(
    sortedRows.length === 0
      ? '0 items'
      : `${page.startIndex + 1}-${page.endIndex} of ${sortedRows.length} items`,
  );
  const activeFilterCount = $derived(Object.keys(filters).length);

  function setRows(nextRows: readonly Row[]): void {
    rows = [...nextRows];
  }

  function toggleSort(column: string): void {
    const definition = options.columns.find((candidate) => candidate.key === column);
    if (!definition?.sortable) {
      return;
    }
    if (sort?.column !== column) {
      sort = { column, direction: 1 };
    } else if (sort.direction === 1) {
      sort = { column, direction: -1 };
    } else {
      sort = undefined;
    }
  }

  function setPageSize(nextPageSize: number): void {
    if (!Number.isInteger(nextPageSize) || nextPageSize < 1) {
      return;
    }
    pageSize = nextPageSize;
    currentPage = 0;
  }

  function setVisibleCols(columns: Iterable<string>): void {
    const next = new Set([...columns].filter((column) => validColumns.has(column)));
    for (const column of options.columns) {
      if (column.required) {
        next.add(column.key);
      }
    }
    visibleCols = next;
  }

  function setFilter(column: string, filter: TableFilterValue | undefined): void {
    if (!validColumns.has(column)) {
      return;
    }
    const next = { ...filters };
    if (filter && isFilterActive(filter)) {
      next[column] = filter;
    } else {
      delete next[column];
    }
    filters = next;
    currentPage = 0;
  }

  function clearFilters(): void {
    filters = {};
    currentPage = 0;
  }

  function applyPreferences(preferences: TablePreferences | undefined): void {
    const next = normalizeTablePreferences(options.columns, preferences);
    setVisibleCols(next.visibleCols ?? options.columns.map((column) => column.key));
    pageSize = next.pageSize ?? options.defaultPageSize;
    sort = next.sort ?? options.defaultSort;
    filters = next.filters ?? {};
    currentPage = 0;
  }

  function exportPreferences(): TablePreferences {
    return {
      visibleCols: [...visibleCols],
      pageSize,
      ...(sort ? { sort } : {}),
      ...(Object.keys(filters).length > 0 ? { filters } : {}),
    };
  }

  return {
    columns: options.columns,
    get visibleColumns() {
      return visibleColumns;
    },
    get filteredRows() {
      return filteredRows;
    },
    get sortedRows() {
      return sortedRows;
    },
    get pageRows() {
      return pageRows;
    },
    get page() {
      return page;
    },
    get rangeText() {
      return rangeText;
    },
    get activeFilterCount() {
      return activeFilterCount;
    },
    get currentPage() {
      return boundedPage;
    },
    set currentPage(nextPage) {
      currentPage = Math.max(0, Math.floor(nextPage));
    },
    get pageSize() {
      return pageSize;
    },
    set pageSize(nextPageSize) {
      setPageSize(nextPageSize);
    },
    get sort() {
      return sort;
    },
    set sort(nextSort) {
      sort = isValidSort(options.columns, nextSort) ? nextSort : undefined;
    },
    get visibleCols(): Set<string> {
      return new Set<string>(visibleCols);
    },
    set visibleCols(nextColumns: Set<string>) {
      setVisibleCols(nextColumns);
    },
    get filters() {
      return { ...filters };
    },
    set filters(nextFilters) {
      filters = normalizeTablePreferences(options.columns, { filters: nextFilters }).filters ?? {};
      currentPage = 0;
    },
    setRows,
    toggleSort,
    setPageSize,
    setVisibleCols,
    setFilter,
    clearFilters,
    applyPreferences,
    exportPreferences,
  };
}

/** Validates persisted state against the columns supported by the current panel. */
export function normalizeTablePreferences<Row>(
  columns: readonly TableColumn<Row>[],
  preferences: TablePreferences | undefined,
): TablePreferences {
  if (!preferences) {
    return {};
  }

  const byKey = new Map(columns.map((column) => [column.key, column]));
  const visibleCols = Array.isArray(preferences.visibleCols)
    ? preferences.visibleCols.filter(
        (column): column is string => typeof column === 'string' && byKey.has(column),
      )
    : undefined;
  const pageSize =
    Number.isInteger(preferences.pageSize) && preferences.pageSize! > 0
      ? preferences.pageSize
      : undefined;
  const sort = isValidSort(columns, preferences.sort) ? preferences.sort : undefined;
  const filters = Object.fromEntries(
    Object.entries(preferences.filters ?? {}).filter(([column, filter]) => {
      const definition = byKey.get(column);
      return !!definition?.filter && isValidFilter(filter, definition.filter.kind);
    }),
  ) as Record<string, TableFilterValue>;

  return {
    ...(visibleCols ? { visibleCols } : {}),
    ...(pageSize ? { pageSize } : {}),
    ...(sort ? { sort } : {}),
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
  };
}

// ==================================================================
// FILTERING AND SORTING
// ==================================================================
function matchesFilters<Row>(
  row: Row,
  columns: readonly TableColumn<Row>[],
  filters: Record<string, TableFilterValue>,
): boolean {
  return Object.entries(filters).every(([key, filter]) => {
    const column = columns.find((candidate) => candidate.key === key);
    return !!column?.accessor && matchesFilter(column.accessor(row), filter);
  });
}

function matchesFilter(value: TableValue, filter: TableFilterValue): boolean {
  if (filter.kind === 'text') {
    return String(value ?? '')
      .toLocaleLowerCase()
      .includes(filter.query.toLocaleLowerCase());
  }
  if (filter.kind === 'enum') {
    return filter.values.includes(String(value ?? ''));
  }

  const compared = comparableValue(value, filter);
  const expected = comparableValue(filter.value, filter);
  if (compared === undefined || expected === undefined) {
    return false;
  }
  return matchesComparison(compared, expected, filter);
}

function matchesComparison(
  value: number,
  expected: number,
  filter: TableComparisonFilter,
): boolean {
  switch (filter.operator) {
    case 'equals':
      return value === expected;
    case 'notEquals':
      return value !== expected;
    case 'before':
    case 'lessThan':
      return value < expected;
    case 'after':
    case 'greaterThan':
      return value > expected;
  }
}

function sortRows<Row>(
  rows: readonly Row[],
  columns: readonly TableColumn<Row>[],
  sort: TableSort | undefined,
): Row[] {
  if (!sort) {
    return [...rows];
  }
  const column = columns.find((candidate) => candidate.key === sort.column);
  if (!column) {
    return [...rows];
  }
  return [...rows].sort((left, right) => {
    if (column.compare) {
      return column.compare(left, right, sort.direction);
    }
    return compareValues(column.accessor?.(left), column.accessor?.(right)) * sort.direction;
  });
}

function compareValues(left: TableValue, right: TableValue): number {
  if (left === right) {
    return 0;
  }
  if (left === null || left === undefined) {
    return 1;
  }
  if (right === null || right === undefined) {
    return -1;
  }
  if (typeof left === 'number' && typeof right === 'number') {
    return left - right;
  }
  if (left instanceof Date && right instanceof Date) {
    return left.getTime() - right.getTime();
  }
  return String(left).localeCompare(String(right), undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function comparableValue(value: TableValue, filter: TableComparisonFilter): number | undefined {
  if (filter.kind === 'number') {
    const number = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(number) ? number : undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : dayValue(value);
  }
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? undefined : dayValue(date);
}

function dayValue(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

function isFilterActive(filter: TableFilterValue): boolean {
  return filter.kind === 'text'
    ? filter.query.trim().length > 0
    : filter.kind === 'enum'
      ? filter.values.length > 0
      : filter.value !== '';
}

function isValidFilter(filter: unknown, expectedKind: string): filter is TableFilterValue {
  if (!filter || typeof filter !== 'object' || !('kind' in filter)) {
    return false;
  }
  const candidate = filter as Record<string, unknown>;
  if (candidate.kind !== expectedKind) {
    return false;
  }
  if (candidate.kind === 'text') {
    return typeof candidate.query === 'string';
  }
  if (candidate.kind === 'enum') {
    return (
      Array.isArray(candidate.values) &&
      candidate.values.every((value: unknown) => typeof value === 'string')
    );
  }
  return (
    typeof candidate.operator === 'string' &&
    ['equals', 'notEquals', 'before', 'after', 'lessThan', 'greaterThan'].includes(
      candidate.operator,
    ) &&
    (typeof candidate.value === 'string' || typeof candidate.value === 'number')
  );
}

function isValidSort<Row>(columns: readonly TableColumn<Row>[], sort: unknown): sort is TableSort {
  return (
    !!sort &&
    typeof sort === 'object' &&
    'column' in sort &&
    'direction' in sort &&
    typeof sort.column === 'string' &&
    (sort.direction === 1 || sort.direction === -1) &&
    columns.some((column) => column.key === sort.column && column.sortable)
  );
}
