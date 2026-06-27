//! リポジトリ層（T-03）。
//!
//! すべてのSQL文・DBアクセスをここ（Rust側）に集約する（R-ARCH-1 / R-ARCH-3）。
//! 集計に必要な絞り込みクエリもここで提供し、上位（コマンド層・集計ロジック）は
//! SQLを意識せずエンティティ単位で操作する（R-ARCH-4 の土台）。
//!
//! 各関数は `&Connection`（または書き込みでトランザクションが必要な場合は
//! `&mut Connection`）を受け取り、Tauri State に依存しないことでテスト可能にする。
//! 戻り値は `Result<T, String>`（コマンド層の `Result<T, String>` にそのまま流せる）。

use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension, Row};

use crate::models::{
    ActualWork, ActualWorkFilter, MonthlyPlan, MonthlyPlanInput, Setting, WorkCategory,
};

/// 現在時刻をISO8601（RFC3339）文字列で返す。created_at/updated_at に用いる。
fn now_iso8601() -> String {
    Utc::now().to_rfc3339()
}

// =====================================================================
// 作業区分（work_category）+ 月予定（monthly_plan）
// =====================================================================

pub mod work_category {
    use super::*;

    /// 行から月予定を伴わない作業区分を組み立てる（monthly_plans は別途充填）。
    fn map_row(row: &Row<'_>) -> rusqlite::Result<WorkCategory> {
        Ok(WorkCategory {
            id: row.get("id")?,
            code: row.get("code")?,
            name: row.get("name")?,
            planned_hours: row.get("planned_hours")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
            monthly_plans: Vec::new(),
        })
    }

