"use strict";

const vscode = require("vscode");

const FAST_VIEW_REFRESH_DELAY = 400;

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand("markdownTablesExtended.openPreview", async (uri) => {
      const targetUri = uri || vscode.window.activeTextEditor?.document.uri;

      if (!targetUri) {
        await vscode.window.showWarningMessage("Open a Markdown file before launching the enhanced preview.");
        return;
      }

      await vscode.commands.executeCommand("markdown.showPreviewToSide", targetUri);
    }),
    vscode.commands.registerCommand("markdownTablesExtended.openFastTableView", async (uri) => {
      await openFastTableView(context, uri);
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

async function openFastTableView(context, uri) {
  const document = await getMarkdownDocument(uri);

  if (!document) {
    await vscode.window.showWarningMessage("Open a Markdown file before launching the fast table view.");
    return;
  }

  const tables = extractMarkdownTables(document.getText());

  if (!tables.length) {
    await vscode.window.showInformationMessage("No Markdown table found in this file.");
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    "markdownTablesExtended.fastTableView",
    "Fast Table View",
    vscode.ViewColumn.Beside,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "media")]
    }
  );

  panel.webview.html = getFastTableHtml(context, panel.webview, document, tables);
  watchFastTableDocument(panel, document);
}

async function getMarkdownDocument(uri) {
  if (uri) {
    return vscode.workspace.openTextDocument(uri);
  }

  const activeDocument = vscode.window.activeTextEditor?.document;
  if (activeDocument?.languageId === "markdown") {
    return activeDocument;
  }

  return undefined;
}

function extractMarkdownTables(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  let index = 0;

  while (index < lines.length - 1) {
    if (!isPotentialTableLine(lines[index]) || !isSeparatorLine(lines[index + 1])) {
      index += 1;
      continue;
    }

    const headers = splitMarkdownRow(lines[index]);
    const rows = [];
    const startLine = index + 1;
    index += 2;

    while (index < lines.length && isPotentialTableLine(lines[index])) {
      const cells = splitMarkdownRow(lines[index]);
      rows.push(normalizeRowLength(cells, headers.length));
      index += 1;
    }

    tables.push({
      title: "Table line " + startLine,
      startLine,
      headers,
      rows
    });
  }

  return tables;
}

function isPotentialTableLine(line) {
  return line.includes("|") && line.trim().length > 0;
}

function isSeparatorLine(line) {
  const cells = splitMarkdownRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function splitMarkdownRow(line) {
  const trimmed = line.trim();
  const withoutOuterPipes = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  const cells = [];
  let current = "";
  let escaped = false;

  for (const char of withoutOuterPipes) {
    if (escaped) {
      current += char;
      escaped = false;
    } else if (char === "\\") {
      escaped = true;
    } else if (char === "|") {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current.trim());
  return cells;
}

function normalizeRowLength(cells, length) {
  const row = cells.slice(0, length);
  while (row.length < length) {
    row.push("");
  }
  return row;
}

function getFastTableHtml(context, webview, document, tables) {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "fast-view.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "media", "fast-view.css"));
  const nonce = getNonce();
  const payload = escapeHtml(JSON.stringify({
    fileName: document.fileName,
    tables
  }));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <link rel="stylesheet" href="${styleUri}">
    <title>Fast Table View</title>
  </head>
  <body>
    <script id="mte-data" type="application/json">${payload}</script>
    <main class="app">
      <header class="toolbar">
        <select id="tableSelect" aria-label="Table"></select>
        <span id="summary"></span>
      </header>
      <section class="gridShell">
        <div id="header" class="header"></div>
        <div id="viewport" class="viewport">
          <div id="spacer" class="spacer"></div>
          <div id="rows" class="rows"></div>
        </div>
      </section>
    </main>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}

function watchFastTableDocument(panel, document) {
  let refreshTimer;

  const refresh = () => {
    const latestDocument = vscode.workspace.textDocuments.find((candidate) => candidate.uri.toString() === document.uri.toString());
    if (!latestDocument) {
      return;
    }

    panel.webview.postMessage({
      type: "tablesUpdated",
      fileName: latestDocument.fileName,
      tables: extractMarkdownTables(latestDocument.getText())
    });
  };

  const changeSubscription = vscode.workspace.onDidChangeTextDocument((event) => {
    if (event.document.uri.toString() !== document.uri.toString()) {
      return;
    }

    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(refresh, FAST_VIEW_REFRESH_DELAY);
  });

  const saveSubscription = vscode.workspace.onDidSaveTextDocument((savedDocument) => {
    if (savedDocument.uri.toString() === document.uri.toString()) {
      clearTimeout(refreshTimer);
      refresh();
    }
  });

  const closeSubscription = vscode.workspace.onDidCloseTextDocument((closedDocument) => {
    if (closedDocument.uri.toString() === document.uri.toString()) {
      clearTimeout(refreshTimer);
    }
  });

  panel.onDidDispose(() => {
    clearTimeout(refreshTimer);
    changeSubscription.dispose();
    saveSubscription.dispose();
    closeSubscription.dispose();
  });
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function getNonce() {
  let text = "";
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
}

module.exports = {
  activate
};
