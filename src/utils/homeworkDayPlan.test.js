import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HOMEWORK_DAY_PLAN_VERSION,
  adaptHomeworkDayPlanForToday,
  buildHomeworkDayPlan,
  buildHomeworkSessionDates,
  normalizeHomeworkDayPlanManualLayout,
  normalizeHomeworkDayPlanItems,
  normalizeHomeworkPlanWeekdays,
} from './homeworkDayPlan.js';

const flattenPlanItems = (result) => result.dayPlan.flatMap((day) => day.items);

test('missed unfinished work is redistributed by current load without mutating the plan', () => {
  const days = [
    {
      date: '2026-07-27',
      items: [
        { itemId: 'overdue-a', completed: false, unavailable: false },
        { itemId: 'completed', completed: true, unavailable: false },
        { itemId: 'unavailable', completed: false, unavailable: true },
      ],
    },
    {
      date: '2026-07-28',
      items: [
        { itemId: 'overdue-b', completed: false, unavailable: false },
        { itemId: 'overdue-c', completed: false, unavailable: false },
      ],
    },
    {
      date: '2026-07-29',
      items: [{ itemId: 'today', completed: false, unavailable: false }],
    },
    { date: '2026-07-30', items: [] },
  ];
  const originalDays = structuredClone(days);

  const result = adaptHomeworkDayPlanForToday({ days, todayKey: '2026-07-29' });

  assert.deepEqual(days, originalDays);
  assert.deepEqual(result.metadata, {
    movedItemCount: 3,
    sourceDayCount: 2,
    targetDayCount: 2,
  });
  assert.deepEqual(
    result.days[0].items.map((item) => item.itemId),
    ['completed', 'unavailable']
  );
  assert.equal(result.days[0].rescheduledOutCount, 1);
  assert.equal(result.days[1].rescheduledOutCount, 2);
  assert.deepEqual(
    result.days[2].items.map((item) => item.itemId),
    ['today', 'overdue-b']
  );
  assert.deepEqual(
    result.days[3].items.map((item) => item.itemId),
    ['overdue-a', 'overdue-c']
  );
  assert.equal(result.days[2].receivedOverdueCount, 1);
  assert.equal(result.days[3].receivedOverdueCount, 2);
  assert.deepEqual(
    result.days.slice(2).flatMap((day) => day.items)
      .filter((item) => item.itemId.startsWith('overdue'))
      .map((item) => [item.itemId, item.movedFromDate, item.originalPlannedDate]),
    [
      ['overdue-b', '2026-07-28', '2026-07-28'],
      ['overdue-a', '2026-07-27', '2026-07-27'],
      ['overdue-c', '2026-07-28', '2026-07-28'],
    ]
  );
});

test('equal target loads prefer the earliest remaining plan day', () => {
  const result = adaptHomeworkDayPlanForToday({
    todayKey: '2026-07-29',
    days: [
      {
        date: '2026-07-28',
        items: [{ itemId: 'missed', completed: false, unavailable: false }],
      },
      { date: '2026-07-31', items: [] },
      { date: '2026-07-29', items: [] },
    ],
  });

  assert.deepEqual(result.days[2].items.map((item) => item.itemId), ['missed']);
  assert.deepEqual(result.days[1].items, []);
});

test('an existing original date survives a later redistribution', () => {
  const result = adaptHomeworkDayPlanForToday({
    todayKey: '2026-07-29',
    days: [
      {
        date: '2026-07-28',
        items: [{
          itemId: 'moved-before',
          completed: false,
          unavailable: false,
          movedFromDate: '2026-07-27',
          originalPlannedDate: '2026-07-25',
        }],
      },
      { date: '2026-07-29', items: [] },
    ],
  });

  assert.equal(result.days[1].items[0].movedFromDate, '2026-07-28');
  assert.equal(result.days[1].items[0].originalPlannedDate, '2026-07-25');
});

test('without today or future plan days missed work stays in place', () => {
  const days = [{
    date: '2026-07-28',
    items: [{ itemId: 'missed', completed: false, unavailable: false }],
  }];

  const result = adaptHomeworkDayPlanForToday({ days, todayKey: '2026-07-29' });

  assert.deepEqual(result.metadata, {
    movedItemCount: 0,
    sourceDayCount: 0,
    targetDayCount: 0,
  });
  assert.deepEqual(result.days[0].items.map((item) => item.itemId), ['missed']);
  assert.equal(result.days[0].rescheduledOutCount, 0);
});

