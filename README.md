# VS Code Timeline Extractor

A Python CLI tool that extracts file data from VS Code's Timeline / local history and reconstructs directory versions.

## Features

- **Auto-detect Timeline Path**: Automatically finds VS Code's timeline directory on macOS, Linux, and Windows
- **List Files**: Browse all files in the timeline with version counts and timestamps
- **Filter by Directory**: Extract only files from a specific project directory
- **Reconstruct Directories**: Export the latest version of all files from a directory
- **Time Travel**: Reconstruct directories as they were at a specific point in time
- **Version History**: View all available versions of any file
- **Export Specific Versions**: Export any historical version of a file
- **Metadata Export**: Generate JSON metadata including timestamps, sources, and file hashes

## Requirements

- Python 3.9+
- No external dependencies (uses only Python standard library)

## Installation

### From Source

```bash
# Clone the repository
git clone git@github.com:ahanfybekheet/vscode-timeline-extractor.git
cd vscode-timeline-extractor

# Install in development mode
pip install -e .

# Or install directly
pip install .
```

### Direct Usage (No Installation)

```bash
# Run as a module
python -m vscode_timeline_extractor --help
```

## Project Structure

```
vscode_timeline_extractor/
├── __init__.py      # Package exports
├── __main__.py      # Module entry point
├── cli.py           # Command-line interface
├── constants.py     # Configuration constants
├── extractor.py     # Core extraction logic
├── models.py        # Data models (FileEntry, TimelineFile)
└── utils.py         # Utility functions
```

## Usage

### Basic Commands

```bash
# Show help
python -m vscode_timeline_extractor --help

# Show timeline info and statistics
python -m vscode_timeline_extractor info

# List all files in timeline
python -m vscode_timeline_extractor list

# List files from a specific directory
python -m vscode_timeline_extractor list --directory /path/to/project

# Reconstruct a directory with latest file versions
python -m vscode_timeline_extractor reconstruct /path/to/source --output ./recovered

# Reconstruct directory as it was on a specific date
python -m vscode_timeline_extractor reconstruct /path/to/source --output ./snapshot --at 2025-06-27

# View all versions of a specific file
python -m vscode_timeline_extractor versions /path/to/file.py

# Export a specific version of a file
python -m vscode_timeline_extractor export /path/to/file.py --output ./file.py --version 1
```

### Using the Installed Command

After installation with `pip install .`:

```bash
vscode-timeline-extractor info
vscode-timeline-extractor list --directory /path/to/project
vscode-timeline-extractor reconstruct /path/to/source --output ./recovered
```

### Specifying a Custom Timeline Path

If your VS Code timeline is in a non-standard location:

```bash
python -m vscode_timeline_extractor -t /path/to/History info
```

### Default Timeline Paths

The tool automatically searches for VS Code's timeline directory at:

| Platform | Default Paths |
|----------|--------------|
| macOS | `~/Library/Application Support/Code/User/History` |
| | `~/Library/Application Support/Code - Insiders/User/History` |
| | `~/Library/Application Support/VSCodium/User/History` |
| Linux | `~/.config/Code/User/History` |
| | `~/.config/Code - Insiders/User/History` |
| | `~/.config/VSCodium/User/History` |
| Windows | `%APPDATA%/Code/User/History` |
| | `%APPDATA%/Code - Insiders/User/History` |
| | `%APPDATA%/VSCodium/User/History` |

## Commands Reference

### `info`

Display timeline information and statistics.

```bash
python -m vscode_timeline_extractor info
```

Output includes:
- Timeline path
- Total files tracked
- Total versions stored
- Average versions per file
- Files with most versions
- Most recently modified files

### `list`

List files in the timeline.

```bash
vscode-timeline-extractor list [options]
```

Options:
- `-d, --directory PATH`: Filter files by directory
- `-l, --limit N`: Limit number of results
- `-j, --json`: Output as JSON

### `reconstruct`

Reconstruct a directory using versions from timeline.

```bash
vscode-timeline-extractor reconstruct SOURCE -o OUTPUT [options]
```

Arguments:
- `SOURCE`: Source directory path to reconstruct

Options:
- `-o, --output PATH`: Output directory (required)
- `--no-metadata`: Skip JSON metadata export
- `--at TIMESTAMP`: Reconstruct directory as it was at a specific point in time

#### Timestamp Formats

The `--at` option accepts multiple formats:
- ISO datetime: `2025-06-27T14:30:00`
- Date only: `2025-06-27` (uses midnight)
- Unix timestamp (ms): `1751055000000`
- Unix timestamp (seconds): `1751055000`

