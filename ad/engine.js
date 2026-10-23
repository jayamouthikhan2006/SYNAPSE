/* motiondesign engine v2 — deterministic, time-driven, theme-agnostic.
   window.render(t, tCut) draws the exact frame for time t (seconds). Nothing about the LOOK is fixed here:
   palette, fonts, HUD style and scenes all come from the scene file, so every video can look different. */
(function () {
const W = 1920, H = 1080, PI = Math.PI;
const clamp = (x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const lerp = (a,b,p)=>a+(b-a)*p;
// ---------- easings ----------
const E = {
  linear:p=>p,
  inOut:p=>p<.5?4*p*p*p:1-Math.pow(-2*p+2,3)/2,
  in3:p=>p*p*p, out3:p=>1-Math.pow(1-p,3),
  expoIn:p=>p===0?0:Math.pow(2,10*p-10),
  expoOut:p=>p===1?1:1-Math.pow(2,-10*p),
  expoInOut:p=>p===0?0:p===1?1:p<.5?Math.pow(2,20*p-10)/2:(2-Math.pow(2,-20*p+10))/2,
  backOut:(p,s=1.9)=>1+(s+1)*Math.pow(p-1,3)+s*Math.pow(p-1,2),
  backIn:(p,s=1.9)=>(s+1)*p*p*p-s*p*p,
  elastic:p=>p===0?0:p===1?1:Math.pow(2,-10*p)*Math.sin((p*10-.75)*(2*PI/3))+1,
  bounce:p=>{const n=7.5625,d=2.75;if(p<1/d)return n*p*p;if(p<2/d)return n*(p-=1.5/d)*p+.75;if(p<2.5/d)return n*(p-=2.25/d)*p+.9375;return n*(p-=2.625/d)*p+.984375;},
  spring:(p,f=2.6,z=5.5)=>p<=0?0:p>=1?1:1-Math.exp(-z*p)*Math.cos(2*PI*f*p),
};
const P = (t,t0,d,ease=E.expoOut)=>ease(clamp((t-t0)/d));
const hash = n=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const rng = seed=>{let s=seed>>>0||1;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return((s>>>0)%100000)/100000;};};
const noise1 = x=>{const i=Math.floor(x),f=x-i,u=f*f*(3-2*f);return lerp(hash(i),hash(i+1),u)*2-1;};

const MD = { W,H,E,P,clamp,lerp,hash,rng,noise1,PI,
  fps:60, bpm:128, duration:15, brand:'BRAND', project:'PROJECT — 2026',
  theme:{ bg:'#111', fg:'#eee', accent:'#f40', alt:'#08f' },   // scene file overrides
  hudStyle:'none',                                             // 'none' | 'corners' | 'ticker' | custom fn
  tickerText:'', scenes:[], overlays:[], camera:null };
MD.beat=()=>60/MD.bpm; MD.bar=()=>4*MD.beat(); MD.b=n=>n*MD.beat(); MD.bars=n=>n*MD.bar();
MD.pulse=(t,k=9,div=1)=>{const b=MD.beat()/div;const x=((t%b)+b)%b;return Math.exp(-k*x);};
MD.shake=(t,t0,amp=14,dur=.35)=>{const d=t-t0;if(d<0||d>dur)return[0,0];const a=amp*(1-d/dur)**2;const f=Math.floor(t*60);return[(hash(f)-.5)*2*a,(hash(f+9)-.5)*2*a];};

// ---------- stage ----------
const root=document.getElementById('stage');
const sceneLayer=document.createElement('div');sceneLayer.className='layer';root.appendChild(sceneLayer);
const fx=document.createElement('canvas');fx.width=W;fx.height=H;fx.className='layer';root.appendChild(fx);
const hud=document.createElement('div');hud.className='layer hud';root.appendChild(hud);
const fxc=fx.getContext('2d'); MD.fx=fxc;

MD.el=(html,style='')=>{const d=document.createElement('div');d.innerHTML=html;d.style.cssText='position:absolute;'+style;return d;};
MD.canvas=parent=>{const c=document.createElement('canvas');c.width=W;c.height=H;c.style.cssText='position:absolute;inset:0;width:100%;height:100%';parent.appendChild(c);return c.getContext('2d');};
// word -> letter spans. o:{cls (font class), size, color, x,y, align, mask, style}
MD.word=(parent,text,o={})=>{
  const w=document.createElement('div'); w.className='word '+(o.cls||'');
  const left=o.x!=null?`left:${o.x}px;`:'left:0;right:0;';
  w.style.cssText=`position:absolute;${left}top:${o.y??H/2}px;transform:translateY(-50%);text-align:${o.align||'center'};font-size:${o.size||260}px;color:${o.color||MD.theme.fg};white-space:nowrap;${o.style||''}`;
  const spans=[];
  for(const ch of text){const m=document.createElement('span');m.className='m'+(o.mask===false?' nomask':'');
    const s=document.createElement('span');s.className='l';s.textContent=ch===' '?' ':ch;m.appendChild(s);w.appendChild(m);spans.push(s);}
  parent.appendChild(w); w.letters=spans; return w;
};
MD.set=(s,{x=0,y=0,sx=1,sy=1,r=0,rx=0,ry=0,sk=0,o=1,blur=0}={})=>{
  s.style.transform=`perspective(900px) translate(${x}px,${y}px) rotate(${r}deg) rotateX(${rx}deg) rotateY(${ry}deg) skewX(${sk}deg) scale(${sx},${sy})`;
  s.style.opacity=o; s.style.filter=blur>0.3?`blur(${blur}px)`:'none';
};

// ---------- TYPE FX library (pure functions of scene-local time). Mix freely; never reuse one set-piece order. ----------
MD.type={
  maskRise(ls,t,{at=0,stagger=.035,dur=.34,dist=1.15,ease=E.expoOut}={}){ls.forEach((s,i)=>{const t0=at+i*stagger,p=P(t,t0,dur,ease),v=1-p;MD.set(s,{y:v*dist*s.offsetHeight,sy:1+.45*v,sx:1-.15*v,blur:v*6,o:t<t0?0:1});});},
  squeeze(ls,t,{at=0,stagger=.05,dur=.3,from=125,to=62,ease=E.backOut,wg=900}={}){ls.forEach((s,i)=>{const p=P(t,at+i*stagger,dur,ease);s.style.fontVariationSettings=`"wdth" ${clamp(lerp(from,to,p),50,125)}, "wght" ${wg}`;});},
  slide(ls,t,{at=0,stagger=.03,dur=.28,dist=900,dir=1,ease=E.expoOut}={}){ls.forEach((s,i)=>{const t0=at+i*stagger,p=P(t,t0,dur,ease),v=1-p;MD.set(s,{x:-dir*dist*v,sx:1+.6*v,sk:-dir*18*v,blur:v*10,o:t<t0?0:1});});},
  // SLAM: drop from above, hugely stretched, land with squash, spring back
  slam(ls,t,{at=0,stagger=.03,dur=.22,dist=900}={}){ls.forEach((s,i)=>{const t0=at+i*stagger;const p=P(t,t0,dur,E.in3);const land=clamp((t-t0-dur)/.35);
    const sq=land>0?Math.exp(-7*land)*Math.cos(2*PI*2*land):0;
    MD.set(s,{y:-(1-p)*dist,sy:(p<1?1+1.6*(1-p)+.3:1)-.32*sq,sx:(p<1?.8:1)+.22*sq,blur:(1-p)*10,o:t<t0?0:1});});},
  // BOUNCE UP: thrown up from below, gravity, bounces on the baseline
  bounceUp(ls,t,{at=0,stagger=.04,dur=.5,dist=700}={}){ls.forEach((s,i)=>{const t0=at+i*stagger,p=clamp((t-t0)/dur),e=E.bounce(p);MD.set(s,{y:(1-e)*dist,sy:1+.35*(1-e)*(p<.36?1:0),o:t<t0?0:1});});},
  // FLIP: split-flap, each letter rotates in on X
  flip(ls,t,{at=0,stagger=.03,dur=.26}={}){ls.forEach((s,i)=>{const t0=at+i*stagger,p=P(t,t0,dur,E.backOut);MD.set(s,{rx:lerp(-100,0,p),o:t<t0?0:1});});},
  spinIn(ls,t,{at=0,stagger=.04,dur=.4}={}){ls.forEach((s,i)=>{const p=clamp((t-at-i*stagger)/dur),e=E.backOut(p,2.4);MD.set(s,{r:lerp(-180,0,E.expoOut(p)),sx:e,sy:e,o:p>0?1:0});});},
  pop(ls,t,{at=0,stagger=.03,dur=.5}={}){ls.forEach((s,i)=>{const p=clamp((t-at-i*stagger)/dur),e=E.elastic(p);MD.set(s,{sx:e,sy:e,o:p>0?1:0});});},
  arcDrop(ls,t,{at=0,stagger=.055,dur=.42}={}){ls.forEach((s,i)=>{const p=clamp((t-at-i*stagger)/dur),e=E.bounce(p),v=1-e;MD.set(s,{y:-620*v,x:120*v,r:-38*(1-E.expoOut(p)),o:p>0?1:0});});},
  // SCATTER exit: letters fly outward spinning
  scatter(ls,t,{at=0,dur=.3,seed=3,power=1}={}){const r=rng(seed);ls.forEach((s,i)=>{const a=r()*2*PI,d=(600+r()*700)*power,rr=(r()-.5)*540;const p=P(t,at,dur,E.expoIn);
    if(t<at)return;MD.set(s,{x:Math.cos(a)*d*p,y:Math.sin(a)*d*p,r:rr*p,sx:1-p*.5,sy:1-p*.5,o:1-p*.6,blur:p*8});});},
  collapse(ls,t,{at=0,stagger=.03,dur=.2}={}){ls.forEach((s,i)=>{const p=P(t,at+i*stagger,dur,E.expoIn);MD.set(s,{sx:1-p*.9,sy:1-p*.9,o:1-p,blur:p*4});});},
  // TYPE-ON with a block cursor (cursor element optional)
  typeOn(ls,t,{at=0,cps=28,cursor=null}={}){const n=Math.floor(clamp((t-at)*cps,0,ls.length));ls.forEach((s,i)=>MD.set(s,{o:i<n?1:0}));
    if(cursor){const last=ls[Math.max(0,n-1)];const r=last.getBoundingClientRect();cursor.style.left=(n?r.right+6:r.left)+'px';cursor.style.top=(r.top+r.height*.12)+'px';cursor.style.height=(r.height*.76)+'px';cursor.style.opacity=(Math.floor(t*4)%2||t-at<ls.length/cps)?1:0;}},
  // SCRAMBLE decode: random glyphs resolve left->right into the final text
  scramble(ls,t,final,{at=0,dur=.35,set='#%&$@*+=/<>01',seed=1}={}){ls.forEach((s,i)=>{const lock=at+dur*(i/ls.length);
    s.textContent=t>=lock?(final[i]===' '?' ':final[i]):(t<at-.02?' ':set[Math.floor(hash(i*31+Math.floor(t*40)+seed)*set.length)]);});},
  // RGB split stamp on a whole word element (uses text-shadow)
  rgbSplit(el,t,{at=0,dur=.25,dist=34,a='#19E3FF',b='#FF2D55'}={}){const v=1-P(t,at,dur,E.expoOut);
    el.style.textShadow=v>.02?`${-dist*v}px 0 0 ${a}, ${dist*v}px 0 0 ${b}`:'none';},
  echo(el,t,{at=0,dur=.3,dist=160,col='rgba(0,0,0,.4)'}={}){const v=1-P(t,at,dur,E.expoOut);el.style.transform=`translateY(-50%) scaleX(${1+.35*v})`;
    el.style.textShadow=v>.02?[1,2,3].map(k=>`${-k*dist*v/3}px 0 0 ${col}`).join(','):'none';},
  zoomThrough(el,t,{at=0,dur=.35,originX=.5}={}){const p=P(t,at,dur,E.expoIn);el.style.transformOrigin=`${originX*100}% 50%`;el.style.transform=`translateY(-50%) scale(${1+p*14})`;el.style.filter=p>.02?`blur(${p*18}px)`:'none';},
  // PUNCH: whole word springs from tiny to huge
  punch(el,t,{at=0,dur=.45,from=.15,to=1}={}){const p=clamp((t-at)/dur);const s=lerp(from,to,E.spring(p,1.8,6));el.style.transform=`translateY(-50%) scale(${Math.max(0,s)})`;},
};

// ---------- TRANSITIONS library (fx canvas, global time) ----------
MD.trans={
  iris(t,t0,{dur=.42,fill='#fff',x=W/2,y=H/2}={}){const d=t-t0;if(d<0||d>dur+.05)return;const R=Math.hypot(W,H)*.62,b=E.expoInOut(clamp(d/dur));fxc.fillStyle=fill;fxc.beginPath();fxc.arc(x,y,b*R,0,2*PI);fxc.fill();},
  wipe(t,t0,{dur=.3,color='#fff',angle=-12}={}){const d=t-t0;if(d<0||d>dur)return;const p=E.expoInOut(d/dur);fxc.save();fxc.translate(W/2,H/2);fxc.rotate(angle*PI/180);const w=W*1.6;fxc.fillStyle=color;fxc.fillRect(lerp(-w*1.5,w*.5,p),-H,w,H*2);fxc.restore();},
  dotFill(t,t0,{dur=.3,color='#fff',x=W/2,y=H/2,r0=30}={}){const d=t-t0;if(d<0||d>dur+.02)return;const p=E.expoIn(clamp(d/dur));fxc.fillStyle=color;fxc.beginPath();fxc.arc(x,y,lerp(r0,Math.hypot(W,H),p),0,2*PI);fxc.fill();},
  flash(t,t0,{dur=.12,color='#fff',max=.55}={}){const d=t-t0;if(d<0||d>dur)return;fxc.fillStyle=color;fxc.globalAlpha=max*(1-d/dur);fxc.fillRect(0,0,W,H);fxc.globalAlpha=1;},
  // --- cut-anchored transitions: pass the CUT time; they fully cover at the cut and uncover after it ---
  // BLINDS: n strips close (staggered) into the cut, then open away from it
  blinds(t,cut,{n=10,dur=.2,stagger=.014,color='#fff',vertical=true}={}){const L=vertical?W:H,S=L/n;fxc.fillStyle=color;
    for(let i=0;i<n;i++){let w;if(t<cut){const u=clamp((t-(cut-dur-(n-1)*stagger)-i*stagger)/dur);w=S*E.expoOut(u);if(u<=0)continue;}
      else{const u=clamp((t-cut-i*stagger)/dur);w=S*(1-E.expoIn(u));if(u>=1)continue;}
      if(vertical)fxc.fillRect(i*S+(t<cut?0:S-w),0,w+1,H);else fxc.fillRect(0,i*S+(t<cut?0:S-w),W,w+1);}},
  // SLICES: horizontal bands shoot in from alternating sides into the cut, exit the other side after
  slices(t,cut,{n=9,dur=.18,stagger=.012,color='#fff'}={}){const h=H/n;fxc.fillStyle=color;
    for(let i=0;i<n;i++){const dir=i%2?1:-1;let x;
      if(t<cut){const u=clamp((t-(cut-dur-(n-1)*stagger)-i*stagger)/dur);if(u<=0)continue;x=dir*W*(1-E.expoOut(u))*-1;}
      else{const u=clamp((t-cut-i*stagger)/dur);if(u>=1)continue;x=dir*W*E.expoIn(u);}
      fxc.fillRect(x,i*h,W,h+1);}},
  // LINE SNAP: frame pinches to a glowing line at the cut, then snaps open
  lineSnap(t,cut,{dur=.16,color='#fff',bg='#000'}={}){const d=t-cut;if(d<-dur||d>dur)return;
    const hgt=d<0?lerp(H,3,E.expoIn(1+d/dur)):lerp(3,H,E.expoOut(d/dur));const cov=(H-hgt)/2;fxc.fillStyle=bg;fxc.fillRect(0,0,W,cov);fxc.fillRect(0,H-cov,W,cov);
    if(hgt<60){fxc.fillStyle=color;fxc.shadowColor=color;fxc.shadowBlur=30;fxc.fillRect(0,H/2-2,W,4);fxc.shadowBlur=0;}},
  // SHAPE WIPE: a shape (e.g. the project's mark) grows to swallow the frame at the cut
  shapeWipe(t,cut,pts,{dur=.3,color='#fff',x=W/2,y=H/2,rot=0}={}){const d=t-cut;if(d<-dur||d>=0)return;const p=E.expoIn(1+d/dur);
    MD.drawShape(fxc,pts,{x,y,s:lerp(10,Math.hypot(W,H)*1.6,p),r:rot+p*1.2,fill:color});},
};
// camera helpers (return {x,y,s,r}); set MD.camera=t=>({...}) in the scene file
MD.whip=(t,tc,{dur=.18,dist=W*.9}={})=>{const d=t-tc;if(Math.abs(d)>dur)return 0;return d<0?-dist*E.expoIn(1+d/dur):dist*(1-E.expoOut(d/dur));};

// ---------- SHAPES / GENERATIVE ----------
function resample(pts,n){const seg=[];let L=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];const l=Math.hypot(b[0]-a[0],b[1]-a[1]);seg.push(l);L+=l;}
  const out=[];let i=0,acc=0;for(let k=0;k<n;k++){const target=k/n*L;while(acc+seg[i]<target){acc+=seg[i];i++;}const a=pts[i],b=pts[(i+1)%pts.length];const u=(target-acc)/seg[i];out.push([lerp(a[0],b[0],u),lerp(a[1],b[1],u)]);}return out;}
