// Rule-based interpreter — the "AI" that turns a plain sentence into a Moment.
//
// Adapter: swap for an on-device LLM later; the canonical output type is stable.
// A tuned Japanese keyword parser is enough for the demo — you write only *what*,
// never *when / where*. Places are resolved deterministically by the Resolver /
// Personal Place Dictionary (1 意味ラベル → 複数の実場所).

import { lookupPlaces } from './placeDictionary';
import type {
  Anchor,
  MomentCandidate,
  MomentInterpretation,
  PlaceDict,
  PoiCategory,
  TimeBucket,
} from './types';

interface Draft {
  kind: MomentCandidate['kind'];
  placeLabel?: string;
  poiCategoryHint?: PoiCategory;
  direction?: MomentCandidate['direction'];
  timeBucket?: TimeBucket;
  recurringHint?: boolean;
  confidence: number;
  placePhrase?: string;
  needsPlaceLearning?: boolean;
  anchorHint?: Anchor;
}

const has = (text: string, ...needles: string[]) => needles.some((n) => text.includes(n));

const BUY_VERBS = ['買わなきゃ', '買わないと', '買わねば', '買う', '買っ', '買お', '購入', '補充', '仕入れ'];
const LOW_STOCK = [
  'なくなりそう', 'なくなった', '切れそう', '切れた', '切らし', '残りわずか', '底をつき',
  '在庫', '足りない', '足りなく', 'ストックが',
];
const FORGOT = ['置いてきた', '置いて来た', '置き忘れ', '忘れてきた', '忘れ物', 'に忘れた', 'で忘れた'];
const MESSAGE = ['伝える', '伝えて', '言う', '報告', '連絡', '相談', '確認する', '聞く'];
const DEADLINE = ['までに', '今日中', '今日のうち', '期限', '〆', '締め切り', '締切', 'マスト', '絶対今日'];

const NOT_A_PLACE = new Set([
  'ネット', 'ねっと', '通販', 'アプリ', '電話', 'メール', '現金', 'カード', 'スマホ', 'ここ',
  'そこ', 'あそこ', '自分', '手元', '家', 'うち', '自宅', 'あと', '後', 'ついで', '近く',
  'ゴミ', 'ごみ', '手紙', '資料', '書類', '名前', '声', '車', '電車', 'バス', '疲れ', '熱',
  '元気', 'やる気', '結果', '答え', '返事', '芽', '本気',
  '順調', 'スムーズ', '上手', '予定通り', '計画通り', '思い通り', '期待通り', 'うまく',
]);

const ARRIVAL_CUES = ['に着い', 'についたら', 'に到着', 'に行っ', 'に寄っ', 'に立ち寄', 'で借り', 'で受け取', 'に返す', 'に返し', 'に返却', 'に帰っ'];
const DEPART_CUES = ['を出る', 'を出た', 'から出る', 'から出た', 'から帰', '出たら', '出るとき', 'を後に', 'から戻'];
const FORGOT_CUES = ['に忘れ', 'で忘れ', 'に置いてき', 'で無くし', 'でなくし', 'で失く'];

const SEP = /(?:を|は|が|に|へ|で|と|も|や|の|から|まで|、|。|,|「|」|・|\s)/;

function tailPhrase(before: string): string | undefined {
  const chunk = before
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  if (!chunk || chunk.length < 2 || chunk.length > 16) return undefined;
  if (NOT_A_PLACE.has(chunk)) return undefined;
  if (/^\d+$/.test(chunk)) return undefined;
  return chunk;
}

interface CustomPlace {
  phrase: string;
  kind: 'arrival' | 'departure';
  forgot: boolean;
}

function detectCustomPlace(text: string): CustomPlace | undefined {
  const before = (cue: string): string | undefined => {
    const i = text.indexOf(cue);
    return i > 0 ? tailPhrase(text.slice(0, i)) : undefined;
  };
  for (const cue of FORGOT_CUES) {
    const p = before(cue);
    if (p) return { phrase: p, kind: 'departure', forgot: true };
  }
  for (const cue of DEPART_CUES) {
    const p = before(cue);
    if (p) return { phrase: p, kind: 'departure', forgot: false };
  }
  for (const cue of ARRIVAL_CUES) {
    const p = before(cue);
    if (p) return { phrase: p, kind: 'arrival', forgot: false };
  }
  return undefined;
}

