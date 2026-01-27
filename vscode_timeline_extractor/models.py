"""
Data models for VS Code Timeline Extractor.

This module contains the data classes that represent timeline entries
and files with their version history.
"""

from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional
from urllib.parse import unquote, urlparse

from .utils import compute_file_hash


@dataclass
class FileEntry:
    """
    Represents a single version of a file in the timeline.
    
    Attributes:
        id: The filename of the version in the timeline directory.
        timestamp: Unix timestamp in milliseconds when this version was saved.
        source: What triggered the save (e.g., "undoRedo.source", "Chat Edit").
        source_description: Additional description about the source.
    """
    id: str
    timestamp: int
    source: Optional[str] = None
    source_description: Optional[str] = None
    
    @property
    def datetime(self) -> datetime:
        """Convert timestamp to datetime object."""
        return datetime.fromtimestamp(self.timestamp / 1000)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON export."""
        return {
            "id": self.id,
            "timestamp": self.timestamp,
            "datetime": self.datetime.isoformat(),
            "source": self.source,
            "source_description": self.source_description,
        }
    
    def __repr__(self) -> str:
        return f"FileEntry(id={self.id!r}, datetime={self.datetime.isoformat()!r})"


@dataclass
class TimelineFile:
    """
    Represents a file with its complete timeline history.
    
    Attributes:
        original_path: The original file path as stored in VS Code (file:// URI).
        timeline_dir: Path to the timeline directory containing versions.
        entries: List of FileEntry objects representing versions.
    """
    original_path: str
    timeline_dir: Path
    entries: list[FileEntry] = field(default_factory=list)
    
    @property
    def latest_entry(self) -> Optional[FileEntry]:
        """Get the most recent entry based on timestamp."""
        if not self.entries:
            return None
        return max(self.entries, key=lambda e: e.timestamp)
    
    @property
    def oldest_entry(self) -> Optional[FileEntry]:
        """Get the oldest entry based on timestamp."""
        if not self.entries:
            return None
        return min(self.entries, key=lambda e: e.timestamp)
    
    @property
    def relative_path(self) -> str:
        """
        Get the file path from the original resource URI.
        
        Parses the file:// URI and returns the decoded path.
        """
        parsed = urlparse(self.original_path)
        return unquote(parsed.path)
    
    @property
    def filename(self) -> str:
        """Get just the filename from the path."""
        return Path(self.relative_path).name
    
    def get_entry_at_timestamp(self, target_timestamp: int) -> Optional[FileEntry]:
        """
        Get the entry that was current at the specified timestamp.
        
        Returns the most recent entry that is not newer than the target timestamp.
        This gives you the state of the file as it was at that point in time.
        
        Args:
            target_timestamp: Unix timestamp in milliseconds.
            
        Returns:
            The entry that was current at that time, or None if no entry 
            exists before that time.
        """
        if not self.entries:
            return None
        
        # Filter entries that are not newer than the target timestamp
        valid_entries = [e for e in self.entries if e.timestamp <= target_timestamp]
        
        if not valid_entries:
            return None
        
        # Return the most recent one among valid entries
        return max(valid_entries, key=lambda e: e.timestamp)
    
    def get_file_content_path(self, entry: FileEntry) -> Path:
        """
        Get the full path to a specific version's content file.
        
        Args:
            entry: The FileEntry to get the path for.
            
        Returns:
            Path to the version file.
        """
        return self.timeline_dir / entry.id
    
    def compute_hash(self, entry: Optional[FileEntry] = None) -> Optional[str]:
        """
        Compute SHA256 hash of the file content.
        
        Args:
            entry: Specific entry to hash. If None, uses latest entry.
            
        Returns:
            SHA256 hash as hex string, or None if file doesn't exist.
        """
        if entry is None:
            entry = self.latest_entry
        if entry is None:
            return None
        
        file_path = self.get_file_content_path(entry)
        return compute_file_hash(file_path)
    
    def to_metadata_dict(self, entry: Optional[FileEntry] = None) -> dict:
        """
        Convert to metadata dictionary for JSON export.
        
        Args:
            entry: Specific entry to use. If None, uses latest entry.
            
        Returns:
            Dictionary with file metadata.
        """
        if entry is None:
            entry = self.latest_entry
        
        return {
            "original_path": self.original_path,
            "relative_path": self.relative_path,
            "source": "timeline",
            "timestamp": entry.timestamp if entry else None,
            "datetime": entry.datetime.isoformat() if entry else None,
            "file_hash": self.compute_hash(entry),
            "entry_source": entry.source if entry else None,
            "total_versions": len(self.entries),
        }
    
    def get_sorted_entries(self, reverse: bool = True) -> list[FileEntry]:
        """
        Get entries sorted by timestamp.
        
        Args:
            reverse: If True (default), most recent first.
            
        Returns:
            Sorted list of entries.
        """
        return sorted(self.entries, key=lambda e: e.timestamp, reverse=reverse)
    
    def __repr__(self) -> str:
        return (
            f"TimelineFile(path={self.relative_path!r}, "
            f"versions={len(self.entries)})"
        )
