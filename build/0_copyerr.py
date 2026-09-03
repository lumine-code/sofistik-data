"""Copy licensed SOFiSTiK error catalogues into the ignored build cache."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path


BUILD_DIR = Path(__file__).resolve().parent
METADATA_PATH = BUILD_DIR.parent / "schema" / "meta.json"
DEFAULT_ROOT = Path(os.environ.get("SOFISTIK_ROOT", "C:/Program Files/SOFiSTiK"))


def available_versions() -> list[str]:
    metadata = json.loads(METADATA_PATH.read_text(encoding="utf-8"))
    return metadata["versions"]


def source_catalogues(root: Path, version: str) -> list[Path]:
    source = root / version / f"SOFiSTiK {version}"
    if not source.is_dir():
        return []
    return [
        file
        for file in sorted(source.glob("*.err"))
        if not file.stem.upper().endswith("_TEST")
        and not file.stem.upper().startswith("TEST_")
        and file.stem.upper() != "TABLELAYOUT"
    ]


def catalogue_record(file: Path) -> dict:
    content = file.read_bytes()
    header = content[:4096].decode("latin-1", errors="replace")
    version = re.search(r"(?m)^0000VERSION\s+(\d+)", header)
    return {
        "file": file.name,
        "bytes": len(content),
        "sha256": hashlib.sha256(content).hexdigest(),
        "catalogueVersion": version.group(1) if version else "",
    }


def copy_err_files(version: str, build_dir: Path, root: Path) -> int:
    sources = source_catalogues(root, version)
    if not sources:
        print(f"  {version}: source catalogues not found under {root}")
        return 0

    destination = build_dir / version
    with tempfile.TemporaryDirectory(prefix=f".{version}-", dir=build_dir) as staging_name:
        staging = Path(staging_name)
        for source in sources:
            shutil.copy2(source, staging / source.name)

        destination.mkdir(parents=True, exist_ok=True)
        for existing in destination.glob("*.err"):
            existing.unlink()
        for staged in staging.glob("*.err"):
            shutil.move(staged, destination / staged.name)

    provenance = {
        "release": version,
        "catalogues": [catalogue_record(file) for file in sorted(destination.glob("*.err"))],
    }
    with (destination / "provenance.json").open(
        "w", encoding="utf-8", newline="\n"
    ) as stream:
        json.dump(provenance, stream, indent=2)
        stream.write("\n")

    print(f"  {version}: copied {len(sources)} catalogues")
    return len(sources)


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_ROOT,
        help="Installation root containing release directories (or set SOFISTIK_ROOT)",
    )
    parser.add_argument(
        "versions",
        nargs="*",
        choices=available_versions(),
        default=available_versions(),
        help="Releases to copy; defaults to every release in schema/meta.json",
    )
    return parser.parse_args()


def main() -> None:
    arguments = parse_arguments()
    print("SOFiSTiK .err File Copier")
    print("=" * 50)
    total = sum(
        copy_err_files(version, BUILD_DIR, arguments.root) for version in arguments.versions
    )
    print("=" * 50)
    print(f"Total: {total} catalogues")


if __name__ == "__main__":
    main()
