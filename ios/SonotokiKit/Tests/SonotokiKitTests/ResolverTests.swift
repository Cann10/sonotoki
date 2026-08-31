import XCTest
@testable import SonotokiKit

final class ResolverTests: XCTestCase {
    let t0 = Date(timeIntervalSince1970: 0)

    private func candidate(_ kind: SemanticKind, phrase: String? = nil, target: PlaceTarget? = nil,
                           anchor: Anchor? = nil, time: TimeBucket? = nil) -> MomentCandidate {
        MomentCandidate(kind: kind, timeBucket: time, confidence: 0.8, humanLabel: "",
                        placePhrase: phrase, learnedTarget: target, anchorHint: anchor)
    }

    func test_time_resolvesToTimeTrigger() {
        XCTAssertEqual(resolve(candidate(.time, time: .tomorrowMorning), dictionary: PlaceDictionary()),
                       .ok(.time(.tomorrowMorning)))
    }

    func test_homeAndWork_resolveToAnchors() {
        XCTAssertEqual(resolve(candidate(.homeArrival), dictionary: PlaceDictionary()),
                       .ok(.placeEnter(.anchor(.home))))
        XCTAssertEqual(resolve(candidate(.leaveHome), dictionary: PlaceDictionary()),
                       .ok(.placeExit(.anchor(.home))))
        XCTAssertEqual(resolve(candidate(.workArrival), dictionary: PlaceDictionary()),
                       .ok(.placeEnter(.anchor(.work))))
    }

    func test_anchorHint_takesPrecedence() {
        let c = candidate(.placeDeparture, phrase: "職場", anchor: .work)
        XCTAssertEqual(resolve(c, dictionary: PlaceDictionary()), .ok(.placeExit(.anchor(.work))))
    }

    func test_learnedTarget_resolvesDirectly() {
        let c = candidate(.placeArrival, phrase: "ジム", target: .label("ジム"))
        XCTAssertEqual(resolve(c, dictionary: PlaceDictionary()), .ok(.placeEnter(.label("ジム"))))
    }

    func test_knownPhrase_resolvesViaDictionary() {
        var d = PlaceDictionary()
        d.learn(phrase: "スーパー", ref: .at(35, 139, id: "s1"), now: t0)
        let c = candidate(.placeArrival, phrase: "スーパー")
        XCTAssertEqual(resolve(c, dictionary: d), .ok(.placeEnter(.label("スーパー"))))
    }

    func test_unknownPhrase_needsLearning() {
        let c = candidate(.placeArrival, phrase: "実家")
        XCTAssertEqual(resolve(c, dictionary: PlaceDictionary()), .needsLearning(phrase: "実家"))
    }

    // MARK: expansion — 1 semantic ターゲット → 複数の実場所 / 複数 Trigger

    private func superLabelDict() -> PlaceDictionary {
        var d = PlaceDictionary()
        d.learn(phrase: "スーパー", ref: .at(35, 139, id: "s1"), now: t0)
        d.addRef(labelKey: "スーパー", ref: .at(35.1, 139.1, id: "s2"))
        return d
    }

    func test_expandRegionTokens_labelToAllRegisteredStores() {
        let d = superLabelDict()
        XCTAssertEqual(
            expandRegionTokens(.label("スーパー"), dictionary: d),
            ["label:スーパー:s1", "label:スーパー:s2"]
        )
        XCTAssertEqual(expandRegionTokens(.anchor(.home), dictionary: d), ["anchor:home"])
        XCTAssertEqual(expandRegionTokens(.label("未登録"), dictionary: d), [])
    }

    func test_expandTriggers_oneSemanticTriggerToPerPlaceTriggers() {
        let d = superLabelDict()
        let expanded = expandTriggers(.placeEnter(.label("スーパー")), dictionary: d)
        XCTAssertEqual(expanded, [
            .placeEnter(.region(token: "label:スーパー:s1")),
            .placeEnter(.region(token: "label:スーパー:s2")),
        ])
        // 展開後の region Trigger は該当 token にだけ一致する
        XCTAssertTrue(TriggerEngine.triggerMatches(expanded[1], event: .enter(token: "label:スーパー:s2")))
        XCTAssertFalse(TriggerEngine.triggerMatches(expanded[0], event: .enter(token: "label:スーパー:s2")))
    }

    func test_expandTriggers_timePassesThrough() {
        XCTAssertEqual(expandTriggers(.time(.thisEvening), dictionary: PlaceDictionary()), [.time(.thisEvening)])
    }
}
