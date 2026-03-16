import * as vscode from "vscode";
import {
  DashboardData,
  detectWorkspace,
  getDashboardData,
  initializeWorkspace,
  repairWorkspace,
  reviewDesignFromExtension,
  approveAndFreezeDesign,
} from "./workspace";

export class StatusViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "rennCode.status";

  private _view?: vscode.WebviewView;
  private _workspaceRoot: string;
  private _packageRoot: string | null;
  private _extensionPath: string;

  constructor(
    private readonly _extensionUri: vscode.Uri,
    workspaceRoot: string,
    packageRoot: string | null,
    extensionPath: string
  ) {
    this._workspaceRoot = workspaceRoot;
    this._packageRoot = packageRoot;
    this._extensionPath = extensionPath;
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.onDidReceiveMessage(async (message) => {
      switch (message.command) {
        case "initialize":
          await this.handleInitialize();
          break;
        case "repair":
          await this.handleRepair();
          break;
        case "refresh":
          this.refresh();
          break;
        case "review-design":
          await this._handleDesignReview(
            message.artifactId,
            message.decision,
            message.summary
          );
          break;
      }
    });

    this.refresh();
  }

  public refresh(): void {
    if (!this._view) {
      return;
    }

    const detection = detectWorkspace(this._workspaceRoot, this._extensionPath);
    this._packageRoot = detection.packageRoot;

    if (!detection.initialized || !this._packageRoot) {
      this._view.webview.html = this._getEmptyStateHtml();
      return;
    }

    const data = getDashboardData(this._workspaceRoot, this._packageRoot);

    if (data.health.status === "needs_repair") {
      this._view.webview.html = this._getRepairStateHtml(data);
      return;
    }

    this._view.webview.html = this._getDashboardHtml(data);
  }

  public async handleInitialize(): Promise<void> {
    // Re-detect with extensionPath so we find the package even in empty workspaces
    const detection = detectWorkspace(this._workspaceRoot, this._extensionPath);
    this._packageRoot = detection.packageRoot;

    if (!this._packageRoot) {
      vscode.window.showErrorMessage(
        "Renn Code: Cannot find the harness package. " +
          "Ensure the extension is installed from the Renn Code package."
      );
      return;
    }

    const result = initializeWorkspace(this._workspaceRoot, this._packageRoot);
    if (result.success) {
      vscode.window.showInformationMessage(
        "Renn Code: Workspace initialized successfully."
      );
    } else {
      vscode.window.showErrorMessage(
        `Renn Code: Initialization failed — ${result.output}`
      );
    }
    this.refresh();
  }

  public async handleRepair(): Promise<void> {
    const detection = detectWorkspace(this._workspaceRoot, this._extensionPath);
    this._packageRoot = detection.packageRoot;

    if (!this._packageRoot) {
      vscode.window.showErrorMessage(
        "Renn Code: Cannot find the harness package."
      );
      return;
    }

    const result = repairWorkspace(this._workspaceRoot, this._packageRoot);
    if (result.success) {
      vscode.window.showInformationMessage(
        "Renn Code: Workspace repaired successfully."
      );
    } else {
      vscode.window.showErrorMessage(
        `Renn Code: Repair failed — ${result.output}`
      );
    }
    this.refresh();
  }

  private async _handleDesignReview(
    artifactId: string,
    decision: string,
    summary?: string
  ): Promise<void> {
    if (!this._packageRoot) {
      vscode.window.showErrorMessage("Renn Code: Cannot find the harness package.");
      return;
    }

    const reviewer = await vscode.window.showInputBox({
      prompt: "Reviewer name",
      placeHolder: "Enter your name for the review record",
    });
    if (!reviewer) {
      return;
    }

    let result;
    if (decision === "approved") {
      // Extension approval completes the full cycle: approve + freeze
      result = approveAndFreezeDesign(
        this._workspaceRoot,
        this._packageRoot,
        artifactId,
        reviewer
      );
    } else {
      result = reviewDesignFromExtension(
        this._workspaceRoot,
        this._packageRoot,
        artifactId,
        decision,
        reviewer,
        summary
      );
    }

    if (result.success) {
      const action = decision === "approved" ? "approved & frozen" : decision;
      vscode.window.showInformationMessage(
        `Renn Code: Design ${artifactId} — ${action}.`
      );
    } else {
      vscode.window.showErrorMessage(
        `Renn Code: Design review failed — ${result.output}`
      );
    }
    this.refresh();
  }

  private _getEmptyStateHtml(): string {
    const hasPackage = this._packageRoot !== null;
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 16px;
      margin: 0;
    }
    h2 { margin-top: 0; font-size: 14px; font-weight: 600; }
    p { font-size: 13px; line-height: 1.5; color: var(--vscode-descriptionForeground); }
    .btn {
      display: inline-block;
      padding: 6px 14px;
      margin-top: 12px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
    .hint {
      margin-top: 16px;
      padding: 8px;
      background: var(--vscode-textBlockQuote-background);
      border-left: 3px solid var(--vscode-textBlockQuote-border);
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h2>Renn Code</h2>
  <p>This workspace is not yet initialized as a Renn Code project.</p>
  ${
    hasPackage
      ? `<button class="btn" onclick="initialize()">Initialize Harness In This Project</button>`
      : `<p><strong>Harness package not found.</strong></p>
         <div class="hint">
           Ensure the Renn Code extension is installed from the harness package, or run
           <code>npm install ai-scrum-workflow</code> in this project.
         </div>`
  }
  <div class="hint">
    You can also run <code>node scripts/install.js</code> in the integrated terminal,
    or use the Command Palette: <strong>Renn Code: Initialize Harness In This Project</strong>.
  </div>
  <script>
    const vscode = acquireVsCodeApi();
    function initialize() {
      vscode.postMessage({ command: 'initialize' });
    }
  </script>
</body>
</html>`;
  }

  private _getRepairStateHtml(data: DashboardData): string {
    const issues = data.health.issues
      .map((i) => `<li>${escapeHtml(i)}</li>`)
      .join("");
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 16px;
      margin: 0;
    }
    h2 { margin-top: 0; font-size: 14px; font-weight: 600; }
    p { font-size: 13px; line-height: 1.5; color: var(--vscode-descriptionForeground); }
    ul { font-size: 12px; padding-left: 20px; }
    li { margin-bottom: 4px; color: var(--vscode-errorForeground); }
    .btn {
      display: inline-block;
      padding: 6px 14px;
      margin-top: 12px;
      margin-right: 8px;
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 13px;
    }
    .btn:hover { background: var(--vscode-button-hoverBackground); }
  </style>
</head>
<body>
  <h2>Workspace Needs Repair</h2>
  <p>The following issues were detected:</p>
  <ul>${issues}</ul>
  <button class="btn" onclick="repair()">Repair Workspace</button>
  <button class="btn" onclick="refresh()">Refresh</button>
  <script>
    const vscode = acquireVsCodeApi();
    function repair() { vscode.postMessage({ command: 'repair' }); }
    function refresh() { vscode.postMessage({ command: 'refresh' }); }
  </script>
</body>
</html>`;
  }

  private _getDesignSection(data: DashboardData): string {
    const artifacts = data.designArtifacts;
    if (!artifacts || artifacts.length === 0) {
      return `<div class="section">
        <div class="label">Design Artifacts</div>
        <div class="value dim">No design artifacts</div>
      </div>`;
    }

    const rows = artifacts.map((a) => {
      const stateClass = a.state === "pending_review" ? "review" : a.state === "frozen" ? "done" : "";
      const actions = a.state === "pending_review"
        ? `<button class="btn-sm" onclick="reviewDesign('${a.id}', 'approved')">Approve &amp; Freeze</button>
           <button class="btn-sm" onclick="reviewDesign('${a.id}', 'changes_requested')">Request Changes</button>`
        : "";
      return `<div class="design-row">
        <span class="design-id">${escapeHtml(a.id)}</span>
        <span class="count ${stateClass}">${a.state}</span>
        <span class="design-path">${escapeHtml(a.file_path)}</span>
        <span class="design-rev">rev ${a.revision}</span>
        ${actions}
      </div>`;
    }).join("");

    return `<div class="section">
      <div class="label">Design Artifacts</div>
      ${rows}
    </div>`;
  }

  private _getDashboardHtml(data: DashboardData): string {
    const product = data.product;
    const phase = data.phase;
    const sprint = data.sprint;
    const tc = data.taskCounts;

    const productName = product ? escapeHtml(product.name) : "No product";
    const productStatus = product ? product.status : "—";
    const currentPhase = phase ? phase.phase : "—";
    const nextCommand = product?.next_command || "—";

    const sprintSection = sprint
      ? `<div class="section">
           <div class="label">Active Sprint</div>
           <div class="value">${escapeHtml(sprint.name)}</div>
           <div class="sublabel">${escapeHtml(sprint.goal || "")}</div>
         </div>
         <div class="section">
           <div class="label">Tasks</div>
           <div class="counts">
             <span class="count ready">${tc.ready} ready</span>
             <span class="count progress">${tc.in_progress} active</span>
             <span class="count review">${tc.in_review} review</span>
             <span class="count blocked">${tc.blocked} blocked</span>
             <span class="count done">${tc.done} done</span>
           </div>
         </div>`
      : `<div class="section">
           <div class="label">Sprint</div>
           <div class="value dim">No active sprint</div>
         </div>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: var(--vscode-font-family);
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      padding: 16px;
      margin: 0;
    }
    h2 { margin-top: 0; font-size: 14px; font-weight: 600; }
    .section { margin-bottom: 14px; }
    .label {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 2px;
    }
    .value { font-size: 13px; font-weight: 500; }
    .sublabel { font-size: 12px; color: var(--vscode-descriptionForeground); }
    .dim { opacity: 0.6; }
    .next-cmd {
      display: inline-block;
      padding: 2px 8px;
      background: var(--vscode-badge-background);
      color: var(--vscode-badge-foreground);
      border-radius: 10px;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family);
    }
    .counts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .count {
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--vscode-textBlockQuote-background);
    }
    .btn {
      display: inline-block;
      padding: 4px 10px;
      margin-top: 12px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 12px;
    }
    .btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .btn-sm {
      padding: 2px 6px;
      margin-left: 4px;
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
      border: none;
      border-radius: 2px;
      cursor: pointer;
      font-size: 11px;
    }
    .btn-sm:hover { background: var(--vscode-button-secondaryHoverBackground); }
    .design-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;
      flex-wrap: wrap;
      font-size: 12px;
    }
    .design-id { font-family: var(--vscode-editor-font-family); font-weight: 500; }
    .design-path { color: var(--vscode-descriptionForeground); flex: 1; }
    .design-rev { color: var(--vscode-descriptionForeground); font-size: 11px; }
    hr {
      border: none;
      border-top: 1px solid var(--vscode-widget-border);
      margin: 14px 0;
    }
  </style>
</head>
<body>
  <h2>${productName}</h2>

  <div class="section">
    <div class="label">Status</div>
    <div class="value">${productStatus}</div>
  </div>

  <div class="section">
    <div class="label">Phase</div>
    <div class="value">${currentPhase}</div>
  </div>

  <div class="section">
    <div class="label">Next Command</div>
    <div class="value"><span class="next-cmd">${escapeHtml(nextCommand)}</span></div>
  </div>

  <hr>

  ${sprintSection}

  <hr>

  ${this._getDesignSection(data)}

  <hr>
  <button class="btn" onclick="refresh()">Refresh</button>

  <script>
    const vscode = acquireVsCodeApi();
    function refresh() { vscode.postMessage({ command: 'refresh' }); }
    function reviewDesign(artifactId, decision) {
      const summary = decision === 'changes_requested'
        ? prompt('What changes are needed?')
        : undefined;
      if (decision === 'changes_requested' && !summary) return;
      vscode.postMessage({ command: 'review-design', artifactId, decision, summary });
    }
  </script>
</body>
</html>`;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
