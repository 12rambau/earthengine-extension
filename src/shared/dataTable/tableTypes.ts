/** @module tableTypes
 * Shared contracts for WebView data-table state and presentation.
 */

// ==================================================================
// VALUES AND FILTERS
// ==================================================================
/** A raw value that a table column can compare, sort, or filter. */
export type TableValue = string | number | Date | null | undefined;

/** The supported direction for a column sort. */
export type TableSortDirection = 1 | -1;

/** A persisted table sort selection. */
export interface TableSort {
  column: string;
  direction: TableSortDirection;
}

/** Filter kinds supported by the shared filter controls. */
export type TableFilterKind = 'text' | 'enum' | 'date' | 'number' | 'duration';

/** Operators for date and numeric column filters. */
export type TableComparisonOperator =
  'equals' | 'notEquals' | 'before' | 'after' | 'lessThan' | 'greaterThan';

/** The unit a duration filter's value is expressed in. */
export type TableDurationUnit = 'seconds' | 'minutes' | 'hours' | 'days';

/** A case-insensitive text filter. */
export interface TableTextFilter {
  kind: 'text';
  query: string;
}

/** A filter that matches any value in a selected set. */
export interface TableEnumFilter {
  kind: 'enum';
  values: string[];
}

/** A date or numeric comparison filter. */
export interface TableComparisonFilter {
  kind: 'date' | 'number';
  operator: TableComparisonOperator;
  value: string | number;
}

/**
 * A duration comparison filter. The column's underlying value is expected to be a
 * millisecond count; `value`/`unit` let the user express the comparison in a
 * human-readable unit (e.g. "greater than 10 minutes") instead of raw milliseconds.
 */
export interface TableDurationFilter {
  kind: 'duration';
  operator: TableComparisonOperator;
  value: string | number;
  unit: TableDurationUnit;
}

/** A serializable filter value owned by a table column. */
export type TableFilterValue =
  TableTextFilter | TableEnumFilter | TableComparisonFilter | TableDurationFilter;

/** Describes the filter control and values available for a column. */
export interface TableFilterDefinition {
  kind: TableFilterKind;
  options?: readonly string[];
}

// ==================================================================
// COLUMNS AND PREFERENCES
// ==================================================================
/** A declarative column definition for a data-table row. */
export interface TableColumn<Row> {
  key: string;
  label: string;
  required?: boolean;
  sortable?: boolean;
  filter?: TableFilterDefinition;
  accessor?: (row: Row) => TableValue;
  compare?: (left: Row, right: Row, direction: TableSortDirection) => number;
}

/** Generic table state suitable for persistence in VS Code global state. */
export interface TablePreferences {
  visibleCols?: string[];
  pageSize?: number;
  sort?: TableSort;
  filters?: Record<string, TableFilterValue>;
}

/** The calculated pagination range for the current page. */
export interface TablePage {
  currentPage: number;
  totalPages: number;
  startIndex: number;
  endIndex: number;
}
