import { describe, expect, it } from 'vitest';
import { interpret } from './interpreter';

describe('interpret — 覚えておきたい内容だけから Moment を推論する', () => {
  it('「牛乳なくなりそう」→ 次にスーパーに着いたとき（繰り返し・高確信）', () => {
    const r = interpret('牛乳なくなりそう');
    expect(r.moments[0].kind).toBe('place_arrival');
    expect(r.moments[0].poiCategory).toBe('grocery');
    expect(r.moments[0].recurringHint).toBe(true);
    expect(r.moments[0].humanLabel).toBe('次にスーパーに着いたとき');
    expect(r.moments[0].confidence).toBeGreaterThanOrEqual(0.75);
    expect(r.needsUserConfirmation).toBe(false);
  });

  it('「傘、大学に置いてきた」→ 次に大学を出るとき', () => {
    const r = interpret('傘、大学に置いてきた');
    expect(r.moments[0].kind).toBe('place_departure');
    expect(r.moments[0].placeLabel).toBe('大学');
    expect(r.moments[0].humanLabel).toBe('次に大学を出るとき');
    expect(r.category).toBe('belongings');
    // 登校時に気づく手も、という代替候補も出す
    expect(r.moments.some((m) => m.kind === 'place_arrival')).toBe(true);
  });

  it('「帰りにゴミ袋買う」→ 買い物としてスーパー到着に寄せる', () => {
    const r = interpret('帰りにゴミ袋買う');
    expect(r.moments[0].kind).toBe('place_arrival');
    expect(r.moments[0].poiCategory).toBe('grocery');
  });

  it('「会社で田中さんに資料の件を伝える」→ 次に出社したとき（伝言）', () => {
    const r = interpret('会社で田中さんに資料の件を伝える');
    expect(r.moments[0].kind).toBe('work_arrival');
    expect(r.moments[0].humanLabel).toBe('次に出社したとき');
    expect(r.category).toBe('message');
  });

  it('「週末どこか出かけたら日焼け止め塗る」→ 次に出かけるとき', () => {
    const r = interpret('週末どこか出かけたら日焼け止め塗る');
    expect(r.moments[0].kind).toBe('leave_home');
    expect(r.moments[0].humanLabel).toBe('次に出かけるとき');
  });

  it('「帰ったら電気代払う」→ 次に帰宅したとき', () => {
    const r = interpret('帰ったら電気代払う');
    expect(r.moments[0].kind).toBe('home_arrival');
  });

  it('薬局の指定を拾う', () => {
    const r = interpret('絆創膏なくなった、薬局で買う');
    expect(r.moments[0].kind).toBe('place_arrival');
    expect(r.moments[0].poiCategory).toBe('pharmacy');
    expect(r.moments[0].humanLabel).toBe('次に薬局に着いたとき');
  });

  it('店名だけでも「その店に着いたとき」と読む（くりかえしは付けない）', () => {
    const r = interpret('コンビニでコーヒー');
    expect(r.moments[0].kind).toBe('place_arrival');
    expect(r.moments[0].poiCategory).toBe('convenience');
    expect(r.moments[0].recurringHint).toBe(false);
  });

  it('「帰りに電話する」→ 次に帰宅したとき（買い物語が無ければ帰宅扱い）', () => {
    const r = interpret('帰りに大家さんに電話する');
    expect(r.moments[0].kind).toBe('home_arrival');
  });

  it('「トイレットペーパー在庫が心もとない」→ スーパー到着（在庫ワードを拾う）', () => {
    const r = interpret('トイレットペーパー在庫が心もとない');
    expect(r.moments[0].kind).toBe('place_arrival');
    expect(r.moments[0].poiCategory).toBe('grocery');
    expect(r.moments[0].recurringHint).toBe(true);
  });

  it('「今日中に郵便出す」→ 期限ありの時間 Moment、確認を求める', () => {
    const r = interpret('今日中に郵便出す');
    expect(r.moments[0].kind).toBe('time');
    expect(r.moments[0].timeBucket).toBe('this_evening');
  });

  it('手がかりが無い入力は確認フラグを立て、候補を複数返す', () => {
    const r = interpret('あれ、やらないと');
    expect(r.needsUserConfirmation).toBe(true);
    expect(r.ambiguityNote).toBeTruthy();
    expect(r.moments.length).toBeGreaterThanOrEqual(2);
  });

  it('前後の空白を落とし、原文を保持する', () => {
    const r = interpret('  牛乳なくなりそう  ');
    expect(r.originalText).toBe('牛乳なくなりそう');
  });

  it('候補は確信度の降順で並ぶ', () => {
    const r = interpret('傘、大学に置いてきた');
    for (let i = 1; i < r.moments.length; i += 1) {
      expect(r.moments[i - 1].confidence).toBeGreaterThanOrEqual(r.moments[i].confidence);
    }
  });
});

