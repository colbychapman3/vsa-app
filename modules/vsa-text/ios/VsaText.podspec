Pod::Spec.new do |s|
  s.name           = 'VsaText'
  s.version        = '1.0.0'
  s.summary        = 'Apple Vision text with word positions, for reading VSA paperwork'
  s.description    = 'Apple Vision text with word positions, for reading VSA paperwork'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '15.1' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