    /// 指定作業区分の月予定を対象月昇順で取得する。
    fn list_plans(conn: &Connection, work_category_id: i64) -> Result<Vec<MonthlyPlan>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, work_category_id, target_month, planned_hours \
                 FROM monthly_plan WHERE work_category_id = ?1 ORDER BY target_month",
            )
            .map_err(|e| format!("月予定クエリの準備に失敗しました: {e}"))?;
        let plans = stmt
            .query_map([work_category_id], |row| {
                Ok(MonthlyPlan {
                    id: row.get("id")?,
                    work_category_id: row.get("work_category_id")?,
                    target_month: row.get("target_month")?,
                    planned_hours: row.get("planned_hours")?,
                })
            })
            .map_err(|e| format!("月予定の取得に失敗しました: {e}"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| format!("月予定の読み出しに失敗しました: {e}"))?;
        Ok(plans)
    }

    /// 月予定を入れ替える（既存削除 → 入力分を挿入）。トランザクション内で呼ぶ前提。
    fn replace_plans(
        conn: &Connection,
        work_category_id: i64,
        plans: &[MonthlyPlanInput],
    ) -> Result<(), String> {
        conn.execute(
            "DELETE FROM monthly_plan WHERE work_category_id = ?1",
            [work_category_id],
        )
        .map_err(|e| format!("既存月予定の削除に失敗しました: {e}"))?;
        for plan in plans {
            conn.execute(
                "INSERT INTO monthly_plan (work_category_id, target_month, planned_hours) \
                 VALUES (?1, ?2, ?3)",
                params![work_category_id, plan.target_month, plan.planned_hours],
            )
            .map_err(|e| format!("月予定の登録に失敗しました: {e}"))?;
        }
        Ok(())
    }

    /// 全作業区分を月予定同梱で取得する（R-CAT-3 の土台）。
    pub fn list(conn: &Connection) -> Result<Vec<WorkCategory>, String> {
        let mut stmt = conn
            .prepare(
                "SELECT id, code, name, planned_hours, created_at, updated_at \
                 FROM work_category ORDER BY id",
            )
            .map_err(|e| format!("作業区分クエリの準備に失敗しました: {e}"))?;
        let mut categories = stmt
            .query_map([], map_row)
            .map_err(|e| format!("作業区分の取得に失敗しました: {e}"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| format!("作業区分の読み出しに失敗しました: {e}"))?;

        for category in &mut categories {
            category.monthly_plans = list_plans(conn, category.id)?;
        }
        Ok(categories)
    }

    /// 単一の作業区分を月予定同梱で取得する。存在しなければ `None`。
    pub fn find(conn: &Connection, id: i64) -> Result<Option<WorkCategory>, String> {
        let mut category = conn
            .query_row(
                "SELECT id, code, name, planned_hours, created_at, updated_at \
                 FROM work_category WHERE id = ?1",
                [id],
                map_row,
            )
            .optional()
            .map_err(|e| format!("作業区分の取得に失敗しました: {e}"))?;

        if let Some(c) = category.as_mut() {
            c.monthly_plans = list_plans(conn, c.id)?;
        }
        Ok(category)
    }

    /// 作業区分を月予定とともに登録する（R-CAT-1）。コードは重複可（R-CAT-2）。
    pub fn create(
        conn: &mut Connection,
        code: &str,
        name: &str,
        planned_hours: f64,
        plans: &[MonthlyPlanInput],
    ) -> Result<WorkCategory, String> {
        let now = now_iso8601();
        let tx = conn
            .transaction()
            .map_err(|e| format!("トランザクション開始に失敗しました: {e}"))?;
        tx.execute(
            "INSERT INTO work_category (code, name, planned_hours, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![code, name, planned_hours, now],
        )
        .map_err(|e| format!("作業区分の登録に失敗しました: {e}"))?;
        let id = tx.last_insert_rowid();
        replace_plans(&tx, id, plans)?;
        tx.commit()
            .map_err(|e| format!("コミットに失敗しました: {e}"))?;

        find(conn, id)?.ok_or_else(|| "登録した作業区分が見つかりません".to_string())
    }

    /// 作業区分の内容（月予定含む）を更新する（R-CAT-4）。
    pub fn update(
        conn: &mut Connection,
        id: i64,
        code: &str,
        name: &str,
        planned_hours: f64,
        plans: &[MonthlyPlanInput],
    ) -> Result<WorkCategory, String> {
        let now = now_iso8601();
        let tx = conn
            .transaction()
            .map_err(|e| format!("トランザクション開始に失敗しました: {e}"))?;
        let affected = tx
            .execute(
                "UPDATE work_category \
                 SET code = ?2, name = ?3, planned_hours = ?4, updated_at = ?5 WHERE id = ?1",
                params![id, code, name, planned_hours, now],
            )
            .map_err(|e| format!("作業区分の更新に失敗しました: {e}"))?;
        if affected == 0 {
            return Err(format!("指定の作業区分が存在しません（id={id}）"));
        }
        replace_plans(&tx, id, plans)?;
        tx.commit()
            .map_err(|e| format!("コミットに失敗しました: {e}"))?;

        find(conn, id)?.ok_or_else(|| "更新した作業区分が見つかりません".to_string())
    }

    /// 作業区分を削除する（R-CAT-5）。月予定・実績はFKカスケードで削除（R-DATA-4）。
    pub fn delete(conn: &Connection, id: i64) -> Result<(), String> {
        let affected = conn
            .execute("DELETE FROM work_category WHERE id = ?1", [id])
            .map_err(|e| format!("作業区分の削除に失敗しました: {e}"))?;
        if affected == 0 {
            return Err(format!("指定の作業区分が存在しません（id={id}）"));
        }
        Ok(())
    }
}

// =====================================================================
// 実績工数（actual_work）
// =====================================================================

pub mod actual_work {
    use super::*;

    fn map_row(row: &Row<'_>) -> rusqlite::Result<ActualWork> {
        Ok(ActualWork {
            id: row.get("id")?,
            work_category_id: row.get("work_category_id")?,
            actual_hours: row.get("actual_hours")?,
            work_date: row.get("work_date")?,
            memo: row.get("memo")?,
            created_at: row.get("created_at")?,
            updated_at: row.get("updated_at")?,
        })
    }

