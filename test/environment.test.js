const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  INSTALLATION_ROOT,
  SofistikEnvironmentResolver,
  getMetadata,
} = require("../lib");

function fixture(t) {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), "sofistik-resolver-"),
  );
  t.after(() =>
    fs.rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 50,
    }),
  );
  const projectPath = path.join(directory, "project");
  const root = path.join(directory, "installed");
  fs.mkdirSync(projectPath);
  fs.mkdirSync(root);
  const resolver = new SofistikEnvironmentResolver({ root });
  const filePath = path.join(projectPath, "model.dat");
  return { directory, projectPath, root, resolver, filePath };
}

test("has one fixed installation root and defaults offline to bundled data", () => {
  assert.equal(INSTALLATION_ROOT, "C:\\Program Files\\SOFiSTiK");
  const resolver = new SofistikEnvironmentResolver({
    readFile: () => null,
    readdir: () => [],
    exists: () => false,
  });
  assert.deepEqual(resolver.resolve(), {
    version: getMetadata().versions.at(-1),
    language: "en",
    edition: "professional",
    root: INSTALLATION_ROOT,
    installPath: path.join(INSTALLATION_ROOT, "2026", "SOFiSTiK 2026"),
    installed: false,
    dataSupported: true,
    versionSource: "bundled",
  });
  assert.equal(resolver.getKeywordContext().getVersion(), "2026");
});

test("uses explicit caller overrides ahead of project declarations and ignores headers", (t) => {
  const { projectPath, resolver, filePath } = fixture(t);
  fs.writeFileSync(
    path.join(projectPath, "sofistik.def"),
    "SOF_VERSION = 2024\nSOF_LANGUAGE = DE\nSOF_EDITION = educational\n",
  );
  fs.writeFileSync(filePath, "@ SOFiSTiK 2025-05 EN\n+PROG AQUA\n");
  assert.deepEqual(resolver.resolve({ projectPath, filePath }), {
    version: "2024",
    language: "de",
    edition: "educational",
    root: resolver.root,
    installPath: path.join(resolver.root, "2024", "SOFiSTiK 2024"),
    installed: false,
    dataSupported: true,
    versionSource: "definition",
  });
  const explicit = resolver.resolve({
    projectPath,
    filePath,
    version: "2020",
    language: "German",
    edition: "professional",
  });
  assert.equal(explicit.version, "2020");
  assert.equal(explicit.versionSource, "explicit");
  assert.equal(explicit.language, "de");
  assert.equal(explicit.edition, "professional");
  assert.equal(
    resolver.resolve({ projectPath, filePath, text: "", version: "Auto" })
      .version,
    "2024",
  );
  assert.equal(
    resolver.resolve({ projectPath, filePath, text: "" }).language,
    "de",
  );
});

test("never reads a source file or uses supplied header text for version or language", (t) => {
  const { resolver, filePath } = fixture(t);
  fs.writeFileSync(filePath, "@ SOFiSTiK 2022\n");
  const originalRead = resolver.readFile;
  const readPaths = [];
  resolver.readFile = (file) => {
    readPaths.push(file);
    return originalRead(file);
  };
  const resolved = resolver.resolve({ filePath, text: "@ SOFiSTiK 2023 DE\n" });
  assert.equal(resolved.version, "2026");
  assert.equal(resolved.language, "en");
  assert.deepEqual(readPaths, [
    path.join(path.dirname(filePath), "sofistik.def"),
  ]);
  assert.equal(
    resolver.resolve({ filePath, text: "title\n@ SOFiSTiK 2023 DE\n" })
      .versionSource,
    "bundled",
  );
  assert.equal(
    resolver.resolve({ filePath, text: "\uFEFF@ SOFiSTiK 2024\n" })
      .versionSource,
    "bundled",
  );
});

test("selects the adjacent definition for each file despite a supplied workspace root", (t) => {
  const { projectPath, resolver } = fixture(t);
  const first = path.join(projectPath, "first");
  const second = path.join(projectPath, "second");
  fs.mkdirSync(first);
  fs.mkdirSync(second);
  fs.writeFileSync(
    path.join(projectPath, "sofistik.def"),
    "SOF_VERSION = 2099\nSOF_LANGUAGE = DE\n",
  );
  fs.writeFileSync(
    path.join(first, "sofistik.def"),
    "SOF_VERSION = 2024\nSOF_LANGUAGE = EN\n",
  );
  fs.writeFileSync(
    path.join(second, "sofistik.def"),
    "SOF_VERSION = 2023\nSOF_LANGUAGE = DE\nSOF_EDITION = educational\n",
  );
  for (const [directory, version, language, edition] of [
    [first, "2024", "en", "professional"],
    [second, "2023", "de", "educational"],
  ]) {
    const context = {
      projectPath,
      filePath: path.join(directory, "model.dat"),
    };
    const resolved = resolver.resolve(context);
    assert.equal(resolved.version, version);
    assert.equal(resolved.versionSource, "definition");
    assert.equal(resolved.language, language);
    assert.equal(resolved.edition, edition);
    assert.equal(resolved.dataSupported, true);
    const keywords = resolver.getKeywordContext(context);
    assert.equal(keywords.getVersion(), version);
    assert.equal(keywords.getLanguage(), language);
  }
});

