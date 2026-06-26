# トレーサビリティマトリクス（EARS ⇄ Gherkin）

本ディレクトリの Gherkin 振る舞い定義と、[`../basic-design.md`](../basic-design.md) の EARS 要求IDの対応表。

## トレーサビリティの担保方法

1. **タグ方式**: 各 `.feature` のシナリオに、対応するEARS要求IDを `@R-XXX-n` タグとして付与する。
   - 例: `@R-CAT-1` のタグが付いたシナリオは要求 `R-CAT-1` を検証する。
   - Cucumber 等では `--tags @R-CAT-1` で当該要求のシナリオのみ実行可能。
2. **マトリクス方式**: 下表で全EARS要求ID → feature ファイル / シナリオ / 検証方法を一覧化する。
3. **逆引き**: 1要求が複数シナリオで、または1シナリオが複数要求で検証される場合も、タグと本表の双方で追跡できる。

タグ命名規則: `@R-<機能>-<連番>`（EARS要求IDと完全一致）。補助タグ: `@option`（オプション要求）, `@異常系`（望ましくない動作）, `@ui`, `@validation`。

## マトリクス

| EARS要求ID | パターン | featureファイル | シナリオ（タグ） | 検証方法 |
|------------|----------|-----------------|------------------|----------|
| R-ARCH-1 | ユビキタス | — | — | 構成/コードレビュー（DBアクセスのRust集約） |
| R-ARCH-2 | ユビキタス | — | — | 構成/コードレビュー（invoke経由のデータ授受） |
| R-ARCH-3 | ユビキタス | — | — | 静的検査/コードレビュー（FEにSQLを書かない） |
| R-ARCH-4 | ユビキタス | — | — | 構成/コードレビュー（集計ロジックをRust実装） |
| R-DATA-1 | ユビキタス | data-persistence.feature | @R-DATA-1 | Gherkin |
| R-DATA-2 | イベント駆動 | data-persistence.feature | @R-DATA-2 | Gherkin |
| R-DATA-3 | ユビキタス | data-persistence.feature | @R-DATA-3 | Gherkin |
| R-DATA-4 | イベント駆動 | work-category-management.feature | @R-DATA-4（@R-CAT-5 と同一シナリオ） | Gherkin |
| R-CAT-1 | イベント駆動 | work-category-management.feature | @R-CAT-1 | Gherkin |
| R-CAT-2 | ユビキタス | work-category-management.feature | @R-CAT-2 | Gherkin |
| R-CAT-3 | イベント駆動 | work-category-management.feature | @R-CAT-3 | Gherkin |
| R-CAT-4 | イベント駆動 | work-category-management.feature | @R-CAT-4 | Gherkin |
| R-CAT-5 | イベント駆動 | work-category-management.feature | @R-CAT-5 | Gherkin |
| R-CAT-6 | イベント駆動 | work-category-management.feature | @R-CAT-6 | Gherkin |
| R-CAT-7 | 望ましくない動作 | work-category-management.feature | @R-CAT-7 | Gherkin（シナリオアウトライン） |
| R-CAT-8 | 望ましくない動作 | work-category-management.feature | @R-CAT-8 | Gherkin（シナリオアウトライン） |
| R-CAT-9 | オプション | work-category-management.feature | @R-CAT-9 | Gherkin |
| R-ACT-1 | イベント駆動 | actual-work-entry.feature | @R-ACT-1 | Gherkin |
| R-ACT-2 | ユビキタス | actual-work-entry.feature | @R-ACT-2 | Gherkin |
| R-ACT-3 | イベント駆動 | actual-work-entry.feature | @R-ACT-3 | Gherkin |
| R-ACT-4 | オプション | actual-work-entry.feature | @R-ACT-4 | Gherkin（シナリオアウトライン） |
| R-ACT-5 | イベント駆動 | actual-work-entry.feature | @R-ACT-5 | Gherkin |
| R-ACT-6 | イベント駆動 | actual-work-entry.feature | @R-ACT-6 | Gherkin |
| R-ACT-7 | 望ましくない動作 | actual-work-entry.feature | @R-ACT-7 | Gherkin（シナリオアウトライン） |
| R-ACT-8 | ユビキタス | actual-work-entry.feature | @R-ACT-8 | Gherkin |
| R-ACT-9 | ユビキタス | actual-work-entry.feature | @R-ACT-9 | Gherkin |
| R-DASH-1 | イベント駆動 | dashboard.feature | @R-DASH-1 | Gherkin |
| R-DASH-2 | イベント駆動 | dashboard.feature | @R-DASH-2 | Gherkin |
| R-DASH-3 | ユビキタス | dashboard.feature | @R-DASH-3 | Gherkin |
| R-DASH-4 | ユビキタス | dashboard.feature | @R-DASH-4 | Gherkin |
| R-DASH-5 | ユビキタス | dashboard.feature | @R-DASH-5 | Gherkin |
| R-DASH-6 | オプション | dashboard.feature | @R-DASH-6 | Gherkin |
| R-DASH-7 | ユビキタス | dashboard.feature | @R-DASH-7 | Gherkin |
| R-DASH-8 | ユビキタス | dashboard.feature | @R-DASH-8 | Gherkin |
| R-DASH-9 | ユビキタス | dashboard.feature | @R-DASH-9 | Gherkin |
| R-DASH-10 | ユビキタス | dashboard.feature | @R-DASH-10 | Gherkin |
| R-DASH-11 | オプション | dashboard.feature | @R-DASH-11 | Gherkin |
| R-SET-1 | イベント駆動 | settings.feature | @R-SET-1 | Gherkin |
| R-SET-2 | イベント駆動 | settings.feature | @R-SET-2 | Gherkin |
| R-SET-3 | ユビキタス | settings.feature | @R-SET-3 | Gherkin |
| R-SET-4 | イベント駆動 | settings.feature | @R-SET-4 | Gherkin |
| R-UI-1 | ユビキタス | cross-cutting.feature | @R-UI-1 | Gherkin（シナリオアウトライン） |
| R-UI-2 | ユビキタス | cross-cutting.feature | @R-UI-2 | Gherkin（シナリオアウトライン） |
| R-NF-1 | 望ましくない動作 | cross-cutting.feature | @R-NF-1 | Gherkin |
| R-NF-2 | ユビキタス | cross-cutting.feature | @R-NF-2 | Gherkin |
| R-NF-3 | ユビキタス | — | — | 動作確認/CI（macOS・Windows） |
| R-NF-4 | ユビキタス | — | — | Rust単体テスト（集計ロジック） |

## カバレッジ要約

- EARS要求 総数: **47**
- Gherkin（feature）で検証: **41**
- 構成/コードレビュー・CI・単体テストで検証（非振る舞い要求）: **6**（R-ARCH-1〜4, R-NF-3, R-NF-4）

> 非振る舞い要求（アーキテクチャ制約・対応OS・単体テスト整備）はGherkinシナリオでの観測が困難なため、上表の「検証方法」列に記載の手段でトレーサビリティを担保する。新規要求を basic-design.md に追加した際は、本表とfeatureタグの双方を更新すること。
