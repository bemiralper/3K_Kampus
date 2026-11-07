import { test, expect, type Page } from '@playwright/test';
import { buildLossTopics, chronologicalExams } from '../components/coach/student360/examAnalyticsModel';
import type { DevelopmentSubject, StudentExamResult } from '../components/olcme/types';

const exams = Array.from({length:6},(_,i)=>({exam_id:i+1,exam_name:`Sentetik ${i<4?'TYT':'AYT'} ${i+1}`,exam_type:i<4?'YKS_TYT':'YKS_AYT',exam_date:`2026-10-${10+i}`,total_net:55+i*2,total_correct:65+i,total_wrong:20-i,total_empty:15,section_details:[],puan:null,ham_puan:null,status:'completed',exam_type_display:i<4?'TYT':'AYT',tahmini_siralama:null,yuzdelik_dilim:null,kurum_ici_sira:1,toplam_ogrenci:1})) as StudentExamResult[];
const makeSubject = (ids:number[]) => ({name:'Matematik',score_included:true,series:ids.map(id=>({exam_id:id,net:10+id,wrong:4,empty:2,correct:20,question_count:26})),topics:[{name:'Fonksiyonlar',question_count:12,correct:3,wrong:6,empty:3,outcomes:[]},{name:'Denklemler',question_count:10,correct:8,wrong:1,empty:1,outcomes:[]}],outcomes:[{name:'Fonksiyon grafiğini yorumlar',topic:'Fonksiyonlar',subject:'Matematik',outcome_id:1,sub_outcome_id:null,question_count:12,correct:3,wrong:6,empty:3,mastery_rate:25,data_confidence:'low',narrative:'Bu kazanımda tekrar eden yanlışlar var.',series:ids.map(id=>({exam_id:id,correct:1,wrong:2,empty:1,question_count:4,mastery_rate:25}))}],incomplete_breakdown:false}) as unknown as DevelopmentSubject;

const richExams=Array.from({length:6},(_,i)=>({...exams[0],exam_id:i+1,answer_id:100+i,exam_name:`TYT Kanıt ${i+1}`,exam_date:`2026-10-${10+i}`,total_correct:i<3?16:11,total_wrong:i<3?4:9,total_empty:0,total_questions:20,total_net:i<3?15:8.75,puan:300+i*2,scores_loaded:true,kurum_ici_sira:i+1,toplam_ogrenci:30,yuzdelik_dilim:10+i}));
function richSubjects(ids:number[]):DevelopmentSubject[]{
 const outcomes=[{name:'Grafik okur',sub_outcome_id:2},{name:'İşlem yapar',sub_outcome_id:3}].map((leaf,i)=>{const series=ids.map(id=>{const wrong=id<=3?i:3;return {exam_id:id,exam_name:`TYT Kanıt ${id}`,exam_date:`2026-10-${9+id}`,correct:5-wrong,wrong,empty:0,question_count:5,mastery_rate:(5-wrong)*20,accuracy_rate:(5-wrong)*20};});const wrong=series.reduce((sum,p)=>sum+p.wrong,0);return {...leaf,outcome_id:1,parent_outcome_name:'Fonksiyon ilişkilerini yorumlar',topic:'Fonksiyonlar',subject:'Matematik',question_count:5*ids.length,correct:5*ids.length-wrong,wrong,empty:0,mastery_rate:100*(5*ids.length-wrong)/(5*ids.length),data_confidence:'high',narrative:'Sentetik kazanım kanıtı',series};});
 const series=ids.map(id=>({exam_id:id,net:id<=3?8.75:2.5,correct:id<=3?9:4,wrong:id<=3?1:6,empty:0,question_count:10}));
 const wrong=series.reduce((sum,p)=>sum+p.wrong,0);
 const first={...makeSubject(ids),series,outcomes,topics:[{name:'Fonksiyonlar',question_count:10*ids.length,correct:10*ids.length-wrong,wrong,empty:0,outcomes:[]}]};
 const second={...makeSubject(ids),name:'Türkçe',series:ids.map(id=>({exam_id:id,net:6.25,correct:7,wrong:3,empty:0,question_count:10})),outcomes:[{...outcomes[0],name:'Ana düşünceyi bulur',outcome_id:5,sub_outcome_id:null,parent_outcome_name:'Ana düşünceyi bulur',topic:'Paragraf',subject:'Türkçe',question_count:10*ids.length,correct:7*ids.length,wrong:3*ids.length,series:ids.map(id=>({exam_id:id,question_count:10,correct:7,wrong:3,empty:0,mastery_rate:70}))}],topics:[{name:'Paragraf',question_count:10*ids.length,correct:7*ids.length,wrong:3*ids.length,empty:0,outcomes:[]}]};
 return [first,second] as unknown as DevelopmentSubject[];
}

