"""
Core extractor functionality for VS Code Timeline.

This module contains the main VSCodeTimelineExtractor class
that handles scanning, filtering, and reconstructing timeline data.
"""

import json
import os
import platform
import shutil
from datetime import datetime
from pathlib import Path
from typing import Optional

from .constants import DEFAULT_TIMELINE_PATHS, ENTRIES_FILENAME, METADATA_FILENAME
from .models import FileEntry, TimelineFile


class VSCodeTimelineExtractor:
    """
    Main class for extracting and reconstructing VS Code timeline data.
    
    This class provides methods to:
    - Scan VS Code's timeline directory
    - Filter files by directory path
    - Reconstruct directories with specific versions
    - Export individual file versions
    
    Example:
        >>> extractor = VSCodeTimelineExtractor()
        >>> extractor.scan_timeline()
        1278
        >>> files = extractor.list_files(directory_filter="/path/to/project")
    """
    
    def __init__(
        self, 
        timeline_path: Optional[str] = None, 
        verbose: bool = False
    ):
        """
        Initialize the extractor.
        
        Args:
            timeline_path: Path to the VS Code timeline directory.
                          If None, uses the default path for the current OS.
            verbose: Enable verbose output for debugging.
            
        Raises:
            FileNotFoundError: If the timeline directory cannot be found.
            RuntimeError: If the operating system is not supported.
        """
        self.verbose = verbose
        self.timeline_path = self._resolve_timeline_path(timeline_path)
        self.timeline_files: dict[str, TimelineFile] = {}
        self._scanned = False
    
    def _log(self, message: str) -> None:
        """Log a message if verbose mode is enabled."""
        if self.verbose:
            print(f"[INFO] {message}")
    
    def _resolve_timeline_path(self, path: Optional[str]) -> Path:
        """
        Resolve the timeline path, using defaults if not provided.
        
        Args:
            path: User-provided path or None for auto-detection.
            
        Returns:
            Resolved Path object.
            
        Raises:
            FileNotFoundError: If the path doesn't exist.
            RuntimeError: If OS is not supported.
        """
        if path:
            resolved = Path(path).expanduser()
            if not resolved.exists():
                raise FileNotFoundError(
                    f"Timeline directory not found: {resolved}"
                )
            return resolved
        
        # Auto-detect based on OS
        system = platform.system().lower()
        os_key_map = {
            "darwin": "darwin",
            "linux": "linux",
            "windows": "win32",
        }
        
        os_key = os_key_map.get(system)
        if os_key is None:
            raise RuntimeError(f"Unsupported operating system: {system}")
        
        # Try each default path
        for default_path in DEFAULT_TIMELINE_PATHS[os_key]:
            expanded = Path(os.path.expandvars(default_path)).expanduser()
            if expanded.exists():
                self._log(f"Using default timeline path: {expanded}")
                return expanded
        
        raise FileNotFoundError(
            f"No VS Code timeline directory found. "
            f"Tried: {DEFAULT_TIMELINE_PATHS[os_key]}"
        )
    
    def scan_timeline(self) -> int:
        """
        Scan the timeline directory and load all file metadata.
        
        This method reads all entries.json files in the timeline directory
        and populates the timeline_files dictionary.
        
        Returns:
            Number of files found in the timeline.
        """
        self._log(f"Scanning timeline directory: {self.timeline_path}")
        
        self.timeline_files.clear()
        
        for item in self.timeline_path.iterdir():
            if not item.is_dir():
                continue
            
            entries_file = item / ENTRIES_FILENAME
            if not entries_file.exists():
                continue
            
            try:
                timeline_file = self._parse_entries_file(entries_file, item)
                if timeline_file:
                    self.timeline_files[timeline_file.relative_path] = timeline_file
                    
            except (json.JSONDecodeError, KeyError, OSError) as e:
                self._log(f"Error parsing {entries_file}: {e}")
                continue
        
        self._scanned = True
        self._log(f"Found {len(self.timeline_files)} files in timeline")
        return len(self.timeline_files)
    
    def _parse_entries_file(
        self, 
        entries_file: Path, 
        timeline_dir: Path
    ) -> Optional[TimelineFile]:
        """
        Parse an entries.json file into a TimelineFile object.
        
        Args:
            entries_file: Path to the entries.json file.
            timeline_dir: Path to the timeline directory.
            
        Returns:
            TimelineFile object or None if parsing fails.
        """
        with open(entries_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        
        resource = data.get("resource", "")
        if not resource:
            return None
        
        entries_data = data.get("entries", [])
        entries = [
            FileEntry(
                id=entry.get("id", ""),
                timestamp=entry.get("timestamp", 0),
                source=entry.get("source"),
                source_description=entry.get("sourceDescription"),
            )
            for entry in entries_data
        ]
        
        return TimelineFile(
            original_path=resource,
            timeline_dir=timeline_dir,
            entries=entries,
        )
    
    def _ensure_scanned(self) -> None:
        """Ensure the timeline has been scanned."""
        if not self._scanned:
            self.scan_timeline()
    
    def filter_by_directory(self, directory_path: str) -> dict[str, TimelineFile]:
        """
        Filter timeline files by a specific directory path.
        
        Args:
            directory_path: Absolute path to filter files by.
            
        Returns:
            Dictionary of matching timeline files.
        """
        self._ensure_scanned()
        
        # Normalize the directory path
        dir_path = Path(directory_path).resolve()
        dir_str = str(dir_path)
        
        if not dir_str.endswith("/"):
            dir_str += "/"
        
        matching = {}
        for path, timeline_file in self.timeline_files.items():
            if path.startswith(dir_str) or path.startswith(str(dir_path)):
                matching[path] = timeline_file
        
        self._log(f"Found {len(matching)} files matching directory: {directory_path}")
        return matching
    
    def reconstruct_directory(
        self,
        source_directory: str,
        output_directory: str,
        export_metadata: bool = True,
        at_timestamp: Optional[int] = None,
    ) -> dict:
        """
        Reconstruct a directory using versions from timeline.
        
        Args:
            source_directory: The original directory path to reconstruct.
            output_directory: Where to export the reconstructed directory.
            export_metadata: Whether to export JSON metadata.
            at_timestamp: Optional timestamp (ms) to reconstruct the directory 
                         as it was at that time. If None, uses latest versions.
            
        Returns:
            Dictionary with reconstruction results including:
            - success: bool
            - output_directory: str
            - files_processed: int
            - files: list of processed file paths
            - errors: list of error dictionaries
            - reconstructed_at: ISO datetime (if at_timestamp provided)
            - skipped_files: count of skipped files (if at_timestamp provided)
        """
        self._ensure_scanned()
        
        matching_files = self.filter_by_directory(source_directory)
        
        if not matching_files:
            return {
                "success": False,
                "error": f"No files found for directory: {source_directory}",
                "files_processed": 0,
            }
        
        output_path = Path(output_directory)
        output_path.mkdir(parents=True, exist_ok=True)
        
        source_path = Path(source_directory).resolve()
        
        processed_files = []
        skipped_files = []
        errors = []
        metadata_entries = []
        
        for file_path, timeline_file in matching_files.items():
            result = self._process_file_for_reconstruction(
                file_path=file_path,
                timeline_file=timeline_file,
                source_path=source_path,
                output_path=output_path,
                at_timestamp=at_timestamp,
                export_metadata=export_metadata,
            )
            
            if result["status"] == "processed":
                processed_files.append(result["relative_path"])
                if result.get("metadata"):
                    metadata_entries.append(result["metadata"])
            elif result["status"] == "skipped":
                skipped_files.append(file_path)
            elif result["status"] == "error":
                errors.append(result["error"])
        
        # Export metadata if requested
        if export_metadata and metadata_entries:
            self._export_metadata(
                output_path=output_path,
                source_directory=source_directory,
                metadata_entries=metadata_entries,
                at_timestamp=at_timestamp,
            )
        
        result = {
            "success": True,
            "output_directory": str(output_path),
            "files_processed": len(processed_files),
            "files": processed_files,
            "errors": errors,
        }
        
        if at_timestamp is not None:
            result["reconstructed_at"] = datetime.fromtimestamp(
                at_timestamp / 1000
            ).isoformat()
            result["skipped_files"] = len(skipped_files)
        
        return result
    
    def _process_file_for_reconstruction(
        self,
        file_path: str,
        timeline_file: TimelineFile,
        source_path: Path,
        output_path: Path,
        at_timestamp: Optional[int],
        export_metadata: bool,
    ) -> dict:
        """
        Process a single file for reconstruction.
        
        Returns a dict with status and relevant data.
        """
        try:
            # Get the appropriate entry
            if at_timestamp is not None:
                entry = timeline_file.get_entry_at_timestamp(at_timestamp)
                if not entry:
                    return {"status": "skipped"}
            else:
                entry = timeline_file.latest_entry
                if not entry:
                    return {"status": "skipped"}
            
            # Calculate relative path
            relative = self._calculate_relative_path(file_path, source_path)
            if relative is None:
                return {"status": "skipped"}
            
            # Create destination and copy
            dest_path = output_path / relative
            dest_path.parent.mkdir(parents=True, exist_ok=True)
            
            source_file = timeline_file.get_file_content_path(entry)
            if not source_file.exists():
                return {
                    "status": "error",
                    "error": {
                        "file": file_path,
                        "error": f"Source file not found: {source_file}",
                    },
                }
            
            shutil.copy2(source_file, dest_path)
            
            result = {
                "status": "processed",
                "relative_path": str(relative),
            }
            
            if export_metadata:
                result["metadata"] = timeline_file.to_metadata_dict(entry)
            
            return result
            
        except Exception as e:
            return {
                "status": "error",
                "error": {"file": file_path, "error": str(e)},
            }
    
    def _calculate_relative_path(
        self, 
        file_path: str, 
        source_path: Path
    ) -> Optional[Path]:
        """Calculate the relative path from source directory."""
        file_full_path = Path(file_path)
        
        try:
            return file_full_path.relative_to(source_path)
        except ValueError:
            # Try string matching if relative_to fails
            source_str = str(source_path)
            if file_path.startswith(source_str):
                return Path(file_path[len(source_str):].lstrip("/"))
            return None
    
    def _export_metadata(
        self,
        output_path: Path,
        source_directory: str,
        metadata_entries: list[dict],
        at_timestamp: Optional[int],
    ) -> None:
        """Export metadata JSON file."""
        metadata_file = output_path / METADATA_FILENAME
        metadata_content = {
            "source_directory": source_directory,
            "extraction_time": datetime.now().isoformat(),
            "total_files": len(metadata_entries),
            "files": metadata_entries,
        }
        
        if at_timestamp is not None:
            metadata_content["reconstructed_at_timestamp"] = at_timestamp
            metadata_content["reconstructed_at_datetime"] = datetime.fromtimestamp(
                at_timestamp / 1000
            ).isoformat()
        
        with open(metadata_file, "w", encoding="utf-8") as f:
            json.dump(metadata_content, f, indent=2)
    
    def list_files(
        self,
        directory_filter: Optional[str] = None,
        limit: Optional[int] = None,
    ) -> list[dict]:
        """
        List files in the timeline, optionally filtered by directory.
        
        Args:
            directory_filter: Optional directory path to filter by.
            limit: Maximum number of files to return.
            
        Returns:
            List of file metadata dictionaries, sorted by most recent first.
        """
        self._ensure_scanned()
        
        if directory_filter:
            files = self.filter_by_directory(directory_filter)
        else:
            files = self.timeline_files
        
        result = []
        for path, timeline_file in files.items():
            latest = timeline_file.latest_entry
            result.append({
                "path": path,
                "versions": len(timeline_file.entries),
                "latest_timestamp": latest.timestamp if latest else None,
                "latest_datetime": latest.datetime.isoformat() if latest else None,
                "latest_source": latest.source if latest else None,
            })
        
        # Sort by latest timestamp (most recent first)
        result.sort(key=lambda x: x.get("latest_timestamp", 0) or 0, reverse=True)
        
        if limit:
            result = result[:limit]
        
        return result
    
    def get_file_versions(self, file_path: str) -> Optional[dict]:
        """
        Get all versions of a specific file.
        
        Args:
            file_path: The original file path to look up.
            
        Returns:
            Dictionary with file versions or None if not found.
        """
        self._ensure_scanned()
        
        # Try direct match first
        timeline_file = self.timeline_files.get(file_path)
        
        # If not found, try to normalize and search
        if not timeline_file:
            normalized = str(Path(file_path).resolve())
            timeline_file = self.timeline_files.get(normalized)
        
        if not timeline_file:
            return None
        
        return {
            "original_path": timeline_file.original_path,
            "timeline_dir": str(timeline_file.timeline_dir),
            "versions": [
                entry.to_dict() 
                for entry in timeline_file.get_sorted_entries()
            ],
        }
    
    def export_file_version(
        self,
        file_path: str,
        output_path: str,
        version_index: int = 0,
    ) -> dict:
        """
        Export a specific version of a file.
        
        Args:
            file_path: The original file path.
            output_path: Where to save the file.
            version_index: Index of the version (0 = latest).
            
        Returns:
            Dictionary with export results.
        """
        from .utils import compute_file_hash
        
        versions_info = self.get_file_versions(file_path)
        
        if not versions_info:
            return {
                "success": False,
                "error": f"File not found in timeline: {file_path}",
            }
        
        versions = versions_info["versions"]
        if version_index >= len(versions):
            return {
                "success": False,
                "error": f"Version index {version_index} out of range (0-{len(versions)-1})",
            }
        
        version = versions[version_index]
        timeline_dir = Path(versions_info["timeline_dir"])
        source_file = timeline_dir / version["id"]
        
        if not source_file.exists():
            return {
                "success": False,
                "error": f"Version file not found: {source_file}",
            }
        
        output = Path(output_path)
        output.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source_file, output)
        
        return {
            "success": True,
            "output_path": str(output),
            "version": version,
            "file_hash": compute_file_hash(source_file),
        }
    
    def get_statistics(self) -> dict:
        """
        Get statistics about the timeline.
        
        Returns:
            Dictionary with timeline statistics.
        """
        self._ensure_scanned()
        
        if not self.timeline_files:
            return {
                "total_files": 0,
                "total_versions": 0,
                "average_versions": 0,
            }
        
        total_versions = sum(
            len(tf.entries) for tf in self.timeline_files.values()
        )
        
        return {
            "total_files": len(self.timeline_files),
            "total_versions": total_versions,
            "average_versions": total_versions / len(self.timeline_files),
            "timeline_path": str(self.timeline_path),
        }
