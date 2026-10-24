#!/usr/bin/env python3
"""Compare the complete JS pixel program with the independently written NumPy contract."""
import hashlib,itertools,json,subprocess,sys,time,unittest
from pathlib import Path
import numpy as np
from PIL import Image
import reference
ROOT=Path(__file__).resolve().parent; PROOF=ROOT/'proof';PROOF.mkdir(exist_ok=True)
base=reference.defaults();cases=[dict(base,stage=s) for s in range(5)]
keys=['arms','twist','relief','hue','light','phase'];ends=[(3,21),(-9,9),(0,1.5),(-3.14,3.14),(-3.14,3.14),(-6.284,6.284)]
cases.extend(dict(base,**dict(zip(keys,v))) for v in itertools.product(*ends))
coords=[[float(x),float(y)] for x in np.linspace(-1.1,1.1,13) for y in np.linspace(-.9,.9,13)]
coords.extend([[0,0],[.000099,0],[.000101,0],[0,-.000099],[0,-.000101],[-.6,1e-10],[-.6,-1e-10]])
(PROOF/'probe-input.json').write_text(json.dumps({'cases':cases,'coords':coords}))
js=r'''
const fs=require('fs'),n=require('./src/nacre.js'),assert=require('node:assert/strict');
const {cases,coords}=JSON.parse(fs.readFileSync('proof/probe-input.json','utf8'));
const samples=cases.map(p=>coords.map(([x,y])=>n.sample(x,y,p)));
fs.writeFileSync('proof/node-samples.json',JSON.stringify(samples));
let rejected=0;const p=n.defaults();for(const bad of [{...p,extra:1},{...p,arms:2},{...p,arms:3.5},{...p,phase:NaN},{...p,light:Infinity},{...p,relief:null},{...p,hue:'0'},Object.assign(Object.create({stage:4}),{arms:11,twist:5.5,relief:1,hue:0,light:0,phase:0,unknown:1})]){assert.throws(()=>n.validate(bad));rejected++;}
for(const [x,y] of [[NaN,0],[0,Infinity],[9,0]]){assert.throws(()=>n.sample(x,y,p));rejected++;}
for(const [w,h] of [[0,2],[1.5,2],[2401,1],[2001,2000]]){assert.throws(()=>n.render(w,h,p));rejected++;}
const start=performance.now(),bytes=n.render(1200,900,p),elapsed=performance.now()-start;
fs.writeFileSync('proof/node-default.rgba',bytes);
fs.writeFileSync('proof/node-metadata.json',JSON.stringify({rejected,cpu_ms:elapsed,node:process.version,core_lines:n.source.split('\n').length,core_utf8_bytes:Buffer.byteLength(n.source),glsl_utf8_bytes:Buffer.byteLength(n.coreGLSL)}));
'''
subprocess.run(['node','-e',js],cwd=ROOT,check=True)
observed=np.array(json.loads((PROOF/'node-samples.json').read_text()));xy=np.array(coords)
expected=np.stack([reference.sample(xy[:,0],xy[:,1],p) for p in cases]);delta=np.abs(expected-observed)
checks=[{'name':'JS_NumPy_float_samples','pass':bool(delta.max()<=1e-10),'max_error':float(delta.max()),'parameter_states':len(cases),'coordinates_per_state':len(coords),'rgb_values':int(delta.size)}]
t0=time.perf_counter();raw=reference.render(1200,900,base);dt=time.perf_counter()-t0
jsraw=np.frombuffer((PROOF/'node-default.rgba').read_bytes(),dtype=np.uint8).reshape(raw.shape);d=np.abs(raw.astype(int)-jsraw.astype(int))
checks.append({'name':'full_1200x900_RGBA_comparison','pass':bool(d.max()<=1),'max_byte_error':int(d.max()),'different_bytes':int(np.count_nonzero(d)),'exact':bool(not np.any(d)),'sha256_numpy':hashlib.sha256(raw.tobytes()).hexdigest(),'sha256_node':hashlib.sha256(jsraw.tobytes()).hexdigest()})
meta=json.loads((PROOF/'node-metadata.json').read_text());checks.append({'name':'invalid_states_and_dimensions_rejected','pass':meta['rejected']==15,'cases':meta['rejected']})
test_count=unittest.defaultTestLoader.loadTestsFromModule(__import__('test_reference')).countTestCases()
trial=subprocess.run([sys.executable,'-m','unittest','test_reference.py','-v'],cwd=ROOT,capture_output=True,text=True);(PROOF/'reference-tests.log').write_text(trial.stdout+trial.stderr);checks.append({'name':'reference_mechanism_tests_including_gradient_mutation','pass':trial.returncode==0,'test_count':test_count})
t0=time.perf_counter();final=reference.render(1600,1200,base);final_seconds=time.perf_counter()-t0;Image.fromarray(final,'RGBA').save(PROOF/'nacre.png')
for s,name in enumerate(['blank','spiral','relief','pigment','finished']):Image.fromarray(reference.render(800,600,dict(base,stage=s)),'RGBA').save(PROOF/(name+'.png'))
(PROOF/'default-state.json').write_text(json.dumps({'format':'nacre-state-1','state':base},indent=2)+'\n')
report={'status':'PASS' if all(c['pass'] for c in checks) else 'FAIL','date':'2026-10-24','checks':checks,'source_sha256':{f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in ['src/nacre.js','reference.py','SPEC.md']},'core':meta,'timing':{'numpy_1200x900_seconds':dt,'numpy_1600x1200_seconds':final_seconds,'scope':'one local run; excludes PNG encoding and imports'},'limits':['Finite implementation checks, not mathematical proof for every state.','Original authored pixel art, not physical material or shell simulation.','No input photographs, image assets, offline renderer or learned image generator in pixel function.','Browser float32 comparison recorded separately.']}
(PROOF/'CPU_REPORT.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2));assert report['status']=='PASS'
