# そのとき

**覚えておかなくていいメモ。** 書くのは「何を」だけ。「いつ・どこで」は、そのときが決めます。

ユーザーは「覚えておいてほしい内容」を一言入力するだけ。AI が「その情報を再び返すべき未来の状況」
= **Moment** を推論し、その場面が来たときにだけ通知する。通知には `[やった]` と `[次のそのとき]` があり、
`[次のそのとき]` は時間スヌーズではなく、**同じ Moment が次に成立したときに再通知**する。

## リポジトリ構成

| ディレクトリ | 中身 | 状態 |
|---|---|---|
| `web/` | Heroes League 向けの Web プロトタイプ（React + TypeScript + Vite） | 実装済み |
| `ios/` | SwiftUI ネイティブ版 | 予定（Mac が使える 2026-09-05 以降） |

設計の全体像は `docs/PLAN-v1.md`（承認済み設計 Plan）を参照。

## Web プロトタイプの目的

ブラウザ上でコア体験を最短で触れる状態にする。バックグラウンド位置通知は端末では OS が担うため、
Web 版では無理に再現せず、**状況シミュレーション**（スーパー到着 / 大学退出 / 帰宅 / 外出 / 時間帯）で
体験を完成させている。

```bash
cd web
npm install
npm run dev      # http://localhost:5173
npm test         # ドメインロジック + ストアのテスト
npm run build    # 本番ビルド (dist/)
```

## Web と SwiftUI 版で共有する語彙

Web 版のドメイン層（`web/src/domain/`）は、承認済み Plan の用語をそのまま写している：

- **Moment（semantic）** — ユーザーに見える意味。到着 / 退出 / 帰宅 / 出社 / 次に外出 / 日時 の6種
- **Resolver** — semantic Moment を決定論的に 3 つの primitive へ変換
- **Trigger primitive** — エンジンが知るのは `time` / `place_enter` / `place_exit` の3種だけ
- **Interpreter（adapter）** — 自然文 → `MomentInterpretation`（OS非依存）。Web はルールベース、
  ネイティブは端末内 LLM に差し替え可能

## ライセンス

社内プロトタイプ。