test('pinned unfinished work stays on its original plan day while other missed work moves', () => {
  const result = adaptHomeworkDayPlanForToday({
    todayKey: '2026-07-29',
    days: [
      {
        date: '2026-07-28',
        items: [
          { itemId: 'pinned', pinned: true, completed: false, unavailable: false },
          { itemId: 'movable', completed: false, unavailable: false },
        ],
      },
      { date: '2026-07-29', items: [] },
    ],
  });

  assert.deepEqual(result.days[0].items.map((item) => item.itemId), ['pinned']);
  assert.deepEqual(result.days[1].items.map((item) => item.itemId), ['movable']);
  assert.equal(result.days[0].items[0].pinned, true);
  assert.equal(result.metadata.movedItemCount, 1);
});

test('normalizes weekday aliases and builds only selected calendar dates', () => {
  assert.deepEqual(
    normalizeHomeworkPlanWeekdays(['friday', 'ср', 3, 'bad']),
    [3, 5]
  );

  const result = buildHomeworkSessionDates({
    issuedAt: '2026-07-06T12:00:00.000Z',
    dueAt: '2026-07-13T12:00:00.000Z',
    selectedWeekdays: ['wednesday', 'friday'],
  });

  assert.deepEqual(result.dates, ['2026-07-08', '2026-07-10']);
  assert.equal(result.fallbackUsed, false);
});

test('session-count dates are evenly spaced from the first available day to the deadline', () => {
  const result = buildHomeworkSessionDates({
    issuedAt: '2026-07-01T12:00:00.000Z',
    dueAt: '2026-07-06T12:00:00.000Z',
    sessionCount: 3,
  });

  assert.deepEqual(result.dates, ['2026-07-02', '2026-07-04', '2026-07-06']);
});

test('without a weekday or session choice the whole assignment is scheduled for the deadline', () => {
  const result = buildHomeworkDayPlan({
    goals: [{
      type: 'task',
      taskNumber: 1,
      levelId: 'basic',
      targetQuestions: [1, 2, 3],
    }],
    issuedAt: '2026-07-01',
    dueAt: '2026-07-06',
  });

  assert.equal(result.strategy, 'due-date');
  assert.deepEqual(result.dayPlan.map((day) => day.date), ['2026-07-06']);
  assert.equal(result.dayPlan[0].itemCount, 3);
});

test('an assignment with no schedulable items does not create empty plan days', () => {
  const result = buildHomeworkDayPlan({
    goals: [],
    issuedAt: '2026-07-01',
    dueAt: '2026-07-06',
    sessionCount: 3,
  });

  assert.deepEqual(result.dayPlan, []);
  assert.equal(result.summary.totalItemCount, 0);
  assert.equal(result.summary.sessionCount, 0);
});

test('mixed concrete targets are balanced without changing their stable source order', () => {
  const result = buildHomeworkDayPlan({
    homework: {
      id: 'homework-1',
      issuedAt: '2026-07-01T12:00:00.000Z',
      dueAt: '2026-07-06T12:00:00.000Z',
      checklistItems: [
        { id: 'text-1', text: 'Read notes', completedAt: null },
        { id: 'text-2', text: 'Write summary', completedAt: null },
      ],
      goals: [
        {
          type: 'task',
          taskNumber: 1,
          levelId: 'basic',
          targetQuestions: [4, 2, 7, 1],
          targetQuestionIds: ['q-4', 'q-2', 'q-7', 'q-1'],
        },
        {
          type: 'mock',
          mockExamId: 'exam-1',
          mode: 'classic',
          targetTaskKeys: ['10', '2', '1'],
        },
      ],
    },
    sessionCount: 3,
  });

  assert.equal(result.version, HOMEWORK_DAY_PLAN_VERSION);
  assert.deepEqual(result.dayPlan.map((day) => day.date), [
    '2026-07-02',
    '2026-07-04',
    '2026-07-06',
  ]);
  assert.deepEqual(result.dayPlan.map((day) => day.itemCount), [3, 3, 3]);
  assert.deepEqual(
    flattenPlanItems(result).map((item) => (
      item.type === 'text'
        ? `text:${item.text}`
        : item.type === 'task-target'
          ? `task:${item.questionNumber}:${item.questionId}`
          : `mock:${item.taskKey}`
    )),
    [
      'text:Read notes',
      'text:Write summary',
      'task:4:q-4',
      'task:2:q-2',
      'task:7:q-7',
      'task:1:q-1',
      'mock:10',
      'mock:2',
      'mock:1',
    ]
  );
  assert.deepEqual(result.dayPlan[1].goals[0].targetQuestions, [2, 7, 1]);
  assert.deepEqual(result.dayPlan[1].goals[0].targetQuestionIds, ['q-2', 'q-7', 'q-1']);
  assert.deepEqual(result.dayPlan[2].goals[0].targetTaskKeys, ['10', '2', '1']);
  assert.equal(result.summary.plannedItemCount, result.summary.totalItemCount);
});

