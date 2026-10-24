# NACRE — direct pixel contract, version 1

Original equation artwork. A pearl-like spiral rosette, created entirely by a closed pixel-colour function. This is an authored illustration, not a shell simulation, optical/material calibration, inferred photograph, or claim of novelty for procedural graphics. The browser may execute the function in a fragment shader for parallel arithmetic; no image textures, meshes of the subject, ray tracing, external renderer or learned image generator supplies its appearance.

## Interface

CommonJS/browser global `Nacre`, defined in src/nacre.js. `defaults()` returns `{arms:11,twist:5.5,relief:1,hue:0,light:0,phase:0,stage:4}`. `validate(p)` requires exactly these keys, finite numbers; arms integer 3..21; twist -9..9; relief 0..1.5; hue -3.14..3.14; light -3.14..3.14; phase -6.284..6.284; stage integer 0..4. No implicit state mutation. `sample(x,y,p)` returns 3 display floats 0..1, rejects nonfinite or |coordinate|>8. `render(w,h,p)` returns Uint8Array RGBA, bottom-to-top false (ordinary top-left row order); floor(255*display + .5); alpha 255. Dimensions integer 1..2400, <=4 million pixels. `createRenderer(canvas)` returns `{draw(p),readPixels(),destroy()}`; draw uses canvas width/height, readPixels returns top-left RGBA. Shader and CPU share this written contract, not a baked image. `equations` exposes five objects `{title,tex,description}`. `source` holds the complete CPU pixel function for on-page inspection. `coreGLSL` is the literal fragment function source. UI file ownership separate from math.

## Coordinates and functions

For pixel i,j in W,H: x=(2i+1-W)/H, y=(H-2j-1)/H. Background is continuous over the plane. Scale is artistic, without physical units. Let S(a)=c²(3-2c), c=clamp(a,0,1). Vectors multiply componentwise where applicable. dot/normalize have their usual Euclidean meanings.

Set n=arms, k=twist; scalar additions/multiplications broadcast across RGB, and cos/max/powers act componentwise on vectors.

r=max(sqrt(x²+y²),0.0001); theta=atan2(y,x), with theta=0 inside the regularization disc x²+y²<1e-8. q=n*theta-k*ln(r²+0.008)+phase. f=(1+cos q)/2.

E=exp[-(r/0.76)^8]; B=1-exp(-r²/0.008); A=E*B.
H=0.10*relief*A*(0.16+f³).

The regularization disc is explicitly constant in radius and angle, with a tiny discontinuity at its boundary; no globally smooth-gradient claim is made. In it Hx=Hy=0. Outside it derivatives are:
Er=-8*r^7/0.76^8*E; Br=2*r/0.008*exp(-r²/0.008); Ar=Er*B+E*Br.
fr=k*r/(r²+0.008)*sin(q); ftheta=-n*sin(q)/2.
Hr=0.10*relief*[Ar*(0.16+f³)+3*A*f²*fr]; Htheta=0.30*relief*A*f²*ftheta.
Hx=Hr*x/r-Htheta*y/r²; Hy=Hr*y/r+Htheta*x/r².
N=normalize(-Hx,-Hy,1).

Rotate (u,v)=(-0.45,0.65) counterclockwise by light: (u cos(light)-v sin(light), u sin(light)+v cos(light)); L=normalize(rotatedX,rotatedY,1); V=normalize(L+(0,0,1)). d=max(dot(N,L),0); s=max(dot(N,V),0)^42.
P=0.58+0.31*cos(3*r+0.6*Nz+hue+(0,1.2,2.7)).
C=P*(0.16+0.90*d)+s*(1.10,1.00,0.95)+(1-Nz)^3*(0.13,0.30,0.32).

b=(0.001,0.0025,0.004)+exp[-((x+0.6)^2+(y-0.5)^2)/0.7]*(0.002,0.005,0.008).
m=S((0.835+0.026*cos q-r)/0.018).
Final radiance-like artistic colour c=b*(1-m)+C*m. Display D=(1-exp(-1.25*max(c,0)))^(1/2.2). This is an artistic tone/gamma curve, not a claim of calibrated colour.

## Five construction views

0 Blank: c=b.
1 Spiral: c=m*[ (0.04,0.12,0.16)+f*(0.12,0.36,0.40) ]+(1-m)*b.
2 Relief: compute N as above; C=(0.72,0.76,0.80)*(0.16+0.90*d)+s*(1.10,1.00,0.95), composite through m.
3 Pearl: C=P (colour with no illumination), composite through m.
4 Finished: full C formula.

Each view applies the same final display conversion. Phase is an authored phase change, not fluid motion. Integer n makes the angular branch-cut invisible away from the tiny stated center regularization region. Final composition will default to n=11, k=5.5; controls may explore other values.

## Verification contract (before implementation cross-check)

The independent NumPy implementation is written from this contract. Compare CPU floating samples to <=1e-10 absolute error across default, parameter corners, all stages, and an explicit center sample; render full 1200×900 buffers and report all byte differences (allow maximum 1 byte for numerical rounding, do not call it exact if differing). Compare browser float32 fragment output to CPU at 600×450: maximum <=12/255 and at least 99.9% of RGB channel errors <=2/255; report raw maximum, mean and counts. Float32/pixel quantization is not double-precision identity. Repeat browser draw same parameters must produce byte-identical buffers on this browser/device.

Controls: relief=0 must make H=0 and N=(0,0,1); zero twist must remove radial winding; stage 0 is independent of all scene parameters; light changes stage 4 but not stage 3; q+2*pi must preserve colour within float tolerance; angular seam at x<0 must be continuous for integer n. Check analytic gradients against finite differences away from regularization disc, with abs/relative tolerance declared in tests. A deliberately sign-flipped gradient must fail this test. Reject unknown keys, malformed states, infinities, out-of-range values. Check no network/image texture dependency in executable art core. Record failures and repaired reruns honestly.

Compactness is source size and a short composition of named functions, not proof of a shortest representation. Report complete core code size; include palette, background, lighting and display conversion in the visible math. The artwork was reviewed locally before website and GitHub publication were authorized on24October2026.