The command creates:
- All files with their versions at the specified time (or latest if not specified)
- `timeline_metadata.json` with detailed information about each file

### `versions`

Show all versions of a specific file.

```bash
vscode-timeline-extractor versions FILE [options]
```

Arguments:
- `FILE`: File path to look up

Options:
- `-j, --json`: Output as JSON

### `export`

Export a specific version of a file.

```bash
vscode-timeline-extractor export FILE -o OUTPUT [options]
```

Arguments:
- `FILE`: File path to export

Options:
- `-o, --output PATH`: Output file path (required)
- `--version N`: Version index (0 = latest, default: 0)

## Metadata JSON Format

When reconstructing a directory, a `timeline_metadata.json` file is created with the following structure:

```json
{
  "source_directory": "/path/to/original/directory",
  "extraction_time": "2026-01-27T21:35:44.692873",
  "reconstructed_at_timestamp": 1751055000000,
  "reconstructed_at_datetime": "2025-06-27T14:30:00",
  "total_files": 93,
  "files": [
    {
      "original_path": "file:///path/to/file.py",
      "relative_path": "/path/to/file.py",
      "source": "timeline",
      "timestamp": 1750996149879,
      "datetime": "2025-06-27T06:49:09.879000",
      "file_hash": "sha256_hash_here",
      "entry_source": "Chat Edit: 'description'",
      "total_versions": 3
    }
  ]
}
```

## Understanding VS Code Timeline

VS Code's Timeline feature stores local history of files in a directory structure:

```
History/
├── -hash1/
│   ├── entries.json     # Metadata with original path and versions
│   ├── ABC.py           # Version 1 of the file
│   └── DEF.py           # Version 2 of the file
├── -hash2/
│   ├── entries.json
│   └── XYZ.js
...
```

Each `entries.json` contains:
- `resource`: The original file path (as a file:// URI)
- `entries`: Array of versions with:
  - `id`: Filename in the timeline directory
  - `timestamp`: Unix timestamp in milliseconds
  - `source`: What triggered the save (e.g., "undoRedo.source", "Chat Edit: '...'")

## Examples

### Recover a Deleted Project

```bash
# Find what's available for your project
vscode-timeline-extractor list -d /path/to/deleted/project

# Reconstruct it with latest versions
vscode-timeline-extractor reconstruct /path/to/deleted/project -o ./recovered_project
```

### Reconstruct Directory at a Specific Point in Time

```bash
# Reconstruct as it was on a specific date
vscode-timeline-extractor reconstruct /path/to/project -o ./project_june27 --at "2025-06-27"

# Reconstruct at a specific datetime
vscode-timeline-extractor reconstruct /path/to/project -o ./project_snapshot --at "2025-06-27T14:30:00"

# Use Unix timestamp
vscode-timeline-extractor reconstruct /path/to/project -o ./project_ts --at 1751055000000
```

### Find Recent Changes

```bash
# List most recently modified files
vscode-timeline-extractor list -l 20

# Get versions of a specific file
vscode-timeline-extractor versions /path/to/file.py
```

### Restore Previous Version

```bash
# View available versions
vscode-timeline-extractor versions /path/to/file.py

# Export version index 2 (third from latest)
vscode-timeline-extractor export /path/to/file.py -o ./file_old.py --version 2
```

### Export as JSON for Analysis

```bash
# List all files as JSON
vscode-timeline-extractor list -j > timeline_files.json

# Get file versions as JSON
vscode-timeline-extractor versions /path/to/file.py -j > file_versions.json
```

## Programmatic Usage

You can also use the package as a library:

```python
from vscode_timeline_extractor import VSCodeTimelineExtractor

# Initialize with auto-detected path
extractor = VSCodeTimelineExtractor()

# Or specify a custom path
extractor = VSCodeTimelineExtractor(timeline_path="/path/to/History")

# Scan the timeline
extractor.scan_timeline()

# List files from a directory
files = extractor.list_files(directory_filter="/path/to/project")

# Get versions of a specific file
versions = extractor.get_file_versions("/path/to/file.py")

# Reconstruct a directory
result = extractor.reconstruct_directory(
    source_directory="/path/to/project",
    output_directory="./recovered",
    at_timestamp=1751055000000  # Optional: reconstruct at specific time
)
```

## Limitations

- Only recovers files that were open in VS Code and saved while Timeline was enabled
- Timeline retention is limited by VS Code's settings
- Binary files may be stored but might have encoding issues
- Does not recover files that were never opened in VS Code

## License

MIT License
