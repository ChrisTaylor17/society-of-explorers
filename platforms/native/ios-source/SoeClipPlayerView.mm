#import "SoeClipPlayerView.h"
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>
#import <react/renderer/components/SoeMemberSpecs/ComponentDescriptors.h>
#import <react/renderer/components/SoeMemberSpecs/EventEmitters.h>
#import <react/renderer/components/SoeMemberSpecs/Props.h>

using namespace facebook::react;

static void *SoeClipStatusContext = &SoeClipStatusContext;

static NSURL *SoeClipURL(NSString *clipId) {
  NSString *resource = nil;
  if ([clipId isEqualToString:@"how-a-circle-works"]) resource = @"soe_circle_intro";
  if ([clipId isEqualToString:@"night-sky-traffic"]) resource = @"soe_night_sky";
  if ([clipId isEqualToString:@"telescope-first-tilt"]) resource = @"soe_elt_tilt";
  if ([clipId isEqualToString:@"which-height"]) resource = @"soe_which_height";
  if (!resource) return nil;
  NSBundle *host = [NSBundle bundleForClass:SoeClipPlayerView.class];
  NSURL *bundleURL = [host URLForResource:@"SoeClipAssets" withExtension:@"bundle"]
    ?: [NSBundle.mainBundle URLForResource:@"SoeClipAssets" withExtension:@"bundle"];
  NSBundle *bundle = bundleURL ? [NSBundle bundleWithURL:bundleURL] : nil;
  NSURL *url = [bundle URLForResource:resource withExtension:@"mp4"];
  return url.isFileURL ? url : nil;
}

@implementation SoeClipPlayerView {
  NSString *_clipId, *_requestKey, *_attemptedKey, *_phase;
  AVPlayerItem *_item;
  AVPlayer *_player;
  AVPlayerLayer *_playerLayer;
  BOOL _playing, _suspended;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider {
  return concreteComponentDescriptorProvider<SoeClipPlayerComponentDescriptor>();
}

- (instancetype)initWithFrame:(CGRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _props = std::make_shared<const SoeClipPlayerProps>();
    self.backgroundColor = UIColor.blackColor;
    _suspended = UIApplication.sharedApplication.applicationState != UIApplicationStateActive;
    NSNotificationCenter *notifications = NSNotificationCenter.defaultCenter;
    [notifications addObserver:self selector:@selector(suspend) name:UIApplicationWillResignActiveNotification object:nil];
    [notifications addObserver:self selector:@selector(resume) name:UIApplicationDidBecomeActiveNotification object:nil];
    [notifications addObserver:self selector:@selector(finished:) name:AVPlayerItemDidPlayToEndTimeNotification object:nil];
    [notifications addObserver:self selector:@selector(finished:) name:AVPlayerItemFailedToPlayToEndTimeNotification object:nil];
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps {
  const auto &value = *std::static_pointer_cast<SoeClipPlayerProps const>(props);
  NSString *clipId = [NSString stringWithUTF8String:value.clipId.c_str()];
  NSString *key = [NSString stringWithUTF8String:value.requestKey.c_str()];
  if (![_clipId isEqualToString:clipId] || ![_requestKey isEqualToString:key]) [self clearPlayer];
  _clipId = clipId;
  _requestKey = key;
  _playing = value.playing;
  [super updateProps:props oldProps:oldProps];
  [self updatePlayback];
}

- (void)updatePlayback {
  if (_suspended || !self.window) return;
  if (_item) {
    if (_item.status == AVPlayerItemStatusFailed) {
      [self clearPlayer];
      [self emit:@"unavailable"];
    } else if (_item.status == AVPlayerItemStatusReadyToPlay && ![_phase isEqualToString:@"ended"]) {
      if (_playing) [_player play]; else [_player pause];
      [self emit:_playing ? @"playing" : @"paused"];
    }
    return;
  }
  if (!_playing || [_attemptedKey isEqualToString:_requestKey] || _requestKey.length == 0 || _requestKey.length > 128
      || [_requestKey rangeOfString:@"[^A-Za-z0-9_-]" options:NSRegularExpressionSearch].location != NSNotFound) return;
  _attemptedKey = [_requestKey copy];
  NSURL *url = SoeClipURL(_clipId);
  if (!url) { [self emit:@"unavailable"]; return; }
  _item = [AVPlayerItem playerItemWithURL:url];
  _player = [AVPlayer playerWithPlayerItem:_item];
  _player.muted = YES;
  _playerLayer = [AVPlayerLayer playerLayerWithPlayer:_player];
  _playerLayer.videoGravity = AVLayerVideoGravityResizeAspect;
  _playerLayer.frame = self.bounds;
  [self.layer addSublayer:_playerLayer];
  [_item addObserver:self forKeyPath:@"status" options:NSKeyValueObservingOptionNew context:SoeClipStatusContext];
  [self emit:@"loading"];
  if (_item.status != AVPlayerItemStatusUnknown) [self updatePlayback];
}

- (void)observeValueForKeyPath:(NSString *)keyPath ofObject:(id)object
                       change:(NSDictionary<NSKeyValueChangeKey, id> *)change context:(void *)context {
  if (context != SoeClipStatusContext) {
    [super observeValueForKeyPath:keyPath ofObject:object change:change context:context];
    return;
  }
  __weak SoeClipPlayerView *weak = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    SoeClipPlayerView *view = weak;
    if (view && view->_item == object) [view updatePlayback];
  });
}