test('manual layout moves items and preserves the teacher-defined order within each day', () => {
  const goals = [{
    type: 'task',
    taskNumber: 1,
    levelId: 'basic',
    targetQuestions: [1, 2, 3, 4],
    targetQuestionIds: ['q-1', 'q-2', 'q-3', 'q-4'],
  }];
  const keys = normalizeHomeworkDayPlanItems({ goals }).map((item) => item.layoutKey);
  const result = buildHomeworkDayPlan({
    goals,
    issuedAt: '2026-07-01',
    dueAt: '2026-07-05',
    sessionCount: 2,
    manualLayout: {
      version: 1,
      days: [
        { date: '2026-07-02', itemKeys: [keys[3], keys[0]] },
        { date: '2026-07-05', itemKeys: [keys[2], keys[1]] },
      ],
      pinnedItemKeys: [keys[3]],
    },
  });

  assert.deepEqual(
    result.dayPlan.map((day) => day.items.map((item) => item.questionNumber)),
    [[4, 1], [3, 2]]
  );
  assert.deepEqual(result.manualLayout.days, [
    { date: '2026-07-02', itemKeys: [keys[3], keys[0]] },
    { date: '2026-07-05', itemKeys: [keys[2], keys[1]] },
  ]);
  assert.equal(result.dayPlan[0].items[0].pinned, true);
  assert.equal(result.dayPlan[0].items[1].pinned, undefined);
});

test('manual layout drops unknown and duplicate keys and balances every unplaced item without loss', () => {
  const goals = [{
    type: 'mock',
    mockExamId: 'exam',
    targetTaskKeys: ['first', 'second', 'third'],
  }];
  const keys = normalizeHomeworkDayPlanItems({ goals }).map((item) => item.layoutKey);
  const result = buildHomeworkDayPlan({
    goals,
    issuedAt: '2026-07-01',
    dueAt: '2026-07-05',
    manualLayout: {
      version: 1,
      days: [
        { date: '2026-07-02', itemKeys: [keys[0], 'unknown', keys[0]] },
        { date: '2026-07-04', itemKeys: [keys[1], keys[0]] },
      ],
      pinnedItemKeys: ['unknown', keys[2]],
    },
  });

  assert.deepEqual(result.manualLayout.days, [
    { date: '2026-07-02', itemKeys: [keys[0], keys[2]] },
    { date: '2026-07-04', itemKeys: [keys[1]] },
  ]);
  assert.deepEqual(result.manualLayout.pinnedItemKeys, [keys[2]]);
  assert.deepEqual(
    flattenPlanItems(result).map((item) => item.taskKey).sort(),
    ['first', 'second', 'third']
  );
  assert.equal(result.summary.unplannedItemCount, 0);
});

