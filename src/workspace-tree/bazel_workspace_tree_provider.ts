// Copyright 2018 The Bazel Authors. All rights reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import * as vscode from "vscode";
import { IBazelTreeItem } from "./bazel_tree_item";
import { BazelWorkspaceFolderTreeItem } from "./bazel_workspace_folder_tree_item";
import { Resources } from "../extension/resources";
import {
  IBazelWorkspaceTreeQuerier,
  ProcessBazelQuerier,
} from "./bazel_workspace_tree_querier";
import { assert } from "../assert";

/**
 * Provides a tree of Bazel build packages and targets for the VS Code explorer
 * interface.
 */
export class BazelWorkspaceTreeProvider
  implements vscode.TreeDataProvider<IBazelTreeItem>, vscode.Disposable
{
  /** Fired when BUILD files change in the workspace. */
  private readonly onDidChangeTreeDataEmitter =
    new vscode.EventEmitter<IBazelTreeItem | void>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  /** The cached toplevel items. */
  private workspaceFolderTreeItems: IBazelTreeItem[] | undefined;

  private disposables: vscode.Disposable[] = [];

  public static async fromExtensionContext(
    context: vscode.ExtensionContext,
  ): Promise<BazelWorkspaceTreeProvider> {
    const provider = new BazelWorkspaceTreeProvider(
      Resources.fromExtensionContext(context),
      new ProcessBazelQuerier(),
    );
    await provider.refresh(vscode.workspace.workspaceFolders);
    return provider;
  }

  /**
   * Initializes a new tree provider with the given extension context.
   *
   * @param querier The interface providing the `bazel query` results.
   */
  constructor(
    private readonly resources: Resources,
    private readonly querier: IBazelWorkspaceTreeQuerier,
  ) {
    const buildFilesWatcher = vscode.workspace.createFileSystemWatcher(
      "**/{BUILD,BUILD.bazel}",
      false,
      false,
      false,
    );
    this.disposables.push(
      buildFilesWatcher,
      buildFilesWatcher.onDidChange(() =>
        this.onBuildFilesChanged(vscode.workspace.workspaceFolders),
      ),
      buildFilesWatcher.onDidCreate(() =>
        this.onBuildFilesChanged(vscode.workspace.workspaceFolders),
      ),
      buildFilesWatcher.onDidDelete(() =>
        this.onBuildFilesChanged(vscode.workspace.workspaceFolders),
      ),
      vscode.workspace.onDidChangeWorkspaceFolders(() =>
        this.refresh(vscode.workspace.workspaceFolders),
      ),
    );
  }

  public async getChildren(
    element?: IBazelTreeItem,
  ): Promise<IBazelTreeItem[]> {
    // If we're given an element, we're not asking for the top-level elements,
    // so just delegate to that element to get its children.
    if (element) {
      return element.getChildren();
    }

    // Assuming the extension should call refresh at least once.
    assert(this.workspaceFolderTreeItems !== undefined);

    // If the user has a workspace open and there's only one folder in it,
    // then don't show the workspace folder; just show its packages at the top
    // level.
    if (this.workspaceFolderTreeItems.length === 1) {
      const folderItem = this.workspaceFolderTreeItems[0];
      return folderItem.getChildren();
    }

    // If the user has multiple or no workspace folders open, then show them as
    // individual top level items.
    return this.workspaceFolderTreeItems;
  }

  public getTreeItem(element: IBazelTreeItem): vscode.TreeItem {
    const label = element.getLabel();
    const collapsibleState = element.mightHaveChildren()
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.None;

    const treeItem = new vscode.TreeItem(label, collapsibleState);
    treeItem.contextValue = element.getContextValue();
    treeItem.iconPath = element.getIcon();
    treeItem.tooltip = element.getTooltip();
    treeItem.command = element.getCommand();
    return treeItem;
  }

  /** Forces a re-query and refresh of the tree's contents. */
  public async refresh(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
  ): Promise<void> {
    await this.updateWorkspaceFolderTreeItems(workspaceFolders);
    this.onDidChangeTreeDataEmitter.fire();
  }

  /**
   * Called to update the tree when a BUILD file is created, deleted, or
   * changed.
   *
   * @param uri The file system URI of the file that changed.
   */
  private async onBuildFilesChanged(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
  ) {
    // TODO(allevato): Look into firing the event only for tree items that are
    // affected by the change.
    return this.refresh(workspaceFolders);
  }

  private async createWorkspaceFolderTreeItem(
    workspaceFolder: vscode.WorkspaceFolder,
  ): Promise<IBazelTreeItem | undefined> {
    const workspaceInfo = await this.querier.queryWorkspace(workspaceFolder);
    if (workspaceInfo === undefined) {
      return undefined;
    }
    return new BazelWorkspaceFolderTreeItem(
      this.resources,
      this.querier,
      workspaceInfo,
    );
  }

  private async createWorkspaceFolderTreeItems(
    workspaceFolders: readonly vscode.WorkspaceFolder[],
  ): Promise<IBazelTreeItem[]> {
    const maybeWorkspaceFolderTreeItems = await Promise.all(
      workspaceFolders.map((workspaceFolder) =>
        this.createWorkspaceFolderTreeItem(workspaceFolder),
      ),
    );
    return maybeWorkspaceFolderTreeItems.filter(
      (folder) => folder !== undefined,
    );
  }

  /** Refresh the cached BazelWorkspaceFolderTreeItems. */
  private async updateWorkspaceFolderTreeItems(
    workspaceFolders?: readonly vscode.WorkspaceFolder[],
  ): Promise<void> {
    this.workspaceFolderTreeItems = await this.createWorkspaceFolderTreeItems(
      workspaceFolders ?? [],
    );

    // Update other UI components based on the context value for existance of
    // Bazel workspace.
    const haveBazelWorkspace = this.workspaceFolderTreeItems.length !== 0;
    void vscode.commands.executeCommand(
      "setContext",
      "bazel.haveWorkspace",
      haveBazelWorkspace,
    );
  }

  public dispose() {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
