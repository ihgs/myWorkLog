# language: ja
#
# 機能領域: データ永続化（横断）
# 対応EARS: specs/basic-design.md 4.3
# 注: R-DATA-4（カスケード削除）は work-category-management.feature の R-CAT-5 で検証する。
# トレーサビリティ: 各シナリオの @R-XXX-n タグが basic-design.md の要求IDに対応する。

@data @persistence
機能: データ永続化
  業務データをSQLite（app_data_dir配下）に永続化し、初回起動時に初期化する。

  @R-DATA-1
  シナリオ: 業務データはSQLiteに永続化される
    前提 アプリケーションが起動している
    もし ユーザーが作業区分・実績工数・設定を登録する
    かつ アプリケーションを再起動する
    ならば 本システムは 登録した全ての業務データをSQLiteから復元して表示する

  @R-DATA-2
  シナリオ: 初回起動でテーブル作成と設定初期レコードを投入する
    前提 SQLiteのDBファイルが存在しない
    もし ユーザーがアプリケーションを初回起動する
    ならば 本システムは 必要なテーブルを作成する
    かつ 本システムは setting の初期レコード "baseline_hours = 8" を投入する

  @R-DATA-3
  シナリオ: DBファイルをアプリデータディレクトリ配下に配置する
    もし ユーザーがアプリケーションを起動する
    ならば 本システムは SQLiteのDBファイルを app_data_dir 配下に配置する
