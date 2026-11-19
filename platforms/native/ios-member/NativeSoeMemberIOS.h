#import <React/RCTInitializing.h>
#import <React/RCTInvalidating.h>
#import <SoeMemberSpecs/SoeMemberSpecs.h>

NS_ASSUME_NONNULL_BEGIN

// RN 0.88 Codegen owns this protocol, event base, and JSI implementation.
@interface NativeSoeMemberIOS : NativeSoeMemberSpecBase <NativeSoeMemberSpec, RCTInitializing, RCTInvalidating>
@end

NS_ASSUME_NONNULL_END
