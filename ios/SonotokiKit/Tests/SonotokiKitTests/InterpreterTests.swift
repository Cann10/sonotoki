import XCTest
@testable import SonotokiKit

final class InterpreterTests: XCTestCase {
    let sut = RuleBasedInterpreter()
    let t0 = Date(timeIntervalSince1970: 0)

    private func first(_ text: String, _ dict: PlaceDictionary = PlaceDictionary()) -> MomentCandidate {
        sut.interpret(text, dictionary: dict).moments[0]
    }

    // MARK: canonical examples（Web版と同じ意図）

    func test_milk_lowStock_becomesSupermarketArrival_recurring() {
        let c = first("牛乳なくなりそう")
        XCTAssertEqual(c.kind, .placeArrival)
        XCTAssertEqual(c.placePhrase, "スーパー")
        XCTAssertEqual(c.poiCategoryHint, "grocery")
        XCTAssertTrue(c.recurringHint)
        XCTAssertEqual(c.humanLabel, "次にスーパーに着いたとき")
        XCTAssertGreaterThanOrEqual(c.confidence, 0.75)
        // 辞書にスーパーが無ければ、まず「どこ?」と聞く
        XCTAssertTrue(c.needsPlaceLearning)
    }

    func test_milk_whenSupermarketAlreadyLearned_noPrompt() {
        var d = PlaceDictionary()
        d.learn(phrase: "スーパー", ref: .at(35, 139, id: "s1"), now: t0)
        let c = first("牛乳なくなりそう", d)
        XCTAssertEqual(c.learnedTarget, .label("スーパー"))
        XCTAssertFalse(c.needsPlaceLearning)
    }

    func test_umbrella_atUniversity_becomesDeparture() {
        let r = sut.interpret("傘、大学に置いてきた", dictionary: PlaceDictionary())
        XCTAssertEqual(r.moments[0].kind, .placeDeparture)
        XCTAssertEqual(r.moments[0].placePhrase, "大学")
        XCTAssertEqual(r.moments[0].humanLabel, "次に大学を出るとき")
        XCTAssertEqual(r.category, "belongings")
        XCTAssertTrue(r.moments.contains { $0.kind == .placeArrival }) // 登校時に気づく手も
    }

    func test_message_atWork_becomesWorkArrival_anchor() {
        let c = first("会社で日報の件を伝える")
        XCTAssertEqual(c.kind, .workArrival)
        XCTAssertEqual(c.anchorHint, .work)
        XCTAssertEqual(c.humanLabel, "次に出社したとき")
    }

    func test_goingOut_becomesLeaveHome() {
        let c = first("週末出かけたら折り畳み傘を入れる")
        XCTAssertEqual(c.kind, .leaveHome)
        XCTAssertEqual(c.anchorHint, .home)
    }

    func test_returningHome() {
        let c = first("帰ったら電気代払う")
        XCTAssertEqual(c.kind, .homeArrival)
        XCTAssertEqual(c.anchorHint, .home)
    }

    func test_pureTime_becomesTimeMoment() {
        let c = first("今日中に郵便出す")
        XCTAssertEqual(c.kind, .time)
        XCTAssertEqual(c.timeBucket, .thisEvening)
    }

    func test_noSignal_asksAndReturnsMultipleCandidates() {
        let r = sut.interpret("あれ、やらないと", dictionary: PlaceDictionary())
        XCTAssertTrue(r.needsUserConfirmation)
        XCTAssertNotNil(r.ambiguityNote)
        XCTAssertGreaterThanOrEqual(r.moments.count, 2)
    }

    func test_candidatesAreOrderedByConfidenceDescending() {
        let r = sut.interpret("傘、大学に置いてきた", dictionary: PlaceDictionary())
        for i in 1..<r.moments.count {
            XCTAssertGreaterThanOrEqual(r.moments[i - 1].confidence, r.moments[i].confidence)
        }
    }

    func test_trimsWhitespace_keepsOriginal() {
        let r = sut.interpret("  牛乳なくなりそう  ", dictionary: PlaceDictionary())
        XCTAssertEqual(r.originalText, "牛乳なくなりそう")
    }

    // MARK: Personal Place Dictionary — custom phrasing

    func test_unknownPhrase_arrival_needsLearning() {
        let c = first("ジムに着いたらプロテイン飲む")
        XCTAssertEqual(c.kind, .placeArrival)
        XCTAssertEqual(c.placePhrase, "ジム")
        XCTAssertTrue(c.needsPlaceLearning)
        XCTAssertNil(c.learnedTarget)
    }

    func test_unknownPhrase_departure_needsLearning() {
        let c = first("ジム出たらストレッチ")
        XCTAssertEqual(c.kind, .placeDeparture)
        XCTAssertEqual(c.placePhrase, "ジム")
        XCTAssertTrue(c.needsPlaceLearning)
    }

    func test_knownPhrase_resolvesSilently() {
        var d = PlaceDictionary()
        d.learn(phrase: "ジム", ref: .at(35, 139, id: "g1"), now: t0)
        let c = first("ジム出たらストレッチ", d)
        XCTAssertEqual(c.kind, .placeDeparture)
        XCTAssertEqual(c.learnedTarget, .label("ジム"))
        XCTAssertFalse(c.needsPlaceLearning)
        XCTAssertGreaterThanOrEqual(c.confidence, 0.85)
    }

    func test_forgotAtCustomPlace_isDeparture_belongings() {
        let r = sut.interpret("財布、実家に忘れた", dictionary: PlaceDictionary())
        XCTAssertEqual(r.moments[0].kind, .placeDeparture)
        XCTAssertEqual(r.moments[0].placePhrase, "実家")
        XCTAssertEqual(r.category, "belongings")
    }

    func test_stripsModifiers_fromCustomPhrase() {
        let c = first("駅前のカフェに寄ったら新刊チェック")
        XCTAssertEqual(c.placePhrase, "カフェ")
        XCTAssertEqual(c.kind, .placeArrival)
    }

    func test_nonPlaceWords_areNotTreatedAsPlaces() {
        for t in ["ゴミを出す", "手紙を出す", "うまく行ったら連絡", "順調に行ったら報告", "早く帰ったら休む", "友達に返事する"] {
            let r = sut.interpret(t, dictionary: PlaceDictionary())
            XCTAssertFalse(r.moments.first?.needsPlaceLearning ?? false, "\"\(t)\" を誤検出")
        }
    }

    func test_coreInput_unaffectedByDictionaryMechanism() {
        let c = first("牛乳なくなりそう")
        XCTAssertEqual(c.kind, .placeArrival)
        XCTAssertEqual(c.poiCategoryHint, "grocery")
    }
}
