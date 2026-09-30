const assert = require("node:assert/strict");
const test = require("node:test");
const { getMetadata, resolveProjectTarget } = require("../lib");

test("uses the root definition ahead of the configured fallback", () => {
  assert.deepEqual(
    resolveProjectTarget({
      definitionText: "! project release\r\n  SOF_VERSION = 2024\r\n",
      defaultVersion: "2026",
    }),
    { version: "2024", source: "definition", dataSupported: true },
  );
  assert.equal(
    resolveProjectTarget({ definitionText: "sof_version=2023" }).version,
    "2023",
  );
});

test("uses the user's year when the definition declares none", () => {
  assert.deepEqual(
    resolveProjectTarget({
      definitionText: "$ SOF_VERSION = 2022",
      defaultVersion: " 2025 ",
    }),
    { version: "2025", source: "setting", dataSupported: true },
  );
  assert.equal(
    resolveProjectTarget({
      definitionText: "SOF_VERSION = next",
      defaultVersion: 2020,
    }).version,
    "2020",
  );
});

test("defaults to bundled metadata without an installation", () => {
  const expected = {
    version: getMetadata().versions.at(-1),
    source: "bundled",
    dataSupported: true,
  };
  for (const defaultVersion of [undefined, null, "", "  ", "Auto", " auto "]) {
    assert.deepEqual(resolveProjectTarget({ defaultVersion }), expected);
  }
  assert.deepEqual(resolveProjectTarget(), expected);
});

test("preserves unsupported declarations instead of silently selecting another year", () => {
  assert.deepEqual(
    resolveProjectTarget({
      definitionText: "SOF_VERSION = 2099",
      defaultVersion: "2024",
    }),
    { version: "2099", source: "definition", dataSupported: false },
  );
  assert.deepEqual(resolveProjectTarget({ defaultVersion: "2019" }), {
    version: "2019",
    source: "setting",
    dataSupported: false,
  });
});

test("does not treat a longer number as a four-digit release", () => {
  assert.equal(
    resolveProjectTarget({
      definitionText: "SOF_VERSION = 20260",
      defaultVersion: "2022",
    }).version,
    "2022",
  );
});
