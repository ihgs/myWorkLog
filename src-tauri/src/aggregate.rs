//! 集計ロジック（T-07）。
//!
//! 工数・時間の集計はすべてRust側で行う（R-ARCH-4）。本モジュールはリポジトリ層
//! （`repository`）が返すエンティティを組み合わせて、ダッシュボードが必要とする
//! 集計DTO（`DashboardSummary` / `DailyStacked`）を構築する。
//!
//! 各関数は `&Connection` と対象月（`yyyy/mm`）を受け取り、Tauri State に依存しない
//! 形でテスト可能にする（境界網羅の単体テストは T-08 で拡充）。
//! 戻り値は `Result<T, String>`（コマンド層へそのまま流せる）。

use chrono::{Datelike, Duration, NaiveDate};
use rusqlite::Connection;

use crate::models::{
    ActualWorkFilter, CategorySummary, DailyCategoryHours, DailyEntry, DailyStacked,
    DashboardSummary, SummaryTotal,
};
use crate::repository::{actual_work, setting, work_category};

/// `yyyy/mm` を (年, 月) に分解する。形式不正はエラー。
fn parse_year_month(year_month: &str) -> Result<(i32, u32), String> {
    let bytes = year_month.as_bytes();
    let valid = bytes.len() == 7
        && bytes[4] == b'/'
        && bytes[..4].iter().all(u8::is_ascii_digit)
        && bytes[5..].iter().all(u8::is_ascii_digit);
    if !valid {
        return Err(format!(
            "対象月は yyyy/mm 形式で指定してください（入力値: {year_month}）"
        ));
    }
    let year: i32 = year_month[..4]
        .parse()
        .map_err(|_| format!("対象月の年が不正です（入力値: {year_month}）"))?;
    let month: u32 = year_month[5..]
        .parse()
        .map_err(|_| format!("対象月の月が不正です（入力値: {year_month}）"))?;
    if !(1..=12).contains(&month) {
        return Err(format!(
            "対象月の月は01〜12で指定してください（入力値: {year_month}）"
        ));
    }
    Ok((year, month))
}

/// 指定年月の月末日（28〜31）を返す。
fn last_day_of_month(year: i32, month: u32) -> Result<u32, String> {
    let (next_year, next_month) = if month == 12 {
        (year + 1, 1)
    } else {
        (year, month + 1)
    };
    let first_of_next = NaiveDate::from_ymd_opt(next_year, next_month, 1)
        .ok_or_else(|| format!("不正な年月です（{year}/{month}）"))?;
    Ok((first_of_next - Duration::days(1)).day())
}

/// 正規化した対象月文字列（`yyyy/mm`、ゼロ埋め）を返す。
fn normalize_year_month(year: i32, month: u32) -> String {
    format!("{year:04}/{month:02}")
}

/// 月単位の予定/実績集計（区分別・全体）を構築する（R-DASH-5 / R-DASH-6）。
///
/// 予定工数は月予定（`MonthlyPlan`）のみを使用し、当月の月予定が無い区分は0とする。
/// 実績は当月（1日〜月末）の実績工数を区分別に合算する。
pub fn dashboard_summary(conn: &Connection, year_month: &str) -> Result<DashboardSummary, String> {
    let (year, month) = parse_year_month(year_month)?;
    let normalized = normalize_year_month(year, month);
    let last_day = last_day_of_month(year, month)?;

    let categories = work_category::list(conn)?;
    let actuals = actual_work::list(
        conn,
        &ActualWorkFilter {
            from_date: Some(format!("{normalized}/01")),
            to_date: Some(format!("{normalized}/{last_day:02}")),
            work_category_id: None,
        },
    )?;

    let mut category_summaries = Vec::with_capacity(categories.len());
    let mut total_planned = 0.0_f64;
    let mut total_actual = 0.0_f64;

    for category in &categories {
        // 予定: 当月の月予定のみ。無ければ0（R-DASH-5 / R-DASH-6）。
        let planned_hours = category
            .monthly_plans
            .iter()
            .find(|p| p.target_month == normalized)
            .map(|p| p.planned_hours)
            .unwrap_or(0.0);
        // 実績: 当月・当区分の合算。
        let actual_hours = actuals
            .iter()
            .filter(|a| a.work_category_id == category.id)
            .map(|a| a.actual_hours)
            .sum();

        total_planned += planned_hours;
        total_actual += actual_hours;

        category_summaries.push(CategorySummary {
            work_category_id: category.id,
            code: category.code.clone(),
            name: category.name.clone(),
            planned_hours,
            actual_hours,
        });
    }

    Ok(DashboardSummary {
        year_month: normalized,
        total: SummaryTotal {
            planned_hours: total_planned,
            actual_hours: total_actual,
        },
        categories: category_summaries,
    })
}