test("ignores parent definitions when a file has no adjacent definition", (t) => {
  const { projectPath, resolver } = fixture(t);
  const child = path.join(projectPath, "child");
  fs.mkdirSync(child);
  fs.writeFileSync(
    path.join(projectPath, "sofistik.def"),
    "SOF_VERSION = 2023\nSOF_LANGUAGE = DE\nSOF_EDITION = educational\n",
  );
  const context = { projectPath, filePath: path.join(child, "model.dat") };
  const resolved = resolver.resolve(context);
  assert.equal(resolved.version, getMetadata().versions.at(-1));
  assert.equal(resolved.versionSource, "bundled");
  assert.equal(resolved.language, "en");
  assert.equal(resolved.edition, "professional");
  assert.equal(resolver.getKeywordContext(context).getLanguage(), "en");
});

test("accepts an explicit directory context only when no file path is supplied", (t) => {
  const { projectPath, resolver, filePath } = fixture(t);
  const other = path.join(projectPath, "other");
  fs.mkdirSync(other);
  fs.writeFileSync(path.join(other, "sofistik.def"), "SOF_VERSION = 2023\n");
  assert.equal(resolver.resolve({ directoryPath: other }).version, "2023");
  assert.equal(resolver.resolve({ projectPath: other }).version, "2023");
  assert.equal(
    resolver.resolve({ directoryPath: other, projectPath: other, filePath })
      .versionSource,
    "bundled",
  );
});

test("chooses the latest actually installed release before newest data", (t) => {
  const { projectPath, resolver, root } = fixture(t);
  for (const version of ["2022", "2024"]) {
    const install = path.join(root, version, `SOFiSTiK ${version}`);
    fs.mkdirSync(install, {
      recursive: true,
    });
    fs.writeFileSync(path.join(install, "sps.exe"), "fixture");
  }
  fs.mkdirSync(path.join(root, "2025"));
  fs.mkdirSync(path.join(root, "2027", "SOFiSTiK 2027"), { recursive: true });
  const resolved = resolver.resolve({ projectPath });
  assert.equal(resolved.version, "2024");
  assert.equal(resolved.versionSource, "installed");
  assert.equal(resolved.installed, true);
  fs.writeFileSync(
    path.join(projectPath, "sofistik.def"),
    "SOF_VERSION = 2022\n",
  );
  const declared = resolver.resolve({ projectPath });
  assert.equal(declared.version, "2022");
  assert.equal(declared.versionSource, "definition");
  assert.equal(
    resolver.getKeywordContext({ projectPath }).getVersion(),
    "2022",
  );
});

test("preserves unsupported adjacent or explicit years without substitution", (t) => {
  const { projectPath, resolver } = fixture(t);
  const child = path.join(projectPath, "child");
  fs.mkdirSync(child);
  const context = { projectPath, filePath: path.join(child, "model.dat") };
  fs.writeFileSync(
    path.join(projectPath, "sofistik.def"),
    "SOF_VERSION = 2026\n",
  );
  fs.writeFileSync(path.join(child, "sofistik.def"), "SOF_VERSION = 2099\n");
  const resolved = resolver.resolve(context);
  assert.equal(resolved.version, "2099");
  assert.equal(resolved.versionSource, "definition");
  assert.equal(resolved.dataSupported, false);
  assert.equal(resolver.getKeywordContext(context), null);
  assert.equal(
    resolver.getKeywordContext({ ...context, version: "2019" }),
    null,
  );
});

test("observes definition creation, replacement and deletion without cached declarations", (t) => {
  const { projectPath, resolver } = fixture(t);
  const definition = path.join(projectPath, "sofistik.def");
  assert.equal(resolver.resolve({ projectPath }).versionSource, "bundled");
  fs.writeFileSync(
    definition,
    "SOF_VERSION = 2024\nSOF_LANGUAGE = DE\nSOF_EDITION = educational\n",
  );
  assert.equal(resolver.resolve({ projectPath }).version, "2024");
  const replacement = path.join(projectPath, "replacement.def");
  fs.writeFileSync(replacement, "SOF_VERSION = 2023\n");
  fs.renameSync(replacement, definition);
  assert.equal(resolver.resolve({ projectPath }).version, "2023");
  assert.equal(resolver.resolve({ projectPath }).edition, "professional");
  fs.unlinkSync(definition);
  assert.equal(resolver.resolve({ projectPath }).versionSource, "bundled");
});

test("bounds installed-release caching and permits explicit invalidation", () => {
  let now = 0,
    scans = 0;
  const resolver = new SofistikEnvironmentResolver({
    now: () => now,
    installationCacheMs: 100,
    exists: () => true,
    readFile: () => null,
    readdir: () => {
      scans++;
      return [now ? "2026" : "2024"];
    },
  });
  assert.equal(resolver.resolve().version, "2024");
  now = 50;
  assert.equal(resolver.resolve().version, "2024");
  assert.equal(scans, 1);
  now = 100;
  assert.equal(resolver.resolve().version, "2026");
  assert.equal(scans, 2);
  resolver.clearCache();
  resolver.resolve();
  assert.equal(scans, 3);
});