    /// 実績工数を絞り込み条件付きで取得する（R-ACT-3 / R-ACT-4）。
    ///
    /// 期間（from/to）・作業区分での絞り込みは任意。作業日昇順で返す。
    /// 文字列日付は `yyyy/mm/dd` 形式のため辞書順比較が日付順と一致する。
    pub fn list(conn: &Connection, filter: &ActualWorkFilter) -> Result<Vec<ActualWork>, String> {
        let mut sql = String::from(
            "SELECT id, work_category_id, actual_hours, work_date, memo, created_at, updated_at \
             FROM actual_work WHERE 1 = 1",
        );
        let mut args: Vec<Box<dyn rusqlite::types::ToSql>> = Vec::new();

        if let Some(from) = &filter.from_date {
            sql.push_str(" AND work_date >= ?");
            args.push(Box::new(from.clone()));
        }
        if let Some(to) = &filter.to_date {
            sql.push_str(" AND work_date <= ?");
            args.push(Box::new(to.clone()));
        }
        if let Some(category_id) = filter.work_category_id {
            sql.push_str(" AND work_category_id = ?");
            args.push(Box::new(category_id));
        }
        sql.push_str(" ORDER BY work_date, id");

        let mut stmt = conn
            .prepare(&sql)
            .map_err(|e| format!("実績クエリの準備に失敗しました: {e}"))?;
        let param_refs: Vec<&dyn rusqlite::types::ToSql> =
            args.iter().map(|b| b.as_ref()).collect();
        let rows = stmt
            .query_map(param_refs.as_slice(), map_row)
            .map_err(|e| format!("実績の取得に失敗しました: {e}"))?
            .collect::<rusqlite::Result<Vec<_>>>()
            .map_err(|e| format!("実績の読み出しに失敗しました: {e}"))?;
        Ok(rows)
    }

    /// 単一の実績工数を取得する。存在しなければ `None`。
    pub fn find(conn: &Connection, id: i64) -> Result<Option<ActualWork>, String> {
        conn.query_row(
            "SELECT id, work_category_id, actual_hours, work_date, memo, created_at, updated_at \
             FROM actual_work WHERE id = ?1",
            [id],
            map_row,
        )
        .optional()
        .map_err(|e| format!("実績の取得に失敗しました: {e}"))
    }

    /// 実績工数を登録する（R-ACT-1）。メモはNULL許容（R-ACT-9）。
    pub fn create(
        conn: &Connection,
        work_category_id: i64,
        actual_hours: f64,
        work_date: &str,
        memo: Option<&str>,
    ) -> Result<ActualWork, String> {
        let now = now_iso8601();
        conn.execute(
            "INSERT INTO actual_work \
             (work_category_id, actual_hours, work_date, memo, created_at, updated_at) \
             VALUES (?1, ?2, ?3, ?4, ?5, ?5)",
            params![work_category_id, actual_hours, work_date, memo, now],
        )
        .map_err(|e| format!("実績の登録に失敗しました: {e}"))?;
        let id = conn.last_insert_rowid();
        find(conn, id)?.ok_or_else(|| "登録した実績が見つかりません".to_string())
    }

    /// 実績工数を更新する（R-ACT-5）。
    pub fn update(
        conn: &Connection,
        id: i64,
        work_category_id: i64,
        actual_hours: f64,
        work_date: &str,
        memo: Option<&str>,
    ) -> Result<ActualWork, String> {
        let now = now_iso8601();
        let affected = conn
            .execute(
                "UPDATE actual_work SET work_category_id = ?2, actual_hours = ?3, \
                 work_date = ?4, memo = ?5, updated_at = ?6 WHERE id = ?1",
                params![id, work_category_id, actual_hours, work_date, memo, now],
            )
            .map_err(|e| format!("実績の更新に失敗しました: {e}"))?;
        if affected == 0 {
            return Err(format!("指定の実績が存在しません（id={id}）"));
        }
        find(conn, id)?.ok_or_else(|| "更新した実績が見つかりません".to_string())
    }

