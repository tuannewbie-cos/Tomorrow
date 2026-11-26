import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate, WKDownloadDelegate {
    var window: NSWindow!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupMainMenu()

        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 850)
        let width: CGFloat = min(1200, screenRect.width * 0.85)
        let height: CGFloat = min(820, screenRect.height * 0.88)
        let rect = NSRect(
            x: screenRect.midX - width / 2,
            y: screenRect.midY - height / 2,
            width: width,
            height: height
        )

        // Tách biệt thanh tiêu đề chuẩn macOS với header web
        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Tomorrow"
        window.titleVisibility = .visible
        window.titlebarAppearsTransparent = false
        window.hidesOnDeactivate = false
        window.isReleasedWhenClosed = false
        window.delegate = self

        let config = WKWebViewConfiguration()
        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        window.contentView?.addSubview(webView)

        if let url = URL(string: "https://tomorrow-tomorrow11.vercel.app") {
            var req = URLRequest(url: url)
            req.cachePolicy = .reloadIgnoringLocalCacheData
            webView.load(req)
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // Mở hộp thoại Finder khi người dùng chọn tệp (<input type="file">)
    func webView(
        _ webView: WKWebView,
        runOpenPanelWith parameters: WKOpenPanelParameters,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping ([URL]?) -> Void
    ) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = parameters.allowsDirectories
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.resolvesAliases = true
        panel.beginSheetModal(for: self.window) { response in
            if response == .OK {
                completionHandler(panel.urls)
            } else {
                completionHandler(nil)
            }
        }
    }

    // Hỗ trợ tải xuống tệp sao lưu .json (blob: / download) trong WKWebView
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        if #available(macOS 11.3, *) {
            if navigationAction.shouldPerformDownload {
                decisionHandler(.download)
                return
            }
            if let url = navigationAction.request.url, url.scheme == "blob" {
                decisionHandler(.download)
                return
            }
        }
        decisionHandler(.allow)
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        if #available(macOS 11.3, *) {
            if !navigationResponse.canShowMIMEType {
                decisionHandler(.download)
                return
            }
        }
        decisionHandler(.allow)
    }

    @available(macOS 11.3, *)
    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    @available(macOS 11.3, *)
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    @available(macOS 11.3, *)
    func download(
        _ download: WKDownload,
        decideDestinationUsing response: URLResponse,
        suggestedFilename: String,
        completionHandler: @escaping (URL?) -> Void
    ) {
        let savePanel = NSSavePanel()
        savePanel.canCreateDirectories = true
        savePanel.directoryURL = FileManager.default.urls(for: .downloadsDirectory, in: .userDomainMask).first
        savePanel.nameFieldStringValue = suggestedFilename.isEmpty ? "tomorrow-backup.json" : suggestedFilename
        savePanel.beginSheetModal(for: self.window) { result in
            if result == .OK, let destUrl = savePanel.url {
                completionHandler(destUrl)
            } else {
                completionHandler(nil)
            }
        }
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptAlertPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping () -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "Tomorrow"
        alert.informativeText = message
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        alert.runModal()
        completionHandler()
    }

    func webView(
        _ webView: WKWebView,
        runJavaScriptConfirmPanelWithMessage message: String,
        initiatedByFrame frame: WKFrameInfo,
        completionHandler: @escaping (Bool) -> Void
    ) {
        let alert = NSAlert()
        alert.messageText = "Tomorrow"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "OK")
        alert.addButton(withTitle: "Hủy")
        let response = alert.runModal()
        completionHandler(response == .alertFirstButtonReturn)
    }

    func setupMainMenu() {
        let mainMenu = NSMenu()

        // 1. Application Menu (Tomorrow)
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu(title: "Tomorrow")
        appMenuItem.submenu = appMenu

        appMenu.addItem(withTitle: "About Tomorrow", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        let quitItem = NSMenuItem(title: "Quit Tomorrow", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenu.addItem(quitItem)

        // 2. Edit Menu (Edit) — Bắt buộc để WKWebView kích hoạt Cmd+C, Cmd+V, Cmd+X, Cmd+A, Cmd+Z
        let editMenuItem = NSMenuItem()
        mainMenu.addItem(editMenuItem)
        let editMenu = NSMenu(title: "Edit")
        editMenuItem.submenu = editMenu

        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        NSApp.mainMenu = mainMenu
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        NSApp.terminate(nil)
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
