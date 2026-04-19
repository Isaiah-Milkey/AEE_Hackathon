"""Make repo-root package imports work when running backend scripts directly.

Python automatically imports ``sitecustomize`` on startup when it is available
on ``sys.path``. Since scripts like ``seed.py`` are run from the
``global_site/backend`` directory, that directory is already on ``sys.path``.
We use that hook to add the repository root, so absolute imports such as
``global_site.backend.db.database`` resolve correctly.
"""

from pathlib import Path
import sys


REPO_ROOT = Path(__file__).resolve().parents[2]
repo_root_str = str(REPO_ROOT)

if repo_root_str not in sys.path:
    sys.path.insert(0, repo_root_str)
