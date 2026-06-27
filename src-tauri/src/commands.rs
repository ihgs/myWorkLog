//! Tauri コマンド層。
//!
//! フロントエンドからは `invoke` 経由でのみ呼び出される境界（R-ARCH-2）。
//! 戻り値はすべて `Result<T, String>`（basic-design.md 7章）。
//! DBアクセス・SQLはリポジトリ層（`repository`）に委譲し、ここには持ち込まない
//! （R-ARCH-1 / R-ARCH-3）。
//!
//! 本ファイルは作業区分（F1）コマンド（T-04）・
//! 実績工数（F2）コマンド（T-05）・設定（F4）コマンド（T-06）を提供する。

use tauri::State;

use crate::aggregate;
use crate::db::AppState;
use crate::models::{
    ActualWork, ActualWorkFilter, DailyStacked, DashboardSummary, MonthlyPlanInput, Setting,
    WorkCategory,
};
use crate::repository::{actual_work, setting, work_category};

/// 月予定の対象月が `yyyy/mm` 形式かを検証する（R-CAT-9）。
///
/// `01`〜`12` の月のみ受け付ける。形式不正はエラー文字列を返す。
fn validate_month_format(target_month: &str) -> Result<(), String> {
    let bytes = target_month.as_bytes();
    let valid = bytes.len() == 7
        && bytes[4] == b'/'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..].iter().all(u8::is_ascii_digit);
    if !valid {
        return Err(format!(
            "対象月は yyyy/mm 形式で入力してください（入力値: {target_month}）"
        ));
    }
    let month: u32 = target_month[5..]
        .parse()
        .map_err(|_| format!("対象月の月が不正です（入力値: {target_month}）"))?;
    if !(1..=12).contains(&month) {
        return Err(format!(
            "対象月の月は01〜12で入力してください（入力値: {target_month}）"
        ));
    }
    Ok(())
}

/// 月予定入力全件の対象月形式を検証する（R-CAT-9）。
fn validate_plans(plans: &[MonthlyPlanInput]) -> Result<(), String> {
    for plan in plans {
        validate_month_format(&plan.target_month)?;
    }
    Ok(())
}

/// 全作業区分を月予定同梱で取得する（R-CAT-3）。
#[tauri::command]
pub fn list_work_categories(state: State<'_, AppState>) -> Result<Vec<WorkCategory>, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    work_category::list(&conn)
}

/// 作業区分を月予定とともに登録する（R-CAT-1）。コードは重複可（R-CAT-2）。
#[tauri::command]
pub fn create_work_category(
    state: State<'_, AppState>,
    code: String,
    name: String,
    planned_hours: f64,
    monthly_plans: Vec<MonthlyPlanInput>,
) -> Result<WorkCategory, String> {
    validate_plans(&monthly_plans)?;
    let mut conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    work_category::create(&mut conn, &code, &name, planned_hours, &monthly_plans)
}

/// 作業区分の内容（月予定含む）を更新する（R-CAT-4）。
#[tauri::command]
pub fn update_work_category(
    state: State<'_, AppState>,
    id: i64,
    code: String,
    name: String,
    planned_hours: f64,
    monthly_plans: Vec<MonthlyPlanInput>,
) -> Result<WorkCategory, String> {
    validate_plans(&monthly_plans)?;
    let mut conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    work_category::update(&mut conn, id, &code, &name, planned_hours, &monthly_plans)
}

/// 作業区分を削除する（R-CAT-5）。月予定・実績はカスケード削除（R-DATA-4）。
#[tauri::command]
pub fn delete_work_category(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    work_category::delete(&conn, id)
}

// =====================================================================
// 実績工数（F2）コマンド（T-05）
// =====================================================================

