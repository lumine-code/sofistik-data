const { versions } = require("../schema/meta.json");

const DEFINITION_VERSION = /^\s*SOF_VERSION\s*=\s*(\d{4})\b/im;

/** Select one project release without consulting the installation or editor. */
function resolveProjectTarget({ definitionText = "", defaultVersion } = {}) {
  const declared = DEFINITION_VERSION.exec(String(definitionText ?? ""))?.[1];
  const configured = String(defaultVersion ?? "").trim();
  const setting =
    configured && configured.toLowerCase() !== "auto" ? configured : null;
  const version = declared || setting || versions.at(-1);
  return {
    version,
    source: declared ? "definition" : setting ? "setting" : "bundled",
    dataSupported: versions.includes(version),
  };
}

module.exports = { resolveProjectTarget };