/** 組み込みの場所。大学は学習ラベル、会社は work アンカー。 */
function detectBuiltinPlace(text: string): 'school' | 'work' | undefined {
  if (has(text, '大学', '学校', 'キャンパス', 'ゼミ', '研究室')) return 'school';
  if (has(text, '会社', '職場', 'オフィス', '仕事場', '出社')) return 'work';
  return undefined;
}

function detectStore(text: string): { label: string; hint: PoiCategory } | undefined {
  if (has(text, '薬局', 'ドラッグストア', 'ドラッグ', '処方', '薬を')) return { label: '薬局', hint: 'pharmacy' };
  if (has(text, 'コンビニ', 'セブン', 'ローソン', 'ファミマ')) return { label: 'コンビニ', hint: 'convenience' };
  if (has(text, 'スーパー', '食料品', 'マーケット')) return { label: 'スーパー', hint: 'grocery' };
  return undefined;
}

function detectTime(text: string): TimeBucket | undefined {
  if (has(text, '明日の朝', '明日朝', '朝イチ', '起きたら', '明朝')) return 'tomorrow_morning';
  if (has(text, '明日')) return 'tomorrow_morning';
  if (has(text, '今夜', '夜に', '今晩', '夕方', '今日中', '今日のうち', '帰ってから夜'))
    return 'this_evening';
  return undefined;
}

function labelFor(d: Draft): string {
  switch (d.kind) {
    case 'place_arrival':
      return `次に${d.placeLabel ?? d.placePhrase ?? 'その場所'}に着いたとき`;
    case 'place_departure':
      return `次に${d.placeLabel ?? d.placePhrase ?? 'その場所'}を出るとき`;
    case 'home_arrival':
      return '次に帰宅したとき';
    case 'leave_home':
      return '次に出かけるとき';
    case 'work_arrival':
      return '次に出社したとき';
    case 'time':
      return d.timeBucket === 'tomorrow_morning' ? '明日の朝' : '今日の夕方';
  }
}

function detectCategory(text: string): string {
  if (has(text, ...FORGOT) || has(text, ...FORGOT_CUES)) return 'belongings';
  if (has(text, ...LOW_STOCK) || has(text, ...BUY_VERBS)) return 'shopping';
  if (has(text, ...MESSAGE)) return 'message';
  return 'errand';
}

