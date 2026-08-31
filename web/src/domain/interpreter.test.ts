import { describe, expect, it } from 'vitest';
import { interpret } from './interpreter';
import { freshDict, learnPlace } from './placeDictionary';
import type { PlaceDict } from './types';

/** 組み込みラベル（スーパー等）が仕込まれた辞書。 */
const seeded = (): PlaceDict => freshDict();

describe('interpret — 覚えておきたい内容だけから Moment を推論する', () => {
  it('「牛乳なくなりそう」→ 次にスーパーに着いたとき（組み込み店・繰り返し・聞かない）', () => {
    const c = interpret('牛乳なくなりそう', seeded()).moments[0];
    expect(c.kind).toBe('place_arrival');
    expect(c.placePhrase).toBe('スーパー');
    expect(c.poiCategoryHint).toBe('grocery');
    expect(c.recurringHint).toBe(true);
    expect(c.humanLabel).toBe('次にスーパーに着いたとき');
    expect(c.confidence).toBeGreaterThanOrEqual(0.75);
    expect(c.needsPlaceLearning).toBe(false); // スーパーは seed 済み
  });

  it('店がまだ1つも登録されていなければ「どこ?」と聞く', () => {
    const c = interpret('牛乳なくなりそう', {}).moments[0];
    expect(c.needsPlaceLearning).toBe(true);
  });

  it('「傘、大学に置いてきた」→ 次に大学を出るとき', () => {
    const r = interpret('傘、大学に置いてきた', seeded());
    expect(r.moments[0].kind).toBe('place_departure');
    expect(r.moments[0].placePhrase).toBe('大学');
    expect(r.moments[0].humanLabel).toBe('次に大学を出るとき');
    expect(r.category).toBe('belongings');
    expect(r.moments.some((m) => m.kind === 'place_arrival')).toBe(true);
  });

  it('「会社で伝える」→ 次に出社したとき（work アンカー）', () => {
    const c = interpret('会社で日報の件を伝える', seeded()).moments[0];
    expect(c.kind).toBe('work_arrival');
    expect(c.anchorHint).toBe('work');
    expect(c.humanLabel).toBe('次に出社したとき');
  });

  it('「週末出かけたら」→ 次に出かけるとき（home アンカー）', () => {
    const c = interpret('週末出かけたら折り畳み傘を入れる', seeded()).moments[0];
    expect(c.kind).toBe('leave_home');
    expect(c.anchorHint).toBe('home');
  });

  it('「帰ったら」→ 次に帰宅したとき', () => {
    const c = interpret('帰ったら電気代払う', seeded()).moments[0];
    expect(c.kind).toBe('home_arrival');
    expect(c.anchorHint).toBe('home');
  });

  it('「今日中に郵便出す」→ 時間 Moment', () => {
    const c = interpret('今日中に郵便出す', seeded()).moments[0];
    expect(c.kind).toBe('time');
    expect(c.timeBucket).toBe('this_evening');
  });

  it('手がかりが無い入力は確認フラグを立て、候補を複数返す', () => {
    const r = interpret('あれ、やらないと', seeded());
    expect(r.needsUserConfirmation).toBe(true);
    expect(r.ambiguityNote).toBeTruthy();
    expect(r.moments.length).toBeGreaterThanOrEqual(2);
  });

  it('候補は確信度の降順', () => {
    const r = interpret('傘、大学に置いてきた', seeded());
    for (let i = 1; i < r.moments.length; i += 1) {
      expect(r.moments[i - 1].confidence).toBeGreaterThanOrEqual(r.moments[i].confidence);
    }
  });

  it('前後の空白を落とし、原文を保持する', () => {
    expect(interpret('  牛乳なくなりそう  ', seeded()).originalText).toBe('牛乳なくなりそう');
  });
});

describe('interpret — Personal Place Dictionary（独自の呼び方）', () => {
  it('辞書に無い呼び方は「教えて」候補（着いたら）', () => {
    const c = interpret('ジムに着いたらプロテイン飲む', {}).moments[0];
    expect(c.kind).toBe('place_arrival');
    expect(c.placePhrase).toBe('ジム');
    expect(c.needsPlaceLearning).toBe(true);
  });

  it('辞書に無い呼び方（出るとき）も拾う', () => {
    const c = interpret('ジム出たらストレッチ', {}).moments[0];
    expect(c.kind).toBe('place_departure');
    expect(c.placePhrase).toBe('ジム');
    expect(c.needsPlaceLearning).toBe(true);
  });

  it('登録済みの呼び方は聞かずに済む（確信度も上がる）', () => {
    const dict = learnPlace({}, 'ジム', 'work');
    const c = interpret('ジム出たらストレッチ', dict).moments[0];
    expect(c.needsPlaceLearning).toBe(false);
    expect(c.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('「財布、実家に忘れた」→ 実家を出るとき（belongings）', () => {
    const r = interpret('財布、実家に忘れた', {});
    expect(r.moments[0].kind).toBe('place_departure');
    expect(r.moments[0].placePhrase).toBe('実家');
    expect(r.category).toBe('belongings');
  });

  it('「駅前のカフェに寄ったら」→ カフェ', () => {
    const c = interpret('駅前のカフェに寄ったら新刊チェック', {}).moments[0];
    expect(c.placePhrase).toBe('カフェ');
    expect(c.kind).toBe('place_arrival');
  });

  it('場所でない語は独自の場所にしない', () => {
    for (const t of ['ゴミを出す', '手紙を出す', 'うまく行ったら連絡', '順調に行ったら報告', '早く帰ったら休む', '友達に返事する']) {
      const r = interpret(t, seeded());
      expect(r.moments[0]?.needsPlaceLearning ?? false, `"${t}" が誤検出`).toBe(false);
    }
  });
});
