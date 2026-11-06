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
    let parentComment: String
    let replyComment: String
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
        let click = "label => Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === label).click()"
        let follow = "label => Array.from(document.querySelectorAll('main a')).find(link => link.textContent.trim() === label).click()"
        try await browser.action("(\(click))('Create account');")
        try await browser.expect("document.activeElement.id === 'login-title' && document.activeElement.textContent === 'Create an account'",
                                 "Account creation heading did not receive focus")
        try await browser.action("(\(click))('Sign in instead');")
        try await browser.expect("document.getElementById('login-password')?.disabled === false", "Sign-in did not return")
        stories.append("The sign-in shortcut and account mode switches focus their headings in WebKit.")

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

        let detailPath = "/circles/\(fixture.circleId)"
        try await browser.action("document.querySelector('a[aria-label=\"View circle: Philemon WebKit Circle\"]').click();")
        try await browser.expect("location.pathname === '\(detailPath)' && document.querySelector('[aria-label=\"Public Circle preview\"]')",
                                 "The guest did not reach the public Circle preview")
        try await browser.expect("!document.body.innerText.includes('Open the online meeting') && !document.body.innerText.includes('Open discussion archive and replies')",
                                 "The guest preview showed a private control")
        try await browser.action("(\(follow))('Sign in');")
        try await browser.expect("location.pathname === '/login' && new URLSearchParams(location.search).get('next') === '\(detailPath)?from=online' && document.getElementById('login-password')?.disabled === false",
                                 "Sign-in lost the selected online Circle")
        try await browser.action("(\(click))('Connect wallet');")
        try await browser.expect("location.pathname === '\(detailPath)' && new URLSearchParams(location.search).get('from') === 'online'",
                                 "Wallet sign-in did not return to the exact Circle")
        guard try await browser.memberIsVerified(fixture.memberId) else { throw CheckFailure("Wallet member proof failed") }
        try await browser.load(detailPath + "?from=online")
        guard try await browser.memberIsVerified(fixture.memberId), browser.acceptedCertificate else {
            throw CheckFailure("Verified session did not survive reload with the pinned test certificate")
        }
        stories.append("The public listing signs in through the actual wallet handlers and returns to the same Circle. Its HttpOnly session survives reload over pinned HTTPS.")

        let button = "label => Array.from(document.querySelectorAll('button')).find(button => button.textContent.trim() === label)"
        try await browser.expect("(\(button))('Load current Circle access')?.disabled === false", "Circle access control did not load")
        try await browser.action("(\(click))('Load current Circle access');")
        try await browser.expect("(\(button))('Join this Circle')?.disabled === false", "The signed-in visitor cannot review joining")
        try await browser.action("(\(click))('Join this Circle');")
        try await browser.expect("(\(button))('Confirm join')?.disabled === true && !(\(button))('Open the online meeting')",
                                 "Join confirmation bypassed review or exposed the meeting")
        try await browser.action("Array.from(document.querySelectorAll('label')).find(label => label.textContent.includes('I read the community norms')).querySelector('input').click();")
        try await browser.expect("(\(button))('Confirm join')?.disabled === false", "The checked review did not enable joining")
        try await browser.action("(\(click))('Confirm join');")
        try await browser.expect("(\(button))('Open the online meeting')?.disabled === false && document.querySelector('[aria-label=\"Agreed reading program\"] a')",
                                 "The current member did not get the assigned reading and meeting control")
        stories.append("The member joins only after the norms review and then receives the Circle’s assigned reading and meeting control.")

        try await browser.action("document.querySelector('[aria-label=\"Agreed reading program\"] a').click();")
        try await browser.expect("location.pathname === '/great-books/scripture/philemon' && location.hash === '#scripture' && new URLSearchParams(location.search).get('circle') === '\(fixture.circleId)' && document.querySelectorAll('[data-verse-text]').length === 25 && document.querySelectorAll('[data-publisher-footnote]').length === 2",
                                 "The assigned letter lost its Circle or edition content")
        try await browser.expect("document.querySelector('a[href=\"\(detailPath)\"]')?.textContent === 'Return to Circle details'",
                                 "The exact Circle return link was missing")
        _ = try await browser.zoom(4)
        try await browser.action("(\(follow))('Return to Circle details');")
        try await browser.expect("location.pathname === '\(detailPath)' && (\(button))('Load current Circle access')?.disabled === false && !(\(button))('Open the online meeting')",
                                 "Returning from Scripture reopened an old private view")
        try await browser.action("(\(click))('Load current Circle access');")
        try await browser.expect("(\(button))('Open the online meeting')?.disabled === false", "Returning member access could not be verified")
        stories.append("The assigned Philemon letter keeps all 25 verses and both footnotes and returns to the exact Circle for a fresh access check.")

        try await browser.action("(\(follow))('Open discussion archive and replies');")
        try await browser.expect("(\(button))('Load current discussion archive')?.disabled === false", "The current discussion control was missing")
        try await browser.action("(\(click))('Load current discussion archive');")
        try await browser.expect("document.querySelector('[aria-label=\"Discussion archive page\"]')?.textContent.includes('\(fixture.parentComment)')",
                                 "The existing parent did not load in the discussion archive")
        try await browser.action("(\(click))('Reply to this message');")
        _ = try await browser.view.callAsyncJavaScript("""
            const field = document.querySelector('[aria-label="Write your message"] textarea');
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(field, comment);
            field.dispatchEvent(new Event('input', { bubbles: true }));
            """, arguments: ["comment": fixture.replyComment], in: nil, contentWorld: .page)
        try await browser.expect("(\(button))('Prepare discussion preview')?.disabled === false", "The entered reply did not become reviewable")
        try await browser.action("(\(click))('Prepare discussion preview');")
        try await browser.expect("(\(button))('Post reviewed discussion message')?.disabled === true && document.querySelector('[aria-label=\"Current reply parent\"]')?.textContent.includes('\(fixture.parentComment)') && document.querySelector('[aria-label=\"Review discussion message\"]')?.textContent.includes('\(fixture.replyComment)')",
                                 "The review lost the exact reply or parent")
        try await browser.action("document.querySelector('[aria-label=\"Review discussion message\"] input[type=checkbox]').click();")
        try await browser.action("(\(click))('Post reviewed discussion message');")
        try await browser.expect("document.querySelector('[aria-label=\"Confirmed discussion post\"]')", "The reviewed reply did not confirm")
        try await browser.action("(\(follow))('Open saved discussion message');")
        try await browser.expect("(\(button))('Load current thread')?.disabled === false", "The saved thread did not open")
        try await browser.action("(\(click))('Load current thread');")
        try await browser.expect("document.querySelector('[aria-label=\"Current discussion thread\"]')?.textContent.includes('\(fixture.replyComment)')",
                                 "The saved reply could not be read back from its thread")
        stories.append("The current member reviews the exact reply and its parent, posts it, and reads it back from the saved thread.")

        let signedOut = try await browser.view.callAsyncJavaScript("""
            const response = await fetch('/api/auth/logout', {
              method:'POST', headers:{'Content-Type':'application/json'}, cache:'no-store',
              body:JSON.stringify({requestId:crypto.randomUUID(),scope:'browser'})
            });
            const body = await response.json();
            const member = await fetch('/api/auth/member', {cache:'no-store'});
            return response.ok && body.remoteRevocation === 'wallet_session_revoked' && member.status === 401;
            """, arguments: [:], in: nil, contentWorld: .page) as? Bool
        guard signedOut == true else { throw CheckFailure("The wallet session did not close") }
        let initialControlDisabled = try await browser.view.callAsyncJavaScript("""
            const response = await fetch(path, {cache:'no-store'});
            const page = new DOMParser().parseFromString(await response.text(), 'text/html');
            const load = Array.from(page.querySelectorAll('button')).find(button => button.textContent.trim() === 'Load current discussion archive');
            return response.ok && load?.disabled === true;
            """, arguments: ["path": detailPath + "/discussion"], in: nil, contentWorld: .page) as? Bool
        guard initialControlDisabled == true else { throw CheckFailure("The unhydrated discussion accepts an access click") }
        try await browser.load(detailPath + "/discussion")
        try await browser.expect("(\(button))('Load current discussion archive')?.disabled === false", "The signed-out archive control did not become ready")
        try await browser.action("(\(click))('Load current discussion archive');")
        try await browser.expect("document.body.innerText.includes('Sign in, then load this discussion to check current access.') && !document.querySelector('[aria-label=\"Discussion archive page\"]') && !document.body.innerText.includes('\(fixture.replyComment)')",
                                 "The signed-out browser recovered a private thread")
        stories.append("The browser sign-out endpoint revokes the wallet session. The reloaded archive waits for access controls to initialize, then refuses the signed-out visitor.")

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
