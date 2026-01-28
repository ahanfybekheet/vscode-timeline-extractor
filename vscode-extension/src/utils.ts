/**
 * Utility functions for VS Code Timeline Extractor.
 * 
 * Contains helper functions for timestamp parsing, file hashing,
 * and other common operations.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * Compute hash of a file's contents.
 * 
 * @param filePath - Path to the file to hash.
 * @param algorithm - Hash algorithm to use (default: sha256).
 * @returns Hash as hex string, or undefined if file doesn't exist.
 */
export function computeFileHash(filePath: string, algorithm: string = 'sha256'): string | undefined {
    if (!fs.existsSync(filePath)) {
        return undefined;
    }

    const hash = crypto.createHash(algorithm);
    const content = fs.readFileSync(filePath);
    hash.update(content);
    return hash.digest('hex');
}

/**
 * Parse a timestamp string into Unix timestamp in milliseconds.
 * 
 * Accepts multiple formats:
 * - ISO format: 2025-06-27T14:30:00
 * - ISO with microseconds: 2025-06-27T14:30:00.123456
 * - Date and time with space: 2025-06-27 14:30:00
 * - Date only: 2025-06-27 (uses midnight)
 * - Unix timestamp in milliseconds: 1751055000000
 * - Unix timestamp in seconds: 1751055000
 * 
 * @param timestampStr - The timestamp string to parse.
 * @returns Unix timestamp in milliseconds.
 * @throws Error if the timestamp format is not recognized.
 */
export function parseTimestamp(timestampStr: string): number {
    // Try parsing as integer (Unix timestamp)
    const numericValue = parseInt(timestampStr, 10);
    if (!isNaN(numericValue) && timestampStr.match(/^\d+$/)) {
        // If it's less than year 2100 in seconds, assume it's in seconds
        if (numericValue < 4102444800) {
            return numericValue * 1000;
        }
        return numericValue;
    }

    // Try parsing as ISO format datetime
    const date = new Date(timestampStr);
    if (!isNaN(date.getTime())) {
        return date.getTime();
    }

    // Try parsing date-only format
    const dateOnlyMatch = timestampStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (dateOnlyMatch) {
        const [, year, month, day] = dateOnlyMatch;
        const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
        return dateObj.getTime();
    }

    throw new Error(
        `Unable to parse timestamp: ${timestampStr}. ` +
        `Expected ISO format (2025-06-27T14:30:00), date (2025-06-27), ` +
        `or Unix timestamp.`
    );
}

/**
 * Format a Unix timestamp (ms) as ISO datetime string.
 * 
 * @param timestampMs - Unix timestamp in milliseconds.
 * @returns ISO format datetime string.
 */
export function formatTimestamp(timestampMs: number): string {
    return new Date(timestampMs).toISOString();
}

/**
 * Format a Unix timestamp (ms) as a human-readable string.
 * 
 * @param timestampMs - Unix timestamp in milliseconds.
 * @returns Human-readable datetime string.
 */
export function formatTimestampReadable(timestampMs: number): string {
    const date = new Date(timestampMs);
    return date.toLocaleString();
}

/**
 * Expand user home directory in path.
 * 
 * @param filePath - Path that may contain ~ for home directory.
 * @returns Expanded path.
 */
export function expandUserPath(filePath: string): string {
    if (filePath.startsWith('~')) {
        return path.join(os.homedir(), filePath.slice(1));
    }
    return filePath;
}

/**
 * Expand environment variables in path.
 * 
 * @param filePath - Path that may contain environment variables.
 * @returns Expanded path.
 */
export function expandEnvVars(filePath: string): string {
    return filePath.replace(/%([^%]+)%/g, (_, key) => process.env[key] || '');
}

/**
 * Get relative time description (e.g., "2 hours ago").
 * 
 * @param timestampMs - Unix timestamp in milliseconds.
 * @returns Relative time description.
 */
export function getRelativeTime(timestampMs: number): string {
    const now = Date.now();
    const diff = now - timestampMs;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    const weeks = Math.floor(days / 7);
    const months = Math.floor(days / 30);
    const years = Math.floor(days / 365);

    if (years > 0) {
        return `${years} year${years > 1 ? 's' : ''} ago`;
    }
    if (months > 0) {
        return `${months} month${months > 1 ? 's' : ''} ago`;
    }
    if (weeks > 0) {
        return `${weeks} week${weeks > 1 ? 's' : ''} ago`;
    }
    if (days > 0) {
        return `${days} day${days > 1 ? 's' : ''} ago`;
    }
    if (hours > 0) {
        return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    }
    if (minutes > 0) {
        return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    }
    return 'Just now';
}

/**
 * Decode a file:// URI to a file path.
 * 
 * @param uri - The file:// URI.
 * @returns Decoded file path.
 */
export function decodeFileUri(uri: string): string {
    try {
        const url = new URL(uri);
        return decodeURIComponent(url.pathname);
    } catch {
        // If it's not a valid URL, return as-is
        return uri;
    }
}

/**
 * Ensure a directory exists, creating it if necessary.
 * 
 * @param dirPath - Path to the directory.
 */
export function ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * Copy a file to a destination, creating parent directories if needed.
 * 
 * @param source - Source file path.
 * @param destination - Destination file path.
 */
export function copyFile(source: string, destination: string): void {
    const destDir = path.dirname(destination);
    ensureDirectoryExists(destDir);
    fs.copyFileSync(source, destination);
}

/**
 * Get file size in human-readable format.
 * 
 * @param filePath - Path to the file.
 * @returns Human-readable file size.
 */
export function getFileSizeReadable(filePath: string): string {
    try {
        const stats = fs.statSync(filePath);
        const bytes = stats.size;
        
        if (bytes < 1024) {
            return `${bytes} B`;
        }
        if (bytes < 1024 * 1024) {
            return `${(bytes / 1024).toFixed(1)} KB`;
        }
        if (bytes < 1024 * 1024 * 1024) {
            return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
        }
        return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    } catch {
        return 'Unknown';
    }
}