MD.resample=resample;
MD.shape=(kind,n=240)=>{const poly=(k,inner=null)=>{const v=[];const m=inner?k*2:k;for(let i=0;i<m;i++){const a=-PI/2+i*2*PI/m;const r=inner&&i%2?inner:1;v.push([Math.cos(a)*r,Math.sin(a)*r]);}return v;};
  if(kind==='circle'){const v=[];for(let i=0;i<n;i++){const a=-PI/2+i*2*PI/n;v.push([Math.cos(a),Math.sin(a)]);}return v;}
  if(kind==='triangle')return resample(poly(3),n); if(kind==='star')return resample(poly(5,.45),n); if(kind==='hex')return resample(poly(6),n);
  if(kind==='square')return resample([[-1,-1],[1,-1],[1,1],[-1,1]].map(([x,y])=>[x*.8,y*.8]),n);
  return MD.shape('circle',n);};
MD.drawShape=(ctx,pts,{x,y,s,r=0,fill='#fff',stroke=null,lw=3,sx=1,sy=1})=>{ctx.save();ctx.translate(x,y);ctx.rotate(r);ctx.scale(sx,sy);ctx.beginPath();
  pts.forEach(([px,py],i)=>i?ctx.lineTo(px*s,py*s):ctx.moveTo(px*s,py*s));ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lw;ctx.stroke();}ctx.restore();};
