#import "NativeSoeMemberIOS.h"
#if __has_include("SoeMember-Swift.h")
#import "SoeMember-Swift.h"
#else
#import <SoeMember/SoeMember-Swift.h>
#endif

typedef void (^SoeMemberAdapterCompletion)(id _Nullable value, BOOL success);
typedef void (^SoeMemberAdapterWork)(SoeMemberBridge *bridge, SoeMemberAdapterCompletion completion);

static void SoeMemberAdapterReject(RCTPromiseRejectBlock reject)
{
  // Neither native errors nor request/account values cross the failure boundary.
  reject(@"E_SOE_MEMBER_UNAVAILABLE", @"Member operation unavailable.", nil);
}

@implementation NativeSoeMemberIOS {
  SoeMemberBridge *_memberBridge;
  id _connectivityObserver;
  BOOL _initialized;
  BOOL _invalidated;
}

+ (NSString *)moduleName { return @"NativeSoeMember"; }
+ (BOOL)requiresMainQueueSetup { return YES; }

- (void)initialize
{
  @synchronized(self) {
    if (_initialized || _invalidated) return;
    _initialized = YES;
    // The host owns configuration and account authority across React reloads.
    _memberBridge = [SoeMemberIOSHost attachBridge];
    if (!_memberBridge) return;
    __weak NativeSoeMemberIOS *weakSelf = self;
    _connectivityObserver = [[NSNotificationCenter defaultCenter]
        addObserverForName:@"SoeMemberBridgeConnectivityDidChange"
                    object:_memberBridge
                     queue:[NSOperationQueue mainQueue]
                usingBlock:^(NSNotification *note) {
      NativeSoeMemberIOS *strongSelf = weakSelf;
      if (!strongSelf) return;
      @synchronized(strongSelf) {
        if (strongSelf->_invalidated || note.object != strongSelf->_memberBridge) return;
        // Notifications are wake-ups. Never forward a retained historical state.
        NSString *state = [strongSelf->_memberBridge getConnectivitySnapshot];
        [strongSelf emitOnConnectivityChange:@{@"state": state}];
      }
    }];
  }
}

- (void)setEventEmitterCallback:(EventEmitterCallbackWrapper *)callback
{
  // Codegen's base setter and emit method do not synchronize each other.
  @synchronized(self) {
    if (!_invalidated) [super setEventEmitterCallback:callback];
  }
}

- (void)invalidate
{
  SoeMemberBridge *bridge;
  id observer;
  @synchronized(self) {
    if (_invalidated) return;
    _invalidated = YES;
    bridge = _memberBridge;
    observer = _connectivityObserver;
    _memberBridge = nil;
    _connectivityObserver = nil;
    _eventEmitterCallback = {};
  }
  if (observer) [[NSNotificationCenter defaultCenter] removeObserver:observer];
  if (bridge) {
    // Retire immediately even when React invalidates on its module queue.
    [bridge invalidate];
    [SoeMemberIOSHost detachBridge:bridge];
  }
}

- (void)dealloc { [self invalidate]; }

- (void)withBridge:(RCTPromiseResolveBlock)resolve
            reject:(RCTPromiseRejectBlock)reject
              work:(SoeMemberAdapterWork)work
{
  SoeMemberBridge *bridge;
  @synchronized(self) {
    bridge = _invalidated ? nil : _memberBridge;
  }
  if (!bridge) { SoeMemberAdapterReject(reject); return; }
  __weak NativeSoeMemberIOS *weakSelf = self;
  NSObject *settlementLock = [NSObject new];
  __block BOOL settled = NO;
  work(bridge, ^(id value, BOOL success) {
    @synchronized(settlementLock) {
      if (settled) return;
      settled = YES;
    }
    NativeSoeMemberIOS *strongSelf = weakSelf;
    BOOL current = NO;
    if (strongSelf) {
      @synchronized(strongSelf) {
        current = !strongSelf->_invalidated && strongSelf->_memberBridge == bridge;
      }
    }
    // Admission is sampled immediately before delivery; callbacks run unlocked.
    if (current && success) resolve(value ?: [NSNull null]);
    else SoeMemberAdapterReject(reject);
  });
}

