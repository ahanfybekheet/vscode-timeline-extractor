/**
 * Constants for VS Code Timeline Extractor Extension.
 * 
 * Contains configuration constants including default paths
 * for different operating systems.
 */

/**
 * Default VS Code timeline paths by operating system.
 */
export const DEFAULT_TIMELINE_PATHS: Record<string, string[]> = {
    darwin: [
        '~/Library/Application Support/Code/User/History',
        '~/Library/Application Support/Code - Insiders/User/History',
        '~/Library/Application Support/VSCodium/User/History',
    ],
    linux: [
        '~/.config/Code/User/History',
        '~/.config/Code - Insiders/User/History',
        '~/.config/VSCodium/User/History',
    ],
    win32: [
        '%APPDATA%/Code/User/History',
        '%APPDATA%/Code - Insiders/User/History',
        '%APPDATA%/VSCodium/User/History',
    ],
};

/**
 * Metadata filename for reconstructed directories.
 */
export const METADATA_FILENAME = 'timeline_metadata.json';

/**
 * JSON entries filename in each timeline folder.
 */
export const ENTRIES_FILENAME = 'entries.json';

/**
 * Version for metadata export.
 */
export const METADATA_VERSION = 1;
