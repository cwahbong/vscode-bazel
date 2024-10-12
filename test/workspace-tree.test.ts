import * as assert from "assert";
import * as vscode from "vscode";
import { Resources } from "../src/extension/resources";
import { BazelWorkspaceInfo } from "../src/bazel";
import { blaze_query } from "../src/protos";
import {
  BazelWorkspaceTreeProvider,
  IBazelWorkspaceTreeQuerier,
} from "../src/workspace-tree";

class FakeBazelQuerier implements IBazelWorkspaceTreeQuerier {
  constructor(
    private readonly packages: string[],
    private readonly targets: Map<string, blaze_query.IQueryResult>,
  ) {}

  queryWorkspace(
    workspaceFolder: vscode.WorkspaceFolder,
  ): Thenable<BazelWorkspaceInfo | undefined> {
    // Assuming query from root for simplest test case. (single root)
    return Promise.resolve(
      new BazelWorkspaceInfo(workspaceFolder.uri.fsPath, workspaceFolder),
    );
  }

  queryPackages(workspaceInfo: BazelWorkspaceInfo): Thenable<string[]> {
    void workspaceInfo;
    return Promise.resolve(this.packages);
  }

  queryChildrenTargets(
    workspaceInfo: BazelWorkspaceInfo,
    packagePath: string,
  ): Thenable<blaze_query.IQueryResult> {
    void workspaceInfo;
    return Promise.resolve(this.targets.get(packagePath));
  }
}

function fakeWorkspaceFolder(path: string): vscode.WorkspaceFolder {
  const uri = vscode.Uri.file(path);
  return {
    uri,
    name: path,
    index: 0,
  };
}

async function workspaceTreeProviderForTest(
  querier: IBazelWorkspaceTreeQuerier,
  workspaceFolders: vscode.WorkspaceFolder[],
): Promise<BazelWorkspaceTreeProvider> {
  const resources = new Resources("fake");
  const provider = new BazelWorkspaceTreeProvider(resources, querier);
  await provider.refresh(workspaceFolders);
  return provider;
}

describe("The Bazel workspace tree provider", () => {
  it("Returns nothing on empty workspace folders", async () => {
    const querier = new FakeBazelQuerier([], new Map());
    const workspaceFolders: vscode.WorkspaceFolder[] = [];
    const provider = await workspaceTreeProviderForTest(
      querier,
      workspaceFolders,
    );

    const topChildren = await provider.getChildren();
    assert.deepStrictEqual(topChildren, []);
  });

  it("Flatten on single workspace folder", async () => {
    const querier = new FakeBazelQuerier(
      ["//a"],
      new Map([
        ["", { target: [] }],
        ["//a", { target: [] }],
      ]),
    );
    const workspaceFolders: vscode.WorkspaceFolder[] = [
      fakeWorkspaceFolder("fake/path"),
    ];
    const provider = await workspaceTreeProviderForTest(
      querier,
      workspaceFolders,
    );

    const topChildren = await provider.getChildren();
    assert.equal(topChildren[0].getLabel(), "//a");
  });

  it("Not flatten on 2 workspace folders", async () => {
    const querier = new FakeBazelQuerier([], new Map([["", { target: [] }]]));
    const workspaceFolders: vscode.WorkspaceFolder[] = [
      fakeWorkspaceFolder("fake/path0"),
      fakeWorkspaceFolder("fake/path1"),
    ];
    const provider = await workspaceTreeProviderForTest(
      querier,
      workspaceFolders,
    );

    const topChildren = await provider.getChildren();
    assert.equal(topChildren[0].getLabel(), "fake/path0");
    assert.equal(topChildren[1].getLabel(), "fake/path1");
  });

  it("Can handle root package", async () => {
    const querier = new FakeBazelQuerier(
      ["//", "//a"],
      new Map([
        ["", { target: [] }],
        ["//", { target: [] }],
        ["//a", { target: [] }],
      ]),
    );
    const workspaceFolders: vscode.WorkspaceFolder[] = [
      fakeWorkspaceFolder("fake/path"),
    ];
    const provider = await workspaceTreeProviderForTest(
      querier,
      workspaceFolders,
    );

    const topChildren = await provider.getChildren();
    const root = topChildren[0];
    assert.equal(root.getLabel(), "//");
    const rootChildren = await root.getChildren();
    const a = rootChildren[0];
    assert.equal(a.getLabel(), "a");
  });

  it("Skips non-package folders", async () => {
    const querier = new FakeBazelQuerier(
      ["//a", "//a/b/c"],
      new Map([
        ["", { target: [] }],
        ["//a", { target: [] }],
        ["//a/b/c", { target: [] }],
      ]),
    );
    const workspaceFolders: vscode.WorkspaceFolder[] = [
      fakeWorkspaceFolder("fake/path"),
    ];
    const provider = await workspaceTreeProviderForTest(
      querier,
      workspaceFolders,
    );

    const topChildren = await provider.getChildren();
    const a = topChildren[0];
    assert.equal(a.getLabel(), "//a");
    const aChildren = await topChildren[0].getChildren();
    const bc = aChildren[0];
    assert.equal(bc.getLabel(), "b/c");
  });

  // TODO query target test cases.
});
