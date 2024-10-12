// Copyright 2024 The Bazel Authors. All rights reserved.
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

import {
  BazelQuery,
  BazelWorkspaceInfo,
  labelFromQueriedToAbsolute,
} from "../bazel";
import {
  getDefaultBazelExecutablePath,
  getDefaultQueryExpression,
} from "../extension/configuration";
import { blaze_query } from "../protos";

/**
 * Bazel querier for workspace tree.
 *
 * The interface defined here is to specifying the operation required for a
 * workspace tree instead of all bazel query syntax and options supported.
 */
export interface IBazelQuerier {
  /**
   * Queries all packages in a workspace folder.
   *
   * @param workspaceInfo the Bazel workspace info.
   * @returns package name queries in absolute apparent paths.
   */
  queryPackages(workspaceInfo: BazelWorkspaceInfo): Thenable<string[]>;

  /**
   * Queries all children targets of a Bazel package.
   *
   * @param workspaceInfo the Bazel workspace info.
   * @param packagePath the Bazel package path. Could be either in absolute label or
   * relative to the opening vscode workspace in `workspaceInfo`.
   */
  queryChildrenTargets(
    workspaceInfo: BazelWorkspaceInfo,
    packagePath: string,
  ): Thenable<blaze_query.IQueryResult>;
}

/**
 * Calling Bazel process for the queries.
 */
export class ProcessBazelQuerier implements IBazelQuerier {
  async queryPackages(workspaceInfo: BazelWorkspaceInfo): Promise<string[]> {
    const packages = await new BazelQuery(
      getDefaultBazelExecutablePath(),
      workspaceInfo.workspaceFolder.uri.fsPath,
    ).queryPackages(getDefaultQueryExpression());
    return packages.map(labelFromQueriedToAbsolute);
  }

  async queryChildrenTargets(
    workspaceInfo: BazelWorkspaceInfo,
    packagePath: string,
  ): Promise<blaze_query.IQueryResult> {
    // Getting all rules without files, thus using :all instead of :*.
    const query = `${packagePath}:all`;
    return new BazelQuery(
      getDefaultBazelExecutablePath(),
      workspaceInfo.workspaceFolder.uri.fsPath,
    ).queryTargets(query, {
      ignoresErrors: true,
      sortByRuleName: true,
    });
  }
}
