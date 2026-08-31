import Foundation

// Rule-based interpreter — the "AI" (meaning layer). Ported from
// web/src/domain/interpreter.ts. Runs on-device, instantly, with no network.
//
// 「何を」だけ書けば、「いつ・どこで」＝意味ラベルを推論する。
// 場所は決定論の Resolver / Personal Place Dictionary が解決する。

public struct RuleBasedInterpreter: Interpreter {
    public init() {}

    public func interpret(_ rawText: String, dictionary: PlaceDictionary = PlaceDictionary()) -> MomentInterpretation {
        RuleBasedInterpreter.run(rawText, dictionary: dictionary)
    }

    // MARK: - Keyword sets (web版と同一)

    static let BUY_VERBS = ["買わなきゃ", "買わないと", "買わねば", "買う", "買っ", "買お", "購入", "補充", "仕入れ"]
    static let LOW_STOCK = [
        "なくなりそう", "なくなった", "切れそう", "切れた", "切らし", "残りわずか", "底をつき",
        "在庫", "足りない", "足りなく", "ストックが",
    ]
    static let FORGOT = ["置いてきた", "置いて来た", "置き忘れ", "忘れてきた", "忘れ物", "に忘れた", "で忘れた"]
    static let MESSAGE = ["伝える", "伝えて", "言う", "報告", "連絡", "相談", "確認する", "聞く"]
    static let DEADLINE = ["までに", "今日中", "今日のうち", "期限", "〆", "締め切り", "締切", "マスト", "絶対今日"]

    static let NOT_A_PLACE: Set<String> = [
        "ネット", "ねっと", "通販", "アプリ", "電話", "メール", "現金", "カード", "スマホ", "ここ",
        "そこ", "あそこ", "自分", "手元", "家", "うち", "自宅", "あと", "後", "ついで", "近く",
        "ゴミ", "ごみ", "手紙", "資料", "書類", "名前", "声", "車", "電車", "バス", "疲れ", "熱",
        "元気", "やる気", "結果", "答え", "返事", "芽", "本気",
        "順調", "スムーズ", "上手", "予定通り", "計画通り", "思い通り", "期待通り", "うまく",
    ]

    static let ARRIVAL_CUES = ["に着い", "についたら", "に到着", "に行っ", "に寄っ", "に立ち寄", "で借り", "で受け取", "に返す", "に返し", "に返却", "に帰っ"]
    static let DEPART_CUES = ["を出る", "を出た", "から出る", "から出た", "から帰", "出たら", "出るとき", "を後に", "から戻"]
    static let FORGOT_CUES = ["に忘れ", "で忘れ", "に置いてき", "で無くし", "でなくし", "で失く"]

    static let TWO_CHAR_SEPS = ["から", "まで"]
    static let ONE_CHAR_SEPS = CharacterSet(charactersIn: "をはがにへでともやの、。,「」・ \t\n\u{1}")

    // MARK: - Helpers

    static func has(_ text: String, _ needles: [String]) -> Bool {
        needles.contains { text.contains($0) }
    }
    static func has(_ text: String, _ needles: String...) -> Bool {
        has(text, needles)
    }

    /// 助詞・区切りより後ろの語を場所名として取り出す。
    static func tailPhrase(_ before: String) -> String? {
        var s = before
        for sep in TWO_CHAR_SEPS { s = s.replacingOccurrences(of: sep, with: "\u{1}") }
        let chunk = s
            .components(separatedBy: ONE_CHAR_SEPS)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .last(where: { !$0.isEmpty })
        guard let chunk, chunk.count >= 2, chunk.count <= 16 else { return nil }
        if NOT_A_PLACE.contains(chunk) { return nil }
        if chunk.allSatisfy(\.isNumber) { return nil }
        return chunk
    }

    struct CustomPlace { var phrase: String; var kind: Direction; var forgot: Bool }

    static func detectCustomPlace(_ text: String) -> CustomPlace? {
        func before(_ cue: String) -> String? {
            guard let r = text.range(of: cue), r.lowerBound > text.startIndex else { return nil }
            return tailPhrase(String(text[text.startIndex..<r.lowerBound]))
        }
        for cue in FORGOT_CUES { if let p = before(cue) { return CustomPlace(phrase: p, kind: .departure, forgot: true) } }
        for cue in DEPART_CUES { if let p = before(cue) { return CustomPlace(phrase: p, kind: .departure, forgot: false) } }
        for cue in ARRIVAL_CUES { if let p = before(cue) { return CustomPlace(phrase: p, kind: .arrival, forgot: false) } }
        return nil
    }

