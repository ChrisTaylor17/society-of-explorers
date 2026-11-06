import AppKit
import Foundation
import Security
import WebKit

private struct Fixture: Decodable {
    let buildId: String
    let origin: URL
    let memberId: String
    let circleId: String
    let walletAddress: String
}

private struct CheckFailure: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

@MainActor
private final class Browser: NSObject, WKNavigationDelegate {
    let origin: URL
    let certificate: Data
    let view: WKWebView
    private var navigation: CheckedContinuation<Void, Error>?
    private(set) var acceptedCertificate = false

    init(fixture: Fixture, certificate: Data, rules: WKContentRuleList) {
        self.origin = fixture.origin
        self.certificate = certificate
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.mediaTypesRequiringUserActionForPlayback = []
        config.userContentController.add(rules)
        // The detached view has no foreground window. Exercise the app with
        // a controlled active lifecycle and a throwaway wallet.
        config.userContentController.addUserScript(WKUserScript(source: """
            Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });
            Object.defineProperty(document, 'hasFocus', { value: () => true });
            window.ethereum = {
              async request({ method, params }) {
                if (method === 'eth_accounts' || method === 'eth_requestAccounts') return ['\(fixture.walletAddress)'];
                if (method === 'eth_chainId') return '0x1';
                if (method === 'personal_sign') {
                  const reply = await fetch('/__fixture/wallet-sign', { method: 'POST', body: params[0] });
                  if (!reply.ok) throw Error('Fixture wallet refused the request');
                  return (await reply.json()).signature;
                }
                throw Error('Unexpected fixture wallet method');
              }
            };
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 937), configuration: config)
        super.init()
        view.navigationDelegate = self
    }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        let allowed = action.targetFrame?.isMainFrame == true && url?.scheme == origin.scheme
            && url?.host == origin.host && url?.port == origin.port
        decisionHandler(allowed ? .allow : .cancel)
    }

    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge,
                 completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        let space = challenge.protectionSpace
        guard space.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              space.host == origin.host, space.port == origin.port,
              let trust = space.serverTrust,
              let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let leaf = chain.first, SecCertificateCopyData(leaf) as Data == certificate else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }
        acceptedCertificate = true
        completionHandler(.useCredential, URLCredential(trust: trust))
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        finish()
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        finish(error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(error)
    }

    private func finish(_ error: Error? = nil) {
        let pending = navigation
        navigation = nil
        if let error { pending?.resume(throwing: error) } else { pending?.resume() }
    }

    func load(_ path: String) async throws {
        guard let url = URL(string: path, relativeTo: origin) else { throw CheckFailure("Invalid fixture path") }
        try await withCheckedThrowingContinuation { continuation in
            navigation = continuation
            view.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        }
    }

    func action(_ script: String) async throws {
        _ = try await view.evaluateJavaScript(script + "\ntrue")
    }

    func expect(_ condition: String, _ label: String) async throws {
        for _ in 0..<100 {
            if try await view.evaluateJavaScript("Boolean(\(condition))") as? Bool == true { return }
            try await Task.sleep(for: .milliseconds(60))
        }
        throw CheckFailure(label)
    }

    func zoom(_ factor: Int) async throws -> [String: Int] {
        view.pageZoom = CGFloat(factor)
        let width = 1280 / factor
        try await expect("innerWidth === \(width)", "WebKit viewport did not resize")
        let raw = try await view.evaluateJavaScript("""
            JSON.stringify({width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth})
            """) as? String
        guard let raw, let size = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Int],
              let documentWidth = size["documentWidth"], documentWidth <= width else {
            throw CheckFailure("Horizontal overflow")
        }
        return size
    }

    func memberIsVerified(_ id: String) async throws -> Bool {
        try await view.callAsyncJavaScript("""
            const response = await fetch('/api/auth/member', { cache:'no-store' });
            const body = await response.json();
            return response.ok && body.auth.provider === 'wallet' && body.auth.subject === expected
              && body.member.id === expected && !document.cookie.includes('soe_wallet_id=');
            """, arguments: ["expected": id], in: nil, contentWorld: .page) as? Bool == true
    }
}

@main
private struct Run {
    @MainActor
    static func main() async {
        do {
            let result = try await run()
            let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
            print(String(decoding: data, as: UTF8.self))
        } catch {
            FileHandle.standardError.write(Data("WebKit check failed: \(error)\n".utf8))
            exit(1)
        }
    }

    @MainActor
    private static func run() async throws -> [String: Any] {
        guard CommandLine.arguments.count == 2 else { throw CheckFailure("Supply the owned fixture directory") }
        let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: directory.appendingPathComponent("fixture-ready.json")))
        guard fixture.origin.scheme == "https", fixture.origin.host == "127.0.0.1", let port = fixture.origin.port,
              fixture.walletAddress.range(of: "^0x[0-9A-Fa-f]{40}$", options: .regularExpression) != nil else {
            throw CheckFailure("Unexpected fixture origin or address")
        }
        NSApplication.shared.setActivationPolicy(.prohibited)
        guard let store = WKContentRuleListStore(url: directory) else { throw CheckFailure("Rule store unavailable") }
        let rules: [[String: [String: String]]] = [
            ["trigger": ["url-filter": ".*"], "action": ["type": "block"]],
            ["trigger": ["url-filter": "^data:"], "action": ["type": "ignore-previous-rules"]],
            ["trigger": ["url-filter": "^https://127[.]0[.]0[.]1:\(port)/"], "action": ["type": "ignore-previous-rules"]],
            ["trigger": ["url-filter": "^blob:https://127[.]0[.]0[.]1:\(port)/"], "action": ["type": "ignore-previous-rules"]],
        ]
        let encoded = String(decoding: try JSONSerialization.data(withJSONObject: rules), as: UTF8.self)
        guard let list = try await store.compileContentRuleList(forIdentifier: "fixture-loopback", encodedContentRuleList: encoded) else {
            throw CheckFailure("Rule compilation failed")
        }
        let certificate = try Data(contentsOf: directory.appendingPathComponent("fixture.der"))
        let browser = Browser(fixture: fixture, certificate: certificate, rules: list)
        var stories = [String](), layouts = [[String: Any]]()
        for (path, heading) in [
            ("/login?next=%2Fmanifesto", "Welcome back"), ("/auth/recovery", "Recover your password"),
            ("/circles?format=online", "Read together in a weekly salon"), ("/clips", "Clips & passages"),
        ] {
            try await browser.load(path)
            try await browser.expect("document.querySelector('main h1')?.textContent === '\(heading)'", "Wrong page heading")
            for factor in [1, 2, 4] {
                let size = try await browser.zoom(factor)
                layouts.append(["path": path, "factor": factor, "size": size])
            }
        }
        stories.append("The built sign-in, recovery, online directory and Clips pages reflow at 100%, 200% and 400%.")

        try await browser.load("/login?next=%2Fmanifesto")
        try await browser.expect("isSecureContext && document.getElementById('login-password')?.disabled === false",
                                 "Sign-in did not become available")
        try await browser.action("document.querySelector('a[href=\"#login-title\"]').click();")
        try await browser.expect("location.hash === '#login-title' && document.activeElement.id === 'login-title'",
                                 "Sign-in shortcut failed to focus its target")
        let click = "label => Array.from(document.querySelectorAll('button')).find(button => button.textContent === label).click()"
        try await browser.action("(\(click))('Create account');")
        try await browser.expect("document.activeElement.id === 'login-title' && document.activeElement.textContent === 'Create an account'",
                                 "Account creation heading did not receive focus")
        try await browser.action("(\(click))('Sign in instead');")
        try await browser.expect("document.getElementById('login-password')?.disabled === false", "Sign-in did not return")
        stories.append("The sign-in shortcut and account mode switches focus their headings in WebKit.")

        try await browser.action("(\(click))('Connect wallet');")
        try await browser.expect("location.pathname === '/manifesto'", "Wallet sign-in did not reach the requested page")
        guard try await browser.memberIsVerified(fixture.memberId) else { throw CheckFailure("Wallet member proof failed") }
        try await browser.load("/manifesto")
        guard try await browser.memberIsVerified(fixture.memberId), browser.acceptedCertificate else {
            throw CheckFailure("Verified session did not survive reload with the pinned test certificate")
        }
        stories.append("The built login uses the actual nonce and signature handlers over HTTPS and retains the HttpOnly wallet session on reload.")

        try await browser.load("/circles?format=online")
        try await browser.expect("document.querySelector('a[aria-label=\"View circle: Philemon WebKit Circle\"]')",
                                 "Public fixture Circle did not load")
        try await browser.action("document.querySelector('a[href=\"#main\"]').click();")
        try await browser.expect("location.hash === '#main' && document.activeElement.id === 'main'", "Circle shortcut lost focus")
        try await browser.action("""
            const form = document.querySelector('form[role=search]');
            const field = form.querySelector('input');
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(field,'Philemon');
            field.dispatchEvent(new Event('input',{bubbles:true}));
            """)
        try await browser.action("document.querySelector('form[role=search]').requestSubmit();")
        try await browser.expect("new URL(location.href).searchParams.get('q') === 'Philemon' && document.activeElement.textContent === 'Current results page'",
                                 "Submitted search did not reach its focused results")
        try await browser.action("history.back();")
        try await browser.expect("!new URL(location.href).searchParams.has('q') && document.activeElement.textContent === 'Current results page'",
                                 "Back did not restore the previous search")
        stories.append("The Circle shortcut preserves the directory, and a submitted search and Back focus their results.")

        try await browser.load("/clips")
        try await browser.action("document.querySelector('a[href=\"#clips-title\"]').click();")
        try await browser.expect("location.hash === '#clips-title' && document.activeElement.id === 'clips-title'", "Clips shortcut lost focus")
        try await browser.action("document.querySelector('article[aria-label=\"Who gets the night sky?\"] summary').click();")
        try await browser.expect("document.querySelector('article[aria-label=\"Who gets the night sky?\"] details[open]')",
                                 "Reel transcript did not open")
        stories.append("The Clips shortcut and the credited Reel transcript open in WebKit.")
        NSApplication.shared.setActivationPolicy(.accessory)
        let window = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 1280, height: 937),
                              styleMask: [.borderless], backing: .buffered, defer: false)
        window.contentView = browser.view
        window.orderBack(nil)
        defer { window.orderOut(nil) }
        for title in ["Who gets the night sky?", "What did the tilt prove?"] {
            let article = "article[aria-label=\"\(title)\"]"
            let player = "document.querySelector('\(article) video')"
            try await browser.action("document.querySelector('\(article) button').click();")
            try await browser.expect("\(player)?.paused === true && \(player)?.querySelector('track')",
                                     "Reel and its caption track did not load paused")
            try await browser.action("""
                \(player).muted = true;
                \(player).play().catch(() => {});
                """)
            try await browser.expect("\(player)?.currentTime >= 0.5 && \(player).playbackRate === 1 && !\(player).error",
                                     "Reel playback did not advance at normal speed: \(title)")
            try await browser.action("\(player).pause();")
        }
        stories.append("Both credited Reels load with captions and play at normal speed after an explicit play action.")
        browser.view.stopLoading()
        return ["status": "PASS", "buildId": fixture.buildId, "layouts": layouts, "stories": stories,
                "pinnedCertificate": browser.acceptedCertificate,
                "scope": "macOS WKWebView with a nonpersistent store, controlled active lifecycle, programmatic play and synthetic wallet/member. Safari and physical-device testing remain open."]
    }
}
