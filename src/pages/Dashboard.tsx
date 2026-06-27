// =====================================================================
// ダッシュボード画面（T-13）。
//
// 対象月セレクタ（当月を初期表示 / R-DASH-1）と、対象月の変更で再描画する
// 2つのグラフ（R-DASH-2）を提供する。
//
//  グラフ1: 予定工数 vs 実績工数の棒グラフ。全体および各作業区分ごとに
//           グループ化して表示する（R-DASH-3 / R-DASH-4）。
//  グラフ2: 日別の実績時間の積み上げ棒グラフ。各セグメントを作業区分ごとに
//           色分けし（R-DASH-8）、基準線を横線で重ね（R-DASH-9）、各日の棒の上に
//           その日の合計時間を表示する（R-DASH-10）。1日〜月末まで全ての日を
//           軸上に含める（R-DASH-7 / R-DASH-11）。
//
// 集計（予定/実績の合算・月予定0埋め・欠損日補完）は Rust 側で実施済み
// （R-ARCH-4）。本画面は invoke ラッパ（lib/api）経由で取得した集計結果を
// 描画するのみ（R-ARCH-2）。月表示は yyyy/mm 形式で統一する（R-UI-2）。
// =====================================================================

import { useEffect, useState } from "react";
import { VegaEmbed } from "react-vega";
import type { VisualizationSpec } from "vega-embed";
import { getDailyStacked, getDashboardSummary } from "../lib/api";
import { currentMonth, isValidMonth, shiftMonth } from "../lib/format";
import { useToast } from "../lib/toast";
import type { DailyStacked, DashboardSummary } from "../lib/types";

/** 予定/実績棒グラフ用の1レコード。 */
interface PlanActualRecord {
  group: string;
  metric: "予定" | "実績";
  hours: number;
}

/** 日別積み上げ用の1セグメントレコード。 */
interface StackRecord {
  date: string;
  name: string;
  hours: number;
}

/**
 * 予定 vs 実績棒グラフ（全体＋区分別）の Vega-Lite 仕様を組み立てる（R-DASH-3/4）。
 * グループ（全体/各区分）を x 軸に、予定/実績を xOffset でグループ化する。
 */
function buildPlanActualSpec(summary: DashboardSummary): VisualizationSpec {
  const records: PlanActualRecord[] = [];
  const groupOrder: string[] = [];

  // 「全体」を先頭に（R-DASH-4）。
  groupOrder.push("全体");
  records.push({ group: "全体", metric: "予定", hours: summary.total.plannedHours });
  records.push({ group: "全体", metric: "実績", hours: summary.total.actualHours });

  // 各作業区分ごと（R-DASH-4）。月予定が無い区分の予定は Rust 側で0埋め済み（R-DASH-6）。
  for (const c of summary.categories) {
    const label = `${c.code} / ${c.name}`;
    groupOrder.push(label);
    records.push({ group: label, metric: "予定", hours: c.plannedHours });
    records.push({ group: label, metric: "実績", hours: c.actualHours });
  }

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: "予定工数 vs 実績工数（全体・区分別）",
    width: "container",
    height: 280,
    data: { values: records },
    mark: { type: "bar", tooltip: true },
    encoding: {
      x: {
        field: "group",
        type: "nominal",
        title: "区分",
        sort: groupOrder,
        axis: { labelAngle: -30 },
      },
      xOffset: { field: "metric", type: "nominal", sort: ["予定", "実績"] },
      y: { field: "hours", type: "quantitative", title: "工数(h)" },
      color: {
        field: "metric",
        type: "nominal",
        title: "種別",
        scale: { domain: ["予定", "実績"], range: ["#5b8def", "#f0a04b"] },
      },
    },
  };
}

/**
 * 日別実績の積み上げ棒グラフの Vega-Lite 仕様を組み立てる
 * （R-DASH-7/8/9/10/11）。基準線（rule）と日合計ラベル（text）をレイヤ合成する。
 */
