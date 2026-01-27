"""
Entry point for running as a module: python -m vscode_timeline_extractor
"""

import sys
from .cli import main

if __name__ == "__main__":
    sys.exit(main())
