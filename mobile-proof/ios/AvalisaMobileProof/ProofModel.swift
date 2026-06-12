import Foundation

final class ProofModel: ObservableObject {
    enum Command: Equatable {
        case scan
        case setPairScan(enabled: Bool)
        case demoTrade(direction: String)
        case startBot
        case stopBot
    }

    @Published var reloadRequested = false
    @Published var command: Command?

    @Published var pageState = "loading"
    @Published var demoMode = "unknown"
    @Published var activePair = "-"
    @Published var duration = "-"
    @Published var balance = "-"
    @Published var payout = "-"
    @Published var candleCount = 0
    @Published var hasAmountInput = false
    @Published var hasCallButton = false
    @Published var hasPutButton = false
    @Published var pairScanEnabled = false
    @Published var botRunning = false
    @Published var botMode = "stopped"
    @Published var martingaleStep = 0
    @Published var nextAmount = 1.0
    @Published var botTradesRemaining = 0
    @Published var lastTradeStatus = "Read-only until account mode is confirmed."
    @Published var guidance = "Log in to PO, confirm Demo or Real account mode, then tap Scan."

    @MainActor
    func apply(status: ProofStatus) {
        pageState = status.pageState ?? pageState
        demoMode = status.demoMode ?? demoMode
        activePair = status.activePair ?? activePair
        duration = status.duration ?? duration
        balance = status.balance ?? balance
        payout = status.payout ?? payout
        candleCount = status.candleCount ?? candleCount
        hasAmountInput = status.hasAmountInput ?? hasAmountInput
        hasCallButton = status.hasCallButton ?? hasCallButton
        hasPutButton = status.hasPutButton ?? hasPutButton
        pairScanEnabled = status.pairScanEnabled ?? pairScanEnabled
        botRunning = status.botRunning ?? botRunning
        botMode = status.botMode ?? botMode
        martingaleStep = status.martingaleStep ?? martingaleStep
        nextAmount = status.nextAmount ?? nextAmount
        botTradesRemaining = status.botTradesRemaining ?? botTradesRemaining
        lastTradeStatus = status.lastTradeStatus ?? lastTradeStatus
        guidance = status.guidance ?? guidance
    }
}

struct ProofStatus: Decodable {
    let pageState: String?
    let demoMode: String?
    let activePair: String?
    let duration: String?
    let balance: String?
    let payout: String?
    let candleCount: Int?
    let hasAmountInput: Bool?
    let hasCallButton: Bool?
    let hasPutButton: Bool?
    let pairScanEnabled: Bool?
    let botRunning: Bool?
    let botMode: String?
    let martingaleStep: Int?
    let nextAmount: Double?
    let botTradesRemaining: Int?
    let lastTradeStatus: String?
    let guidance: String?
}
