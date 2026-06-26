---
description: dev-implementer subagentを起動し、specs/tasks.yamlの開発計画に沿ってタスクを実装する。引数でタスクIDを指定でき、省略時は着手可能な次タスクを自動選択する
argument-hint: "[タスクID]  (省略時: depends_onが全DONEの最小TODOを自動選択。例: T-04)"
allowed-tools: Task
---

`dev-implementer` サブエージェントを起動して、開発計画に沿った実装を1タスク進めてください。

- 対象タスク: `$1`（指定があればそのタスクID。**未指定なら** `specs/tasks.yaml` で `depends_on` がすべて `DONE` の中の最小ID `TODO` タスクを自動選択させる）
- エージェントには次を厳守させること:
  - `specs/tasks.yaml` を正データとして参照し、着手時に `status: DOING`、完了時に `DONE`（手動検証残りは `REVIEW`）へ更新する。
  - `specs/dev-plan.md` の状態列も tasks.yaml に合わせて更新する。
  - basic-design.md のアーキテクチャ制約（DBアクセスRust集約 / invoke経由 / 集計Rust実装 / 両層バリデーション）と、紐づくEARS要求・`.feature`シナリオの受け入れ基準を満たす。
  - ビルド/テスト（`cargo build`・`cargo test`・`pnpm build`）を通す。
  - 完了後にEARSトレーサビリティ自己検証（未割当0・余剰0）を実行して報告に含める。
  - 原則1タスクのみ実装し、コミット/pushは行わない。

エージェントの報告（実装タスクID・変更ファイル・ビルド/テスト結果・満たした要求/シナリオ・新しい状態・次に着手可能なタスクID）を、そのまま要約してユーザーに伝えてください。
