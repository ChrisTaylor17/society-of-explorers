package com.anonymous.soesyntheticdemo;

import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import java.util.Collections;
import java.util.Set;
import java.util.WeakHashMap;

/** Synchronous Android pause boundary for the explicitly tagged report surface. */
final class ReportPrivacyGuard {
  private ReportPrivacyGuard() {}
  private static final Set<View> observed = Collections.newSetFromMap(new WeakHashMap<>());

  static void install(View decor) {
    decor.getViewTreeObserver().addOnGlobalLayoutListener(() -> observeOwnedInputs(decor, false));
    observeOwnedInputs(decor, false);
  }

  private static void observeOwnedInputs(View view, boolean insideReport) {
    boolean owned = insideReport || "report-screen".equals(view.getTag(com.facebook.react.R.id.react_test_id));
    if (owned && view instanceof EditText && observed.add(view)) {
      view.addOnAttachStateChangeListener(new View.OnAttachStateChangeListener() {
        @Override public void onViewAttachedToWindow(View input) {}
        @Override public void onViewDetachedFromWindow(View input) { clearEditable(input); }
      });
    }
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) observeOwnedInputs(group.getChildAt(i), owned);
    }
  }

  static void clearAndHide(View root) {
    if ("report-screen".equals(root.getTag(com.facebook.react.R.id.react_test_id))) {
      clearEditable(root);
      // Do not restore this view on resume: the AppState handler closes it.
      // A fresh report mounts a fresh, visible surface after an explicit action.
      root.setVisibility(View.INVISIBLE);
      return;
    }
    if (root instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) root;
      for (int i = 0; i < group.getChildCount(); i++) clearAndHide(group.getChildAt(i));
    }
  }

  private static void clearEditable(View view) {
    if (view instanceof EditText) {
      EditText input = (EditText) view;
      input.clearFocus();
      input.getText().clear();
      input.setText(null); // Reset composing text and the current TextView layout as well.
    }
    if (view instanceof ViewGroup) {
      ViewGroup group = (ViewGroup) view;
      for (int i = 0; i < group.getChildCount(); i++) clearEditable(group.getChildAt(i));
    }
  }
}
