//! ドメインモデル / DTO（T-03）。
//!
//! `specs/data-model.dbml` を正として、各エンティティを表す構造体を定義する。
//! フロントエンドとは Tauri コマンド（`invoke`）の戻り値として serde 経由で
//! やり取りするため、`serde::Serialize` / `Deserialize` を derive する（R-ARCH-2）。
//!
//! フィールド名は JSON 上で camelCase に揃える（`#[serde(rename_all = "camelCase")]`）。
//! DBアクセス/SQLはリポジトリ層（`repository`）に閉じ、ここには持ち込まない（R-ARCH-1 / R-ARCH-3）。

use serde::{Deserialize, Serialize};

/// 作業区分（`work_category`）。月予定・実績工数の親エンティティ。
///
/// `monthly_plans` は一覧取得時に同一作業区分に紐づく月予定を同梱するための
/// 集約フィールド（テーブルには存在せず、リポジトリ層で組み立てる）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkCategory {
    pub id: i64,
    /// コード。重複可能（ユニーク制約なし）。
    pub code: String,
    pub name: String,
    /// 予定工数（全体）。時間(h)。月別集計には使用しない参考値。
    pub planned_hours: f64,
    /// 作成日時（ISO8601）。
    pub created_at: String,
    /// 更新日時（ISO8601）。
    pub updated_at: String,
    /// この作業区分に紐づく月予定（集約）。
    #[serde(default)]
    pub monthly_plans: Vec<MonthlyPlan>,
}

/// 月予定（`monthly_plan`）。作業区分ごと・対象月ごとの予定工数。
///
/// ダッシュボードの月別予定値の唯一の元データ（R-DASH-5）。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyPlan {
    pub id: i64,
    pub work_category_id: i64,
    /// 対象月。`yyyy/mm` 形式（R-CAT-9）。
    pub target_month: String,
    /// その月の予定工数。時間(h)。
    pub planned_hours: f64,
}

/// 月予定の新規入力値（id を持たない）。作業区分の登録/編集時に受け取る。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyPlanInput {
    /// 対象月。`yyyy/mm` 形式（R-CAT-9）。
    pub target_month: String,
    pub planned_hours: f64,
}

/// 実績工数（`actual_work`）。作業区分を選んで入力した日々の作業実績。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActualWork {
    pub id: i64,
    pub work_category_id: i64,
    /// 実績時間。時間(h)。
    pub actual_hours: f64,
    /// 作業日。`yyyy/mm/dd` 形式（R-ACT-8）。
    pub work_date: String,
    /// メモ（任意・NULL許容）（R-ACT-9）。
    pub memo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

/// アプリケーション設定（`setting`）。基準線などを単一レコードで保持。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Setting {
    pub id: i64,
    /// 日別積み上げグラフの基準線。1日の目安時間。デフォルト8。
    pub baseline_hours: f64,
}

/// 実績工数一覧の絞り込み条件（R-ACT-4）。いずれも任意。
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActualWorkFilter {
    /// 期間開始日（`yyyy/mm/dd`、この日を含む）。
    pub from_date: Option<String>,
    /// 期間終了日（`yyyy/mm/dd`、この日を含む）。
    pub to_date: Option<String>,
    /// 作業区分での絞り込み。
    pub work_category_id: Option<i64>,
}
