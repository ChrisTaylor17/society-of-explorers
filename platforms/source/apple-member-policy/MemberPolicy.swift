import Foundation
import Security

enum MemberFailure: Error { case unavailable }
enum MemberSlot: String, CaseIterable { case session, pkce, user }

/// Platform-side validation must run before a request receives a bearer header.
struct MemberRequestPolicy {
  let origin: URL
  init(origin value: String) throws {
    guard let c=URLComponents(string:value), c.scheme == "https", let host=c.host, !host.isEmpty,
          c.user == nil, c.password == nil, c.query == nil, c.fragment == nil,
          (c.percentEncodedPath.isEmpty || c.percentEncodedPath == "/"),
          let url=c.url, url.absoluteString == value || url.absoluteString == value+"/" else { throw MemberFailure.unavailable }
    origin=url
  }
  func request(url value:String,method:String,bearer:String,body:String?) throws -> URLRequest {
    guard let c=URLComponents(string:value), c.scheme == "https", c.host == origin.host,
          (c.port ?? 443) == (URLComponents(url:origin,resolvingAgainstBaseURL:false)?.port ?? 443),
          c.user == nil, c.password == nil, c.query == nil, c.fragment == nil,
          c.path == c.percentEncodedPath,
          c.path.range(of:"^/api/book-salons/[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$",options:.regularExpression) != nil,
          (method == "GET" || method == "POST"), !bearer.isEmpty, bearer.utf8.count <= 16384,
          bearer.range(of:"^[A-Za-z0-9._~+/-]+=*$",options:.regularExpression) != nil,
          (method == "GET" ? body == nil : body != nil && body!.utf8.count <= 16384), let url=c.url else { throw MemberFailure.unavailable }
    var request=URLRequest(url:url,cachePolicy:.reloadIgnoringLocalCacheData,timeoutInterval:15)
    request.httpMethod=method;request.setValue("Bearer "+bearer,forHTTPHeaderField:"Authorization")
    if let body { request.httpBody=Data(body.utf8);request.setValue("application/json",forHTTPHeaderField:"Content-Type") }
    return request
  }
  static func ephemeralConfiguration() -> URLSessionConfiguration {
    let c=URLSessionConfiguration.ephemeral;c.httpCookieStorage=nil;c.httpShouldSetCookies=false;c.urlCredentialStorage=nil;c.urlCache=nil;c.requestCachePolicy = .reloadIgnoringLocalCacheData;c.timeoutIntervalForRequest=15;c.timeoutIntervalForResource=15;return c
  }
}
/// Returning nil stops the redirect; a caller must also reject the 3xx result.
final class RejectMemberRedirect: NSObject, URLSessionTaskDelegate, @unchecked Sendable {
  func urlSession(_ session:URLSession, task:URLSessionTask, willPerformHTTPRedirection response:HTTPURLResponse, newRequest request:URLRequest, completionHandler:@escaping (URLRequest?)->Void) { completionHandler(nil) }
}
protocol MemberKeychainBackend {
  func read(service:String,account:String) throws -> Data?
  func write(service:String,account:String,data:Data) throws
  func remove(service:String,account:String) throws
}
/// Concrete OS backend. Tests inject a fake; no Keychain function is called by tests.
struct SystemMemberKeychain: MemberKeychainBackend {
  private func base(_ service:String,_ account:String)->[String:Any] { [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:service,kSecAttrAccount as String:account,kSecAttrSynchronizable as String:kCFBooleanFalse!] }
  func read(service:String,account:String)throws -> Data? {
    var q=base(service,account);q[kSecReturnData as String]=kCFBooleanTrue;q[kSecReturnAttributes as String]=kCFBooleanTrue;q[kSecMatchLimit as String]=kSecMatchLimitOne
    var result:CFTypeRef?;let status=SecItemCopyMatching(q as CFDictionary,&result)
    if status==errSecItemNotFound{return nil};guard status==errSecSuccess,let item=result as? [String:Any],let data=item[kSecValueData as String] as? Data,let accessibility=item[kSecAttrAccessible as String],CFEqual(accessibility as CFTypeRef,kSecAttrAccessibleWhenUnlockedThisDeviceOnly) else {throw MemberFailure.unavailable};return data
  }
  func write(service:String,account:String,data:Data)throws {
    let q=base(service,account);let fields:[String:Any]=[kSecValueData as String:data,kSecAttrAccessible as String:kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
    let result=SecItemUpdate(q as CFDictionary,fields as CFDictionary);if result==errSecSuccess{return};guard result==errSecItemNotFound else {throw MemberFailure.unavailable}
    var item=q;fields.forEach{item[$0.key]=$0.value};guard SecItemAdd(item as CFDictionary,nil)==errSecSuccess else {throw MemberFailure.unavailable}
  }
  func remove(service:String,account:String)throws {let status=SecItemDelete(base(service,account) as CFDictionary);guard status==errSecSuccess || status==errSecItemNotFound else {throw MemberFailure.unavailable}}
}
/// Serializes this store instance; application integration must use one owner.
final class MemberKeychainStore {
  private let lock=NSLock(),service:String,backend:MemberKeychainBackend
  init(appID:String,origin:String,backend:MemberKeychainBackend)throws {
    guard !appID.isEmpty,appID.utf8.count<=255 else {throw MemberFailure.unavailable};_ = try MemberRequestPolicy(origin:origin)
    self.service=appID+".soe.member.v1|"+origin;self.backend=backend
  }
  func read(_ slot:MemberSlot)throws -> String? {lock.lock();defer{lock.unlock()};do {guard let data=try backend.read(service:service,account:slot.rawValue) else{return nil};guard data.count<=65536,let s=String(data:data,encoding:.utf8) else {throw MemberFailure.unavailable};return s}catch{throw MemberFailure.unavailable}}
  func write(_ slot:MemberSlot,_ value:String)throws {lock.lock();defer{lock.unlock()};let data=Data(value.utf8);guard data.count<=65536 else {throw MemberFailure.unavailable};do{try backend.write(service:service,account:slot.rawValue,data:data)}catch{throw MemberFailure.unavailable}}
  func remove(_ slot:MemberSlot)throws {lock.lock();defer{lock.unlock()};do{try backend.remove(service:service,account:slot.rawValue)}catch{throw MemberFailure.unavailable}}
}
