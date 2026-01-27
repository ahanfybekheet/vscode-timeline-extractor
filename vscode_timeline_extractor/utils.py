"""
Utility functions for VS Code Timeline Extractor.

This module contains helper functions for timestamp parsing,
file hashing, and other common operations.
"""

import hashlib
from datetime import datetime
from pathlib import Path
from typing import Optional


def compute_file_hash(file_path: Path, algorithm: str = "sha256") -> Optional[str]:
    """
    Compute hash of a file's contents.
    
    Args:
        file_path: Path to the file to hash.
        algorithm: Hash algorithm to use (default: sha256).
        
    Returns:
        Hash as hex string, or None if file doesn't exist.
    """
    if not file_path.exists():
        return None
    
    hash_obj = hashlib.new(algorithm)
    
    with open(file_path, "rb") as f:
        for chunk in iter(lambda: f.read(8192), b""):
            hash_obj.update(chunk)
    
    return hash_obj.hexdigest()


def parse_timestamp(timestamp_str: str) -> int:
    """
    Parse a timestamp string into Unix timestamp in milliseconds.
    
    Accepts multiple formats:
        - ISO format: 2025-06-27T14:30:00
        - ISO with microseconds: 2025-06-27T14:30:00.123456
        - Date and time with space: 2025-06-27 14:30:00
        - Date only: 2025-06-27 (uses midnight)
        - Unix timestamp in milliseconds: 1751055000000
        - Unix timestamp in seconds: 1751055000
    
    Args:
        timestamp_str: The timestamp string to parse.
        
    Returns:
        Unix timestamp in milliseconds.
        
    Raises:
        ValueError: If the timestamp format is not recognized.
    """
    # Try parsing as integer (Unix timestamp)
    try:
        ts = int(timestamp_str)
        # If it's less than year 2100 in seconds, assume it's in seconds
        if ts < 4102444800:  # 2100-01-01 in seconds
            return ts * 1000
        return ts
    except ValueError:
        pass
    
    # Try parsing as ISO format datetime
    formats = [
        "%Y-%m-%dT%H:%M:%S.%f",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d",
    ]
    
    for fmt in formats:
        try:
            dt = datetime.strptime(timestamp_str, fmt)
            return int(dt.timestamp() * 1000)
        except ValueError:
            continue
    
    raise ValueError(
        f"Unable to parse timestamp: {timestamp_str}. "
        f"Expected ISO format (2025-06-27T14:30:00), date (2025-06-27), "
        f"or Unix timestamp."
    )


def format_timestamp(timestamp_ms: int) -> str:
    """
    Format a Unix timestamp (ms) as ISO datetime string.
    
    Args:
        timestamp_ms: Unix timestamp in milliseconds.
        
    Returns:
        ISO format datetime string.
    """
    return datetime.fromtimestamp(timestamp_ms / 1000).isoformat()


def timestamp_to_datetime(timestamp_ms: int) -> datetime:
    """
    Convert Unix timestamp (ms) to datetime object.
    
    Args:
        timestamp_ms: Unix timestamp in milliseconds.
        
    Returns:
        datetime object.
    """
    return datetime.fromtimestamp(timestamp_ms / 1000)


def truncate_path(path: str, max_length: int = 60) -> str:
    """
    Truncate a path string for display, keeping the end.
    
    Args:
        path: The path to truncate.
        max_length: Maximum length of the result.
        
    Returns:
        Truncated path with '...' prefix if needed.
    """
    if len(path) <= max_length:
        return path
    return "..." + path[-(max_length - 3):]


def format_file_size(size_bytes: int) -> str:
    """
    Format file size in human-readable format.
    
    Args:
        size_bytes: File size in bytes.
        
    Returns:
        Formatted string (e.g., "1.5 MB").
    """
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size_bytes < 1024:
            return f"{size_bytes:.1f} {unit}"
        size_bytes /= 1024
    return f"{size_bytes:.1f} PB"
