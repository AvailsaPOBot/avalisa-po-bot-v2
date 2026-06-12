import SwiftUI

struct ContentView: View {
    @StateObject private var model = ProofModel()

    var body: some View {
        GeometryReader { proxy in
            VStack(spacing: 0) {
                header
                POWebView(model: model)
                    .overlay(alignment: .topTrailing) {
                        statusBadge
                            .padding(10)
                    }
                controlPanel
                    .frame(maxHeight: min(proxy.size.height * 0.42, 360))
            }
            .background(Color(.systemBackground))
        }
    }

    private var header: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Avalisa Mobile Proof")
                    .font(.headline)
                Text("PO mobile web, account-aware execution, no backend writes")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Reload") {
                model.reloadRequested.toggle()
            }
            .buttonStyle(.bordered)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .background(.bar)
    }

    private var statusBadge: some View {
        Text(accountStatusText)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(accountStatusColor)
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .accessibilityLabel("Account mode status")
    }

    private var accountCanTrade: Bool {
        model.demoMode == "confirmed" || model.demoMode == "real"
    }

    private var accountStatusText: String {
        if model.demoMode == "confirmed" { return "DEMO MODE CONFIRMED" }
        if model.demoMode == "real" { return "REAL ACCOUNT ACTIVE" }
        return model.demoMode.uppercased()
    }

    private var accountStatusColor: Color {
        if model.demoMode == "confirmed" { return Color.green.opacity(0.92) }
        if model.demoMode == "real" { return Color.red.opacity(0.92) }
        return Color.orange.opacity(0.92)
    }

    private var controlPanel: some View {
        ScrollView(.vertical) {
            VStack(spacing: 10) {
                topControlRow
                tradeControlRow

                LazyVGrid(columns: [GridItem(.adaptive(minimum: 132), alignment: .leading)], alignment: .leading, spacing: 6) {
                    metric("Page", model.pageState)
                    metric("Pair", model.activePair)
                    metric("Pair mode", model.pairScanEnabled ? "auto scan" : "visible only")
                    metric("Bot", model.botRunning ? model.botMode : "stopped")
                    metric("Next", "$\(Int(model.nextAmount)) step \(model.martingaleStep) rem \(model.botTradesRemaining)")
                    metric("Candles", "\(model.candleCount)")
                    metric("Duration", model.duration)
                    metric("Balance", model.balance)
                    metric("Payout", model.payout)
                    metric("Amount field", model.hasAmountInput ? "found" : "missing")
                    metric("Buttons", "\(model.hasCallButton ? "CALL" : "-") / \(model.hasPutButton ? "PUT" : "-")")
                }
                Text(model.lastTradeStatus)
                    .font(.caption)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(model.lastTradeStatus.lowercased().contains("blocked") ? .red : .secondary)
                Text(model.guidance)
                    .font(.caption.weight(.semibold))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .foregroundStyle(model.demoMode == "real" ? .red : .secondary)
            }
            .padding(12)
        }
        .background(.bar)
    }

    private var topControlRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { botBadge; scanButton; pairScanToggle }
            VStack(alignment: .leading, spacing: 8) { HStack(spacing: 8) { botBadge; scanButton }; pairScanToggle }
        }
    }

    private var tradeControlRow: some View {
        ViewThatFits(in: .horizontal) {
            HStack(spacing: 8) { startButton; stopButton; callButton; putButton }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 112))], spacing: 8) { startButton; stopButton; callButton; putButton }
        }
    }

    private var botBadge: some View {
        Text("BOT")
            .font(.caption.weight(.black))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Color.blue.opacity(0.9))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))
    }

    private var scanButton: some View {
        Button("Scan") {
            model.command = .scan
        }
        .buttonStyle(.borderedProminent)
    }

    private var pairScanToggle: some View {
        Toggle("Auto Pair Scan", isOn: Binding(
            get: { model.pairScanEnabled },
            set: { enabled in
                model.pairScanEnabled = enabled
                model.command = .setPairScan(enabled: enabled)
            }
        ))
        .toggleStyle(.switch)
        .font(.caption)
    }

    private var startButton: some View {
        Button(model.botRunning ? "Bot Running" : "Start Bot") {
            model.command = .startBot
        }
        .buttonStyle(.borderedProminent)
        .disabled(!accountCanTrade || model.botRunning)
    }

    private var stopButton: some View {
        Button("Stop") {
            model.command = .stopBot
        }
        .buttonStyle(.bordered)
        .disabled(!model.botRunning)
    }

    private var callButton: some View {
        Button("$1 CALL") {
            model.command = .demoTrade(direction: "call")
        }
        .buttonStyle(.bordered)
        .disabled(!accountCanTrade)
    }

    private var putButton: some View {
        Button("$1 PUT") {
            model.command = .demoTrade(direction: "put")
        }
        .buttonStyle(.bordered)
        .disabled(!accountCanTrade)
    }

    private func metric(_ label: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
            Text(value.isEmpty ? "-" : value)
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
