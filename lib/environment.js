const fs = require("node:fs");
const path = require("node:path");
const { versions } = require("../schema/meta.json");
const { SofistikDataProvider } = require("./provider");

const INSTALLATION_ROOT = "C:\\Program Files\\SOFiSTiK";

function languageCode(value) {
  return (
    { en: "en", english: "en", de: "de", german: "de" }[
      String(value ?? "")
        .trim()
        .toLowerCase()
    ] || null
  );
}

function explicitVersion(value) {
  const version = String(value ?? "").trim();
  return version && version.toLowerCase() !== "auto" ? version : null;
}

function declaration(text) {
  const source = String(text ?? "");
  return {
    version: /^\s*SOF_VERSION\s*=\s*(\d{4})\b/im.exec(source)?.[1] || null,
    language: languageCode(/^\s*SOF_LANGUAGE\s*=\s*(\w+)/im.exec(source)?.[1]),
    edition:
      /^\s*SOF_EDITION\s*=\s*(\w+)/im.exec(source)?.[1]?.toLowerCase() || null,
  };
}

/** Resolves project declarations and installation paths without an editor dependency. */
class SofistikEnvironmentResolver {
  constructor(options = {}) {
    this.root = options.root ?? INSTALLATION_ROOT;
    this.exists = options.exists || fs.existsSync;
    this.readFile =
      options.readFile ||
      ((file) => {
        try {
          return fs.readFileSync(file, "utf8");
        } catch {
          return null;
        }
      });
    this.readdir =
      options.readdir ||
      ((directory) => {
        try {
          return fs.readdirSync(directory);
        } catch {
          return [];
        }
      });
    this.cwd = options.cwd || (() => process.cwd());
    this.now = options.now || Date.now;
    this.installationCacheMs = options.installationCacheMs ?? 5000;
    this._installed = null;
    this._scannedAt = 0;
    this._data = options.dataProvider || null;
  }

  getInstalledVersions() {
    const now = this.now();
    if (this._installed && now - this._scannedAt < this.installationCacheMs)
      return [...this._installed];
    this._installed = this.readdir(this.root)
      .filter((version) => /^\d{4}$/.test(version))
      .filter((version) =>
        this.exists(path.join(this.root, version, `SOFiSTiK ${version}`)),
      )
      .sort()
      .reverse();
    this._scannedAt = now;
    return [...this._installed];
  }

  clearCache() {
    this._installed = null;
    this._data?.clearCache?.();
  }

  resolve(context = {}) {
    const filePath = context.filePath ? path.resolve(context.filePath) : null;
    const projectPath = context.projectPath
      ? path.resolve(context.projectPath)
      : filePath
        ? path.dirname(filePath)
        : path.resolve(this.cwd());
    const definition = declaration(
      this.readFile(path.join(projectPath, "sofistik.def")),
    );
    const requested = explicitVersion(context.version);
    const declared = definition.version;
    let version, versionSource;
    if (requested) {
      version = requested;
      versionSource = "explicit";
    } else if (declared) {
      version = declared;
      versionSource = "definition";
    } else {
      const installed = this.getInstalledVersions()[0];
      version = installed || versions.at(-1);
      versionSource = installed ? "installed" : "bundled";
    }
    const language =
      languageCode(context.language) || definition.language || "en";
    const edition = String(
      context.edition || definition.edition || "professional",
    )
      .trim()
      .toLowerCase();
    const installPath = path.join(this.root, version, `SOFiSTiK ${version}`);
    return {
      version,
      language,
      edition,
      root: this.root,
      installPath,
      installed: this.exists(installPath),
      dataSupported: versions.includes(version),
      versionSource,
    };
  }

  getKeywordContext(context = {}) {
    const resolved = this.resolve(context);
    this._data ||= new SofistikDataProvider();
    return this._data.forRelease(resolved.version, resolved.language);
  }
}

module.exports = { INSTALLATION_ROOT, SofistikEnvironmentResolver };