- (void)finished:(NSNotification *)notification {
  __weak SoeClipPlayerView *weak = self;
  dispatch_async(dispatch_get_main_queue(), ^{
    SoeClipPlayerView *view = weak;
    if (!view || view->_item != notification.object || view->_suspended || !view.window) return;
    if ([notification.name isEqualToString:AVPlayerItemFailedToPlayToEndTimeNotification]) {
      [view clearPlayer];
      [view emit:@"unavailable"];
    } else {
      [view->_player pause];
      [view emit:@"ended"];
    }
  });
}

- (void)emit:(NSString *)phase {
  if ([_phase isEqualToString:phase]) return;
  _phase = phase;
  if (!_eventEmitter || !_requestKey.length) return;
  SoeClipPlayerEventEmitter::OnClipState event;
  event.requestKey = _requestKey.UTF8String;
  event.phase = phase.UTF8String;
  auto emitter = std::static_pointer_cast<const SoeClipPlayerEventEmitter>(_eventEmitter);
  emitter->onClipState(event);
}

- (void)clearPlayer {
  [_item removeObserver:self forKeyPath:@"status" context:SoeClipStatusContext];
  [_player pause];
  [_player replaceCurrentItemWithPlayerItem:nil];
  _playerLayer.player = nil;
  [_playerLayer removeFromSuperlayer];
  _item = nil;
  _player = nil;
  _playerLayer = nil;
  _phase = nil;
}

- (void)retire:(BOOL)notify {
  BOOL hadPlayer = _item != nil;
  if (_requestKey.length) _attemptedKey = [_requestKey copy];
  [self clearPlayer];
  if (notify && hadPlayer) [self emit:@"unavailable"];
}
- (void)suspend { _suspended = YES; [self retire:YES]; }
- (void)resume { _suspended = NO; }
- (void)layoutSubviews { [super layoutSubviews]; _playerLayer.frame = self.bounds; }
- (void)didMoveToWindow { [super didMoveToWindow]; if (self.window) [self updatePlayback]; else [self retire:YES]; }
- (void)prepareForRecycle { [self retire:NO]; _requestKey = nil; _playing = NO; [super prepareForRecycle]; }
- (void)dealloc { [NSNotificationCenter.defaultCenter removeObserver:self]; [self clearPlayer]; }
@end
