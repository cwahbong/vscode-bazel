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
import { BazelWorkspaceInfo } from "../bazel";
import { IBazelCommandAdapter, IBazelCommandOptions } from "../bazel";
import { blaze_query } from "../protos";
import { BazelTargetTreeItem } from "./bazel_target_tree_item";
import { IBazelTreeItem } from "./bazel_tree_item";
import { IBazelQuerier } from "./querier";

/** A tree item representing a build package. */
export class BazelPackageTreeItem
  implements IBazelCommandAdapter, IBazelTreeItem
{
  /**
   * The array of subpackages that should be shown directly under this package
   * item.
   */
  public directSubpackages: IBazelTreeItem[] = [];

  /**
   * Initializes a new tree item with the given workspace path and package path.
   *
   * @param querier Querier for getting information inside a Bazel workspace.
   * @param workspacePath The path to the VS Code workspace folder.
   * @param packagePath The path to the build package that this item represents.
   * @param parentPackagePath The path to the build package of the tree item
   * that is this item's parent, which indicates how much of
   * {@code packagePath} should be stripped for the item's label.
   */
  constructor(
    private readonly querier: IBazelQuerier,
    private readonly workspaceInfo: BazelWorkspaceInfo,
    private readonly packagePath: string,
    private readonly parentPackagePath?: string,
  ) {}

  public mightHaveChildren(): boolean {
    return true;
  }

  public async getChildren(): Promise<IBazelTreeItem[]> {
    const queryResult = await this.querier.queryChildrenTargets(
      this.workspaceInfo,
      this.packagePath,
    );
    const targets = queryResult.target.map((target: blaze_query.ITarget) => {
      return new BazelTargetTreeItem(this.workspaceInfo, target);
    });
    return this.directSubpackages.concat(targets);
  }

  public getLabel(): string {
    if (this.parentPackagePath === undefined) {
      return this.packagePath;
    }
    // Strip off the part of the package path that came from the
    // parent item.
    const parentLength = this.parentPackagePath.length;
    // (null)
    // //a
    //
    // @repo//foo
    // @repo//foo/bar
    //
    // @repo//
    // @repo//foo
    const diffIsLeadingSlash = this.packagePath[parentLength] === "/";
    const prefixLength = diffIsLeadingSlash ? parentLength + 1 : parentLength;
    return this.packagePath.substring(prefixLength);
  }

  public getIcon(): vscode.ThemeIcon {
    return vscode.ThemeIcon.Folder;
  }

  public getTooltip(): string {
    return this.packagePath;
  }

  public getCommand(): Thenable<vscode.Command | undefined> {
    return Promise.resolve(undefined);
  }

  public getContextValue(): string {
    return "package";
  }

  public getBazelCommandOptions(): IBazelCommandOptions {
    return {
      options: [],
      targets: [this.packagePath],
      workspaceInfo: this.workspaceInfo,
    };
  }
}
