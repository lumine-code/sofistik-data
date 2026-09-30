const { getGrammarVocabulary, readMetadata } = require("./catalog");
const { SofistikDataProvider, SofistikKeywordsContext } = require("./provider");
const { resolveProjectTarget } = require("./project-target");

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
  getGrammarVocabulary,
  getMetadata,
  provider,
  resolveProjectTarget,
};
