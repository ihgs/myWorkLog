// =====================================================================
// フロントエンドの型定義（T-10）。
//
// Rust 側ドメインモデル/DTO（`src-tauri/src/models.rs`）と一対一で対応する。
// serde の `rename_all = "camelCase"` に合わせ、JSON 上のフィールド名（camelCase）
// で定義する。全データ授受は Tauri コマンド（`invoke`）経由（R-ARCH-2）。
// =====================================================================

/// 月予定（`monthly_plan`）。作業区分ごと・対象月ごとの予定工数。
export interface MonthlyPlan {
  id: number;
  workCategoryId: number;
  /** 対象月。`yyyy/mm` 形式（R-CAT-9 / R-UI-2）。 */
  targetMonth: string;
  /** その月の予定工数。時間(h)。 */
  plannedHours: number;
}

/// 月予定の新規入力値（id を持たない）。作業区分の登録/編集時に渡す。
export interface MonthlyPlanInput {
  /** 対象月。`yyyy/mm` 形式（R-CAT-9 / R-UI-2）。 */
  targetMonth: string;
  plannedHours: number;
}

/// 作業区分（`work_category`）。月予定を同梱して取得される。
export interface WorkCategory {
  id: number;
  /** コード。重複可能（ユニーク制約なし）。 */
  code: string;
  name: string;
  /** 予定工数（全体）。時間(h)。 */
  plannedHours: number;
  /** 作成日時（ISO8601）。 */
  createdAt: string;
  /** 更新日時（ISO8601）。 */
  updatedAt: string;
  /** この作業区分に紐づく月予定（集約）。 */
  monthlyPlans: MonthlyPlan[];
}

/// 実績工数（`actual_work`）。
export interface ActualWork {
  id: number;
  workCategoryId: number;
  /** 実績時間。時間(h)。 */
  actualHours: number;
  /** 作業日。`yyyy/mm/dd` 形式（R-ACT-8 / R-UI-2）。 */
  workDate: string;
  /** メモ（任意・NULL許容）（R-ACT-9）。 */
  memo: string | null;
  createdAt: string;
  updatedAt: string;
}

/// アプリケーション設定（`setting`）。
export interface Setting {
  id: number;
  /** 日別積み上げグラフの基準線。1日の目安時間。 */
  baselineHours: number;
}

/// 全体の予定vs実績合計。
export interface SummaryTotal {
  plannedHours: number;
  actualHours: number;
}

/// 作業区分別の予定vs実績。
export interface CategorySummary {
  workCategoryId: number;
  code: string;
  name: string;
  /** 当月の月予定（無ければ0）。 */
  plannedHours: number;
  /** 当月の実績合計。 */
  actualHours: number;
}

/// 月単位の予定/実績集計（`get_dashboard_summary` の戻り値）。
export interface DashboardSummary {
  /** 対象月（`yyyy/mm`）。 */
  yearMonth: string;
  total: SummaryTotal;
  categories: CategorySummary[];
}

/// 日別積み上げの1セグメント（作業区分ごと）。
export interface DailyCategoryHours {
  workCategoryId: number;
  name: string;
  hours: number;
}

/// 1日分の積み上げデータ。
export interface DailyEntry {
  /** 作業日（`yyyy/mm/dd`）。 */
  date: string;
  totalHours: number;
  byCategory: DailyCategoryHours[];
}

/// 日別×区分別の実績積み上げデータ（`get_daily_stacked` の戻り値）。
export interface DailyStacked {
  /** 対象月（`yyyy/mm`）。 */
  yearMonth: string;
  /** 基準線（`setting.baseline_hours`）。 */
  baselineHours: number;
  /** 1日〜月末まで全ての日。 */
  days: DailyEntry[];
}
