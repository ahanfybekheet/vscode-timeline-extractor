"""
Command-line interface for VS Code Timeline Extractor.

This module contains the argument parser and command handlers
for the CLI application.
"""

import argparse
import json
import sys
from pathlib import Path
from typing import Optional

from .extractor import VSCodeTimelineExtractor
from .utils import parse_timestamp


def create_parser() -> argparse.ArgumentParser:
    """Create and configure the argument parser."""
    parser = argparse.ArgumentParser(
        prog="vscode-timeline-extractor",
        description="Extract and reconstruct files from VS Code's Timeline / local history",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # List all files in the timeline
  %(prog)s list

  # List files from a specific directory
  %(prog)s list --directory /path/to/project

  # Reconstruct a directory with latest versions
  %(prog)s reconstruct /path/to/source --output ./recovered

  # Reconstruct directory as it was on a specific date
  %(prog)s reconstruct /path/to/source --output ./recovered --at 2025-06-27

  # Get versions of a specific file
  %(prog)s versions /path/to/file.py

  # Export a specific version of a file
  %(prog)s export /path/to/file.py --output ./file.py --version 1

Default timeline paths:
  macOS:   ~/Library/Application Support/Code/User/History
  Linux:   ~/.config/Code/User/History
  Windows: %%APPDATA%%/Code/User/History
""",
    )
    
    # Global arguments
    parser.add_argument(
        "-t", "--timeline-path",
        help="Path to VS Code timeline directory (default: auto-detect)",
        default=None,
    )
    parser.add_argument(
        "-v", "--verbose",
        action="store_true",
        help="Enable verbose output",
    )
    
    # Subcommands
    subparsers = parser.add_subparsers(dest="command", help="Available commands")
    
    _add_list_parser(subparsers)
    _add_reconstruct_parser(subparsers)
    _add_versions_parser(subparsers)
    _add_export_parser(subparsers)
    _add_info_parser(subparsers)
    
    return parser


def _add_list_parser(subparsers) -> None:
    """Add the 'list' subcommand parser."""
    parser = subparsers.add_parser(
        "list",
        help="List files in the timeline",
    )
    parser.add_argument(
        "-d", "--directory",
        help="Filter by directory path",
        default=None,
    )
    parser.add_argument(
        "-l", "--limit",
        type=int,
        help="Maximum number of files to list",
        default=None,
    )
    parser.add_argument(
        "-j", "--json",
        action="store_true",
        help="Output as JSON",
    )


def _add_reconstruct_parser(subparsers) -> None:
    """Add the 'reconstruct' subcommand parser."""
    parser = subparsers.add_parser(
        "reconstruct",
        help="Reconstruct a directory with file versions from timeline",
    )
    parser.add_argument(
        "source",
        help="Source directory path to reconstruct",
    )
    parser.add_argument(
        "-o", "--output",
        required=False,
        default=None,
        help="Output directory path (default: output/{source_dirname})",
    )
    parser.add_argument(
        "--no-metadata",
        action="store_true",
        help="Skip metadata JSON export",
    )
    parser.add_argument(
        "--at",
        type=str,
        default=None,
        help=(
            "Reconstruct directory as it was at this timestamp. "
            "Accepts: ISO format (2025-06-27T14:30:00), "
            "date (2025-06-27), or Unix timestamp in ms"
        ),
    )


def _add_versions_parser(subparsers) -> None:
    """Add the 'versions' subcommand parser."""
    parser = subparsers.add_parser(
        "versions",
        help="Show all versions of a specific file",
    )
    parser.add_argument(
        "file",
        help="File path to look up",
    )
    parser.add_argument(
        "-j", "--json",
        action="store_true",
        help="Output as JSON",
    )


def _add_export_parser(subparsers) -> None:
    """Add the 'export' subcommand parser."""
    parser = subparsers.add_parser(
        "export",
        help="Export a specific version of a file",
    )
    parser.add_argument(
        "file",
        help="File path to export",
    )
    parser.add_argument(
        "-o", "--output",
        required=True,
        help="Output file path",
    )
    parser.add_argument(
        "--version",
        type=int,
        default=0,
        help="Version index to export (0 = latest, default: 0)",
    )


def _add_info_parser(subparsers) -> None:
    """Add the 'info' subcommand parser."""
    subparsers.add_parser(
        "info",
        help="Show timeline information and statistics",
    )


# Command handlers

def cmd_list(extractor: VSCodeTimelineExtractor, args) -> int:
    """Handle the 'list' command."""
    files = extractor.list_files(
        directory_filter=args.directory,
        limit=args.limit,
    )
    
    if args.json:
        print(json.dumps(files, indent=2))
        return 0
    
    if not files:
        print("No files found in timeline.")
        return 0
    
    print(f"Found {len(files)} files:\n")
    for f in files:
        dt = f.get("latest_datetime", "Unknown")
        versions = f.get("versions", 0)
        source = f.get("latest_source", "")
        source_str = f" ({source})" if source else ""
        print(f"  [{versions:3d} versions] {dt} - {f['path']}{source_str}")
    
    return 0


def cmd_reconstruct(extractor: VSCodeTimelineExtractor, args) -> int:
    """Handle the 'reconstruct' command."""
    # Parse timestamp if provided
    at_timestamp: Optional[int] = None
    if args.at:
        try:
            at_timestamp = parse_timestamp(args.at)
        except ValueError as e:
            print(f"✗ Error: {e}")
            return 1
    
    # Generate default output path if not provided
    output_dir = args.output
    if output_dir is None:
        source_basename = Path(args.source).name
        output_dir = str(Path("output") / source_basename)
    
    result = extractor.reconstruct_directory(
        source_directory=args.source,
        output_directory=output_dir,
        export_metadata=not args.no_metadata,
        at_timestamp=at_timestamp,
    )
    
    if not result["success"]:
        print(f"✗ Failed to reconstruct directory: {result.get('error', 'Unknown error')}")
        return 1
    
    print("✓ Successfully reconstructed directory")
    
    if at_timestamp:
        print(f"  Reconstructed at: {result.get('reconstructed_at', 'N/A')}")
    
    print(f"  Output: {result['output_directory']}")
    print(f"  Files processed: {result['files_processed']}")
    
    if at_timestamp and result.get("skipped_files", 0) > 0:
        print(f"  Files skipped (didn't exist at that time): {result['skipped_files']}")
    
    if result.get("errors"):
        print(f"\n⚠ Warnings ({len(result['errors'])}):")
        for err in result["errors"]:
            print(f"    - {err['file']}: {err['error']}")
    
    if not args.no_metadata:
        print(f"\n  Metadata exported to: {result['output_directory']}/timeline_metadata.json")
    
    return 0


def cmd_versions(extractor: VSCodeTimelineExtractor, args) -> int:
    """Handle the 'versions' command."""
    result = extractor.get_file_versions(args.file)
    
    if not result:
        print(f"File not found in timeline: {args.file}")
        return 1
    
    if args.json:
        print(json.dumps(result, indent=2))
        return 0
    
    print(f"File: {result['original_path']}")
    print(f"Timeline directory: {result['timeline_dir']}")
    print(f"\nVersions ({len(result['versions'])}):\n")
    
    for i, v in enumerate(result["versions"]):
        source = v.get("source", "")
        source_str = f" - {source}" if source else ""
        source_desc = v.get("source_description", "")
        if source_desc:
            source_str += f" ({source_desc})"
        
        print(f"  [{i}] {v['datetime']} (ID: {v['id']}){source_str}")
    
    return 0


def cmd_export(extractor: VSCodeTimelineExtractor, args) -> int:
    """Handle the 'export' command."""
    result = extractor.export_file_version(
        file_path=args.file,
        output_path=args.output,
        version_index=args.version,
    )
    
    if not result["success"]:
        print(f"✗ Export failed: {result['error']}")
        return 1
    
    print(f"✓ Exported file to: {result['output_path']}")
    print(f"  Version: {result['version']['datetime']}")
    print(f"  Hash: {result['file_hash']}")
    return 0


def cmd_info(extractor: VSCodeTimelineExtractor, args) -> int:
    """Handle the 'info' command."""
    stats = extractor.get_statistics()
    
    print("VS Code Timeline Information")
    print("=" * 28)
    print(f"Timeline path: {stats.get('timeline_path', extractor.timeline_path)}")
    print(f"Total files: {stats['total_files']}")
    
    if stats["total_files"] == 0:
        return 0
    
    print(f"Total versions: {stats['total_versions']}")
    print(f"Average versions per file: {stats['average_versions']:.1f}")
    
    # Get files with most versions
    files_by_versions = sorted(
        extractor.timeline_files.items(),
        key=lambda x: len(x[1].entries),
        reverse=True,
    )[:5]
    
    # Get most recent files
    files_by_date = sorted(
        extractor.timeline_files.items(),
        key=lambda x: x[1].latest_entry.timestamp if x[1].latest_entry else 0,
        reverse=True,
    )[:5]
    
    print("\nFiles with most versions:")
    for path, tf in files_by_versions:
        print(f"  [{len(tf.entries):3d}] {path}")
    
    print("\nMost recently modified:")
    for path, tf in files_by_date:
        if tf.latest_entry:
            print(f"  {tf.latest_entry.datetime} - {path}")
    
    return 0


def main() -> int:
    """Main entry point for the CLI."""
    parser = create_parser()
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return 1
    
    try:
        extractor = VSCodeTimelineExtractor(
            timeline_path=args.timeline_path,
            verbose=args.verbose,
        )
    except FileNotFoundError as e:
        print(f"Error: {e}")
        return 1
    
    # Command dispatch
    commands = {
        "list": cmd_list,
        "reconstruct": cmd_reconstruct,
        "versions": cmd_versions,
        "export": cmd_export,
        "info": cmd_info,
    }
    
    handler = commands.get(args.command)
    if handler:
        return handler(extractor, args)
    
    parser.print_help()
    return 1


if __name__ == "__main__":
    sys.exit(main())
