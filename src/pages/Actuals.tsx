// =====================================================================
// 実績入力画面（T-12）。
//
// 実績工数の登録を「作業日」基準で行う。作業日から対象月（yyyy/mm）を導出し、
// その月に月予定が登録されている作業区分のみをボタンとして提示する。ボタンを
// クリックすると実績時間・メモを入力するダイアログ（ActualWorkDialog）を開く。
// 作業区分は既存の作業区分から選ぶ形となり、任意のコード・名前を自由入力させ
// ない（R-ACT-2）。画面下部には、その作業日に登録済みの実績工数のみを一覧表示
// し、その場で編集・削除できる（実績全体の一覧・絞り込みは「実績一覧」ページ）。
//
// 全データ授受は lib/api の invoke ラッパ経由（R-ARCH-2）。作業日・月の表示は
// yyyy/mm/dd 形式で統一する（R-UI-2）。コマンド失敗は共通トースト（lib/toast）で
// ユーザーへ通知する（R-NF-1）。
// =====================================================================

import { useEffect, useMemo, useState } from "react";
import ActualWorkDialog from "../components/ActualWorkDialog";
import type { ActualDialogState } from "../components/ActualWorkDialog";
import ActualWorkTable from "../components/ActualWorkTable";
import { listActualWorks, listWorkCategories } from "../lib/api";
import { confirmAndDeleteActualWork } from "../lib/actualWorkActions";
import {
  currentDate,
  dateToMonth,
  fromDateInputValue,
  isValidDate,
  toDateInputValue,
} from "../lib/format";
import { useToast } from "../lib/toast";
import type { ActualWork, WorkCategory } from "../lib/types";

function Actuals() {
  const [categories, setCategories] = useState<WorkCategory[]>([]);
  const [works, setWorks] = useState<ActualWork[]>([]);
  // 登録の基準となる作業日。ここから対象月を導出してボタンを並べ、
  // 同じ作業日の実績一覧も表示する。
  const [workDate, setWorkDate] = useState<string>(currentDate);
  const [dialog, setDialog] = useState<ActualDialogState | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  /** 作業区分IDから区分（コード/名前）を引くための索引（一覧の表示用）。 */
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

  /** 指定した作業日の実績工数のみを取得する（fromDate=toDate で1日に絞る）。 */
  async function reloadWorks(date: string) {
    if (!isValidDate(date)) {
      setWorks([]);
      return;
    }
    setLoading(true);
    try {
      setWorks(await listActualWorks({ fromDate: date, toDate: date }));
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
  }, []);

  // 作業日が変わるたびに、その日の実績一覧を読み込み直す。
  useEffect(() => {
    void reloadWorks(workDate);
  }, [workDate]);

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

  async function handleDelete(work: ActualWork) {
    const deleted = await confirmAndDeleteActualWork(
      work,
      categoryById,
      toast.notifyError,
    );
    if (!deleted) return;
    if (dialog?.id === work.id) setDialog(null);
    await reloadWorks(workDate);
  }

  return (
    <section className="actuals-page">
      <h1>実績入力</h1>

      <div className="actual-entry">
        <h2>実績工数の登録</h2>
        <label className="month-input">
          作業日
          <div className="date-input-group">
            <input
              type="text"
              value={workDate}
              onChange={(e) => setWorkDate(e.target.value)}
              placeholder="2026/06/27"
            />
            {/* カレンダーアイコン。透明な date input を重ね、ネイティブの
                ピッカーに開閉を任せる（選択・外側クリックで自動的に閉じる）。 */}
            <span className="calendar-icon">
              📅
              <input
                type="date"
                className="calendar-overlay-input"
                aria-label="カレンダーから選択"
                value={toDateInputValue(workDate)}
                onChange={(e) =>
                  setWorkDate(fromDateInputValue(e.target.value))
                }
              />
            </span>
          </div>
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

      <h2>{workDate} の実績</h2>
      <ActualWorkTable
        works={works}
        categoryById={categoryById}
        loading={loading}
        emptyMessage="この作業日の実績工数はまだありません。"
        showDate={false}
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
            void reloadWorks(workDate);
          }}
        />
      )}
    </section>
  );
}

export default Actuals;
