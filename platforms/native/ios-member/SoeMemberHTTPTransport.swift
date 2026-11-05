import Foundation

protocol SoeMemberHTTPTask: Sendable {
    func resume()
    func cancel()
}

protocol SoeMemberHTTPTransport: Sendable {
    func makeTask(request: URLRequest, timeout: TimeInterval,
                  completion: @escaping @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void) throws -> any SoeMemberHTTPTask
}

/// One application task per authority lease. NSURLSession owns lower-level
/// connection behavior. Device transport acceptance must observe that behavior.
struct SoeMemberEphemeralTransport: SoeMemberHTTPTransport {
    func makeTask(request: URLRequest, timeout: TimeInterval,
                  completion: @escaping @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void) throws -> any SoeMemberHTTPTask {
        guard let url = request.url, url.scheme == "https", url.user == nil, url.password == nil,
              request.value(forHTTPHeaderField: "Cookie") == nil, request.httpBodyStream == nil,
              timeout.isFinite, timeout > 0, timeout <= 15 else {
            throw SoeMemberCoreError.unavailable
        }
        return SoeMemberURLSessionTransfer(request: request, exactURL: url.absoluteString,
                                           timeout: timeout, completion: completion)
    }
}

/// Accumulates only bounded, exact-response data. Used by the actual delegate
/// and by deterministic response fixtures without a network connection.
struct SoeMemberHTTPBody {
    let exactURL: String
    private var status: Int?
    private var body = Data()

    init(exactURL: String) {
        self.exactURL = exactURL
    }

    mutating func accept(_ response: URLResponse) throws {
        guard status == nil, let http = response as? HTTPURLResponse,
              let actualURL = http.url?.absoluteString, actualURL.utf8.elementsEqual(exactURL.utf8),
              (200...599).contains(http.statusCode), !(300..<400).contains(http.statusCode),
              response.expectedContentLength <= Int64(SoeMemberWireResponse.maximumBytes) else {
            throw SoeMemberCoreError.unavailable
        }
        status = http.statusCode
    }

    mutating func append(_ bytes: Data) throws {
        guard status != nil, bytes.count <= SoeMemberWireResponse.maximumBytes - body.count else {
            throw SoeMemberCoreError.unavailable
        }
        body.append(bytes)
    }

    func response() throws -> SoeMemberWireResponse {
        guard let status, let text = String(data: body, encoding: .utf8) else {
            throw SoeMemberCoreError.unavailable
        }
        return SoeMemberWireResponse(status: status, url: exactURL, body: text, redirected: false)
    }
}

private final class SoeMemberURLSessionTransfer: NSObject, URLSessionDataDelegate, SoeMemberHTTPTask, @unchecked Sendable {
    typealias Completion = @Sendable (Result<SoeMemberWireResponse, SoeMemberCoreError>) -> Void

    private let lock = NSLock()
    private var session: URLSession?
    private var task: URLSessionDataTask?
    private var completion: Completion?
    private var started = false
    private var body: SoeMemberHTTPBody

    init(request: URLRequest, exactURL: String, timeout: TimeInterval, completion: @escaping Completion) {
        self.body = SoeMemberHTTPBody(exactURL: exactURL)
        self.completion = completion
        super.init()

        let configuration = URLSessionConfiguration.ephemeral
        configuration.httpCookieStorage = nil
        configuration.httpCookieAcceptPolicy = .never
        configuration.httpShouldSetCookies = false
        configuration.urlCredentialStorage = nil
        configuration.urlCache = nil
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        configuration.waitsForConnectivity = false
        configuration.timeoutIntervalForRequest = timeout
        configuration.timeoutIntervalForResource = timeout

        var request = request
        request.httpShouldHandleCookies = false
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = timeout
        let queue = OperationQueue()
        queue.maxConcurrentOperationCount = 1
        let session = URLSession(configuration: configuration, delegate: self, delegateQueue: queue)
        self.session = session
        self.task = session.dataTask(with: request)
    }

    func resume() {
        lock.withLock {
            guard let task, completion != nil, !started else { return }
            started = true
            task.resume()
        }
    }

    func cancel() {
        finish(.failure(.unavailable))
    }

    func urlSession(_ session: URLSession, task: URLSessionTask,
                    willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest,
                    completionHandler: @escaping @Sendable (URLRequest?) -> Void) {
        completionHandler(nil)
        finish(.failure(.unavailable))
    }

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        check(challenge, completionHandler: completionHandler)
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didReceive challenge: URLAuthenticationChallenge,
                    completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        check(challenge, completionHandler: completionHandler)
    }

    private func check(_ challenge: URLAuthenticationChallenge,
                       completionHandler: @escaping @Sendable (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        if challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
           !challenge.protectionSpace.isProxy() {
            completionHandler(.performDefaultHandling, nil)
        } else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            finish(.failure(.unavailable))
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive response: URLResponse,
                    completionHandler: @escaping @Sendable (URLSession.ResponseDisposition) -> Void) {
        do {
            try lock.withLock {
                guard completion != nil else { throw SoeMemberCoreError.unavailable }
                try body.accept(response)
            }
            completionHandler(.allow)
        } catch {
            completionHandler(.cancel)
            finish(.failure(.unavailable))
        }
    }

    func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        do {
            try lock.withLock {
                guard completion != nil else { throw SoeMemberCoreError.unavailable }
                try body.append(data)
            }
        } catch {
            finish(.failure(.unavailable))
        }
    }

    func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: (any Error)?) {
        guard error == nil, let response = lock.withLock({ try? body.response() }) else {
            finish(.failure(.unavailable))
            return
        }
        finish(.success(response))
    }

    private func finish(_ result: Result<SoeMemberWireResponse, SoeMemberCoreError>) {
        let effects = lock.withLock { () -> (URLSession?, Completion)? in
            guard let completion else { return nil }
            let session = self.session
            self.completion = nil
            self.session = nil
            self.task = nil
            self.body = SoeMemberHTTPBody(exactURL: body.exactURL)
            return (session, completion)
        }
        guard let (session, completion) = effects else { return }
        session?.invalidateAndCancel()
        completion(result)
    }
}
