// =====================================================================
// 実績工数の入力ダイアログ（モーダル）。実績入力ページ・実績一覧ページの双方で
// 共有する。作業区分・作業日は確定済みとして表示し、実績時間・メモのみを入力
// させる。登録（id=null）/編集（id!=null）を `createActualWork` /
// `updateActualWork` で確定する（R-ACT-1 / R-ACT-5）。入力検証は共通モジュール
// （lib/validation）を経由し、Rust 側と二重に検証する（R-ACT-7 / R-NF-2）。
// コマンド失敗は共通トースト（lib/toast）でユーザーへ通知する（R-NF-1）。
// =====================================================================

import { createActualWork, updateActualWork } from "../lib/api";
import { useToast } from "../lib/toast";
import { validateNonNegativeNumber } from "../lib/validation";
import type { WorkCategory } from "../lib/types";

/**
 * ダイアログの状態。`id` が null なら新規登録、それ以外は当該実績工数の編集。
 * 作業区分・作業日は確定済みとして保持する。
 */
export interface ActualDialogState {
  id: number | null;
  category: WorkCategory;
  workDate: string;
  actualHours: string;
  memo: string;
  error: string | null;
}

interface Props {
  dialog: ActualDialogState;
  onChange: (next: ActualDialogState) => void;
  onClose: () => void;
  /** 登録/更新が成功したとき（呼び出し側で一覧を再読込する）。 */
  onSaved: () => void;
}

function ActualWorkDialog({ dialog, onChange, onClose, onSaved }: Props) {
  const toast = useToast();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    // フロント側バリデーション（R-ACT-7 / R-NF-2）。Rust側でも二重に検証する。
    const message = validateNonNegativeNumber(dialog.actualHours, "実績時間");
    if (message) {
      onChange({ ...dialog, error: message });
      return;
    }
    const memo = dialog.memo.trim() === "" ? null : dialog.memo.trim();
    try {
      if (dialog.id === null) {
        await createActualWork({
          workCategoryId: dialog.category.id,
          actualHours: Number(dialog.actualHours),
          workDate: dialog.workDate,
          memo,
        });
      } else {
        await updateActualWork({
          id: dialog.id,
          workCategoryId: dialog.category.id,
          actualHours: Number(dialog.actualHours),
          workDate: dialog.workDate,
          memo,
        });
      }
      onSaved();
    } catch (err) {
      // コマンド失敗（Rust側バリデーション拒否を含む）をユーザーへ通知（R-NF-1）。
      toast.notifyError(err);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="実績工数の入力"
        onClick={(e) => e.stopPropagation()}
      >
        <form className="category-form" onSubmit={submit}>
          <h2>{dialog.id === null ? "実績工数の登録" : "実績工数の編集"}</h2>
          <p className="modal-context">
            <span className="muted">作業区分</span> {dialog.category.code} /{" "}
            {dialog.category.name}
            <br />
            <span className="muted">作業日</span> {dialog.workDate}
          </p>

          {dialog.error && (
            <p className="form-error" role="alert">
              {dialog.error}
            </p>
          )}

          <div className="field-row">
            <label>
              実績時間(h)
              <input
                type="number"
                step="0.5"
                min="0"
                autoFocus
                value={dialog.actualHours}
                onChange={(e) =>
                  onChange({ ...dialog, actualHours: e.target.value })
                }
                placeholder="6"
              />
            </label>
            <label>
              メモ（任意）
              <input
                type="text"
                value={dialog.memo}
                onChange={(e) => onChange({ ...dialog, memo: e.target.value })}
                placeholder="設計"
              />
            </label>
          </div>

          <div className="form-actions">
            <button type="submit">
              {dialog.id === null ? "登録を確定" : "更新を確定"}
            </button>
            <button type="button" onClick={onClose} className="secondary">
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ActualWorkDialog;
