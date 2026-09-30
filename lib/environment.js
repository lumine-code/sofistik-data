const {
  INSTALLATION_ROOT,
  SofistikEnvironmentResolver: EnvironmentResolver,
} = require("@lumine-code/sofistik-env");
const { versions } = require("../schema/meta.json");
const { SofistikDataProvider } = require("./provider");

/** Adds dataset selection to the shared installation and declaration resolver. */
class SofistikEnvironmentResolver extends EnvironmentResolver {
  constructor(options = {}) {
    super({ ...options, fallbackVersion: () => versions.at(-1) });
    this._data = options.dataProvider || null;
  }

  clearCache() {
    super.clearCache();
    this._data?.clearCache?.();
  }

  resolve(context = {}) {
    const resolved = super.resolve(context);
    return {
      ...resolved,
      dataSupported: versions.includes(resolved.version),
      versionSource:
        resolved.versionSource === "fallback"
          ? "bundled"
          : resolved.versionSource,
    };
  }

  getKeywordContext(context = {}) {
    const resolved = this.resolve(context);
    this._data ||= new SofistikDataProvider();
    return this._data.forRelease(resolved.version, resolved.language);
  }
}

module.exports = { INSTALLATION_ROOT, SofistikEnvironmentResolver };
