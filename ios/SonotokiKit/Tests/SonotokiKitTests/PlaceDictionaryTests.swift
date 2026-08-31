import XCTest
@testable import SonotokiKit

final class PlaceDictionaryTests: XCTestCase {
    let t0 = Date(timeIntervalSince1970: 0)

    // MARK: placeKey

    func test_placeKey_stripsTrailingParticlesAndWhitespace() {
        XCTAssertEqual(placeKey("  ジムに  "), "ジム")
        XCTAssertEqual(placeKey("実家の"), "実家")
        XCTAssertEqual(placeKey("駅から"), "駅")
    }

    func test_placeKey_stripsLeadingRentaishi() {
        XCTAssertEqual(placeKey("いつものカフェ"), "カフェ")
        XCTAssertEqual(placeKey("例の店"), "店")
    }

    func test_placeKey_foldsFullwidthAndLowercasesLatin() {
        XCTAssertEqual(placeKey("ＧＹＭ"), "gym")
    }

    // MARK: learn / lookup / forget — single

    func test_learn_thenLookup_withNormalizationVariants() {
        var d = PlaceDictionary()
        d.learn(phrase: "ジム", ref: .at(35, 139, id: "r1"), now: t0)
        XCTAssertEqual(d.lookup("ジム"), "ジム")
        XCTAssertEqual(d.lookup("ジムに"), "ジム")
        XCTAssertEqual(d.lookup("いつものジム"), "ジム")
    }

    func test_lookup_unknownPhraseIsNil() {
        XCTAssertNil(PlaceDictionary().lookup("図書館"))
    }

    func test_forget_removesLabel() {
        var d = PlaceDictionary()
        d.learn(phrase: "ジム", ref: .at(35, 139, id: "r1"), now: t0)
        d.forget(phrase: "ジム")
        XCTAssertNil(d.lookup("ジム"))
    }

    // MARK: 1 label → N places

    func test_oneLabel_holdsMultiplePlaces() {
        var d = PlaceDictionary()
        d.learn(phrase: "スーパー", ref: .at(35.0, 139.0, id: "a"), now: t0)
        d.learn(phrase: "スーパー", ref: .at(35.1, 139.1, id: "b"), now: t0) // 同じラベルに追記
        let label = d.label(forKey: "スーパー")
        XCTAssertEqual(label?.refs.count, 2)
        XCTAssertEqual(label?.regionTokens.sorted(), ["label:スーパー:a", "label:スーパー:b"])
    }

    func test_addRef_and_removeRef() {
        var d = PlaceDictionary()
        d.learn(phrase: "スーパー", ref: .at(35, 139, id: "a"), now: t0)
        d.addRef(labelKey: "スーパー", ref: .at(35.2, 139.2, id: "c"))
        XCTAssertEqual(d.label(forKey: "スーパー")?.refs.count, 2)

        d.removeRef(labelKey: "スーパー", refID: "a")
        XCTAssertEqual(d.label(forKey: "スーパー")?.refs.map(\.id), ["c"])

        d.removeRef(labelKey: "スーパー", refID: "c") // 最後の1つを消すとラベルごと消える
        XCTAssertNil(d.lookup("スーパー"))
    }

    func test_labelWithNoRefs_isNotLookedUp() {
        let d = PlaceDictionary(labels: [
            "空": LearnedLabel(key: "空", displayName: "空", refs: [], createdAt: Date(timeIntervalSince1970: 0))
        ])
        XCTAssertNil(d.lookup("空"))
    }
}
