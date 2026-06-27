// =====================================================================
// 実績入力画面（T-12）。
//
// 実績工数の一覧・登録・編集・削除を UI から行う。登録は「作業日」を基準に、
// その月（yyyy/mm）に月予定が登録されている作業区分のみをボタンとして提示し、
// ボタンをクリックすると実績時間・メモを入力するダイアログを開く。作業区分は
// 既存の作業区分から選ぶ形となり、任意のコード・名前を自由入力させない
// （R-ACT-2）。一覧では作業日・作業区分・実績時間・メモを表示する（R-ACT-3）。
// 期間（from〜to）および作業区分による絞り込みに対応する（R-ACT-4）。
//
// 全データ授受は lib/api の invoke ラッパ経由（R-ARCH-2）。作業日・月の表示は
// yyyy/mm/dd 形式で統一する（R-UI-2）。入力バリデーションは共通モジュール
// （lib/validation）でフロント側を一元化し、必須・数値0以上を Rust 側と二重に
// 検証する（R-ACT-7 / R-NF-2）。コマンド失敗は共通トースト（lib/toast）で
// ユーザーへ通知する（R-NF-1）。
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import {
  createActualWork,
  deleteActualWork,
  listActualWorks,
  listWorkCategories,
  updateActualWork,
} from "../lib/api";
import { currentDate, dateToMonth, isValidDate } from "../lib/format";
import { useToast } from "../lib/toast";
import { validateNonNegativeNumber } from "../lib/validation";
import type { ActualWork, WorkCategory } from "../lib/types";

/**
 * 実績時間・メモを入力するダイアログの状態。`id` が null なら新規登録、
 * それ以外は当該実績工数の編集。作業区分・作業日は確定済みとして保持する。
 */
interface DialogState {
  id: number | null;
  category: WorkCategory;
  workDate: string;
  actualHours: string;
  memo: string;
  error: string | null;
}

/** 絞り込み条件（R-ACT-4）。空欄は未指定。 */
interface FilterState {
  fromDate: string;
  toDate: string;
  workCategoryId: string;
}

const emptyFilter: FilterState = {
  fromDate: "",
  toDate: "",
  workCategoryId: "",
};

