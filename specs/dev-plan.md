# 開発計画書（俯瞰ビュー） — Work Log Management (mylog)

> **このファイルは [`tasks.yaml`](./tasks.yaml) から生成される人間向けの俯瞰ビューです。**
> 開発状況・依存・トレーサビリティの**正データ（single source of truth）は `tasks.yaml`**。
> 状態更新や要求の追加は `tasks.yaml` を編集し、本ファイルを再生成すること（手で本ファイルを書き換えない）。

[`basic-design.md`](./basic-design.md) のEARS要求と [`features/`](./features/) のGherkin振る舞い定義を実装に落とすための開発計画。

## 1. 運用ルール

- **正データ**: `tasks.yaml`。本書はそこからの生成物。
- **状態(status)**: `TODO`（未着手）/ `DOING`（着手中）/ `REVIEW`（実装済・検証待ち）/ `DONE`（完了）/ `BLOCKED`（依存待ち・障害）。
- **開発順序**: タスクID昇順（`T-01`→`T-16`）が推奨実装順。`depends_on` の前提タスクが `DONE` になってから着手する。
- **トレーサビリティ**: 各タスクは検証対象の **EARS要求ID**（`ears`）と **featureファイル/シナリオタグ**（`features`/`scenario_tags`）を保持。
  連鎖は **EARS要求(basic-design.md) ⇄ Gherkin(features/*.feature, traceability.md) ⇄ task(tasks.yaml)**。
  完了の定義(DoD)は、紐づくfeatureシナリオ（`@R-XXX-n`）がパスすること。非振る舞い要求はレビュー/単体テスト/CIで担保。
- **更新義務**: 要求の追加・変更時は basic-design.md・traceability.md・tasks.yaml の3点を同時更新する。

## 2. マイルストーン

| MS | 名称 | 内容 | タスク |
|----|------|------|--------|
| M0 | 基盤 | DB接続・スキーマ・初期化 | T-01, T-02 |
| M1 | ドメイン/リポジトリ | Rustモデル・DTO・リポジトリ層 | T-03 |
| M2 | コマンド | 作業区分・実績・設定のCRUD | T-04, T-05, T-06 |
| M3 | 集計 | ダッシュボード集計＋単体テスト | T-07, T-08 |
| M4 | フロント基盤 | ルーティング・ナビ・invokeラッパ・共通フォーマット | T-09, T-10 |
| M5 | 画面 | 各画面のUI/フォーム/グラフ | T-11, T-12, T-13, T-14 |
| M6 | 横断 | バリデーション・エラー通知 | T-15 |
| M7 | 仕上げ | クロスプラットフォーム/CI/パッケージング | T-16 |

## 3. タスク一覧（開発順）

| ID | タスク | MS | 依存 | 状態 | EARS要求 | feature/検証 |
|----|--------|----|------|------|----------|--------------|
| T-01 | SQLite接続基盤 | M0 | — | DONE | R-ARCH-1, R-DATA-1, R-DATA-3 | data-persistence.feature |
| T-02 | スキーマ/マイグレーション/初期データ | M0 | T-01 | DONE | R-DATA-2, R-SET-3 | data-persistence / settings |
| T-03 | ドメインモデル/リポジトリ層 | M1 | T-02 | DONE | R-ARCH-1, R-ARCH-3, R-ARCH-4 | コードレビュー |
| T-04 | 作業区分コマンド(CRUD) | M2 | T-03 | DONE | R-CAT-1〜5, R-CAT-9, R-DATA-4, R-CAT-2 | work-category-management.feature |
| T-05 | 実績工数コマンド(CRUD) | M2 | T-03 | DONE | R-ACT-1, R-ACT-3〜6, R-ACT-8, R-ACT-9 | actual-work-entry.feature |
| T-06 | 設定コマンド | M2 | T-03 | DONE | R-SET-1, R-SET-2 | settings.feature |
| T-07 | ダッシュボード集計コマンド | M3 | T-04, T-05, T-06 | DONE | R-ARCH-4, R-DASH-5, R-DASH-6, R-DASH-11 | dashboard.feature |
| T-08 | 集計ロジックの単体テスト | M3 | T-07 | DONE | R-NF-4 | cargo test |
| T-09 | ルーティング/ナビゲーション | M4 | T-01 | DONE | R-UI-1 | cross-cutting.feature |
| T-10 | invokeラッパ/共通フォーマット | M4 | T-04, T-05, T-06, T-07 | DONE | R-ARCH-2, R-UI-2 | cross-cutting.feature |
| T-11 | 作業区分画面 | M5 | T-09, T-10 | DONE | R-CAT-1, R-CAT-3〜6, R-CAT-9 | work-category-management.feature |
| T-12 | 実績入力画面 | M5 | T-09, T-10 | TODO | R-ACT-2, R-ACT-3, R-ACT-4 | actual-work-entry.feature |
| T-13 | ダッシュボード画面 | M5 | T-07, T-09, T-10 | TODO | R-DASH-1〜4, R-DASH-7〜10 | dashboard.feature |
| T-14 | 設定画面 | M5 | T-06, T-09, T-10, T-13 | TODO | R-SET-1, R-SET-2, R-SET-4 | settings.feature |
| T-15 | バリデーション/エラー通知(横断) | M6 | T-04, T-05, T-11, T-12 | TODO | R-CAT-7, R-CAT-8, R-ACT-7, R-NF-1, R-NF-2 | work-category / actual-work / cross-cutting |
| T-16 | クロスプラットフォーム/CI/パッケージング | M7 | T-08, T-13, T-14, T-15 | TODO | R-NF-3 | 動作確認/CI |

## 4. クリティカルパス

```
T-01 → T-02 → T-03 → {T-04, T-05, T-06} → T-07 → T-08
                                    ↓
T-01 → T-09 ─────────────→ T-10 → {T-11, T-12, T-13} → T-14 → T-15 → T-16
```

- バックエンド(T-01〜T-08)とフロント骨組み(T-09)は途中まで並行可能。画面実装(T-11〜)はコマンド(T-04〜T-07)とinvokeラッパ(T-10)に依存。
- 集計(T-07)と単体テスト(T-08)を早期に固め、ダッシュボード(T-13)の手戻りを抑える。

## 5. トレーサビリティ検証

`tasks.yaml` の `ears` 配列と basic-design.md のEARS要求(47件)の照合は機械的に検証する:

```bash
python3 - <<'PY'
import re, pathlib
d = set(re.findall(r'R-[A-Z]+-\d+', pathlib.Path('specs/basic-design.md').read_text()))
t = set(re.findall(r'R-[A-Z]+-\d+', pathlib.Path('specs/tasks.yaml').read_text()))
print("未割当:", sorted(d - t) or "なし ✓")
print("設計に無いID:", sorted(t - d) or "なし ✓")
PY
```

最終検証結果: **EARS 47件すべて割当済み（未割当0・余剰0）✓**
