---
description: 設計書(EARS)とGherkin振る舞い定義から開発計画(タスク管理)を生成する。開発順序・開発状況(doing/done)・トレーサビリティを担保し、YAMLを正データとして出力する
argument-hint: "[設計書パス] [featureフォルダ] [出力フォルダ]  (省略時: specs/basic-design.md specs/features specs)"
allowed-tools: Read, Write, Edit, Bash(python3:*), Bash(ls:*), Bash(grep:*), Bash(find:*), Glob
---

## 目的

EARS要求の設計書とGherkin振る舞い定義（`.feature`）を読み取り、**開発計画（タスク管理）**を生成する。
**開発順序・開発状況（doing/done等）・トレーサビリティ**を担保し、機械処理しやすい **YAMLを正データ（single source of truth）** として出力する。
連鎖を **EARS要求(設計書) ⇄ Gherkin(features) ⇄ タスク(計画)** で閉じることが本コマンドの責務。

## 入力

- 設計書: `$1`（未指定なら `specs/basic-design.md`）— EARS要求IDは `R-<機能>-<連番>` 形式。
- featureフォルダ: `$2`（未指定なら `specs/features`）— `.feature` と `traceability.md`。
- 出力フォルダ: `$3`（未指定なら `specs`）。

## 出力

1. `$3/tasks.yaml` — **正データ**。状態・依存・トレーサビリティはここを編集する。
2. `$3/dev-plan.md` — `tasks.yaml` から生成する**人間向け俯瞰ビュー**（手編集禁止・再生成する旨を明記）。

## 手順

1. 設計書 `$1` を読み、全EARS要求IDとパターンを抽出する。`$2/*.feature` のシナリオタグ（`@R-...`）と `$2/traceability.md` を読み、要求⇄シナリオの対応を把握する。
2. 関連資料（ER図・DBML・Tauriコマンド定義・画面構成・技術スタック）と**現状のコード**（実装済みか初期スキャフォールドか）を確認し、着手起点を把握する。
3. タスクへ分解する。**依存関係に沿ったボトムアップ**を基本とする（例: 基盤/DB → ドメイン/リポジトリ → コマンド → 集計+単体テスト → フロント基盤 → 各画面 → 横断(検証/エラー) → 仕上げ(CI/パッケージング)）。
   - タスク粒度はマイルストーン内で1〜数機能。アーキテクチャ制約（DBアクセス集約・invoke経由・集計のバックエンド実装など）は該当タスクの検証観点として織り込む。
4. `$3/tasks.yaml` を生成する（次節スキーマ）。
5. `$3/dev-plan.md` を `tasks.yaml` から生成する（マイルストーン表・開発順タスク表・クリティカルパス・検証手順）。冒頭に「正データは tasks.yaml、本書は生成物」と明記する。

## tasks.yaml スキーマ（必須）

```yaml
meta:
  status_values: [TODO, DOING, REVIEW, DONE, BLOCKED]
  design_doc: <$1>
  traceability_doc: <$2/traceability.md>
  ears_total: <設計書のEARS要求総数>
milestones:
  M0: { name: ..., desc: ... }   # 以降 M1, M2, ...
tasks:
  - id: T-01                      # T-<連番>。昇順が推奨実装順
    title: ...
    milestone: M0
    desc: ...
    depends_on: []                # 前提タスクIDの配列
    status: TODO                  # TODO|DOING|REVIEW|DONE|BLOCKED
    ears: [R-XXX-1, R-XXX-2]      # 検証するEARS要求ID。範囲表記(〜)は使わず全件を配列展開する
    features: [foo.feature]       # 紐づくfeatureファイル（非振る舞いは空配列）
    scenario_tags: ["@R-XXX-1"]   # 紐づくシナリオタグ
    verify: gherkin               # gherkin | review | cargo-test | ci | gherkin+review
    dod: ...                      # 完了の定義。紐づくシナリオがパス等
```

## トレーサビリティ担保（必須）

- **EARS IDは配列で完全展開**する。`R-CAT-1〜5` のような範囲表記は禁止（機械照合のため）。
- 設計書の **全EARS要求が最低1タスクの `ears` に出現**すること（未割当ゼロ）。非振る舞い要求（アーキ制約・対応OS・単体テスト整備）もタスクに割当て、`verify` に検証手段を記す。
- `dev-plan.md` には逆引き表を手で持たず、`tasks.yaml` からの**検証コマンドを同梱**して二重管理を避ける。

## 完了時の自己検証（必須）

設計書のEARS集合と `tasks.yaml` の `ears` 集合を機械照合する:

```bash
python3 - <<'PY'
import re, pathlib
d = set(re.findall(r'R-[A-Z]+-\d+', pathlib.Path('$1').read_text(encoding='utf-8')))
t = set(re.findall(r'R-[A-Z]+-\d+', pathlib.Path('$3/tasks.yaml').read_text(encoding='utf-8')))
print("design:", len(d), "tasks:", len(t))
print("未割当:", sorted(d - t) or "なし ✓")
print("設計に無いID:", sorted(t - d) or "なし ✓")
PY
```

未割当・余剰が出たら `tasks.yaml` を修正し、ゼロになるまで繰り返す。

## 出力報告

- 生成ファイル、マイルストーン/タスク数、開発順序の要点、クリティカルパス、EARSカバレッジ検証結果（未割当0・余剰0）を簡潔に報告する。
- 状態更新は `tasks.yaml` の `status` を編集し、`dev-plan.md` は再生成する運用を案内する。