test('manual layout dates are unique, bounded by the homework range, and limited to seven', () => {
  const itemKeys = ['known'];
  const result = normalizeHomeworkDayPlanManualLayout({
    version: 1,
    days: [
      { date: '2026-07-01', itemKeys },
      { date: 'not-a-date', itemKeys },
      ...Array.from({ length: 9 }, (_, index) => ({
        date: `2026-07-${String(index + 2).padStart(2, '0')}`,
        itemKeys: index === 0 ? itemKeys : [],
      })),
      { date: '2026-07-02', itemKeys },
      { date: '2026-07-12', itemKeys },
    ],
    pinnedItemKeys: itemKeys,
  }, {
    issuedDay: '2026-07-01',
    dueDay: '2026-07-10',
    validItemKeys: itemKeys,
  });

  assert.deepEqual(
    result.days.map((day) => day.date),
    ['2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05', '2026-07-06', '2026-07-07', '2026-07-08']
  );
  assert.deepEqual(result.days[0].itemKeys, itemKeys);
  assert.deepEqual(result.pinnedItemKeys, itemKeys);
});

test('text layout keys stay stable between composer text preview and stored checklist items', () => {
  const preview = normalizeHomeworkDayPlanItems({
    homeWork: ' Read notes \n\nWRITE   summary',
  });
  const stored = normalizeHomeworkDayPlanItems({
    checklistItems: [
      { id: 'server-generated-a', text: 'Read notes' },
      { id: 'server-generated-b', text: 'WRITE   summary' },
    ],
  });

  assert.deepEqual(
    preview.map((item) => item.layoutKey),
    stored.map((item) => item.layoutKey)
  );
  assert.notDeepEqual(
    preview.map((item) => item.itemId),
    stored.map((item) => item.itemId)
  );
});

