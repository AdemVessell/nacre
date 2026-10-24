from pathlib import Path
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parent

def render(n=9,twist=5.5,t=0,W=1200,H=900):
 y,x=np.mgrid[0:H,0:W];x=(2*x+1-W)/H;y=(H-2*y-1)/H
 r2=x*x+y*y+1e-9;r=np.sqrt(r2);theta=np.arctan2(y,x)
 q=n*theta-twist*np.log(r2+.008)+t
 f=.5+.5*np.cos(q); fr=twist*r/(r2+.008)*np.sin(q);ft=-.5*n*np.sin(q)
 E=np.exp(-(r/.76)**8);Er=-8*r**7/.76**8*E;B=1-np.exp(-r2/.008);Br=2*r/.008*np.exp(-r2/.008)
 A=E*B;Ar=Er*B+E*Br
 z=.10*A*(.16+f**3);zr=.10*(Ar*(.16+f**3)+A*3*f*f*fr);zt=.10*A*3*f*f*ft
 hx=zr*x/r-zt*y/r2;hy=zr*y/r+zt*x/r2
 N=np.stack([-hx,-hy,np.ones_like(x)],axis=-1);N/=np.linalg.norm(N,axis=-1)[...,None]
 L=np.array([-.45,.65,1]);L/=np.linalg.norm(L);V=L+np.array([0,0,1]);V/=np.linalg.norm(V)
 diffuse=np.maximum(0,N@L);spec=np.maximum(0,N@V)**42
 pal=.52+.40*np.cos((3.0*r+.6*N[...,2])[...,None]+np.array([0,1.2,2.7]))
 base=pal*(.16+.9*diffuse)[...,None]+spec[...,None]*np.array([1.1,1.0,.95])
 base+=((1-N[...,2])**3)[...,None]*np.array([.13,.3,.32])
 bg=np.ones((H,W,3))*np.array([.008,.016,.024]);bg+=np.exp(-((x+.6)**2+(y-.5)**2)/.7)[...,None]*np.array([.012,.025,.03])
 mask=np.clip((E-.012)/.12,0,1);mask=mask*mask*(3-2*mask)
 C=bg*(1-mask[...,None])+base*mask[...,None]
 C=1-np.exp(-1.25*C);C=np.floor(np.clip(C,0,1)**(1/2.2)*255).astype('uint8')
 return C
for n,k in [(7,3.5),(11,5.5),(17,8.0)]:
 a=render(n,k);Image.fromarray(a).save(ROOT/f'study-{n}.png')
