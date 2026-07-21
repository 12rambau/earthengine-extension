import * as vscode from 'vscode';

export function registerCommands(context: vscode.ExtensionContext) {
	const helloWorld = vscode.commands.registerCommand('earthengine.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from earthengine!');
	});

	context.subscriptions.push(helloWorld);
}
