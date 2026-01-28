# VS Code Timeline Extractor Extension

A Visual Studio Code extension that extracts file data from VS Code's Timeline / local history and allows you to reconstruct directory versions.

## Features

- **Browse Timeline Files**: View all files tracked in VS Code's timeline with version counts
- **Directory Filtering**: Filter timeline view by specific directories
- **Reconstruct Directories**: Export the latest version of all files from a directory
- **Time Travel**: Reconstruct directories as they were at a specific point in time
- **Version History**: View all available versions of any file
- **Compare Versions**: Diff any version against the current file
- **Restore Versions**: Restore any historical version of a file
- **Export Versions**: Export any historical version of a file to a new location

## Installation

### From Source

1. Clone the repository
2. Navigate to the `vscode-extension` directory
3. Install dependencies:
   ```bash
   npm install
   ```
4. Compile the extension:
   ```bash
   npm run compile
   ```
5. Press F5 to launch the Extension Development Host

### Package for Distribution

```bash
npm run package
```

This creates a `.vsix` file that can be installed in VS Code.

## Usage

### Activity Bar

The extension adds a "Timeline Extractor" icon to the Activity Bar with two views:

1. **Timeline Files**: Browse all files in the timeline, organized by directory
2. **File Versions**: View all versions of a selected file

### Commands

Access commands via the Command Palette (Cmd/Ctrl + Shift + P):

- **Timeline Extractor: Show Info** - Display timeline statistics
- **Timeline Extractor: List All Files** - Browse all files in timeline
- **Timeline Extractor: List Files in Directory** - Filter by directory
- **Timeline Extractor: Reconstruct Directory** - Reconstruct with latest versions
- **Timeline Extractor: Reconstruct Directory at Time** - Time travel reconstruction
- **Timeline Extractor: Show File Versions** - View versions of current file
- **Timeline Extractor: Export File Version** - Export a specific version
- **Timeline Extractor: Refresh** - Refresh timeline data

### Context Menu

Right-click on files and folders in the Explorer for quick access to:

- **Reconstruct Directory** (folders)
- **Show File Versions** (files)

### Version Actions

In the File Versions view, each version has actions:

- **Open Version** - Open the version in the editor
- **Compare with Current** - Diff with the current file
- **Restore Version** - Overwrite current file with this version

## Configuration

Configure the extension in VS Code settings:

- `timelineExtractor.customTimelinePath`: Custom path to VS Code's timeline directory (leave empty for auto-detection)
- `timelineExtractor.exportMetadata`: Export metadata JSON file when reconstructing directories (default: true)
- `timelineExtractor.defaultOutputDirectory`: Default output directory for reconstructed files

## Default Timeline Paths

The extension auto-detects VS Code's timeline directory:

- **macOS**: `~/Library/Application Support/Code/User/History`
- **Linux**: `~/.config/Code/User/History`
- **Windows**: `%APPDATA%/Code/User/History`

Also supports VS Code Insiders and VSCodium.

## Development

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts       # Main entry point
│   ├── extractor.ts       # Core extraction logic
│   ├── models.ts          # Data models
│   ├── constants.ts       # Configuration constants
│   ├── utils.ts           # Utility functions
│   ├── commands.ts        # Command handlers
│   └── treeViews/
│       ├── filesTreeProvider.ts    # Timeline files tree
│       └── versionsTreeProvider.ts # File versions tree
├── package.json           # Extension manifest
├── tsconfig.json          # TypeScript configuration
└── .eslintrc.json         # ESLint configuration
```

### Scripts

- `npm run compile` - Compile TypeScript
- `npm run watch` - Watch mode compilation
- `npm run lint` - Run ESLint
- `npm run package` - Create VSIX package

## License

MIT
