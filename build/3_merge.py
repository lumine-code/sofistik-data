"""Install extracted schemas and regenerate all derived SOFiSTiK data."""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path


def main() -> None:
    repository = Path(__file__).resolve().parent.parent
    extracted = repository / "build" / "extracted"
    schema = repository / "schema"
    generated = sorted(extracted.glob("sofistik.*.??.schema.json"))
    if not generated:
        raise SystemExit("No extracted schema files found; run build/1_extract.py first")

    for source in generated:
        parts = source.name.split(".")
        target = schema / f"sofistik.{parts[1]}.{parts[2]}.json"
        shutil.copyfile(source, target)

    metadata_path = schema / "meta.json"
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    source_provenance = {}
    for version in metadata["versions"]:
        provenance_path = repository / "build" / version / "provenance.json"
        if not provenance_path.is_file():
            raise SystemExit(f"Missing source provenance for {version}; run build/0_copyerr.py")
        source_provenance[version] = json.loads(provenance_path.read_text(encoding="utf-8"))
    metadata["provenance"] = {
        "source": "Installed SOFiSTiK .err catalogues",
        "rawCataloguesIncluded": False,
        "releases": source_provenance,
    }
    with metadata_path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(metadata, stream, indent=2)
        stream.write("\n")

    npm = "npm.cmd" if sys.platform == "win32" else "npm"
    subprocess.run([npm, "run", "generate"], cwd=repository, check=True)


if __name__ == "__main__":
    main()