MD.morph=(a,b,p)=>a.map((q,i)=>q.map((v,k)=>lerp(v,b[i][k],p)));
MD.cloud=(kind,n=26)=>{const pts=[];for(let i=0;i<n;i++)for(let j=0;j<n;j++){const u=i/(n-1),v=j/(n-1);
  if(kind==='grid')pts.push([(u-.5)*2.4,0,(v-.5)*2.4]);
  if(kind==='sphere'){const th=u*PI,ph=v*2*PI;pts.push([Math.sin(th)*Math.cos(ph),Math.cos(th),Math.sin(th)*Math.sin(ph)]);}
  if(kind==='torus'){const a=u*2*PI,b=v*2*PI,R=.8,r=.32;pts.push([(R+r*Math.cos(b))*Math.cos(a),r*Math.sin(b),(R+r*Math.cos(b))*Math.sin(a)]);}
  if(kind==='helix'){const a=u*6*PI;pts.push([Math.cos(a+v*2*PI)*.6,(u-.5)*2.2,Math.sin(a+v*2*PI)*.6]);}}return pts;};
MD.drawCloud=(ctx,pts,{rx=0,ry=0,scale=380,cx=W/2,cy=H/2,dot=3.2,camZ=3.2,col=(i,d)=>`rgba(255,255,255,${d})`}={})=>{
  const cr=Math.cos(rx),sr=Math.sin(rx),cY=Math.cos(ry),sY=Math.sin(ry);
  pts.forEach((p,i)=>{const[x,y,z]=p;const x1=x*cY+z*sY,z1=-x*sY+z*cY,y1=y*cr-z1*sr,z2=y*sr+z1*cr;const d=camZ+z2;if(d<.15)return;
    const k=camZ/d;ctx.fillStyle=col(i,clamp(1.4-d/camZ*.7,.15,1));ctx.beginPath();ctx.arc(cx+x1*scale*k,cy+y1*scale*k,dot*k,0,2*PI);ctx.fill();});};
