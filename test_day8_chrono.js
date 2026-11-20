// test_day8_chrono.js — Verification suite for Day 8 (ai/realtime-chrono-context)
const assert = require('assert');

console.log('================================================================================');
console.log('🧪 TOMORROW DAY 8 VERIFICATION: REAL-TIME CHRONO CONTEXT & ANTI-LATE-NIGHT GUARD');
console.log('================================================================================\n');

// Import compiled or source functions via ts-node or transpiled modules
// We can use the typescript compiler / transpile to test typescript files directly
const ts = require('typescript');
const fs = require('fs');
const path = require('path');

function loadTsModule(filePath) {
  const code = fs.readFileSync(filePath, 'utf8');
  const res = ts.transpileModule(code, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  });
  const m = { exports: {} };
  const fn = new Function('require', 'module', 'exports', '__dirname', '__filename', res.outputText);
  fn(
    (mod) => {
      if (mod === '@react-native-async-storage/async-storage') {
        return {
          getItem: async () => null,
          setItem: async () => {},
          removeItem: async () => {},
          multiRemove: async () => {},
        };
      }
      if (mod === 'react-native') {
        return {
          Platform: { OS: 'web' },
        };
      }
      if (mod.startsWith('.')) {
        const resolved = path.resolve(path.dirname(filePath), mod);
        if (fs.existsSync(resolved + '.ts')) return loadTsModule(resolved + '.ts');
        if (fs.existsSync(resolved + '.tsx')) return loadTsModule(resolved + '.tsx');
        if (fs.existsSync(resolved + '.js')) return require(resolved + '.js');
        if (fs.existsSync(resolved)) return require(resolved);
      }
      return require(mod);
    },
    m,
    m.exports,
    path.dirname(filePath),
    filePath
  );
  return m.exports;
}

const aiService = loadTsModule(path.resolve(__dirname, 'services/aiService.ts'));
const chatStorage = loadTsModule(path.resolve(__dirname, 'storage/chatStorage.ts'));

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
// TEST 1: buildChronoContext extraction and weekdays
// -----------------------------------------------------------------------------
runTest('buildChronoContext extracts Vietnamese weekday, DD/MM/YYYY, HH:mm correctly', () => {
  // Test specific date: Wednesday, 15/04/2026 09:15
  const d1 = new Date(2026, 3, 15, 9, 15); // Month index 3 = April
  const c1 = aiService.buildChronoContext(d1);
  assert.strictEqual(c1.weekday, 'Thứ Tư');
  assert.strictEqual(c1.dateStr, '15/04/2026');
  assert.strictEqual(c1.timeStr, '09:15');
  assert.strictEqual(c1.hour, 9);
  assert.strictEqual(c1.minute, 15);
  assert.strictEqual(c1.formattedDateTime, 'Thứ Tư, 15/04/2026 09:15');

  // Test Sunday: 19/04/2026
  const d2 = new Date(2026, 3, 19, 14, 30);
  const c2 = aiService.buildChronoContext(d2);
  assert.strictEqual(c2.weekday, 'Chủ Nhật');
  assert.strictEqual(c2.dateStr, '19/04/2026');
  assert.strictEqual(c2.timeStr, '14:30');
});