async function portal(page:Page, options:{fail?:boolean;delay?:boolean;hang?:boolean;rich?:boolean;noMappings?:boolean;karneFail?:boolean;zeroLoss?:boolean}={}) {
 const calls:{ids:string;type:string}[]=[];
 await page.addInitScript(()=>{localStorage.setItem('3k_active_kurum','1');localStorage.setItem('3k_active_sube','1');});
 await page.route('**/api/**',async route=>{
  const url=new URL(route.request().url());const path=url.pathname;
  let body:unknown={success:true,data:[]};
  if(path.includes('/auth/api/me')) body={authenticated:true,user:{id:1,username:'synthetic',is_staff:true,is_superuser:true,role_code:'koc',portals:[{code:'coach'}],active_portal:'coach'}};
  else if(path.includes('/legacy/kurumlar')) body={success:true,data:{kurumlar:[{id:1,ad:'Test',aktif_mi:true}],subeler:[{id:1,kurum_id:1,ad:'Merkez',aktif_mi:true}],egitim_yillari:[]}};
  else if(path.endsWith('/students/1/profile/')) body={success:true,data:{student:{id:1,ad:'Sentetik',soyad:'Öğrenci',full_name:'Sentetik Öğrenci'},coach_context:{},risk:null,overview:[],quick_stats:{}}};
  else if(path.endsWith('/puan-ayarlari/')) body={default_puan_yili:2026,managed_years:[2026]};
  else if(path.endsWith('/student-exams/1/')) body={student_name:'Sentetik Öğrenci',exams:options.rich?richExams:exams,kpi:{},trend:[]};
  else if(path.includes('/analysis/students/')&&path.includes('/detail/')){
   if(options.karneFail)return route.fulfill({status:503,json:{error:'synthetic karne'}});
   body={kurum_ici_sira:2,toplam_ogrenci:30,sinif_rank:1,sinif_student_count:10,puan:320,net_etiket:'TYT toplam net',toplam_net:12,kurum_avg_net:10,sinif_avg_net:11,difficulty:{participant_count:30,note:'Sentetik katılımcı dağılımı',bands:[{key:'kolay',label:'Kolay',soru:10,dogru:6,yanlis:3,bos:1}]}};
  }
  else if(path.endsWith('/student-exams/1/development/')){
   calls.push({ids:url.searchParams.get('exam_ids')||'',type:url.searchParams.get('exam_type')||''});
   if(options.hang) return;
   if(options.fail){return route.fulfill({status:503,json:{error:'synthetic'}});}
   if(options.delay && url.searchParams.get('exam_type')==='AYT') await new Promise(resolve=>setTimeout(resolve,650));
   const ids=(url.searchParams.get('exam_ids')||'').split(',').map(Number);
   const subject=makeSubject(ids);
   if(url.searchParams.get('exam_type')==='AYT') subject.name='AYT Matematik';
   const subjects=options.rich?richSubjects(ids):[subject];
   if(options.zeroLoss){subjects[0].topics.push({name:'Kayıpsız konu',question_count:10,correct:10,wrong:0,empty:0,mastery_rate:100,outcomes:[]});subjects[0].outcomes.push({...subjects[0].outcomes[0],name:'Kayıpsız kazanım',correct:10,wrong:0,empty:0,question_count:10});subjects.push({...subjects[0],name:'Kayıpsız ders',series:ids.map(id=>({exam_id:id,exam_name:`Deneme ${id}`,exam_date:'2026-11-01',performance_rate:100,correct:10,wrong:0,empty:0,question_count:10,net:10})),topics:[],outcomes:[]} as DevelopmentSubject);}
   body={subjects:options.noMappings?[]:subjects,exam_count:ids.length,exams:[],summary:{},priorities:[],filters:{}};
  }
  await route.fulfill({json:body});
 });
 await page.goto('/coach/ogrenciler/1?tab=sinavlar');
 return calls;
}

test('loss priority and type/date windows do not mix exam types',()=>{
 const subjects=[makeSubject([1,2]),{...makeSubject([1]),name:'Alan dışı',score_included:false}];
 const topics=buildLossTopics(subjects);
 expect(topics.map(t=>[t.name,t.loss])).toEqual([['Fonksiyonlar',9],['Denklemler',2]]);
 expect(chronologicalExams(exams,'YKS_TYT','3','','').map(e=>e.exam_id)).toEqual([2,3,4]);
 expect(chronologicalExams(exams,'YKS_AYT','all','2026-10-15','').map(e=>e.exam_id)).toEqual([6]);
});

