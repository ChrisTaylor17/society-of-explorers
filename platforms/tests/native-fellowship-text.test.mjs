import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceLoader } from './load-source.mjs';

// Actual TSX components and correction logic, with explicit hook scheduling and
// native primitive/AppState doubles. A batch intentionally does not render
// between native text events. This does not establish device or layout behavior.
function fixture(platform) {
  let active, state = 'active';
  const listeners = new Map();
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const slot = () => {
    assert.ok(active, 'A component must be rendering');
    const index = active.cursor++;
    return [active, index];
  };
  const react = {
    useState(initial) {
      const [instance, index] = slot();
      const hook = instance.hooks[index] ??= { value: typeof initial === 'function' ? initial() : initial, pending: [] };
      return [hook.value, value => {
        if (!instance.mounted) return;
        hook.pending.push(value); instance.dirty = true;
      }];
    },
    useRef(value) {
      const [instance, index] = slot();
      return instance.hooks[index] ??= { current: value };
    },
    useCallback(callback, deps) {
      const [instance, index] = slot();
      if (!same(instance.hooks[index]?.deps, deps)) instance.hooks[index] = { deps, callback };
      return instance.hooks[index].callback;
    },
    useLayoutEffect(effect, deps) {
      const [instance, index] = slot();
      const previous = instance.hooks[index];
      if (same(previous?.deps, deps)) return;
      const hook = { deps, cleanup: undefined };
      instance.hooks[index] = hook;
      instance.effects.push(() => { previous?.cleanup?.(); hook.cleanup = effect(); });
    },
  };
  const primitives = Object.fromEntries(['Pressable', 'SafeAreaView', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]));
  const load = sourceLoader({
    react,
    // Passage rendering is outside this text-input regression. Do not hydrate
    // the offloaded Scripture archive or mistake this fixture for content QA.
    '@/content/fellowship/scripture.web-classic.json': { passages: [], edition: 'Synthetic test edition',
      rightsUrl: 'https://example.invalid/synthetic-terms', rightsNotice: 'Synthetic test data only' },
    'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
    'react-native': {
      ...primitives, StyleSheet: { create: value => value }, Platform: { OS: platform },
      AppState: {
        get currentState() { return state; },
        addEventListener(name, callback) {
          const callbacks = listeners.get(name) ?? new Set();
          listeners.set(name, callbacks); callbacks.add(callback);
          return { remove: () => callbacks.delete(callback) };
        },
      },
    },
  });
  function mount(Component, props) {
    const instance = { hooks: [], effects: [], cursor: 0, dirty: true, mounted: true, tree: null };
    function flush() {
      for (let pass = 0; instance.dirty && pass < 32; pass++) {
        for (const hook of instance.hooks) if (hook?.pending) {
          for (const update of hook.pending) hook.value = typeof update === 'function' ? update(hook.value) : update;
          hook.pending.length = 0;
        }
        instance.cursor = 0; instance.dirty = false; active = instance;
        try { instance.tree = Component(props); } finally { active = undefined; }
        while (instance.effects.length) instance.effects.shift()();
      }
      assert.equal(instance.dirty, false, 'Component effects settled');
    }
    const walk = (node, result = []) => {
      if (Array.isArray(node)) node.forEach(child => walk(child, result));
      else if (node && typeof node === 'object') { result.push(node); walk(node.props?.children, result); }
      return result;
    };
    const nodes = () => walk(instance.tree);
    const field = label => {
      const node = nodes().find(item => item.type === 'TextInput' && item.props.accessibilityLabel.startsWith(label));
      assert.ok(node, label); return node.props;
    };
    const action = label => {
      const node = nodes().find(item => item.props?.label === label);
      assert.ok(node, label); assert.equal(Boolean(node.props.disabled), false, label + ' enabled'); return node.props.onPress;
    };
    function unmount() {
      instance.mounted = false;
      for (const hook of instance.hooks) hook?.cleanup?.();
      instance.effects.length = 0;
    }
    flush();
    return { flush, field, action, nodes, unmount, instance };
  }
  const { FellowshipScreen } = load('platforms/native/FellowshipScreen.tsx');
  function correction() {
    // Obtain the private correction component through the real screen's rendered
    // Scripture branch; no product exports or copied hook implementation.
    const screen = mount(FellowshipScreen, { onBack() {}, onBrowse() {} });
    screen.action('Scripture')(); screen.flush();
    const element = screen.nodes().find(node => node.type?.name === 'FellowshipCorrection');
    assert.ok(element, 'Actual correction component is reachable from Scripture');
    screen.unmount();
    const mounted = mount(element.type, element.props);
    return { ...mounted, claimId: element.props.claim.id };
  }
  function emit(name, value) {
    if (name === 'change') state = value;
    for (const callback of [...listeners.get(name) ?? []]) callback(value);
  }
  return {
    correction,
    screen: props => mount(FellowshipScreen, props),
    loseForeground: () => platform === 'android' ? emit('blur') : emit('change', 'inactive'),
    regainForeground: () => platform === 'android' ? emit('focus') : emit('change', 'active'),
    listenerCount: () => [...listeners.values()].reduce((count, callbacks) => count + callbacks.size, 0),
  };
}