// -----------------------------------------------------------------------------
// TEST 2: Circadian Periods across all boundary conditions
// -----------------------------------------------------------------------------
runTest('Circadian period classification strictly matches all 6 time slots', () => {
  const makeDate = (h, m) => new Date(2026, 0, 1, h, m);

  // 1. EARLY_MORNING: 04:00 - 06:59
  const cEarly1 = aiService.buildChronoContext(makeDate(4, 0));
  assert.strictEqual(cEarly1.period, 'EARLY_MORNING');
  assert.strictEqual(cEarly1.label, 'sáng sớm / tinh mơ');
  assert.strictEqual(cEarly1.allowLateNightRemark, false);

  const cEarly2 = aiService.buildChronoContext(makeDate(6, 59));
  assert.strictEqual(cEarly2.period, 'EARLY_MORNING');

  // 2. MORNING: 07:00 - 11:29
  const cMorn1 = aiService.buildChronoContext(makeDate(7, 0));
  assert.strictEqual(cMorn1.period, 'MORNING');
  assert.strictEqual(cMorn1.label, 'buổi sáng');
  assert.strictEqual(cMorn1.allowLateNightRemark, false);

  const cMorn2 = aiService.buildChronoContext(makeDate(11, 29));
  assert.strictEqual(cMorn2.period, 'MORNING');

  // 3. NOON: 11:30 - 13:29
  const cNoon1 = aiService.buildChronoContext(makeDate(11, 30));
  assert.strictEqual(cNoon1.period, 'NOON');
  assert.strictEqual(cNoon1.label, 'buổi trưa');
  assert.strictEqual(cNoon1.allowLateNightRemark, false);

  const cNoon2 = aiService.buildChronoContext(makeDate(13, 29));
  assert.strictEqual(cNoon2.period, 'NOON');

  // 4. AFTERNOON: 13:30 - 17:59
  const cAft1 = aiService.buildChronoContext(makeDate(13, 30));
  assert.strictEqual(cAft1.period, 'AFTERNOON');
  assert.strictEqual(cAft1.label, 'buổi chiều');
  assert.strictEqual(cAft1.allowLateNightRemark, false);

  const cAft2 = aiService.buildChronoContext(makeDate(17, 59));
  assert.strictEqual(cAft2.period, 'AFTERNOON');

  // 5. EVENING: 18:00 - 22:59
  const cEve1 = aiService.buildChronoContext(makeDate(18, 0));
  assert.strictEqual(cEve1.period, 'EVENING');
  assert.strictEqual(cEve1.label, 'buổi tối');
  assert.strictEqual(cEve1.allowLateNightRemark, false);

  const cEve2 = aiService.buildChronoContext(makeDate(22, 59));
  assert.strictEqual(cEve2.period, 'EVENING');

  // 6. LATE_NIGHT: 23:00 - 03:59
  const cNight1 = aiService.buildChronoContext(makeDate(23, 0));
  assert.strictEqual(cNight1.period, 'LATE_NIGHT');
  assert.strictEqual(cNight1.label, 'đêm khuya');
  assert.strictEqual(cNight1.allowLateNightRemark, true);

  const cNight2 = aiService.buildChronoContext(makeDate(2, 45));
  assert.strictEqual(cNight2.period, 'LATE_NIGHT');
  assert.strictEqual(cNight2.allowLateNightRemark, true);

  const cNight3 = aiService.buildChronoContext(makeDate(3, 59));
  assert.strictEqual(cNight3.period, 'LATE_NIGHT');
  assert.strictEqual(cNight3.allowLateNightRemark, true);
});

// -----------------------------------------------------------------------------
// TEST 3: directiveTag format check
// -----------------------------------------------------------------------------
runTest('buildChronoContext formats directiveTag according to specification', () => {
  const d = new Date(2026, 10, 20, 8, 15); // Friday, 20/11/2026 08:15
  const c = aiService.buildChronoContext(d);
  assert.strictEqual(
    c.directiveTag,
    '[CHRONO: Thứ Sáu, 20/11/2026 08:15 | PERIOD=MORNING (buổi sáng) | ALLOW_LATE_NIGHT_REMARK=false]'
  );

  const dNight = new Date(2026, 10, 20, 23, 30);
  const cNight = aiService.buildChronoContext(dNight);
  assert.strictEqual(
    cNight.directiveTag,
    '[CHRONO: Thứ Sáu, 20/11/2026 23:30 | PERIOD=LATE_NIGHT (đêm khuya) | ALLOW_LATE_NIGHT_REMARK=true]'
  );
});

