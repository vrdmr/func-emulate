# fnx setup (Agent/MCP) & fnx chat — 実装仕様書

> **日付**: 2026-03-09  
> **ベース仕様**: F20 エージェントモード  
> **スコープ**: `fnx setup --module agent`, `fnx setup --module mcp`, `fnx chat`  
> **デモ目標**: 本日中に動作する最小デモ（フル機能は不要）

---

## 目次

1. [F20 からの変更点](#1-f20-からの変更点)
2. [Manifest ファイル設計](#2-manifest-ファイル設計)
3. [fnx setup —— Agent/MCP モジュール](#3-fnx-setup--agentmcp-モジュール)
4. [fnx chat —— エージェントランチャー](#4-fnx-chat--エージェントランチャー)
5. [初期スキル提案](#5-初期スキル提案)
6. [Manvir の作業との共存設計](#6-manvir-の作業との共存設計)
7. [実装方法の選択と理由](#7-実装方法の選択と理由)
8. [デモスコープ（今日の目標）](#8-デモスコープ今日の目標)
9. [将来の拡張](#9-将来の拡張)

---

## 1. F20 からの変更点

F20 仕様を基盤とするが、以下の点を変更・拡張する。

### 1.1 スキル配置パスの更新

**問題**: F20 ではエージェントごとに固定パス（`.github/copilot-instructions.md`, `.cursor/rules/`, `.claude/`）を直接書き出す設計だった。agent-workspace-specs の調査により、**skills.sh エコシステムの `.agents/skills/` がユニバーサルディレクトリ**として 10+ エージェントで共有されていることが判明。

**変更**: スキルの配置先を **Manifest のエージェントマッピングテーブル**で動的に解決する。

| カテゴリ | F20 の設計 | 本仕様の設計 |
|---------|-----------|-------------|
| Skills | 各エージェント固有パスにコピー | `.agents/skills/` に実体 → 各エージェントへ symlink |
| Instructions | `.github/copilot-instructions.md` 等を直接生成 | Manifest テーブルに従い、検出エージェントに応じて生成 |
| MCP | `.vscode/mcp.json` のみ | 検出エージェントの MCP 設定ファイルに出力 |

### 1.2 Agent Definition の追加

**問題**: F20 では Agent Definition（`.github/agents/*.agent.md`）が考慮されていなかった。

**変更**: Manifest に `agentDefinitions` セクションを追加。`fnx setup --module agent` で `.github/agents/fnx.agent.md` 等を生成し、`@fnx` でカスタムエージェントを呼び出せるようにする。

### 1.3 ワンコマンド適用

**問題**: MCP を入れて、スキルを入れて、instructions を入れて…と複数ステップが必要。

**変更**: `fnx setup --module agent` で **Skills + Instructions + Agent Definitions を一括適用**。`--module mcp` で MCP 設定を一括適用。`fnx setup --all` で全部。

### 1.4 エージェント検出の拡張

**問題**: F20 の自動検出は CLI エージェント（`which copilot` 等）のみ。GUI エージェント（VSCode Copilot、Cursor IDE）は検出されない。

**変更**: 検出戦略を 3 層に拡張:

| 検出レイヤー | 対象 | 方法 |
|-------------|------|------|
| CLI バイナリ | Claude Code, Codex, Amp 等 | `which` / `where.exe` |
| IDE 設定ファイル | VSCode+Copilot, Cursor | `.vscode/`, `.cursor/` の存在確認 |
| 明示的指定 | 全エージェント | `--agent copilot,claude,cursor` フラグ |

検出結果は必ずユーザーに表示し、確認を求める。

---

## 2. Manifest ファイル設計

### 2.1 設計方針

Loom の `manifest.yaml` を参考にしつつ、fnx 固有のニーズ（SKU 検出、Functions ドメイン）を反映した汎用的な形式を定義する。

**選択理由**: 
- Loom 形式の `$ref` パターン（外部ファイル参照）はモジュール性に優れる
- YAML は人間が読み書きしやすく、JSON より記述量が少ない
- Loom との将来的な相互運用性を考慮

### 2.2 Manifest スキーマ

```yaml
# fnx-agent-manifest.yaml
version: "1.0.0"

manifest:
  id: azure-functions-agent
  name: "Azure Functions Agent Workspace"
  description: "Skills, MCP, instructions for Azure Functions development"
  author: "azure-functions-team"
  tags: [azure-functions, serverless, fnx]
  updated: "2026-03-09"

# ──── エージェント別パスマッピング ────
# skills.sh + 独自調査に基づく正確なパスマッピング
agentPaths:
  # .agents/skills/ を共有するエージェント群
  shared:
    projectSkills: ".agents/skills"
    agents:
      - github-copilot
      - cursor
      - codex
      - cline
      - gemini-cli
      - opencode
      - amp
  
  # 固有パスを持つエージェント
  custom:
    claude-code:
      projectSkills: ".claude/skills"
      instructions: ".claude/CLAUDE.md"           # append mode
      mcp: ".claude/settings.json"                # mcpServers key
    github-copilot:
      instructions: ".github/copilot-instructions.md"
      scopedInstructions: ".github/instructions/"  # *.instructions.md
      agentDefs: ".github/agents/"                 # *.agent.md
      prompts: ".github/prompts/"                  # *.prompt.md
      mcp: ".vscode/mcp.json"                     # servers key
    cursor:
      rules: ".cursor/rules/"                      # *.mdc
      mcp: ".cursor/mcp.json"
    codex:
      instructions: "AGENTS.md"
      mcp: "codex-mcp.json"
    windsurf:
      projectSkills: ".windsurf/skills"
      mcp: "~/.codeium/windsurf/mcp_config.json"  # global only

# ──── コンテンツ定義 ────
contents:
  # Skills（SKILL.md ファイル群）
  skills:
    - id: fnx-diagnostics
      name: "fnx Diagnostics"
      description: "fnx start の問題診断、エラー解決、ログ分析"
      file: skills/fnx-diagnostics/SKILL.md
    
    - id: fnx-best-practices
      name: "Azure Functions Best Practices"
      description: "SKU 別のベストプラクティス、パフォーマンス、セキュリティガイダンス"
      file: skills/fnx-best-practices/SKILL.md
    
    - id: fnx-create-function
      name: "Create Azure Function"
      description: "fnx テンプレートを使った新規関数作成ワークフロー"
      file: skills/fnx-create-function/SKILL.md
    
    - id: fnx-intro
      name: "fnx Introduction"
      description: "fnx の機能紹介、インストール済みスキル一覧、使い方ガイド"
      file: skills/fnx-intro/SKILL.md
    
    - id: fnx-feedback
      name: "fnx Feedback"
      description: "会話履歴から Issue を生成して報告するフィードバックスキル"
      file: skills/fnx-feedback/SKILL.md

  # Instructions（エージェント共通の指示）
  instructions:
    - id: functions-general
      description: "Azure Functions 開発の基本ガイダンス"
      file: instructions/functions-general.md
      # 以下のテンプレート変数がプロジェクト検出から注入される
      variables:
        - runtime       # node, python, dotnet-isolated, java
        - sku           # flex, premium, dedicated
        - programmingModel  # v4, v2, isolated
        - functions     # 検出された関数のリスト

  # MCP サーバー定義
  mcp:
    - id: fnx-templates
      name: "fnx Templates MCP"
      description: "Azure Functions テンプレートの検出と足場生成"
      command: "npx"
      args: ["manvir-templates-mcp-server"]
      # 将来: Azure MCP Server (microsoft/mcp) に移行
      # command: "npx"
      # args: ["@azure/mcp-server"]
    
    - id: fnx-debug
      name: "fnx Debug MCP"
      description: "実行中の Functions ホストのデバッグと可観測性"
      command: "node"
      args: ["fnx/bin/fnx", "start", "--mcp-port", "9100"]
      optional: true  # fnx start 実行時のみ有効

  # Agent Definitions（GitHub Copilot 向け）
  agentDefinitions:
    - id: fnx-agent
      name: "fnx"
      description: "Azure Functions 開発エキスパート"
      file: agents/fnx.agent.md

# ──── プロジェクト検出ルール ────
detection:
  # 検出優先度順に評価
  rules:
    - name: "Azure Functions (Node.js)"
      match:
        files: ["host.json", "package.json"]
        content:
          "package.json": "@azure/functions"
      result:
        runtime: node
        programmingModel: v4
    
    - name: "Azure Functions (Python)"
      match:
        files: ["host.json", "requirements.txt"]
        content:
          "requirements.txt": "azure-functions"
      result:
        runtime: python
        programmingModel: v2
    
    - name: "Azure Functions (.NET)"
      match:
        files: ["host.json"]
        glob: "*.csproj"
      result:
        runtime: dotnet-isolated
    
    - name: "Azure Functions (Java)"
      match:
        files: ["host.json", "pom.xml"]
      result:
        runtime: java
  
  # SKU の検出（app-config.yaml → local.settings.json → default）
  sku:
    sources:
      - file: "app-config.yaml"
        path: "local.targetSku"
      - file: "local.settings.json"
        path: "Values.FUNCTIONS_WORKER_RUNTIME"  # runtime hint
    default: flex
```

### 2.3 Manifest の配置戦略

| 段階 | ソース | 説明 |
|------|-------|------|
| **デモ（今日）** | ローカルバンドル | fnx パッケージ内の `manifests/` に同梱 |
| **短期** | GitHub リポジトリ | `vrdmr/func-emulate` の `manifests/` から raw URL で取得 |
| **中期** | CDN + GitHub | CDN にキャッシュ付きで配置。GitHub がソースオブトゥルース |
| **長期** | Loom レジストリ統合 | `loom registry add fnx <url>` で Loom からもインストール可能 |

**選択理由**: ローカルバンドルからスタートすることで、今日中にデモが動く。将来のリモート取得は `profile-resolver.js` の既存パターン（URL → キャッシュ → バンドルフォールバック）を再利用する。

---

## 3. fnx setup —— Agent/MCP モジュール

### 3.1 全体フロー

```
$ fnx setup

🔍 プロジェクトを検出中...
  ├── host.json ✓
  ├── package.json → @azure/functions 4.x (Node.js v4 モデル)
  ├── 3 つの関数を検出: httpTrigger, processQueue, timerCleanup
  ├── SKU: flex (app-config.yaml より)
  └── Runtime: Node.js 20

🤖 コーディングエージェントを検出中...
  ✓ GitHub Copilot (VSCode) — .vscode/ を検出
  ✓ Claude Code — claude コマンドを検出
  ✗ Cursor — 未検出
  ✗ Codex — 未検出

何を追加しますか？
  ◉ Agent（Skills + Instructions + Agent Definitions）
  ◉ MCP 設定
  ◯ CI/CD パイプライン（未実装）
  ◯ Infrastructure as Code（未実装）

[スペースで切替、Enter で確定]
```

### 3.2 `fnx setup --module agent` の動作

#### Step 1: プロジェクト検出

```javascript
// lib/setup/detect.js
async function detectProject(appPath) {
  return {
    runtime: 'node',           // host.json + package.json から
    programmingModel: 'v4',    // @azure/functions バージョンから
    sku: 'flex',               // app-config.yaml → local.settings.json → default
    functions: [               // src/functions/ のスキャンから
      { name: 'httpTrigger', type: 'httpTrigger' },
      { name: 'processQueue', type: 'queueTrigger' },
    ],
    language: 'typescript',    // tsconfig.json の存在から
  };
}
```

#### Step 2: エージェント検出

```javascript
// lib/setup/agent-detect.js
async function detectAgents() {
  const agents = [];
  
  // CLI バイナリ検出
  for (const [name, cmd] of CLI_AGENTS) {
    if (await commandExists(cmd)) agents.push({ name, type: 'cli' });
  }
  
  // IDE 設定ファイル検出
  if (await fileExists('.vscode/settings.json') || await fileExists('.vscode/')) {
    agents.push({ name: 'github-copilot', type: 'ide' });
  }
  if (await fileExists('.cursor/')) {
    agents.push({ name: 'cursor', type: 'ide' });
  }
  
  return agents;
}

const CLI_AGENTS = [
  ['claude-code', 'claude'],
  ['codex', 'codex'],
  ['amp', 'amp'],
  ['gemini-cli', 'gemini'],
  ['aider', 'aider'],
];
```

#### Step 3: コンテンツの適用

検出されたエージェントに応じて、Manifest の `agentPaths` テーブルを参照し、正しいパスにファイルを配置。

```
# GitHub Copilot が検出された場合:
.agents/skills/fnx-diagnostics/SKILL.md          ← スキル実体
.agents/skills/fnx-best-practices/SKILL.md
.agents/skills/fnx-create-function/SKILL.md
.agents/skills/fnx-intro/SKILL.md
.agents/skills/fnx-feedback/SKILL.md
.github/copilot-instructions.md                   ← Instructions (テンプレート変数展開済み)
.github/agents/fnx.agent.md                       ← Agent Definition
AGENTS.md                                         ← 汎用 Instructions

# Claude Code も検出された場合（追加）:
.claude/skills/ → .agents/skills/ への symlink     ← symlink
.claude/CLAUDE.md に Functions セクションを追記       ← append mode
```

### 3.3 `fnx setup --module mcp` の動作

```
# GitHub Copilot (VSCode) が検出された場合:
.vscode/mcp.json に以下を追加（既存があればマージ）:
{
  "servers": {
    "fnx-templates": {
      "command": "npx",
      "args": ["manvir-templates-mcp-server"],
      "description": "Azure Functions テンプレートの検出と足場生成"
    }
  }
}

# Claude Code が検出された場合:
.claude/settings.json の mcpServers に追加（既存があればマージ）:
{
  "mcpServers": {
    "fnx-templates": {
      "command": "npx",
      "args": ["manvir-templates-mcp-server"]
    }
  }
}

# Cursor が検出された場合:
.cursor/mcp.json に追加
```

### 3.4 CLI インターフェース

```
fnx setup [options]

Options:
  --module <name>        特定のモジュールのみ: agent, mcp, ci, iac, docker
  --agent <agents...>    エージェント指定（自動検出スキップ）: copilot, claude, cursor, codex
  --all                  全モジュールを適用（プロンプトなし）
  --non-interactive      デフォルト値を使用
  --force                既存ファイルを上書き
  --manifest <path|url>  カスタム Manifest を使用（デフォルト: バンドル版）
  --dry-run              変更を表示するが適用しない
```

### 3.5 冪等性

- 既存ファイルがある場合は **diff を表示** し、`--force` なしでは上書きしない
- MCP 設定は **マージ方式**（既存の servers/mcpServers を保持し、fnx 分を追加）
- Skills は **バージョン比較** — Manifest の `updated` が新しい場合のみ更新提案

---

## 4. fnx chat —— エージェントランチャー

### 4.1 設計方針

F20 の設計を踏襲するが、以下を変更:

| 観点 | F20 | 本仕様 |
|------|-----|--------|
| エージェント検出 | CLI のみ | CLI + IDE + 明示指定 |
| 指示ファイル | `.fnx/agent.md` のみ | `.fnx/agent.md` + 検出コンテキスト自動注入 |
| MCP 起動 | エージェントと同時起動 | 既に MCP 設定済みなら不要（`fnx setup` で設定済み） |

### 4.2 動作フロー

```
$ fnx chat

🔍 プロジェクトコンテキストを読み込み中...
  ├── Runtime: Node.js v4 (TypeScript)
  ├── SKU: Flex Consumption
  ├── Functions: httpTrigger (HTTP), processQueue (Queue)
  └── Agent workspace: .agents/skills/ (5 skills installed)

🤖 利用可能なコーディングエージェントを検出中...
  ✓ GitHub Copilot CLI (ghcs)
  ✓ Claude Code (claude)
  ✗ Codex CLI（未インストール）

どのエージェントを使用しますか？
  ❯ Claude Code（推奨 — CLI エージェントとして最も機能が豊富）
    GitHub Copilot CLI

🚀 Azure Functions コンテキスト付きで Claude Code を起動中...

┌──────────────────────────────────────────────────┐
│  fnx chat • Claude Code • Flex Consumption       │
│  Skills: 5 installed • MCP: fnx-templates        │
│  Project: my-functions-app (2 functions)          │
└──────────────────────────────────────────────────┘

Claude Code が起動しました。Azure Functions の知識で強化されています。
```

### 4.3 エージェント起動コマンド

各エージェントは異なるフラグでコンテキストを渡す必要がある:

```javascript
// lib/chat/launchers.js
const AGENT_LAUNCHERS = {
  'claude-code': {
    command: 'claude',
    // Claude Code は CLAUDE.md と .claude/skills/ を自動読み込み
    // 追加コンテキストは --system-prompt で渡す
    buildArgs: (context) => [
      '--system-prompt', context.agentMdPath,
    ],
  },
  'github-copilot-cli': {
    command: 'ghcs',
    // Copilot CLI は .github/copilot-instructions.md を自動読み込み
    // 追加は --agent-instructions で
    buildArgs: (context) => [
      '--agent-instructions', context.agentMdPath,
    ],
  },
  'codex': {
    command: 'codex',
    buildArgs: (context) => [
      '--instructions', context.agentMdPath,
    ],
  },
};
```

### 4.4 `.fnx/agent.md` の自動生成

プロジェクト検出結果からテンプレートを展開:

```markdown
# Azure Functions Development Agent

You are assisting a developer building Azure Functions applications.

## Project Context
- **Runtime:** Node.js v4 (TypeScript)
- **SKU:** Flex Consumption
- **Functions:** httpTrigger (HTTP), processQueue (Queue)
- **Emulator:** fnx (local development)

## Available Skills
The following fnx skills are installed in this workspace:
- **fnx-diagnostics**: Diagnose fnx start issues, errors, logs
- **fnx-best-practices**: SKU-specific best practices
- **fnx-create-function**: Create new functions using fnx templates
- **fnx-intro**: What fnx can do, installed skills overview
- **fnx-feedback**: Report issues from conversation history

## Available MCP Tools
You have access to the fnx Templates MCP server:
- `functions_language_list`: Get supported languages and runtime versions
- `functions_project_get`: Scaffold project files
- `functions_template_get`: Generate function template code

## Guidelines
- Always use v4 programming model for Node.js
- Check SKU compatibility before suggesting triggers/bindings
- Use `fnx start` for local testing (not `func start`)
- Flex Consumption constraints: [auto-populated from manifest]
- Follow established project structure
```

### 4.5 CLI インターフェース

```
fnx chat [options]

Options:
  --agent <name>     エージェントを指定（検出スキップ）: claude, copilot, codex, amp
  --no-mcp           MCP サーバーを起動しない
  --prompt <text>    非対話モード: 単一プロンプトを送信して終了
  --no-setup         fnx setup 未実行でもエラーにしない
```

---

## 5. 初期スキル提案

デモ用に 5 つのスキルを初期実装する。

### 5.1 fnx-diagnostics（診断スキル）

```yaml
---
name: fnx-diagnostics
description: "fnx start の問題を診断し解決する。エラーメッセージ分析、ログ解釈、一般的な問題の解決策を提供。USE FOR: fnx start が失敗した、エラーが出た、関数が動かない、ホストがクラッシュした"
tags: [fnx, diagnostics, troubleshooting]
category: Development
---
```

**内容**: SKU 別の一般的なエラーパターン、host.json 設定問題、ポート競合、依存関係エラー、Azurite 関連問題の診断フロー。

### 5.2 fnx-best-practices（ベストプラクティス）

```yaml
---
name: fnx-best-practices
description: "Azure Functions の SKU 別ベストプラクティス。パフォーマンス、セキュリティ、コスト最適化のガイダンス。USE FOR: best practices, performance, security, cost, SKU constraints"
tags: [azure-functions, best-practices, performance, security]
category: Development
---
```

**内容**: Flex Consumption / Premium / Dedicated 別の制約、推奨パターン、`local.settings.json` のセキュリティ問題（シークレットをワークスペースに置かない推奨）、binding パターン。

### 5.3 fnx-create-function（関数作成スキル）

```yaml
---
name: fnx-create-function
description: "fnx テンプレートを使って新しい Azure Function を作成するワークフロー。MCP ツールと連携してテンプレートを検出・適用。USE FOR: create function, add trigger, new function, template"
tags: [fnx, create, template, scaffold]
category: Development
---
```

**内容**: MCP ツールの使い方（`functions_template_get`）、トリガータイプ別のテンプレート一覧、SKU 互換性チェックフロー。

### 5.4 fnx-intro（紹介スキル）

```yaml
---
name: fnx-intro
description: "fnx の機能紹介、インストール済みスキル一覧、できることの概要。USE FOR: what is fnx, what can fnx do, list skills, help, getting started"
tags: [fnx, introduction, help, overview]
category: General
---
```

**内容**: fnx のコマンド一覧、インストール済みスキルの説明、ワークフロー例、よくある質問。

### 5.5 fnx-feedback（フィードバックスキル）

```yaml
---
name: fnx-feedback
description: "会話中に発生した問題を GitHub Issue として報告する。会話履歴から問題を抽出し、再現手順を含む Issue を生成。USE FOR: report issue, feedback, bug report, file issue"
tags: [fnx, feedback, issue, bug-report]
category: Utility
---
```

**内容**: 会話履歴の分析手順、Issue テンプレート、再現手順の構造化、ラベルの推奨、`gh issue create` コマンドの生成フロー。

---

## 6. Manvir の作業との共存設計

### 6.1 Manvir の現在の作業

| 作業 | ステータス | ファイル/場所 |
|------|-----------|-------------|
| `fnx init` (プロジェクト足場) | ✅ 完了 | `lib/init.js`, `lib/init/` |
| CI/CD ドキュメント (GitHub Actions, ADO) | ✅ コミット済み | `docs/f17-fnx-init-cd-*.md` |
| Docker ドキュメント | ✅ コミット済み | `docs/f17-fnx-init-docker.md` |
| Templates MCP サーバー | ✅ npm 公開済み | `manvir-templates-mcp-server` |
| Azure MCP PR (#1959) | 🔄 レビュー中 | `microsoft/mcp` repo |

### 6.2 共存ルール

```
fnx のコマンド体系:

fnx init     ← Manvir の担当（F17）。プロジェクト足場。
fnx start    ← 既存。ホスト起動。
fnx config   ← 既存。設定管理。
fnx setup    ← 本仕様（F20）。既存プロジェクトの Agent/DevOps 足場。
fnx chat     ← 本仕様（F20）。エージェントランチャー。
```

**コンフリクト回避策**:

1. **`fnx init` には触れない** — Manvir の `lib/init/` 配下は変更しない
2. **新しいディレクトリに実装** — `lib/setup/` と `lib/chat/` を新規作成
3. **CI/CD・Docker は `fnx setup` に移動可能** — Manvir のドキュメントにも「these can be moved from init to setup」とある。将来的に `fnx setup --module ci` で実装
4. **MCP サーバーは Manvir の既存を使用** — `manvir-templates-mcp-server` を MCP 設定で参照。Azure MCP (#1959) がマージされたらそちらに切り替え
5. **Manifest で新規コマンドとの統合ポイントを定義** — `fnx init --agent-config` から `fnx setup --module agent` のロジックを呼べるように export

### 6.3 ファイル配置（func-emulate リポジトリ）

```
fnx/
├── lib/
│   ├── cli.js                    # 既存 — setup/chat コマンドを追加
│   ├── init.js                   # Manvir の担当 — 変更なし
│   ├── init/                     # Manvir の担当 — 変更なし
│   ├── setup/                    # ← 新規（本仕様）
│   │   ├── index.js              # fnx setup エントリポイント
│   │   ├── detect.js             # プロジェクト自動検出
│   │   ├── agent-detect.js       # エージェント自動検出
│   │   ├── manifest-loader.js    # Manifest 読み込み（ローカル/リモート）
│   │   ├── apply-skills.js       # スキル適用ロジック
│   │   ├── apply-instructions.js # Instructions 生成・適用
│   │   ├── apply-mcp.js          # MCP 設定生成・マージ
│   │   ├── apply-agents.js       # Agent Definition 生成
│   │   └── ui.js                 # 対話型 UI（モジュール選択）
│   ├── chat/                     # ← 新規（本仕様）
│   │   ├── index.js              # fnx chat エントリポイント
│   │   ├── launchers.js          # エージェント起動定義
│   │   └── agent-md-gen.js       # .fnx/agent.md 生成
│   └── ...existing files...
├── manifests/                    # ← 新規
│   ├── default.yaml              # デフォルト Manifest（バンドル）
│   └── skills/                   # バンドルされたスキルファイル
│       ├── fnx-diagnostics/SKILL.md
│       ├── fnx-best-practices/SKILL.md
│       ├── fnx-create-function/SKILL.md
│       ├── fnx-intro/SKILL.md
│       └── fnx-feedback/SKILL.md
└── ...
```

---

## 7. 実装方法の選択と理由

### 7.1 Manifest ベースのアプローチ（採用）

**選択**: エージェント別のパスマッピングとコンテンツ定義を YAML Manifest で管理する。

**理由**:
1. **新しいエージェントへの対応が容易** — コードを変更せず Manifest を更新するだけ
2. **リモート更新が可能** — バンドルを超えて、最新の Manifest をフェッチできる
3. **Loom との相互運用性** — Loom の manifest.yaml と構造が近く、将来 Loom テンプレートとして公開可能
4. **宣言的** — 何をどこに配置するかが Manifest を見ればわかる

**不採用案**: 
- ハードコード方式 — エージェント追加のたびにコード変更が必要
- skills.sh CLI 依存 — `npx skills add` に委譲する案もあったが、fnx のゼロ依存ポリシーに反する

### 7.2 コピーをデフォルト + junction オプション（採用）

**選択**: `.agents/skills/` にスキルの実体をコピーで配置。`--link` フラグで directory junction（Windows）/ symlink（macOS/Linux）をオプション提供。

**理由**（付録 A の dobby 調査に基づく変更）:
1. **VSCode アトミック保存問題の回避** — dobby #406, #426 で file symlink/hard link が VSCode の保存で壊れることが確認済み
2. **Windows 権限問題の回避** — file symlink は Developer Mode か管理者権限が必要。コピーなら不要
3. **サイレント失敗の回避** — junction ターゲット消失がサイレントに空を返す（#658）
4. **コストが小さい** — スキルファイルは数 KB〜数十 KB。コピーのオーバーヘッドは無視できる
5. **更新は明示的** — `fnx setup --force` で最新に更新。暗黙的な同期よりも安全

**不採用案**:
- file symlink → VSCode アトミック保存で壊れる（dobby #406）
- hard link → 同じ理由で壊れる（dobby #426）
- symlink デフォルト → skills.sh 方式だが、dobby の 6 件以上のバグを考慮し安全側に倒す

### 7.3 エージェント自動検出 + 確認 UI（採用）

**選択**: 自動検出するが、結果を必ずユーザーに表示して確認を求める。

**理由**:
1. **ユーザーの認知負荷を下げる** — どのエージェントがあるか知らなくても動く
2. **透明性** — 何が検出されたか見えるので、誤検出に気づける
3. **手動オーバーライド可能** — `--agent` フラグで検出をスキップ

### 7.4 MCP 設定のマージ方式（採用）

**選択**: 既存の MCP 設定ファイルを読み込み、fnx 分の MCP サーバーだけを追加する。

**理由**:
1. **既存設定を壊さない** — ユーザーが追加した他の MCP サーバーを保持
2. **冪等性** — 2 回実行しても fnx-templates が重複しない（id でチェック）

**不採用案**: ファイル上書き方式 — 既存の MCP 設定を消してしまうリスク

---

## 8. デモスコープ（今日の目標）

### 8.1 最小デモで実装するもの

| 機能 | スコープ | 優先度 |
|------|---------|-------|
| プロジェクト自動検出 | Node.js のみ（host.json + package.json） | ★★★ |
| エージェント自動検出 | Copilot(VSCode) + Claude Code の 2 つ | ★★★ |
| `fnx setup --module agent` | Skills 5 点 + Instructions + AGENTS.md の配置 | ★★★ |
| `fnx setup --module mcp` | .vscode/mcp.json への fnx-templates 追加 | ★★★ |
| `fnx chat` | Claude Code のランチャー（1 エージェントのみ） | ★★☆ |
| Manifest ローカルバンドル | default.yaml + スキル 5 点 | ★★★ |
| Agent Definition | `.github/agents/fnx.agent.md` 生成 | ★☆☆ |
| 対話型 UI | シンプルな readline ベースの選択 | ★★☆ |

### 8.2 デモでやらないもの

- リモート Manifest 取得
- CI/CD, IaC, Docker, azd モジュール
- Python / .NET / Java プロジェクト検出
- Cursor / Codex / その他エージェント対応
- symlink（Windows のデモなのでコピーで十分）
- テスト（デモ後にユニットテスト追加）

---

## 9. 将来の拡張

| 段階 | 内容 |
|------|------|
| **v1.1** | リモート Manifest 取得（GitHub raw URL → キャッシュ → バンドルフォールバック） |
| **v1.2** | Python / .NET / Java プロジェクト検出 |
| **v1.3** | Cursor / Codex / Windsurf 等の追加エージェント対応 |
| **v2.0** | `fnx setup --module ci` (CI/CD)、`--module iac` (IaC) — Manvir の docs を実装化 |
| **v2.1** | `fnx init` との統合 — `fnx init --agent-config` で init 時にスキル自動同梱 |
| **v3.0** | Loom レジストリ統合 — `loom apply fnx --registry functions` で Loom からインストール |
| **v3.1** | Manifest のコミュニティ拡張 — サードパーティが独自スキルを Manifest に追加可能 |

---

## 付録 A: Symlink / Junction の既知問題と対策（dobby/loom 調査）

> **出典**: [serverless-paas-balam/dobby](https://github.com/serverless-paas-balam/dobby) — Loom の前身プロジェクト。symlink/junction 関連で多数の問題を経験しており、本仕様の設計に反映すべき教訓が含まれる。

### A.1 発見された問題一覧

| # | Issue | 深刻度 | ステータス | 概要 |
|---|-------|--------|-----------|------|
| [#406](https://github.com/serverless-paas-balam/dobby/issues/406) | Agent definition symlink sometimes replaced with regular file | 高 | Closed | **VSCode のアトミック保存**（一時ファイル書き込み → 元ファイル削除 → リネーム）が symlink を通常ファイルに置き換える。エージェントが自身の定義を編集する際にも発生。 |
| [#426](https://github.com/serverless-paas-balam/dobby/issues/426) | Personal symlinks use hard links — vulnerable to atomic save | 高 | Closed | **Windows の hard link** (`fs.link()`) は VSCode のアトミック保存で壊れる。保存後にリンクが切れ、ワークスペースのファイルとソースが乖離する。 |
| [#420](https://github.com/serverless-paas-balam/dobby/issues/420) | Instructions folder symlink not created during provisioning | 中 | Closed | symlink 作成がサイレントに失敗。Windows の権限問題、パス計算エラー、エラーハンドリング不足が原因。 |
| [#658](https://github.com/serverless-paas-balam/dobby/issues/658) | Agent mode breaks when repo switches branches (junction target disappears) | 高 | Open | **Directory junction のターゲットが消える**。ブランチ切り替えでターゲットのディレクトリが存在しなくなると、junction はサイレントに空を返す。 |
| [#424](https://github.com/serverless-paas-balam/dobby/issues/424) | Improve setupPersonalSymlinks error handling | 中 | Closed | junction → 実ディレクトリ変換時に内部 symlink が失敗してもエラーが swallow される。 |
| [#481](https://github.com/serverless-paas-balam/dobby/issues/481) | Detect and remediate stale pre-v1.5.0 workspaces | 低 | Open | 古い方式（file symlink/hard link）で作られたワークスペースが stale になる。v1.5.0 で directory junction に移行。 |
| [#229](https://github.com/serverless-paas-balam/dobby/issues/229) | Create .github/skills and .github/instructions symlinks | — | Closed | スキルと instructions の symlink 配置の元提案。 |

**Loom (後継):**
| # | Issue | 概要 |
|---|-------|------|
| [loom#6](https://github.com/serverless-paas-balam/loom/issues/6) | Use directory junctions for cloned repos | Windows では `mklink /J`（管理者権限不要）、macOS/Linux では `ln -s` を使用。ファイル単位の symlink ではなく **ディレクトリ単位の junction** を推奨。 |

### A.2 主要な教訓

#### 教訓 1: VSCode のアトミック保存が symlink を破壊する（#406, #426）

VSCode はファイル保存時に「一時ファイルに書き込み → 元ファイル削除 → 一時ファイルをリネーム」というアトミック保存パターンを使う。これにより:

- **File symlink** → 元ファイルの削除で symlink のターゲットが消え、新しい通常ファイルに置き換わる
- **Hard link** (`fs.link()`) → 同様に壊れる。保存後にリンクカウントが 1 になり、2 つのファイルが乖離

**dobby の解決策**: ファイル単位の symlink/hard link を廃止し、**ディレクトリ単位の junction** (`mklink /J`) に移行（v1.5.0, PR #468）。Junction 内のファイルは通常のファイル操作で読み書きされるため、VSCode のアトミック保存の影響を受けない。

#### 教訓 2: Windows の symlink は権限問題がある（#420）

Windows でファイル symlink を作成するには **Developer Mode** または **管理者権限** が必要。これがサイレントに失敗し、ユーザーが気づかない。

**dobby の解決策**:
- **Directory junction** (`mklink /J`) は管理者権限不要 → 推奨
- ファイル symlink が必要な場合は **コピーにフォールバック**

#### 教訓 3: Junction ターゲットの消失はサイレントに壊れる（#658）

Git のブランチ切り替え等で junction のターゲットディレクトリが消えると、junction はエラーを返さず **空のディレクトリとして振る舞う**。VSCode / Copilot は何も表示されない。

**fnx への影響**: fnx のスキルは fnx パッケージからコピーされるため、ブランチ切り替えの問題は発生しにくい。ただし、リモート Manifest からの更新時にターゲット消失が起きる可能性がある。

#### 教訓 4: エラーハンドリングは必須（#424）

symlink/junction の作成失敗をサイレントに swallow すると、ユーザーが何が起きたか分からず、デバッグが困難になる。

### A.3 fnx 仕様への反映

上記の教訓を踏まえ、本仕様では以下の戦略を採用する:

| 観点 | 戦略 | 理由 |
|------|------|------|
| **デフォルト方式** | **コピー**（`--copy` 相当） | 最も安全。VSCode アトミック保存の問題なし。Windows 権限問題なし。fnx のスキルは小さいテキストファイルなので、コピーコストは無視できる |
| **オプション方式** | `fnx setup --link` で **directory junction**（Windows）/ **symlink**（macOS/Linux） | 上級ユーザーやワークスペースの一元管理を望む場合に提供 |
| **ファイル symlink** | **使用しない** | dobby #406, #426 の教訓。VSCode のアトミック保存で壊れる |
| **Hard link** | **使用しない** | dobby #426 の教訓。同じ理由で壊れる |
| **エラーハンドリング** | 失敗時は **明示的に警告表示** + フォールバック（コピー） | dobby #420, #424 の教訓 |
| **健全性チェック** | `fnx setup` 再実行時に既存リンクの健全性を検証 | dobby #481 の教訓。壊れたリンクを検出して修復提案 |

#### skills.sh との整合性

skills.sh の `npx skills add` は symlink を推奨方式とするが、`--copy` フラグでコピーも可能。**fnx はデフォルトをコピーとし、skills.sh とは逆の安全側にデフォルトを置く**。理由:

1. fnx のターゲットユーザーは Azure Functions 開発者であり、symlink の仕組みに詳しくない可能性が高い
2. スキルファイルは小さい（数 KB〜数十 KB）ためコピーコストが小さい
3. 更新は `fnx setup --force` で明示的に行えばよい
4. dobby が 6 件以上の symlink 関連バグを経験した事実は、安全側に倒すべきことを示している

> **注記**: skills.sh が将来ディレクトリ junction を標準にした場合、fnx も追随を検討する。ただし、独自にファイル単位の symlink/hard link を使うことは避ける。