for(const width of [390,768,1440]) test(`compact and distinct analytics at ${width}px`,async({page})=>{
 const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
 await page.setViewportSize({width,height:1000});
 await portal(page,{rich:true});
 await expect(page.getByRole('region',{name:'Sınav performansı'})).toBeVisible();
 await expect(page.getByRole('heading',{name:'Derslerin görünümü'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Kayıp analizi'})).toHaveCount(0);
 await expect(page.getByText('Kanıt ve dönem kıyası')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.waitForTimeout(1300);
 await page.screenshot({path:`/tmp/compact-overview-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Derin Analiz',exact:true}).click();
 await expect(page.getByRole('region',{name:'Kayıp analizi'})).toBeVisible();
 await expect(page.getByRole('region',{name:'Sınav performansı'})).toHaveCount(0);
 await expect(page.getByRole('heading',{name:'Derslerin görünümü'})).toHaveCount(0);
 await page.getByRole('button',{name:/01.*Fonksiyonlar/}).click();
 await expect(page.getByRole('button',{name:/İşlem yapar/})).toBeVisible();
 await expect(page.getByText('Her iki dönemde en az 2 ölçüm',{exact:false})).toHaveCount(0);
 await page.screenshot({path:`/tmp/compact-deep-${width}.png`,fullPage:true});
 if(width<651){await page.getByRole('button',{name:'Konulara dön',exact:true}).click();await expect(page.getByRole('button',{name:/01.*Fonksiyonlar/})).toBeVisible();}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 expect(errors).toEqual([]);
});

test('zero loss topics, outcomes and courses are excluded from deep analysis',async({page})=>{
 await portal(page,{rich:true,zeroLoss:true});
 await page.getByRole('button',{name:'Derin Analiz',exact:true}).click();
 await expect(page.getByRole('button',{name:/01.*Fonksiyonlar/})).toBeVisible();
 await expect(page.getByText('Kayıpsız konu',{exact:true})).toHaveCount(0);
 await expect(page.getByText('Kayıpsız kazanım',{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:/Kayıpsız ders/})).toHaveCount(0);
 await expect(page.getByText('Kanıt ve dönem kıyası',{exact:true})).toBeVisible();
 await expect(page.getByText('sınavda kayıp.',{exact:false})).not.toBeVisible();
});

test('evidence and outcome history expand only on request',async({page})=>{
 await portal(page,{rich:true});
 await page.getByRole('combobox',{name:'Sınav kapsamı'}).selectOption('all');
 await page.getByRole('button',{name:'Derin Analiz',exact:true}).click();
 await page.getByRole('button',{name:/01.*Fonksiyonlar/}).click();
 await expect(page.getByRole('region',{name:'Dönem karşılaştırması'})).not.toBeVisible();
 await page.getByText('Kanıt ve dönem kıyası',{exact:true}).click();
 await expect(page.getByRole('region',{name:'Dönem karşılaştırması'})).toContainText('+50 yüzde puan');
 await page.getByRole('button',{name:/Grafik okur/}).click();
 await expect(page.getByText('30 gözlem',{exact:true})).toBeVisible();
 await page.getByText('Sınav geçmişi',{exact:true}).click();
 await expect(page.getByRole('columnheader',{name:'Yanlış',exact:true})).toBeVisible();
});

test('comparison is an on-demand side panel with keyboard dismissal',async({page})=>{
 await portal(page,{rich:true});
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button',{name:'Karşılaştır',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'Sınav karşılaştırması'});
 await expect(dialog).toBeVisible();
 await dialog.getByRole('combobox',{name:'Birinci sınav'}).selectOption('2');
 await expect(dialog.getByRole('combobox',{name:'İkinci sınav'})).toHaveValue('6');
 await page.keyboard.press('Escape');
 await expect(dialog).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Karşılaştır',exact:true})).toBeFocused();
});

test('focused exam opens its report and drills into only that exam',async({page})=>{
 const options={rich:true,karneFail:true};const calls=await portal(page,options);
 await page.getByRole('button',{name:/11 Eki.*TYT Kanıt 2/}).click();
 const dialog=page.getByRole('dialog',{name:'TYT Kanıt 2',exact:true});
 await expect(dialog).toBeVisible();
 await expect(dialog.getByRole('alert')).toContainText('Karne karşılaştırması alınamadı');
 options.karneFail=false;
 await dialog.getByRole('button',{name:'Karne bağlamını yeniden dene'}).click();
 await expect(dialog.getByText('Kurum sırası',{exact:false})).toBeVisible();
 await dialog.getByRole('button',{name:'Bu sınavın kayıplarını incele'}).click();
 await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(page.getByRole('combobox',{name:'Sınav kapsamı'})).toHaveValue('custom');
 await expect.poll(()=>calls.at(-1)?.ids).toBe('2');
 await expect(page.getByRole('button',{name:/Grafik okur/})).toHaveCount(0);
});

test('advanced controls are collapsed, chart metric and course comparison work',async({page})=>{
 await portal(page,{rich:true});
 await expect(page.getByLabel('Başlangıç',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'Puan',exact:true}).click();
 await expect(page.getByRole('button',{name:'Puan',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'Net',exact:true}).click();
 await page.getByRole('button',{name:'Grafik seçenekleri'}).click();
 await page.getByLabel('Matematik',{exact:true}).check();
 await page.getByLabel('Türkçe',{exact:true}).check();
 await page.getByRole('button',{name:'Analiz filtreleri'}).click();
 await page.getByLabel('Başlangıç',{exact:true}).fill('2027-01-01');
 await expect(page.getByText('Bu aralıkta sınav yok.',{exact:true})).toBeVisible();
});

test('keyboard chart range changes the deep analysis scope',async({page})=>{
 const calls=await portal(page,{rich:true});
 await page.getByRole('combobox',{name:'Sınav kapsamı'}).selectOption('all');
 await page.getByRole('slider').first().press('ArrowRight');
 await page.getByRole('button',{name:'5 sınavı incele',exact:true}).click();
 await expect.poll(()=>calls.at(-1)?.ids).toBe('2,3,4,5,6');
 await expect(page.getByRole('region',{name:'Kayıp analizi'})).toBeVisible();
});

test('request failure can be retried and old scope cannot overwrite a new type',async({page})=>{
 const options={fail:true,delay:true};await portal(page,options);
 await expect(page.getByRole('alert').filter({hasText:'Analiz'})).toContainText('Analiz yüklenemedi');
 options.fail=false;await page.getByRole('button',{name:'Yeniden dene'}).click();
 await page.getByRole('button',{name:'TYT',exact:true}).click();
 await page.getByRole('button',{name:'AYT',exact:true}).click();
 await page.getByRole('button',{name:'TYT',exact:true}).click();
 await page.getByRole('button',{name:'Derin Analiz',exact:true}).click();
 await expect(page.getByRole('button',{name:/01.*Fonksiyonlar/})).toBeVisible();
 await page.waitForTimeout(800);
 await expect(page.getByRole('button',{name:'TYT',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.getByText('AYT Matematik',{exact:true})).toHaveCount(0);
});

test('timeout returns control and supports retry',async({page})=>{
 await page.clock.install();const options={hang:true};await portal(page,options);
 await expect(page.getByRole('region',{name:'Sınav performansı'})).toBeVisible();
 await page.clock.fastForward(30_100);
 await expect(page.getByRole('alert').filter({hasText:'Analiz'})).toContainText('zamanında tamamlanamadı');
 options.hang=false;await page.getByRole('button',{name:'Yeniden dene'}).click();
 await expect(page.getByRole('heading',{name:'Derslerin görünümü'})).toBeVisible();
 await expect(page.getByRole('alert').filter({hasText:'Analiz'})).toHaveCount(0);
});

test('refresh preserves scope and course, and exam list drill remains available',async({page})=>{
 const calls=await portal(page,{rich:true});
 await page.getByRole('combobox',{name:'Sınav kapsamı'}).selectOption('all');
 await page.getByRole('button',{name:'Derin Analiz',exact:true}).click();
 await page.getByRole('button',{name:'Matematik 21',exact:true}).click();
 const before=calls.length;
 await page.getByRole('button',{name:'Sınav sonuçlarını yenile'}).click();
 await expect.poll(()=>calls.length).toBeGreaterThan(before);
 await expect(page.getByRole('combobox',{name:'Sınav kapsamı'})).toHaveValue('all');
 await expect(page.getByRole('heading',{name:'Matematik',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Sınavlarım',exact:true}).click();
 await page.getByRole('button',{name:'Önerileri incele',exact:true}).first().click();
 await expect(page.getByRole('combobox',{name:'Sınav kapsamı'})).toHaveValue('custom');
});
