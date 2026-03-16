import * as vscode from "vscode";
import { detectWorkspace } from "./workspace";
import { StatusViewProvider } from "./statusView";

let statusProvider: StatusViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const detection = detectWorkspace(workspaceRoot);

  statusProvider = new StatusViewProvider(
    context.extensionUri,
    workspaceRoot,
    detection.packageRoot
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      StatusViewProvider.viewType,
      statusProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rennCode.initializeWorkspace", () => {
      statusProvider?.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rennCode.refreshStatus", () => {
      statusProvider?.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rennCode.repairWorkspace", () => {
      statusProvider?.refresh();
    })
  );
}

export function deactivate(): void {
  statusProvider = undefined;
}