/// 作業日の形式が `yyyy/mm/dd` かを検証する（R-ACT-8）。
///
/// 月は `01`〜`12`、日は `01`〜`31` の範囲を受け付ける（暦の厳密判定は行わない）。
fn validate_date_format(work_date: &str) -> Result<(), String> {
    let bytes = work_date.as_bytes();
    let valid = bytes.len() == 10
        && bytes[4] == b'/'
        && bytes[7] == b'/'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..7].iter().all(u8::is_ascii_digit)
        && bytes[8..].iter().all(u8::is_ascii_digit);
    if !valid {
        return Err(format!(
            "作業日は yyyy/mm/dd 形式で入力してください（入力値: {work_date}）"
        ));
    }
    let month: u32 = work_date[5..7]
        .parse()
        .map_err(|_| format!("作業日の月が不正です（入力値: {work_date}）"))?;
    let day: u32 = work_date[8..]
        .parse()
        .map_err(|_| format!("作業日の日が不正です（入力値: {work_date}）"))?;
    if !(1..=12).contains(&month) {
        return Err(format!(
            "作業日の月は01〜12で入力してください（入力値: {work_date}）"
        ));
    }
    if !(1..=31).contains(&day) {
        return Err(format!(
            "作業日の日は01〜31で入力してください（入力値: {work_date}）"
        ));
    }
    Ok(())
}

/// 実績工数を絞り込み条件付きで一覧取得する（R-ACT-3 / R-ACT-4）。
///
/// 期間（from/to）・作業区分はいずれも任意。指定が無ければ全件を作業日昇順で返す。
#[tauri::command]
pub fn list_actual_works(
    state: State<'_, AppState>,
    from_date: Option<String>,
    to_date: Option<String>,
    work_category_id: Option<i64>,
) -> Result<Vec<ActualWork>, String> {
    let filter = ActualWorkFilter {
        from_date,
        to_date,
        work_category_id,
    };
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    actual_work::list(&conn, &filter)
}

/// 実績工数を登録する（R-ACT-1）。作業日は yyyy/mm/dd（R-ACT-8）、メモは任意（R-ACT-9）。
#[tauri::command]
pub fn create_actual_work(
    state: State<'_, AppState>,
    work_category_id: i64,
    actual_hours: f64,
    work_date: String,
    memo: Option<String>,
) -> Result<ActualWork, String> {
    validate_date_format(&work_date)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    actual_work::create(&conn, work_category_id, actual_hours, &work_date, memo.as_deref())
}

/// 実績工数を更新する（R-ACT-5）。作業日は yyyy/mm/dd（R-ACT-8）、メモは任意（R-ACT-9）。
#[tauri::command]
pub fn update_actual_work(
    state: State<'_, AppState>,
    id: i64,
    work_category_id: i64,
    actual_hours: f64,
    work_date: String,
    memo: Option<String>,
) -> Result<ActualWork, String> {
    validate_date_format(&work_date)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    actual_work::update(
        &conn,
        id,
        work_category_id,
        actual_hours,
        &work_date,
        memo.as_deref(),
    )
}

/// 実績工数を削除する（R-ACT-6）。
#[tauri::command]
pub fn delete_actual_work(state: State<'_, AppState>, id: i64) -> Result<(), String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    actual_work::delete(&conn, id)
}

// =====================================================================
// 設定（F4）コマンド（T-06）
// =====================================================================

/// 基準線が数値かつ0以上であることを検証する（R-NF-2 と同等の数値0以上ルール）。
fn validate_baseline_hours(baseline_hours: f64) -> Result<(), String> {
    if !baseline_hours.is_finite() {
        return Err("基準線には有効な数値を入力してください".to_string());
    }
    if baseline_hours < 0.0 {
        return Err(format!(
            "基準線は0以上で入力してください（入力値: {baseline_hours}）"
        ));
    }
    Ok(())
}

/// 設定（基準線）を取得する（R-SET-1）。初期値は8（R-SET-3）。
#[tauri::command]
pub fn get_setting(state: State<'_, AppState>) -> Result<Setting, String> {
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    setting::get(&conn)
}

/// 基準線を更新し保存する（R-SET-2）。
#[tauri::command]
pub fn update_setting(
    state: State<'_, AppState>,
    baseline_hours: f64,
) -> Result<Setting, String> {
    validate_baseline_hours(baseline_hours)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    setting::update(&conn, baseline_hours)
}

// =====================================================================
// ダッシュボード集計（F3）コマンド（T-07）
// =====================================================================
//
// 集計ロジックはRust側（`aggregate`）に集約する（R-ARCH-4）。
// コマンド層は対象月の形式検証とロック取得のみを担い、構築は委譲する。