function buildDailyStackedSpec(daily: DailyStacked): VisualizationSpec {
  // 1日〜月末まで全ての日（R-DASH-11）。x 軸ドメインに全日を渡し、
  // 実績の無い日も軸上に残す。
  const allDates = daily.days.map((d) => d.date);

  // 区分別セグメント（実績のある日・区分のみ）。色分けの基準（R-DASH-8）。
  const stackRecords: StackRecord[] = [];
  for (const d of daily.days) {
    for (const seg of d.byCategory) {
      stackRecords.push({ date: d.date, name: seg.name, hours: seg.hours });
    }
  }

  // 日合計ラベル用（R-DASH-10）。合計0の日はラベルを出さない。
  const totalRecords = daily.days
    .filter((d) => d.totalHours > 0)
    .map((d) => ({ date: d.date, totalHours: d.totalHours }));

  const xEncoding = {
    field: "date",
    type: "nominal" as const,
    title: "日付",
    scale: { domain: allDates },
    axis: {
      labelAngle: -90,
      // 軸ラベルは日(dd)のみ表示し、もとの yyyy/mm/dd は値として保持する。
      labelExpr: "slice(datum.value, 8, 10)",
    },
  };

  return {
    $schema: "https://vega.github.io/schema/vega-lite/v6.json",
    description: "日別実績時間の積み上げ棒グラフ",
    width: "container",
    height: 320,
    layer: [
      // 積み上げ棒（区分ごとに色分け / R-DASH-7・R-DASH-8）。
      {
        data: { values: stackRecords },
        mark: { type: "bar", tooltip: true },
        encoding: {
          x: xEncoding,
          y: {
            field: "hours",
            type: "quantitative",
            title: "実績時間(h)",
            stack: "zero",
          },
          color: { field: "name", type: "nominal", title: "作業区分" },
        },
      },
      // 各日の合計ラベル（R-DASH-10）。
      {
        data: { values: totalRecords },
        mark: { type: "text", dy: -6, fontSize: 10 },
        encoding: {
          x: xEncoding,
          y: { field: "totalHours", type: "quantitative" },
          text: { field: "totalHours", type: "quantitative", format: ".1f" },
        },
      },
      // 基準線（横線 / R-DASH-9）。
      {
        data: { values: [{ baseline: daily.baselineHours }] },
        mark: { type: "rule", color: "#d8403c", strokeDash: [6, 4], size: 2 },
        encoding: {
          y: { field: "baseline", type: "quantitative" },
        },
      },
    ],
  };
}

function Dashboard() {
  // 当月を初期表示の対象月とする（R-DASH-1）。
  const [yearMonth, setYearMonth] = useState<string>(currentMonth());
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [daily, setDaily] = useState<DailyStacked | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();

  /** 指定月の集計を取得して両グラフのデータを更新する（R-DASH-2）。 */
  async function reload(month: string) {
    if (!isValidMonth(month)) {
      setError(`対象月は yyyy/mm 形式で指定してください（入力値: ${month || "空"}）。`);
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const [s, d] = await Promise.all([
        getDashboardSummary(month),
        getDailyStacked(month),
      ]);
      setSummary(s);
      setDaily(d);
    } catch (e) {
      // コマンド失敗をユーザーへ通知（R-NF-1）。
      toast.notifyError(e);
    } finally {
      setLoading(false);
    }
  }

  // 初期表示および対象月の変更時に再描画する（R-DASH-1 / R-DASH-2）。
  useEffect(() => {
    void reload(yearMonth);
  }, [yearMonth]);

  function goPrev() {
    setYearMonth((m) => shiftMonth(m, -1));
  }

  function goNext() {
    setYearMonth((m) => shiftMonth(m, 1));
  }

  function goCurrent() {
    setYearMonth(currentMonth());
  }

  const hasCategories = summary !== null && summary.categories.length > 0;
  const hasActuals = daily !== null && daily.days.some((d) => d.totalHours > 0);

  return (
    <section className="dashboard-page">
      <h1>ダッシュボード</h1>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="month-selector">
        <button type="button" onClick={goPrev} className="secondary">
          前月
        </button>
        <label className="month-input">
          対象月
          <input
            type="text"
            value={yearMonth}
            onChange={(e) => setYearMonth(e.target.value)}
            placeholder="2026/06"
          />
        </label>
        <button type="button" onClick={goNext} className="secondary">
          翌月
        </button>
        <button type="button" onClick={goCurrent} className="secondary">
          今月
        </button>
        {loading && <span className="muted">読み込み中...</span>}
      </div>

      <div className="chart-block">
        <h2>予定工数 vs 実績工数（{yearMonth}）</h2>
        {summary === null ? (
          <p className="muted">データを読み込み中です。</p>
        ) : (
          <>
            <div className="chart-container">
              <VegaEmbed
                spec={buildPlanActualSpec(summary)}
                options={{ actions: false }}
              />
            </div>
            {!hasCategories && (
              <p className="muted">
                作業区分が未登録です。作業区分を登録すると区分別の予定/実績が表示されます。
              </p>
            )}
          </>
        )}
      </div>

      <div className="chart-block">
        <h2>日別 実績時間（積み上げ・{yearMonth}）</h2>
        {daily === null ? (
          <p className="muted">データを読み込み中です。</p>
        ) : (
          <>
            <div className="chart-container">
              <VegaEmbed
                spec={buildDailyStackedSpec(daily)}
                options={{ actions: false }}
              />
            </div>
            <p className="muted">基準線: {daily.baselineHours}h（赤い横線）</p>
            {!hasActuals && (
              <p className="muted">この月の実績工数はまだありません。</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

export default Dashboard;
