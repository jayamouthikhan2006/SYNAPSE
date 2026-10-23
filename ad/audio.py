#!/usr/bin/env python3
"""Original beat synth for motiondesign videos (no samples, nothing copied).
FLAVORS change the sound per video: "flavor":"stab"|"reese"|"pluck", "kick":"four"|"broken", "key", "bpm", "prog", "stutter":[t..] (16th tick bursts).
usage: python3 audio.py cues.json out.wav
cues.json = {"bpm":128,"bars":8,
  "sections":[{"from":0,"to":1,"type":"intro"},{"from":1,"to":5,"type":"drop"},{"from":5,"to":6,"type":"break"},
              {"from":6,"to":7,"type":"drop","rolls":true},{"from":7,"to":8,"type":"outro"}],
  "whoosh":[1.8,5.55], "impact":[1.875,11.25], "tick":[11.25,11.48,11.72], "riser":[[9.6,11.25]], "key":"F"}
All times in seconds; 'from'/'to' in bars."""
import json, sys, numpy as np
from scipy.io import wavfile
from scipy.signal import butter, sosfilt
SR = 48000
NOTE = {"C":0,"C#":1,"D":2,"D#":3,"E":4,"F":5,"F#":6,"G":7,"G#":8,"A":9,"A#":10,"B":11}
rng = np.random.default_rng(3)

def env(n, a=.002, d=.2, curve=6):
    t = np.arange(n) / SR; e = np.exp(-curve * t / max(d, 1e-3)); att = int(a * SR)
    if att: e[:att] *= np.linspace(0, 1, att)
    return e
def hp(x, f): return sosfilt(butter(2, f, "hp", fs=SR, output="sos"), x)
def lp(x, f): return sosfilt(butter(2, min(f, SR/2-100), "lp", fs=SR, output="sos"), x)
def bp(x, lo, hi): return sosfilt(butter(2, [lo, hi], "bp", fs=SR, output="sos"), x)
def noise(n): return rng.uniform(-1, 1, n)

def kick():
    n=int(.42*SR); t=np.arange(n)/SR; f=45+140*np.exp(-t*38); ph=2*np.pi*np.cumsum(f)/SR
    return np.tanh(2.2*np.sin(ph)*env(n,.001,.42,5)) + .25*hp(noise(n),3000)*env(n,.0005,.006)
def clap():
    n=int(.3*SR); x=np.zeros(n)
    for k,o in enumerate([0,.011,.022]): s=int(o*SR); m=n-s; x[s:]+=bp(noise(m),900,4200)*env(m,.0005,.03 if k<2 else .22,6)
    return x*.9
def hat(open_=False): n=int((.18 if open_ else .05)*SR); return hp(noise(n),7500)*env(n,.0005,.18 if open_ else .035,5)*.5
def snare(): n=int(.18*SR); t=np.arange(n)/SR; return (.5*np.sin(2*np.pi*190*t)*env(n,.001,.06)+bp(noise(n),1500,8000)*env(n,.001,.12))*.8
def saw(f, n): t=np.arange(n)/SR; return 2*((f*t)%1)-1
def sub(f, n): t=np.arange(n)/SR; return np.tanh(1.6*np.sin(2*np.pi*f*t))*env(n,.004,n/SR,1.2)
def stab(fs, n):
    x=sum(saw(f*d,n) for f in fs for d in (1,1.006,.994)); return lp(x,3200)*env(n,.002,n/SR,3)/len(fs)/3
def whoosh(dur=.45, up=True):
    n=int(dur*SR); x=noise(n); p=np.linspace(0,1,n); out=np.zeros(n); blk=512
    for i in range(0,n,blk):
        c=300+ (p[i]**2 if up else (1-p[i])**2)*9000; out[i:i+blk]=bp(x[i:i+blk],max(80,c*.5),min(c*1.5,SR/2-200))
    return out*np.sin(np.pi*p)**1.5*.8
def impact():
    n=int(1.6*SR); t=np.arange(n)/SR; f=30+90*np.exp(-t*9)
    return np.tanh(1.8*np.sin(2*np.pi*np.cumsum(f)/SR)*env(n,.001,1.6,2.5)) + lp(noise(n),2500)*env(n,.001,.5,4)*.5
def riser(dur):
    n=int(dur*SR); p=np.linspace(0,1,n); t=np.arange(n)/SR; f=200*2**(p*3)
    return (hp(noise(n),2000)*.4*p**2 + .3*np.sin(2*np.pi*np.cumsum(f)/SR)*p**2)*p
def reese(f, n):
    x=sum(saw(f*d,n) for d in (1,1.012,.989)); return np.tanh(1.8*lp(x,650))*env(n,.004,n/SR,1.0)*.6
def pluck(f, n):
    t=np.arange(n)/SR; x=saw(f,n)*.6+np.sin(2*np.pi*f*2*t)*.4; return lp(x,5200)*env(n,.001,.14,5)
def tick(): n=int(.03*SR); t=np.arange(n)/SR; return np.sin(2*np.pi*2400*t)*env(n,.0003,.02)*.6

def add(buf, x, t, g=1.0):
    s=int(t*SR);
    if s>=len(buf): return
    e=min(len(buf), s+len(x)); buf[s:e]+=x[:e-s]*g

