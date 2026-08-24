/**
 * @module taskHistory
 * Shared task-history settings and date-based operation filtering.
 */

import * as vscode from 'vscode';
import type { Operation } from './tasksApiClient.js';

/** Default number of days of task history to load. */
export const DEFAULT_TASK_HISTORY_DAYS = 30;

/** Result of filtering a page of operations by its creation time. */
export interface TaskHistoryFilterResult {
  operations: Operation[];
  reachedHistoryLimit: boolean;
}

/** Reads the configured number of days of task history to load. */
export function getTaskHistoryDays(): number {
  const configuredDays = vscode.workspace
    .getConfiguration('earthengine.tasks')
    .get<number>('historyDays', DEFAULT_TASK_HISTORY_DAYS);
  return Number.isFinite(configuredDays)
    ? Math.max(1, Math.floor(configuredDays))
    : DEFAULT_TASK_HISTORY_DAYS;
}

/**
 * Keeps operations created within the requested history window.
 * Operations without a valid creation time are preserved so they cannot be
 * hidden solely because the API omitted metadata.
 */
export function filterOperationsByHistory(
  operations: Operation[],
  historyDays: number,
  now = Date.now(),
): TaskHistoryFilterResult {
  const cutoff = now - historyDays * 24 * 60 * 60 * 1_000;
  let reachedHistoryLimit = false;

  const recentOperations = operations.filter((operation) => {
    const createTime = operation.metadata?.createTime;
    if (!createTime) {
      return true;
    }

    const createdAt = Date.parse(createTime);
    if (Number.isNaN(createdAt)) {
      return true;
    }

    if (createdAt < cutoff) {
      reachedHistoryLimit = true;
      return false;
    }

    return true;
  });

  return { operations: recentOperations, reachedHistoryLimit };
}
