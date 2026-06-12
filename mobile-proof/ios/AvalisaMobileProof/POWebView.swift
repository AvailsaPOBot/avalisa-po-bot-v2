import SwiftUI
import WebKit

struct POWebView: UIViewRepresentable {
    @ObservedObject var model: ProofModel

    func makeCoordinator() -> Coordinator {
        Coordinator(model: model)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.userContentController.add(context.coordinator, name: "avalisaProof")

        if let scriptURL = Bundle.main.url(forResource: "ProofRuntime", withExtension: "js"),
           let script = try? String(contentsOf: scriptURL) {
            let userScript = WKUserScript(source: script, injectionTime: .atDocumentStart, forMainFrameOnly: false)
            configuration.userContentController.addUserScript(userScript)
        }

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        context.coordinator.webView = webView
        loadPO(in: webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        if context.coordinator.reloadToken != model.reloadRequested {
            context.coordinator.reloadToken = model.reloadRequested
            loadPO(in: webView)
        }

        guard let command = model.command else { return }
        DispatchQueue.main.async {
            model.command = nil
        }

        switch command {
        case .scan:
            webView.evaluateJavaScript("window.AvalisaProof && window.AvalisaProof.scan && window.AvalisaProof.scan();")
        case .setPairScan(let enabled):
            webView.evaluateJavaScript("window.AvalisaProof && window.AvalisaProof.setSettings && window.AvalisaProof.setSettings({ pairScanEnabled: \(enabled ? "true" : "false") });")
        case .startBot:
            webView.evaluateJavaScript("window.AvalisaProof && window.AvalisaProof.startBot && window.AvalisaProof.startBot();")
        case .stopBot:
            webView.evaluateJavaScript("window.AvalisaProof && window.AvalisaProof.stopBot && window.AvalisaProof.stopBot('stopped by user');")
        case .demoTrade(let direction):
            let escaped = direction.replacingOccurrences(of: "'", with: "\\'")
            webView.evaluateJavaScript("window.AvalisaProof && window.AvalisaProof.placeTrade('\(escaped)', 1);")
        }
    }

    private func loadPO(in webView: WKWebView) {
        let url = URL(string: "https://m.po.trade/en/cabinet?source=pwa")!
        webView.load(URLRequest(url: url))
    }

    final class Coordinator: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
        weak var webView: WKWebView?
        private let model: ProofModel
        var reloadToken = false

        init(model: ProofModel) {
            self.model = model
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "avalisaProof" else { return }
            let payload: Data?
            if let dict = message.body as? [String: Any] {
                payload = try? JSONSerialization.data(withJSONObject: dict)
            } else if let string = message.body as? String {
                payload = string.data(using: .utf8)
            } else {
                payload = nil
            }
            guard let payload else { return }
            do {
                let status = try JSONDecoder().decode(ProofStatus.self, from: payload)
                Task { @MainActor in
                    self.model.apply(status: status)
                }
            } catch {
                Task { @MainActor in
                    self.model.lastTradeStatus = "Status parse error: \(error.localizedDescription)"
                }
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            webView.evaluateJavaScript("window.AvalisaProof && window.AvalisaProof.scan && window.AvalisaProof.scan();")
        }
    }
}