    /// 組み込みの場所（大学 / 会社）。iOS では大学は学習ラベル、会社は work アンカー。
    enum BuiltinPlace { case school; case work }
    static func detectBuiltinPlace(_ text: String) -> BuiltinPlace? {
        if has(text, "大学", "学校", "キャンパス", "ゼミ", "研究室") { return .school }
        if has(text, "会社", "職場", "オフィス", "仕事場", "出社") { return .work }
        return nil
    }

    /// 店の種類 → (呼び方ラベル, カテゴリヒント)
    static func detectStore(_ text: String) -> (label: String, hint: String)? {
        if has(text, "薬局", "ドラッグストア", "ドラッグ", "処方", "薬を") { return ("薬局", "pharmacy") }
        if has(text, "コンビニ", "セブン", "ローソン", "ファミマ") { return ("コンビニ", "convenience") }
        if has(text, "スーパー", "食料品", "マーケット") { return ("スーパー", "grocery") }
        return nil
    }

    static func detectTime(_ text: String) -> TimeBucket? {
        if has(text, "明日の朝", "明日朝", "朝イチ", "起きたら", "明朝") { return .tomorrowMorning }
        if has(text, "明日") { return .tomorrowMorning }
        if has(text, "今夜", "夜に", "今晩", "夕方", "今日中", "今日のうち", "帰ってから夜") { return .thisEvening }
        return nil
    }

    static func detectCategory(_ text: String) -> String {
        if has(text, FORGOT) || has(text, FORGOT_CUES) { return "belongings" }
        if has(text, LOW_STOCK) || has(text, BUY_VERBS) { return "shopping" }
        if has(text, MESSAGE) { return "message" }
        return "errand"
    }

    // MARK: - Draft

    struct Draft {
        var kind: SemanticKind
        var placeLabel: String? = nil
        var poiCategoryHint: String? = nil
        var direction: Direction? = nil
        var timeBucket: TimeBucket? = nil
        var recurringHint: Bool = false
        var confidence: Double
        var placePhrase: String? = nil
        var learnedTarget: PlaceTarget? = nil
        var needsPlaceLearning: Bool = false
        var anchorHint: Anchor? = nil
    }

    static func label(for d: Draft) -> String {
        switch d.kind {
        case .placeArrival:
            let name = d.placeLabel ?? d.placePhrase ?? "その場所"
            return "次に\(name)に着いたとき"
        case .placeDeparture:
            let name = d.placeLabel ?? d.placePhrase ?? "その場所"
            return "次に\(name)を出るとき"
        case .homeArrival: return "次に帰宅したとき"
        case .leaveHome: return "次に出かけるとき"
        case .workArrival: return "次に出社したとき"
        case .time: return d.timeBucket == .tomorrowMorning ? "明日の朝" : "今日の夕方"
        }
    }

    // MARK: - Main

