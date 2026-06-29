// =====================================================================
// 作業区分画面（T-11）。
//
// 一覧・登録・編集・削除を UI から完結させる。月予定は複数入力でき、
// 対象月は yyyy/mm 形式で受け付ける（R-CAT-1 / R-CAT-3 / R-CAT-4 / R-CAT-9）。
// 削除時には関連する月予定・実績工数もカスケード削除される旨を確認ダイアログで
// 提示する（R-CAT-5 / R-CAT-6 / R-DATA-4）。
//
// 全データ授受は lib/api の invoke ラッパ経由（R-ARCH-2）。日付・月の表示は
// yyyy/mm 形式で統一する（R-UI-2）。入力バリデーションは共通モジュール
// （lib/validation）でフロント側を一元化し、必須・数値0以上を Rust 側と二重に
// 検証する（R-CAT-7 / R-CAT-8 / R-NF-2）。コマンド失敗は共通トースト（lib/toast）
// でユーザーへ通知する（R-NF-1）。
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import {
  createWorkCategory,
  deleteWorkCategory,
  listWorkCategories,
  updateWorkCategory,
} from "../lib/api";
import { useToast } from "../lib/toast";
import { validateCategoryForm } from "../lib/validation";
import type { MonthlyPlanInput, WorkCategory } from "../lib/types";

/** フォーム内の月予定行（数値も編集中は文字列で保持する）。 */
interface PlanRow {
  targetMonth: string;
  plannedHours: string;
}

/** 編集中フォームの状態。`id` が null なら新規登録。 */
interface FormState {
  id: number | null;
  code: string;
  name: string;
  plannedHours: string;
  plans: PlanRow[];
}

const emptyForm: FormState = {
  id: null,
  code: "",
  name: "",
  plannedHours: "",
  plans: [],
};

function toFormState(category: WorkCategory): FormState {
  return {
    id: category.id,
    code: category.code,
    name: category.name,
    plannedHours: String(category.plannedHours),
    plans: category.monthlyPlans.map((p) => ({
      targetMonth: p.targetMonth,
      plannedHours: String(p.plannedHours),
    })),
  };
}

