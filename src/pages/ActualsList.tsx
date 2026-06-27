// =====================================================================
// 実績一覧画面。
//
// 登録済みの実績工数を期間（from〜to）・作業区分で絞り込んで一覧表示する
// （R-ACT-3 / R-ACT-4）。一覧からその場で編集・削除できる（編集は実績入力ページ
// と共通のダイアログ）。登録（新規入力）は「実績入力」ページで行う。
//
// 全データ授受は lib/api の invoke ラッパ経由（R-ARCH-2）。コマンド失敗は共通
// トースト（lib/toast）でユーザーへ通知する（R-NF-1）。
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import ActualWorkDialog from "../components/ActualWorkDialog";
import type { ActualDialogState } from "../components/ActualWorkDialog";
import ActualWorkTable from "../components/ActualWorkTable";
import { listActualWorks, listWorkCategories } from "../lib/api";
import { confirmAndDeleteActualWork } from "../lib/actualWorkActions";
import { useToast } from "../lib/toast";
import type { ActualWork, WorkCategory } from "../lib/types";

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

function ActualsList() {
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [works, setWorks] = useState<ActualWork[]>([]);
  const [filter, setFilter] = useState<FilterState>(emptyFilter);
  const [dialog, setDialog] = useState<ActualDialogState | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

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

  async function handleDelete(work: ActualWork) {
    const deleted = await confirmAndDeleteActualWork(
      work,
      categoryById,
      toast.notifyError,
    );
    if (!deleted) return;
    if (dialog?.id === work.id) setDialog(null);
    await reloadWorks(filter);
  }

  async function applyFilter(e: React.FormEvent) {
    e.preventDefault();
    await reloadWorks(filter);
  }

  async function clearFilter() {
    setFilter(emptyFilter);
    await reloadWorks(emptyFilter);
  }

  return (
    <section className="actuals-page">
      <h1>実績一覧</h1>

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

      <h2>一覧（{works.length} 件）</h2>
      <ActualWorkTable
        works={works}
        categoryById={categoryById}
        loading={loading}
        emptyMessage="該当する実績工数はありません。"
        onEdit={openEditDialog}
        onDelete={(w) => void handleDelete(w)}
      />

      {dialog && (
        <ActualWorkDialog
          dialog={dialog}
          onChange={setDialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void reloadWorks(filter);
          }}
        />
      )}
    </section>
  );
}

export default ActualsList;
