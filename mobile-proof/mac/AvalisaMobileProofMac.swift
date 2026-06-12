import AppKit
import WebKit

private extension NSColor {
    convenience init(hex: Int) {
        self.init(
            calibratedRed: CGFloat((hex >> 16) & 0xff) / 255.0,
            green: CGFloat((hex >> 8) & 0xff) / 255.0,
            blue: CGFloat(hex & 0xff) / 255.0,
            alpha: 1.0
        )
    }
}

final class AvalisaMobileProofMac: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    private let initialContentSize = NSSize(width: 430, height: 900)
    private let minContentSize = NSSize(width: 360, height: 640)
    private let maxContentSize = NSSize(width: 1280, height: 1200)
    private let panelColor = NSColor(hex: 0x1A1A2E)
    private let panelBorderColor = NSColor(hex: 0x2D2D5B)
    private let fieldColor = NSColor(hex: 0x0F0F23)
    private let purpleColor = NSColor(hex: 0xA78BFA)
    private let textColor = NSColor(hex: 0xE2E8F0)
    private let mutedTextColor = NSColor(hex: 0x94A3B8)
    private let greenColor = NSColor(hex: 0x059669)
    private let redColor = NSColor(hex: 0xDC2626)
    private var window: NSWindow!
    private var webView: WKWebView!
    private let statusGrid = NSGridView()
    private let lastStatus = NSTextField(labelWithString: "Status: Loading")
    private var startBotButton: NSButton!
    private var stopBotButton: NSButton!
    private var settingsToggleButton: NSButton!
    private var settingsDrawer: NSStackView!
    private var settingsExpanded = false
    private var panelHeightConstraint: NSLayoutConstraint!
    private weak var panelScrollView: NSScrollView?
    private var authLoggedIn = true
    private var authSection: NSStackView!
    private var callButton: NSButton!
    private var putButton: NSButton!
    private var strategyPopup: NSPopUpButton!
    private var directionPopup: NSPopUpButton!
    private var timeframePopup: NSPopUpButton!
    private var intensityPopup: NSPopUpButton!
    private var pairScanPopup: NSPopUpButton!
    private var amountField: NSTextField!
    private var multiplierPopup: NSPopUpButton!
    private var stepsPopup: NSPopUpButton!
    private var payoutMinField: NSTextField!
    private var payoutEnabledSwitch: NSSwitch!
    private var payoutActionPopup: NSPopUpButton!
    private var loginIdField: NSTextField!
    private var loginPasswordField: NSSecureTextField!
    private var directionRow: NSStackView!
    private var timeframeRow: NSStackView!
    private var intensityRow: NSStackView!
    private var pairScanRow: NSStackView!
    private let tradeCounter = NSTextField(labelWithString: "Trades this session: 0")
    private let tradeAllowance = NSTextField(labelWithString: "Trade allowance: ∞ (Pro)")
    private var values: [String: NSTextField] = [:]
    private var sleeves: [ClosureSleeve] = []
    private var statusTimer: Timer?
    private var stableAccountCanTrade = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        loadPO()
        statusTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.pollStatus()
        }
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
    }

    private func buildWindow() {
        let configuration = WKWebViewConfiguration()
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true
        configuration.preferences.javaScriptCanOpenWindowsAutomatically = true
        configuration.userContentController.add(WeakScriptMessageHandler(delegate: self), name: "avalisaProof")

        let runtime = loadRuntimeScript()
        if let runtime {
            configuration.userContentController.addUserScript(
                WKUserScript(source: runtime, injectionTime: .atDocumentStart, forMainFrameOnly: false)
            )
        }

        webView = WKWebView(frame: .zero, configuration: configuration)
        webView.customUserAgent = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
        webView.navigationDelegate = self

        let content = NSStackView()
        content.orientation = .vertical
        content.alignment = .width
        content.spacing = 0
        content.translatesAutoresizingMaskIntoConstraints = false
        content.wantsLayer = true
        content.layer?.backgroundColor = NSColor(hex: 0x0B1020).cgColor

        let header = makeProofHeader()

        let controlRows = NSStackView()
        controlRows.orientation = .vertical
        controlRows.alignment = .width
        controlRows.spacing = 0
        controlRows.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: 0, right: 0)

        startBotButton = button("▶ Start", style: .green) { [weak self] in
            self?.sendSettings()
            self?.eval("window.AvalisaProof && window.AvalisaProof.startBot();")
        }
        stopBotButton = button("■ Stop", style: .red) { [weak self] in self?.eval("window.AvalisaProof && window.AvalisaProof.stopBot('stopped by user');") }
        startBotButton.font = .boldSystemFont(ofSize: 15)
        stopBotButton.font = .boldSystemFont(ofSize: 15)
        startBotButton.isEnabled = false
        stopBotButton.isEnabled = false
        settingsToggleButton = chevronButton("⌄") { [weak self] in
            self?.toggleSettingsDrawer()
        }
        callButton = button("$1 CALL", style: .outline) { [weak self] in self?.eval("window.AvalisaProof && window.AvalisaProof.placeTrade('call', 1);") }
        putButton = button("$1 PUT", style: .outline) { [weak self] in self?.eval("window.AvalisaProof && window.AvalisaProof.placeTrade('put', 1);") }
        callButton.isEnabled = false
        putButton.isEnabled = false

        authSection = extensionSection([
            authView()
        ], bottomBorder: true)
        controlRows.addArrangedSubview(authSection)
        controlRows.addArrangedSubview(extensionSection([
            settingsRows()
        ], bottomBorder: false))

        let compactHeader = compactPanelHeader()
        let compactControls = NSStackView()
        compactControls.orientation = .horizontal
        compactControls.spacing = 10
        compactControls.distribution = .fillEqually
        compactControls.addArrangedSubview(startBotButton)
        compactControls.addArrangedSubview(stopBotButton)
        let compactControlsSection = extensionSection([
            compactControls
        ], bottomBorder: true)

        let rows = [
            row("Page", key: "pageState"),
            row("Account", key: "demoMode"),
            row("Pair", key: "activePair"),
            row("Pair mode", key: "pairMode"),
            row("Bot", key: "botMode"),
            row("Next", key: "botNext"),
            row("Candles", key: "candleCount"),
            row("Duration", key: "duration"),
            row("Balance", key: "balance"),
            row("Payout", key: "payout"),
            row("Amount", key: "hasAmountInput"),
            row("Buttons", key: "buttons"),
        ]
        rows.forEach { rowViews in
            _ = statusGrid.addRow(with: rowViews)
        }
        statusGrid.rowSpacing = 4
        statusGrid.columnSpacing = 8

        lastStatus.font = .systemFont(ofSize: 12)
        lastStatus.textColor = purpleColor
        lastStatus.usesSingleLineMode = true
        lastStatus.lineBreakMode = .byTruncatingTail
        lastStatus.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        tradeAllowance.font = .systemFont(ofSize: 11)
        tradeAllowance.textColor = mutedTextColor
        tradeCounter.font = .systemFont(ofSize: 11)
        tradeCounter.textColor = NSColor(hex: 0x64748B)
        let statusPanel = NSStackView()
        statusPanel.orientation = .vertical
        statusPanel.alignment = .width
        statusPanel.spacing = 10
        statusPanel.addArrangedSubview(compactHeader)

        let runtimeStatusSection = extensionSection([
            lastStatus,
            tradeAllowance,
            tradeCounter
        ], bottomBorder: true)

        let expandedDrawer = NSStackView()
        expandedDrawer.orientation = .vertical
        expandedDrawer.alignment = .width
        expandedDrawer.spacing = 6
        expandedDrawer.addArrangedSubview(controlRows)
        expandedDrawer.addArrangedSubview(compactControlsSection)
        expandedDrawer.addArrangedSubview(runtimeStatusSection)
        expandedDrawer.addArrangedSubview(footerRow())
        expandedDrawer.isHidden = true
        settingsDrawer = expandedDrawer
        statusPanel.addArrangedSubview(expandedDrawer)
        statusPanel.edgeInsets = NSEdgeInsets(top: 6, left: 20, bottom: 8, right: 20)
        if runtime == nil {
            lastStatus.stringValue = "Status: Runtime missing"
        }

        content.addArrangedSubview(header)
        content.addArrangedSubview(webView)
        content.addArrangedSubview(panelBox(containing: scrollPanel(containing: statusPanel)))

        window = NSWindow(contentRect: NSRect(origin: NSPoint(x: 80, y: 80), size: initialContentSize), styleMask: [.titled, .closable, .miniaturizable, .resizable], backing: .buffered, defer: false)
        window.title = "Avalisa Mobile Proof"
        window.contentMinSize = minContentSize
        window.contentMaxSize = maxContentSize
        window.contentView = content
        window.center()
        window.setContentSize(initialContentSize)
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()

        NSLayoutConstraint.activate([
            webView.heightAnchor.constraint(greaterThanOrEqualToConstant: 420),
            header.heightAnchor.constraint(equalToConstant: 34),
        ])
    }

    private func makeProofHeader() -> NSStackView {
        let row = NSStackView()
        row.orientation = .horizontal
        row.spacing = 8
        row.edgeInsets = NSEdgeInsets(top: 8, left: 12, bottom: 8, right: 12)
        row.wantsLayer = true
        row.layer?.backgroundColor = fieldColor.cgColor

        let title = NSTextField(labelWithString: "Avalisa Mobile Proof")
        title.font = .boldSystemFont(ofSize: 13)
        title.textColor = textColor
        title.lineBreakMode = .byTruncatingTail
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        row.addArrangedSubview(title)
        return row
    }

    private func compactPanelHeader() -> NSView {
        let header = NSView()
        header.translatesAutoresizingMaskIntoConstraints = false

        let logo = NSImageView()
        logo.imageScaling = .scaleProportionallyUpOrDown
        logo.image = loadLogoImage()
        logo.translatesAutoresizingMaskIntoConstraints = false

        let brand = linkButton("Avalisa PO Bot", font: .boldSystemFont(ofSize: 16), color: textColor, alignment: .left) { [weak self] in
            self?.openAvalisaWebsite()
        }

        let version = NSTextField(labelWithString: "v.1.02")
        version.font = .boldSystemFont(ofSize: 12)
        version.textColor = textColor

        let website = linkButton("https://avalisabot.vercel.app", font: .systemFont(ofSize: 11), color: mutedTextColor, alignment: .left) { [weak self] in
            self?.openAvalisaWebsite()
        }

        let titleRow = NSStackView()
        titleRow.orientation = .horizontal
        titleRow.alignment = .lastBaseline
        titleRow.spacing = 5
        titleRow.addArrangedSubview(brand)
        titleRow.addArrangedSubview(version)

        let brandStack = NSStackView()
        brandStack.orientation = .vertical
        brandStack.spacing = 2
        brandStack.alignment = .leading
        brandStack.addArrangedSubview(titleRow)
        brandStack.addArrangedSubview(website)

        let brandGroup = NSStackView()
        brandGroup.orientation = .horizontal
        brandGroup.alignment = .centerY
        brandGroup.spacing = 10
        brandGroup.addArrangedSubview(logo)
        brandGroup.addArrangedSubview(brandStack)
        brandGroup.translatesAutoresizingMaskIntoConstraints = false
        settingsToggleButton.translatesAutoresizingMaskIntoConstraints = false
        header.addSubview(brandGroup)
        header.addSubview(settingsToggleButton)

        NSLayoutConstraint.activate([
            logo.widthAnchor.constraint(equalToConstant: 82),
            logo.heightAnchor.constraint(equalToConstant: 43),
            brandGroup.centerXAnchor.constraint(equalTo: header.centerXAnchor),
            brandGroup.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            settingsToggleButton.trailingAnchor.constraint(equalTo: header.trailingAnchor),
            settingsToggleButton.centerYAnchor.constraint(equalTo: header.centerYAnchor),
            header.heightAnchor.constraint(equalToConstant: 64),
        ])
        return header
    }

    private func loadLogoImage() -> NSImage? {
        if let bundled = Bundle.main.url(forResource: "avalisa-signature-logo-transparent", withExtension: "png") {
            return NSImage(contentsOf: bundled)
        }
        let cwd = FileManager.default.currentDirectoryPath
        if let transparent = NSImage(contentsOfFile: "\(cwd)/extension/icons/avalisa-signature-logo-transparent.png") {
            return transparent
        }
        return NSImage(contentsOfFile: "\(cwd)/extension/icons/avalisa-signature-logo-gold.png")
    }

    private func openAvalisaWebsite() {
        if let url = URL(string: "https://avalisabot.vercel.app") {
            NSWorkspace.shared.open(url)
        }
    }

    private func toggleSettingsDrawer() {
        settingsExpanded.toggle()
        settingsDrawer?.isHidden = !settingsExpanded
        settingsToggleButton?.title = settingsExpanded ? "⌃" : "⌄"
        panelHeightConstraint?.constant = settingsExpanded ? 430 : 78
        resetPanelScroll()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { [weak self] in self?.resetPanelScroll() }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { [weak self] in self?.resetPanelScroll() }
    }

    private func resetPanelScroll() {
        DispatchQueue.main.async { [weak self] in
            guard let scrollView = self?.panelScrollView else { return }
            let clipView = scrollView.contentView
            let maxY = max(0, (scrollView.documentView?.bounds.height ?? 0) - clipView.bounds.height)
            clipView.scroll(to: NSPoint(x: 0, y: maxY))
            scrollView.reflectScrolledClipView(clipView)
        }
    }

    private func authView() -> NSStackView {
        authLoggedIn ? loggedInRow() : loginForm()
    }

    private func loggedInRow() -> NSStackView {
        let row = NSStackView()
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 12
        row.edgeInsets = NSEdgeInsets(top: 8, left: 16, bottom: 8, right: 10)
        row.wantsLayer = true
        row.layer?.backgroundColor = NSColor(hex: 0x202438).cgColor
        row.layer?.borderColor = NSColor(hex: 0x303A58).cgColor
        row.layer?.borderWidth = 1
        row.layer?.cornerRadius = 10

        let icon = NSImageView()
        let accountSymbol = NSImage.SymbolConfiguration(pointSize: 22, weight: .regular)
        icon.image = NSImage(systemSymbolName: "person.circle", accessibilityDescription: "Account")?.withSymbolConfiguration(accountSymbol)
        icon.contentTintColor = purpleColor
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.widthAnchor.constraint(equalToConstant: 26).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 26).isActive = true

        let email = NSTextField(labelWithString: "oil4121@gmail.com")
        email.font = .systemFont(ofSize: 14)
        email.textColor = mutedTextColor
        email.lineBreakMode = .byTruncatingMiddle
        email.toolTip = email.stringValue
        email.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        let badge = NSButton(title: "PRO", target: nil, action: nil)
        badge.isBordered = false
        badge.font = .boldSystemFont(ofSize: 12)
        badge.contentTintColor = NSColor(hex: 0x15120A)
        badge.alignment = .center
        badge.wantsLayer = true
        badge.layer?.backgroundColor = NSColor(hex: 0xF4C95D).cgColor
        badge.layer?.cornerRadius = 11
        badge.widthAnchor.constraint(equalToConstant: 52).isActive = true
        badge.heightAnchor.constraint(equalToConstant: 24).isActive = true

        let logout = button("Logout", style: .red) { [weak self] in
            self?.authLoggedIn = false
            self?.rebuildAuthSection()
        }
        logout.font = .boldSystemFont(ofSize: 14)
        logout.layer?.cornerRadius = 9
        logout.widthAnchor.constraint(equalToConstant: 86).isActive = true

        row.addArrangedSubview(icon)
        row.addArrangedSubview(email)
        row.addArrangedSubview(badge)
        row.addArrangedSubview(NSView())
        row.addArrangedSubview(logout)
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: 58).isActive = true
        return row
    }

    private func loginForm() -> NSStackView {
        let stack = NSStackView()
        stack.orientation = .vertical
        stack.spacing = 8

        let title = NSTextField(labelWithString: "Login to your account")
        title.font = .boldSystemFont(ofSize: 13)
        title.textColor = textColor

        loginIdField = numericField("")
        loginIdField.placeholderString = "ID / Email"
        loginPasswordField = NSSecureTextField(string: "")
        loginPasswordField.placeholderString = "Password"
        loginPasswordField.font = .systemFont(ofSize: 12)
        loginPasswordField.textColor = textColor
        loginPasswordField.backgroundColor = fieldColor
        loginPasswordField.target = self
        loginPasswordField.action = #selector(settingsChanged)

        let actions = NSStackView()
        actions.orientation = .horizontal
        actions.spacing = 8
        actions.distribution = .fillEqually
        actions.addArrangedSubview(button("Login", style: .green) { [weak self] in
            self?.authLoggedIn = true
            self?.rebuildAuthSection()
        })
        actions.addArrangedSubview(button("Sign up", style: .outline) { [weak self] in
            self?.openAvalisaWebsite()
        })

        let forgot = linkButton("Forgot password?", font: .systemFont(ofSize: 11), color: purpleColor) { [weak self] in
            self?.openAvalisaWebsite()
        }

        stack.addArrangedSubview(title)
        stack.addArrangedSubview(loginIdField)
        stack.addArrangedSubview(loginPasswordField)
        stack.addArrangedSubview(actions)
        stack.addArrangedSubview(forgot)
        return stack
    }

    private func rebuildAuthSection() {
        authSection.arrangedSubviews.forEach {
            authSection.removeArrangedSubview($0)
            $0.removeFromSuperview()
        }
        authSection.addArrangedSubview(authView())
    }

    private func aiPill() -> NSStackView {
        let pill = NSStackView()
        pill.orientation = .horizontal
        pill.alignment = .centerY
        pill.spacing = 8
        pill.edgeInsets = NSEdgeInsets(top: 7, left: 10, bottom: 7, right: 10)
        pill.wantsLayer = true
        pill.layer?.backgroundColor = NSColor(hex: 0x1F1A3E).cgColor
        pill.layer?.borderColor = NSColor(hex: 0x7C3AED).cgColor
        pill.layer?.borderWidth = 1
        pill.layer?.cornerRadius = 8

        let ai = NSTextField(labelWithString: "AI")
        ai.font = .boldSystemFont(ofSize: 9)
        ai.textColor = .white
        ai.alignment = .center
        ai.wantsLayer = true
        ai.layer?.backgroundColor = NSColor(hex: 0x7C3AED).cgColor
        ai.layer?.cornerRadius = 4
        ai.widthAnchor.constraint(equalToConstant: 24).isActive = true
        ai.heightAnchor.constraint(equalToConstant: 18).isActive = true

        let name = NSTextField(labelWithString: "Avalisa")
        name.font = .systemFont(ofSize: 13)
        name.textColor = NSColor(hex: 0xECEAFF)

        let arrow = NSTextField(labelWithString: "↗")
        arrow.font = .boldSystemFont(ofSize: 12)
        arrow.textColor = purpleColor

        pill.addArrangedSubview(ai)
        pill.addArrangedSubview(name)
        pill.addArrangedSubview(NSView())
        pill.addArrangedSubview(arrow)
        pill.widthAnchor.constraint(equalToConstant: 130).isActive = true
        return pill
    }

    private enum ButtonStyle {
        case primary, green, red, outline
    }

    private func button(_ title: String, style: ButtonStyle = .outline, action: @escaping () -> Void) -> NSButton {
        let button = NSButton(title: title, target: nil, action: nil)
        button.bezelStyle = .regularSquare
        button.isBordered = false
        button.font = .boldSystemFont(ofSize: 12)
        button.contentTintColor = .white
        button.wantsLayer = true
        button.layer?.cornerRadius = 6
        button.layer?.borderWidth = style == .outline ? 1 : 0
        button.layer?.borderColor = purpleColor.cgColor
        switch style {
        case .primary:
            button.layer?.backgroundColor = NSColor(hex: 0x7C3AED).cgColor
        case .green:
            button.layer?.backgroundColor = greenColor.cgColor
        case .red:
            button.layer?.backgroundColor = redColor.cgColor
        case .outline:
            button.layer?.backgroundColor = NSColor.clear.cgColor
            button.contentTintColor = purpleColor
        }
        button.heightAnchor.constraint(equalToConstant: 44).isActive = true
        let sleeve = ClosureSleeve(action)
        sleeves.append(sleeve)
        button.target = sleeve
        button.action = #selector(ClosureSleeve.invoke)
        return button
    }

    private func chevronButton(_ title: String, action: @escaping () -> Void) -> NSButton {
        let button = NSButton(title: title, target: nil, action: nil)
        button.bezelStyle = .regularSquare
        button.isBordered = false
        button.font = .boldSystemFont(ofSize: 16)
        button.contentTintColor = purpleColor
        button.wantsLayer = true
        button.layer?.cornerRadius = 7
        button.layer?.borderWidth = 1
        button.layer?.borderColor = purpleColor.cgColor
        button.layer?.backgroundColor = NSColor.clear.cgColor
        button.widthAnchor.constraint(equalToConstant: 34).isActive = true
        button.heightAnchor.constraint(equalToConstant: 34).isActive = true
        let sleeve = ClosureSleeve(action)
        sleeves.append(sleeve)
        button.target = sleeve
        button.action = #selector(ClosureSleeve.invoke)
        return button
    }

    private func linkButton(_ title: String, font: NSFont, color: NSColor, alignment: NSTextAlignment = .left, action: @escaping () -> Void) -> NSButton {
        let button = NSButton(title: title, target: nil, action: nil)
        button.isBordered = false
        button.font = font
        button.contentTintColor = color
        button.alignment = alignment
        button.setButtonType(.momentaryChange)
        let sleeve = ClosureSleeve(action)
        sleeves.append(sleeve)
        button.target = sleeve
        button.action = #selector(ClosureSleeve.invoke)
        return button
    }

    private func popup(_ items: [String], selected: String) -> NSPopUpButton {
        let popup = NSPopUpButton()
        popup.addItems(withTitles: items)
        popup.selectItem(withTitle: selected)
        popup.target = self
        popup.action = #selector(settingsChanged)
        popup.font = .systemFont(ofSize: 12)
        popup.contentTintColor = textColor
        popup.wantsLayer = true
        popup.layer?.backgroundColor = fieldColor.cgColor
        popup.layer?.borderColor = panelBorderColor.cgColor
        popup.layer?.borderWidth = 1
        popup.layer?.cornerRadius = 6
        return popup
    }

    private func numericField(_ value: String) -> NSTextField {
        let field = NSTextField(string: value)
        field.target = self
        field.action = #selector(settingsChanged)
        field.maximumNumberOfLines = 1
        field.font = .systemFont(ofSize: 12)
        field.textColor = textColor
        field.backgroundColor = fieldColor
        field.layer?.borderColor = panelBorderColor.cgColor
        return field
    }

    private func settingsRows() -> NSStackView {
        strategyPopup = popup(["Martingale", "Avalisa AI"], selected: "Martingale")
        directionPopup = popup(["Alternating", "Always Buy", "Always Sell"], selected: "Alternating")
        timeframePopup = popup(["30s", "1min", "3min", "5min"], selected: "30s")
        intensityPopup = popup(["Low", "Mid", "High"], selected: "Low")
        pairScanPopup = popup(["Current pair only", "Auto scan favorites"], selected: "Current pair only")
        amountField = numericField("1")
        multiplierPopup = popup(["2.0×", "2.2×", "2.4×", "2.6×", "2.8×", "3.0×"], selected: "2.0×")
        stepsPopup = popup(["Infinite", "1", "2", "3", "4", "5", "6", "8", "10", "12"], selected: "Infinite")
        payoutMinField = numericField("90")
        payoutEnabledSwitch = NSSwitch()
        payoutEnabledSwitch.controlSize = .small
        payoutEnabledSwitch.target = self
        payoutEnabledSwitch.action = #selector(settingsChanged)
        payoutEnabledSwitch.state = .on
        payoutEnabledSwitch.toolTip = "Turn payout checking on or off before each trade."
        payoutActionPopup = popup(["Auto-switch favorite", "Stop bot"], selected: "Auto-switch favorite")

        applyHelp()

        let rows = NSStackView()
        rows.orientation = .vertical
        rows.alignment = .width
        rows.spacing = 0
        rows.edgeInsets = NSEdgeInsets(top: 4, left: 0, bottom: 4, right: 0)
        rows.wantsLayer = true
        rows.layer?.backgroundColor = NSColor(hex: 0x1A1F31).cgColor
        rows.layer?.borderColor = NSColor(hex: 0x303A58).cgColor
        rows.layer?.borderWidth = 1
        rows.layer?.cornerRadius = 10

        rows.addArrangedSubview(settingRow(label: "Strategy", icon: "arrow.triangle.2.circlepath", control: strategyPopup))
        rows.addArrangedSubview(rowDivider())
        directionRow = settingRow(label: "Direction", icon: "target", control: directionPopup)
        timeframeRow = settingRow(label: "Timeframe", icon: "timer", control: timeframePopup)
        intensityRow = settingRow(label: "Intensity", icon: "gauge.medium", control: intensityPopup)
        pairScanRow = settingRow(label: "Pair Scan", icon: "magnifyingglass.circle", control: pairScanPopup)
        rows.addArrangedSubview(directionRow)
        rows.addArrangedSubview(rowDivider())
        rows.addArrangedSubview(timeframeRow)
        rows.addArrangedSubview(rowDivider())
        rows.addArrangedSubview(intensityRow)
        rows.addArrangedSubview(rowDivider())
        rows.addArrangedSubview(pairScanRow)
        rows.addArrangedSubview(rowDivider())
        rows.addArrangedSubview(settingRow(label: "Start Amount ($)", icon: "dollarsign.circle", control: amountField))
        rows.addArrangedSubview(rowDivider())
        rows.addArrangedSubview(settingRow(label: "Martingale ×", icon: "point.3.connected.trianglepath.dotted", control: multiplierPopup))
        rows.addArrangedSubview(rowDivider())
        rows.addArrangedSubview(settingRow(label: "Martingale Steps", icon: "chart.bar.xaxis", control: stepsPopup))
        rows.addArrangedSubview(rowDivider())
        rows.addArrangedSubview(payoutCombinedRow())
        applyStrategyUI()
        return rows
    }

    private func applyHelp() {
        let tips: [(NSView?, String)] = [
            (strategyPopup, "Choose the bot logic. Martingale follows your direction rules. Avalisa AI waits for indicator-based signals."),
            (directionPopup, "Direction used by Martingale mode."),
            (timeframePopup, "Trade expiry for Martingale mode."),
            (intensityPopup, "Low trades fastest. Mid is balanced and allows OTC. High is strict and skips OTC."),
            (pairScanPopup, "Auto scan checks favorite pairs. Current pair only stays on the visible chart."),
            (amountField, "First stake amount. Martingale resets to this after a win."),
            (multiplierPopup, "How much to multiply the next stake after a loss."),
            (stepsPopup, "Maximum recovery steps. Ties keep the same step and amount."),
            (payoutMinField, "Minimum payout Avalisa should accept before placing a trade."),
            (payoutActionPopup, "Choose what Avalisa does when payout is below the minimum."),
        ]
        tips.forEach { view, tip in view?.toolTip = tip }
    }

    private func settingRow(label text: String, icon: String, control: NSView) -> NSStackView {
        let row = NSStackView()
        row.orientation = .horizontal
        row.alignment = .centerY
        row.spacing = 10
        row.edgeInsets = NSEdgeInsets(top: 6, left: 12, bottom: 6, right: 12)
        row.wantsLayer = true
        row.layer?.backgroundColor = NSColor.clear.cgColor

        let iconView = NSImageView()
        iconView.image = NSImage(systemSymbolName: icon, accessibilityDescription: text)
        iconView.contentTintColor = purpleColor
        iconView.imageScaling = .scaleProportionallyUpOrDown
        iconView.widthAnchor.constraint(equalToConstant: 20).isActive = true
        iconView.heightAnchor.constraint(equalToConstant: 20).isActive = true
        let label = settingsLabel(text)
        label.toolTip = control.toolTip
        label.font = .systemFont(ofSize: 13)
        row.addArrangedSubview(label)
        row.insertArrangedSubview(iconView, at: 0)
        row.addArrangedSubview(NSView())
        row.addArrangedSubview(control)
        control.widthAnchor.constraint(equalToConstant: 160).isActive = true
        row.heightAnchor.constraint(greaterThanOrEqualToConstant: 44).isActive = true
        return row
    }

    private func rowDivider() -> NSView {
        let divider = NSView()
        divider.wantsLayer = true
        divider.layer?.backgroundColor = NSColor(hex: 0x2A314C).cgColor
        divider.heightAnchor.constraint(equalToConstant: 1).isActive = true
        return divider
    }

    private func payoutCombinedRow() -> NSStackView {
        let row = NSStackView()
        row.orientation = .vertical
        row.alignment = .width
        row.spacing = 4
        row.edgeInsets = NSEdgeInsets(top: 8, left: 12, bottom: 5, right: 12)
        row.wantsLayer = true
        row.layer?.backgroundColor = NSColor.clear.cgColor

        let top = NSStackView()
        top.orientation = .horizontal
        top.alignment = .centerY
        top.spacing = 10
        let iconView = NSImageView()
        iconView.image = NSImage(systemSymbolName: "percent", accessibilityDescription: "Minimum payout")
        iconView.contentTintColor = purpleColor
        iconView.imageScaling = .scaleProportionallyUpOrDown
        iconView.widthAnchor.constraint(equalToConstant: 20).isActive = true
        iconView.heightAnchor.constraint(equalToConstant: 20).isActive = true
        let label = settingsLabel("Minimum payout %")
        label.font = .systemFont(ofSize: 13)
        label.toolTip = payoutMinField.toolTip
        top.addArrangedSubview(iconView)
        top.addArrangedSubview(label)
        top.addArrangedSubview(NSView())
        let topControls = NSStackView()
        topControls.orientation = .horizontal
        topControls.alignment = .centerY
        topControls.spacing = 14
        let payoutControlOffset = NSView()
        payoutControlOffset.widthAnchor.constraint(equalToConstant: 8).isActive = true
        topControls.addArrangedSubview(payoutControlOffset)
        topControls.addArrangedSubview(payoutEnabledSwitch)
        topControls.addArrangedSubview(payoutMinField)
        top.addArrangedSubview(topControls)
        payoutEnabledSwitch.widthAnchor.constraint(equalToConstant: 28).isActive = true
        payoutMinField.widthAnchor.constraint(equalToConstant: 96).isActive = true
        topControls.widthAnchor.constraint(equalToConstant: 160).isActive = true

        let bottom = NSStackView()
        bottom.orientation = .horizontal
        bottom.alignment = .centerY
        bottom.spacing = 10
        bottom.addArrangedSubview(NSView())
        bottom.addArrangedSubview(payoutActionPopup)
        payoutActionPopup.widthAnchor.constraint(equalToConstant: 160).isActive = true

        row.addArrangedSubview(top)
        row.addArrangedSubview(bottom)
        return row
    }

    private func footerRow() -> NSTextField {
        let footer = NSTextField(labelWithString: "AvalisaPOBot@gmail.com")
        footer.font = .systemFont(ofSize: 10)
        footer.textColor = mutedTextColor
        footer.alignment = .left
        return footer
    }

    private func applyStrategyUI() {
        let isAI = strategyPopup?.titleOfSelectedItem == "Avalisa AI"
        directionRow?.isHidden = isAI
        timeframeRow?.isHidden = isAI
        intensityRow?.isHidden = !isAI
        pairScanRow?.isHidden = !isAI
        strategyPopup?.layer?.borderColor = isAI ? NSColor(hex: 0x7C3AED).cgColor : panelBorderColor.cgColor
        strategyPopup?.layer?.borderWidth = isAI ? 2 : 1
        let payoutEnabled = payoutEnabledSwitch?.state == .on
        payoutMinField?.isEnabled = payoutEnabled
        payoutActionPopup?.isEnabled = payoutEnabled
        payoutMinField?.alphaValue = payoutEnabled ? 1.0 : 0.45
        payoutActionPopup?.alphaValue = payoutEnabled ? 1.0 : 0.45
    }

    private func settingsLabel(_ text: String) -> NSTextField {
        let label = NSTextField(labelWithString: text)
        label.font = .systemFont(ofSize: 11)
        label.textColor = mutedTextColor
        return label
    }

    private func sectionDivider() -> NSBox {
        let divider = NSBox()
        divider.boxType = .separator
        return divider
    }

    private func sectionTitle(_ text: String) -> NSTextField {
        let label = NSTextField(labelWithString: text.uppercased())
        label.font = .boldSystemFont(ofSize: 11)
        label.textColor = purpleColor
        return label
    }

    private func extensionSection(_ views: [NSView], bottomBorder: Bool) -> NSStackView {
        let section = NSStackView()
        section.orientation = .vertical
        section.alignment = .width
        section.spacing = 8
        section.edgeInsets = NSEdgeInsets(top: 0, left: 0, bottom: bottomBorder ? 12 : 0, right: 0)
        views.forEach { section.addArrangedSubview($0) }
        if bottomBorder {
            section.addArrangedSubview(sectionDivider())
        }
        return section
    }

    private func panelBox(containing view: NSView) -> NSBox {
        let box = NSBox()
        box.boxType = .custom
        box.isTransparent = true
        box.contentViewMargins = NSSize(width: 0, height: 0)
        box.wantsLayer = true
        box.layer?.cornerRadius = 0
        box.layer?.backgroundColor = panelColor.cgColor
        box.layer?.borderColor = panelBorderColor.cgColor
        box.layer?.borderWidth = 1
        box.contentView?.addSubview(view)
        view.translatesAutoresizingMaskIntoConstraints = false
        if let contentView = box.contentView {
            NSLayoutConstraint.activate([
                view.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
                view.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
                view.topAnchor.constraint(equalTo: contentView.topAnchor),
                view.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
            ])
        }
        return box
    }

    private func scrollPanel(containing view: NSView) -> NSScrollView {
        let scrollView = NSScrollView()
        scrollView.drawsBackground = false
        scrollView.borderType = .noBorder
        scrollView.hasVerticalScroller = true
        scrollView.hasHorizontalScroller = false
        scrollView.autohidesScrollers = true
        scrollView.documentView = view
        panelScrollView = scrollView
        view.translatesAutoresizingMaskIntoConstraints = false
        panelHeightConstraint = scrollView.heightAnchor.constraint(equalToConstant: settingsExpanded ? 430 : 78)
        NSLayoutConstraint.activate([
            panelHeightConstraint,
            view.widthAnchor.constraint(equalTo: scrollView.contentView.widthAnchor),
        ])
        return scrollView
    }

    @objc private func settingsChanged() {
        applyStrategyUI()
        sendSettings()
    }

    private func sendSettings() {
        let strategyMap = ["Martingale": "martingale", "Avalisa AI": "ai"]
        let directionMap = ["Alternating": "alternating", "Always Buy": "call", "Always Sell": "put"]
        let timeframeMap = ["30s": "S30", "1min": "M1", "3min": "M3", "5min": "M5"]
        let intensityMap = ["Low": "low", "Mid": "mid", "High": "high"]
        let multiplier = (multiplierPopup?.titleOfSelectedItem ?? "2.0×").replacingOccurrences(of: "×", with: "")
        let steps = (stepsPopup?.titleOfSelectedItem ?? "Infinite").lowercased()
        let payoutAction = payoutEnabledSwitch?.state == .on
            ? (payoutActionPopup?.titleOfSelectedItem == "Stop bot" ? "stop" : "switch")
            : "off"
        let settings: [String: Any] = [
            "strategy": strategyMap[strategyPopup?.titleOfSelectedItem ?? "Martingale"] ?? "martingale",
            "direction": directionMap[directionPopup?.titleOfSelectedItem ?? "Alternating"] ?? "alternating",
            "timeframe": timeframeMap[timeframePopup?.titleOfSelectedItem ?? "30s"] ?? "S30",
            "intensity": intensityMap[intensityPopup?.titleOfSelectedItem ?? "Low"] ?? "low",
            "startAmount": Double(amountField?.stringValue ?? "1") ?? 1,
            "martingaleMultiplier": Double(multiplier) ?? 2,
            "martingaleSteps": steps,
            "delaySeconds": 6,
            "maxProofTrades": 0,
            "maxProofAmount": 64,
            "aiPairMode": pairScanPopup?.titleOfSelectedItem == "Auto scan favorites" ? "auto" : "current",
            "payoutAction": payoutAction,
            "payoutMinPercent": Int(payoutMinField?.stringValue ?? "90") ?? 90,
            "mobileAmountFallback": "stop",
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: ["settings": settings]),
              let json = String(data: data, encoding: .utf8) else { return }
        eval("window.AvalisaProof && window.AvalisaProof.setSettings(\(json));")
    }

    private func row(_ label: String, key: String) -> [NSView] {
        let name = NSTextField(labelWithString: label)
        name.textColor = mutedTextColor
        name.font = .systemFont(ofSize: 11)
        let value = NSTextField(labelWithString: "-")
        value.font = .monospacedSystemFont(ofSize: 11, weight: .regular)
        value.textColor = textColor
        values[key] = value
        return [name, value]
    }

    private func loadPO() {
        let url = URL(string: "https://m.po.trade/en/cabinet/demo-quick-high-low/?source=pwa")!
        webView.load(URLRequest(url: url))
    }

    private func eval(_ script: String) {
        webView.evaluateJavaScript(script)
    }

    private func pollStatus() {
        webView.evaluateJavaScript("(window.AvalisaProof ? (window.AvalisaProof.scan(), window.AvalisaProof.snapshot()) : null)") { [weak self] result, error in
            if error != nil {
                self?.setStatusText("Status: Runtime error", color: self?.purpleColor ?? .systemPurple)
                return
            }
            guard let self, let json = result as? String, let data = json.data(using: .utf8),
                  let body = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
                self?.setStatusText("Status: Loading", color: self?.purpleColor ?? .systemPurple)
                return
            }
            self.applyStatus(body)
        }
    }

    private func loadRuntimeScript() -> String? {
        if let bundled = Bundle.main.url(forResource: "ProofRuntime", withExtension: "js"),
           let script = try? String(contentsOf: bundled, encoding: .utf8) {
            return script
        }
        let cwd = FileManager.default.currentDirectoryPath
        let path = "\(cwd)/mobile-proof/ios/AvalisaMobileProof/ProofRuntime.js"
        return try? String(contentsOfFile: path, encoding: .utf8)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == "avalisaProof" else { return }
        let body: [String: Any]
        if let dict = message.body as? [String: Any] {
            body = dict
        } else if let string = message.body as? String,
                  let data = string.data(using: .utf8),
                  let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
            body = parsed
        } else {
            return
        }
        applyStatus(body)
    }

    private func applyStatus(_ body: [String: Any]) {
        values["pageState"]?.stringValue = "\(body["pageState"] ?? "-")"
        let demoMode = "\(body["demoMode"] ?? "-")"
        values["demoMode"]?.stringValue = demoMode
        let lowerDemoMode = demoMode.lowercased()
        if lowerDemoMode == "confirmed" || lowerDemoMode.contains("demo") || lowerDemoMode == "real" {
            stableAccountCanTrade = true
        } else if lowerDemoMode.contains("blocked") || lowerDemoMode.contains("denied") || lowerDemoMode == "unknown" {
            stableAccountCanTrade = false
        }
        let canTradeAccount = stableAccountCanTrade
        let botRunning = ((body["botRunning"] as? Bool) == true)
        setEnabled(startBotButton, canTradeAccount && !botRunning)
        setEnabled(stopBotButton, botRunning)
        setEnabled(callButton, canTradeAccount && !botRunning)
        setEnabled(putButton, canTradeAccount && !botRunning)
        values["activePair"]?.stringValue = "\(body["activePair"] ?? "-")"
        let pairScanEnabled = ((body["pairScanEnabled"] as? Bool) == true)
        values["pairMode"]?.stringValue = pairScanEnabled ? "auto scan" : "visible only"
        let botMode = "\(body["botMode"] ?? "stopped")"
        let step = "\(body["martingaleStep"] ?? 0)"
        let nextAmount = "\(body["nextAmount"] ?? 1)"
        let remaining = "\(body["botTradesRemaining"] ?? 0)"
        values["botMode"]?.stringValue = botRunning ? botMode : "stopped"
        values["botNext"]?.stringValue = "$\(nextAmount) step \(step) rem \(remaining)"
        values["candleCount"]?.stringValue = "\(body["candleCount"] ?? 0)"
        values["duration"]?.stringValue = "\(body["duration"] ?? "-")"
        values["balance"]?.stringValue = "\(body["balance"] ?? "-")"
        values["payout"]?.stringValue = "\(body["payout"] ?? "-")"
        values["hasAmountInput"]?.stringValue = ((body["hasAmountInput"] as? Bool) == true) ? "found" : "missing"
        let call = ((body["hasCallButton"] as? Bool) == true) ? "CALL" : "-"
        let put = ((body["hasPutButton"] as? Bool) == true) ? "PUT" : "-"
        values["buttons"]?.stringValue = "\(call) / \(put)"
        if botRunning {
            setStatusText("Status: Running", color: NSColor(hex: 0x34D399))
        } else if canTradeAccount {
            setStatusText("Status: Ready", color: purpleColor)
        } else {
            setStatusText("Status: Stopped", color: purpleColor)
        }
        tradeCounter.stringValue = "Trades this session: \(body["tradesCount"] ?? 0)"
        tradeAllowance.isHidden = strategyPopup?.titleOfSelectedItem != "Avalisa AI"
        tradeAllowance.stringValue = "Trade allowance: ∞ (Pro)"
    }

    private func setEnabled(_ button: NSButton?, _ enabled: Bool) {
        guard let button, button.isEnabled != enabled else { return }
        button.isEnabled = enabled
    }

    private func setStatusText(_ text: String, color: NSColor) {
        if lastStatus.stringValue != text {
            lastStatus.stringValue = text
        }
        if lastStatus.textColor != color {
            lastStatus.textColor = color
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        eval("window.AvalisaProof && window.AvalisaProof.scan();")
    }
}

private final class ClosureSleeve: NSObject {
    private let closure: () -> Void

    init(_ closure: @escaping () -> Void) {
        self.closure = closure
    }

    @objc func invoke() {
        closure()
    }
}

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AvalisaMobileProofMac()
app.delegate = delegate
app.run()
