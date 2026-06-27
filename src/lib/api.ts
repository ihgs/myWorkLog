// =====================================================================
// Tauri コマンドの型付き invoke ラッパ（T-10）。
//
// フロントエンド ↔ Rust の境界はここに集約する。画面/コンポーネントは
// `@tauri-apps/api/core` の `invoke` を直接呼ばず、本モジュールの関数経由で
// データ取得・更新を行う（R-ARCH-2）。各コマンドは Rust 側で `Result<T, String>`
// を返し、`Err` は invoke が reject する Promise として伝播する（R-NF-1）。
//
// コマンド名・引数・戻り値は basic-design.md 7章 / `src-tauri/src/commands.rs`
// と一致させる。引数キーは Rust コマンドの仮引数名（snake_case）。
// =====================================================================

import { invoke } from "@tauri-apps/api/core";
import type {
  ActualWork,
  DailyStacked,
  DashboardSummary,
  MonthlyPlanInput,
  Setting,
  WorkCategory,
} from "./types";

// ---------------------------------------------------------------------
// 作業区分（F1）
// ---------------------------------------------------------------------

/** 全作業区分を月予定同梱で取得する（R-CAT-3）。 */
export function listWorkCategories(): Promise<WorkCategory[]> {
  return invoke<WorkCategory[]>("list_work_categories");
}

/** 作業区分を月予定とともに登録する（R-CAT-1）。 */
export function createWorkCategory(args: {
  code: string;
  name: string;
  plannedHours: number;
  monthlyPlans: MonthlyPlanInput[];
}): Promise<WorkCategory> {
  return invoke<WorkCategory>("create_work_category", {
    code: args.code,
    name: args.name,
    plannedHours: args.plannedHours,
    monthlyPlans: args.monthlyPlans,
  });
}

/** 作業区分の内容（月予定含む）を更新する（R-CAT-4）。 */
export function updateWorkCategory(args: {
  id: number;
  code: string;
  name: string;
  plannedHours: number;
  monthlyPlans: MonthlyPlanInput[];
}): Promise<WorkCategory> {
  return invoke<WorkCategory>("update_work_category", {
    id: args.id,
    code: args.code,
    name: args.name,
    plannedHours: args.plannedHours,
    monthlyPlans: args.monthlyPlans,
  });
}

/** 作業区分を削除する（R-CAT-5）。関連は Rust 側でカスケード削除（R-DATA-4）。 */
export function deleteWorkCategory(id: number): Promise<void> {
  return invoke<void>("delete_work_category", { id });
}

// ---------------------------------------------------------------------
// 実績工数（F2）
// ---------------------------------------------------------------------

/** 実績工数を絞り込み条件付きで一覧取得する（R-ACT-3 / R-ACT-4）。 */
export function listActualWorks(filter?: {
  fromDate?: string;
  toDate?: string;
  workCategoryId?: number;
}): Promise<ActualWork[]> {
  return invoke<ActualWork[]>("list_actual_works", {
    fromDate: filter?.fromDate ?? null,
    toDate: filter?.toDate ?? null,
    workCategoryId: filter?.workCategoryId ?? null,
  });
}

/** 実績工数を登録する（R-ACT-1）。 */
export function createActualWork(args: {
  workCategoryId: number;
  actualHours: number;
  workDate: string;
  memo?: string | null;
}): Promise<ActualWork> {
  return invoke<ActualWork>("create_actual_work", {
    workCategoryId: args.workCategoryId,
    actualHours: args.actualHours,
    workDate: args.workDate,
    memo: args.memo ?? null,
  });
}

/** 実績工数を更新する（R-ACT-5）。 */
export function updateActualWork(args: {
  id: number;
  workCategoryId: number;
  actualHours: number;
  workDate: string;
  memo?: string | null;
}): Promise<ActualWork> {
  return invoke<ActualWork>("update_actual_work", {
    id: args.id,
    workCategoryId: args.workCategoryId,
    actualHours: args.actualHours,
    workDate: args.workDate,
    memo: args.memo ?? null,
  });
}

/** 実績工数を削除する（R-ACT-6）。 */
export function deleteActualWork(id: number): Promise<void> {
  return invoke<void>("delete_actual_work", { id });
}

// ---------------------------------------------------------------------
// 設定（F4）
// ---------------------------------------------------------------------

/** 設定（基準線）を取得する（R-SET-1）。 */
export function getSetting(): Promise<Setting> {
  return invoke<Setting>("get_setting");
}

/** 基準線を更新し保存する（R-SET-2）。 */
export function updateSetting(baselineHours: number): Promise<Setting> {
  return invoke<Setting>("update_setting", { baselineHours });
}

// ---------------------------------------------------------------------
// ダッシュボード集計（F3）
// ---------------------------------------------------------------------

/** 月単位の予定/実績集計（区分別・全体）を取得する（R-DASH-5 / R-DASH-6）。 */
export function getDashboardSummary(
  yearMonth: string,
): Promise<DashboardSummary> {
  return invoke<DashboardSummary>("get_dashboard_summary", { yearMonth });
}

/** 日別×区分別の実績積み上げデータ（基準線同梱）を取得する（R-DASH-11）。 */
export function getDailyStacked(yearMonth: string): Promise<DailyStacked> {
  return invoke<DailyStacked>("get_daily_stacked", { yearMonth });
}
