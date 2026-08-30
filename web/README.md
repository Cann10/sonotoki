# そのとき — Web プロトタイプ

React 19 + TypeScript + Vite。バックエンドなし・アカウントなし・すべて端末内（localStorage）。

## 使い方

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest（ドメイン + ストア、33 tests）
npm run lint       # oxlint
npm run build      # tsc -b && vite build → dist/
```

## デモの一本道（審査員向け）

1. 「牛乳なくなりそう」と入力（または例チップをタップ）
   → AI が **「次にスーパーに着いたとき」** と推論。条件は一切指定していない。
2. 下の状況シミュレーションで **スーパー** をタップ
   → 画面いっぱいに **「そのときです。」** と、あずけたメモが戻る。
3. **[次のそのとき]** をタップ
   → 完了にはならず、「次のそのとき待ち」へ。
4. スーパーを出て、もう一度スーパーに入る
   → 同じ Moment が **また戻ってくる**（時間スヌーズではない）。
5. **[やった]** で完了。

他の例：「傘、大学に置いてきた」→ 次に大学を**出る**とき / 「週末出かけたら…」→ 次に**外出**するとき。

## アーキテクチャ

```
src/
  domain/            純 TypeScript。React 非依存。テスト網羅。
    types.ts         canonical な型（Plan §10 と同じ語彙）
    interpreter.ts   自然文 → MomentInterpretation（ルールベース。LLM に差し替え可能な adapter）
    resolver.ts      semantic Moment → time / place_enter / place_exit
    engine.ts        トリガー判定 + 状態機械（armed→fired→done|awaiting_next→armed）
    places.ts        シミュレーターが扱う場所
    storage.ts       localStorage 永続化
  store/
    useSonotoki.ts   useReducer ベースのアプリ状態
  ui/                プレゼンテーション（NoteInput / InferenceToast / MomentList / WorldSim / SonotokiMoment）
```

**責務分離**：AI（interpreter）は「自然文 → 意味」まで。発火判定・再武装・状態遷移・場所計算は
すべて決定論エンジン（resolver + engine）。interpreter がなくてもエンジンは動く。

## デプロイ

静的サイト。バックエンドも環境変数も不要。`npm run build` の `dist/` をそのまま配信できる
（`vite.config.ts` で `base: './'` 指定済み、サブパス配信可）。

**本番公開は人間の判断で行う**（アカウント作成・公開操作が伴うため）。準備は済んでいる：

| 方法 | 手順 |
|---|---|
| **GitHub Pages（推奨）** | リポジトリを GitHub にpush → Settings → Pages → Source を「GitHub Actions」に。以降 `master` への push で `.github/workflows/deploy.yml` が lint→test→build→公開まで自動実行 |
| **Netlify** | リポジトリを繋ぐだけ。`netlify.toml` にビルド設定済み。または `web/dist` をドラッグ&ドロップ |
| **Vercel** | リポジトリを繋ぐ。Root Directory を `web` に。Vite は自動検出 |
| **Cloudflare Pages** | ビルドコマンド `npm run build`、出力 `dist`、ルート `web` |

秘密情報（APIキー等）は一切使っていないため、どのホストでも追加設定なしで動く。

## SwiftUI 版との関係

`../docs/PLAN-v1.md` の承認済み設計に沿う。`domain/` の型と状態機械はネイティブ実装へそのまま
移植できる設計にしてある。Mac が使える 2026-09-05 以降、`../ios/` に SwiftUI 版を追加予定。
