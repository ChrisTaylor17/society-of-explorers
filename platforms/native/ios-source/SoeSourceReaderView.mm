#import "SoeSourceReaderView.h"
#import <WebKit/WebKit.h>
#import <CommonCrypto/CommonDigest.h>
#import <react/renderer/components/SoeMemberSpecs/ComponentDescriptors.h>
#import <react/renderer/components/SoeMemberSpecs/EventEmitters.h>
#import <react/renderer/components/SoeMemberSpecs/Props.h>
#import <react/renderer/components/SoeMemberSpecs/RCTComponentViewHelpers.h>

using namespace facebook::react;

static BOOL SRMatches(id value, NSString *pattern) {
  if (![value isKindOfClass:NSString.class]) return NO;
  NSRegularExpression *expression = [NSRegularExpression regularExpressionWithPattern:pattern options:0 error:nil];
  NSTextCheckingResult *match = [expression firstMatchInString:value options:0 range:NSMakeRange(0, [value length])];
  return match && NSEqualRanges(match.range, NSMakeRange(0, [value length]));
}
static BOOL SRKeys(id value, NSArray *keys) {
  return [value isKindOfClass:NSDictionary.class] && [[NSSet setWithArray:[value allKeys]] isEqualToSet:[NSSet setWithArray:keys]];
}
static BOOL SRCount(id value, NSUInteger maximum) {
  return [value isKindOfClass:NSNumber.class] && CFGetTypeID((__bridge CFTypeRef)value) != CFBooleanGetTypeID()
    && [value doubleValue] == [value unsignedIntegerValue] && [value unsignedIntegerValue] > 0 && [value unsignedIntegerValue] <= maximum;
}
static NSString *SRSha(NSData *data) {
  unsigned char digest[CC_SHA256_DIGEST_LENGTH]; CC_SHA256(data.bytes, (CC_LONG)data.length, digest);
  NSMutableString *result = [NSMutableString string];
  for (NSUInteger index = 0; index < CC_SHA256_DIGEST_LENGTH; index++) [result appendFormat:@"%02x", digest[index]];
  return result;
}
static NSString *SROrigin(void) {
  NSString *origin = [NSBundle.mainBundle objectForInfoDictionaryKey:@"SoeReaderOrigin"];
  if (!SRMatches(origin, @"https://[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::[1-9][0-9]{0,4})?") || origin.length > 300) return nil;
  NSURLComponents *url = [NSURLComponents componentsWithString:origin];
  if (!url.host.length || url.user || url.password || url.path.length || url.query || url.fragment || (url.port && (url.port.integerValue < 1 || url.port.integerValue > 65535 || url.port.integerValue == 443))) return nil;
  for (NSString *label in [url.host componentsSeparatedByString:@"."]) if (!label.length || label.length > 63 || [label hasPrefix:@"-"] || [label hasSuffix:@"-"]) return nil;
  return origin;
}
static NSDictionary *SREdition(NSString *book, NSString *pin) {
  if (![@[@"republic", @"meditations", @"genealogy-of-morals", @"apology", @"odyssey", @"divine-comedy", @"hamlet", @"relativity"] containsObject:book]
      || !SRMatches(pin, @"pg-[1-9][0-9]{0,9}-[a-f0-9]{64}")) return nil;
  NSBundle *owner = [NSBundle bundleForClass:SoeSourceReaderView.class];
  NSURL *bundleURL = [owner URLForResource:@"SoeSourceReaderPins" withExtension:@"bundle"] ?: [NSBundle.mainBundle URLForResource:@"SoeSourceReaderPins" withExtension:@"bundle"];
  NSBundle *bundle = bundleURL ? [NSBundle bundleWithURL:bundleURL] : nil;
  NSURL *file = [bundle URLForResource:@"source-reader-catalog" withExtension:@"json"];
  NSNumber *size; if (!file || ![file getResourceValue:&size forKey:NSURLFileSizeKey error:nil] || size.unsignedIntegerValue > 262144) return nil;
  NSData *bytes = [NSData dataWithContentsOfURL:file options:0 error:nil];
  if (!bytes.length || bytes.length > 262144) return nil;
  id catalog = [NSJSONSerialization JSONObjectWithData:bytes options:0 error:nil];
  if (!SRKeys(catalog, @[@"schemaVersion", @"derivativeVersion", @"editions"]) || ![catalog[@"schemaVersion"] isEqual:@1]
      || ![catalog[@"derivativeVersion"] isEqual:@"source-reader-v1"] || ![catalog[@"editions"] isKindOfClass:NSArray.class] || [catalog[@"editions"] count] != 8) return nil;
  NSDictionary *entry = nil;
  for (id candidate in catalog[@"editions"]) if ([candidate isKindOfClass:NSDictionary.class] && [candidate[@"bookId"] isEqual:book]) { if (entry) return nil; entry = candidate; }
  if (!SRKeys(entry, @[@"bookId", @"editionId", @"sourceDocumentSha256", @"documentSha256", @"documentBytes", @"blockCount", @"anchorOverrides", @"assets"])
      || ![entry[@"editionId"] isEqual:pin] || !SRMatches(entry[@"sourceDocumentSha256"], @"[a-f0-9]{64}") || !SRMatches(entry[@"documentSha256"], @"[a-f0-9]{64}")
      || !SRCount(entry[@"documentBytes"], 2097152) || !SRCount(entry[@"blockCount"], 100000) || ![entry[@"anchorOverrides"] isKindOfClass:NSDictionary.class]
      || ![entry[@"assets"] isKindOfClass:NSArray.class] || [entry[@"assets"] count] > 256) return nil;
  NSMutableSet *anchors = [NSMutableSet set];
  for (NSString *index in entry[@"anchorOverrides"]) {
    NSString *anchor = entry[@"anchorOverrides"][index];
    if (!SRMatches(index, @"0|[1-9][0-9]{0,5}") || index.integerValue >= [entry[@"blockCount"] integerValue]
        || !SRMatches(anchor, @"[A-Za-z0-9][A-Za-z0-9_.:-]*") || anchor.length > 200 || SRMatches(anchor, @"soe-reading-position-[0-9]+") || [anchors containsObject:anchor]) return nil;
    [anchors addObject:anchor];
  }
  NSUInteger total = [entry[@"documentBytes"] unsignedIntegerValue]; NSMutableSet *paths = [NSMutableSet set];
  for (id asset in entry[@"assets"]) {
    if (!SRKeys(asset, @[@"path", @"sha256", @"bytes", @"mime"]) || !SRMatches(asset[@"path"], @"[A-Za-z0-9_./-]+") || [asset[@"path"] length] > 300
        || !SRMatches(asset[@"sha256"], @"[a-f0-9]{64}") || !SRCount(asset[@"bytes"], 524288) || ![@[@"image/png", @"image/jpeg", @"image/gif", @"image/webp"] containsObject:asset[@"mime"]]
        || [paths containsObject:asset[@"path"]]) return nil;
    for (NSString *part in [asset[@"path"] componentsSeparatedByString:@"/"]) if (!part.length || [part isEqual:@"."] || [part isEqual:@".."]) return nil;
    [paths addObject:asset[@"path"]]; total += [asset[@"bytes"] unsignedIntegerValue]; if (total > 33554432) return nil;
  }
  return entry;
}

