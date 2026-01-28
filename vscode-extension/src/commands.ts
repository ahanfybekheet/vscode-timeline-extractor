/**
 * Command handlers for Timeline Extractor extension.
 * 
 * Contains all command implementations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VSCodeTimelineExtractor } from './extractor';
import { TimelineFilesProvider, TimelineTreeItem, VersionsTreeProvider, VersionTreeItem } from './treeViews';
import { formatTimestampReadable, getRelativeTime, parseTimestamp } from './utils';
import { FileEntry } from './models';

/**
 * Register all extension commands.
 */
export function registerCommands(
    context: vscode.ExtensionContext,
    extractor: VSCodeTimelineExtractor,
    filesProvider: TimelineFilesProvider,
    versionsProvider: VersionsTreeProvider
): void {
    // Show Info Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.showInfo', async () => {
            await showInfo(extractor);
        })
    );

    // List Files Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.listFiles', async () => {
            await listFiles(extractor);
        })
    );

    // List Files in Directory Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.listFilesInDirectory', async () => {
            await listFilesInDirectory(extractor, filesProvider);
        })
    );

    // Reconstruct Directory Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.reconstructDirectory', async (uri?: vscode.Uri) => {
            await reconstructDirectory(extractor, uri);
        })
    );

    // Reconstruct Directory at Time Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.reconstructDirectoryAtTime', async (uri?: vscode.Uri) => {
            await reconstructDirectoryAtTime(extractor, uri);
        })
    );

    // Show Versions Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.showVersions', async (item?: TimelineTreeItem | vscode.Uri) => {
            await showVersions(extractor, versionsProvider, item);
        })
    );

    // Export Version Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.exportVersion', async (item?: VersionTreeItem) => {
            await exportVersion(extractor, item, versionsProvider);
        })
    );

    // Refresh Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.refresh', async () => {
            await extractor.refresh();
            filesProvider.refresh();
            versionsProvider.refresh();
            vscode.window.showInformationMessage('Timeline Extractor: Refreshed');
        })
    );

    // Open Version Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.openVersion', async (item?: VersionTreeItem) => {
            await openVersion(item);
        })
    );

    // Compare with Current Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.compareWithCurrent', async (item?: VersionTreeItem) => {
            await compareWithCurrent(item);
        })
    );

    // Restore Version Command
    context.subscriptions.push(
        vscode.commands.registerCommand('timelineExtractor.restoreVersion', async (item?: VersionTreeItem) => {
            await restoreVersion(item);
        })
    );
}

/**
 * Show timeline info and statistics.
 */
async function showInfo(extractor: VSCodeTimelineExtractor): Promise<void> {
    try {
        const stats = await extractor.getStatistics();
        
        let message = `**Timeline Extractor Statistics**\n\n`;
        message += `📁 Timeline Path: \`${stats.timelinePath}\`\n\n`;
        message += `📄 Total Files: **${stats.totalFiles}**\n\n`;
        message += `📚 Total Versions: **${stats.totalVersions}**\n\n`;
        
        if (stats.oldestEntry) {
            message += `⏪ Oldest Entry: ${formatTimestampReadable(stats.oldestEntry.timestamp)} (${getRelativeTime(stats.oldestEntry.timestamp)})\n\n`;
        }
        
        if (stats.newestEntry) {
            message += `⏩ Newest Entry: ${formatTimestampReadable(stats.newestEntry.timestamp)} (${getRelativeTime(stats.newestEntry.timestamp)})\n\n`;
        }

        const panel = vscode.window.createWebviewPanel(
            'timelineInfo',
            'Timeline Extractor Info',
            vscode.ViewColumn.One,
            {}
        );

        panel.webview.html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { 
                        font-family: var(--vscode-font-family); 
                        padding: 20px;
                        color: var(--vscode-foreground);
                    }
                    h1 { color: var(--vscode-textLink-foreground); }
                    .stat { margin: 10px 0; }
                    .label { font-weight: bold; }
                    code { 
                        background: var(--vscode-textCodeBlock-background); 
                        padding: 2px 6px;
                        border-radius: 3px;
                    }
                </style>
            </head>
            <body>
                <h1>📊 Timeline Extractor Statistics</h1>
                <div class="stat">
                    <span class="label">📁 Timeline Path:</span>
                    <code>${stats.timelinePath}</code>
                </div>
                <div class="stat">
                    <span class="label">📄 Total Files:</span> ${stats.totalFiles}
                </div>
                <div class="stat">
                    <span class="label">📚 Total Versions:</span> ${stats.totalVersions}
                </div>
                ${stats.oldestEntry ? `
                <div class="stat">
                    <span class="label">⏪ Oldest Entry:</span> 
                    ${formatTimestampReadable(stats.oldestEntry.timestamp)} 
                    (${getRelativeTime(stats.oldestEntry.timestamp)})
                </div>
                ` : ''}
                ${stats.newestEntry ? `
                <div class="stat">
                    <span class="label">⏩ Newest Entry:</span> 
                    ${formatTimestampReadable(stats.newestEntry.timestamp)} 
                    (${getRelativeTime(stats.newestEntry.timestamp)})
                </div>
                ` : ''}
            </body>
            </html>
        `;
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to get timeline info: ${e}`);
    }
}