MD.truchet=(ctx,t,{cell=120,lw=22,seed=7,reveal=1,wave=-1,waveW=260,cx=W/2,cy=H/2,base='#fff',hot='#f40'}={})=>{const r=rng(seed);const cols=Math.ceil(W/cell)+1,rows=Math.ceil(H/cell)+1;ctx.lineWidth=lw;
  for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){const flip=r()>.5;const x=i*cell-(cols*cell-W)/2,y=j*cell-(rows*cell-H)/2;const dist=Math.hypot(x+cell/2-cx,y+cell/2-cy);
    const appear=clamp((reveal*Math.hypot(W,H)/2*1.15-dist)/140);if(appear<=0)continue;const w=wave<0?0:clamp(1-Math.abs(dist-wave)/waveW);ctx.strokeStyle=w>0?mix(base,hot,w):base;
    ctx.save();ctx.translate(x+cell/2,y+cell/2);if(flip)ctx.rotate(PI/2);ctx.scale(appear,appear);ctx.beginPath();ctx.arc(-cell/2,-cell/2,cell/2,0,PI/2);ctx.stroke();ctx.beginPath();ctx.arc(cell/2,cell/2,cell/2,PI,1.5*PI);ctx.stroke();ctx.restore();}};
function hex2rgb(h){h=h.replace('#','');return[0,2,4].map(i=>parseInt(h.substr(i,2),16));}
function mix(a,b,p){const A=hex2rgb(a),B=hex2rgb(b);return`rgb(${A.map((v,i)=>Math.round(lerp(v,B[i],p))).join(',')})`;}
MD.mix=mix;
// multi-stop gradient lookup: MD.ramp(['#00f','#ff0','#f00'], 0..1)
MD.ramp=(stops,p)=>{p=clamp(p);const n=stops.length-1;const i=Math.min(n-1,Math.floor(p*n));return mix(stops[i],stops[i+1],p*n-i);};