// -----------------------------------------------------------------------------
// TEST 4: buildLocalReflexDirective integrates anti-late-night guard when not late night
// -----------------------------------------------------------------------------
runTest('buildLocalReflexDirective binds strict anti-late-night constraint during daytime/evening', () => {
  const daytimeDate = new Date(2026, 10, 20, 14, 0); // Friday 14:00 (AFTERNOON)
  const chrono = aiService.buildChronoContext(daytimeDate);

  // Test CASUAL_FRIEND mode
  const dir1 = aiService.buildLocalReflexDirective('nay trời đẹp nhờ', [], false, chrono);
  assert.strictEqual(dir1.intentMode, 'CASUAL_FRIEND');
  assert.ok(
    dir1.directivePrompt.includes('CẤM TUYỆT ĐỐI hỏi hoặc nhắc \'lại thức khuya hả\', \'chưa ngủ à\', \'thức đêm à\''),
    'Must include strict anti-late-night prohibition'
  );
  assert.ok(dir1.directivePrompt.includes('buổi chiều (14:00 Thứ Sáu)'));

  // Test PING mode
  const dirPing = aiService.buildLocalReflexDirective('yo', [], false, chrono);
  assert.strictEqual(dirPing.intentMode, 'PING');
  assert.ok(dirPing.directivePrompt.includes('CẤM TUYỆT ĐỐI hỏi hoặc nhắc \'lại thức khuya hả\''));

  // Test STOP_SIGNAL mode
  const dirStop = aiService.buildLocalReflexDirective('sybau', [], false, chrono);
  assert.strictEqual(dirStop.intentMode, 'STOP_SIGNAL');
  assert.ok(dirStop.directivePrompt.includes('CẤM TUYỆT ĐỐI hỏi hoặc nhắc \'lại thức khuya hả\''));

  // Test EXPERT_JARVIS mode
  const dirExpert = aiService.buildLocalReflexDirective('giải thích thuật toán bubble sort', [], false, chrono);
  assert.strictEqual(dirExpert.intentMode, 'EXPERT_JARVIS');
  assert.ok(dirExpert.directivePrompt.includes('CẤM TUYỆT ĐỐI hỏi hoặc nhắc \'lại thức khuya hả\''));
});

// -----------------------------------------------------------------------------
// TEST 5: buildLocalReflexDirective allows late night remark when PERIOD=LATE_NIGHT
// -----------------------------------------------------------------------------
runTest('buildLocalReflexDirective permits natural late night remark when in LATE_NIGHT period', () => {
  const nightDate = new Date(2026, 10, 20, 1, 30); // 01:30 (LATE_NIGHT)
  const chrono = aiService.buildChronoContext(nightDate);

  const dir = aiService.buildLocalReflexDirective('ngồi fix bug mệt quá', [], false, chrono);
  assert.strictEqual(dir.intentMode, 'CASUAL_FRIEND');
  assert.ok(
    !dir.directivePrompt.includes('CẤM TUYỆT ĐỐI hỏi hoặc nhắc \'lại thức khuya hả\''),
    'Should not have forbidden late night remark'
  );
  assert.ok(dir.directivePrompt.includes('Cho phép nhận diện tự nhiên ngữ cảnh khuya/đêm muộn'));
});

// -----------------------------------------------------------------------------
// TEST 6: UserMemoryVault cleans out-of-phase late night notes
// -----------------------------------------------------------------------------
runTest('mergeMemoryNoteIntoVault filters out "thức khuya" / "thức đêm" when daytime', () => {
  const daytimeDate = new Date(2026, 10, 20, 10, 0); // 10:00 (MORNING)
  const vault = {
    pronouns: 'bạn bè tự nhiên',
    favorites: ['CR7'],
    activeProjects: ['Tomorrow'],
    habits: ['Thức khuya làm việc', 'Làm việc tập trung'],
    recentContext: 'Hôm qua thức đêm fix code',
  };

  const updated = chatStorage.mergeMemoryNoteIntoVault(
    vault,
    'thói quen hay thức khuya',
    'chiều nay đi đá bóng',
    daytimeDate
  );

  // Habits must not have "Thức khuya"
  assert.ok(
    !updated.habits.some((h) => h.toLowerCase().includes('thức khuya')),
    'Out-of-phase "thức khuya" habit must be purged'
  );
  assert.ok(
    !updated.habits.some((h) => h.toLowerCase().includes('thức đêm')),
    'Out-of-phase "thức đêm" habit must be purged'
  );
  assert.ok(
    !updated.recentContext.toLowerCase().includes('thức khuya'),
    'recentContext must not contain "thức khuya"'
  );
  assert.ok(
    !updated.recentContext.toLowerCase().includes('thức đêm'),
    'recentContext must not contain "thức đêm"'
  );
  assert.ok(updated.habits.length <= 5);
  assert.ok(updated.favorites.length <= 5);
  assert.ok(updated.activeProjects.length <= 5);
});

