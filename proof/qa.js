'use strict';
const canvas=document.querySelector('canvas'),out=document.querySelector('#report'),run=document.querySelector('#run');
run.addEventListener('click',async()=>{
 run.disabled=true;out.textContent='Running measured pixel comparisons…';const report={status:'RUNNING',version:Nacre.version,width:600,height:450,checks:[]};let renderer;
 try{
 renderer=Nacre.createRenderer(canvas);
 const cases=[['default',{}],['spiral',{stage:1}],['relief',{stage:2}],['pigment',{stage:3}],['blank',{stage:0}],['flat',{relief:0}],['radial',{twist:0}],['dense',{arms:21,twist:9,phase:2.8}],['reverse',{arms:3,twist:-9,relief:1.5,hue:3,light:-3}]];
 const perf=[];
 for(const [name,patch] of cases){
  const p={...Nacre.defaults(),...patch};const start=performance.now();renderer.draw(p);const gpu=renderer.readPixels();const gpuMs=performance.now()-start;
  const cstart=performance.now(),cpu=Nacre.render(600,450,p),cpuMs=performance.now()-cstart;
  let max=0,sum=0,over2=0,different=0;for(let i=0;i<gpu.length;i++){if(i%4===3)continue;const d=Math.abs(gpu[i]-cpu[i]);max=Math.max(max,d);sum+=d;over2+=d>2;different+=d!==0;}
  const channels=600*450*3,pass=max<=12&&over2/channels<=.001;report.checks.push({name:'GPU_vs_CPU_'+name,pass,max_byte_error:max,mean_byte_error:sum/channels,channels_over_2:over2,channels,different_channels:different});
  renderer.draw(p);const again=renderer.readPixels();report.checks.push({name:'repeat_'+name,pass:gpu.every((v,i)=>v===again[i])});
  perf.push({name,gpu_draw_and_read_ms:gpuMs,cpu_render_ms:cpuMs});out.textContent=JSON.stringify(report,null,2);await new Promise(requestAnimationFrame);
 }
 const p=Nacre.defaults();renderer.draw({...p,stage:0});const blank=renderer.readPixels();renderer.draw({...p,stage:0,arms:21,twist:-9,relief:1.5,hue:3,light:-3,phase:6});const blank2=renderer.readPixels();report.checks.push({name:'blank_independent',pass:blank.every((v,i)=>v===blank2[i])});
 renderer.draw({...p,stage:3,light:-2});const pigment=renderer.readPixels();renderer.draw({...p,stage:3,light:2});const pigment2=renderer.readPixels();report.checks.push({name:'pigment_light_independent',pass:pigment.every((v,i)=>v===pigment2[i])});
 renderer.draw(p);report.timings=perf;report.timing_note='One local 600×450 run; GPU time includes synchronous readback, not a general performance benchmark.';report.status=report.checks.every(c=>c.pass)?'PASS':'FAIL';report.userAgent=navigator.userAgent;report.renderer=renderer.gl.getParameter(renderer.gl.RENDERER);
 }catch(e){report.status='ERROR';report.error=e.message;}
 out.textContent=JSON.stringify(report,null,2);document.title='NACRE verification: '+report.status;run.disabled=false;
});
