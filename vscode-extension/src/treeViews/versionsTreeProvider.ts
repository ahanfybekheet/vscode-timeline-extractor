/**
 * Tree View Provider for File Versions.
 * 
 * Provides a tree view showing all versions of a selected file.
 */

import * as vscode from 'vscode';
import { TimelineFile, FileEntry } from '../models';
import { getRelativeTime, formatTimestampReadable, getFileSizeReadable } from '../utils';

/**
 * Tree item representing a file version.
 */
export class VersionTreeItem extends vscode.TreeItem {
    constructor(
        public readonly timelineFile: TimelineFile,
        public readonly entry: FileEntry,
        public readonly versionNumber: number
    ) {
        super(
            `Version ${versionNumber}`,
            vscode.TreeItemCollapsibleState.None
        );

        const filePath = timelineFile.getFileContentPath(entry);
        const sizeStr = getFileSizeReadable(filePath);
        
        this.description = `${getRelativeTime(entry.timestamp)} - ${sizeStr}`;
        
        this.tooltip = new vscode.MarkdownString(
            `**Version ${versionNumber}**\n\n` +
            `Date: ${formatTimestampReadable(entry.timestamp)}\n\n` +
            `Size: ${sizeStr}\n\n` +
            (entry.source ? `Source: ${entry.source}\n\n` : '') +
            (entry.sourceDescription ? `Description: ${entry.sourceDescription}\n\n` : '') +
            `Entry ID: \`${entry.id}\``
        );

        this.contextValue = 'fileVersion';
        this.iconPath = new vscode.ThemeIcon('git-commit');
        
        // Command to open this version
        this.command = {
            command: 'timelineExtractor.openVersion',
            title: 'Open Version',
            arguments: [this],
        };
    }
}

/**
 * Tree data provider for file versions.
 */
export class VersionsTreeProvider implements vscode.TreeDataProvider<VersionTreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<VersionTreeItem | undefined | null | void> = 
        new vscode.EventEmitter<VersionTreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<VersionTreeItem | undefined | null | void> = 
        this._onDidChangeTreeData.event;

    private currentFile?: TimelineFile;

    constructor() {}

    /**
     * Set the file to show versions for.
     */
    setFile(file?: TimelineFile): void {
        this.currentFile = file;
        this._onDidChangeTreeData.fire();
    }

    /**
     * Refresh the tree view.
     */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    /**
     * Get tree item representation.
     */
    getTreeItem(element: VersionTreeItem): vscode.TreeItem {
        return element;
    }

    /**
     * Get children of a tree item.
     */
    async getChildren(element?: VersionTreeItem): Promise<VersionTreeItem[]> {
        if (element || !this.currentFile) {
            return [];
        }

        // Return all versions sorted by timestamp (newest first)
        const sortedEntries = this.currentFile.sortedEntries;
        
        return sortedEntries.map((entry: FileEntry, index: number) => 
            new VersionTreeItem(this.currentFile!, entry, sortedEntries.length - index)
        );
    }

    /**
     * Get the currently displayed file.
     */
    getCurrentFile(): TimelineFile | undefined {
        return this.currentFile;
    }
}
