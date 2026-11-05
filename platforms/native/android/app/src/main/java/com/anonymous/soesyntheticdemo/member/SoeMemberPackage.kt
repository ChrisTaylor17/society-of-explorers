package com.anonymous.soesyntheticdemo.member

import com.facebook.react.BaseReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.module.model.ReactModuleInfo
import com.facebook.react.module.model.ReactModuleInfoProvider
import com.facebook.react.uimanager.ViewManager
import com.anonymous.soesyntheticdemo.reader.SourceReaderManager

class SoeMemberPackage : BaseReactPackage() {
  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = listOf(SourceReaderManager())
  override fun getModule(name: String, reactContext: ReactApplicationContext): NativeModule? =
    if (name == NativeSoeMemberModule.NAME) NativeSoeMemberModule(reactContext) else null
  override fun getReactModuleInfoProvider() = ReactModuleInfoProvider {
    mapOf(NativeSoeMemberModule.NAME to ReactModuleInfo(
      name = NativeSoeMemberModule.NAME, className = NativeSoeMemberModule.NAME,
      canOverrideExistingModule = false, needsEagerInit = false, isCxxModule = false, isTurboModule = true
    ))
  }
}