/**
 * List all files in the timeline.
 */
async function listFiles(extractor: VSCodeTimelineExtractor): Promise<void> {
    try {
        const files = await extractor.getAllFiles();
        
        const items: vscode.QuickPickItem[] = [];
        for (const [filePath, timelineFile] of files) {
            items.push({
                label: timelineFile.filename,
                description: `${timelineFile.versionCount} versions`,
                detail: filePath,
            });
        }

        items.sort((a, b) => a.label.localeCompare(b.label));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: `Select a file (${files.size} files in timeline)`,
            matchOnDescription: true,
            matchOnDetail: true,
        });

        if (selected && selected.detail) {
            const file = files.get(selected.detail);
            if (file) {
                vscode.commands.executeCommand('timelineExtractor.showVersions', file);
            }
        }
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to list files: ${e}`);
    }
}

/**
 * List files in a specific directory.
 */
async function listFilesInDirectory(
    extractor: VSCodeTimelineExtractor,
    filesProvider: TimelineFilesProvider
): Promise<void> {
    const directory = await vscode.window.showInputBox({
        prompt: 'Enter directory path to filter',
        placeHolder: '/path/to/directory',
        value: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
    });

    if (directory) {
        filesProvider.setFilter(directory);
        vscode.window.showInformationMessage(`Filtering by: ${directory}`);
    }
}

/**
 * Reconstruct a directory with latest versions.
 */
async function reconstructDirectory(
    extractor: VSCodeTimelineExtractor,
    uri?: vscode.Uri
): Promise<void> {
    let sourceDirectory: string;

    if (uri) {
        sourceDirectory = uri.fsPath;
    } else {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter source directory path to reconstruct',
            placeHolder: '/path/to/source/directory',
            value: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        });

        if (!input) {
            return;
        }
        sourceDirectory = input;
    }

    // Get output directory
    const config = vscode.workspace.getConfiguration('timelineExtractor');
    let defaultOutput = config.get<string>('defaultOutputDirectory') || '';
    
    if (!defaultOutput) {
        defaultOutput = path.join(path.dirname(sourceDirectory), `${path.basename(sourceDirectory)}_recovered`);
    }

    const outputUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultOutput),
        title: 'Select output directory',
    });

    if (!outputUri) {
        return;
    }

    const outputDirectory = outputUri.fsPath;
    const exportMetadata = config.get<boolean>('exportMetadata', true);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: 'Reconstructing directory...',
        cancellable: false,
    }, async () => {
        try {
            const result = await extractor.reconstructDirectory(
                sourceDirectory,
                outputDirectory,
                exportMetadata
            );

            if (result.success) {
                const action = await vscode.window.showInformationMessage(
                    `Reconstructed ${result.filesProcessed} files to ${outputDirectory}`,
                    'Open Folder'
                );

                if (action === 'Open Folder') {
                    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(outputDirectory), { forceNewWindow: true });
                }
            } else {
                vscode.window.showErrorMessage(`Reconstruction failed: ${result.error}`);
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to reconstruct directory: ${e}`);
        }
    });
}

