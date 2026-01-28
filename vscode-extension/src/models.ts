/**
 * Data models for VS Code Timeline Extractor.
 * 
 * Contains interfaces and classes that represent timeline entries
 * and files with their version history.
 */

import * as path from 'path';
import * as fs from 'fs';
import { decodeFileUri, computeFileHash, formatTimestamp } from './utils';

/**
 * Represents a single version of a file in the timeline.
 */
export interface FileEntry {
    /**
     * The filename of the version in the timeline directory.
     */
    id: string;

    /**
     * Unix timestamp in milliseconds when this version was saved.
     */
    timestamp: number;

    /**
     * What triggered the save (e.g., "undoRedo.source", "Chat Edit").
     */
    source?: string;

    /**
     * Additional description about the source.
     */
    sourceDescription?: string;
}

/**
 * Metadata for a processed file during reconstruction.
 */
export interface FileMetadata {
    originalPath: string;
    relativePath: string;
    entryId: string;
    timestamp: number;
    datetime: string;
    source?: string;
    sourceDescription?: string;
    hash?: string;
}

/**
 * Result of a directory reconstruction operation.
 */
export interface ReconstructionResult {
    success: boolean;
    outputDirectory?: string;
    filesProcessed: number;
    files: string[];
    errors: Array<{ file: string; error: string }>;
    reconstructedAt?: string;
    skippedFiles?: number;
    error?: string;
}

/**
 * Represents a file with its complete timeline history.
 */
export class TimelineFile {
    /**
     * The original file path as stored in VS Code (file:// URI).
     */
    public readonly originalPath: string;

    /**
     * Path to the timeline directory containing versions.
     */
    public readonly timelineDir: string;

    /**
     * List of FileEntry objects representing versions.
     */
    public readonly entries: FileEntry[];

    constructor(originalPath: string, timelineDir: string, entries: FileEntry[] = []) {
        this.originalPath = originalPath;
        this.timelineDir = timelineDir;
        this.entries = entries;
    }

    /**
     * Get the most recent entry based on timestamp.
     */
    get latestEntry(): FileEntry | undefined {
        if (this.entries.length === 0) {
            return undefined;
        }
        return this.entries.reduce((latest, entry) => 
            entry.timestamp > latest.timestamp ? entry : latest
        );
    }

    /**
     * Get the oldest entry based on timestamp.
     */
    get oldestEntry(): FileEntry | undefined {
        if (this.entries.length === 0) {
            return undefined;
        }
        return this.entries.reduce((oldest, entry) => 
            entry.timestamp < oldest.timestamp ? entry : oldest
        );
    }

    /**
     * Get the file path from the original resource URI.
     * Parses the file:// URI and returns the decoded path.
     */
    get relativePath(): string {
        return decodeFileUri(this.originalPath);
    }

    /**
     * Get just the filename from the path.
     */
    get filename(): string {
        return path.basename(this.relativePath);
    }

    /**
     * Get the number of versions available.
     */
    get versionCount(): number {
        return this.entries.length;
    }

    /**
     * Get entries sorted by timestamp (newest first).
     */
    get sortedEntries(): FileEntry[] {
        return [...this.entries].sort((a, b) => b.timestamp - a.timestamp);
    }

    /**
     * Get the entry that was current at the specified timestamp.
     * Returns the most recent entry that is not newer than the target timestamp.
     * 
     * @param targetTimestamp - Unix timestamp in milliseconds.
     * @returns The entry that was current at that time, or undefined.
     */
    getEntryAtTimestamp(targetTimestamp: number): FileEntry | undefined {
        const validEntries = this.entries.filter(e => e.timestamp <= targetTimestamp);
        if (validEntries.length === 0) {
            return undefined;
        }
        return validEntries.reduce((latest, entry) => 
            entry.timestamp > latest.timestamp ? entry : latest
        );
    }

    /**
     * Get the full path to a specific entry's content file.
     * 
     * @param entry - The FileEntry to get the path for.
     * @returns Full path to the content file.
     */
    getFileContentPath(entry: FileEntry): string {
        return path.join(this.timelineDir, entry.id);
    }

    /**
     * Check if an entry's content file exists.
     * 
     * @param entry - The FileEntry to check.
     * @returns True if the content file exists.
     */
    entryFileExists(entry: FileEntry): boolean {
        return fs.existsSync(this.getFileContentPath(entry));
    }

    /**
     * Read the content of a specific entry.
     * 
     * @param entry - The FileEntry to read.
     * @returns File content as string, or undefined if not found.
     */
    readEntryContent(entry: FileEntry): string | undefined {
        const filePath = this.getFileContentPath(entry);
        if (!fs.existsSync(filePath)) {
            return undefined;
        }
        return fs.readFileSync(filePath, 'utf-8');
    }

    /**
     * Convert entry to metadata dictionary for JSON export.
     * 
     * @param entry - The FileEntry to convert.
     * @returns Metadata object.
     */
    toMetadataDict(entry: FileEntry): FileMetadata {
        const contentPath = this.getFileContentPath(entry);
        return {
            originalPath: this.relativePath,
            relativePath: this.relativePath,
            entryId: entry.id,
            timestamp: entry.timestamp,
            datetime: formatTimestamp(entry.timestamp),
            source: entry.source,
            sourceDescription: entry.sourceDescription,
            hash: computeFileHash(contentPath),
        };
    }

    /**
     * Convert to a plain object for JSON serialization.
     */
    toJSON(): object {
        return {
            originalPath: this.originalPath,
            relativePath: this.relativePath,
            filename: this.filename,
            versionCount: this.versionCount,
            latestTimestamp: this.latestEntry?.timestamp,
            oldestTimestamp: this.oldestEntry?.timestamp,
            entries: this.entries.map(e => ({
                id: e.id,
                timestamp: e.timestamp,
                datetime: formatTimestamp(e.timestamp),
                source: e.source,
                sourceDescription: e.sourceDescription,
            })),
        };
    }
}
