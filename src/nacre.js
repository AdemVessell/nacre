/* NACRE: explicit pixel equations. No image inputs or external rendering engine. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.Nacre=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
'use strict';
const DEFAULTS={arms:11,twist:5.5,relief:1,hue:0,light:0,phase:0,stage:4};
const ranges={arms:[3,21],twist:[-9,9],relief:[0,1.5],hue:[-3.14,3.14],light:[-3.14,3.14],phase:[-6.284,6.284],stage:[0,4]};
function defaults(){return {...DEFAULTS};}
function validate(p){
 if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).length!==7||Object.keys(p).some(k=>!Object.prototype.hasOwnProperty.call(ranges,k)))throw Error('Expected the seven NACRE parameters.');
 for(const key of Object.keys(ranges)){const v=p[key],[lo,hi]=ranges[key];if(typeof v!=='number'||!Number.isFinite(v)||v<lo||v>hi||((key==='arms'||key==='stage')&&!Number.isInteger(v)))throw Error('Invalid '+key);}
 return {...p};
}
function clamp(v){return Math.min(1,Math.max(0,v));}
function smooth(v){v=clamp(v);return v*v*(3-2*v);}
function unit(v){const d=Math.hypot(...v);return v.map(a=>a/d);}
function dot(a,b){return a[0]*b[0]+a[1]*b[1]+a[2]*b[2];}
function pixel(x,y,p){
 const {arms:n,twist:k,relief,hue,light,phase,stage}=p;
 const raw=x*x+y*y,r=Math.max(Math.sqrt(raw),.0001),r2=r*r;
 const theta=raw<1e-8?0:Math.atan2(y,x),q=n*theta-k*Math.log(r2+.008)+phase;
 const f=(1+Math.cos(q))/2,E=Math.exp(-Math.pow(r/.76,8)),b0=Math.exp(-r2/.008),B=1-b0,A=E*B;
 const Er=-8*Math.pow(r,7)/Math.pow(.76,8)*E,Br=2*r/.008*b0,Ar=Er*B+E*Br;
 const fr=k*r/(r2+.008)*Math.sin(q),ft=-n*Math.sin(q)/2;
 const Hr=.10*relief*(Ar*(.16+f*f*f)+3*A*f*f*fr),Ht=.30*relief*A*f*f*ft;
 const hx=raw<1e-8?0:Hr*x/r-Ht*y/r2,hy=raw<1e-8?0:Hr*y/r+Ht*x/r2;
 const N=unit([-hx,-hy,1]),a=Math.cos(light),b=Math.sin(light);
 const L=unit([-.45*a-.65*b,-.45*b+.65*a,1]),V=unit([L[0],L[1],L[2]+1]);
 const d=Math.max(0,dot(N,L)),s=Math.pow(Math.max(0,dot(N,V)),42);
 const P=[0,1.2,2.7].map(o=>.58+.31*Math.cos(3*r+.6*N[2]+hue+o));
 const rim=Math.pow(1-N[2],3),g=Math.exp(-((x+.6)**2+(y-.5)**2)/.7);
 const bg=[.001+.002*g,.0025+.005*g,.004+.008*g],m=smooth((.835+.026*Math.cos(q)-r)/.018);
 let C=P.map((v,i)=>v*(.16+.90*d)+s*[1.10,1,.95][i]+rim*[.13,.30,.32][i]);
 if(stage===0)C=bg;
 else if(stage===1)C=[.04+.12*f,.12+.36*f,.16+.40*f];
 else if(stage===2)C=[.72,.76,.80].map((v,i)=>v*(.16+.90*d)+s*[1.10,1,.95][i]);
 else if(stage===3)C=P;
 return C.map((v,i)=>Math.pow(1-Math.exp(-1.25*Math.max(0,stage===0?bg[i]:bg[i]*(1-m)+v*m)),1/2.2));
}
function sample(x,y,p){if(!Number.isFinite(x)||!Number.isFinite(y)||Math.abs(x)>8||Math.abs(y)>8)throw Error('Invalid pixel coordinates.');return pixel(x,y,validate(p));}
function dimensions(w,h){if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>2400||h>2400||w*h>4000000)throw Error('Invalid render dimensions.');}
function render(w,h,p){dimensions(w,h);p=validate(p);const data=new Uint8Array(w*h*4);for(let j=0;j<h;j++)for(let i=0;i<w;i++){const c=pixel((2*i+1-w)/h,(h-2*j-1)/h,p),o=4*(j*w+i);for(let k=0;k<3;k++)data[o+k]=Math.floor(255*clamp(c[k])+.5);data[o+3]=255;}return data;}
const coreGLSL=String.raw`
float sat(float v){return clamp(v,0.,1.);}
float ease(float v){v=sat(v);return v*v*(3.-2.*v);}
vec3 pixel(vec2 xy){
 float x=xy.x,y=xy.y,raw=dot(xy,xy),r=max(sqrt(raw),.0001),r2=r*r;
 float theta=0.;if(raw>=1e-8)theta=atan(y,x);float q=arms*theta-twist*log(r2+.008)+phase;
 float f=(1.+cos(q))*.5,E=exp(-pow(r/.76,8.)),b0=exp(-r2/.008),B=1.-b0,A=E*B;
 float Er=-8.*pow(r,7.)/pow(.76,8.)*E,Br=2.*r/.008*b0,Ar=Er*B+E*Br;
 float fr=twist*r/(r2+.008)*sin(q),ft=-arms*sin(q)*.5;
 float Hr=.10*relief*(Ar*(.16+f*f*f)+3.*A*f*f*fr),Ht=.30*relief*A*f*f*ft;
 float hx=raw<1e-8?0.:Hr*x/r-Ht*y/r2,hy=raw<1e-8?0.:Hr*y/r+Ht*x/r2;
 vec3 N=normalize(vec3(-hx,-hy,1.));float a=cos(light),b=sin(light);
 vec3 L=normalize(vec3(-.45*a-.65*b,-.45*b+.65*a,1.)),V=normalize(L+vec3(0.,0.,1.));
 float d=max(0.,dot(N,L)),s=pow(max(0.,dot(N,V)),42.);
 vec3 P=.58+.31*cos(vec3(3.*r+.6*N.z+hue)+vec3(0.,1.2,2.7));
 float rim=pow(1.-N.z,3.),g=exp(-((x+.6)*(x+.6)+(y-.5)*(y-.5))/.7);
 vec3 bg=vec3(.001,.0025,.004)+g*vec3(.002,.005,.008);float m=ease((.835+.026*cos(q)-r)/.018);
 vec3 C=P*(.16+.90*d)+s*vec3(1.10,1.,.95)+rim*vec3(.13,.30,.32);
 if(stage==0)C=bg;
 else if(stage==1)C=vec3(.04,.12,.16)+f*vec3(.12,.36,.40);
 else if(stage==2)C=vec3(.72,.76,.80)*(.16+.90*d)+s*vec3(1.10,1.,.95);
 else if(stage==3)C=P;
 C=stage==0?bg:mix(bg,C,m);
 return pow(vec3(1.)-exp(-1.25*max(C,vec3(0.))),vec3(1./2.2));
}`;
function createRenderer(canvas){
 const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true,premultipliedAlpha:false});
 if(!gl)throw Error('WebGL 2 is unavailable in this browser. The CPU reference and PNG export remain available in the source package.');
 const vs='#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}';
 const fs='#version 300 es\nprecision highp float;\nuniform vec2 resolution;\nuniform float arms,twist,relief,hue,light,phase;\nuniform int stage;\nout vec4 colour;\n'+coreGLSL+'\nvoid main(){colour=vec4(pixel((2.*gl_FragCoord.xy-resolution)/resolution.y),1.);}';
 function compile(type,src){const shader=gl.createShader(type);gl.shaderSource(shader,src);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const e=gl.getShaderInfoLog(shader);gl.deleteShader(shader);throw Error(e);}return shader;}
 const vert=compile(gl.VERTEX_SHADER,vs),frag=compile(gl.FRAGMENT_SHADER,fs),program=gl.createProgram();gl.attachShader(program,vert);gl.attachShader(program,frag);gl.linkProgram(program);
 if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));
 const uniforms={};for(const name of ['resolution',...Object.keys(DEFAULTS)])uniforms[name]=gl.getUniformLocation(program,name);
 return {draw(p){p=validate(p);dimensions(canvas.width,canvas.height);gl.viewport(0,0,canvas.width,canvas.height);gl.useProgram(program);gl.uniform2f(uniforms.resolution,canvas.width,canvas.height);for(const key of Object.keys(DEFAULTS)){if(key==='stage')gl.uniform1i(uniforms[key],p[key]);else gl.uniform1f(uniforms[key],p[key]);}gl.drawArrays(gl.TRIANGLES,0,3);if(gl.getError()!==gl.NO_ERROR)throw Error('The GPU draw failed.');},
 readPixels(){const w=canvas.width,h=canvas.height,raw=new Uint8Array(w*h*4),top=new Uint8Array(raw.length);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,raw);for(let j=0;j<h;j++)top.set(raw.subarray(j*w*4,(j+1)*w*4),(h-1-j)*w*4);return top;},
 destroy(){gl.deleteProgram(program);gl.deleteShader(vert);gl.deleteShader(frag);const ext=gl.getExtension('WEBGL_lose_context');if(ext)ext.loseContext();},gl};
}
const equations=[
 {title:'A place for the light',tex:String.raw`b(x,y)=b_0+e^{-((x+0.6)^2+(y-0.5)^2)/0.7}b_1`,description:'Begin with a dark colour field. Even this background comes from the same pixel function.'},
 {title:'A spiral, written once',tex:String.raw`q=n\theta-k\ln(r^2+0.008)+\varphi,\qquad f=\frac{1+\cos q}{2}`,description:'Angle repeats the folds; the logarithm winds them toward the centre. One expression repeats at every pixel.'},
 {title:'The illusion of a fold',tex:String.raw`H=0.10a\,e^{-(r/0.76)^8}(1-e^{-r^2/0.008})(0.16+f^3),\quad N=\frac{(-H_x,-H_y,1)}{\|(-H_x,-H_y,1)\|}`,description:'The slope of an imagined height field supplies a light-facing direction. This is direct shading arithmetic, not a rendered 3D mesh.'},
 {title:'Colour with a rhythm',tex:String.raw`P=0.58+0.31\cos\!\left(3r+0.6N_z+h+(0,1.2,2.7)\right)`,description:'Three offset cosines create the pearl palette. This view removes illumination so you can see the pigment field alone.'},
 {title:'Every pixel, accounted for',tex:String.raw`C=P(0.16+0.90[N\!\cdot\!L]_+)+[N\!\cdot\!V]_+^{42}(1.10,1,0.95)+(1-N_z)^3(0.13,0.30,0.32)`,description:'Combine diffuse light, a narrow highlight and a grazing tint. The outline and display curve below finish the image.'}
];
const source=[clamp,smooth,unit,dot,pixel].map(f=>f.toString()).join('\n');
return {defaults,validate,sample,render,createRenderer,equations,source,coreGLSL,pixel,version:'nacre-1'};
});
