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

### Personal Place Dictionary（使うほど、その人の呼び方を覚える）

1. 「**ジム**に着いたらプロテイン」と入力 → 組み込みに無い場所なので **1回だけ**「「ジム」ってどこ？」と聞かれる
2. 「職場」をタップ → 対応を保存。「覚えた場所」に `ジム → 職場` が並ぶ
3. 次に「**ジム**出たらストレッチ」と入力 → **もう聞かない。**「「ジム」= 職場 と覚えています」と表示して即セット

対応は端末に保存され、次回セッションでも再利用されます。「覚えた場所」の × でいつでも忘れさせられます。

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

### Vercel（`vercel.json` 設定済み・404 対策込み）

このリポジトリは monorepo（アプリは `web/`）。リポジトリ直下の **`vercel.json`** が
ビルドと出力先を明示しているので、**Vercel の Root Directory は空（＝リポジトリ直下）のままでよい**。

- Root Directory: **未設定（`.` / 空）** ← ここを `web` にしない
- Framework Preset: **Other**（`vercel.json` の `framework: null` で指定済み）
- Build / Output / Install: `vercel.json` が指定（`cd web && npm run build` → `web/dist`）
- SPA なので全パスを `/index.html` に rewrite（`vercel.json` の `rewrites`）

> もし Vercel 側で Root Directory を `web` にしている場合は、`web/vercel.json`（rewrite のみ）が
> 効くので動くが、**推奨は Root Directory 空 ＋ リポジトリ直下 `vercel.json`**（設定が1箇所に集約される）。

以前 `404: NOT_FOUND` になっていたのは、Root Directory が `web` に反映されておらず、
リポジトリ直下に `package.json` も `index.html` も無いため Vercel が配信対象を見つけられなかったのが原因。
`vercel.json` を追加してビルド元と出力先を明示することで解消する。

### その他のホスト

| 方法 | 手順 |
|---|---|
| **GitHub Pages** | Settings → Pages → Source を「GitHub Actions」に。以降 `main` への push で `.github/workflows/deploy.yml` が lint→test→build→公開 |
| **Netlify** | リポジトリを繋ぐだけ。`netlify.toml` にビルド設定済み。または `web/dist` をドラッグ&ドロップ |
| **Cloudflare Pages** | ビルドコマンド `npm run build`、出力 `dist`、ルート `web` |

秘密情報（APIキー等）は一切使っていないため、どのホストでも追加設定なしで動く。

## SwiftUI 版との関係

`../docs/PLAN-v1.md` の承認済み設計に沿う。`domain/` の型と状態機械はネイティブ実装へそのまま
移植できる設計にしてある。Mac が使える 2026-09-05 以降、`../ios/` に SwiftUI 版を追加予定。
