import * as vscode from "vscode";
import { detectWorkspace } from "./workspace";
import { StatusViewProvider } from "./statusView";

let statusProvider: StatusViewProvider | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    return;
  }

  const detection = detectWorkspace(workspaceRoot, context.extensionPath);

  statusProvider = new StatusViewProvider(
    context.extensionUri,
    workspaceRoot,
    detection.packageRoot,
    context.extensionPath
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      StatusViewProvider.viewType,
      statusProvider
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rennCode.initializeWorkspace", async () => {
      await statusProvider?.handleInitialize();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rennCode.refreshStatus", () => {
      statusProvider?.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("rennCode.repairWorkspace", async () => {
      await statusProvider?.handleRepair();
    })
  );
}

export function deactivate(): void {
  statusProvider = undefined;
}
