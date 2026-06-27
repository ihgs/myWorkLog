// =====================================================================
// 実績工数に対する共通アクション。複数ページで重複しがちな「確認ダイアログ付き
// 削除」をここに集約する（R-ACT-6）。コマンド失敗は呼び出し側のトースト通知に
// 委譲する（R-NF-1）。
// =====================================================================

import { deleteActualWork } from "./api";
import type { ActualWork, WorkCategory } from "./types";

/**
 * 確認ダイアログを表示し、承認されたら実績工数を削除する。
 * 削除に成功したら true、キャンセル/失敗なら false を返す。
 * @param notifyError コマンド失敗時の通知関数（lib/toast の notifyError を想定）。
 */
export async function confirmAndDeleteActualWork(
  work: ActualWork,
  categoryById: Map<number, WorkCategory>,
  notifyError: (e: unknown) => void,
): Promise<boolean> {
  const category = categoryById.get(work.workCategoryId);
  const label = category ? `${category.code} / ${category.name}` : "作業区分";
  const ok = window.confirm(
    `${work.workDate} の実績工数（${label}・${work.actualHours}h）を削除します。\n` +
      "削除してよろしいですか？",
  );
  if (!ok) return false;
  try {
    await deleteActualWork(work.id);
    return true;
  } catch (err) {
    notifyError(err);
    return false;
  }
}
