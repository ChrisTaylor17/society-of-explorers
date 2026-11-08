import AppKit
import Foundation
import Security
import WebKit

private struct Actor: Decodable { let memberId: String; let walletAddress: String }
private struct Fixture: Decodable {
    let buildId: String; let origin: URL; let circleId: String; let actors: [String: Actor]
}
private struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ value: String) { description = value }
}

@MainActor
private final class Browser: NSObject, WKNavigationDelegate {
    let view: WKWebView
    let fixture: Fixture
    let actor: Actor
    let certificate: Data
    private var navigation: CheckedContinuation<Void, Error>?
    private(set) var pinned = false
    init(fixture: Fixture, actor: Actor, certificate: Data, rules: WKContentRuleList) {
        self.fixture = fixture; self.actor = actor; self.certificate = certificate
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(rules)
        let allowedOrigin = "https://127.0.0.1:\(fixture.origin.port!)"
        // Detached macOS view: lifecycle and EIP-1193 are explicit test adapters.
        // The app/SDK, TLS cookie jar and wallet-sign-in handlers remain actual.
        config.userContentController.addUserScript(WKUserScript(source: """
            window.__fixtureActive = true;
            window.__fixtureExternal = []; window.__fixtureErrors = [];
            Object.defineProperty(document,'visibilityState',{get:()=>window.__fixtureActive?'visible':'hidden'});
            Object.defineProperty(document,'hasFocus',{value:()=>window.__fixtureActive});
            const nativeFetch = window.fetch;
            window.fetch = function(input,...args) {
              const address=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
              if(typeof address!=='string')return Promise.reject(Error('Invalid fixture fetch input'));
              const target = new URL(address,location.href);
              if(target.origin !== '\(allowedOrigin)') {
                window.__fixtureExternal.push(target.origin+target.pathname);
                return Promise.reject(Error('Fixture blocks external fetch'));
              }
              return nativeFetch.call(this,input,...args);
            };
            window.addEventListener('error',e=>window.__fixtureErrors.push(String(e.message)));
            window.addEventListener('unhandledrejection',e=>window.__fixtureErrors.push(String(e.reason)));
            window.ethereum = { async request({method,params}) {
              if(method==='eth_accounts'||method==='eth_requestAccounts')return ['\(actor.walletAddress)'];
              if(method==='eth_chainId')return '0x1';
              if(method==='personal_sign') {
                const response=await fetch('/__fixture/wallet-sign',{method:'POST',body:params[0]});
                if(!response.ok)throw Error('Synthetic wallet signature refused');
                return (await response.json()).signature;
              }
              throw Error('Unexpected fixture wallet method');
            }};
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 937), configuration: config)
        super.init(); view.navigationDelegate = self
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let target = action.request.url, origin = fixture.origin
        decisionHandler(action.targetFrame?.isMainFrame == true && target?.scheme == origin.scheme && target?.host == origin.host && target?.port == origin.port ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        let space = challenge.protectionSpace
        guard space.authenticationMethod == NSURLAuthenticationMethodServerTrust, space.host == fixture.origin.host, space.port == fixture.origin.port,
              let trust = space.serverTrust, let chain = SecTrustCopyCertificateChain(trust) as? [SecCertificate],
              let first = chain.first, SecCertificateCopyData(first) as Data == certificate else {
            completionHandler(.cancelAuthenticationChallenge, nil); return
        }
        pinned = true; completionHandler(.useCredential, URLCredential(trust: trust))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finish(nil) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(error) }
    private func finish(_ error: Error?) {
        let continuation = navigation; navigation = nil
        if let error { continuation?.resume(throwing: error) } else { continuation?.resume() }
    }
    func load(_ path: String) async throws {
        guard let url = URL(string: path, relativeTo: fixture.origin) else { throw Failure("Invalid test path") }
        try await withCheckedThrowingContinuation { continuation in navigation = continuation; view.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)) }
    }
    func action(_ source: String) async throws { _ = try await view.evaluateJavaScript(source + "\ntrue") }
    func expect(_ condition: String, _ message: String) async throws {
        for _ in 0..<130 {
            if try await view.evaluateJavaScript("Boolean(\(condition))") as? Bool == true { return }
            try await Task.sleep(for: .milliseconds(60))
        }
        throw Failure(message)
    }
    func click(_ label: String) async throws {
        try await expect("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===\(quoted(label))&&!b.disabled)", "Action never became available: \(label)")
        _ = try await view.callAsyncJavaScript("""
            const button=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===label);
            if(!button||button.disabled)throw Error('Requested action is unavailable: '+label);
            button.click(); await new Promise(resolve=>setTimeout(resolve,0)); return true;
            """, arguments: ["label": label], in: nil, contentWorld: .page)
    }
    func check(_ prefix: String) async throws {
        try await expect("Array.from(document.querySelectorAll('label')).some(e=>e.textContent.trim().startsWith(\(quoted(prefix)))&&e.querySelector('input[type=checkbox]')?.disabled===false)", "Confirmation never became available")
        _ = try await view.callAsyncJavaScript("""
            const label=Array.from(document.querySelectorAll('label')).find(e=>e.textContent.trim().startsWith(prefix));
            const field=label?.querySelector('input[type=checkbox]');
            if(!field||field.disabled)throw Error('Requested confirmation is unavailable');
            if(!field.checked)field.click(); await new Promise(resolve=>setTimeout(resolve,0)); return true;
            """, arguments: ["prefix": prefix], in: nil, contentWorld: .page)
    }
    func fill(_ label: String, _ value: String) async throws {
        try await expect("Array.from(document.querySelectorAll('textarea')).some(e=>e.getAttribute('aria-label')===\(quoted(label))&&!e.disabled)", "Private field never became available")
        _ = try await view.callAsyncJavaScript("""
            const field=Array.from(document.querySelectorAll('textarea')).find(e=>e.getAttribute('aria-label')===label);
            if(!field||field.disabled)throw Error('Private field unavailable');
            Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(field,value);
            field.dispatchEvent(new Event('input',{bubbles:true})); await new Promise(resolve=>setTimeout(resolve,0)); return true;
            """, arguments: ["label": label, "value": value], in: nil, contentWorld: .page)
    }
    func code(_ label: String, _ prefix: String) async throws -> String {
        try await expect("Array.from(document.querySelectorAll('textarea')).some(e=>e.getAttribute('aria-label')===\(quoted(label)))", "Private code did not appear")
        let value = try await view.callAsyncJavaScript("return Array.from(document.querySelectorAll('textarea')).find(e=>e.getAttribute('aria-label')===label)?.value;",
            arguments: ["label": label], in: nil, contentWorld: .page) as? String
        guard let value, value.hasPrefix(prefix) else { throw Failure("Wrong private-code envelope") }; return value
    }
    func activity(_ active: Bool) async throws {
        try await action("window.__fixtureActive=\(active ? "true" : "false");window.dispatchEvent(new Event('\(active ? "focus" : "blur")'));document.dispatchEvent(new Event('visibilitychange'));")
    }
    func access() async throws {
        try await expect("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Check invitation access'&&!b.disabled)", "Invitation check unavailable")
        try await click("Check invitation access")
        try await expect("document.body.innerText.includes('Current account and salon access checked.')||document.body.innerText.includes('Current account checked. Recover the earlier request')", "Current invitation access did not confirm")
    }
    func login() async throws {
        let target = "/circles/\(fixture.circleId)/admission"
        let encoded = target.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed)!.replacingOccurrences(of: "/", with: "%2F")
        try await load("/login?next=\(encoded)")
        try await expect("isSecureContext&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Connect wallet'&&!b.disabled)", "Wallet sign-in control unavailable")
        try await click("Connect wallet")
        try await expect("location.pathname===\(quoted(target))&&document.querySelector('h1')?.textContent==='Salon invitations'", "Sign-in did not return to the actual admission page")
        let matches = try await view.callAsyncJavaScript("""
            const response=await fetch('/api/auth/member',{cache:'no-store'}),value=await response.json();
            return response.ok&&value.auth.provider==='wallet'&&value.auth.subject===expected&&value.member.id===expected;
            """, arguments: ["expected": actor.memberId], in: nil, contentWorld: .page) as? Bool
        guard matches == true else { throw Failure("Actual wallet-cookie identity did not match") }
        try await access()
    }
    func zoom(_ factor: Int) async throws -> [String: Int] {
        view.pageZoom = CGFloat(factor); let width = 1280 / factor
        try await expect("innerWidth===\(width)", "WebKit viewport did not resize")
        let raw = try await view.evaluateJavaScript("JSON.stringify({width:innerWidth,documentWidth:document.documentElement.scrollWidth})") as? String
        guard let raw, let value = try JSONSerialization.jsonObject(with: Data(raw.utf8)) as? [String: Int], value["documentWidth"]! <= width else { throw Failure("Invitation layout overflows") }
        return value
    }
    func clean() async throws {
        try await expect("window.__fixtureExternal.length===0&&window.__fixtureErrors.length===0", "Browser observed an external request or script error")
        try await expect("!Object.values(localStorage).some(v=>v.includes('soe-cr1.')||v.includes('soe-ci1.'))&&!location.href.includes('soe-ci1.')&&!location.href.includes('soe-cr1.')", "A private code escaped its form")
    }
    func logout() async throws {
        let result = try await view.callAsyncJavaScript("""
            const response=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},cache:'no-store',
              body:JSON.stringify({requestId:crypto.randomUUID(),scope:'browser'})});
            const value=await response.json(),member=await fetch('/api/auth/member',{cache:'no-store'});
            return response.ok&&value.remoteRevocation==='wallet_session_revoked'&&member.status===401;
            """, arguments: [:], in: nil, contentWorld: .page) as? Bool
        guard result == true else { throw Failure("Wallet session did not revoke") }
    }
}
private func quoted(_ value: String) -> String {
    String(decoding: try! JSONSerialization.data(withJSONObject: value, options: [.fragmentsAllowed]), as: UTF8.self)
}

@main
private struct Run {
    @MainActor static func main() async {
        do {
            let result = try await run(), encoded = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
            print(String(decoding: encoded, as: UTF8.self))
        } catch { FileHandle.standardError.write(Data("WebKit admission check failed: \(error)\n".utf8)); exit(1) }
    }
    @MainActor static func run() async throws -> [String: Any] {
        let calibrate = CommandLine.arguments.count == 3 && CommandLine.arguments[2] == "--calibrate-failure"
        guard CommandLine.arguments.count == 2 || calibrate else { throw Failure("Supply the owned fixture directory") }
        let directory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
        let fixture = try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: directory.appendingPathComponent("fixture-ready.json")))
        guard fixture.origin.scheme == "https", fixture.origin.host == "127.0.0.1", let port = fixture.origin.port,
              let hostActor = fixture.actors["host"], let readerActor = fixture.actors["recipient"], let forwardedActor = fixture.actors["forwarded"] else { throw Failure("Invalid fixture identity") }
        NSApplication.shared.setActivationPolicy(.prohibited)
        guard let store = WKContentRuleListStore(url: directory) else { throw Failure("Rule store unavailable") }
        let rules: [[String: [String: String]]] = [
            ["trigger": ["url-filter": ".*"], "action": ["type": "block"]],
            ["trigger": ["url-filter": "^data:"], "action": ["type": "ignore-previous-rules"]],
            ["trigger": ["url-filter": "^https://127[.]0[.]0[.]1:\(port)/"], "action": ["type": "ignore-previous-rules"]],
        ]
        let json = String(decoding: try JSONSerialization.data(withJSONObject: rules), as: UTF8.self)
        guard let list = try await store.compileContentRuleList(forIdentifier: "admission-loopback", encodedContentRuleList: json) else { throw Failure("Rule compilation failed") }
        let certificate = try Data(contentsOf: directory.appendingPathComponent("fixture.der"))
        let host = Browser(fixture: fixture, actor: hostActor, certificate: certificate, rules: list)
        let reader = Browser(fixture: fixture, actor: readerActor, certificate: certificate, rules: list)
        let forwarded = Browser(fixture: fixture, actor: forwardedActor, certificate: certificate, rules: list)
        var stories = [String](), layouts = [[String: Int]]()
        let target = "/circles/\(fixture.circleId)/admission"
        try await reader.load(target)
        try await reader.expect("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Check invitation access'&&!b.disabled)", "Signed-out page did not hydrate")
        try await reader.click("Check invitation access")
        try await reader.expect("document.body.innerText.includes('current account or invitation could not be verified')&&!document.querySelector('textarea')", "Signed-out visitor received invitation fields")
        stories.append("The actual compiled admission page hydrates and refuses the signed-out visitor without exposing private fields.")
        if calibrate { throw Failure("Intentional failure after SQL startup and compiled-page hydration") }
        try await reader.login(); try await host.login(); try await forwarded.login()
        stories.append("Three isolated WebKit cookie stores complete real nonce/SIWE signature/session handling with throwaway wallets and distinct synthetic members.")
        for factor in [1, 2, 4] { layouts.append(try await reader.zoom(factor)) }
        _ = try await reader.zoom(1)
        try await reader.check("I choose to share my member name and account reference")
        try await reader.click("Create my sharing code")
        let share = try await reader.code("My one-hour sharing code", "soe-cr1.")
        try await reader.activity(false)
        try await reader.expect("!document.querySelector('textarea')&&Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Check invitation access'&&b.disabled)", "Blur retained private sharing presentation")
        try await reader.activity(true); try await reader.access()
        stories.append("At 100%, 200% and 400% the invitation form fits; explicit sharing gives no membership and its code clears on controlled blur.")
        try await host.fill("Recipient sharing code", share); try await host.click("Review recipient")
        try await host.expect("document.activeElement.textContent==='Review this recipient'&&document.body.innerText.includes('Synthetic WebKit recipient')", "Host recipient review/focus unavailable")
        try await host.check("I reviewed the account, recipient and effects above")
        try await host.click("Issue approval code")
        let token = try await host.code("Approval code for the reviewed recipient", "soe-ci1.")
        try await forwarded.fill("Host approval code", token); try await forwarded.click("Review my approval")
        try await forwarded.expect("document.body.innerText.includes('current account or invitation could not be verified')&&!document.querySelector('[aria-label=\"Review invitation action\"]')", "Forwarded approval reached a join review")
        stories.append("Host review focuses the exact recipient; a separate confirmation issues approval and another authenticated member cannot use it.")
        try await reader.fill("Host approval code", token); try await reader.click("Review my approval")
        try await reader.expect("document.activeElement.textContent==='Review joining this salon'", "Join review did not receive focus")
        try await reader.check("I reviewed the account, recipient and effects above")
        _ = try await reader.view.callAsyncJavaScript("await fetch('/__fixture/loss',{method:'POST',body:'join'}); return true;", arguments: [:], in: nil, contentWorld: .page)
        try await reader.click("Confirm join"); try await reader.expect("document.body.innerText.includes('The result is uncertain')", "Lost join reply was assumed successful")
        try await reader.activity(false); try await reader.activity(true); try await reader.access()
        try await reader.click("Check earlier invitation result")
        try await reader.expect("document.body.innerText.includes('Your earlier join was recorded.')", "Read-only recovery did not find the exact join")
        stories.append("A post-commit lost reply stays uncertain across controlled retirement and recovers read-only without another join.")
        try await host.access(); try await host.click("Review revocation"); try await host.check("I reviewed the account, recipient and effects above")
        _ = try await host.view.callAsyncJavaScript("await fetch('/__fixture/loss',{method:'POST',body:'revoke'}); return true;", arguments: [:], in: nil, contentWorld: .page)
        try await host.click("Confirm revocation"); try await host.expect("document.body.innerText.includes('The result is uncertain')", "Lost revoke reply was assumed successful")
        try await host.access(); try await host.click("Check earlier invitation result"); try await host.check("I reviewed the account, recipient and effects above")
        try await host.click("Confirm revocation"); try await host.expect("document.body.innerText.includes('Revocation recorded.')", "Exact revoke retry did not confirm")
        stories.append("Revocation uses explicit review and exact retry after a lost reply; final SQL checks establish one advance and preserved members.")
        try await host.load("/quest/\(fixture.circleId)")
        try await host.expect("Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Connect signed-in account'&&!b.disabled)", "Compiled Quest connect control unavailable")
        try await host.click("Connect signed-in account"); try await host.access()
        try await host.fill("Recipient sharing code", share); try await host.activity(false)
        try await host.expect("!document.querySelector('textarea[aria-label=\"Recipient sharing code\"]')", "Quest blur retained private code")
        try await host.activity(true); try await host.access()
        try await host.expect("document.querySelector('textarea[aria-label=\"Recipient sharing code\"]')?.value===''&&document.getElementById('quest-immersive-enter')?.disabled===true&&document.getElementById('quest-immersive-status')?.textContent.includes('Immersive viewing is unavailable')", "Quest regular-window/XR fallback did not recover")
        stories.append("The actual compiled Quest view accepts the wallet-cookie account, clears private code on controlled blur, and keeps regular controls usable when WebXR is unsupported.")
        let counts = try await host.view.callAsyncJavaScript("""
            const data=await (await fetch('/__fixture/state')).json(),calls=data.requests;
            const joins=calls.filter(v=>v.path.endsWith('/join-invited')),receipts=calls.filter(v=>v.path.endsWith('/invitation-receipt')),revokes=calls.filter(v=>v.path.endsWith('/invitations/revoke'));
            return joins.length===1&&receipts.length===1&&revokes.length===2&&revokes[0].bodySha256===revokes[1].bodySha256
              &&!receipts[0].keys.includes('invitationToken')&&!receipts[0].keys.includes('recipientCode');
            """, arguments: [:], in: nil, contentWorld: .page) as? Bool
        guard counts == true else { throw Failure("Invitation request counts or token-free receipt scope changed") }
        for browser in [host, reader, forwarded] { try await browser.clean(); try await browser.logout(); browser.view.stopLoading() }
        try await reader.load(target); try await reader.click("Check invitation access")
        try await reader.expect("document.body.innerText.includes('current account or invitation could not be verified')&&!document.querySelector('textarea')", "Signed-out reader regained private controls")
        try await reader.clean(); reader.view.stopLoading()
        guard host.pinned && reader.pinned && forwarded.pinned else { throw Failure("Not every browser checked the pinned TLS leaf") }
        stories.append("All three wallet sessions revoke through the real local logout handler; the reloaded signed-out reader cannot recover private invitation fields.")
        return ["status":"PASS","buildId":fixture.buildId,"stories":stories,"layouts":layouts,"pinnedCertificate":true,
            "scope":"Resident macOS WKWebView/nonpersistent stores; actual compiled frontend/SDK and local wallet/auth/admission source handlers over disposable SQL. Wallet transport,lifecycle,PostgREST/provider and API dispatch are explicit adapters. No Safari UI,real provider,physical iPhone/Quest or deployed middleware acceptance."]
    }
}