    /// 実績工数を削除する（R-ACT-6）。
    pub fn delete(conn: &Connection, id: i64) -> Result<(), String> {
        let affected = conn
            .execute("DELETE FROM actual_work WHERE id = ?1", [id])
            .map_err(|e| format!("実績の削除に失敗しました: {e}"))?;
        if affected == 0 {
            return Err(format!("指定の実績が存在しません（id={id}）"));
        }
        Ok(())
    }
}

// =====================================================================
// 設定（setting）
// =====================================================================

pub mod setting {
    use super::*;

    /// 設定（単一レコード id=1）を取得する（R-SET-1）。
    pub fn get(conn: &Connection) -> Result<Setting, String> {
        conn.query_row(
            "SELECT id, baseline_hours FROM setting WHERE id = 1",
            [],
            |row| {
                Ok(Setting {
                    id: row.get("id")?,
                    baseline_hours: row.get("baseline_hours")?,
                })
            },
        )
        .map_err(|e| format!("設定の取得に失敗しました: {e}"))
    }

    /// 基準線を更新する（R-SET-2）。
    pub fn update(conn: &Connection, baseline_hours: f64) -> Result<Setting, String> {
        conn.execute(
            "UPDATE setting SET baseline_hours = ?1 WHERE id = 1",
            [baseline_hours],
        )
        .map_err(|e| format!("設定の更新に失敗しました: {e}"))?;
        get(conn)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::open_connection;
    use crate::schema::migrate;
    use std::path::Path;

    fn conn() -> Connection {
        let conn = open_connection(Path::new(":memory:")).expect("接続を開けること");
        migrate(&conn).expect("マイグレーション成功");
        conn
    }

    #[test]
    fn work_category_create_with_plans_and_find() {
        let mut c = conn();
        let plans = vec![
            MonthlyPlanInput {
                target_month: "2026/06".into(),
                planned_hours: 40.0,
            },
            MonthlyPlanInput {
                target_month: "2026/07".into(),
                planned_hours: 20.0,
            },
        ];
        let created =
            work_category::create(&mut c, "A1", "設計", 100.0, &plans).expect("登録できること");
        assert!(created.id > 0);
        assert_eq!(created.code, "A1");
        assert_eq!(created.monthly_plans.len(), 2);
        assert_eq!(created.monthly_plans[0].target_month, "2026/06");
    }

    #[test]
    fn work_category_allows_duplicate_code() {
        let mut c = conn();
        work_category::create(&mut c, "DUP", "区分1", 0.0, &[]).expect("1件目");
        work_category::create(&mut c, "DUP", "区分2", 0.0, &[]).expect("同一コードでも登録可");
        let all = work_category::list(&c).expect("一覧");
        assert_eq!(all.len(), 2, "コード重複が許容されること（R-CAT-2）");
    }

    #[test]
    fn work_category_update_replaces_plans() {
        let mut c = conn();
        let created = work_category::create(
            &mut c,
            "A",
            "旧",
            10.0,
            &[MonthlyPlanInput {
                target_month: "2026/06".into(),
                planned_hours: 8.0,
            }],
        )
        .expect("登録");
        let updated = work_category::update(
            &mut c,
            created.id,
            "B",
            "新",
            20.0,
            &[MonthlyPlanInput {
                target_month: "2026/07".into(),
                planned_hours: 16.0,
            }],
        )
        .expect("更新");
        assert_eq!(updated.code, "B");
        assert_eq!(updated.name, "新");
        assert_eq!(updated.monthly_plans.len(), 1);
        assert_eq!(updated.monthly_plans[0].target_month, "2026/07");
    }

    #[test]
    fn work_category_delete_cascades() {
        let mut c = conn();
        let cat = work_category::create(
            &mut c,
            "A",
            "設計",
            0.0,
            &[MonthlyPlanInput {
                target_month: "2026/06".into(),
                planned_hours: 8.0,
            }],
        )
        .expect("登録");
        actual_work::create(&c, cat.id, 3.0, "2026/06/01", Some("memo")).expect("実績登録");

        work_category::delete(&c, cat.id).expect("削除");
        assert!(work_category::find(&c, cat.id).expect("検索").is_none());
        // 子レコードがカスケード削除されること（R-DATA-4）。
        let actuals = actual_work::list(&c, &ActualWorkFilter::default()).expect("実績一覧");
        assert!(actuals.is_empty(), "実績がカスケード削除されること");
    }

    #[test]
    fn work_category_update_missing_errs() {
        let mut c = conn();
        let r = work_category::update(&mut c, 999, "X", "Y", 0.0, &[]);
        assert!(r.is_err(), "存在しないIDの更新はエラー");
    }

    #[test]
    fn actual_work_crud_and_memo_null() {
        let mut c = conn();
        let cat = work_category::create(&mut c, "A", "設計", 0.0, &[]).expect("区分");
        let a = actual_work::create(&c, cat.id, 2.5, "2026/06/10", None).expect("登録");
        assert_eq!(a.memo, None, "メモはNULL許容（R-ACT-9）");
        assert_eq!(a.work_date, "2026/06/10", "日付は yyyy/mm/dd を保持（R-ACT-8）");

        let u = actual_work::update(&c, a.id, cat.id, 4.0, "2026/06/11", Some("追記")).expect("更新");
        assert_eq!(u.actual_hours, 4.0);
        assert_eq!(u.memo.as_deref(), Some("追記"));

        actual_work::delete(&c, a.id).expect("削除");
        assert!(actual_work::find(&c, a.id).expect("検索").is_none());
    }

    #[test]
    fn actual_work_list_filters() {
        let mut c = conn();
        let cat1 = work_category::create(&mut c, "A", "設計", 0.0, &[]).expect("区分1");
        let cat2 = work_category::create(&mut c, "B", "実装", 0.0, &[]).expect("区分2");
        actual_work::create(&c, cat1.id, 1.0, "2026/06/01", None).expect("d1");
        actual_work::create(&c, cat1.id, 2.0, "2026/06/15", None).expect("d2");
        actual_work::create(&c, cat2.id, 3.0, "2026/06/20", None).expect("d3");

        // 期間絞り込み。
        let f = ActualWorkFilter {
            from_date: Some("2026/06/10".into()),
            to_date: Some("2026/06/30".into()),
            work_category_id: None,
        };
        assert_eq!(actual_work::list(&c, &f).expect("期間").len(), 2);

        // 作業区分絞り込み。
        let f2 = ActualWorkFilter {
            work_category_id: Some(cat2.id),
            ..Default::default()
        };
        let only = actual_work::list(&c, &f2).expect("区分");
        assert_eq!(only.len(), 1);
        assert_eq!(only[0].work_category_id, cat2.id);

        // 絞り込みなし＝全件、作業日昇順。
        let all = actual_work::list(&c, &ActualWorkFilter::default()).expect("全件");
        assert_eq!(all.len(), 3);
        assert_eq!(all[0].work_date, "2026/06/01");
        assert_eq!(all[2].work_date, "2026/06/20");
    }

    #[test]
    fn setting_get_and_update() {
        let c = conn();
        let s = setting::get(&c).expect("取得");
        assert_eq!(s.baseline_hours, 8.0, "初期基準線は8（R-SET-3）");

        let updated = setting::update(&c, 7.5).expect("更新");
        assert_eq!(updated.baseline_hours, 7.5);
        assert_eq!(setting::get(&c).expect("再取得").baseline_hours, 7.5);
    }
}
