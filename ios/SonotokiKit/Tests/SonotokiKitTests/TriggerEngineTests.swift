import XCTest
@testable import SonotokiKit

final class TriggerEngineTests: XCTestCase {
    let t0 = Date(timeIntervalSince1970: 0)
    let interp = RuleBasedInterpreter()

    /// スーパー(2店舗) と ジム(1店舗) を覚えた辞書。
    private func dict() -> PlaceDictionary {
        var d = PlaceDictionary()
        d.learn(phrase: "スーパー", ref: .at(35.00, 139.00, id: "s1"), now: t0)
        d.addRef(labelKey: "スーパー", ref: .at(35.10, 139.10, id: "s2"))
        d.learn(phrase: "ジム", ref: .at(35.20, 139.20, id: "g1"), now: t0)
        return d
    }

    private func arm(_ text: String, id: String, _ d: PlaceDictionary) -> Moment {
        let r = interp.interpret(text, dictionary: d)
        return TriggerEngine.armMoment(interpretation: r, candidate: r.moments[0],
                                       dictionary: d, id: id, now: t0)!
    }

    // MARK: fire → done / next

    func test_arrivingAtAnyStoreOfLabel_fires() {
        let d = dict()
        let m = arm("牛乳なくなりそう", id: "milk", d)
        XCTAssertEqual(m.trigger, .placeEnter(.label("スーパー")))

        // s2 に着いても発火する（1ラベル → 複数店舗）
        let r = TriggerEngine.applySituation(moments: [m], world: WorldSnapshot(),
                                             event: .enter(token: "label:スーパー:s2"), now: t0)
        XCTAssertEqual(r.firedIDs, ["milk"])
        XCTAssertEqual(r.moments[0].state, .fired)
    }

    func test_unrelatedRegion_doesNotFire() {
        let d = dict()
        let m = arm("牛乳なくなりそう", id: "milk", d)
        let r = TriggerEngine.applySituation(moments: [m], world: WorldSnapshot(),
                                             event: .enter(token: "label:ジム:g1"), now: t0)
        XCTAssertEqual(r.firedIDs, [])
        XCTAssertEqual(r.moments[0].state, .armed)
    }

    func test_done_neverFiresAgain() {
        let d = dict()
        var r = TriggerEngine.applySituation(
            moments: [arm("牛乳なくなりそう", id: "milk", d)],
            world: WorldSnapshot(), event: .enter(token: "label:スーパー:s1"), now: t0)
        r = TriggerEngine.ApplyResult(moments: TriggerEngine.markDone(r.moments, id: "milk"),
                                      world: r.world, firedIDs: [])
        r = TriggerEngine.applySituation(moments: r.moments, world: r.world,
                                         event: .exit(token: "label:スーパー:s1"), now: t0)
        r = TriggerEngine.applySituation(moments: r.moments, world: r.world,
                                         event: .enter(token: "label:スーパー:s1"), now: t0)
        XCTAssertEqual(r.firedIDs, [])
        XCTAssertEqual(r.moments[0].state, .done)
    }

    func test_next_isNotTimeSnooze_reArmsAfterLeavingContext() {
        let d = dict()
        var moments = [arm("牛乳なくなりそう", id: "milk", d)]
        var world = WorldSnapshot()

        // 1回目
        var r = TriggerEngine.applySituation(moments: moments, world: world,
                                             event: .enter(token: "label:スーパー:s1"), now: t0)
        XCTAssertEqual(r.firedIDs, ["milk"])
        moments = r.moments; world = r.world

        // 店内で [次のそのとき] → まだ状況の中 → awaitingNext
        moments = TriggerEngine.markNext(moments, world: world, id: "milk")
        XCTAssertEqual(moments[0].state, .awaitingNext)

        // 店内での再入店イベントでは鳴らない
        r = TriggerEngine.applySituation(moments: moments, world: world,
                                         event: .enter(token: "label:スーパー:s1"), now: t0)
        moments = r.moments; world = r.world
        XCTAssertEqual(r.firedIDs, [])

        // 店を出る → 再武装
        r = TriggerEngine.applySituation(moments: moments, world: world,
                                         event: .exit(token: "label:スーパー:s1"), now: t0)
        moments = r.moments; world = r.world
        XCTAssertEqual(moments[0].state, .armed)

        // 別の店(s2)に着く → 再発火
        r = TriggerEngine.applySituation(moments: moments, world: world,
                                         event: .enter(token: "label:スーパー:s2"), now: t0)
        XCTAssertEqual(r.firedIDs, ["milk"])
        XCTAssertEqual(r.moments[0].firedCount, 2)
    }

    func test_next_whenAlreadyOutsideContext_reArmsImmediately() {
        let d = dict()
        var r = TriggerEngine.applySituation(
            moments: [arm("牛乳なくなりそう", id: "milk", d)],
            world: WorldSnapshot(), event: .enter(token: "label:スーパー:s1"), now: t0)
        r = TriggerEngine.applySituation(moments: r.moments, world: r.world,
                                         event: .exit(token: "label:スーパー:s1"), now: t0)
        let moments = TriggerEngine.markNext(r.moments, world: r.world, id: "milk")
        XCTAssertEqual(moments[0].state, .armed)
    }

    // MARK: departure

