/**
 * Core extractor functionality for VS Code Timeline.
 * 
 * Contains the main VSCodeTimelineExtractor class that handles
 * scanning, filtering, and reconstructing timeline data.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';

import { DEFAULT_TIMELINE_PATHS, ENTRIES_FILENAME, METADATA_FILENAME, METADATA_VERSION } from './constants';
import { TimelineFile, FileEntry, ReconstructionResult, FileMetadata } from './models';
import { expandUserPath, expandEnvVars, copyFile, ensureDirectoryExists, formatTimestamp } from './utils';

/**
 * Main class for extracting and reconstructing VS Code timeline data.
 * 
 * This class provides methods to:
 * - Scan VS Code's timeline directory
 * - Filter files by directory path
 * - Reconstruct directories with specific versions
 * - Export individual file versions
 */
export class VSCodeTimelineExtractor {
    private timelinePath: string;
    private timelineFiles: Map<string, TimelineFile> = new Map();
    private scanned: boolean = false;
    private outputChannel: vscode.OutputChannel;

    constructor(timelinePath?: string, outputChannel?: vscode.OutputChannel) {
        this.outputChannel = outputChannel || vscode.window.createOutputChannel('Timeline Extractor');
        this.timelinePath = this.resolveTimelinePath(timelinePath);
    }

    /**
     * Log a message to the output channel.
     */
    private log(message: string): void {
        this.outputChannel.appendLine(`[${new Date().toISOString()}] ${message}`);
    }

    /**
     * Resolve the timeline path, using defaults if not provided.
     */
    private resolveTimelinePath(customPath?: string): string {
        // Check configuration for custom path
        const config = vscode.workspace.getConfiguration('timelineExtractor');
        const configPath = config.get<string>('customTimelinePath');
        
        const pathToCheck = customPath || configPath;

        if (pathToCheck) {
            const expanded = expandUserPath(expandEnvVars(pathToCheck));
            if (fs.existsSync(expanded)) {
                this.log(`Using custom timeline path: ${expanded}`);
                return expanded;
            }
            throw new Error(`Timeline directory not found: ${expanded}`);
        }

        // Auto-detect based on OS
        const platform = os.platform();
        const osKey = platform === 'darwin' ? 'darwin' : 
                      platform === 'linux' ? 'linux' : 
                      platform === 'win32' ? 'win32' : null;

        if (!osKey) {
            throw new Error(`Unsupported operating system: ${platform}`);
        }

        // Try each default path
        for (const defaultPath of DEFAULT_TIMELINE_PATHS[osKey]) {
            const expanded = expandUserPath(expandEnvVars(defaultPath));
            if (fs.existsSync(expanded)) {
                this.log(`Using default timeline path: ${expanded}`);
                return expanded;
            }
        }

        throw new Error(
            `No VS Code timeline directory found. Tried: ${DEFAULT_TIMELINE_PATHS[osKey].join(', ')}`
        );
    }

    /**
     * Get the resolved timeline path.
     */
    getTimelinePath(): string {
        return this.timelinePath;
    }

    /**
     * Scan the timeline directory and load all file metadata.
     * 
     * @returns Number of files found in the timeline.
     */
    async scanTimeline(): Promise<number> {
        this.log(`Scanning timeline directory: ${this.timelinePath}`);

        this.timelineFiles.clear();

        const items = fs.readdirSync(this.timelinePath, { withFileTypes: true });

        for (const item of items) {
            if (!item.isDirectory()) {
                continue;
            }

            const timelineDir = path.join(this.timelinePath, item.name);
            const entriesFile = path.join(timelineDir, ENTRIES_FILENAME);

            if (!fs.existsSync(entriesFile)) {
                continue;
            }

            try {
                const timelineFile = this.parseEntriesFile(entriesFile, timelineDir);
                if (timelineFile) {
                    this.timelineFiles.set(timelineFile.relativePath, timelineFile);
                }
            } catch (e) {
                this.log(`Error parsing ${entriesFile}: ${e}`);
                continue;
            }
        }

        this.scanned = true;
        this.log(`Found ${this.timelineFiles.size} files in timeline`);
        return this.timelineFiles.size;
    }

    /**
     * Parse an entries.json file into a TimelineFile object.
     */
    private parseEntriesFile(entriesFile: string, timelineDir: string): TimelineFile | undefined {
        const content = fs.readFileSync(entriesFile, 'utf-8');
        const data = JSON.parse(content);

        const resource = data.resource as string;
        if (!resource) {
            return undefined;
        }

        const entriesData = (data.entries || []) as Array<{
            id?: string;
            timestamp?: number;
            source?: string;
            sourceDescription?: string;
        }>;

        const entries: FileEntry[] = entriesData.map(entry => ({
            id: entry.id || '',
            timestamp: entry.timestamp || 0,
            source: entry.source,
            sourceDescription: entry.sourceDescription,
        }));

        return new TimelineFile(resource, timelineDir, entries);
    }

