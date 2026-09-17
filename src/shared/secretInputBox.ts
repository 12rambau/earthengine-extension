/**
 * @module secretInputBox
 * A masked `InputBox` with an eye-icon button to toggle visibility, for
 * pasting secrets (auth codes, keys) that should be hidden by default.
 */

import * as vscode from 'vscode';

/** Options for {@link showSecretInputBox}. */
export interface SecretInputBoxOptions {
  title?: string;
  prompt?: string;
  placeHolder?: string;
  ignoreFocusOut?: boolean;
}

const REVEAL_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('eye'),
  tooltip: 'Show value',
};
const CONCEAL_BUTTON: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('eye-closed'),
  tooltip: 'Hide value',
};

/**
 * Shows an input box whose value is masked by default, with a button to
 * toggle plain-text visibility. Resolves to the entered text, or
 * `undefined` if the user cancels.
 */
export function showSecretInputBox(options: SecretInputBoxOptions): Promise<string | undefined> {
  return new Promise((resolve) => {
    const input = vscode.window.createInputBox();
    input.title = options.title;
    input.prompt = options.prompt;
    input.placeholder = options.placeHolder;
    input.ignoreFocusOut = options.ignoreFocusOut ?? false;
    input.password = true;
    input.buttons = [REVEAL_BUTTON];

    let accepted = false;

    input.onDidTriggerButton(() => {
      input.password = !input.password;
      input.buttons = [input.password ? REVEAL_BUTTON : CONCEAL_BUTTON];
    });

    input.onDidAccept(() => {
      accepted = true;
      input.hide();
      resolve(input.value === '' ? undefined : input.value);
    });

    input.onDidHide(() => {
      input.dispose();
      if (!accepted) {
        resolve(undefined);
      }
    });

    input.show();
  });
}
