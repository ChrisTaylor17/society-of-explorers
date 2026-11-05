package com.anonymous.soesyntheticdemo.reader

import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManagerDelegate
import com.facebook.react.uimanager.annotations.ReactProp
import com.facebook.react.viewmanagers.SoeSourceReaderManagerDelegate
import com.facebook.react.viewmanagers.SoeSourceReaderManagerInterface

internal class SourceReaderManager : SimpleViewManager<SourceReaderView>(), SoeSourceReaderManagerInterface<SourceReaderView> {
  private val delegate = SoeSourceReaderManagerDelegate(this)
  override fun getDelegate(): ViewManagerDelegate<SourceReaderView> = delegate
  override fun getName() = "SoeSourceReader"
  override fun createViewInstance(context: ThemedReactContext) = SourceReaderView(context)
  @ReactProp(name = "bookId") override fun setBookId(view: SourceReaderView, value: String?) { view.bookId = value ?: "" }
  @ReactProp(name = "editionId") override fun setEditionId(view: SourceReaderView, value: String?) { view.editionId = value ?: "" }
  @ReactProp(name = "blockIndex") override fun setBlockIndex(view: SourceReaderView, value: Int) { view.blockIndex = value }
  @ReactProp(name = "requestKey") override fun setRequestKey(view: SourceReaderView, value: String?) { view.requestKey = value ?: "" }
  @ReactProp(name = "active") override fun setActive(view: SourceReaderView, value: Boolean) { view.active = value }
  override fun onAfterUpdateTransaction(view: SourceReaderView) { super.onAfterUpdateTransaction(view); view.update() }
  override fun onDropViewInstance(view: SourceReaderView) { view.dispose(); super.onDropViewInstance(view) }
  override fun getExportedCustomDirectEventTypeConstants(): Map<String, Any> = mapOf("topReaderState" to mapOf("registrationName" to "onReaderState"))
}
