#!/usr/bin/env python3
"""Bounded source ABI checks; this does not execute Codegen or compile ObjC++."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import stat

ROOT = Path(__file__).resolve().parents[2]
FILES = [
    'platforms/native/package.json',
    'platforms/native/specs/NativeSoeMember.ts',
    'platforms/native/ios-member/NativeSoeMemberIOS.h',
    'platforms/native/ios-member/NativeSoeMemberIOS.mm',
    'platforms/native/ios-member/SoeMemberBridge.swift',
    'platforms/native/package-lock.json',
    'verification/native-ios/member-adapter-source-test.py',
    'platforms/native/ios-member/SoeMemberIOSHost.swift',
    'platforms/native/specs/SoeSourceReaderNativeComponent.ts',
    'platforms/native/specs/SoeClipPlayerNativeComponent.ts',
    'platforms/native/ios-source/SoeSourceReaderView.mm',
    'platforms/native/ios-source/SoeClipPlayerView.mm',
]
PRIMARY_SOURCES = [
    'https://reactnative.dev/docs/the-new-architecture/using-codegen',
    'https://reactnative.dev/docs/the-new-architecture/turbo-modules-with-swift',
    'https://raw.githubusercontent.com/facebook/react-native/v0.88.0/packages/react-native-codegen/src/generators/modules/GenerateModuleObjCpp/index.js',
    'https://raw.githubusercontent.com/facebook/react-native/v0.88.0/packages/react-native-codegen/src/generators/modules/GenerateModuleObjCpp/serializeMethod.js',
    'https://raw.githubusercontent.com/facebook/react-native/v0.88.0/packages/react-native-codegen/src/generators/modules/GenerateModuleObjCpp/header/serializeStructUtils.js',
    'https://raw.githubusercontent.com/facebook/react-native/v0.88.0/packages/react-native-codegen/src/generators/modules/GenerateModuleObjCpp/serializeEventEmitter.js',
    'https://raw.githubusercontent.com/facebook/react-native/v0.88.0/packages/react-native/ReactCommon/react/nativemodule/core/platform/ios/ReactCommon/RCTTurboModuleManager.mm',
]


def read(relative):
    path = ROOT / relative
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or (info.st_size and not info.st_blocks):
        raise RuntimeError('Refused nonresident/nonregular leaf: ' + relative)
    data = path.read_bytes()
    return data.decode(), hashlib.sha256(data).hexdigest()


def normalized(value):
    return re.sub(r'\s+', '', value)


def methods(source):
    result = {}
    for match in re.finditer(r'^-\s*\(([^)]+)\)([^{};]+)\{', source, re.M):
        signature = match.group(2).strip()
        labels = re.findall(r'(\w+)\s*:\s*\(', signature)
        selector = ''.join(label + ':' for label in labels) if labels else signature
        start, level, end = match.end(), 1, match.end()
        while level and end < len(source):
            level += (source[end] == '{') - (source[end] == '}')
            end += 1
        if level or selector in result:
            raise RuntimeError('Malformed or duplicate adapter selector: ' + selector)
        result[selector] = (match.group(1).strip(), signature, source[start:end - 1])
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', required=True)
    parser.add_argument('--objc-header', help='Optional actual Swift-generated header, relative to repository')
    args = parser.parse_args()
    if not re.fullmatch(r'[a-z0-9-]{1,80}', args.run):
        raise SystemExit('Invalid run name')
    output = ROOT / 'verification/web/evidence' / ('native-ios-' + args.run)
    output.mkdir(exist_ok=False)
    checks = []
    sources = {}

    def check(label, condition):
        checks.append({'name': label, 'passed': bool(condition)})
        if not condition:
            raise AssertionError(label)

    receipt = {'kind': 'RN 0.88 source ABI check', 'status': 'FAIL',
               'codegenExecuted': False, 'objcAdapterCompiled': False,
               'iosAppBuilt': False, 'deviceTested': False,
               'primarySourcesReviewed': PRIMARY_SOURCES, 'checks': checks,
               'inputs': sources}
    try:
        receipt['codegenEntrypointMetadataOnly'] = []
        for relative in [
            'platforms/native/node_modules/react-native/package.json',
            'platforms/native/node_modules/@react-native/codegen/package.json',
            'platforms/native/node_modules/@react-native/codegen/lib/generators/modules/GenerateModuleObjCpp/index.js',
            'platforms/native/node_modules/@react-native/codegen/lib/cli/combine/combine-js-to-schema-cli.js',
        ]:
            path = ROOT / relative
            try:
                info = path.lstat()
                metadata = {'path': relative, 'regular': stat.S_ISREG(info.st_mode),
                            'bytes': info.st_size, 'blocks': info.st_blocks,
                            'offloaded': bool(info.st_size and not info.st_blocks), 'contentRead': False}
            except FileNotFoundError:
                metadata = {'path': relative, 'missing': True, 'contentRead': False}
            receipt['codegenEntrypointMetadataOnly'].append(metadata)
        values = {}
        for path in FILES:
            values[path], sources[path] = read(path)
        package = json.loads(values[FILES[0]])
        spec, header, adapter, swift = [values[path] for path in FILES[1:5]]
        locked = json.loads(values[FILES[5]])['packages']
        check('The app and lockfile target React Native and Codegen 0.88.0',
              package['dependencies']['react-native'] == '0.88.0'
              and locked['node_modules/react-native']['version'] == '0.88.0'
              and locked['node_modules/@react-native/codegen']['version'] == '0.88.0')
        config = package['codegenConfig']
        check('Combined Codegen library and specs directory retained',
              config['name'] == 'SoeMemberSpecs' and config['type'] == 'all' and config['jsSrcsDir'] == 'specs')
        check('RN 0.88 module, reader and clip player registrations are exact and independent', config['ios'] == {
            'modules': {'NativeSoeMember': {'className': 'NativeSoeMemberIOS', 'unstableRequiresMainQueueSetup': True}},
            'components': {
                'SoeSourceReader': {'className': 'SoeSourceReaderView'},
                'SoeClipPlayer': {'className': 'SoeClipPlayerView'},
            },
        })
        for name in ('SoeSourceReader', 'SoeClipPlayer'):
            component = values[f'platforms/native/specs/{name}NativeComponent.ts']
            implementation = values[f'platforms/native/ios-source/{name}View.mm']
            check(name + ' registers the pinned Fabric descriptor and native view',
                  f"codegenNativeComponent<NativeProps>('{name}')" in component
                  and f'@implementation {name}View' in implementation
                  and f'concreteComponentDescriptorProvider<{name}ComponentDescriptor>()' in implementation)
        check('Generated protocol/event base plus both lifecycle protocols declared',
              'NativeSoeMemberSpecBase <NativeSoeMemberSpec, RCTInitializing, RCTInvalidating>' in header)
        check('Generated header and Swift compatibility header imports have no stand-in fallback',
              '#import <SoeMemberSpecs/SoeMemberSpecs.h>' in header
              and '#import "SoeMember-Swift.h"' in adapter
              and '#import <SoeMember/SoeMember-Swift.h>' in adapter)
        check('Modern registration uses moduleName without legacy RCT_EXPORT_MODULE',
              '+ (NSString *)moduleName { return @"NativeSoeMember"; }' in adapter
              and 'RCT_EXPORT_MODULE' not in adapter)
        check('RN main-thread initialization is explicitly required',
              '+ (BOOL)requiresMainQueueSetup { return YES; }' in adapter)
        actual = methods(adapter)
        promises = []
        expected_selectors = set()
        interface = re.search(r'export interface Spec extends TurboModule \{(.*?)\n\}', spec, re.S).group(1)
        declarations = re.findall(r'^\s+(\w+)\((.*?)\): (.*?);$', interface, re.M)
        check('Spec contains the complete current 19-method contract', len(declarations) == 19)
        aliases = {'MemberRequest', 'AuthRequest', 'PublicRequest', 'EmailRequest'}
        for name, params, result in declarations:
            pairs = [tuple(p.strip().split(': ')) for p in params.split(',')] if params else []
            expected_types = []
            for _, kind in pairs:
                check(name + ' parameter type supported by source audit', kind == 'string' or kind in aliases)
                expected_types.append('NSString *' if kind == 'string' else 'JS::NativeSoeMember::' + kind + ' &')
            promise = result.startswith('Promise<')
            labels = [name] + [p[0] for p in pairs[1:]] if pairs else []
            if promise:
                labels += ['resolve', 'reject'] if pairs else [name, 'reject']
                expected_types += ['RCTPromiseResolveBlock', 'RCTPromiseRejectBlock']
                promises.append(name)
            selector = ''.join(label + ':' for label in labels) if labels else name
            expected_selectors.add(selector)
            check(name + ' generated selector implemented', selector in actual)
            return_type, signature, body = actual[selector]
            check(name + ' return/argument types match RN 0.88 serialization',
                  normalized(return_type) == ('void' if promise else 'NSString*')
                  and [normalized(v) for v in re.findall(r':\s*\(([^)]+)\)', signature)]
                  == [normalized(v) for v in expected_types])
            if promise:
                check(name + ' delegates through guarded settlement', '[self withBridge:resolve reject:reject work:' in body)
                calls = re.findall(r'\[bridge\s+([^\]]+)\]', body)
                check(name + ' has exactly one facade operation', len(calls) == 1)
                facade_selector = ''.join(v + ':' for v in re.findall(r'(\w+)\s*:', calls[0]))
                check(name + ' facade selector explicitly exported by Swift', '@objc(' + facade_selector + ')' in swift)
                expected_first = {
                    'capabilities': 'capabilitiesWithCompletion', 'resetAccountStorage': 'resetAccountStorageWithExpectedGeneration',
                    'read': 'readWithSlot', 'write': 'writeWithSlot', 'remove': 'removeWithSlot', 'cancel': 'cancelWithId',
                }.get(name, name + ('WithId' if name.startswith('send') else 'WithGeneration'))
                check(name + ' preserves its dedicated authority lane', facade_selector.split(':')[0] == expected_first)
                if any(kind in aliases for _, kind in pairs):
                    before, after = body.split('[self withBridge:', 1)
                    check(name + ' materializes struct before asynchronous work', 'request.' in before and 'request.' not in after)
        check('All 18 promise methods use the sole guarded helper',
              len(promises) == 18 and adapter.count('[self withBridge:resolve reject:reject work:') == 18)
        check('No extra bridge-facing adapter selectors', set(actual) == expected_selectors | {
            'initialize', 'setEventEmitterCallback:', 'invalidate', 'dealloc', 'withBridge:reject:work:', 'getTurboModule:',
        })
        init = actual['initialize'][2]
        retired = actual['invalidate'][2]
        helper = actual['withBridge:reject:work:'][2]
        check('Initialization is single-use and native-host owned',
              'if (_initialized || _invalidated) return;' in init and '[SoeMemberIOSHost attachBridge]' in init)
        check('Connectivity observer is scoped to exact bridge and main delivery',
              'object:_memberBridge' in init and 'queue:[NSOperationQueue mainQueue]' in init
              and 'note.object != strongSelf->_memberBridge' in init)
        check('Connectivity wake-up resamples state without forwarding notification payload',
              '[strongSelf->_memberBridge getConnectivitySnapshot]' in init
              and 'note.userInfo' not in init and '[strongSelf emitOnConnectivityChange:' in init)
        check('Event install, delivery and retirement use synchronized access',
              '@synchronized(self)' in actual['setEventEmitterCallback:'][2]
              and '@synchronized(strongSelf)' in init and '@synchronized(self)' in retired
              and '_eventEmitterCallback = {};' in retired)
        check('Retirement clears exact bridge and removes observer before detach',
              retired.index('_invalidated = YES') < retired.index('_memberBridge = nil')
              < retired.index('removeObserver:observer') < retired.index('[SoeMemberIOSHost detachBridge:bridge]')
              and '[bridge invalidate]' in retired and '[self invalidate]' in actual['dealloc'][2])
        check('Settlement is one-shot and rejects replaced or retired attachments',
              'if (settled) return;' in helper and 'settled = YES' in helper
              and '!strongSelf->_invalidated && strongSelf->_memberBridge == bridge' in helper)
        check('Errors are constant and raw NSError is absent from rejection',
              adapter.count('reject(@') == 1
              and 'reject(@"E_SOE_MEMBER_UNAVAILABLE", @"Member operation unavailable.", nil);' in adapter
              and 'NSLog' not in adapter and 'RCTLog' not in adapter)
        check('No JavaScript configuration, notification payload, or direct networking added',
              all(term not in adapter for term in ['NSURLSession', 'NSUserDefaults', 'SecItem', 'captureEmailLink', 'initWithConfiguration:']))
        check('Sync connectivity has safe unavailable fallback', '@"unknown"' in actual['getConnectivitySnapshot'][2])
        check('Adapter returns the actual generated JSI class',
              'std::make_shared<facebook::react::NativeSoeMemberSpecJSI>(params)' in actual['getTurboModule:'][2])
        if args.objc_header:
            path = Path(args.objc_header)
            if path.is_absolute() or '..' in path.parts or not args.objc_header.startswith('verification/web/evidence/'):
                raise ValueError('Expected generated header under ignored evidence')
            generated, sources[args.objc_header] = read(args.objc_header)
            compiler_receipt_path = str(path.parent / 'receipt.json')
            compiler_text, sources[compiler_receipt_path] = read(compiler_receipt_path)
            compiler_receipt = json.loads(compiler_text)
            check('Swift compiler receipt binds the provided actual header',
                  compiler_receipt.get('objcHeader') == {'path': args.objc_header, 'sha256': sources[args.objc_header]}
                  and any(step['name'] == 'compile' and step['exitCode'] == 0 and not step['timedOut']
                          for step in compiler_receipt['steps'])
                  and compiler_receipt.get('inputsUnchanged') is True)
            for source in ['platforms/native/ios-member/SoeMemberBridge.swift', 'platforms/native/ios-member/SoeMemberIOSHost.swift']:
                check('Emitted Swift ABI matches current source: ' + source,
                      compiler_receipt['sourceHashes'][source] == sources[source])
            receipt['swiftCompilerReceiptStatus'] = compiler_receipt['status']
            bridge_match = re.search(r'@interface SoeMemberBridge : NSObject\n(.*?)@end', generated, re.S)
            check('Actual Swift compatibility header exports bridge class', bridge_match is not None)
            generated_bridge = bridge_match.group(1)
            generated_selectors = set()
            for signature in re.findall(r'^-\s*\([^\n]+?;', generated_bridge, re.M):
                labels = re.findall(r'(\w+)\s*:\s*\(', signature)
                if labels:
                    generated_selectors.add(''.join(label + ':' for label in labels))
            for call in re.findall(r'\[bridge\s+([^\]]+)\]', adapter):
                labels = re.findall(r'(\w+)\s*:', call)
                if labels:
                    selector = ''.join(label + ':' for label in labels)
                    check('Actual Swift header declares ' + selector, selector in generated_selectors)
            check('All actual Swift completions preserve nullable value then BOOL success',
                  generated_bridge.count('(void (^ _Nonnull)(id _Nullable, BOOL))completion') == 18)
            check('Actual Swift header has required sync snapshot and invalidation',
                  '- (NSString * _Nonnull)getConnectivitySnapshot' in generated_bridge and '- (void)invalidate;' in generated_bridge)
            check('Actual Swift host exports exact nullable attachment and nonnullable retirement',
                  '+ (SoeMemberBridge * _Nullable)attachBridge' in generated
                  and '+ (void)detachBridge:(SoeMemberBridge * _Nonnull)candidate;' in generated)
            receipt['swiftCompatibilityHeaderInspected'] = True
        for path, digest in list(sources.items()):
            check('Input unchanged: ' + path, read(path)[1] == digest)
        receipt['status'] = 'PASS_SOURCE_ONLY'
    except Exception as error:
        receipt['failure'] = str(error)
        raise
    finally:
        (output / 'receipt.json').write_text(json.dumps(receipt, indent=2) + '\n')
        print(json.dumps({'status': receipt['status'], 'checks': len(checks), 'receipt': str(output / 'receipt.json')}))


if __name__ == '__main__':
    main()
