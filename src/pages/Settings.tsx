// =====================================================================
// 設定画面（T-14）。
//
// ダッシュボードの基準線（`baseline_hours`）を表示・更新する。
// 画面を開いたとき現在の基準線を表示し（R-SET-1）、更新すると新しい値を
// 保存する（R-SET-2）。保存後はダッシュボードの日別積み上げグラフの基準線へ
// 反映される（R-SET-4）。基準線は `get_daily_stacked` が `setting.baseline_hours`
// を同梱して返すため、更新を永続化すればダッシュボード再描画時に新値が表示される。
//
// 全データ授受は lib/api の invoke ラッパ経由（R-ARCH-2）。入力バリデーションの
// 共通化・エラー通知の本格対応は T-15 で行う。本画面では送信前の最小限の検証
// （必須・数値0以上）のみ行う。
// =====================================================================

import { useEffect, useState } from "react";
import { getSetting, updateSetting } from "../lib/api";
import type { Setting } from "../lib/types";

function Settings() {
  const [setting, setSetting] = useState<Setting | null>(null);
  const [baseline, setBaseline] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function reload() {
    setLoading(true);
    try {
      const s = await getSetting();
      setSetting(s);
      setBaseline(String(s.baselineHours));
      setError(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  /** 送信前の最小限のフォーム検証（本格対応は T-15）。問題があればメッセージを返す。 */
  function validate(): string | null {
    const value = Number(baseline);
    if (baseline.trim() === "" || Number.isNaN(value)) {
      return "基準線を数値で入力してください。";
    }
    if (value < 0) return "基準線は0以上で入力してください。";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const message = validate();
    if (message) {
      setError(message);
      return;
    }
    try {
      const updated = await updateSetting(Number(baseline));
      setSetting(updated);
      setBaseline(String(updated.baselineHours));
      setError(null);
      setNotice(
        `基準線を ${updated.baselineHours}h に更新しました。ダッシュボードの基準線に反映されます。`,
      );
    } catch (err) {
      setError(String(err));
    }
  }

  return (
    <section className="settings-page">
      <h1>設定</h1>
      <p className="muted">
        ダッシュボードの日別積み上げグラフに表示する基準線（1日の目安時間）を設定します。
      </p>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="form-notice" role="status">
          {notice}
        </p>
      )}

      {loading && <p className="muted">読み込み中...</p>}

      {!loading && setting && (
        <>
          <p>
            現在の基準線: <strong>{setting.baselineHours}h</strong>
          </p>

          <form className="setting-form" onSubmit={handleSubmit}>
            <div className="field-row">
              <label>
                基準線(h)
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={baseline}
                  onChange={(e) => setBaseline(e.target.value)}
                  placeholder="8"
                />
              </label>
            </div>
            <div className="form-actions">
              <button type="submit">更新を確定</button>
            </div>
          </form>
        </>
      )}
    </section>
  );
}

export default Settings;