/** 自然文 → Moment候補（確信度の高い順）。dict は Personal Place Dictionary。 */
export function interpret(rawText: string, dict: PlaceDict = {}): MomentInterpretation {
  const text = rawText.trim();
  const drafts: Draft[] = [];

  const store = detectStore(text);
  const builtin = detectBuiltinPlace(text);
  const customPlace = !store && !builtin ? detectCustomPlace(text) : undefined;
  const timeBucket = detectTime(text);
  const buyIntent = has(text, ...LOW_STOCK) || has(text, ...BUY_VERBS);
  const isShopping = buyIntent || store != null || has(text, 'ついでに', '寄って', '買い物');
  const isForgot = has(text, ...FORGOT);
  const backToHome =
    !customPlace &&
    has(
      text,
      '帰ったら', '帰宅', '家に帰っ', 'うちに帰っ', '帰ってから', '家についたら', '家に着いたら', '帰りに', '帰りがけ',
    );
  const goingOut = has(text, '出かけたら', '出かける', '外出', '家を出る', '出発', 'お出かけ');
  const toWork = has(text, '出社', '会社に着いたら', '会社で', '職場で', '職場に着', 'オフィスで', '仕事場で');

  const unknown = (phrase: string) => lookupPlaces(dict, phrase).length === 0;

  // 0. 独自の呼び方
  if (customPlace) {
    const needs = unknown(customPlace.phrase);
    drafts.push({
      kind: customPlace.kind === 'departure' ? 'place_departure' : 'place_arrival',
      placeLabel: customPlace.phrase,
      direction: customPlace.kind,
      confidence: needs ? 0.72 : 0.92,
      placePhrase: customPlace.phrase,
      needsPlaceLearning: needs,
    });
    if (customPlace.forgot) {
      drafts.push({
        kind: 'place_arrival',
        placeLabel: customPlace.phrase,
        direction: 'arrival',
        confidence: 0.34,
        placePhrase: customPlace.phrase,
        needsPlaceLearning: needs,
      });
    }
  }

  // 1. 置き忘れ・忘れ物（組み込みの場所）
  if (isForgot && builtin === 'school') {
    const needs = unknown('大学');
    drafts.push({ kind: 'place_departure', placeLabel: '大学', direction: 'departure', confidence: 0.77, placePhrase: '大学', needsPlaceLearning: needs });
    drafts.push({ kind: 'place_arrival', placeLabel: '大学', direction: 'arrival', confidence: 0.36, placePhrase: '大学', needsPlaceLearning: needs });
  }
  if (isForgot && builtin === 'work') {
    drafts.push({ kind: 'place_departure', placeLabel: '職場', direction: 'departure', confidence: 0.74, anchorHint: 'work' });
    drafts.push({ kind: 'place_arrival', placeLabel: '職場', direction: 'arrival', confidence: 0.36, anchorHint: 'work' });
  }

  // 2. 買い物・在庫切れ・店名 → 次にお店に着いたとき
  if (isShopping && !isForgot && !customPlace) {
    const s = store ?? { label: 'スーパー', hint: 'grocery' as PoiCategory };
    drafts.push({
      kind: 'place_arrival',
      placeLabel: s.label,
      poiCategoryHint: s.hint,
      direction: 'arrival',
      recurringHint: buyIntent,
      confidence: buyIntent ? (store ? 0.86 : 0.82) : store ? 0.7 : 0.6,
      placePhrase: s.label,
      needsPlaceLearning: unknown(s.label),
    });
  }

  // 3. 出社したら
  if (toWork && !isForgot && !customPlace) {
    drafts.push({ kind: 'work_arrival', direction: 'arrival', confidence: 0.8, anchorHint: 'work' });
  }

  // 4. 帰宅したら
  if (backToHome && !isShopping) {
    drafts.push({ kind: 'home_arrival', direction: 'arrival', confidence: 0.79, anchorHint: 'home' });
  }

  // 5. 出かけたら
  if (goingOut && !customPlace) {
    drafts.push({ kind: 'leave_home', direction: 'departure', confidence: 0.73, anchorHint: 'home' });
  }

  // 6. 純粋な時間指定
  if (timeBucket && drafts.length === 0) {
    drafts.push({ kind: 'time', timeBucket, confidence: 0.7 });
  }

  const hasDeadline =
    has(text, ...DEADLINE) || (timeBucket != null && drafts.some((d) => d.kind !== 'time'));

  let needsUserConfirmation = false;
  let ambiguityNote: string | undefined;

  // 7. フォールバック
  if (drafts.length === 0) {
    needsUserConfirmation = true;
    ambiguityNote = isForgot
      ? 'どこに置いてきた? 場所を選んでください'
      : 'いつ思い出したい? どれかを選んでください';
    drafts.push({ kind: 'time', timeBucket: timeBucket ?? 'this_evening', confidence: 0.28 });
    drafts.push({
      kind: 'place_arrival',
      placeLabel: 'スーパー',
      poiCategoryHint: 'grocery',
      direction: 'arrival',
      recurringHint: true,
      confidence: 0.24,
      placePhrase: 'スーパー',
      needsPlaceLearning: unknown('スーパー'),
    });
  }

  drafts.sort((a, b) => b.confidence - a.confidence);
  if (drafts[0].confidence < 0.55) needsUserConfirmation = true;

  const category = detectCategory(text);

  const moments: MomentCandidate[] = drafts.map((d) => ({
    kind: d.kind,
    placeLabel: d.placeLabel,
    poiCategoryHint: d.poiCategoryHint,
    direction: d.direction,
    timeBucket: d.timeBucket,
    hasDeadline: d.kind === 'time' ? false : hasDeadline,
    recurringHint: d.recurringHint ?? false,
    confidence: Math.round(d.confidence * 100) / 100,
    humanLabel: labelFor(d),
    placePhrase: d.placePhrase,
    needsPlaceLearning: d.needsPlaceLearning,
    anchorHint: d.anchorHint,
  }));

  return { originalText: text, category, moments, needsUserConfirmation, ambiguityNote };
}
