const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const {
  SofistikDataProvider,
  getGrammarVocabulary,
  getMetadata,
} = require("../lib");
const {
  digest,
  projectCommandSchema,
  readSchema,
  repositoryRoot,
} = require("../lib/catalog");

test("publishes one complete release and language matrix", () => {
  const metadata = getMetadata();
  assert.equal(metadata.formatVersion, 1);
  assert.deepEqual(metadata.versions, [
    "2018",
    "2020",
    "2022",
    "2023",
    "2024",
    "2025",
    "2026",
  ]);
  assert.deepEqual(metadata.languages, ["de", "en"]);
  assert.match(metadata.schemaDigest, /^[a-f0-9]{64}$/);
  assert.match(metadata.grammarVocabularyDigest, /^[a-f0-9]{64}$/);

  for (const version of metadata.versions) {
    for (const language of metadata.languages) {
      assert.ok(
        fs.existsSync(
          path.join(
            repositoryRoot,
            "schema",
            `sofistik.${version}.${language}.json`,
          ),
        ),
      );
      assert.ok(
        fs.existsSync(
          path.join(
            repositoryRoot,
            "commands",
            `sofistik.${version}.${language}.json`,
          ),
        ),
      );
    }
  }
});

test("keeps source identities separate from public executable aliases", () => {
  const metadata = getMetadata();
  assert.deepEqual(metadata.sourceModuleAliases, {
    DBIN: "DBINFO",
    MAXI: "MAXIMA",
    TEMP: "TEMPLATE",
  });
  assert.deepEqual(metadata.publicModuleAliases, {
    DBMERG: "DBME",
    STAR2: "STAR",
    TUNARS: "TUNA",
  });
});

test("derives every compact command index from its canonical schema", () => {
  const metadata = getMetadata();
  for (const version of metadata.versions) {
    for (const language of metadata.languages) {
      const projected = projectCommandSchema(readSchema(version, language));
      const committed = JSON.parse(
        fs.readFileSync(
          path.join(
            repositoryRoot,
            "commands",
            `sofistik.${version}.${language}.json`,
          ),
          "utf8",
        ),
      );
      assert.deepEqual(committed, projected, `${version}.${language}`);
    }
  }
});

test("binds contexts only to data that actually exists", () => {
  const data = new SofistikDataProvider();
  assert.equal(data.forRelease("2099", "en"), null);
  assert.equal(data.forRelease("2026", "pl"), null);

  const defaultContext = data.forRelease();
  assert.equal(defaultContext.getVersion(), "2026");
  assert.equal(defaultContext.getLanguage(), "en");
  assert.equal(data.forRelease("Auto", "Auto").getVersion(), "2026");
  assert.equal(data.forRelease("Auto", "Auto").getLanguage(), "en");

  const german = data.forRelease("2024", "German");
  assert.equal(german.getVersion(), "2024");
  assert.equal(german.getLanguage(), "de");
});

test("resolves public executable module aliases", () => {
  const keywords = new SofistikDataProvider().forRelease("2026", "en");
  for (const [publicName, sourceName, command] of [
    ["DBMERG", "DBME", "CDB"],
    ["STAR2", "STAR", "DESI"],
    ["TUNARS", "TUNA", "GEO"],
  ]) {
    assert.ok(keywords.getModuleNames().includes(publicName));
    assert.deepEqual(
      keywords.getModuleCommands(publicName),
      keywords.getModuleCommands(sourceName),
    );
    assert.ok(
      keywords.getModuleCommands(publicName.toLowerCase()).includes(command),
    );
    assert.deepEqual(
      keywords.getCommandSchema(publicName, command),
      keywords.getCommandSchema(sourceName, command),
    );
  }
});

test("exposes ordered slots and compact enum lookups", () => {
  const keywords = new SofistikDataProvider().forRelease("2026", "en");
  const schema = keywords.getCommandSchema("AQUA", "CONC");
  assert.ok(schema.slots.length > 3);
  assert.deepEqual(
    schema.slots.map((slot) => slot.position),
    schema.slots.map((_, index) => index + 1),
  );
  assert.ok(keywords.getCommandParams("AQUA", "CONC").includes("TYPE"));
  assert.ok(keywords.getParamEnums("AQUA", "CONC", "type").includes("C"));
});

test("preserves punctuation in directional and ratio item names", () => {
  const keywords = new SofistikDataProvider().forRelease("2026", "en");
  const names = (moduleName, commandName) =>
    keywords
      .getCommandSchema(moduleName, commandName)
      .slots.map((slot) => slot.name);

  assert.ok(names("AQUA", "SMAT").includes("P+"));
  assert.ok(names("AQUA", "SMAT").includes("MY-"));
  assert.ok(names("AQUA", "SHRW").includes("SZ+"));
  assert.ok(names("SOFILOAD", "VOLU").includes("A/U"));
  assert.ok(names("TENDON", "SYSP").includes("MUE-"));
});

test("exports a deterministic grammar vocabulary digest", () => {
  const metadata = getMetadata();
  const vocabulary = getGrammarVocabulary();
  assert.equal(vocabulary.digest, metadata.grammarVocabularyDigest);
  assert.equal(vocabulary.publicModuleAliases.DBMERG, "DBME");
  assert.ok(vocabulary.modules.AQUA.CONC.includes("TYPE"));
  const semanticVocabulary = { ...vocabulary };
  delete semanticVocabulary.digest;
  assert.equal(digest(semanticVocabulary), vocabulary.digest);
});

test("semantic digests do not depend on JSON line endings or key order", () => {
  const lf = JSON.parse('{\n  "b": 2,\n  "a": 1\n}');
  const crlf = JSON.parse('{\r\n  "a": 1,\r\n  "b": 2\r\n}');
  assert.equal(digest(lf), digest(crlf));
});

test("does not track source error catalogues", () => {
  const tracked = childProcess.execFileSync("git", ["ls-files", "*.err"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  assert.equal(tracked.trim(), "");
});
