mod commands;
mod db;
// models / repository は T-03 で定義。コマンド層（T-04〜T-07）から利用する。
// 利用が始まるまでの未使用警告を抑止する。
#[allow(dead_code)]
mod models;
#[allow(dead_code)]
mod repository;
mod schema;

use commands::{
    create_actual_work, create_work_category, delete_actual_work, delete_work_category,
    get_setting, list_actual_works, list_work_categories, update_actual_work, update_setting,
    update_work_category,
};

use db::AppState;
use tauri::{Manager, State};

/// DB接続がコマンドから利用可能であることを確認するヘルスチェック（T-01 DoD）。
///
/// 後続タスクで本コマンドはドメイン別コマンドに置き換わるが、
/// 接続がTauri State経由でコマンドから使えることをここで担保する。
#[tauri::command]
fn db_health_check(state: State<'_, AppState>) -> Result<String, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    let value: i64 = conn
        .query_row("SELECT 1", [], |row| row.get(0))
        .map_err(|e| format!("DBヘルスチェックに失敗しました: {e}"))?;
    Ok(format!("ok:{value}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            // app_data_dir 配下にSQLite接続を確立し、Tauri State で共有する（R-DATA-3 / R-ARCH-1）。
            let conn = db::init(app.handle())?;
            app.manage(AppState {
                db: std::sync::Mutex::new(conn),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            db_health_check,
            list_work_categories,
            create_work_category,
            update_work_category,
            delete_work_category,
            list_actual_works,
            create_actual_work,
            update_actual_work,
            delete_actual_work,
            get_setting,
            update_setting
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