    func test_departureTrigger_firesOnExit_notArrival() {
        let d = dict()
        let m = arm("傘、ジムに置いてきた", id: "umb", d)
        XCTAssertEqual(m.trigger, .placeExit(.label("ジム")))

        var r = TriggerEngine.applySituation(moments: [m], world: WorldSnapshot(),
                                             event: .enter(token: "label:ジム:g1"), now: t0)
        XCTAssertEqual(r.firedIDs, []) // 着いただけでは鳴らない
        r = TriggerEngine.applySituation(moments: r.moments, world: r.world,
                                         event: .exit(token: "label:ジム:g1"), now: t0)
        XCTAssertEqual(r.firedIDs, ["umb"])
    }

    func test_sameEventReArmDoesNotFireInPlace() {
        // awaitingNext の退出トリガーが、退出イベント1発で再武装＋発火してしまわない
        let d = dict()
        var m = arm("傘、ジムに置いてきた", id: "umb", d)
        m.state = .awaitingNext
        var r = TriggerEngine.applySituation(moments: [m],
                                             world: WorldSnapshot(insideTokens: ["label:ジム:g1"]),
                                             event: .exit(token: "label:ジム:g1"), now: t0)
        XCTAssertEqual(r.moments[0].state, .armed)
        XCTAssertEqual(r.firedIDs, [])

        r = TriggerEngine.applySituation(moments: r.moments, world: r.world,
                                         event: .enter(token: "label:ジム:g1"), now: t0)
        r = TriggerEngine.applySituation(moments: r.moments, world: r.world,
                                         event: .exit(token: "label:ジム:g1"), now: t0)
        XCTAssertEqual(r.firedIDs, ["umb"])
    }

    // MARK: multiple & time

    func test_multipleMoments_fireOnSameEvent() {
        let d = dict()
        let ms = [arm("牛乳なくなりそう", id: "milk", d), arm("卵も買う", id: "egg", d)]
        let r = TriggerEngine.applySituation(moments: ms, world: WorldSnapshot(),
                                             event: .enter(token: "label:スーパー:s1"), now: t0)
        XCTAssertEqual(Set(r.firedIDs), ["milk", "egg"])
    }

    func test_timeTrigger_firesAndReArms() {
        let d = dict()
        let r0 = interp.interpret("今日中に郵便出す", dictionary: d)
        let m = TriggerEngine.armMoment(interpretation: r0, candidate: r0.moments[0],
                                        dictionary: d, id: "mail", now: t0)!
        XCTAssertEqual(m.trigger, .time(.thisEvening))

        var r = TriggerEngine.applySituation(moments: [m], world: WorldSnapshot(),
                                             event: .time(.thisEvening), now: t0)
        XCTAssertEqual(r.firedIDs, ["mail"])

        r = TriggerEngine.ApplyResult(
            moments: TriggerEngine.markNext(r.moments, world: r.world, id: "mail"),
            world: r.world, firedIDs: [])
        XCTAssertEqual(r.moments[0].state, .awaitingNext)

        r = TriggerEngine.applySituation(moments: r.moments, world: r.world,
                                         event: .time(.tomorrowMorning), now: t0)
        XCTAssertEqual(r.moments[0].state, .armed)

        r = TriggerEngine.applySituation(moments: r.moments, world: r.world,
                                         event: .time(.thisEvening), now: t0)
        XCTAssertEqual(r.firedIDs, ["mail"])
    }

    // MARK: teach flow

    func test_needsPlace_then_teach_arms_and_fires() {
        var d = PlaceDictionary() // 空
        let r0 = interp.interpret("ジムに着いたらプロテイン", dictionary: d)
        XCTAssertTrue(r0.moments[0].needsPlaceLearning)

        var m = TriggerEngine.buildLearningMoment(interpretation: r0, candidate: r0.moments[0],
                                                  id: "p", now: t0)
        XCTAssertEqual(m.state, .needsPlace)

        // 状況を動かしても発火しない
        let idle = TriggerEngine.applySituation(moments: [m], world: WorldSnapshot(),
                                                event: .enter(token: "label:ジム:x"), now: t0)
        XCTAssertEqual(idle.firedIDs, [])

        // 「ジム」= ジムラベル(新規refを登録) と教える
        let ref = PlaceRef.at(35.2, 139.2, id: "g1")
        d.learn(phrase: "ジム", ref: ref, now: t0)
        m = TriggerEngine.resolveLearnedMoment(m, target: .label("ジム"))
        XCTAssertEqual(m.state, .armed)
        XCTAssertEqual(m.trigger, .placeEnter(.label("ジム")))
        XCTAssertTrue(m.learnedPlace)

        let r = TriggerEngine.applySituation(moments: [m], world: WorldSnapshot(),
                                             event: .enter(token: "label:ジム:g1"), now: t0)
        XCTAssertEqual(r.firedIDs, ["p"])
    }

    // MARK: anchors

    func test_homeArrival_firesOnAnchorEnter() {
        let d = dict()
        let m = arm("帰ったら電気代払う", id: "bill", d)
        XCTAssertEqual(m.trigger, .placeEnter(.anchor(.home)))
        let r = TriggerEngine.applySituation(moments: [m], world: WorldSnapshot(),
                                             event: .enter(token: "anchor:home"), now: t0)
        XCTAssertEqual(r.firedIDs, ["bill"])
    }
}