    /**
     * Ensure the timeline has been scanned.
     */
    private async ensureScanned(): Promise<void> {
        if (!this.scanned) {
            await this.scanTimeline();
        }
    }

    /**
     * Get all timeline files.
     */
    async getAllFiles(): Promise<Map<string, TimelineFile>> {
        await this.ensureScanned();
        return this.timelineFiles;
    }

    /**
     * Filter timeline files by a specific directory path.
     * 
     * @param directoryPath - Absolute path to filter files by.
     * @returns Map of matching timeline files.
     */
    async filterByDirectory(directoryPath: string): Promise<Map<string, TimelineFile>> {
        await this.ensureScanned();

        // Normalize the directory path
        const normalizedDir = path.resolve(directoryPath);
        const dirWithSlash = normalizedDir.endsWith(path.sep) ? normalizedDir : normalizedDir + path.sep;

        const matching = new Map<string, TimelineFile>();

        for (const [filePath, timelineFile] of this.timelineFiles) {
            if (filePath.startsWith(dirWithSlash) || filePath.startsWith(normalizedDir)) {
                matching.set(filePath, timelineFile);
            }
        }

        this.log(`Found ${matching.size} files matching directory: ${directoryPath}`);
        return matching;
    }

    /**
     * Get a specific file's timeline data.
     * 
     * @param filePath - Path to the file.
     * @returns TimelineFile or undefined if not found.
     */
    async getFile(filePath: string): Promise<TimelineFile | undefined> {
        await this.ensureScanned();
        
        const normalizedPath = path.resolve(filePath);
        
        // Try exact match first
        if (this.timelineFiles.has(normalizedPath)) {
            return this.timelineFiles.get(normalizedPath);
        }

        // Try to find by partial path match
        for (const [storedPath, timelineFile] of this.timelineFiles) {
            if (storedPath.endsWith(normalizedPath) || normalizedPath.endsWith(storedPath)) {
                return timelineFile;
            }
        }

        return undefined;
    }

    /**
     * Reconstruct a directory using versions from timeline.
     * 
     * @param sourceDirectory - The original directory path to reconstruct.
     * @param outputDirectory - Where to export the reconstructed directory.
     * @param exportMetadata - Whether to export JSON metadata.
     * @param atTimestamp - Optional timestamp (ms) to reconstruct the directory as it was at that time.
     * @returns Reconstruction result.
     */
    async reconstructDirectory(
        sourceDirectory: string,
        outputDirectory: string,
        exportMetadata: boolean = true,
        atTimestamp?: number
    ): Promise<ReconstructionResult> {
        await this.ensureScanned();

        const matchingFiles = await this.filterByDirectory(sourceDirectory);

        if (matchingFiles.size === 0) {
            return {
                success: false,
                error: `No files found for directory: ${sourceDirectory}`,
                filesProcessed: 0,
                files: [],
                errors: [],
            };
        }

        ensureDirectoryExists(outputDirectory);

        const sourcePath = path.resolve(sourceDirectory);
        const processedFiles: string[] = [];
        const skippedFiles: string[] = [];
        const errors: Array<{ file: string; error: string }> = [];
        const metadataEntries: FileMetadata[] = [];

        for (const [filePath, timelineFile] of matchingFiles) {
            const result = this.processFileForReconstruction(
                filePath,
                timelineFile,
                sourcePath,
                outputDirectory,
                atTimestamp,
                exportMetadata
            );

            if (result.status === 'processed') {
                processedFiles.push(result.relativePath!);
                if (result.metadata) {
                    metadataEntries.push(result.metadata);
                }
            } else if (result.status === 'skipped') {
                skippedFiles.push(filePath);
            } else if (result.status === 'error') {
                errors.push(result.error!);
            }
        }

        // Export metadata if requested
        if (exportMetadata && metadataEntries.length > 0) {
            this.exportMetadata(outputDirectory, sourceDirectory, metadataEntries, atTimestamp);
        }

        const result: ReconstructionResult = {
            success: true,
            outputDirectory,
            filesProcessed: processedFiles.length,
            files: processedFiles,
            errors,
        };

        if (atTimestamp !== undefined) {
            result.reconstructedAt = formatTimestamp(atTimestamp);
            result.skippedFiles = skippedFiles.length;
        }

        return result;
    }

