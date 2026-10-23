import cv2, numpy as np
cap=cv2.VideoCapture('SYNAPSE_ad.mp4'); fps=60; B=60/128; BAR=4*B; e8=B/2
prev=None; cuts=[]; i=0; frames={}
want={int(t*60):t for t in [3.5,10.9,22.15,40.9,52.15,63.4,66.4,72.5]}
while True:
    ok,f=cap.read()
    if not ok: break
    s=cv2.resize(f,(160,90)).astype(np.int16)
    if prev is not None and np.abs(s-prev).mean()>40: cuts.append(i)
    prev=s
    if i in want: frames[want[i]]=f
    i+=1
print('frames',i)
print('cuts at 8th-note grid offsets (frames from bar35):')
k0=35*BAR
print([ (round(c/60,3), round((c/60-k0)/e8,2)) for c in cuts if c/60>k0-0.1][:20])
imgs=[cv2.resize(frames[t],(640,360)) for t in sorted(frames)]
rows=[np.hstack(imgs[j:j+4]) for j in range(0,8,4)]
cv2.imwrite('final_check.png',np.vstack(rows))
