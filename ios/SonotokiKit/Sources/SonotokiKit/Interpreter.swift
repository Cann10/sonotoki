import Foundation

/// 自然文 → `MomentInterpretation`（意味理解）のアダプタ。
///
/// v1 は端末内 `RuleBasedInterpreter`（クラウド送信なし）。
/// 将来 `FoundationModelsInterpreter`（iOS 26+ / Apple Intelligence）を
/// 同じ protocol の別実装として差し替え可能にする（承認済みPlan §改訂3）。
public protocol Interpreter: Sendable {
    func interpret(_ rawText: String, dictionary: PlaceDictionary) -> MomentInterpretation
}
