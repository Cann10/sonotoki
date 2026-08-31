import XCTest
@testable import SonotokiKitTests

fileprivate extension InterpreterTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__InterpreterTests = [
        ("test_candidatesAreOrderedByConfidenceDescending", test_candidatesAreOrderedByConfidenceDescending),
        ("test_coreInput_unaffectedByDictionaryMechanism", test_coreInput_unaffectedByDictionaryMechanism),
        ("test_forgotAtCustomPlace_isDeparture_belongings", test_forgotAtCustomPlace_isDeparture_belongings),
        ("test_goingOut_becomesLeaveHome", test_goingOut_becomesLeaveHome),
        ("test_knownPhrase_resolvesSilently", test_knownPhrase_resolvesSilently),
        ("test_message_atWork_becomesWorkArrival_anchor", test_message_atWork_becomesWorkArrival_anchor),
        ("test_milk_lowStock_becomesSupermarketArrival_recurring", test_milk_lowStock_becomesSupermarketArrival_recurring),
        ("test_milk_whenSupermarketAlreadyLearned_noPrompt", test_milk_whenSupermarketAlreadyLearned_noPrompt),
        ("test_noSignal_asksAndReturnsMultipleCandidates", test_noSignal_asksAndReturnsMultipleCandidates),
        ("test_nonPlaceWords_areNotTreatedAsPlaces", test_nonPlaceWords_areNotTreatedAsPlaces),
        ("test_pureTime_becomesTimeMoment", test_pureTime_becomesTimeMoment),
        ("test_returningHome", test_returningHome),
        ("test_stripsModifiers_fromCustomPhrase", test_stripsModifiers_fromCustomPhrase),
        ("test_trimsWhitespace_keepsOriginal", test_trimsWhitespace_keepsOriginal),
        ("test_umbrella_atUniversity_becomesDeparture", test_umbrella_atUniversity_becomesDeparture),
        ("test_unknownPhrase_arrival_needsLearning", test_unknownPhrase_arrival_needsLearning),
        ("test_unknownPhrase_departure_needsLearning", test_unknownPhrase_departure_needsLearning)
    ]
}

fileprivate extension PlaceDictionaryTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__PlaceDictionaryTests = [
        ("test_addRef_and_removeRef", test_addRef_and_removeRef),
        ("test_forget_removesLabel", test_forget_removesLabel),
        ("test_labelWithNoRefs_isNotLookedUp", test_labelWithNoRefs_isNotLookedUp),
        ("test_learn_thenLookup_withNormalizationVariants", test_learn_thenLookup_withNormalizationVariants),
        ("test_lookup_unknownPhraseIsNil", test_lookup_unknownPhraseIsNil),
        ("test_oneLabel_holdsMultiplePlaces", test_oneLabel_holdsMultiplePlaces),
        ("test_placeKey_foldsFullwidthAndLowercasesLatin", test_placeKey_foldsFullwidthAndLowercasesLatin),
        ("test_placeKey_stripsLeadingRentaishi", test_placeKey_stripsLeadingRentaishi),
        ("test_placeKey_stripsTrailingParticlesAndWhitespace", test_placeKey_stripsTrailingParticlesAndWhitespace)
    ]
}

fileprivate extension ResolverTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__ResolverTests = [
        ("test_anchorHint_takesPrecedence", test_anchorHint_takesPrecedence),
        ("test_expandRegionTokens_labelToAllRegisteredStores", test_expandRegionTokens_labelToAllRegisteredStores),
        ("test_expandTriggers_oneSemanticTriggerToPerPlaceTriggers", test_expandTriggers_oneSemanticTriggerToPerPlaceTriggers),
        ("test_expandTriggers_timePassesThrough", test_expandTriggers_timePassesThrough),
        ("test_homeAndWork_resolveToAnchors", test_homeAndWork_resolveToAnchors),
        ("test_knownPhrase_resolvesViaDictionary", test_knownPhrase_resolvesViaDictionary),
        ("test_learnedTarget_resolvesDirectly", test_learnedTarget_resolvesDirectly),
        ("test_time_resolvesToTimeTrigger", test_time_resolvesToTimeTrigger),
        ("test_unknownPhrase_needsLearning", test_unknownPhrase_needsLearning)
    ]
}

fileprivate extension TriggerEngineTests {
    @available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
    static nonisolated(unsafe) let __allTests__TriggerEngineTests = [
        ("test_armMoment_anchorResolved_notLearnedPlace", test_armMoment_anchorResolved_notLearnedPlace),
        ("test_armMoment_forceTimeBackstop", test_armMoment_forceTimeBackstop),
        ("test_armMoment_holdsSemanticLabel_notConcretePlace", test_armMoment_holdsSemanticLabel_notConcretePlace),
        ("test_armMoment_noDeadline_noBackstop", test_armMoment_noDeadline_noBackstop),
        ("test_armMoment_readDeadline_addsTimeBackstop", test_armMoment_readDeadline_addsTimeBackstop),
        ("test_arrivingAtAnyStoreOfLabel_fires", test_arrivingAtAnyStoreOfLabel_fires),
        ("test_departureTrigger_firesOnExit_notArrival", test_departureTrigger_firesOnExit_notArrival),
        ("test_done_neverFiresAgain", test_done_neverFiresAgain),
        ("test_homeArrival_firesOnAnchorEnter", test_homeArrival_firesOnAnchorEnter),
        ("test_multipleMoments_fireOnSameEvent", test_multipleMoments_fireOnSameEvent),
        ("test_needsPlace_then_teach_arms_and_fires", test_needsPlace_then_teach_arms_and_fires),
        ("test_next_isNotTimeSnooze_reArmsAfterLeavingContext", test_next_isNotTimeSnooze_reArmsAfterLeavingContext),
        ("test_next_whenAlreadyOutsideContext_reArmsImmediately", test_next_whenAlreadyOutsideContext_reArmsImmediately),
        ("test_sameEventReArmDoesNotFireInPlace", test_sameEventReArmDoesNotFireInPlace),
        ("test_timeTrigger_firesAndReArms", test_timeTrigger_firesAndReArms),
        ("test_unrelatedRegion_doesNotFire", test_unrelatedRegion_doesNotFire)
    ]
}
@available(*, deprecated, message: "Not actually deprecated. Marked as deprecated to allow inclusion of deprecated tests (which test deprecated functionality) without warnings")
func __SonotokiKitTests__allTests() -> [XCTestCaseEntry] {
    return [
        testCase(InterpreterTests.__allTests__InterpreterTests),
        testCase(PlaceDictionaryTests.__allTests__PlaceDictionaryTests),
        testCase(ResolverTests.__allTests__ResolverTests),
        testCase(TriggerEngineTests.__allTests__TriggerEngineTests)
    ]
}