/** The resource loader is wholly separate from account storage and provider
 * transport. It preloads one bounded manifest and never forwards WebKit headers. */
@interface SoeReaderResources : NSObject <NSURLSessionDataDelegate, WKURLSchemeHandler>
@property(nonatomic, readonly) NSDictionary *resources;
- (instancetype)initWithEdition:(NSDictionary *)edition origin:(NSString *)origin failure:(dispatch_block_t)failure;
- (void)prepare:(dispatch_block_t)ready;
- (void)close;
@end
@implementation SoeReaderResources {
  NSURLSession *_network;
  NSString *_origin;
  NSDictionary *_resources;
  NSMutableDictionary<NSNumber *, NSMutableDictionary *> *_tasks;
  NSMutableDictionary<NSString *, NSData *> *_verified;
  dispatch_block_t _failure, _ready;
  BOOL _closed, _prepared;
}
- (instancetype)initWithEdition:(NSDictionary *)edition origin:(NSString *)origin failure:(dispatch_block_t)failure {
  if ((self = [super init])) {
    _origin = origin; _failure = [failure copy]; _tasks = [NSMutableDictionary dictionary]; _verified = [NSMutableDictionary dictionary];
    NSString *book = edition[@"bookId"], *pin = edition[@"editionId"];
    NSMutableDictionary *resources = [NSMutableDictionary dictionary];
    NSString *path = [NSString stringWithFormat:@"/api/great-books/edition/%@/reader?edition=%@", book, pin];
    resources[path] = @{@"sha256":edition[@"documentSha256"], @"bytes":edition[@"documentBytes"], @"mime":@"text/html"};
    for (NSDictionary *asset in edition[@"assets"]) resources[[NSString stringWithFormat:@"/api/great-books/edition/%@/assets/%@?sha=%@", book, asset[@"path"], asset[@"sha256"]]] = asset;
    _resources = [resources copy];
    NSURLSessionConfiguration *config = NSURLSessionConfiguration.ephemeralSessionConfiguration;
    config.HTTPCookieStorage = nil; config.HTTPShouldSetCookies = NO; config.URLCredentialStorage = nil; config.URLCache = nil;
    config.requestCachePolicy = NSURLRequestReloadIgnoringLocalCacheData; config.timeoutIntervalForRequest = 30; config.timeoutIntervalForResource = 120;
    config.HTTPMaximumConnectionsPerHost = 4;
    NSOperationQueue *queue = [NSOperationQueue new]; queue.maxConcurrentOperationCount = 1;
    _network = [NSURLSession sessionWithConfiguration:config delegate:self delegateQueue:queue];
  }
  return self;
}
- (NSDictionary *)resources { return _resources; }
- (void)prepare:(dispatch_block_t)ready {
  @synchronized(self) {
    if (_closed || _ready) return; _ready = [ready copy];
    for (NSString *path in _resources) {
      NSMutableURLRequest *request = [NSMutableURLRequest requestWithURL:[NSURL URLWithString:[_origin stringByAppendingString:path]] cachePolicy:NSURLRequestReloadIgnoringLocalCacheData timeoutInterval:30];
      request.HTTPMethod = @"GET"; request.HTTPShouldHandleCookies = NO;
      [request setValue:@"no-store" forHTTPHeaderField:@"Cache-Control"]; [request setValue:@"no-cache" forHTTPHeaderField:@"Pragma"];
      [request setValue:@"identity" forHTTPHeaderField:@"Accept-Encoding"];
      NSURLSessionDataTask *task = [_network dataTaskWithRequest:request];
      _tasks[@(task.taskIdentifier)] = [@{@"path":path, @"data":[NSMutableData data], @"accepted":@NO} mutableCopy];
      [task resume];
    }
  }
  __weak SoeReaderResources *weak = self;
  dispatch_after(dispatch_time(DISPATCH_TIME_NOW, 120 * NSEC_PER_SEC), dispatch_get_main_queue(), ^{
    SoeReaderResources *strong = weak; if (!strong) return;
    @synchronized(strong) { if (!strong->_closed && !strong->_prepared) [strong fail]; }
  });
}
- (void)fail {
  dispatch_block_t failed;
  @synchronized(self) { if (_closed) return; failed = _failure; [self close]; }
  if (failed) dispatch_async(dispatch_get_main_queue(), failed);
}
- (void)close {
  @synchronized(self) {
    if (_closed) return; _closed = YES; _ready = nil; _failure = nil;
    [_network invalidateAndCancel]; _network = nil; [_tasks removeAllObjects]; [_verified removeAllObjects];
  }
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request completionHandler:(void (^)(NSURLRequest *))completionHandler {
  completionHandler(nil); [task cancel]; [self fail];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didReceiveChallenge:(NSURLAuthenticationChallenge *)challenge completionHandler:(void (^)(NSURLSessionAuthChallengeDisposition, NSURLCredential *))completionHandler {
  if ([challenge.protectionSpace.authenticationMethod isEqual:NSURLAuthenticationMethodServerTrust]) completionHandler(NSURLSessionAuthChallengePerformDefaultHandling, nil);
  else { completionHandler(NSURLSessionAuthChallengeCancelAuthenticationChallenge, nil); [self fail]; }
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveResponse:(NSURLResponse *)response completionHandler:(void (^)(NSURLSessionResponseDisposition))completionHandler {
  BOOL accepted = NO;
  @synchronized(self) {
    NSMutableDictionary *record = _tasks[@(task.taskIdentifier)]; NSDictionary *pin = record ? _resources[record[@"path"]] : nil;
    if (!_closed && record && [response isKindOfClass:NSHTTPURLResponse.class]) {
      NSHTTPURLResponse *http = (NSHTTPURLResponse *)response;
      NSString *encoding = [http valueForHTTPHeaderField:@"Content-Encoding"];
      accepted = http.statusCode == 200 && [http.URL.absoluteString isEqual:[_origin stringByAppendingString:record[@"path"]]]
        && (!encoding || [encoding isEqual:@"identity"])
        && [http.MIMEType isEqual:pin[@"mime"]] && (http.expectedContentLength == NSURLResponseUnknownLength || http.expectedContentLength == [pin[@"bytes"] longLongValue]);
      record[@"accepted"] = @(accepted);
    }
  }
  completionHandler(accepted ? NSURLSessionResponseAllow : NSURLSessionResponseCancel); if (!accepted) [self fail];
}
- (void)URLSession:(NSURLSession *)session dataTask:(NSURLSessionDataTask *)task didReceiveData:(NSData *)data {
  BOOL accepted = NO;
  @synchronized(self) {
    NSMutableDictionary *record = _tasks[@(task.taskIdentifier)]; NSMutableData *buffer = record[@"data"];
    NSUInteger maximum = record ? [_resources[record[@"path"]][@"bytes"] unsignedIntegerValue] : 0;
    accepted = !_closed && [record[@"accepted"] boolValue] && buffer.length + data.length <= maximum;
    if (accepted) [buffer appendData:data];
  }
  if (!accepted) [self fail];
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  dispatch_block_t ready = nil; BOOL bad = NO;
  @synchronized(self) {
    if (_closed) return;
    NSDictionary *record = _tasks[@(task.taskIdentifier)], *pin = record ? _resources[record[@"path"]] : nil; NSData *data = record[@"data"];
    bad = error || !record || ![record[@"accepted"] boolValue] || data.length != [pin[@"bytes"] unsignedIntegerValue] || ![SRSha(data) isEqual:pin[@"sha256"]];
    if (!bad) {
      _verified[record[@"path"]] = [data copy]; [_tasks removeObjectForKey:@(task.taskIdentifier)];
      if (_tasks.count == 0 && _verified.count == _resources.count) { _prepared = YES; ready = _ready; _ready = nil; [_network finishTasksAndInvalidate]; _network = nil; }
    }
  }
  if (bad) [self fail]; else if (ready) dispatch_async(dispatch_get_main_queue(), ready);
}
- (void)webView:(WKWebView *)webView startURLSchemeTask:(id<WKURLSchemeTask>)task {
  @synchronized(self) {
    NSURL *url = task.request.URL; NSURLComponents *parts = [NSURLComponents componentsWithURL:url resolvingAgainstBaseURL:NO];
    NSString *path = [parts.percentEncodedPath stringByAppendingString:parts.percentEncodedQuery ? [@"?" stringByAppendingString:parts.percentEncodedQuery] : @""];
    NSData *data = _verified[path]; NSDictionary *pin = _resources[path];
    if (_closed || !_prepared || ![task.request.HTTPMethod isEqual:@"GET"] || ![parts.scheme isEqual:@"soe-reader"] || ![parts.host isEqual:@"reader.soe.invalid"]
        || parts.port || parts.user || parts.password || !data || task.request.HTTPBody.length) {
      [task didFailWithError:[NSError errorWithDomain:@"SoeReader" code:1 userInfo:nil]]; return;
    }
    // Custom schemes have no system HTTP fallback. CSP additionally excludes
    // all external image/connect/frame destinations and every script source.
    NSHTTPURLResponse *response = [[NSHTTPURLResponse alloc] initWithURL:url statusCode:200 HTTPVersion:@"HTTP/1.1" headerFields:@{
      @"Content-Type":pin[@"mime"], @"Content-Length":[NSString stringWithFormat:@"%lu", (unsigned long)data.length], @"Cache-Control":@"no-store",
      @"Referrer-Policy":@"no-referrer", @"X-Content-Type-Options":@"nosniff",
      @"Content-Security-Policy":@"default-src 'none'; img-src soe-reader:; style-src 'unsafe-inline'; script-src 'none'; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"
    }];
    [task didReceiveResponse:response]; [task didReceiveData:data]; [task didFinish];
  }
}
- (void)webView:(WKWebView *)webView stopURLSchemeTask:(id<WKURLSchemeTask>)task {
  // Delivery above is synchronous and main-thread serialized; no late task callback.
}
@end

@interface SoeSourceReaderView () <RCTSoeSourceReaderViewProtocol, WKNavigationDelegate>
@end
@implementation SoeSourceReaderView {
  WKWebView *_web;
  SoeReaderResources *_resources;
  NSString *_book, *_edition, *_key, *_attemptedKey, *_page, *_target, *_readyKey;
  NSDictionary *_entry;
  NSInteger _index, _targetIndex;
  NSUInteger _epoch;
  BOOL _active, _suspended, _resourceReady;
}
+ (ComponentDescriptorProvider)componentDescriptorProvider { return concreteComponentDescriptorProvider<SoeSourceReaderComponentDescriptor>(); }
- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _props = std::make_shared<const SoeSourceReaderProps>();
    self.backgroundColor = UIColor.whiteColor;
    _suspended = UIApplication.sharedApplication.applicationState != UIApplicationStateActive;
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(pauseReader) name:UIApplicationWillResignActiveNotification object:nil];
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(resumeReader) name:UIApplicationDidBecomeActiveNotification object:nil];
  }
  return self;
}
- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &value = *std::static_pointer_cast<SoeSourceReaderProps const>(props);
  NSString *book = [NSString stringWithUTF8String:value.bookId.c_str()], *edition = [NSString stringWithUTF8String:value.editionId.c_str()], *key = [NSString stringWithUTF8String:value.requestKey.c_str()];
  BOOL changed = ![_book isEqual:book] || ![_edition isEqual:edition];
  if (changed || !value.active) [self retire:NO];
  _book = book; _edition = edition; _key = key; _index = value.blockIndex; _active = value.active;
  [super updateProps:props oldProps:oldProps];
  [self startReader];
}
- (void)startReader {
  if (_web && [_attemptedKey isEqual:_key] && _targetIndex != _index) { [self retire:NO]; [self emit:@"unavailable" key:_key index:_index]; return; }
  if (!_active || _suspended || !self.window || [_attemptedKey isEqual:_key]) return;
  if (_web) { [self navigateSelection]; return; }
  _attemptedKey = _key; NSUInteger epoch = ++_epoch; NSString *key = _key; NSInteger index = _index;
  NSDictionary *entry = SREdition(_book, _edition); NSString *origin = SROrigin();
  if (!entry || !origin || !SRMatches(key, @"[A-Za-z0-9_-]{1,128}") || index < 0 || index >= [entry[@"blockCount"] integerValue]) { [self emit:@"unavailable" key:key index:index]; return; }
  __weak SoeSourceReaderView *weak = self;
  _resources = [[SoeReaderResources alloc] initWithEdition:entry origin:origin failure:^{
    SoeSourceReaderView *view = weak; if (view && view->_epoch == epoch) { [view retire:NO]; [view emit:@"unavailable" key:view->_key index:view->_index]; }
  }];
  WKWebViewConfiguration *config = [WKWebViewConfiguration new];
  config.websiteDataStore = WKWebsiteDataStore.nonPersistentDataStore;
  config.defaultWebpagePreferences.allowsContentJavaScript = NO;
  config.preferences.javaScriptCanOpenWindowsAutomatically = NO;
  config.dataDetectorTypes = WKDataDetectorTypeNone;
  config.mediaTypesRequiringUserActionForPlayback = WKAudiovisualMediaTypeAll;
  config.userContentController = [WKUserContentController new]; // No scripts/message handlers.
  [config setURLSchemeHandler:_resources forURLScheme:@"soe-reader"];
  _web = [[WKWebView alloc] initWithFrame:self.bounds configuration:config];
  _web.navigationDelegate = self; _web.allowsLinkPreview = NO; _web.allowsBackForwardNavigationGestures = NO;
  [_web addObserver:self forKeyPath:@"URL" options:NSKeyValueObservingOptionNew context:nullptr];
  [_web addObserver:self forKeyPath:@"loading" options:NSKeyValueObservingOptionNew context:nullptr];
  [self addSubview:_web];
  _entry = entry;
  _page = [NSString stringWithFormat:@"soe-reader://reader.soe.invalid/api/great-books/edition/%@/reader?edition=%@", _book, _edition];
  NSString *anchor = entry[@"anchorOverrides"][[NSString stringWithFormat:@"%ld", (long)index]] ?: [NSString stringWithFormat:@"soe-reading-position-%ld", (long)index];
  _target = [NSString stringWithFormat:@"%@#%@", _page, [anchor stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLFragmentAllowedCharacterSet]];
  _targetIndex = index;
  _readyKey = nil;
  [self emit:@"loading" key:key index:index];
  [_resources prepare:^{
    SoeSourceReaderView *view = weak;
    if (view && view->_epoch == epoch && view->_active && !view->_suspended && view.window) {
      view->_resourceReady = YES; [view->_web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:view->_target]]];
    }
  }];
}
- (void)navigateSelection {
  _attemptedKey = _key;
  if (!SRMatches(_key, @"[A-Za-z0-9_-]{1,128}") || _index < 0 || _index >= [_entry[@"blockCount"] integerValue]) {
    [self retire:NO]; [self emit:@"unavailable" key:_key index:_index]; return;
  }
  NSString *anchor = _entry[@"anchorOverrides"][[NSString stringWithFormat:@"%ld", (long)_index]] ?: [NSString stringWithFormat:@"soe-reading-position-%ld", (long)_index];
  _target = [NSString stringWithFormat:@"%@#%@", _page, [anchor stringByAddingPercentEncodingWithAllowedCharacters:NSCharacterSet.URLFragmentAllowedCharacterSet]];
  _targetIndex = _index;
  _readyKey = nil; [self emit:@"loading" key:_key index:_index];
  if (_resourceReady) [_web loadRequest:[NSURLRequest requestWithURL:[NSURL URLWithString:_target]]];
}
- (void)selectedReady {
  if (_web && _active && !_suspended && _resourceReady && _targetIndex == _index && !_web.loading && [_web.URL.absoluteString isEqual:_target] && ![_readyKey isEqual:_key]) {
    _readyKey = _key; [self emit:@"ready" key:_key index:_index];
  }
}
- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object change:(NSDictionary *)change context:(void *)context {
  if (object == _web && ([keyPath isEqual:@"URL"] || [keyPath isEqual:@"loading"])) {
    NSUInteger epoch = _epoch; __weak SoeSourceReaderView *weak = self;
    dispatch_async(dispatch_get_main_queue(), ^{ SoeSourceReaderView *view = weak; if (view && view->_epoch == epoch) [view selectedReady]; });
  } else [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
}
- (void)emit:(NSString *)phase key:(NSString *)key index:(NSInteger)index {
  if (!_eventEmitter || !key) return;
  SoeSourceReaderEventEmitter::OnReaderState value;
  value.requestKey = key.UTF8String; value.phase = phase.UTF8String; value.blockIndex = (int)index;
  std::static_pointer_cast<const SoeSourceReaderEventEmitter>(_eventEmitter)->onReaderState(value);
}
- (void)retire:(BOOL)notify {
  BOOL had = _web != nil; _epoch++; [_resources close]; _resources = nil;
  if (_web) { [_web removeObserver:self forKeyPath:@"URL"]; [_web removeObserver:self forKeyPath:@"loading"]; }
  [_web stopLoading]; _web.navigationDelegate = nil; [_web removeFromSuperview]; _web = nil; _page = nil; _target = nil; _entry = nil; _readyKey = nil; _resourceReady = NO;
  if (notify && had) [self emit:@"unavailable" key:_key index:_index];
}
- (void)pauseReader { _suspended = YES; [self retire:YES]; }
- (void)resumeReader { _suspended = NO; } // Explicit new requestKey, never automatic reload.
- (void)didMoveToWindow { [super didMoveToWindow]; if (!self.window) [self retire:YES]; else [self startReader]; }
- (void)layoutSubviews { [super layoutSubviews]; _web.frame = self.bounds; }
- (void)prepareForRecycle { [self retire:NO]; _active = NO; [super prepareForRecycle]; }
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; [self retire:NO]; }
- (void)webView:(WKWebView *)webView decidePolicyForNavigationAction:(WKNavigationAction *)action decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
  NSString *url = action.request.URL.absoluteString;
  BOOL allow = webView == _web && _active && !_suspended && action.targetFrame.isMainFrame && [action.request.HTTPMethod isEqual:@"GET"]
    && [[url componentsSeparatedByString:@"#"].firstObject isEqual:_page];
  decisionHandler(allow ? WKNavigationActionPolicyAllow : WKNavigationActionPolicyCancel);
}
- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
  if (webView == _web) [self selectedReady];
}
- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error { if (webView == _web) { [self retire:NO]; [self emit:@"unavailable" key:_key index:_index]; } }
- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error { [self webView:webView didFailNavigation:navigation withError:error]; }
- (void)webViewWebContentProcessDidTerminate:(WKWebView *)webView { if (webView == _web) { [self retire:NO]; [self emit:@"unavailable" key:_key index:_index]; } }
@end
