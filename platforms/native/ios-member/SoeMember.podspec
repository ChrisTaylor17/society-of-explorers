Pod::Spec.new do |s|
  s.name = 'SoeMember'
  s.version = '0.0.0'
  s.summary = 'App-owned iOS member account boundary'
  s.homepage = 'https://example.invalid/soe-local-source'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Society of Explorers'
  s.source = { :path => '.' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '6.0'
  s.static_framework = true
  s.source_files = '*.{h,mm,swift}'
  s.private_header_files = 'NativeSoeMemberIOS.h'
  s.frameworks = 'Network', 'Security', 'LocalAuthentication'
  s.dependency 'Expo'
  s.pod_target_xcconfig = { 'SWIFT_STRICT_CONCURRENCY' => 'complete' }
  install_modules_dependencies(s)
end