function Actuals() {
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [works, setWorks] = useState<ActualWork[]>([]);
  // 登録の基準となる作業日。ここから対象月を導出してボタンを並べる。
  const [workDate, setWorkDate] = useState<string>(currentDate);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [filter, setFilter] = useState<FilterState>(emptyFilter);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  /** 作業区分IDから区分（コード/名前）を引くための索引（R-ACT-3 の表示用）。 */
  const categoryById = useMemo(() => {
    const map = new Map<number, WorkCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

  /** 作業日から導いた対象月（`yyyy/mm`）。不正な日付なら null。 */
  const targetMonth = useMemo(() => dateToMonth(workDate), [workDate]);

  /** 対象月に月予定が登録されている作業区分のみをボタン化する。 */
  const monthCategories = useMemo(() => {
    if (!targetMonth) return [];
    return categories.filter((c) =>
      c.monthlyPlans.some((p) => p.targetMonth === targetMonth),
    );
  }, [categories, targetMonth]);

  /** 現在の絞り込み条件で実績工数を取得する（R-ACT-4）。 */
  async function reloadWorks(current: FilterState) {
    setLoading(true);
    try {
      const wcid = current.workCategoryId.trim();
      setWorks(
        await listActualWorks({
          fromDate: current.fromDate.trim() || undefined,
          toDate: current.toDate.trim() || undefined,
          workCategoryId: wcid ? Number(wcid) : undefined,
        }),
      );
    } catch (e) {
      toast.notifyError(e);
    } finally {
      setLoading(false);
    }
  }

  async function reloadCategories() {
    try {
      setCategories(await listWorkCategories());
    } catch (e) {
      toast.notifyError(e);
    }
  }

  useEffect(() => {
    void reloadCategories();
    void reloadWorks(emptyFilter);
  }, []);

  /** 区分ボタンのクリック → 当該区分・作業日で新規入力ダイアログを開く。 */
  function openCreateDialog(category: WorkCategory) {
    setDialog({
      id: null,
      category,
      workDate,
      actualHours: "",
      memo: "",
      error: null,
    });
  }

  /** 一覧の「編集」 → 当該実績工数の値でダイアログを開く。 */
  function openEditDialog(work: ActualWork) {
    const category = categoryById.get(work.workCategoryId);
    if (!category) {
      toast.notifyError("対象の作業区分が見つかりませんでした。");
      return;
    }
    setDialog({
      id: work.id,
      category,
      workDate: work.workDate,
      actualHours: String(work.actualHours),
      memo: work.memo ?? "",
      error: null,
    });
  }

  function closeDialog() {
    setDialog(null);
  }

  async function submitDialog(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    // フロント側バリデーション（R-ACT-7 / R-NF-2）。Rust側でも二重に検証する。
    const message = validateNonNegativeNumber(dialog.actualHours, "実績時間");
    if (message) {
      setDialog({ ...dialog, error: message });
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
      closeDialog();
      await reloadWorks(filter);
    } catch (err) {
      // コマンド失敗（Rust側バリデーション拒否を含む）をユーザーへ通知（R-NF-1）。
      toast.notifyError(err);
    }
  }

  async function handleDelete(work: ActualWork) {
    const category = categoryById.get(work.workCategoryId);
    const label = category ? `${category.code} / ${category.name}` : "作業区分";
    const ok = window.confirm(
      `${work.workDate} の実績工数（${label}・${work.actualHours}h）を削除します。\n` +
        "削除してよろしいですか？",
    );
    if (!ok) return;
    try {
      await deleteActualWork(work.id);
      if (dialog?.id === work.id) closeDialog();
      await reloadWorks(filter);
    } catch (err) {
      toast.notifyError(err);
    }
  }

  async function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    await reloadWorks(filter);
  }

  async function clearFilter() {
    setFilter(emptyFilter);
    await reloadWorks(emptyFilter);
  }

  function categoryLabel(id: number): string {
    const c = categoryById.get(id);
    return c ? `${c.code} / ${c.name}` : `#${id}`;
  }

  const totalCount = works.length;

  return (
    <section className="actuals-page">
      <h1>実績入力</h1>

      <div className="actual-entry">
        <h2>実績工数の登録</h2>
        <label className="month-input">
          作業日
          <input
            type="text"
            value={workDate}
            onChange={(e) => setWorkDate(e.target.value)}
            placeholder="2026/06/27"
          />
        </label>

        {!isValidDate(workDate) ? (
          <p className="form-error" role="alert">
            作業日は yyyy/mm/dd 形式で入力してください。
          </p>
        ) : monthCategories.length === 0 ? (
          <p className="muted">
            {targetMonth} に月予定が登録されている作業区分がありません。先に作業区分へ
            当月の月予定を登録してください。
          </p>
        ) : (
          <>
            <p className="muted">
              {targetMonth} の作業区分です。ボタンを押して実績を入力してください。
            </p>
            <div className="actual-buttons">
              {monthCategories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="category-button"
                  onClick={() => openCreateDialog(c)}
                >
                  <span className="category-button-code">{c.code}</span>
                  <span className="category-button-name">{c.name}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <form className="filter-bar" onSubmit={applyFilter}>
        <h2>絞り込み</h2>
        <div className="field-row">
          <label>
            開始日（from）
            <input
              type="text"
              value={filter.fromDate}
              onChange={(e) =>
                setFilter((f) => ({ ...f, fromDate: e.target.value }))
              }
              placeholder="2026/06/01"
            />
          </label>
          <label>
            終了日（to）
            <input
              type="text"
              value={filter.toDate}
              onChange={(e) =>
                setFilter((f) => ({ ...f, toDate: e.target.value }))
              }
              placeholder="2026/06/30"
            />
          </label>
          <label>
            作業区分
            <select
              value={filter.workCategoryId}
              onChange={(e) =>
                setFilter((f) => ({ ...f, workCategoryId: e.target.value }))
              }
            >
              <option value="">すべて</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} / {c.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="form-actions">
          <button type="submit">絞り込む</button>
          <button type="button" onClick={clearFilter} className="secondary">
            条件クリア
          </button>
        </div>
      </form>

      <h2>一覧（{totalCount} 件）</h2>
      {loading && <p className="muted">読み込み中...</p>}
      {!loading && works.length === 0 && (
        <p className="muted">該当する実績工数はありません。</p>
      )}
      {works.length > 0 && (
        <table className="category-table">
          <thead>
            <tr>
              <th>作業日</th>
              <th>作業区分</th>
              <th>実績時間(h)</th>
              <th>メモ</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {works.map((w) => (
              <tr key={w.id}>
                <td>{w.workDate}</td>
                <td>{categoryLabel(w.workCategoryId)}</td>
                <td>{w.actualHours}</td>
                <td>{w.memo ? w.memo : <span className="muted">-</span>}</td>
                <td>
                  <button
                    type="button"
                    onClick={() => openEditDialog(w)}
                    className="secondary"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(w)}
                    className="danger"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {dialog && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={closeDialog}
        >
          <div
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label="実績工数の入力"
            onClick={(e) => e.stopPropagation()}
          >
            <form className="category-form" onSubmit={submitDialog}>
              <h2>
                {dialog.id === null ? "実績工数の登録" : "実績工数の編集"}
              </h2>
              <p className="modal-context">
                <span className="muted">作業区分</span>{" "}
                {dialog.category.code} / {dialog.category.name}
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
                      setDialog((d) =>
                        d ? { ...d, actualHours: e.target.value } : d,
                      )
                    }
                    placeholder="6"
                  />
                </label>
                <label>
                  メモ（任意）
                  <input
                    type="text"
                    value={dialog.memo}
                    onChange={(e) =>
                      setDialog((d) => (d ? { ...d, memo: e.target.value } : d))
                    }
                    placeholder="設計"
                  />
                </label>
              </div>

              <div className="form-actions">
                <button type="submit">
                  {dialog.id === null ? "登録を確定" : "更新を確定"}
                </button>
                <button
                  type="button"
                  onClick={closeDialog}
                  className="secondary"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default Actuals;