def main(cfg, out):
    bpm=cfg.get("bpm",128); B=60/bpm; BAR=4*B; bars=cfg.get("bars",8); dur=cfg.get("dur", bars*BAR)+1.5
    L=int(dur*SR); drums=np.zeros(L); bass=np.zeros(L); syn=np.zeros(L); fx=np.zeros(L)
    root=NOTE[cfg.get("key","F")]; hz=lambda semi,o=1: 440*2**((root+semi-9)/12)*(2**(o-4))
    prog=cfg.get("prog",[0,0,-4,-2])  # chord roots per bar, semitones from key
    flavor=cfg.get("flavor","stab"); kickpat=cfg.get("kick","four")
    K,CL,H,HO,SN=kick(),clap(),hat(),hat(True),snare()
    for sec in cfg["sections"]:
        a,b,typ=sec["from"],sec["to"],sec["type"]
        for bar in range(int(a),int(b)):
            t0=bar*BAR; ch=prog[bar%4]
            for q in range(4):
                tb=t0+q*B
                if typ in("drop",):
                    if kickpat=="four" or q in (0,2): add(drums,K,tb,1.0)
                    if kickpat=="broken" and q==1: add(drums,K,tb+B*.75,.85)
                    if kickpat=="broken" and q==3 and bar%2: add(drums,K,tb+B*.5,.8)
                    add(drums,H,tb+B/2,.9)
                    if q in(1,3): add(drums,CL,tb,.8)
                    add(drums,H,tb+B/4,.35); add(drums,H,tb+3*B/4,.35)
                    if flavor=="reese":
                        if q in (0,2): add(bass,reese(hz(ch,1),int(B*1.9*SR)),tb,.8)
                    else: add(bass,sub(hz(ch,1),int(B*.95*SR)),tb+B*.5,.85)
                    if flavor=="stab":
                        if q==0: add(syn,stab([hz(ch,3),hz(ch+3,3),hz(ch+7,3),hz(ch+10,3)],int(B*.9*SR)),tb,.55)
                        if q==2 and bar%2==1: add(syn,stab([hz(ch+7,3),hz(ch+10,3),hz(ch+14,3)],int(B*.5*SR)),tb+B*.5,.4)
                    else:  # 16th arp over the chord
                        arp=[0,7,12,3,10,7,15,12]
                        for s16 in range(4): add(syn,pluck(hz(ch+arp[(q*4+s16)%8],3),int(B/4*SR*1.6)),tb+s16*B/4,.32 if flavor=="reese" else .45)
                elif typ=="intro":
                    add(drums,H,tb+B/2,.35)
                    if q==0: add(syn,lp(stab([hz(ch,3),hz(ch+3,3),hz(ch+7,3)],int(BAR*SR)),900),tb,.35)
                elif typ=="break":
                    if q==0: add(syn,lp(stab([hz(ch,3),hz(ch+3,3),hz(ch+7,3),hz(ch+10,4)],int(BAR*SR)),1400),tb,.45)
                elif typ=="outro":
                    if bar==int(a) and q==0:
                        add(syn,stab([hz(0,3),hz(3,3),hz(7,3),hz(10,3),hz(14,4)],int(2.2*SR)),tb,.6)
                        add(bass,sub(hz(0,1),int(2.2*SR)),tb,.9); add(drums,K,tb,1.0)
                    if q>0 and bar==int(a): add(drums,H,tb+B/2,.25)
            if sec.get("rolls"):  # 16th snare roll building over the section's last bar
                t0=(b-1)*BAR
                for s in range(16): add(drums,SN,t0+s*B/4,.25+.55*s/15)
    for t in cfg.get("whoosh",[]): add(fx,whoosh(),t-.3,.9)
    for t in cfg.get("impact",[]): add(fx,impact(),t,.9)
    for t in cfg.get("tick",[]): add(fx,tick(),t,.7)
    for t in cfg.get("stutter",[]):
        for k in range(6): add(fx,tick()*1.3,t+k*B/8,.9-.1*k)
    for a,b in cfg.get("riser",[]): add(fx,riser(b-a),a,.8)
    # sidechain pump on bass+synths from kicks in drop sections
    pump=np.ones(L)
    for sec in cfg["sections"]:
        if sec["type"]!="drop": continue
        for bt in np.arange(sec["from"]*BAR, sec["to"]*BAR, B):
            s=int(bt*SR); n=int(B*SR); e=min(L,s+n); x=np.arange(e-s)/SR
            pump[s:e]=np.minimum(pump[s:e],1-.75*np.exp(-x*14))
    mix=drums*1.0+(bass*.9+syn*.8)*pump+fx
    mix=np.tanh(1.3*mix)
    stereo=np.stack([mix, mix],1)
    stereo/=np.max(np.abs(stereo))+1e-9; stereo*=.93
    fade=int(.8*SR); stereo[-fade:]*=np.linspace(1,0,fade)[:,None]
    wavfile.write(out,SR,(stereo*32767).astype(np.int16)); print("wrote",out,round(dur,2),"s")

if __name__=="__main__":
    main(json.load(open(sys.argv[1])), sys.argv[2])
