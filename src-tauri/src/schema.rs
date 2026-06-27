//! スキーマ/マイグレーション/初期データ（T-02）。
//!
//! `specs/data-model.dbml` を正としてスキーマDDLを定義し、初回起動時に
//! 全テーブルを作成する（R-DATA-2）。`setting` には初期レコード
//! （`baseline_hours = 8`）を投入する（R-DATA-2 / R-SET-3）。
//!
//! 外部キー制約（FK ON DELETE CASCADE）は接続単位の `PRAGMA foreign_keys`
//! を有効化することで機能する（R-DATA-4）。本PRAGMAは接続ごとにON設定が
//! 必要なため、接続確立時（`open_connection`）に有効化する。

use rusqlite::Connection;

/// 基準線（baseline_hours）の初期値（R-SET-3）。
pub const DEFAULT_BASELINE_HOURS: f64 = 8.0;

/// スキーマDDL。`specs/data-model.dbml` を正とする。
/// 外部キーは `ON DELETE CASCADE`（親=作業区分の削除で子をカスケード削除）。
const SCHEMA_DDL: &str = "\
CREATE TABLE IF NOT EXISTS work_category (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    code          TEXT    NOT NULL,
    name          TEXT    NOT NULL,
    planned_hours REAL    NOT NULL DEFAULT 0,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS monthly_plan (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    work_category_id INTEGER NOT NULL,
    target_month     TEXT    NOT NULL,
    planned_hours    REAL    NOT NULL DEFAULT 0,
    FOREIGN KEY (work_category_id) REFERENCES work_category (id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_monthly_plan_category_month
    ON monthly_plan (work_category_id, target_month);

CREATE TABLE IF NOT EXISTS actual_work (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    work_category_id INTEGER NOT NULL,
    actual_hours     REAL    NOT NULL,
    work_date        TEXT    NOT NULL,
    memo             TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL,
    FOREIGN KEY (work_category_id) REFERENCES work_category (id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_actual_work_work_date
    ON actual_work (work_date);

CREATE INDEX IF NOT EXISTS idx_actual_work_category
    ON actual_work (work_category_id);

CREATE TABLE IF NOT EXISTS setting (
    id             INTEGER PRIMARY KEY,
    baseline_hours REAL    NOT NULL DEFAULT 8
);
";

/// 接続ごとに有効化が必要なPRAGMAを設定する。
///
/// `foreign_keys` はSQLiteでは接続単位の設定であり、永続化されない。
/// カスケード削除（R-DATA-4）を効かせるため接続確立のたびにONにする。
pub fn apply_connection_pragmas(conn: &Connection) -> Result<(), String> {
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|e| format!("外部キー制約の有効化に失敗しました: {e}"))
}

/// スキーマDDLを適用し、初期データを投入する（R-DATA-2 / R-SET-3）。
///
/// `CREATE TABLE IF NOT EXISTS` と初期レコードのべき等な投入により、
/// 既存DBに対しても安全に再実行できる。
pub fn migrate(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(SCHEMA_DDL)
        .map_err(|e| format!("スキーマの作成に失敗しました: {e}"))?;

    // setting の初期レコード（id = 1, baseline_hours = 8）を投入する。
    // 既存レコードがあれば上書きしない（INSERT OR IGNORE）。
    conn.execute(
        "INSERT OR IGNORE INTO setting (id, baseline_hours) VALUES (1, ?1)",
        [DEFAULT_BASELINE_HOURS],
    )
    .map_err(|e| format!("初期設定の投入に失敗しました: {e}"))?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_connection;
    use std::path::Path;

    fn memory_conn() -> Connection {
        let conn = open_connection(Path::new(":memory:")).expect("接続を開けること");
        migrate(&conn).expect("マイグレーションが成功すること");
        conn
    }

    #[test]
    fn migrate_creates_all_tables() {
        let conn = memory_conn();
        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .expect("テーブル一覧クエリを準備できること");
        let names: Vec<String> = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .expect("クエリ実行")
            .map(|r| r.expect("行取得"))
            .collect();

        for expected in ["actual_work", "monthly_plan", "setting", "work_category"] {
            assert!(
                names.iter().any(|n| n == expected),
                "テーブル {expected} が作成されること（実際: {names:?}）"
            );
        }
    }

    #[test]
    fn migrate_inserts_setting_with_baseline_8() {
        let conn = memory_conn();
        let baseline: f64 = conn
            .query_row("SELECT baseline_hours FROM setting WHERE id = 1", [], |r| {
                r.get(0)
            })
            .expect("初期設定が存在すること");
        assert_eq!(baseline, 8.0, "基準線の初期値は8であること（R-SET-3）");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM setting", [], |r| r.get(0))
            .expect("件数取得");
        assert_eq!(count, 1, "setting は単一レコードであること");
    }

    #[test]
    fn migrate_is_idempotent() {
        let conn = memory_conn();
        // 既存レコードを更新しても再マイグレーションで上書きされないこと。
        conn.execute("UPDATE setting SET baseline_hours = 6 WHERE id = 1", [])
            .expect("更新できること");
        migrate(&conn).expect("再マイグレーションが成功すること");

        let baseline: f64 = conn
            .query_row("SELECT baseline_hours FROM setting WHERE id = 1", [], |r| {
                r.get(0)
            })
            .expect("設定取得");
        assert_eq!(baseline, 6.0, "既存設定は上書きされないこと");

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM setting", [], |r| r.get(0))
            .expect("件数取得");
        assert_eq!(count, 1, "再マイグレーションで重複投入されないこと");
    }

    #[test]
    fn cascade_delete_removes_children() {
        let conn = memory_conn();
        apply_connection_pragmas(&conn).expect("PRAGMA設定");

        conn.execute(
            "INSERT INTO work_category (id, code, name, planned_hours, created_at, updated_at) \
             VALUES (1, 'A', '設計', 0, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')",
            [],
        )
        .expect("作業区分を作成できること");
        conn.execute(
            "INSERT INTO monthly_plan (work_category_id, target_month, planned_hours) \
             VALUES (1, '2026/01', 40)",
            [],
        )
        .expect("月予定を作成できること");
        conn.execute(
            "INSERT INTO actual_work (work_category_id, actual_hours, work_date, memo, created_at, updated_at) \
             VALUES (1, 3.5, '2026/01/05', NULL, '2026-01-05T00:00:00Z', '2026-01-05T00:00:00Z')",
            [],
        )
        .expect("実績を作成できること");

        conn.execute("DELETE FROM work_category WHERE id = 1", [])
            .expect("作業区分を削除できること");

        let plans: i64 = conn
            .query_row("SELECT COUNT(*) FROM monthly_plan", [], |r| r.get(0))
            .expect("月予定件数");
        let actuals: i64 = conn
            .query_row("SELECT COUNT(*) FROM actual_work", [], |r| r.get(0))
            .expect("実績件数");
        assert_eq!(plans, 0, "月予定がカスケード削除されること（R-DATA-4）");
        assert_eq!(actuals, 0, "実績がカスケード削除されること（R-DATA-4）");
    }

    #[test]
    fn memo_allows_null() {
        let conn = memory_conn();
        conn.execute(
            "INSERT INTO work_category (id, code, name, planned_hours, created_at, updated_at) \
             VALUES (1, 'A', '設計', 0, 'now', 'now')",
            [],
        )
        .expect("作業区分作成");
        conn.execute(
            "INSERT INTO actual_work (work_category_id, actual_hours, work_date, memo, created_at, updated_at) \
             VALUES (1, 1.0, '2026/01/05', NULL, 'now', 'now')",
            [],
        )
        .expect("memo=NULL で実績を作成できること");
        let memo: Option<String> = conn
            .query_row("SELECT memo FROM actual_work LIMIT 1", [], |r| r.get(0))
            .expect("memo取得");
        assert!(memo.is_none(), "memo は NULL 許容であること");
    }
}
