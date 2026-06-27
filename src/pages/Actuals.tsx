// =====================================================================
// 実績入力画面（T-12）。
//
// 実績工数の一覧・登録・編集・削除を UI から行う。作業区分は既存の作業区分から
// セレクトで選択させ、任意のコード・名前を自由入力させない（R-ACT-2）。一覧では
// 作業日・作業区分・実績時間・メモを表示する（R-ACT-3）。期間（from〜to）および
// 作業区分による絞り込みに対応する（R-ACT-4）。
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
import { currentDate } from "../lib/format";
import { useToast } from "../lib/toast";
import { validateActualForm } from "../lib/validation";
import type { ActualWork, WorkCategory } from "../lib/types";

/** 編集中フォームの状態（数値も編集中は文字列で保持する）。`id` が null なら新規登録。 */
interface FormState {
  id: number | null;
  workCategoryId: string;
  actualHours: string;
  workDate: string;
  memo: string;
}

/** 絞り込み条件（R-ACT-4）。空欄は未指定。 */
interface FilterState {
  fromDate: string;
  toDate: string;
  workCategoryId: string;
}

function emptyForm(): FormState {
  return {
    id: null,
    workCategoryId: "",
    actualHours: "",
    workDate: currentDate(),
    memo: "",
  };
}

const emptyFilter: FilterState = {
  fromDate: "",
  toDate: "",
  workCategoryId: "",
};

function toFormState(work: ActualWork): FormState {
  return {
    id: work.id,
    workCategoryId: String(work.workCategoryId),
    actualHours: String(work.actualHours),
    workDate: work.workDate,
    memo: work.memo ?? "",
  };
}

function Actuals() {
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [works, setWorks] = useState<ActualWork[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [filter, setFilter] = useState<FilterState>(emptyFilter);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const isEditing = form.id !== null;

  /** 作業区分IDから区分（コード/名前）を引くための索引（R-ACT-3 の表示用）。 */
  const categoryById = useMemo(() => {
    const map = new Map<number, WorkCategory>();
    for (const c of categories) map.set(c.id, c);
    return map;
  }, [categories]);

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

  function resetForm() {
    setForm(emptyForm());
  }

  function startEdit(work: ActualWork) {
    setForm(toFormState(work));
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // フロント側バリデーション（R-ACT-7 / R-NF-2）。Rust側でも二重に検証する。
    const message = validateActualForm(form);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    const memo = form.memo.trim() === "" ? null : form.memo.trim();
    try {
      if (form.id === null) {
        await createActualWork({
          workCategoryId: Number(form.workCategoryId),
          actualHours: Number(form.actualHours),
          workDate: form.workDate,
          memo,
        });
      } else {
        await updateActualWork({
          id: form.id,
          workCategoryId: Number(form.workCategoryId),
          actualHours: Number(form.actualHours),
          workDate: form.workDate,
          memo,
        });
      }
      resetForm();
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
      if (form.id === work.id) resetForm();
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

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form className="category-form" onSubmit={handleSubmit}>
        <h2>{isEditing ? "実績工数の編集" : "実績工数の登録"}</h2>
        <div className="field-row">
          <label>
            作業区分
            <select
              value={form.workCategoryId}
              onChange={(e) =>
                setForm((f) => ({ ...f, workCategoryId: e.target.value }))
              }
            >
              <option value="">選択してください</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} / {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            実績時間(h)
            <input
              type="number"
              step="0.5"
              min="0"
              value={form.actualHours}
              onChange={(e) =>
                setForm((f) => ({ ...f, actualHours: e.target.value }))
              }
              placeholder="6"
            />
          </label>
          <label>
            作業日
            <input
              type="text"
              value={form.workDate}
              onChange={(e) =>
                setForm((f) => ({ ...f, workDate: e.target.value }))
              }
              placeholder="2026/06/27"
            />
          </label>
          <label>
            メモ（任意）
            <input
              type="text"
              value={form.memo}
              onChange={(e) => setForm((f) => ({ ...f, memo: e.target.value }))}
              placeholder="設計"
            />
          </label>
        </div>

        {categories.length === 0 && (
          <p className="muted">
            登録できる作業区分がありません。先に作業区分を登録してください。
          </p>
        )}

        <div className="form-actions">
          <button type="submit" disabled={categories.length === 0}>
            {isEditing ? "更新を確定" : "登録を確定"}
          </button>
          {isEditing && (
            <button type="button" onClick={resetForm} className="secondary">
              キャンセル
            </button>
          )}
        </div>
      </form>

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
                <td>
                  {w.memo ? w.memo : <span className="muted">-</span>}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => startEdit(w)}
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
    </section>
  );
}

export default Actuals;
