// =====================================================================
// 日付・月の共通フォーマットユーティリティ（T-10）。
//
// 本システムは日付・月の表示を `yyyy/mm`・`yyyy/mm/dd` 形式で統一する（R-UI-2）。
// 画面/コンポーネントは独自に日付文字列を組み立てず、本モジュールを経由する。
// 区切りは `/`、月・日は2桁ゼロ埋め。Rust 側の検証（commands.rs の
// validate_month_format / validate_date_format）と同一の形式を表現する。
// =====================================================================

/** 2桁ゼロ埋め。 */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * `Date` を月表示（`yyyy/mm`）に整形する（R-UI-2）。
 * ローカルタイムの年・月を用いる。
 */
export function formatMonth(date: Date): string {
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}`;
}

/**
 * `Date` を日付表示（`yyyy/mm/dd`）に整形する（R-UI-2）。
 * ローカルタイムの年・月・日を用いる。
 */
export function formatDate(date: Date): string {
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(
    date.getDate(),
  )}`;
}

/** 当月を `yyyy/mm` で返す（ダッシュボードの初期対象月など）。 */
export function currentMonth(): string {
  return formatMonth(new Date());
}

/** 当日を `yyyy/mm/dd` で返す（実績入力の初期作業日など）。 */
export function currentDate(): string {
  return formatDate(new Date());
}

/**
 * `yyyy/mm` 形式かを判定する（R-UI-2 / R-NF-2 のフロント側検証に利用）。
 * 月は 01〜12 のみ。Rust の validate_month_format と整合する。
 */
export function isValidMonth(value: string): boolean {
  const m = /^(\d{4})\/(\d{2})$/.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  return month >= 1 && month <= 12;
}

/**
 * `yyyy/mm/dd` 形式かを判定する（R-UI-2 / R-NF-2 のフロント側検証に利用）。
 * 月は 01〜12、日は 01〜31。Rust の validate_date_format と整合する。
 */
export function isValidDate(value: string): boolean {
  const m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(value);
  if (!m) return false;
  const month = Number(m[2]);
  const day = Number(m[3]);
  return month >= 1 && month <= 12 && day >= 1 && day <= 31;
}

/**
 * 作業日（`yyyy/mm/dd`）から対象月（`yyyy/mm`）を取り出す。
 * 不正な日付形式の場合は null を返す（呼び出し側で未選択として扱う）。
 */
export function dateToMonth(workDate: string): string | null {
  return isValidDate(workDate) ? workDate.slice(0, 7) : null;
}

/**
 * 作業日（`yyyy/mm/dd`）を `<input type="date">` の値（`yyyy-mm-dd`）へ変換する。
 * 不正な形式なら空文字を返す（カレンダー側は未選択扱い）。
 */
export function toDateInputValue(workDate: string): string {
  return isValidDate(workDate) ? workDate.replace(/\//g, "-") : "";
}

/**
 * `<input type="date">` の値（`yyyy-mm-dd`）を作業日（`yyyy/mm/dd`）へ変換する。
 * 空（未選択）なら空文字を返す。
 */
export function fromDateInputValue(value: string): string {
  return value ? value.replace(/-/g, "/") : "";
}

/**
 * 月（`yyyy/mm`）を1か月ずらした値を返す（対象月セレクタの前月/翌月送り用）。
 * @param yearMonth `yyyy/mm`
 * @param delta 加算する月数（負値で過去方向）
 */
export function shiftMonth(yearMonth: string, delta: number): string {
  const m = /^(\d{4})\/(\d{2})$/.exec(yearMonth);
  if (!m) {
    throw new Error(`月は yyyy/mm 形式で指定してください（入力値: ${yearMonth}）`);
  }
  const date = new Date(Number(m[1]), Number(m[2]) - 1 + delta, 1);
  return formatMonth(date);
}