function Categories() {
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  const isEditing = form.id !== null;

  async function reload() {
    setLoading(true);
    try {
      setCategories(await listWorkCategories());
    } catch (e) {
      toast.notifyError(e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function resetForm() {
    setForm(emptyForm);
  }

  function startEdit(category: WorkCategory) {
    setForm(toFormState(category));
    setError(null);
  }

  function addPlanRow() {
    setForm((f) => ({
      ...f,
      plans: [...f.plans, { targetMonth: "", plannedHours: "" }],
    }));
  }

  function updatePlanRow(index: number, patch: Partial<PlanRow>) {
    setForm((f) => ({
      ...f,
      plans: f.plans.map((p, i) => (i === index ? { ...p, ...patch } : p)),
    }));
  }

  function removePlanRow(index: number) {
    setForm((f) => ({
      ...f,
      plans: f.plans.filter((_, i) => i !== index),
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // フロント側バリデーション（R-CAT-7 / R-CAT-8 / R-NF-2）。Rust側でも二重に検証する。
    const message = validateCategoryForm(form);
    if (message) {
      setError(message);
      return;
    }
    setError(null);
    const monthlyPlans: MonthlyPlanInput[] = form.plans.map((p) => ({
      targetMonth: p.targetMonth,
      plannedHours: Number(p.plannedHours),
    }));
    try {
      if (form.id === null) {
        await createWorkCategory({
          code: form.code.trim(),
          name: form.name.trim(),
          plannedHours: Number(form.plannedHours),
          monthlyPlans,
        });
      } else {
        await updateWorkCategory({
          id: form.id,
          code: form.code.trim(),
          name: form.name.trim(),
          plannedHours: Number(form.plannedHours),
          monthlyPlans,
        });
      }
      resetForm();
      await reload();
    } catch (err) {
      // コマンド失敗（Rust側バリデーション拒否を含む）をユーザーへ通知（R-NF-1）。
      toast.notifyError(err);
    }
  }

  async function handleDelete(category: WorkCategory) {
    // 関連する月予定・実績工数もカスケード削除される旨を確認ダイアログで提示（R-CAT-6）。
    const ok = window.confirm(
      `作業区分「${category.code} / ${category.name}」を削除します。\n` +
        "この作業区分に紐づく月予定および実績工数もすべて削除されます。\n" +
        "削除してよろしいですか？",
    );
    if (!ok) return;
    try {
      await deleteWorkCategory(category.id);
      if (form.id === category.id) resetForm();
      await reload();
    } catch (err) {
      toast.notifyError(err);
    }
  }

  const totalCount = useMemo(() => categories.length, [categories]);

  return (
    <section className="categories-page">
      <h1>作業区分</h1>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <form className="category-form" onSubmit={handleSubmit}>
        <h2>{isEditing ? "作業区分の編集" : "作業区分の登録"}</h2>
        <div className="field-row">
          <label>
            コード
            <input
              type="text"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              placeholder="DEV"
            />
          </label>
          <label>
            名前
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="開発"
            />
          </label>
          <label>
            予定工数(h)
            <input
              type="number"
              step="0.1"
              min="0"
              value={form.plannedHours}
              onChange={(e) =>
                setForm((f) => ({ ...f, plannedHours: e.target.value }))
              }
              placeholder="40"
            />
          </label>
        </div>

        <fieldset className="plans-fieldset">
          <legend>月予定（複数可・対象月は yyyy/mm 形式）</legend>
          {form.plans.length === 0 && (
            <p className="muted">月予定はまだありません。</p>
          )}
          {form.plans.map((plan, index) => (
            <div className="plan-row" key={index}>
              <input
                type="text"
                value={plan.targetMonth}
                onChange={(e) =>
                  updatePlanRow(index, { targetMonth: e.target.value })
                }
                placeholder="2026/06"
                aria-label="対象月"
              />
              <input
                type="number"
                step="0.1"
                min="0"
                value={plan.plannedHours}
                onChange={(e) =>
                  updatePlanRow(index, { plannedHours: e.target.value })
                }
                placeholder="40"
                aria-label="月予定工数"
              />
              <button
                type="button"
                onClick={() => removePlanRow(index)}
                className="secondary"
              >
                削除
              </button>
            </div>
          ))}
          <button type="button" onClick={addPlanRow} className="secondary">
            月予定を追加
          </button>
        </fieldset>

        <div className="form-actions">
          <button type="submit">{isEditing ? "更新を確定" : "登録を確定"}</button>
          {isEditing && (
            <button type="button" onClick={resetForm} className="secondary">
              キャンセル
            </button>
          )}
        </div>
      </form>

      <h2>一覧（{totalCount} 件）</h2>
      {loading && <p className="muted">読み込み中...</p>}
      {!loading && categories.length === 0 && (
        <p className="muted">作業区分はまだ登録されていません。</p>
      )}
      {categories.length > 0 && (
        <table className="category-table">
          <thead>
            <tr>
              <th>コード</th>
              <th>名前</th>
              <th>予定工数(h)</th>
              <th>月予定</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id}>
                <td>{c.code}</td>
                <td>{c.name}</td>
                <td>{c.plannedHours}</td>
                <td>
                  {c.monthlyPlans.length === 0 ? (
                    <span className="muted">-</span>
                  ) : (
                    <ul className="plan-list">
                      {c.monthlyPlans.map((p) => (
                        <li key={p.id}>
                          {p.targetMonth}: {p.plannedHours}h
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td>
                  <button
                    type="button"
                    onClick={() => startEdit(c)}
                    className="secondary"
                  >
                    編集
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDelete(c)}
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

export default Categories;
