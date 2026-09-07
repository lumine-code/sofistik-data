const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repositoryRoot = path.join(__dirname, "..");

function sortSemantic(value) {
  if (Array.isArray(value)) return value.map(sortSemantic);
  if (value === null || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortSemantic(value[key])]),
  );
}

function semanticJson(value) {
  return JSON.stringify(sortSemantic(value));
}

function digest(value) {
  return crypto.createHash("sha256").update(semanticJson(value)).digest("hex");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function metadataPath(root = repositoryRoot) {
  return path.join(root, "schema", "meta.json");
}

function schemaPath(root, version, language) {
  return path.join(root, "schema", `sofistik.${version}.${language}.json`);
}

function commandPath(root, version, language) {
  return path.join(root, "commands", `sofistik.${version}.${language}.json`);
}

function readMetadata(root = repositoryRoot) {
  return readJson(metadataPath(root));
}

function readSchema(version, language, root = repositoryRoot) {
  return readJson(schemaPath(root, version, language));
}

function commandSlots(commandSchema) {
  return commandSchema.forms.flatMap((form) => form.slots);
}

function projectCommandSchema(schema) {
  const result = {};
  for (const [moduleName, commands] of Object.entries(schema)) {
    result[moduleName] = {};
    for (const [commandName, commandSchema] of Object.entries(commands)) {
      const parameters = new Map();
      for (const slot of commandSlots(commandSchema)) {
        if (slot.name === null) continue;
        if (!parameters.has(slot.name)) parameters.set(slot.name, new Set());
        for (const value of slot.enumValues)
          parameters.get(slot.name).add(value);
      }

      const compact = [];
      for (const [name, values] of parameters) {
        compact.push(name);
        if (values.size > 0) compact.push([...values].sort());
      }
      result[moduleName][commandName] = compact;
    }
  }
  return result;
}

function buildGrammarVocabulary(metadata, loadSchema) {
  const modules = new Map();

  for (const version of metadata.versions) {
    for (const language of metadata.languages) {
      const schema = loadSchema(version, language);
      for (const [moduleName, commands] of Object.entries(schema)) {
        if (!modules.has(moduleName)) modules.set(moduleName, new Map());
        const module = modules.get(moduleName);
        for (const [commandName, commandSchema] of Object.entries(commands)) {
          if (!module.has(commandName)) module.set(commandName, new Set());
          const items = module.get(commandName);
          for (const slot of commandSlots(commandSchema)) {
            if (slot.name !== null) items.add(slot.name);
          }
        }
      }
    }
  }

  const vocabularyModules = {};
  for (const moduleName of [...modules.keys()].sort()) {
    vocabularyModules[moduleName] = {};
    const commands = modules.get(moduleName);
    for (const commandName of [...commands.keys()].sort()) {
      vocabularyModules[moduleName][commandName] = [
        ...commands.get(commandName),
      ].sort();
    }
  }

  const vocabulary = {
    formatVersion: 1,
    versions: [...metadata.versions],
    languages: [...metadata.languages],
    publicModuleAliases: { ...metadata.publicModuleAliases },
    modules: vocabularyModules,
  };
  return { ...vocabulary, digest: digest(vocabulary) };
}

function getGrammarVocabulary(root = repositoryRoot) {
  const metadata = readMetadata(root);
  return buildGrammarVocabulary(metadata, (version, language) =>
    readSchema(version, language, root),
  );
}

module.exports = {
  buildGrammarVocabulary,
  commandSlots,
  commandPath,
  digest,
  getGrammarVocabulary,
  metadataPath,
  projectCommandSchema,
  readJson,
  readMetadata,
  readSchema,
  repositoryRoot,
  schemaPath,
  semanticJson,
};
