//! SQLite 接続基盤（T-01）。
//!
//! アーキテクチャ制約: すべてのDBアクセスはRust側に集約する（R-ARCH-1）。
//! SQLiteのDBファイルは app_data_dir 配下に配置する（R-DATA-3）。
//! 業務データはSQLiteに永続化する（R-DATA-1）。
//!
//! スキーマ/マイグレーション/初期データの投入は `schema` モジュールが担う(T-02)。
//! 本モジュールは接続確立・マイグレーション実行・Tauri State 経由での共有を担う。

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

use crate::schema;

/// app_data_dir 配下に配置するDBファイル名。
pub const DB_FILE_NAME: &str = "mylog.db";

/// Tauri State として共有するアプリケーション状態。
///
/// `rusqlite::Connection` は `Sync` ではないため `Mutex` で保護する。
pub struct AppState {
    pub db: Mutex<Connection>,
}

/// 指定パスのSQLiteへ接続を開く。
///
/// パスとロジックを分離してテスト可能にするためのヘルパ。
/// `:memory:` を渡せばインメモリDBを開ける。
///
/// 接続単位で必要なPRAGMA（外部キー制約=カスケード削除）を有効化する（R-DATA-4）。
pub fn open_connection(path: &Path) -> Result<Connection, String> {
    let conn = Connection::open(path).map_err(|e| format!("DB接続に失敗しました: {e}"))?;
    schema::apply_connection_pragmas(&conn)?;
    Ok(conn)
}

/// app_data_dir を解決し、その配下にDBファイルへの接続を確立する（R-DATA-3）。
///
/// ディレクトリが存在しない場合は作成する。
pub fn init(app: &AppHandle) -> Result<Connection, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("app_data_dir の解決に失敗しました: {e}"))?;

    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("データディレクトリの作成に失敗しました: {e}"))?;

    let db_path = dir.join(DB_FILE_NAME);
    let conn = open_connection(&db_path)?;

    // 初回起動でテーブル作成・初期設定投入（R-DATA-2 / R-SET-3）。べき等。
    schema::migrate(&conn)?;

    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn open_connection_returns_usable_connection() {
        let conn = open_connection(Path::new(":memory:")).expect("接続を開けること");
        let value: i64 = conn
            .query_row("SELECT 1", [], |row| row.get(0))
            .expect("クエリを実行できること");
        assert_eq!(value, 1);
    }

    #[test]
    fn open_connection_creates_file_db() {
        let tmp = std::env::temp_dir().join(format!("mylog_test_{}.db", std::process::id()));
        let _ = std::fs::remove_file(&tmp);

        let conn = open_connection(&tmp).expect("ファイルDBへ接続できること");
        conn.execute_batch("CREATE TABLE t (id INTEGER); INSERT INTO t VALUES (42);")
            .expect("DDL/DMLを実行できること");
        let value: i64 = conn
            .query_row("SELECT id FROM t", [], |row| row.get(0))
            .expect("値を取得できること");
        assert_eq!(value, 42);

        assert!(tmp.exists(), "DBファイルが生成されること");
        drop(conn);
        let _ = std::fs::remove_file(&tmp);
    }
}