- (void)capabilities:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge capabilitiesWithCompletion:done];
  }];
}

- (void)begin:(NSString *)generation resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge beginWithGeneration:generation completion:done];
  }];
}

- (void)newRequestId:(NSString *)generation resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge newRequestIdWithGeneration:generation completion:done];
  }];
}

- (void)send:(NSString *)identifier request:(JS::NativeSoeMember::MemberRequest &)request
     resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *url = request.url(), *method = request.method(), *bearer = request.bearer(), *body = request.body();
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge sendWithId:identifier url:url method:method bearer:bearer body:body completion:done];
  }];
}

- (void)sendReview:(NSString *)identifier request:(JS::NativeSoeMember::MemberRequest &)request
           resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *url = request.url(), *method = request.method(), *bearer = request.bearer(), *body = request.body();
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge sendReviewWithId:identifier url:url method:method bearer:bearer body:body completion:done];
  }];
}

- (void)sendCircleReview:(NSString *)identifier request:(JS::NativeSoeMember::MemberRequest &)request
                 resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *url = request.url(), *method = request.method(), *bearer = request.bearer(), *body = request.body();
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge sendCircleReviewWithId:identifier url:url method:method bearer:bearer body:body completion:done];
  }];
}

- (void)sendAuth:(NSString *)identifier request:(JS::NativeSoeMember::AuthRequest &)request
         resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *url = request.url(), *method = request.method(), *bearer = request.bearer(), *body = request.body();
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge sendAuthWithId:identifier url:url method:method bearer:bearer body:body completion:done];
  }];
}

- (void)sendEmailAuth:(NSString *)identifier request:(JS::NativeSoeMember::EmailRequest &)request
              resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *flowId = request.flowId(), *url = request.url(), *method = request.method();
  NSString *bearer = request.bearer(), *body = request.body();
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge sendEmailAuthWithId:identifier flowId:flowId url:url method:method bearer:bearer body:body completion:done];
  }];
}

- (void)sendPublic:(NSString *)identifier request:(JS::NativeSoeMember::PublicRequest &)request
           resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  NSString *url = request.url(), *method = request.method();
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge sendPublicWithId:identifier url:url method:method completion:done];
  }];
}

- (void)prepareEmailLink:(NSString *)generation purpose:(NSString *)purpose email:(NSString *)email
                 resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge prepareEmailLinkWithGeneration:generation purpose:purpose email:email completion:done];
  }];
}

- (void)pendingEmailLink:(NSString *)generation resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge pendingEmailLinkWithGeneration:generation completion:done];
  }];
}

- (void)claimEmailLink:(NSString *)generation flowId:(NSString *)flowId
               resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge claimEmailLinkWithGeneration:generation flowId:flowId completion:done];
  }];
}

- (void)discardEmailLink:(NSString *)generation flowId:(NSString *)flowId
                 resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge discardEmailLinkWithGeneration:generation flowId:flowId completion:done];
  }];
}

- (void)cancel:(NSString *)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge cancelWithId:identifier completion:done];
  }];
}

- (void)read:(NSString *)slot generation:(NSString *)generation
     resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge readWithSlot:slot generation:generation completion:done];
  }];
}

- (void)write:(NSString *)slot value:(NSString *)value generation:(NSString *)generation
      resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge writeWithSlot:slot value:value generation:generation completion:done];
  }];
}

- (void)remove:(NSString *)slot generation:(NSString *)generation
       resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge removeWithSlot:slot generation:generation completion:done];
  }];
}

- (void)resetAccountStorage:(NSString *)expectedGeneration
                    resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
  [self withBridge:resolve reject:reject work:^(SoeMemberBridge *bridge, SoeMemberAdapterCompletion done) {
    [bridge resetAccountStorageWithExpectedGeneration:expectedGeneration completion:done];
  }];
}

- (NSString *)getConnectivitySnapshot
{
  @synchronized(self) {
    return _invalidated || !_memberBridge ? @"unknown" : [_memberBridge getConnectivitySnapshot];
  }
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeSoeMemberSpecJSI>(params);
}

@end
