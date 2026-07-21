import * as vscode from 'vscode';

export function registerCommands(context: vscode.ExtensionContext) {
	const helloWorld = vscode.commands.registerCommand('earthengine.helloWorld', () => {
		vscode.window.showInformationMessage('Hello World from earthengine!');
	});

	const showAuthStatus = vscode.commands.registerCommand('earthengine.showAuthStatus', () => {
		vscode.window.showWarningMessage(
			'Google Earth Engine is not authenticated.',
			'Sign in'
		);
	});
	const signIn = vscode.commands.registerCommand('earthengine.signIn', () => {
		vscode.window.showInformationMessage('Sign in to Google Earth Engine (not yet implemented)');
	});
	context.subscriptions.push(helloWorld, showAuthStatus);
}
