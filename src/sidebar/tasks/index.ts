/**
 * @module sidebar/tasks
 * Barrel for the Tasks sidebar section: tree view, tree data provider, and the
 * operations (tasks) API client.
 */

export { TasksSection } from './tasksSection.js';
export { TasksTreeDataProvider, TaskTreeItem } from './tasksTreeDataProvider.js';
export { cancelOperation, listOperationsPage } from './tasksApiClient.js';
export type { Operation } from './tasksApiClient.js';