describe('interpret — Personal Place Dictionary（独自の場所の呼び方）', () => {
  it('辞書に無い呼び方は「教えて」候補になる（着いたら）', () => {
    const r = interpret('ジムに着いたらプロテイン飲む');
    expect(r.moments[0].kind).toBe('place_arrival');
    expect(r.moments[0].placePhrase).toBe('ジム');
    expect(r.moments[0].needsPlaceLearning).toBe(true);
    expect(r.moments[0].learnedPlaceId).toBeUndefined();
  });

  it('辞書に無い呼び方（出るとき）も拾う', () => {
    const r = interpret('ジム出たらプロテイン');
    expect(r.moments[0].kind).toBe('place_departure');
    expect(r.moments[0].placePhrase).toBe('ジム');
    expect(r.moments[0].needsPlaceLearning).toBe(true);
  });

  it('辞書にある呼び方は、聞かずに実際の場所へ解決する', () => {
    const dict = { ジム: 'work' as const };
    const r = interpret('ジム出たらストレッチ', dict);
    expect(r.moments[0].kind).toBe('place_departure');
    expect(r.moments[0].learnedPlaceId).toBe('work');
    expect(r.moments[0].needsPlaceLearning).toBe(false);
    expect(r.moments[0].confidence).toBeGreaterThanOrEqual(0.85);
    expect(r.needsUserConfirmation).toBe(false);
  });

  it('「実家に忘れた」→ 実家を出るとき（belongings）', () => {
    const r = interpret('財布、実家に忘れた');
    expect(r.moments[0].kind).toBe('place_departure');
    expect(r.moments[0].placePhrase).toBe('実家');
    expect(r.category).toBe('belongings');
  });

  it('「駅前のカフェに寄ったら」→ カフェ（助詞・修飾を落として拾う）', () => {
    const r = interpret('駅前のカフェに寄ったら新刊チェック');
    expect(r.moments[0].placePhrase).toBe('カフェ');
    expect(r.moments[0].kind).toBe('place_arrival');
  });

  it('場所でない語（ネット等）は独自の場所にしない', () => {
    const r = interpret('替えのフィルター、ネットで買う');
    expect(r.moments[0].placePhrase).toBeUndefined();
    expect(r.moments[0].needsPlaceLearning).toBeFalsy();
    // 買う → スーパー到着に落ちる
    expect(r.moments[0].kind).toBe('place_arrival');
  });

  it('組み込みの場所（大学）は辞書機構を通らない', () => {
    const r = interpret('傘、大学に置いてきた');
    expect(r.moments[0].placePhrase).toBeUndefined();
    expect(r.moments[0].needsPlaceLearning).toBeFalsy();
  });

  it('コア入力（牛乳なくなりそう）は一切影響を受けない', () => {
    const r = interpret('牛乳なくなりそう');
    expect(r.moments[0].kind).toBe('place_arrival');
    expect(r.moments[0].poiCategory).toBe('grocery');
    expect(r.moments[0].placePhrase).toBeUndefined();
  });
});
