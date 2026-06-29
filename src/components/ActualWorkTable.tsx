// =====================================================================
// 実績工数の一覧テーブル（表示専用）。実績入力ページ・実績一覧ページの双方で
// 共有する。作業日・作業区分・実績時間・メモを表示する（R-ACT-3）。編集/削除は
// 親から渡されるコールバックに委譲する。
// =====================================================================

import type { ActualWork, WorkCategory } from "../lib/types";

interface Props {
  works: ActualWork[];
  categoryById: Map<number, WorkCategory>;
  loading: boolean;
  /** 該当0件のときに表示する文言。 */
  emptyMessage: string;
  /** 作業日列を表示するか。単一作業日に絞った一覧では不要なので非表示にできる。 */
  showDate?: boolean;
  onEdit: (work: ActualWork) => void;
  onDelete: (work: ActualWork) => void;
}

function ActualWorkTable({
  works,
  categoryById,
  loading,
  emptyMessage,
  showDate = true,
  onEdit,
  onDelete,
}: Props) {
  function categoryLabel(id: number): string {
    const c = categoryById.get(id);
    return c ? `${c.code} / ${c.name}` : `#${id}`;
  }

  if (loading) return <p className="muted">読み込み中...</p>;
  if (works.length === 0) return <p className="muted">{emptyMessage}</p>;

  return (
    <table className="category-table">
      <thead>
        <tr>
          {showDate && <th>作業日</th>}
          <th>作業区分</th>
          <th>実績時間(h)</th>
          <th>メモ</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        {works.map((w) => (
          <tr key={w.id}>
            {showDate && <td>{w.workDate}</td>}
            <td>{categoryLabel(w.workCategoryId)}</td>
            <td>{w.actualHours}</td>
            <td className="memo-cell">
              {w.memo ? w.memo : <span className="muted">-</span>}
            </td>
            <td>
              <button
                type="button"
                onClick={() => onEdit(w)}
                className="secondary"
              >
                編集
              </button>
              <button
                type="button"
                onClick={() => onDelete(w)}
                className="danger"
              >
                削除
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default ActualWorkTable;
