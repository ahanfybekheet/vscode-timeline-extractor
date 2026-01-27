"""
VS Code Timeline Extractor

A CLI tool that extracts file data from VS Code's Timeline / local history
and reconstructs directory versions.

Author: GitHub Copilot
License: MIT
"""

from .models import FileEntry, TimelineFile
from .extractor import VSCodeTimelineExtractor
from .utils import parse_timestamp, compute_file_hash

__version__ = "1.0.0"
__all__ = [
    "FileEntry",
    "TimelineFile",
    "VSCodeTimelineExtractor",
    "parse_timestamp",
    "compute_file_hash",
]
