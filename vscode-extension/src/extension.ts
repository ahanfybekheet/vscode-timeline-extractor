/**
 * VS Code Timeline Extractor Extension
 * 
 * Main extension entry point.
 * Extracts and reconstructs files from VS Code's Timeline / local history.
 */

import * as vscode from 'vscode';
import { VSCodeTimelineExtractor } from './extractor';
import { TimelineFilesProvider, VersionsTreeProvider } from './treeViews';
import { registerCommands } from './commands';

let extractor: VSCodeTimelineExtractor;
let outputChannel: vscode.OutputChannel;

/**
 * Extension activation.
 */
export function activate(context: vscode.ExtensionContext): void {
    outputChannel = vscode.window.createOutputChannel('Timeline Extractor');
    outputChannel.appendLine('Timeline Extractor extension activated');

    try {
        // Initialize the extractor
        extractor = new VSCodeTimelineExtractor(undefined, outputChannel);

        // Create tree data providers
        const filesProvider = new TimelineFilesProvider(extractor);
        const versionsProvider = new VersionsTreeProvider();

        // Register tree views
        const filesTreeView = vscode.window.createTreeView('timelineExtractorFiles', {
            treeDataProvider: filesProvider,
            showCollapseAll: true,
        });

        const versionsTreeView = vscode.window.createTreeView('timelineExtractorVersions', {
            treeDataProvider: versionsProvider,
            showCollapseAll: true,
        });

        context.subscriptions.push(filesTreeView);
        context.subscriptions.push(versionsTreeView);

        // Register commands
        registerCommands(context, extractor, filesProvider, versionsProvider);

        // Initial scan
        extractor.scanTimeline().then(count => {
            outputChannel.appendLine(`Initial scan complete: ${count} files found`);
            filesProvider.refresh();
        }).catch(err => {
            outputChannel.appendLine(`Initial scan failed: ${err}`);
            vscode.window.showWarningMessage(
                `Timeline Extractor: Could not access timeline directory. ${err.message}`
            );
        });

        // Watch for configuration changes
        context.subscriptions.push(
            vscode.workspace.onDidChangeConfiguration(e => {
                if (e.affectsConfiguration('timelineExtractor')) {
                    outputChannel.appendLine('Configuration changed, reinitializing...');
                    try {
                        extractor = new VSCodeTimelineExtractor(undefined, outputChannel);
                        filesProvider.refresh();
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to reinitialize: ${err}`);
                    }
                }
            })
        );

        outputChannel.appendLine('Timeline Extractor extension ready');

    } catch (error) {
        outputChannel.appendLine(`Activation error: ${error}`);
        vscode.window.showErrorMessage(
            `Timeline Extractor failed to activate: ${error}`
        );
    }
}

/**
 * Extension deactivation.
 */
export function deactivate(): void {
    if (outputChannel) {
        outputChannel.appendLine('Timeline Extractor extension deactivated');
        outputChannel.dispose();
    }
}
