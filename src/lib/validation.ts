// =====================================================================
// 入力バリデーション共通モジュール（T-15）。
//
// 必須・数値0以上のバリデーションをフロントエンド側で一元化する。Rust側
// （src-tauri/src/commands.rs の validate_required / validate_non_negative ほか）
// と同一ルールを二重に適用する（R-NF-2）。各画面はここを経由して検証し、
// フォーム単位の検証は最初に見つかったエラーメッセージ（または null）を返す。
//
// 対応EARS: R-CAT-7（必須）/ R-CAT-8（予定工数0以上）/ R-ACT-7（実績時間0以上）/
//           R-NF-2（必須・数値0以上をフロント/Rust双方で検証）。
// =====================================================================

import { isValidDate, isValidMonth } from "./format";

/** 必須文字列項目が空（空白のみ）でないことを検証する（R-CAT-7 / R-NF-2）。 */
export function validateRequired(value: string, label: string): string | null {
  return value.trim() === "" ? `${label}を入力してください。` : null;
}

/**
 * 数値項目が「数値かつ0以上」であることを検証する（R-CAT-8 / R-ACT-7 / R-NF-2）。
 * 空文字・非数値・負数を拒否する。値は入力中の文字列として受け取る。
 */
export function validateNonNegativeNumber(
  value: string,
  label: string,
): string | null {
  const n = Number(value);
  if (value.trim() === "" || Number.isNaN(n)) {
    return `${label}を数値で入力してください。`;
  }
  if (n < 0) return `${label}は0以上で入力してください。`;
  return null;
}

/** 作業区分フォームの入力値（数値は編集中の文字列で保持）。 */
export interface CategoryFormValues {
  code: string;
  name: string;
  plannedHours: string;
  plans: { targetMonth: string; plannedHours: string }[];
}

/**
 * 作業区分フォームを検証する（R-CAT-7 / R-CAT-8 / R-CAT-9 / R-NF-2）。
 * 問題があれば最初のエラーメッセージを、問題なければ null を返す。
 */
export function validateCategoryForm(v: CategoryFormValues): string | null {
  const base =
    validateRequired(v.code, "コード") ??
    validateRequired(v.name, "名前") ??
    validateNonNegativeNumber(v.plannedHours, "予定工数");
  if (base) return base;
  for (const p of v.plans) {
    if (!isValidMonth(p.targetMonth)) {
      return `月予定の対象月は yyyy/mm 形式で入力してください（入力値: ${p.targetMonth || "空"}）。`;
    }
    const planError = validateNonNegativeNumber(p.plannedHours, "月予定の予定工数");
    if (planError) return planError;
  }
  return null;
}

/** 実績工数フォームの入力値（数値は編集中の文字列で保持）。 */
export interface ActualFormValues {
  workCategoryId: string;
  actualHours: string;
  workDate: string;
}

/**
 * 実績工数フォームを検証する（R-ACT-7 / R-ACT-8 / R-NF-2）。
 * 問題があれば最初のエラーメッセージを、問題なければ null を返す。
 */
export function validateActualForm(v: ActualFormValues): string | null {
  if (v.workCategoryId.trim() === "") {
    return "作業区分を選択してください。";
  }
  const hoursError = validateNonNegativeNumber(v.actualHours, "実績時間");
  if (hoursError) return hoursError;
  if (!isValidDate(v.workDate)) {
    return `作業日は yyyy/mm/dd 形式で入力してください（入力値: ${v.workDate || "空"}）。`;
  }
  return null;
}

/** 基準線フォームを検証する（R-SET-2 / R-NF-2）。 */
export function validateBaseline(value: string): string | null {
  return validateNonNegativeNumber(value, "基準線");
}
