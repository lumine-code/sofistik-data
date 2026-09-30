const { getGrammarVocabulary, readMetadata } = require("./catalog");
const { SofistikDataProvider, SofistikKeywordsContext } = require("./provider");
const { resolveProjectTarget } = require("./project-target");
const {
  INSTALLATION_ROOT,
  SofistikEnvironmentResolver,
} = require("./environment");

let defaultProvider = null;

function provider() {
  defaultProvider ||= new SofistikDataProvider();
  return defaultProvider;
}

function getMetadata() {
  return readMetadata();
}

module.exports = {
  SofistikDataProvider,
  SofistikKeywordsContext,
  SofistikEnvironmentResolver,
  INSTALLATION_ROOT,
  getGrammarVocabulary,
  getMetadata,
  provider,
  resolveProjectTarget,
};