test('uneven work is split into contiguous chunks whose sizes differ by at most one', () => {
  const options = {
    goals: [{
      type: 'task',
      taskNumber: 3,
      levelId: 'basic',
      targetQuestions: Array.from({ length: 10 }, (_, index) => index + 1),
      targetQuestionIds: Array.from({ length: 10 }, (_, index) => `q-${index + 1}`),
    }],
    issuedAt: '2026-07-01',
    dueAt: '2026-07-10',
    sessionCount: 3,
  };
  const originalOptions = structuredClone(options);
  const first = buildHomeworkDayPlan(options);
  const second = buildHomeworkDayPlan(options);

  assert.deepEqual(options, originalOptions);
  assert.deepEqual(first, second);
  assert.deepEqual(first.dayPlan.map((day) => day.itemCount), [4, 3, 3]);
  assert.deepEqual(
    flattenPlanItems(first).map((item) => item.questionNumber),
    [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  );
});

test('question ids and numbers remain paired when legacy arrays have different lengths', () => {
  const items = normalizeHomeworkDayPlanItems({
    goals: [{
      type: 'task',
      taskNumber: 9,
      levelId: 'advanced',
      targetQuestions: [5, 3, 8],
      targetQuestionIds: ['five-id'],
    }],
  });

  assert.deepEqual(
    items.map((item) => [item.questionNumber, item.questionId]),
    [[5, 'five-id'], [3, ''], [8, '']]
  );
});

test('calendar offsets keep late-evening UTC timestamps on the intended local day', () => {
  const result = buildHomeworkSessionDates({
    issuedAt: '2026-07-01T21:30:00.000Z',
    dueAt: '2026-07-03T21:30:00.000Z',
    sessionCount: 2,
    calendarOffsetMinutes: 180,
  });

  assert.equal(result.issuedDay, '2026-07-02');
  assert.equal(result.dueDay, '2026-07-04');
  assert.deepEqual(result.dates, ['2026-07-03', '2026-07-04']);
});

test('weekday plans use no more non-empty days than there are work items', () => {
  const result = buildHomeworkDayPlan({
    goals: [{
      type: 'mock',
      mockExamId: 'exam',
      targetTaskKeys: ['first', 'second'],
    }],
    issuedAt: '2026-07-01',
    dueAt: '2026-07-31',
    weekdays: ['monday', 'wednesday', 'friday'],
  });

  assert.equal(result.dayPlan.length, 2);
  assert.equal(result.dayPlan[0].date, '2026-07-03');
  assert.equal(result.dayPlan[1].date, '2026-07-31');
  assert.deepEqual(
    flattenPlanItems(result).map((item) => item.taskKey),
    ['first', 'second']
  );
});

test('legacy root task and multiline homework text remain schedulable', () => {
  const result = buildHomeworkDayPlan({
    homework: {
      issuedAt: '2026-07-01',
      daysToComplete: 3,
      homeWork: 'Read chapter\n\nSolve on paper',
      taskNumber: 101,
      levelId: 'basic',
      targetQuestions: [2, 1],
    },
    sessionCount: 2,
  });

  assert.equal(result.dueDay, '2026-07-04');
  assert.equal(result.summary.textItemCount, 2);
  assert.equal(result.summary.taskTargetCount, 2);
  assert.deepEqual(
    flattenPlanItems(result)
      .filter((item) => item.type === 'task-target')
      .map((item) => [item.levelId, item.questionNumber]),
    [['python', 2], ['python', 1]]
  );
  assert.deepEqual(
    flattenPlanItems(result)
      .filter((item) => item.type === 'text')
      .map((item) => item.text),
    ['Read chapter', 'Solve on paper']
  );
});

test('include-all and legacy mock goals stay as indivisible opaque items instead of disappearing', () => {
  const result = buildHomeworkDayPlan({
    goals: [
      { type: 'task', taskNumber: 4, levelId: 'basic', includeAll: true },
      { type: 'mock', mockExamId: 'legacy-exam', mode: 'timer' },
    ],
    issuedAt: '2026-07-01',
    dueAt: '2026-07-03',
    sessionCount: 2,
  });

  assert.equal(result.summary.opaqueGoalCount, 2);
  assert.deepEqual(
    flattenPlanItems(result).map((item) => item.type),
    ['task-goal', 'mock-goal']
  );
  assert.equal(result.dayPlan[0].goals[0].includeAll, true);
  assert.equal(result.dayPlan[1].goals[0].mockExamId, 'legacy-exam');
});

test('a timer mock remains one indivisible session even with snapshotted task keys', () => {
  const result = buildHomeworkDayPlan({
    goals: [{
      type: 'mock',
      mockExamId: 'timer-exam',
      mode: 'timer',
      targetTaskKeys: ['1', '2', '3'],
    }],
    issuedAt: '2026-07-01',
    dueAt: '2026-07-05',
    sessionCount: 3,
  });

  assert.equal(result.dayPlan.length, 1);
  assert.equal(result.dayPlan[0].items[0].type, 'mock-goal');
  assert.deepEqual(result.dayPlan[0].goals[0].targetTaskKeys, ['1', '2', '3']);
});

test('an impossible date range reports every normalized item as unplanned', () => {
  const result = buildHomeworkDayPlan({
    goals: [{
      type: 'task',
      taskNumber: 1,
      levelId: 'basic',
      targetQuestions: [1, 2],
      targetQuestionIds: ['q-1', 'q-2'],
    }],
    homeWork: 'Read notes',
    issuedAt: '2026-07-10',
    dueAt: '2026-07-09',
    sessionCount: 2,
  });

  assert.equal(result.strategy, 'invalid-range');
  assert.equal(result.reason, 'due-before-issued');
  assert.deepEqual(result.dayPlan, []);
  assert.equal(result.summary.totalItemCount, 3);
  assert.equal(result.summary.unplannedItemCount, 3);
  assert.equal(result.unplannedItems.length, 3);
});

test('an extreme deadline is rejected before materializing every calendar day', () => {
  const result = buildHomeworkDayPlan({
    issuedAt: '2026-01-01T10:00:00.000Z',
    dueAt: '9999-12-31T10:00:00.000Z',
    homeWork: 'Повторить конспект',
    sessionCount: 3,
  });

  assert.equal(result.reason, 'range-too-large');
  assert.deepEqual(result.dayPlan, []);
  assert.equal(result.unplannedItems.length, 1);
});

test('a selected weekday outside the range falls back to the deadline without losing work', () => {
  const result = buildHomeworkDayPlan({
    goals: [{
      type: 'mock',
      mockExamId: 'exam',
      targetTaskKeys: ['1', '2'],
    }],
    issuedAt: '2026-07-06',
    dueAt: '2026-07-07',
    weekdays: ['friday'],
  });

  assert.equal(result.fallbackUsed, true);
  assert.deepEqual(result.dayPlan.map((day) => day.date), ['2026-07-07']);
  assert.equal(result.summary.plannedItemCount, 2);
  assert.equal(result.summary.unplannedItemCount, 0);
});
