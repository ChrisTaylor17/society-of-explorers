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
  s.frameworks = 'WebKit', 'AVFoundation'
  s.resource_bundles = {
    'SoeSourceReaderPins' => ['generated/source-reader-catalog.json'],
    'SoeClipAssets' => ['generated/clips/soe_circle_intro.mp4', 'generated/clips/soe_night_sky.mp4', 'generated/clips/soe_elt_tilt.mp4', 'generated/clips/soe_which_height.mp4', 'generated/clips/soe_new_species.mp4']
  }
  install_modules_dependencies(s)
end
