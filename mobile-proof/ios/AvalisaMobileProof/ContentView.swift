import SwiftUI

struct ContentView: View {
    @StateObject private var model = ProofModel()

    var body: some View {
        VStack(spacing: 0) {
            header
            POWebView(model: model)
                .overlay(alignment: .topTrailing) {
                    statusBadge
                        .padding(10)
                }
            controlPanel
        }
        .background(Color(.systemBackground))
    }

    private var header: some View {
        HStack(spacing: 10) {
            VStack(alignment: .leading, spacing: 2) {
                Text("Avalisa Mobile Proof")
                    .font(.headline)
                Text("PO mobile web, local demo guard, no backend writes")
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
        Text(model.demoMode == "confirmed" ? "DEMO MODE CONFIRMED" : model.demoMode.uppercased())
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(model.demoMode == "confirmed" ? Color.green.opacity(0.92) : Color.orange.opacity(0.92))
            .foregroundStyle(.white)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .accessibilityLabel("Demo mode status")
    }

    private var controlPanel: some View {
        VStack(spacing: 10) {
            HStack(spacing: 8) {
                Text("BOT")
                    .font(.caption.weight(.black))
                    .padding(.horizontal, 8)
                    .padding(.vertical, 5)
                    .background(Color.blue.opacity(0.9))
                    .foregroundStyle(.white)
                    .clipShape(RoundedRectangle(cornerRadius: 5, style: .continuous))

                Button("Scan") {
                    model.command = .scan
                }
                .buttonStyle(.borderedProminent)

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

            HStack(spacing: 8) {
                Button(model.botRunning ? "Bot Running" : "Start Bot") {
                    model.command = .startBot
                }
                .buttonStyle(.borderedProminent)
                .disabled(model.demoMode != "confirmed" || model.botRunning)

                Button("Stop") {
                    model.command = .stopBot
                }
                .buttonStyle(.bordered)
                .disabled(!model.botRunning)

                Button("$1 CALL") {
                    model.command = .demoTrade(direction: "call")
                }
                .buttonStyle(.bordered)
                .disabled(model.demoMode != "confirmed")

                Button("$1 PUT") {
                    model.command = .demoTrade(direction: "put")
                }
                .buttonStyle(.bordered)
                .disabled(model.demoMode != "confirmed")
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], alignment: .leading, spacing: 6) {
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
                .foregroundStyle(model.demoMode == "real-blocked" ? .red : .secondary)
        }
        .padding(12)
        .background(.bar)
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