/**
 * Reconstruct a directory at a specific time.
 */
async function reconstructDirectoryAtTime(
    extractor: VSCodeTimelineExtractor,
    uri?: vscode.Uri
): Promise<void> {
    let sourceDirectory: string;

    if (uri) {
        sourceDirectory = uri.fsPath;
    } else {
        const input = await vscode.window.showInputBox({
            prompt: 'Enter source directory path to reconstruct',
            placeHolder: '/path/to/source/directory',
            value: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '',
        });

        if (!input) {
            return;
        }
        sourceDirectory = input;
    }

    // Get timestamp
    const timestampInput = await vscode.window.showInputBox({
        prompt: 'Enter timestamp (ISO format: 2025-06-27T14:30:00, date: 2025-06-27, or Unix ms)',
        placeHolder: '2025-06-27',
    });

    if (!timestampInput) {
        return;
    }

    let timestamp: number;
    try {
        timestamp = parseTimestamp(timestampInput);
    } catch (e) {
        vscode.window.showErrorMessage(`Invalid timestamp: ${e}`);
        return;
    }

    // Get output directory
    const config = vscode.workspace.getConfiguration('timelineExtractor');
    const defaultOutput = path.join(
        path.dirname(sourceDirectory), 
        `${path.basename(sourceDirectory)}_at_${timestampInput.replace(/[:/]/g, '-')}`
    );

    const outputUri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(defaultOutput),
        title: 'Select output directory',
    });

    if (!outputUri) {
        return;
    }

    const outputDirectory = outputUri.fsPath;
    const exportMetadata = config.get<boolean>('exportMetadata', true);

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: `Reconstructing directory as of ${formatTimestampReadable(timestamp)}...`,
        cancellable: false,
    }, async () => {
        try {
            const result = await extractor.reconstructDirectory(
                sourceDirectory,
                outputDirectory,
                exportMetadata,
                timestamp
            );

            if (result.success) {
                const message = result.skippedFiles 
                    ? `Reconstructed ${result.filesProcessed} files (${result.skippedFiles} skipped - didn't exist at that time)`
                    : `Reconstructed ${result.filesProcessed} files`;
                
                const action = await vscode.window.showInformationMessage(
                    message,
                    'Open Folder'
                );

                if (action === 'Open Folder') {
                    vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(outputDirectory), { forceNewWindow: true });
                }
            } else {
                vscode.window.showErrorMessage(`Reconstruction failed: ${result.error}`);
            }
        } catch (e) {
            vscode.window.showErrorMessage(`Failed to reconstruct directory: ${e}`);
        }
    });
}

/**
 * Show versions of a file.
 */
