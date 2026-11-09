/* Isolated real React + Chromium audit of the existing autosave hook.
 * Uses only synthetic data and a mocked API; no LMS server is contacted.
 */
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require('@playwright/test');
const root = path.resolve(__dirname, '..');
const hook = fs.readFileSync(path.join(root, 'app/admin/personel/sozlesmeler/hooks/useSozlesmeForm.ts'), 'utf8');
const compiled = ts.transpileModule(hook, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const personnelSource=fs.readFileSync(path.join(root,'app/personel/page.tsx'),'utf8');
const sourceFile=ts.createSourceFile('page.tsx',personnelSource,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let fetchDeclaration,drawerDeclaration;
function findFetch(node) {
  if(ts.isVariableDeclaration(node)&&node.name.getText(sourceFile)==='fetchPersoneller')fetchDeclaration=node.getText(sourceFile);
  if(ts.isVariableDeclaration(node)&&node.name.getText(sourceFile)==='openDrawer')drawerDeclaration=node.getText(sourceFile);
  ts.forEachChild(node,findFetch);
}
findFetch(sourceFile);
if(!fetchDeclaration)throw new Error('Actual fetchPersoneller declaration not found.');
const compiledFetch=ts.transpileModule('const '+fetchDeclaration+';',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;
const compiledDrawer=ts.transpileModule('const '+drawerDeclaration+';',{
  compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
}).outputText;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const scenario of ['failed_response', 'edit_during_save']) {
      const page = await browser.newPage();
      await page.setContent('<div id="app"></div>');
      await page.addScriptTag({ path: path.join(root, 'node_modules/react/umd/react.development.js') });
      await page.addScriptTag({ path: path.join(root, 'node_modules/react-dom/umd/react-dom.development.js') });
      await page.evaluate(({ compiled, scenario }) => {
        window.exports = {};
        window.calls = [];
        window.require = (name) => name === 'react' ? window.React : {
          saveTaslak: (_id, payload) => {
            window.calls.push(payload);
            return scenario === 'failed_response'
              ? Promise.resolve({ success: false, error: 'Synthetic rejection' })
              : new Promise(resolve => { window.finishSave = () => resolve({ success: true }); });
          },
        };
        new Function('require', 'exports', compiled)(window.require, window.exports);
        function AuditForm() {
          const [form, setForm] = React.useState({ personel_id: 1, notlar: 'initial', durum: 'AKTIF' });
          const state = window.exports.useSozlesmeForm(form, {
            isEdit: true, sozlesmeId: 1,
            buildPayload: durum => ({ ...form, durum }),
          });
          window.saveState = state.saveState;
          window.edit = note => { setForm(previous => ({ ...previous, notlar: note })); state.setDirty(true); };
          return React.createElement('output', { id: 'dirty' }, String(state.dirty));
        }
        ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(AuditForm));
      }, { compiled, scenario });
      await page.waitForFunction(() => typeof window.edit === 'function');
      await page.evaluate(() => window.edit('first edit'));
      await page.waitForFunction(() => window.calls.length === 1);
      if (scenario === 'edit_during_save') {
        await page.evaluate(() => window.edit('newer unsaved edit'));
        await page.waitForTimeout(50);
        await page.evaluate(() => window.finishSave());
      }
      if (scenario === 'failed_response') {
        await page.waitForFunction(() => window.saveState === 'error');
      } else {
        await page.waitForFunction(() => document.querySelector('#dirty').textContent === 'true');
      }
      const result = await page.evaluate(() => ({ dirty: document.querySelector('#dirty').textContent, sent: window.calls }));
      assert.equal(result.dirty,'true',scenario);
      if(scenario==='edit_during_save') {
        await page.waitForFunction(()=>window.calls.length===2);
        const newest=await page.evaluate(()=>window.calls[1].notlar);
        assert.equal(newest,'newer unsaved edit');
        await page.evaluate(()=>window.finishSave());
        await page.waitForFunction(()=>document.querySelector('#dirty').textContent==='false');
      }
      process.stdout.write(JSON.stringify({scenario,passed:true})+'\n');
      await page.close();
    }
    const page=await browser.newPage();
    await page.setContent('<div id="app"></div>');
    await page.addScriptTag({path:path.join(root,'node_modules/react/umd/react.development.js')});
    await page.addScriptTag({path:path.join(root,'node_modules/react-dom/umd/react-dom.development.js')});
    await page.evaluate(compiledFetch=>{
      window.branch='A'; window.requests=[];
      const apiGet=async()=>{
        window.requests.push(window.branch);
        return {success:true,personeller:[{tam_ad:'Synthetic branch '+window.branch}],toplam_personel:1,aktif_personel:1};
      };
      const Component=new Function('React','apiGet',`return function AuditList(){
        const {useState,useCallback,useEffect}=React;
        const [branch,setBranch]=useState('A');
        const listRequestRef=React.useRef(0);
        const initialized=true, activeKurum={id:1}, activeSube={id:branch==='A'?1:2}, activeEgitimYili={id:1};
        const [personeller,setPersoneller]=useState([]);
        const [loading,setLoading]=useState(true);
        const [showInactive,setShowInactive]=useState(false);
        const [stats,setStats]=useState({});
        const [listError,setListError]=useState('');
        ${compiledFetch}
        useEffect(()=>{fetchPersoneller();},[fetchPersoneller]);
        window.switchBranch=()=>{window.branch='B';setBranch('B');};
        return React.createElement('output',{id:'rows'},JSON.stringify({branch,personeller}));
      }`)(React,apiGet);
      ReactDOM.createRoot(document.getElementById('app')).render(React.createElement(Component));
    },compiledFetch);
    await page.waitForFunction(()=>window.requests.length===1&&document.querySelector('#rows').textContent.includes('Synthetic'));
    await page.evaluate(()=>window.switchBranch());
    await page.waitForFunction(()=>window.requests.length===2&&document.querySelector('#rows').textContent.includes('Synthetic branch B'));
    const branchResult=await page.evaluate(()=>({requests:window.requests,rendered:JSON.parse(document.querySelector('#rows').textContent)}));
    assert.deepEqual(branchResult.requests,['A','B']);
    assert.equal(branchResult.rendered.personeller[0].tam_ad,'Synthetic branch B');
    process.stdout.write(JSON.stringify({scenario:'personnel_branch_switch',passed:true})+'\n');
    const birthdate=await page.evaluate(compiledDrawer=>{
      const run=new Function('setFormData',`
        const canWrite=true;
        const noop=()=>{};
        const kimlik={resetKimlik:noop};
        const setKimlikLink=noop,setExistingPersonelHasAccount=noop,setTcLocked=noop,
          setEditingPersonel=noop,setPhotoPreview=noop,setSelectedPhoto=noop,
          setFormError=noop,setFormSuccess=noop,setActiveStep=noop,setShowDrawer=noop,setQuickViewPersonel=noop;
        ${compiledDrawer}
        openDrawer({id:1,ad:'Synthetic',soyad:'Person',dogum_tarihi:'12.03.1990',dogum_tarihi_iso:'1990-03-12',aktif_mi:true});
      `);
      let form;
      run(value=>{form=value;});
      return form.dogum_tarihi;
    },compiledDrawer);
    assert.equal(birthdate,'1990-03-12');
    process.stdout.write(JSON.stringify({scenario:'edit_preserves_birthdate',passed:true})+'\n');
    await page.close();
  } finally { await browser.close(); }
})().catch(error => { process.stderr.write(String(error) + '\n'); process.exitCode = 1; });
