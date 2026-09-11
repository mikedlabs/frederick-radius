// Webpack's synchronous loader API uses CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ts = require("typescript");

module.exports = function fairViewerTypeScriptLoader(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2020,
      module: ts.ModuleKind.ESNext,
      isolatedModules: true,
    },
    fileName: this.resourcePath,
  }).outputText;
};
