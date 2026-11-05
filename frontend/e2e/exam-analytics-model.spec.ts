import { test, expect } from '@playwright/test';
import { coverage, evidenceSummary, groupOutcomes, periodComparison, sortTopics, buildLossTopics } from '../components/coach/student360/examAnalyticsModel';
import type { DevelopmentOutcome, DevelopmentSubject } from '../components/olcme/types';
const point=(exam_id:number,wrong:number,empty=0,question_count=10)=>({exam_id,wrong,empty,question_count,correct:question_count-wrong-empty});
test('equal disjoint weighted periods and absent evidence are handled honestly',()=>{
 const points=[point(1,1),point(2,1),point(3,1),point(4,6),point(5,6),point(6,6)];
 const result=periodComparison(points,[1,2,3,4,5,6]);
 expect(result.previousIds).toEqual([1,2,3]);expect(result.recentIds).toEqual([4,5,6]);expect(result.delta).toBe(50);
 expect(periodComparison([point(1,1),point(6,6)],[1,2,3,4,5,6]).delta).toBeNull();
 expect(periodComparison(points.slice(0,3),[1,2,3]).delta).toBeNull();
 expect(evidenceSummary(points,[1,2,3,4,5,6]).state).toBe('new_drop');
});
test('recurrence, improvement, low evidence, and unmeasured are distinct',()=>{
 expect(evidenceSummary([point(1,5),point(2,5),point(3,5)],[1,2,3]).state).toBe('recurring');
 expect(evidenceSummary([point(1,1)],[1,2,3]).state).toBe('unmeasured');
 expect(evidenceSummary([point(3,1,0,2)],[1,2,3]).state).toBe('limited');
 expect(evidenceSummary([point(1,8),point(2,8),point(3,8),point(4,2),point(5,2),point(6,2)],[1,2,3,4,5,6]).state).toBe('improving_loss');
 expect(evidenceSummary([point(1,0),point(2,0)],[1,2]).state).toBe('no_loss');
});
test('coverage identifies missing and inconsistent mapping without hiding overcount',()=>{
 const subject={series:[point(1,5)],topics:[{question_count:6}]} as DevelopmentSubject;
 expect(coverage(subject)).toEqual({total:10,mapped:6,percent:60,inconsistent:false});
 expect(coverage({...subject,topics:[{question_count:11}]} as DevelopmentSubject).inconsistent).toBe(true);
});
test('parent outcome grouping preserves sibling evidence and parent direct observations',()=>{
 const items=[{outcome_id:1,sub_outcome_id:2,name:'Alt A',parent_outcome_name:'Üst'}, {outcome_id:1,sub_outcome_id:3,name:'Alt B'}, {outcome_id:1,sub_outcome_id:null,name:'Üst'}] as DevelopmentOutcome[];
 const groups=groupOutcomes(items);expect(groups).toHaveLength(1);expect(groups[0].name).toBe('Üst');expect(groups[0].items).toHaveLength(3);
});
test('priority is explainable and rate sort distinguishes exposure sizes',()=>{
 const subject={name:'Matematik',series:[point(1,4),point(2,4)],outcomes:[],topics:[{name:'A',question_count:40,correct:30,wrong:10,empty:0},{name:'B',question_count:10,correct:2,wrong:8,empty:0}]} as unknown as DevelopmentSubject;
 const topics=buildLossTopics([subject],[1,2]);expect(sortTopics(topics,'loss')[0].name).toBe('A');expect(sortTopics(topics,'rate')[0].name).toBe('B');
});


test('multiple rows in one exam count as one measurement, not several exams',()=>{
 const points=[point(1,1),point(1,1),point(4,1),point(4,1)];
 expect(evidenceSummary(points,[1,2,3,4]).measured).toBe(2);
 expect(periodComparison(points,[1,2,3,4]).delta).toBeNull();
 expect(evidenceSummary(points,[1,2,3,4]).question_count).toBe(40);
});


test('coverage denominator uses actual result counts rather than nominal exam capacity',()=>{
 const subject={series:[{...point(1,3),question_count:40}],topics:[{question_count:10}]} as DevelopmentSubject;
 expect(coverage(subject)).toEqual({total:10,mapped:10,percent:100,inconsistent:false});
});
