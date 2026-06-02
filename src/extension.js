"use strict";

const vscode = require("vscode");

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("markdownTablesExtended.openPreview", async (uri) => {
      const targetUri = uri || vscode.window.activeTextEditor?.document.uri;

      if (!targetUri) {
        await vscode.window.showWarningMessage("Open a Markdown file before launching the enhanced preview.");
        return;
      }

      await vscode.commands.executeCommand("markdown.showPreviewToSide", targetUri);
    })
  );

  return {
    extendMarkdownIt(md) {
      const defaultTableOpen =
        md.renderer.rules.table_open ||
        ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));

      md.renderer.rules.table_open = (tokens, idx, options, env, self) => {
        const token = tokens[idx];
        token.attrJoin("class", "mte-table");
        return defaultTableOpen(tokens, idx, options, env, self);
      };

      return md;
    }
  };
}

module.exports = {
  activate
};