    /**
     * Process a single file for reconstruction.
     */
    private processFileForReconstruction(
        filePath: string,
        timelineFile: TimelineFile,
        sourcePath: string,
        outputPath: string,
        atTimestamp?: number,
        exportMetadata: boolean = true
    ): { 
        status: 'processed' | 'skipped' | 'error';
        relativePath?: string;
        metadata?: FileMetadata;
        error?: { file: string; error: string };
    } {
        try {
            // Get the appropriate entry
            let entry: FileEntry | undefined;
            if (atTimestamp !== undefined) {
                entry = timelineFile.getEntryAtTimestamp(atTimestamp);
                if (!entry) {
                    return { status: 'skipped' };
                }
            } else {
                entry = timelineFile.latestEntry;
                if (!entry) {
                    return { status: 'skipped' };
                }
            }

            // Calculate relative path
            const relativePath = this.calculateRelativePath(filePath, sourcePath);
            if (!relativePath) {
                return { status: 'skipped' };
            }

            // Create destination and copy
            const destPath = path.join(outputPath, relativePath);
            const sourceFile = timelineFile.getFileContentPath(entry);

            if (!fs.existsSync(sourceFile)) {
                return {
                    status: 'error',
                    error: { file: filePath, error: `Source file not found: ${sourceFile}` },
                };
            }

            copyFile(sourceFile, destPath);

            const result: { 
                status: 'processed';
                relativePath: string;
                metadata?: FileMetadata;
            } = {
                status: 'processed',
                relativePath,
            };

            if (exportMetadata) {
                const metadata = timelineFile.toMetadataDict(entry);
                metadata.relativePath = relativePath;
                result.metadata = metadata;
            }

            return result;

        } catch (e) {
            return {
                status: 'error',
                error: { file: filePath, error: String(e) },
            };
        }
    }

    /**
     * Calculate the relative path from source directory.
     */
    private calculateRelativePath(filePath: string, sourcePath: string): string | undefined {
        try {
            const relative = path.relative(sourcePath, filePath);
            if (relative.startsWith('..')) {
                return undefined;
            }
            return relative;
        } catch {
            // Try string matching if relative fails
            if (filePath.startsWith(sourcePath)) {
                return filePath.slice(sourcePath.length).replace(/^[/\\]/, '');
            }
            return undefined;
        }
    }

    /**
     * Export metadata JSON file.
     */
    private exportMetadata(
        outputPath: string,
        sourceDirectory: string,
        metadataEntries: FileMetadata[],
        atTimestamp?: number
    ): void {
        const metadataFile = path.join(outputPath, METADATA_FILENAME);
        const metadata: Record<string, unknown> = {
            version: METADATA_VERSION,
            sourceDirectory,
            extractionTime: new Date().toISOString(),
            totalFiles: metadataEntries.length,
            files: metadataEntries,
        };

        if (atTimestamp !== undefined) {
            metadata.reconstructedAt = formatTimestamp(atTimestamp);
        }

        fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2), 'utf-8');
        this.log(`Metadata exported to: ${metadataFile}`);
    }

    /**
     * Export a specific version of a file.
     * 
     * @param timelineFile - The timeline file to export from.
     * @param entry - The specific entry/version to export.
     * @param outputPath - Where to save the exported file.
     */
    exportVersion(timelineFile: TimelineFile, entry: FileEntry, outputPath: string): void {
        const sourceFile = timelineFile.getFileContentPath(entry);
        if (!fs.existsSync(sourceFile)) {
            throw new Error(`Source file not found: ${sourceFile}`);
        }
        copyFile(sourceFile, outputPath);
        this.log(`Exported version ${entry.id} to: ${outputPath}`);
    }

    /**
     * Get timeline statistics.
     */
    async getStatistics(): Promise<{
        timelinePath: string;
        totalFiles: number;
        totalVersions: number;
        oldestEntry: { path: string; timestamp: number } | null;
        newestEntry: { path: string; timestamp: number } | null;
    }> {
        await this.ensureScanned();

        let totalVersions = 0;
        let oldestEntry: { path: string; timestamp: number } | null = null;
        let newestEntry: { path: string; timestamp: number } | null = null;

        for (const [filePath, timelineFile] of this.timelineFiles) {
            totalVersions += timelineFile.versionCount;

            const oldest = timelineFile.oldestEntry;
            const newest = timelineFile.latestEntry;

            if (oldest && (!oldestEntry || oldest.timestamp < oldestEntry.timestamp)) {
                oldestEntry = { path: filePath, timestamp: oldest.timestamp };
            }

            if (newest && (!newestEntry || newest.timestamp > newestEntry.timestamp)) {
                newestEntry = { path: filePath, timestamp: newest.timestamp };
            }
        }

        return {
            timelinePath: this.timelinePath,
            totalFiles: this.timelineFiles.size,
            totalVersions,
            oldestEntry,
            newestEntry,
        };
    }

    /**
     * Search for files by name pattern.
     * 
     * @param pattern - Glob-like pattern or substring to search for.
     * @returns Matching timeline files.
     */
    async searchFiles(pattern: string): Promise<Map<string, TimelineFile>> {
        await this.ensureScanned();

        const lowerPattern = pattern.toLowerCase();
        const matching = new Map<string, TimelineFile>();

        for (const [filePath, timelineFile] of this.timelineFiles) {
            if (filePath.toLowerCase().includes(lowerPattern) || 
                timelineFile.filename.toLowerCase().includes(lowerPattern)) {
                matching.set(filePath, timelineFile);
            }
        }

        return matching;
    }

    /**
     * Force a rescan of the timeline.
     */
    async refresh(): Promise<number> {
        this.scanned = false;
        return this.scanTimeline();
    }
}
