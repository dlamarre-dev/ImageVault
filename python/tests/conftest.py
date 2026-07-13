import pathlib
import sys

# Make the `imagevault` package importable without installation.
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