// ---------- HUD styles ----------
const $=id=>document.getElementById(id);
let hudBuilt=null;
function tc(t){const f=Math.floor(t*MD.fps+1e-6),s=Math.floor(f/MD.fps);return`00:00:${String(s).padStart(2,'0')}:${String(f%MD.fps).padStart(2,'0')}`;}
const HUDS={
  none(){hud.innerHTML='';},
  corners:{build(){hud.innerHTML=`<i class="br tl"></i><i class="br tr"></i><i class="br bl"></i><i class="br brr"></i><div class="h tlx"><b id="hb"></b><span id="hp"></span></div><div class="h trx"><b id="hs"></b></div><div class="h blx"><b id="htc"></b></div><div class="h brx"><span id="hbpm"></span><span id="hq"></span></div>`;},
    draw(t,sc){$('hb').textContent=MD.brand;$('hp').textContent=MD.project;$('hs').textContent=sc.label||'';$('htc').textContent=tc(t);$('hbpm').textContent=`${MD.bpm} BPM`;
      const bi=Math.floor(t/MD.beat()+1e-6)%4;$('hq').innerHTML=[0,1,2,3].map(i=>`<em class="${i===bi?'on':''}"></em>`).join('');}},
  // ticker: bottom data band that scrolls, beat meter, tiny frame counter; top-left label only
  ticker:{build(){hud.innerHTML=`<div class="tk-top"><b id="hb"></b><span id="hs"></span></div><div class="tk-tc" id="htc"></div>
      <div class="tk-band"><div class="tk-run" id="hrun"></div><div class="tk-meter" id="hm"></div></div>`;},
    draw(t,sc){$('hb').textContent=MD.brand;$('hs').textContent=sc.label||'';$('htc').textContent=tc(t);
      const txt=(MD.tickerText+'   ').repeat(6);const run=$('hrun');if(run.textContent!==txt)run.textContent=txt;run.style.transform=`translateX(${-(t*140)%900}px)`;
      const bars=[0,1,2,3,4,5,6,7].map(i=>{const h=4+22*MD.pulse(t-i*.03,7,2)*(i%3===0?1:.6);return`<em style="height:${h}px"></em>`;}).join('');$('hm').innerHTML=bars;}},
};

