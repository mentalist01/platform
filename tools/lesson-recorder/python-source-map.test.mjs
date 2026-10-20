import assert from 'node:assert/strict';
import test from 'node:test';
import {pythonRecordingAction,pythonSources} from './python-source-map.mjs';

test('failed monthly continuation offers retry of the same capture and retains later edits and previous sources', () => {
  const draft={id:'failed',local:true,manual:true,status:'error',cutoffAt:2000,pythonContinuedFrom:'saved',mockReview:{examId:'monthly'},pythonCaptureOffset:120,
    pythonPreviousSources:[{id:'saved',file:'saved.mkv',start:0,end:120}],
    pythonTimeline:{sourceEnd:120,openStart:120,finalized:false,approved:false,revision:39,clips:[{id:'edited',start:10,end:118}],history:[{clips:[{id:'edited',start:10,end:120}]}]}};
  const before=structuredClone(draft);
  assert.equal(pythonRecordingAction(draft,1000),'retry');
  assert.equal(pythonSources(draft)[0].file,'saved.mkv');
  assert.deepEqual(draft,before,'displaying retry must never roll back the last trim or replace source bindings');
  for(const change of [{status:'starting'},{status:'recording'},{file:'captured.mkv'},{url:'published'},{pythonArchivedAt:1},{cutoffAt:999},{local:false}])
    assert.equal(pythonRecordingAction({...draft,...change},1000),'');
  for(const change of [{approved:true},{sourceEnd:121},{openStart:null}])
    assert.equal(pythonRecordingAction({...draft,pythonTimeline:{...draft.pythonTimeline,...change}},1000),'');
  assert.equal(pythonRecordingAction({...draft,status:'saved',file:'captured.mkv',pythonTimeline:{...draft.pythonTimeline,finalized:true,openStart:null}},1000),'continue');
});