/// 日別×区分別の実績積み上げデータを構築する（R-DASH-11）。
///
/// 軸は1日〜月末まで全ての日を含み、実績が無い日も `total_hours = 0` で出力する。
/// 各日の内訳は実績のある作業区分のみを区分登録順で並べる。基準線を同梱する。
pub fn daily_stacked(conn: &Connection, year_month: &str) -> Result<DailyStacked, String> {
    let (year, month) = parse_year_month(year_month)?;
    let normalized = normalize_year_month(year, month);
    let last_day = last_day_of_month(year, month)?;

    let baseline_hours = setting::get(conn)?.baseline_hours;
    let categories = work_category::list(conn)?;
    let actuals = actual_work::list(
        conn,
        &ActualWorkFilter {
            from_date: Some(format!("{normalized}/01")),
            to_date: Some(format!("{normalized}/{last_day:02}")),
            work_category_id: None,
        },
    )?;

    let mut days = Vec::with_capacity(last_day as usize);
    for day in 1..=last_day {
        let date = format!("{normalized}/{day:02}");
        let day_actuals: Vec<_> = actuals.iter().filter(|a| a.work_date == date).collect();

        let mut by_category = Vec::new();
        let mut total_hours = 0.0_f64;
        // 区分登録順で内訳を作る（積み上げセグメントの色割り当てを安定させる）。
        for category in &categories {
            let hours: f64 = day_actuals
                .iter()
                .filter(|a| a.work_category_id == category.id)
                .map(|a| a.actual_hours)
                .sum();
            total_hours += hours;
            if hours > 0.0 {
                by_category.push(DailyCategoryHours {
                    work_category_id: category.id,
                    name: category.name.clone(),
                    hours,
                });
            }
        }

        days.push(DailyEntry {
            date,
            total_hours,
            by_category,
        });
    }

    Ok(DailyStacked {
        year_month: normalized,
        baseline_hours,
        days,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_connection;
    use crate::models::MonthlyPlanInput;
    use crate::schema::migrate;
    use std::path::Path;

    fn conn() -> Connection {
        let conn = open_connection(Path::new(":memory:")).expect("接続を開けること");
        migrate(&conn).expect("マイグレーション成功");
        conn
    }

    #[test]
    fn parse_and_last_day() {
        assert_eq!(parse_year_month("2026/06").unwrap(), (2026, 6));
        assert!(parse_year_month("2026/13").is_err());
        assert!(parse_year_month("2026/6").is_err());
        assert_eq!(last_day_of_month(2026, 6).unwrap(), 30);
        assert_eq!(last_day_of_month(2026, 2).unwrap(), 28);
        assert_eq!(last_day_of_month(2024, 2).unwrap(), 29); // 閏年
        assert_eq!(last_day_of_month(2026, 12).unwrap(), 31);
    }

    #[test]
    fn summary_uses_monthly_plan_only_and_zero_when_missing() {
        // R-DASH-5: 予定は月予定のみ（区分全体の planned_hours は使わない）。
        // R-DASH-6: 当月の月予定が無い区分は予定0。
        let mut c = conn();
        let dev = work_category::create(
            &mut c,
            "DEV",
            "開発",
            40.0, // 全体予定（集計には使わない）
            &[MonthlyPlanInput {
                target_month: "2026/06".into(),
                planned_hours: 30.0,
            }],
        )
        .expect("開発");
        let research =
            work_category::create(&mut c, "RSC", "調査", 0.0, &[]).expect("調査(月予定なし)");

        actual_work::create(&c, dev.id, 5.0, "2026/06/01", None).expect("実績1");
        actual_work::create(&c, dev.id, 3.0, "2026/06/02", None).expect("実績2");
        actual_work::create(&c, research.id, 2.0, "2026/06/10", None).expect("実績3");

        let s = dashboard_summary(&c, "2026/06").expect("集計");
        assert_eq!(s.year_month, "2026/06");

        let dev_sum = s.categories.iter().find(|c| c.code == "DEV").unwrap();
        assert_eq!(dev_sum.planned_hours, 30.0, "月予定30を使用（R-DASH-5）");
        assert_eq!(dev_sum.actual_hours, 8.0);

        let rsc_sum = s.categories.iter().find(|c| c.code == "RSC").unwrap();
        assert_eq!(rsc_sum.planned_hours, 0.0, "月予定なしは0（R-DASH-6）");
        assert_eq!(rsc_sum.actual_hours, 2.0);

        assert_eq!(s.total.planned_hours, 30.0);
        assert_eq!(s.total.actual_hours, 10.0);
    }

    #[test]
    fn summary_excludes_other_months() {
        let mut c = conn();
        let dev = work_category::create(&mut c, "DEV", "開発", 0.0, &[]).expect("開発");
        actual_work::create(&c, dev.id, 5.0, "2026/06/30", None).expect("当月末");
        actual_work::create(&c, dev.id, 9.0, "2026/07/01", None).expect("翌月");
        actual_work::create(&c, dev.id, 7.0, "2026/05/31", None).expect("前月");

        let s = dashboard_summary(&c, "2026/06").expect("集計");
        assert_eq!(s.total.actual_hours, 5.0, "当月分のみ集計");
    }

    #[test]
    fn daily_stacked_covers_all_days_with_baseline() {
        // R-DASH-11: 実績の無い日も1日〜月末まで軸上に含む。
        let mut c = conn();
        let dev = work_category::create(&mut c, "DEV", "開発", 0.0, &[]).expect("開発");
        let ops = work_category::create(&mut c, "OPS", "運用", 0.0, &[]).expect("運用");
        actual_work::create(&c, dev.id, 4.0, "2026/06/01", None).expect("d1");
        actual_work::create(&c, ops.id, 2.0, "2026/06/01", None).expect("d1b");
        actual_work::create(&c, dev.id, 3.0, "2026/06/30", None).expect("d30");

        let d = daily_stacked(&c, "2026/06").expect("日別");
        assert_eq!(d.baseline_hours, 8.0, "基準線同梱（R-DASH-9）");
        assert_eq!(d.days.len(), 30, "1日〜月末まで全て（R-DASH-11）");

        let day1 = &d.days[0];
        assert_eq!(day1.date, "2026/06/01");
        assert_eq!(day1.total_hours, 6.0, "日合計（R-DASH-10）");
        assert_eq!(day1.by_category.len(), 2, "区分別内訳（R-DASH-8）");

        // 実績の無い15日も軸上に存在し合計0。
        let day15 = d.days.iter().find(|e| e.date == "2026/06/15").unwrap();
        assert_eq!(day15.total_hours, 0.0);
        assert!(day15.by_category.is_empty());

        let day30 = d.days.iter().find(|e| e.date == "2026/06/30").unwrap();
        assert_eq!(day30.total_hours, 3.0);
    }
}