for (const platform of ['android', 'ios']) {
  test(platform + ': queued correction text keeps the newest values and previews exactly those values', () => {
    const f = fixture(platform), view = f.correction();
    try {
      const edit = view.field('Proposed analysis').onChangeText;
      const reason = view.field('Reason and source').onChangeText;
      edit('A'); edit('A complete revised analysis.');
      reason('Check'); reason('Check the full passage and its cited source.');
      view.flush();
      assert.equal(view.field('Proposed analysis').value, 'A complete revised analysis.');
      assert.equal(view.field('Reason and source').value, 'Check the full passage and its cited source.');
      view.action('Preview correction · ' + view.claimId)(); view.flush();
      const preview = view.nodes().find(node => node.props?.accessibilityLabel === 'Correction preview · ' + view.claimId);
      assert.ok(preview, 'Correction preview is rendered');
      assert.match(preview.props.children, /A complete revised analysis\./);
      assert.match(preview.props.children, /Check the full passage and its cited source\./);
    } finally { view.unmount(); }
    assert.equal(f.listenerCount(), 0);
  });

  test(platform + ': lifecycle loss clears text and old edit callbacks cannot restore it after foreground returns', () => {
    const f = fixture(platform), view = f.correction();
    try {
      const oldEdit = view.field('Proposed analysis').onChangeText;
      const oldReason = view.field('Reason and source').onChangeText;
      oldEdit('Earlier analysis'); view.flush();
      f.loseForeground(); view.flush();
      oldEdit('Late private edit'); oldReason('Late reason'); view.flush();
      assert.equal(view.field('Proposed analysis').value, '');
      assert.equal(view.field('Reason and source').value, '');
      f.regainForeground(); view.flush();
      oldEdit('Retired callback after focus'); view.flush();
      assert.equal(view.field('Proposed analysis').value, '');
      const freshEdit = view.field('Proposed analysis').onChangeText;
      freshEdit('New'); freshEdit('New foreground edit'); view.flush();
      assert.equal(view.field('Proposed analysis').value, 'New foreground edit');
    } finally { view.unmount(); }
    assert.equal(f.listenerCount(), 0);
  });

  test(platform + ': unmount retires text callbacks and clear remains a single-use action', () => {
    const f = fixture(platform), view = f.correction();
    const oldEdit = view.field('Proposed analysis').onChangeText;
    oldEdit('Clear this'); view.flush();
    const clear = view.action('Clear correction · ' + view.claimId);
    clear(); oldEdit('Must not return after clear'); view.flush();
    assert.equal(view.field('Proposed analysis').value, '');
    const freshEdit = view.field('Proposed analysis').onChangeText;
    freshEdit('New draft'); view.flush();
    clear(); view.flush();
    assert.equal(view.field('Proposed analysis').value, 'New draft', 'Retired clear cannot erase a later draft');
    view.unmount();
    const before = JSON.stringify(view.instance.hooks.filter(hook => hook?.pending).map(hook => hook.value));
    freshEdit('After unmount'); clear();
    assert.equal(JSON.stringify(view.instance.hooks.filter(hook => hook?.pending).map(hook => hook.value)), before);
    assert.equal(f.listenerCount(), 0);
  });

  test(platform + ': new text invalidates an earlier Preview callback before the next render', () => {
    const f = fixture(platform), view = f.correction();
    try {
      view.field('Proposed analysis').onChangeText('Earlier analysis'); view.flush();
      view.field('Reason and source').onChangeText('Earlier reason'); view.flush();
      const earlierPreview = view.action('Preview correction · ' + view.claimId);
      view.field('Proposed analysis').onChangeText('Latest analysis');
      earlierPreview(); view.flush();
      assert.equal(view.nodes().some(node => node.props?.accessibilityLabel === 'Correction preview · ' + view.claimId), false);
      view.action('Preview correction · ' + view.claimId)(); view.flush();
      const preview = view.nodes().find(node => node.props?.accessibilityLabel === 'Correction preview · ' + view.claimId);
      assert.match(preview.props.children, /Latest analysis/);
    } finally { view.unmount(); }
    assert.equal(f.listenerCount(), 0);
  });

  test(platform + ': navigation still accepts a press only once and rejects retired presses', () => {
    const f = fixture(platform), visited = [];
    const screen = f.screen({ onBack() {}, onBrowse: topic => visited.push(topic) });
    try {
      const browse = screen.action('Find a salon for this conversation');
      browse(); browse(); screen.flush();
      assert.deepEqual(visited, ['psalm-22']);
      browse(); screen.flush(); assert.equal(visited.length, 1);
      const current = screen.action('Find a salon for this conversation');
      f.loseForeground(); f.regainForeground(); screen.flush();
      current(); screen.flush(); assert.equal(visited.length, 1);
      screen.action('Find a salon for this conversation')(); screen.flush(); assert.equal(visited.length, 2);
    } finally { screen.unmount(); }
    assert.equal(f.listenerCount(), 0);
  });
}