/// 月単位の予定/実績集計（区分別・全体）を返す（R-DASH-5 / R-DASH-6）。
#[tauri::command]
pub fn get_dashboard_summary(
    state: State<'_, AppState>,
    year_month: String,
) -> Result<DashboardSummary, String> {
    validate_month_format(&year_month)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    aggregate::dashboard_summary(&conn, &year_month)
}

/// 日別×区分別の実績積み上げデータ（基準線同梱）を返す（R-DASH-11）。
#[tauri::command]
pub fn get_daily_stacked(
    state: State<'_, AppState>,
    year_month: String,
) -> Result<DailyStacked, String> {
    validate_month_format(&year_month)?;
    let conn = state
        .db
        .lock()
        .map_err(|e| format!("DB接続のロック取得に失敗しました: {e}"))?;
    aggregate::daily_stacked(&conn, &year_month)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validate_baseline_hours_accepts_non_negative() {
        // R-SET-2 の保存前検証。0以上の有限数を受け付ける。
        assert!(validate_baseline_hours(8.0).is_ok());
        assert!(validate_baseline_hours(0.0).is_ok());
        assert!(validate_baseline_hours(7.5).is_ok());
    }

    #[test]
    fn validate_baseline_hours_rejects_invalid() {
        assert!(validate_baseline_hours(-1.0).is_err(), "負数は不可");
        assert!(validate_baseline_hours(f64::NAN).is_err(), "NaNは不可");
        assert!(validate_baseline_hours(f64::INFINITY).is_err(), "無限大は不可");
    }

    #[test]
    fn validate_month_format_accepts_yyyy_mm() {
        // R-CAT-9: yyyy/mm 形式を受け付ける。
        assert!(validate_month_format("2026/06").is_ok());
        assert!(validate_month_format("2026/01").is_ok());
        assert!(validate_month_format("2026/12").is_ok());
    }

    #[test]
    fn validate_month_format_rejects_invalid() {
        assert!(validate_month_format("2026-06").is_err(), "区切りが不正");
        assert!(validate_month_format("2026/6").is_err(), "桁不足");
        assert!(validate_month_format("26/06").is_err(), "年桁不足");
        assert!(validate_month_format("2026/13").is_err(), "月範囲外");
        assert!(validate_month_format("2026/00").is_err(), "月範囲外");
        assert!(validate_month_format("2026/06/01").is_err(), "日付は不可");
        assert!(validate_month_format("").is_err(), "空文字");
    }

    #[test]
    fn validate_plans_checks_all_entries() {
        let ok = vec![
            MonthlyPlanInput {
                target_month: "2026/06".into(),
                planned_hours: 40.0,
            },
            MonthlyPlanInput {
                target_month: "2026/07".into(),
                planned_hours: 20.0,
            },
        ];
        assert!(validate_plans(&ok).is_ok());

        let ng = vec![MonthlyPlanInput {
            target_month: "2026/6".into(),
            planned_hours: 40.0,
        }];
        assert!(validate_plans(&ng).is_err());
    }

    #[test]
    fn validate_date_format_accepts_yyyy_mm_dd() {
        // R-ACT-8: yyyy/mm/dd 形式を受け付ける。
        assert!(validate_date_format("2026/06/27").is_ok());
        assert!(validate_date_format("2026/01/01").is_ok());
        assert!(validate_date_format("2026/12/31").is_ok());
    }

    #[test]
    fn validate_date_format_rejects_invalid() {
        assert!(validate_date_format("2026-06-27").is_err(), "区切りが不正");
        assert!(validate_date_format("2026/6/27").is_err(), "月桁不足");
        assert!(validate_date_format("2026/06/7").is_err(), "日桁不足");
        assert!(validate_date_format("2026/13/01").is_err(), "月範囲外");
        assert!(validate_date_format("2026/00/01").is_err(), "月範囲外");
        assert!(validate_date_format("2026/06/32").is_err(), "日範囲外");
        assert!(validate_date_format("2026/06/00").is_err(), "日範囲外");
        assert!(validate_date_format("2026/06").is_err(), "月までは不可");
        assert!(validate_date_format("").is_err(), "空文字");
    }
}