async function showVersions(
    extractor: VSCodeTimelineExtractor,
    versionsProvider: VersionsTreeProvider,
    item?: TimelineTreeItem | vscode.Uri
): Promise<void> {
    try {
        let timelineFile;

        if (item instanceof TimelineTreeItem && item.timelineFile) {
            timelineFile = item.timelineFile;
        } else if (item instanceof vscode.Uri) {
            timelineFile = await extractor.getFile(item.fsPath);
        } else {
            // Prompt for file path
            const input = await vscode.window.showInputBox({
                prompt: 'Enter file path to view versions',
                placeHolder: '/path/to/file',
                value: vscode.window.activeTextEditor?.document.uri.fsPath || '',
            });

            if (!input) {
                return;
            }

            timelineFile = await extractor.getFile(input);
        }

        if (timelineFile) {
            versionsProvider.setFile(timelineFile);
            vscode.commands.executeCommand('timelineExtractorVersions.focus');
        } else {
            vscode.window.showWarningMessage('No timeline history found for this file');
        }
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to show versions: ${e}`);
    }
}

/**
 * Export a specific version.
 */
async function exportVersion(
    extractor: VSCodeTimelineExtractor,
    item?: VersionTreeItem,
    versionsProvider?: VersionsTreeProvider
): Promise<void> {
    try {
        let timelineFile;
        let entry;

        if (item) {
            timelineFile = item.timelineFile;
            entry = item.entry;
        } else if (versionsProvider) {
            const currentFile = versionsProvider.getCurrentFile();
            if (!currentFile) {
                vscode.window.showWarningMessage('No file selected');
                return;
            }

            // Show quick pick for version selection
            const sortedEntries = currentFile.sortedEntries;
            const versions: Array<vscode.QuickPickItem & { entry: FileEntry }> = sortedEntries.map((e: FileEntry, i: number) => ({
                label: `Version ${sortedEntries.length - i}`,
                description: formatTimestampReadable(e.timestamp),
                entry: e,
            }));

            const selected = await vscode.window.showQuickPick(versions, {
                placeHolder: 'Select version to export',
            });

            if (!selected) {
                return;
            }

            timelineFile = currentFile;
            entry = selected.entry;
        }

        if (!timelineFile || !entry) {
            return;
        }

        const defaultPath = path.join(
            path.dirname(timelineFile.relativePath),
            `${path.basename(timelineFile.relativePath, path.extname(timelineFile.relativePath))}_v${entry.timestamp}${path.extname(timelineFile.relativePath)}`
        );

        const outputUri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(defaultPath),
            title: 'Export version to',
        });

        if (!outputUri) {
            return;
        }

        extractor.exportVersion(timelineFile, entry, outputUri.fsPath);
        vscode.window.showInformationMessage(`Exported to ${outputUri.fsPath}`);
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to export version: ${e}`);
    }
}

/**
 * Open a version in the editor.
 */
async function openVersion(item?: VersionTreeItem): Promise<void> {
    if (!item) {
        return;
    }

    const filePath = item.timelineFile.getFileContentPath(item.entry);
    
    if (!fs.existsSync(filePath)) {
        vscode.window.showErrorMessage('Version file not found');
        return;
    }

    const doc = await vscode.workspace.openTextDocument(filePath);
    await vscode.window.showTextDocument(doc, { preview: true });
}

/**
 * Compare a version with the current file.
 */
async function compareWithCurrent(item?: VersionTreeItem): Promise<void> {
    if (!item) {
        return;
    }

    const versionPath = item.timelineFile.getFileContentPath(item.entry);
    const currentPath = item.timelineFile.relativePath;

    if (!fs.existsSync(versionPath)) {
        vscode.window.showErrorMessage('Version file not found');
        return;
    }

    if (!fs.existsSync(currentPath)) {
        vscode.window.showWarningMessage('Current file not found. Opening version only.');
        const doc = await vscode.workspace.openTextDocument(versionPath);
        await vscode.window.showTextDocument(doc);
        return;
    }

    const title = `${item.timelineFile.filename} (Version ${item.versionNumber} ↔ Current)`;
    
    await vscode.commands.executeCommand(
        'vscode.diff',
        vscode.Uri.file(versionPath),
        vscode.Uri.file(currentPath),
        title
    );
}

/**
 * Restore a version to the original file location.
 */
async function restoreVersion(item?: VersionTreeItem): Promise<void> {
    if (!item) {
        return;
    }

    const currentPath = item.timelineFile.relativePath;
    const versionPath = item.timelineFile.getFileContentPath(item.entry);

    if (!fs.existsSync(versionPath)) {
        vscode.window.showErrorMessage('Version file not found');
        return;
    }

    const confirm = await vscode.window.showWarningMessage(
        `Restore version ${item.versionNumber} to ${currentPath}? This will overwrite the current file.`,
        { modal: true },
        'Restore'
    );

    if (confirm !== 'Restore') {
        return;
    }

    try {
        fs.copyFileSync(versionPath, currentPath);
        vscode.window.showInformationMessage(`Restored version ${item.versionNumber}`);
        
        // Refresh if the file is open
        const openDoc = vscode.workspace.textDocuments.find(d => d.uri.fsPath === currentPath);
        if (openDoc) {
            vscode.commands.executeCommand('workbench.action.files.revert');
        }
    } catch (e) {
        vscode.window.showErrorMessage(`Failed to restore version: ${e}`);
    }
}