// -----------------------------------------------------------------------------
// TEST 7: cleanNightNotesFromMemory sanitizes profile & vault
// -----------------------------------------------------------------------------
runTest('cleanNightNotesFromMemory purges night notes across memory profile and vault', () => {
  const dirtyProfile = {
    userName: 'Bạn iu',
    nickname: 'bạn',
    currentProblem: 'Thường thức khuya mất ngủ',
    moodTrend: 'Hay bồn chồn vào đêm muộn',
    interests: ['CR7'],
    lastActiveDate: new Date().toISOString(),
    summary: 'Người dùng hay thức đêm làm việc',
    habits: ['Thức khuya', 'Tập trung'],
    vault: {
      pronouns: 'bạn bè tự nhiên',
      favorites: ['CR7'],
      activeProjects: ['Tomorrow'],
      habits: ['Thức khuya code'],
      recentContext: 'Đang thức khuya fix bug',
    },
  };

  const cleaned = chatStorage.cleanNightNotesFromMemory(dirtyProfile);
  assert.ok(!cleaned.currentProblem.toLowerCase().includes('thức khuya'));
  assert.ok(!cleaned.moodTrend.toLowerCase().includes('đêm muộn'));
  assert.ok(!cleaned.summary.toLowerCase().includes('thức đêm'));
  if (new Date().getHours() < 23 && new Date().getHours() >= 4) {
    assert.ok(!cleaned.vault.habits.some((h) => h.toLowerCase().includes('thức khuya')));
    assert.ok(!cleaned.vault.recentContext.toLowerCase().includes('thức khuya'));
  }
});

// -----------------------------------------------------------------------------
// TEST 8: App.tsx displays Online • v4.4
// -----------------------------------------------------------------------------
runTest('App.tsx Header displays Online • v4.4', () => {
  const appTsx = fs.readFileSync(path.resolve(__dirname, 'App.tsx'), 'utf8');
  assert.ok(appTsx.includes('Online • v4.4'), 'App.tsx must contain "Online • v4.4" in the header liveBadge');
});

// -----------------------------------------------------------------------------
// TEST 9: SYSTEM_INSTRUCTION is concise and under 450 words
// -----------------------------------------------------------------------------
runTest('SYSTEM_INSTRUCTION is concise and under 450 words', () => {
  const words = aiService.SYSTEM_INSTRUCTION.split(/\s+/).filter(Boolean).length;
  console.log(`   (SYSTEM_INSTRUCTION word count: ${words} words)`);
  assert.ok(words < 450, `SYSTEM_INSTRUCTION must be under 450 words (got ${words})`);
  assert.ok(
    aiService.SYSTEM_INSTRUCTION.includes('[CHRONO]'),
    'SYSTEM_INSTRUCTION must reference [CHRONO]'
  );
  assert.ok(
    aiService.SYSTEM_INSTRUCTION.includes('ALLOW_LATE_NIGHT_REMARK=false'),
    'SYSTEM_INSTRUCTION must reference ALLOW_LATE_NIGHT_REMARK=false'
  );
});

// -----------------------------------------------------------------------------
// TEST 10: getColdGreetingText matches circadian period
// -----------------------------------------------------------------------------
runTest('getColdGreetingText matches circadian periods', () => {
  const dummyMemory = chatStorage.DEFAULT_USER_MEMORY;
  const dMorn = new Date(2026, 10, 20, 8, 30);
  const gMorn = aiService.getColdGreetingText(dummyMemory, false, dMorn);
  assert.ok(gMorn.startsWith('Chào buổi sáng!'));

  const dNoon = new Date(2026, 10, 20, 12, 0);
  const gNoon = aiService.getColdGreetingText(dummyMemory, false, dNoon);
  assert.ok(gNoon.startsWith('Buổi trưa năng lượng!'));

  const dAft = new Date(2026, 10, 20, 15, 0);
  const gAft = aiService.getColdGreetingText(dummyMemory, false, dAft);
  assert.ok(gAft.startsWith('Buổi chiều hiệu quả!'));

  const dEve = new Date(2026, 10, 20, 19, 0);
  const gEve = aiService.getColdGreetingText(dummyMemory, false, dEve);
  assert.ok(gEve.startsWith('Buổi tối thảnh thơi!'));

  const dNight = new Date(2026, 10, 20, 23, 30);
  const gNight = aiService.getColdGreetingText(dummyMemory, false, dNight);
  assert.ok(gNight.startsWith('Đêm đã khuya rồi!'));
});

console.log('\n--------------------------------------------------------------------------------');
console.log(`🎉 RESULT: ${passed}/${total} TESTS PASSED!`);
if (passed === total) {
  console.log('🌟 ALL DAY 8 CHRONO CONTEXT & ANTI-LATE-NIGHT TESTS PASSED PERFECTLY!');
  process.exit(0);
} else {
  console.error(`💥 ${total - passed} TESTS FAILED.`);
  process.exit(1);
}
