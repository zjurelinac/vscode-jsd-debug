'use strict';

import * as vscode from 'vscode';
import { WorkspaceFolder, DebugConfiguration, ProviderResult, CancellationToken, window } from 'vscode';
import { JSDDebugSession } from './jsdDebug';
import * as runtime from './jsdRuntime';
import * as Net from 'net';


// Initialize the output channel
(<any> runtime).outputChannel = window.createOutputChannel('JSD');;


export function activate(context: vscode.ExtensionContext) {
	const provider = new JSDConfigurationProvider();
	context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('jsd', provider));
	context.subscriptions.push(provider);
}

export function deactivate() {}

class JSDConfigurationProvider implements vscode.DebugConfigurationProvider {
	private _server?: Net.Server;

	resolveDebugConfiguration(folder: WorkspaceFolder | undefined, config: DebugConfiguration, token?: CancellationToken): ProviderResult<DebugConfiguration> {
		if (!this._server) {
			this._server = Net.createServer(socket => {
				const session = new JSDDebugSession();
				session.setRunAsServer(true);
				session.start(<NodeJS.ReadableStream>socket, socket);
			}).listen(0);
		}
		config.debugServer = this._server.address().port;

		return config;
	}

	dispose() {}
}
