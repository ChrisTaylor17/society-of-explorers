Pod::Spec.new do |s|
  s.name = 'SoeSourceReader'
  s.version = '0.0.0'
  s.summary = 'App-local, anonymous pinned full-edition renderer'
  s.homepage = 'https://example.invalid/soe-local-source'
  s.license = { :type => 'UNLICENSED' }
  s.author = 'Society of Explorers'
  s.source = { :path => '.' }
  s.platforms = { :ios => '15.1' }
  s.source_files = '*.{h,mm}'
  s.frameworks = 'WebKit'
  s.resource_bundles = { 'SoeSourceReaderPins' => ['../../../lib/books/source-reader-catalog.json'] }
  install_modules_dependencies(s)
end
