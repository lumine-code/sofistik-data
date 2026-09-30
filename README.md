# sofistik-data

Provides versioned SOFiSTiK CADINP command and schema data.

> **NOTE**: This package is not an official SOFiSTiK product and is not affiliated with or endorsed by SOFiSTiK AG.

## Features

- **Versioned schemas**: preserves every CADINP command form and its ordered slots for each supported release and language.
- **Keyword indexes**: derives compact module, command, item, and enum lookups from the canonical schemas.
- **Module identities**: distinguishes source catalogue names from public executable aliases.
- **Tree-sitter vocabulary**: exposes a deterministic union and digest for parser generation.
- **Lazy API**: loads only the release and language a consumer requests.
- **Project target**: selects one release from a root definition, the user setting, or the newest bundled dataset without requiring an installation.

## Installation

Install the library from an immutable Git commit:

```sh
npm install github:lumine-code/sofistik-data#<commit-sha>
```

The package is distributed through Git pins and is not published to the npm registry.

## Usage

```js
const { SofistikDataProvider } = require("@lumine-code/sofistik-data");

const data = new SofistikDataProvider();
const keywords = data.forRelease("2026", "en");
const aquaCommands = keywords.getModuleCommands("AQUA");
const concreteForms = keywords.getCommandSchema("AQUA", "CONC").forms;
```

`forRelease` returns `null` for a release or language absent from the committed data. Omitting a release selects the newest available dataset, and omitting a language selects English.

`resolveProjectTarget({ definitionText, defaultVersion })` selects the year declared by `SOF_VERSION = YYYY` in the project's root `sofistik.def`, then the configured fallback year, then the newest bundled dataset. Empty and `Auto` settings fall through. It returns `{ version, source, dataSupported }`, where `source` is `definition`, `setting`, or `bundled`. An unsupported explicit year stays selected with `dataSupported: false`; installed releases never influence the result. The helper accepts text and performs no filesystem or editor access, so the language server and environment service share the same policy while reading their own project roots.

## Building

The canonical schemas are committed under `schema/`. Run `npm run generate` to rebuild the compact command indexes, metadata and semantic digests.

Refreshing schemas from an installed SOFiSTiK release is an explicit local pipeline:

```sh
python build/0_copyerr.py --root "C:/Program Files/SOFiSTiK"
python build/1_extract.py
python build/3_merge.py
npm test
```

`SOFISTIK_ROOT` may replace `--root`. The licensed `.err` catalogues remain under ignored `build/<release>/` directories and are never committed or packed.

## Contributing

Got ideas to make this package better, found a bug, or want to help add new features? Just drop your thoughts on GitHub. Any feedback is welcome!
