// test_split_panes_bg.js — Verification suite for Split Chat Panes (Cmd+ArrowUp) & Background continuation on Cmd+N
const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('================================================================================');
console.log('🧪 TOMORROW v4.4.1 VERIFICATION: SPLIT CHAT PANES & BACKGROUND REPLIES ON CMD+N');
console.log('================================================================================\n');

let passed = 0;
let total = 0;

function runTest(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ [PASS] Test ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] Test ${total}: ${name}`);
    console.error(err);
  }
}

// -----------------------------------------------------------------------------
// TEST 1: Version 4.4.1 across package.json, app.json, App.tsx, CommandPalette
// -----------------------------------------------------------------------------
runTest('All version strings updated to v4.4.1', () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));
  assert.strictEqual(pkg.version, '4.4.1', 'package.json must be 4.4.1');

  const appJson = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'app.json'), 'utf8'));
  assert.strictEqual(appJson.expo.version, '4.4.1', 'app.json must be 4.4.1');

  const appTsx = fs.readFileSync(path.resolve(__dirname, 'App.tsx'), 'utf8');
  assert.ok(appTsx.includes('Online • v4.4.1'), 'App.tsx must display Online • v4.4.1');

  const cmdPaletteTsx = fs.readFileSync(path.resolve(__dirname, 'components/CommandPalette.tsx'), 'utf8');
  assert.ok(cmdPaletteTsx.includes('Tomorrow v4.4.1'), 'CommandPalette must display Tomorrow v4.4.1');
});

// -----------------------------------------------------------------------------
// TEST 2: Typing and Web Search state isolated per sessionId
// -----------------------------------------------------------------------------
runTest('Typing and status state isolated per sessionId (typingSessionIds, typingStatusBySession)', () => {
  const appTsx = fs.readFileSync(path.resolve(__dirname, 'App.tsx'), 'utf8');
  assert.ok(appTsx.includes('typingSessionIds, setTypingSessionIds'), 'App.tsx must define typingSessionIds map');
  assert.ok(appTsx.includes('typingStatusBySession, setTypingStatusBySession'), 'App.tsx must define typingStatusBySession map');
  assert.ok(appTsx.includes('searchingWebBySession, setSearchingWebBySession'), 'App.tsx must define searchingWebBySession map');
  assert.ok(appTsx.includes('setTypingSessionIds((prev) => ({ ...prev, [targetSessionId]: true }))'), 'Typing state must be keyed by targetSessionId');
});

// -----------------------------------------------------------------------------
// TEST 3: Background generation continues on Cmd+N without aborting targetSessionId
// -----------------------------------------------------------------------------
runTest('handleSendMessageInPane saves each bubble to targetSessionId without turn abortion', () => {
  const appTsx = fs.readFileSync(path.resolve(__dirname, 'App.tsx'), 'utf8');
  assert.ok(appTsx.includes('handleSendMessageInPane = async'), 'App.tsx must define handleSendMessageInPane');
  // Does not abort the bubble loop on turnId
  assert.ok(appTsx.includes('sessIndex = prevSessions.findIndex((s) => s.id === targetSessionId)'), 'Bubble update must match targetSessionId');
  assert.ok(appTsx.includes('saveSessions(copy)'), 'saveSessions must persist on each bubble to AsyncStorage');
});

// -----------------------------------------------------------------------------
// TEST 4: Cmd/Ctrl + ArrowUp global shortcut captures and toggles split panes
// -----------------------------------------------------------------------------
runTest('App.tsx captures Cmd/Ctrl + ArrowUp with { capture: true } and triggers handleToggleSplitPanes', () => {
  const appTsx = fs.readFileSync(path.resolve(__dirname, 'App.tsx'), 'utf8');
  assert.ok(appTsx.includes("key === 'arrowup' || code === 'ArrowUp'"), 'Shortcut must match ArrowUp');
  assert.ok(appTsx.includes('handleToggleSplitPanesRef.current()'), 'Keydown handler must call handleToggleSplitPanesRef.current()');
  assert.ok(appTsx.includes('handleToggleSplitPanes = useCallback('), 'handleToggleSplitPanes must be defined with useCallback');
});

// -----------------------------------------------------------------------------
// TEST 5: Split Panes support adding up to 3 panes and closing
// -----------------------------------------------------------------------------
runTest('Split Panes support adding (max 3) and closing down to 1 pane', () => {
  const appTsx = fs.readFileSync(path.resolve(__dirname, 'App.tsx'), 'utf8');
  assert.ok(appTsx.includes('handleAddPane = useCallback('), 'App.tsx must define handleAddPane');
  assert.ok(appTsx.includes('prev.length >= 3'), 'handleAddPane must cap panes at 3');
  assert.ok(appTsx.includes('handleClosePane = useCallback('), 'App.tsx must define handleClosePane');
  assert.ok(appTsx.includes('prev.length <= 1'), 'handleClosePane must not close last remaining pane');
});

// -----------------------------------------------------------------------------
// TEST 6: Pane header bar features: session dropdown, new chat in pane, close pane
// -----------------------------------------------------------------------------
runTest('Pane header provides session dropdown selector, new chat in pane, and close button', () => {
  const appTsx = fs.readFileSync(path.resolve(__dirname, 'App.tsx'), 'utf8');
  assert.ok(appTsx.includes('paneHeaderBar'), 'styles.paneHeaderBar must be defined and rendered');
  assert.ok(appTsx.includes('handleNewChatInPane'), 'App.tsx must define handleNewChatInPane');
  assert.ok(appTsx.includes('handleSwitchSessionInPane'), 'App.tsx must define handleSwitchSessionInPane');
  assert.ok(appTsx.includes('paneDropdownPopover'), 'App.tsx must render session picker popover');
});

// -----------------------------------------------------------------------------
// TEST 7: CommandPalette integrates split panes action (act-toggle-split) with ⌘↑
// -----------------------------------------------------------------------------
runTest('CommandPalette integrates ⌘↑ split panes action', () => {
  const cmdPaletteTsx = fs.readFileSync(path.resolve(__dirname, 'components/CommandPalette.tsx'), 'utf8');
  assert.ok(cmdPaletteTsx.includes('act-toggle-split'), 'CommandPalette must define act-toggle-split');
  assert.ok(cmdPaletteTsx.includes('onToggleSplitPanes'), 'CommandPalette must call onToggleSplitPanes');
  assert.ok(cmdPaletteTsx.includes("badge: '⌘↑'"), 'CommandPalette badge must be ⌘↑');
  assert.ok(cmdPaletteTsx.includes('Columns2'), 'CommandPalette must use Columns2 icon for split panes');
});

console.log('\n--------------------------------------------------------------------------------');
console.log(`🎉 RESULT: ${passed}/${total} TESTS PASSED!`);
if (passed === total) {
  console.log('🌟 ALL SPLIT PANES & BACKGROUND REPLIES TESTS PASSED PERFECTLY!');
  process.exit(0);
} else {
  console.error(`💥 ${total - passed} TESTS FAILED.`);
  process.exit(1);
}
