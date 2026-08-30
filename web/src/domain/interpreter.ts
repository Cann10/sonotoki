// Rule-based interpreter — the "AI" that turns a plain sentence into a Moment.
//
// The real app swaps this for an on-device LLM (see plan §改訂3: Interpreter is an
// adapter, the canonical output type stays the same). For the web prototype a
// tuned Japanese keyword parser is enough to show the core idea — you write only
// *what*, never *when / where* — and it runs instantly, offline, with no secrets.
//
// Personal Place Dictionary: 組み込みに無い場所の呼び方（「ジム」「実家」など）を
// 拾い、辞書にあれば実際の場所へ、無ければ「一度だけ教えて」の候補にする。

import { lookupPlace } from './placeDictionary';
import type {
  MomentCandidate,
  MomentInterpretation,
  PlaceDict,
  PlaceId,
  PoiCategory,
  TimeBucket,
} from './types';

interface Draft {
  kind: MomentCandidate['kind'];
  placeLabel?: string;
  placeKind?: MomentCandidate['placeKind'];
  poiCategory?: PoiCategory;
  direction?: MomentCandidate['direction'];
  timeBucket?: TimeBucket;
  recurringHint?: boolean;
  confidence: number;
  placePhrase?: string;
  learnedPlaceId?: PlaceId;
  needsPlaceLearning?: boolean;
}

const has = (text: string, ...needles: string[]) =>
  needles.some((n) => text.includes(n));

const BUY_VERBS = ['買わなきゃ', '買わないと', '買わねば', '買う', '買っ', '買お', '購入', '補充', '仕入れ'];
const LOW_STOCK = [
  'なくなりそう', 'なくなった', '切れそう', '切れた', '切らし', '残りわずか', '底をつき',
  '在庫', '足りない', '足りなく', 'ストックが',
];
const FORGOT = ['置いてきた', '置いて来た', '置き忘れ', '忘れてきた', '忘れ物', 'に忘れた', 'で忘れた'];
const MESSAGE = ['伝える', '伝えて', '言う', '報告', '連絡', '相談', '確認する', '聞く'];
const DEADLINE = ['までに', '今日中', '今日のうち', '期限', '〆', '締め切り', '締切', 'マスト', '絶対今日'];

// 場所らしく見えるが場所ではない語
const NOT_A_PLACE = [
  'ネット', 'ねっと', '通販', 'アプリ', '電話', 'メール', '現金', 'カード', 'スマホ', 'ここ',
  'そこ', 'あそこ', '自分', '手元', '家', 'うち', '自宅', 'あと', '後', 'ついで',
];

// 場所を示す言い回し。捕捉語の直後にこれが来たら、その手前を場所名とみなす。
const ARRIVAL_CUES = ['に着い', 'についたら', 'に到着', 'に行っ', '行ったら', 'に寄っ', '寄ったら', 'に立ち寄', 'で借り', 'で受け取', 'に返', 'に帰っ', '帰ったら'];
const DEPART_CUES = ['を出', 'から出', 'から帰', '出たら', '出るとき', 'を後に', 'から戻'];
const FORGOT_CUES = ['に忘れ', 'で忘れ', 'に置いてき', 'で無くし', 'でなくし', 'で失く'];

const SEP = /(?:を|は|が|に|へ|で|と|も|や|の|から|まで|、|。|,|「|」|・|\s)/;

/** 助詞・区切りより後ろの語を場所名として取り出す。 */
function tailPhrase(before: string): string | undefined {
  const chunk = before
    .split(SEP)
    .map((s) => s.trim())
    .filter(Boolean)
    .pop();
  if (!chunk || chunk.length < 2 || chunk.length > 16) return undefined;
  if (NOT_A_PLACE.includes(chunk)) return undefined;
  if (/^[\d]+$/.test(chunk)) return undefined;
  return chunk;
}

interface CustomPlace {
  phrase: string;
  kind: 'arrival' | 'departure';
  forgot: boolean;
}

/** 組み込みに無い、ユーザー独自の場所の呼び方を拾う。 */
function detectCustomPlace(text: string): CustomPlace | undefined {
  for (const cue of FORGOT_CUES) {
    const i = text.indexOf(cue);
    if (i > 0) {
      const phrase = tailPhrase(text.slice(0, i));
      if (phrase) return { phrase, kind: 'departure', forgot: true };
    }
  }
  for (const cue of DEPART_CUES) {
    const i = text.indexOf(cue);
    if (i > 0) {
      const phrase = tailPhrase(text.slice(0, i));
      if (phrase) return { phrase, kind: 'departure', forgot: false };
    }
  }
  for (const cue of ARRIVAL_CUES) {
    const i = text.indexOf(cue);
    if (i > 0) {
      const phrase = tailPhrase(text.slice(0, i));
      if (phrase) return { phrase, kind: 'arrival', forgot: false };
    }
  }
  return undefined;
}

function detectPlace(text: string):
  | { label: string; kind: 'named_place' | 'work' }
  | undefined {
  if (has(text, '大学', '学校', 'キャンパス', 'ゼミ', '研究室')) {
    return { label: '大学', kind: 'named_place' };
  }
  if (has(text, '会社', '職場', 'オフィス', '仕事場', '出社')) {
    return { label: '職場', kind: 'work' };
  }
  return undefined;
}

