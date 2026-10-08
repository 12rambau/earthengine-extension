/**
 * @module getPythonSetupTool
 * Language Model Tool that gives the assistant the header an Earth Engine
 * Python script should start with, using the active profile's project.
 */

import * as vscode from 'vscode';
import type { AuthService } from '../auth/index.js';

/** Returns the script header, matching the profile section's "New Python script". */
function scriptHeader(project: string | undefined): string {
  return [
    'import ee',
    'from vscee import Map',
    '',
    project ? `ee.Initialize(project="${project}")` : 'ee.Initialize()',
  ].join('\n');
}

/** Reports the active Earth Engine project and the header to start a Python script with. */
export class GetPythonSetupTool implements vscode.LanguageModelTool<Record<string, never>> {
  /** Tool id, must match `contributes.languageModelTools[].name` in package.json. */
  static readonly id = 'earthengine_getPythonSetup';

  constructor(private readonly authService: AuthService) {}

  async invoke(): Promise<vscode.LanguageModelToolResult> {
    const project = this.authService.currentProfile?.project;
    const info = {
      project: project ?? null,
      pythonPackages: ['earthengine-api', 'vscee'],
      header: scriptHeader(project),
    };
    return new vscode.LanguageModelToolResult([
      new vscode.LanguageModelTextPart(JSON.stringify(info, null, 2)),
    ]);
  }

  /** Registers the tool. */
  register(context: vscode.ExtensionContext): void {
    context.subscriptions.push(vscode.lm.registerTool(GetPythonSetupTool.id, this));
  }
}
