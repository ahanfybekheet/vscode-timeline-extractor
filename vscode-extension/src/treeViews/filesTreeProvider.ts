/**
 * Tree View Provider for Timeline Files.
 * 
 * Provides a tree view of all files tracked in VS Code's timeline,
 * organized by directory structure.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { VSCodeTimelineExtractor } from '../extractor';
import { TimelineFile } from '../models';
import { getRelativeTime, formatTimestampReadable } from '../utils';

/**
 * Tree item representing a file or directory in the timeline.
 */
export class TimelineTreeItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public readonly timelineFile?: TimelineFile,
        public readonly isDirectory: boolean = false,
        public readonly fullPath?: string
    ) {
        super(label, collapsibleState);

        if (timelineFile && !isDirectory) {
            const latest = timelineFile.latestEntry;
            this.description = `${timelineFile.versionCount} version${timelineFile.versionCount !== 1 ? 's' : ''}`;
            if (latest) {
                this.tooltip = new vscode.MarkdownString(
                    `**${timelineFile.filename}**\n\n` +
                    `Path: \`${timelineFile.relativePath}\`\n\n` +
                    `Versions: ${timelineFile.versionCount}\n\n` +
                    `Latest: ${formatTimestampReadable(latest.timestamp)}\n\n` +
                    `(${getRelativeTime(latest.timestamp)})`
                );
            }
            this.contextValue = 'timelineFile';
            this.iconPath = new vscode.ThemeIcon('file');
            this.command = {
                command: 'timelineExtractor.showVersions',
                title: 'Show Versions',
                arguments: [this],
            };
        } else if (isDirectory) {
            this.contextValue = 'timelineDirectory';
            this.iconPath = new vscode.ThemeIcon('folder');
        }
    }
}

/**
 * Tree data provider for timeline files.
 */
export class TimelineFilesProvider implements vscode.TreeDataProvider<TimelineTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<TimelineTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<TimelineTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TimelineTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private extractor: VSCodeTimelineExtractor;
    private filterDirectory?: string;

    constructor(extractor: VSCodeTimelineExtractor) {
        this.extractor = extractor;
    }

    /**
     * Refresh the tree view.
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Set a directory filter.
     */
    setFilter(directory?: string): void {
        this.filterDirectory = directory;
        this.refresh();
    }

    /**
     * Get tree item representation.
     */
    getTreeItem(element: TimelineTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children of a tree item.
     */
    async getChildren(element?: TimelineTreeItem): Promise<TimelineTreeItem[]> {
        if (!element) {
            // Root level - build directory tree
            return this.buildRootTree();
        }

        if (element.isDirectory && element.fullPath) {
            // Get children of a directory
            return this.getDirectoryChildren(element.fullPath);
        }

        return [];
    }

    /**
     * Build the root level of the tree.
     */
    private async buildRootTree(): Promise<TimelineTreeItem[]> {
        let files: Map<string, TimelineFile>;

        if (this.filterDirectory) {
            files = await this.extractor.filterByDirectory(this.filterDirectory);
        } else {
            files = await this.extractor.getAllFiles();
        }

        // Build a directory tree structure
        const tree = new Map<string, {
            files: Map<string, TimelineFile>;
            subdirs: Set<string>;
        }>();

        // Find common root
        const allPaths = Array.from(files.keys());
        if (allPaths.length === 0) {
            return [new TimelineTreeItem(
                'No files in timeline',
                vscode.TreeItemCollapsibleState.None
            )];
        }

        // Group by top-level directories (workspace folders or common roots)
        const workspaceFolders = vscode.workspace.workspaceFolders?.map(f => f.uri.fsPath) || [];
        
        const grouped = new Map<string, TimelineFile[]>();

        for (const [filePath, timelineFile] of files) {
            // Try to find which workspace folder this belongs to
            let root = 'Other';
            for (const wsFolder of workspaceFolders) {
                if (filePath.startsWith(wsFolder)) {
                    root = wsFolder;
                    break;
                }
            }
            
            if (!grouped.has(root)) {
                grouped.set(root, []);
            }
            grouped.get(root)!.push(timelineFile);
        }

        // Create tree items for each group
        const items: TimelineTreeItem[] = [];

        for (const [rootPath, groupFiles] of grouped) {
            if (rootPath === 'Other') {
                // For "Other" files, show them directly
                for (const file of groupFiles) {
                    items.push(new TimelineTreeItem(
                        file.relativePath,
                        vscode.TreeItemCollapsibleState.None,
                        file,
                        false,
                        file.relativePath
                    ));
                }
            } else {
                // Create a root folder item
                const folderName = path.basename(rootPath);
                const item = new TimelineTreeItem(
                    folderName,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    undefined,
                    true,
                    rootPath
                );
                item.description = `${groupFiles.length} file${groupFiles.length !== 1 ? 's' : ''}`;
                items.push(item);
            }
        }

        return items;
    }

    /**
     * Get children of a specific directory.
     */
    private async getDirectoryChildren(directoryPath: string): Promise<TimelineTreeItem[]> {
        const files = await this.extractor.filterByDirectory(directoryPath);
        
        // Organize into subdirectories and files
        const subdirs = new Map<string, TimelineFile[]>();
        const directFiles: TimelineFile[] = [];

        for (const [filePath, timelineFile] of files) {
            const relativePath = filePath.slice(directoryPath.length).replace(/^[/\\]/, '');
            const parts = relativePath.split(/[/\\]/);

            if (parts.length === 1) {
                // Direct file in this directory
                directFiles.push(timelineFile);
            } else {
                // File in a subdirectory
                const subdir = parts[0];
                const subdirPath = path.join(directoryPath, subdir);
                if (!subdirs.has(subdirPath)) {
                    subdirs.set(subdirPath, []);
                }
                subdirs.get(subdirPath)!.push(timelineFile);
            }
        }

        const items: TimelineTreeItem[] = [];

        // Add subdirectories
        for (const [subdirPath, subFiles] of subdirs) {
            const name = path.basename(subdirPath);
            const item = new TimelineTreeItem(
                name,
                vscode.TreeItemCollapsibleState.Collapsed,
                undefined,
                true,
                subdirPath
            );
            item.description = `${subFiles.length} file${subFiles.length !== 1 ? 's' : ''}`;
            items.push(item);
        }

        // Add direct files
        for (const file of directFiles) {
            items.push(new TimelineTreeItem(
                file.filename,
                vscode.TreeItemCollapsibleState.None,
                file,
                false,
                file.relativePath
            ));
        }

        // Sort: directories first, then files
        items.sort((a, b) => {
            if (a.isDirectory && !b.isDirectory) { return -1; }
            if (!a.isDirectory && b.isDirectory) { return 1; }
            return a.label.toString().localeCompare(b.label.toString());
        });

        return items;
    }
}
