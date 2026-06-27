# Work Log Managemnt

このプロジェクトは、仕事の作業量を管理するデスクトップアプリです。
データはsqliteをつかって永続化してください。
mac/windowsで動作します。

以下の機能を有しています。(MVP)

- 作業区分を登録できる
    - 作業区分のEntityは
        - コード: string（重複可能）
        - 名前: string
        - 予定工数：number
        - 月予定: array
            - 対象月：yyyy/mm
            - 予定工数: number
- 作業区分を選んで実績工数を入力できる
    - 実績工数のEntityは、
        - 作業区分との関連
        - 実績時間: number
        - 作業日: yyyy/mm/dd
        - メモ: string
- 作業区分、実績工数はそれぞれ編集・削除ができる
- ダッシュボード
    - 棒グラフで今月（変更可能）の予定工数と実績工数がグラフで表示されること。その際に全体、各作業区分ごとでみえる。
    - 棒グラフで今月の1日ごとの実績時間が実績工数の区分で色分けれされた積み上げグラフで表示されること。
        - 基準線が横線で表示されること（基準線は設定画面で更新可能。デフォルト8）
        - グラフの上にその日の合計時間が表示されること
        - データがなくても、1日から月末でグラフ上に表示されること

## 開発・ビルド手順

本アプリは [Tauri 2](https://tauri.app/)（Rust）+ React + Vite で構成しています。

### 必要なツール

- [Node.js](https://nodejs.org/)（v22 以上を推奨）
- [pnpm](https://pnpm.io/)（v9 以上）
- [Rust ツールチェイン](https://www.rust-lang.org/tools/install)（`rustup` でインストール、stable）
- 各 OS の Tauri 前提パッケージ（[公式の前提条件](https://tauri.app/start/prerequisites/)を参照）
    - macOS: Xcode Command Line Tools（`xcode-select --install`）
    - Windows: Microsoft C++ Build Tools と WebView2 ランタイム

### セットアップ

```bash
pnpm install
```

### 開発（ホットリロード）

デスクトップアプリとして開発サーバーを起動します。

```bash
pnpm tauri dev
```

フロントエンドのみを確認したい場合は次を使います。

```bash
pnpm dev
```

### 本番ビルド（インストーラ／実行ファイルの生成）

```bash
pnpm tauri build
```

成果物は `src-tauri/target/release/bundle/` に出力されます。

- macOS: `.app` / `.dmg`（`bundle/macos/`, `bundle/dmg/`）
- Windows: `.msi` / `.exe`（`bundle/msi/`, `bundle/nsis/`）

クロスコンパイルは行わず、配布対象の OS 上でそれぞれビルドしてください。