// ---------- RENDER ----------
let current=null;
window.render=function(t,tCut){
  const tcut=tCut??t;
  const sc=MD.scenes.find(s=>tcut>=s.start&&tcut<s.end)||MD.scenes[MD.scenes.length-1];
  if(sc!==current){sceneLayer.innerHTML='';const host=document.createElement('div');host.className='layer';sceneLayer.appendChild(host);sc.host=host;sc.build&&sc.build(host,sc);current=sc;}
  root.style.background=typeof sc.bg==='function'?sc.bg(t-sc.start):(sc.bg||MD.theme.bg);
  sc.update&&sc.update(t-sc.start,sc,t);
  const cam=MD.camera?MD.camera(t):null; const [shx,shy]=MD.shakeAt?MD.shakeAt(t):[0,0];
  sceneLayer.style.transform=`translate(${(cam?.x||0)+shx}px,${(cam?.y||0)+shy}px) scale(${cam?.s??1}) rotate(${cam?.r||0}deg)`;
  fxc.clearRect(0,0,W,H); MD.overlays.forEach(o=>o(t));
  const hs=typeof MD.hudStyle==='function'?null:HUDS[MD.hudStyle];
  if(typeof MD.hudStyle==='function'){MD.hudStyle(hud,t,sc);}
  else if(hs&&hs.build){if(hudBuilt!==MD.hudStyle){hs.build();hudBuilt=MD.hudStyle;}hud.style.color=sc.hud||MD.theme.fg;hud.style.setProperty('--hud',sc.hud||MD.theme.fg);hud.style.opacity=MD.hudOpacity?MD.hudOpacity(t):1;hs.draw(t,sc);}
  else if(hudBuilt!=='none'){HUDS.none();hudBuilt='none';}
};
window.MD=MD;
})();
