import AppKit
import Foundation
import WebKit

private struct Ready: Decodable { let origin: URL; let buildId: String; let status: String }
private struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ value: String) { description = value }
}

@MainActor
private final class Reader: NSObject, WKNavigationDelegate {
    let view: WKWebView
    let origin: URL
    private var navigation: CheckedContinuation<Void, Error>?
    init(origin: URL, rules: WKContentRuleList) {
        self.origin = origin
        let config = WKWebViewConfiguration()
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        config.userContentController.add(rules)
        config.userContentController.addUserScript(WKUserScript(source: """
            window.__fellowshipErrors=[];window.__fellowshipExternal=[];
            window.addEventListener('error',e=>window.__fellowshipErrors.push(String(e.message)));
            window.addEventListener('unhandledrejection',e=>window.__fellowshipErrors.push(String(e.reason)));
            const realFetch=window.fetch;
            window.fetch=function(input,...args){
              const raw=typeof input==='string'?input:input instanceof URL?input.href:input?.url;
              const target=new URL(raw,location.href);
              if(target.origin!==location.origin||target.pathname.startsWith('/api/')){
                window.__fellowshipExternal.push(target.origin+target.pathname);
                return Promise.reject(Error('Public research fixture blocks this request'));
              }
              return realFetch.call(this,input,...args);
            };
            """, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        view = WKWebView(frame: NSRect(x: 0, y: 0, width: 1280, height: 960), configuration: config)
        super.init()
        view.navigationDelegate = self
    }
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        let url = action.request.url
        decisionHandler(action.targetFrame?.isMainFrame == true && url?.scheme == origin.scheme && url?.host == origin.host && url?.port == origin.port ? .allow : .cancel)
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { finish(nil) }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(error) }
    private func finish(_ error: Error?) {
        let current = navigation; navigation = nil
        if let error { current?.resume(throwing: error) } else { current?.resume() }
    }
    func load(_ path: String) async throws {
        let url = URL(string: path, relativeTo: origin)!
        try await withCheckedThrowingContinuation { navigation = $0; view.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData)) }
    }
    func expect(_ source: String, _ message: String) async throws {
        for _ in 0..<130 {
            if try await view.evaluateJavaScript("Boolean(" + source + ")") as? Bool == true { return }
            try await Task.sleep(for: .milliseconds(60))
        }
        throw Failure(message)
    }
    func act(_ source: String, _ args: [String: Any] = [:]) async throws {
        _ = try await view.callAsyncJavaScript(source + ";await new Promise(r=>setTimeout(r,0));return true;", arguments: args, in: nil, contentWorld: .page)
    }
    func select(_ name: String, _ value: String) async throws {
        try await act("""
            const field=Array.from(document.querySelectorAll('select')).find(e=>e.getAttribute('aria-label')===name);
            if(!field)throw Error('Missing filter');field.value=value;field.dispatchEvent(new Event('change',{bubbles:true}));
            """, ["name": name, "value": value])
    }
    func clean() async throws {
        try await expect("window.__fellowshipErrors.length===0&&window.__fellowshipExternal.length===0", "Browser script error or forbidden request")
        try await expect("Object.keys(localStorage).length===0&&Object.keys(sessionStorage).length===0&&document.cookie===''", "Research view persisted local input or a cookie")
    }
}