function detectStore(text: string): PoiCategory | undefined {
  if (has(text, '薬局', 'ドラッグストア', 'ドラッグ', '処方', '薬を')) return 'pharmacy';
  if (has(text, 'コンビニ', 'セブン', 'ローソン', 'ファミマ')) return 'convenience';
  if (has(text, 'スーパー', '食料品', 'マーケット')) return 'grocery';
  return undefined;
}

function detectTime(text: string): TimeBucket | undefined {
  if (has(text, '明日の朝', '明日朝', '朝イチ', '起きたら', '明朝')) return 'tomorrow_morning';
  if (has(text, '明日')) return 'tomorrow_morning';
  if (has(text, '今夜', '夜に', '今晩', '夕方', '今日中', '今日のうち', '帰ってから夜'))
    return 'this_evening';
  return undefined;
}

const STORE_LABEL: Record<PoiCategory, string> = {
  grocery: 'スーパー',
  convenience: 'コンビニ',
  pharmacy: '薬局',
};

function labelFor(d: Draft): string {
  switch (d.kind) {
    case 'place_arrival': {
      const name = d.poiCategory ? STORE_LABEL[d.poiCategory] : d.placeLabel ?? 'その場所';
      return `次に${name}に着いたとき`;
    }
    case 'place_departure':
      return `次に${d.placeLabel ?? 'その場所'}を出るとき`;
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

function detectCategory(text: string): string | undefined {
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
  const namedPlace = detectPlace(text);
  const customPlace = !store && !namedPlace ? detectCustomPlace(text) : undefined;
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

  // 0. Personal Place Dictionary — 独自の呼び方
  if (customPlace) {
    const learned = lookupPlace(dict, customPlace.phrase);
    const kind = customPlace.kind === 'departure' ? 'place_departure' : 'place_arrival';
    drafts.push({
      kind,
      placeLabel: customPlace.phrase,
      placeKind: 'named_place',
      direction: customPlace.kind,
      placePhrase: customPlace.phrase,
      learnedPlaceId: learned,
      needsPlaceLearning: learned == null,
      confidence: learned != null ? 0.92 : 0.72,
    });
    if (customPlace.forgot) {
      drafts.push({
        kind: 'place_arrival',
        placeLabel: customPlace.phrase,
        placeKind: 'named_place',
        direction: 'arrival',
        placePhrase: customPlace.phrase,
        learnedPlaceId: learned,
        needsPlaceLearning: learned == null,
        confidence: 0.34,
      });
    }
  }

  // 1. 置き忘れ・忘れ物 → その場所を出るとき（組み込みの場所）
  if (isForgot && namedPlace) {
    const conf = namedPlace.kind === 'work' ? 0.74 : 0.77;
    drafts.push({
      kind: 'place_departure',
      placeLabel: namedPlace.label,
      placeKind: namedPlace.kind === 'work' ? 'work' : 'named_place',
      direction: 'departure',
      confidence: conf,
    });
    drafts.push({
      kind: 'place_arrival',
      placeLabel: namedPlace.label,
      placeKind: namedPlace.kind === 'work' ? 'work' : 'named_place',
      direction: 'arrival',
      confidence: 0.36,
    });
  }

  // 2. 買い物・在庫切れ・店名 → 次にお店に着いたとき
  if (isShopping && !isForgot && !customPlace) {
    const cat: PoiCategory = store ?? 'grocery';
    drafts.push({
      kind: 'place_arrival',
      poiCategory: cat,
      placeKind: 'poi_category',
      direction: 'arrival',
      recurringHint: buyIntent,
      confidence: buyIntent ? (store ? 0.86 : 0.82) : store ? 0.7 : 0.6,
    });
  }

  // 3. 出社したら
  if (toWork && !isForgot && !customPlace) {
    drafts.push({ kind: 'work_arrival', placeKind: 'work', direction: 'arrival', confidence: 0.8 });
  }

  // 4. 帰宅したら
  if (backToHome && !isShopping) {
    drafts.push({ kind: 'home_arrival', placeKind: 'home', direction: 'arrival', confidence: 0.79 });
  }

  // 5. 出かけたら
  if (goingOut && !customPlace) {
    drafts.push({ kind: 'leave_home', placeKind: 'home', direction: 'departure', confidence: 0.73 });
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
      poiCategory: 'grocery',
      placeKind: 'poi_category',
      direction: 'arrival',
      recurringHint: true,
      confidence: 0.24,
    });
  }

  drafts.sort((a, b) => b.confidence - a.confidence);
  if (drafts[0].confidence < 0.55) needsUserConfirmation = true;

  const category = detectCategory(text);

  const moments: MomentCandidate[] = drafts.map((d) => ({
    kind: d.kind,
    placeLabel: d.placeLabel,
    placeKind: d.placeKind,
    poiCategory: d.poiCategory,
    direction: d.direction,
    timeBucket: d.timeBucket,
    hasDeadline: d.kind === 'time' ? false : hasDeadline,
    recurringHint: d.recurringHint ?? false,
    confidence: Math.round(d.confidence * 100) / 100,
    humanLabel: labelFor(d),
    placePhrase: d.placePhrase,
    learnedPlaceId: d.learnedPlaceId,
    needsPlaceLearning: d.needsPlaceLearning,
  }));

  return { originalText: text, category, moments, needsUserConfirmation, ambiguityNote };
}