    static func run(_ rawText: String, dictionary dict: PlaceDictionary) -> MomentInterpretation {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        var drafts: [Draft] = []

        let store = detectStore(text)
        let builtin = detectBuiltinPlace(text)
        let customPlace = (store == nil && builtin == nil) ? detectCustomPlace(text) : nil
        let timeBucket = detectTime(text)
        let buyIntent = has(text, LOW_STOCK) || has(text, BUY_VERBS)
        let isShopping = buyIntent || store != nil || has(text, "ついでに", "寄って", "買い物")
        let isForgot = has(text, FORGOT)
        let backToHome = (customPlace == nil) && has(
            text,
            "帰ったら", "帰宅", "家に帰っ", "うちに帰っ", "帰ってから", "家についたら", "家に着いたら", "帰りに", "帰りがけ"
        )
        let goingOut = has(text, "出かけたら", "出かける", "外出", "家を出る", "出発", "お出かけ")
        let toWork = has(text, "出社", "会社に着いたら", "会社で", "職場で", "職場に着", "オフィスで", "仕事場で")

        // Personal Place Dictionary lookup → target
        func target(for phrase: String) -> PlaceTarget? {
            dict.lookup(phrase).map { PlaceTarget.label($0) }
        }

        // 0. 独自の呼び方
        if let cp = customPlace {
            let learned = target(for: cp.phrase)
            drafts.append(Draft(
                kind: cp.kind == .departure ? .placeDeparture : .placeArrival,
                placeLabel: cp.phrase, direction: cp.kind,
                confidence: learned != nil ? 0.92 : 0.72,
                placePhrase: cp.phrase, learnedTarget: learned,
                needsPlaceLearning: learned == nil
            ))
            if cp.forgot {
                drafts.append(Draft(
                    kind: .placeArrival, placeLabel: cp.phrase, direction: .arrival,
                    confidence: 0.34,
                    placePhrase: cp.phrase, learnedTarget: learned,
                    needsPlaceLearning: learned == nil
                ))
            }
        }

        // 1. 置き忘れ・忘れ物 → その場所を出るとき（組み込みの場所）
        if isForgot, let b = builtin {
            switch b {
            case .school:
                let learned = target(for: "大学")
                drafts.append(Draft(kind: .placeDeparture, placeLabel: "大学", direction: .departure,
                                    confidence: 0.77, placePhrase: "大学", learnedTarget: learned,
                                    needsPlaceLearning: learned == nil))
                drafts.append(Draft(kind: .placeArrival, placeLabel: "大学", direction: .arrival,
                                    confidence: 0.36, placePhrase: "大学", learnedTarget: learned,
                                    needsPlaceLearning: learned == nil))
            case .work:
                drafts.append(Draft(kind: .placeDeparture, placeLabel: "職場", direction: .departure,
                                    confidence: 0.74, anchorHint: .work))
                drafts.append(Draft(kind: .placeArrival, placeLabel: "職場", direction: .arrival,
                                    confidence: 0.36, anchorHint: .work))
            }
        }

        // 2. 買い物・在庫切れ・店名 → 次にお店に着いたとき
        if isShopping && !isForgot && customPlace == nil {
            let (label, hint) = store ?? ("スーパー", "grocery")
            let learned = target(for: label)
            let conf: Double = buyIntent ? (store != nil ? 0.86 : 0.82) : (store != nil ? 0.7 : 0.6)
            drafts.append(Draft(
                kind: .placeArrival, placeLabel: label, poiCategoryHint: hint, direction: .arrival,
                recurringHint: buyIntent, confidence: conf,
                placePhrase: label, learnedTarget: learned, needsPlaceLearning: learned == nil
            ))
        }

        // 3. 出社したら
        if toWork && !isForgot && customPlace == nil {
            drafts.append(Draft(kind: .workArrival, direction: .arrival, confidence: 0.8, anchorHint: .work))
        }

        // 4. 帰宅したら
        if backToHome && !isShopping {
            drafts.append(Draft(kind: .homeArrival, direction: .arrival, confidence: 0.79, anchorHint: .home))
        }

        // 5. 出かけたら
        if goingOut && customPlace == nil {
            drafts.append(Draft(kind: .leaveHome, direction: .departure, confidence: 0.73, anchorHint: .home))
        }

        // 6. 純粋な時間指定
        if let tb = timeBucket, drafts.isEmpty {
            drafts.append(Draft(kind: .time, timeBucket: tb, confidence: 0.7))
        }

        let hasDeadline = has(text, DEADLINE) || (timeBucket != nil && drafts.contains { $0.kind != .time })

        var needsUserConfirmation = false
        var ambiguityNote: String?

        // 7. フォールバック
        if drafts.isEmpty {
            needsUserConfirmation = true
            ambiguityNote = isForgot ? "どこに置いてきた? 場所を選んでください" : "いつ思い出したい? どれかを選んでください"
            drafts.append(Draft(kind: .time, timeBucket: timeBucket ?? .thisEvening, confidence: 0.28))
            let learned = target(for: "スーパー")
            drafts.append(Draft(
                kind: .placeArrival, placeLabel: "スーパー", poiCategoryHint: "grocery", direction: .arrival,
                recurringHint: true, confidence: 0.24,
                placePhrase: "スーパー", learnedTarget: learned, needsPlaceLearning: learned == nil
            ))
        }

        // 確信度降順（同値は元の順を保つ安定ソート）
        let ordered = drafts.enumerated().sorted { a, b in
            a.element.confidence != b.element.confidence
                ? a.element.confidence > b.element.confidence
                : a.offset < b.offset
        }.map(\.element)

        if let top = ordered.first, top.confidence < 0.55 { needsUserConfirmation = true }

        let category = detectCategory(text)

        let moments = ordered.map { d -> MomentCandidate in
            MomentCandidate(
                kind: d.kind,
                placeLabel: d.placeLabel,
                poiCategoryHint: d.poiCategoryHint,
                direction: d.direction,
                timeBucket: d.timeBucket,
                hasDeadline: d.kind == .time ? false : hasDeadline,
                recurringHint: d.recurringHint,
                confidence: (d.confidence * 100).rounded() / 100,
                humanLabel: label(for: d),
                placePhrase: d.placePhrase,
                learnedTarget: d.learnedTarget,
                needsPlaceLearning: d.needsPlaceLearning,
                anchorHint: d.anchorHint
            )
        }

        return MomentInterpretation(
            originalText: text,
            category: category,
            moments: moments,
            needsUserConfirmation: needsUserConfirmation,
            ambiguityNote: ambiguityNote
        )
    }
}