@main
private struct Run {
    @MainActor static func main() async {
        do {
            let result = try await run()
            print(String(decoding: try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys]), as: UTF8.self))
        } catch {
            FileHandle.standardError.write(Data(("WebKit fellowship check failed: " + String(describing: error) + "\n").utf8))
            exit(1)
        }
    }
    @MainActor static func run() async throws -> [String: Any] {
        guard CommandLine.arguments.count == 3 else { throw Failure("Supply owned ready file and private output folder") }
        let ready = try JSONDecoder().decode(Ready.self, from: Data(contentsOf: URL(fileURLWithPath: CommandLine.arguments[1])))
        guard ready.status == "READY", ready.origin.scheme == "http", ready.origin.host == "127.0.0.1", let port = ready.origin.port else { throw Failure("Invalid local fixture") }
        NSApplication.shared.setActivationPolicy(.prohibited)
        guard let store = WKContentRuleListStore(url: URL(fileURLWithPath: CommandLine.arguments[2], isDirectory: true)) else { throw Failure("Rule store unavailable") }
        let rules: [[String: [String: String]]] = [
            ["trigger": ["url-filter": ".*"], "action": ["type": "block"]],
            ["trigger": ["url-filter": "^data:"], "action": ["type": "ignore-previous-rules"]],
            ["trigger": ["url-filter": "^http://127[.]0[.]0[.]1:" + String(port) + "/"], "action": ["type": "ignore-previous-rules"]],
        ]
        guard let list = try await store.compileContentRuleList(forIdentifier: "fellowship-local", encodedContentRuleList: String(decoding: try JSONSerialization.data(withJSONObject: rules), as: UTF8.self)) else { throw Failure("Rule compilation failed") }
        let reader = Reader(origin: ready.origin, rules: list)
        var stories = [String](), layouts = [[String: Int]]()
        try await reader.load("/fellowship")
        try await reader.expect("document.querySelector('h1')?.textContent==='Faith that makes room for honest questions.'", "Fellowship landing did not render")
        try await reader.clean()
        stories.append("The actual compiled fellowship landing renders in an isolated resident macOS WebKit store without private or external requests.")
        for scale in [1, 2, 4] {
            reader.view.pageZoom = CGFloat(scale)
            let width = 1280 / scale
            try await reader.expect("innerWidth===" + String(width) + "&&document.documentElement.scrollWidth<=innerWidth", "Fellowship layout overflows at zoom")
            layouts.append(["pageZoomPercent": scale * 100, "width": width])
        }
        stories.append("The landing fits at actual WebKit page zoom100%,200% and400% with logical widths1280,640 and320.")
        try await reader.load("/fellowship/scripture")
        try await reader.expect("document.querySelectorAll('[data-scripture-verse]').length===330&&document.querySelector('[data-scripture-superscription=psalm-22]')?.textContent.includes('Psalm by David')", "Complete Scripture or superscription missing")
        try await reader.select("Passage family", "isaiah")
        try await reader.expect("Array.from(document.querySelectorAll('[data-claim]')).filter(e=>!e.hidden).length===5", "Scripture filter did not hydrate")
        try await reader.select("Relationship", "comparison")
        try await reader.expect("Array.from(document.querySelectorAll('[data-claim]')).filter(e=>!e.hidden).map(e=>e.dataset.claim).join()==='burial-with-a-rich-man'", "Relationship type not preserved")
        try await reader.act("document.querySelector('[data-claim=burial-with-a-rich-man] details summary').click()")
        try await reader.act("document.querySelector('[data-claim=burial-with-a-rich-man] details a').click()")
        try await reader.expect("document.getElementById('reading-isaiah-53').open===true", "Context link did not disclose the chapter")
        try await reader.clean()
        stories.append("The compiled study hydrates filters,keeps all330 verses and the Psalm superscription,and opens full context from a comparison card.")
        try await reader.select("Passage family", "all"); try await reader.select("Relationship", "all")
        try await reader.act("document.querySelector('[data-analysis-review=cry-of-abandonment] summary').click()")
        try await reader.act("""
            const root=document.querySelector('[data-analysis-review=cry-of-abandonment]'),fields=root.querySelectorAll('textarea');
            for(const [i,value] of [proposal,reason].entries()){
              Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(fields[i],value);
              fields[i].dispatchEvent(new Event('input',{bubbles:true}));
            }
            """, ["proposal": "<img src=x onerror=alert(1)> My local interpretation.", "reason": "Read the final praise in Psalm22."])
        try await reader.expect("Array.from(document.querySelectorAll('[data-analysis-review=cry-of-abandonment] button')).some(b=>b.textContent==='Preview my correction'&&!b.disabled)", "Reasoned correction did not become available")
        try await reader.act("Array.from(document.querySelectorAll('[data-analysis-review=cry-of-abandonment] button')).find(b=>b.textContent==='Preview my correction').click()")
        try await reader.expect("document.querySelector('[aria-label=\"Your local correction preview\"]')?.textContent.includes('<img src=x')&&!document.querySelector('[data-analysis-review=cry-of-abandonment] img')", "Local correction was absent or interpreted as markup")
        try await reader.act("Array.from(document.querySelectorAll('[data-analysis-review=cry-of-abandonment] button')).find(b=>b.textContent==='Reset my correction').click()")
        try await reader.expect("!document.querySelector('[aria-label=\"Your local correction preview\"]')&&document.querySelectorAll('[data-scripture-verse]').length===330", "Correction reset changed Scripture")
        try await reader.clean()
        stories.append("A reasoned correction previews literal text and resets without changing Scripture,storage or cookies. Download behavior is covered separately in Chromium.")
        try await reader.load("/fellowship/research/ancient-jesus-passage")
        try await reader.expect("document.body.innerText.includes('c. 1195; Michael died 1199')&&document.body.innerText.includes('exact dating disputed')&&document.body.innerText.includes('411 CE')", "Qualified manuscript chronology missing")
        try await reader.expect("document.querySelector('[data-received-text]')?.textContent.includes('He was [the] Christ.')&&document.documentElement.scrollWidth<=innerWidth", "Received text or responsive dossier missing")
        try await reader.clean()
        stories.append("The responsive dossier retains Whiston’s disputed wording and separates qualified work dates from the411/462copy witnesses.")
        try await reader.load("/fellowship/manifesto")
        try await reader.expect("document.querySelectorAll('main article>section').length===9&&document.body.innerText.includes('Nobody must pretend to believe')", "Fellowship covenant missing")
        try await reader.clean(); reader.view.stopLoading()
        stories.append("The separate nine-part fellowship covenant remains readable at400% and welcomes respectful disagreement.")
        return ["status": "PASS", "buildId": ready.buildId, "stories": stories, "layouts": layouts,
                "scope": "Actual compiled public frontend in resident macOS WKWebView with isolated nonpersistent data and loopback-only navigation/content/fetch restrictions. DOM actions are automated. No Safari application UI,native mobile app,physical device,provider or live AI acceptance. No download is attempted in this WebKit smoke."]
    }
}
