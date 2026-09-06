import math,struct,base64,json,random
from pathlib import Path
r=24000;n=r*2;bank={}
for name in ['pluck','bell','air']:
 random.seed(21);data=[]
 for i in range(n):
  t=i/r;f=261.625565;x=0
  if name=='pluck':
   x=sum(math.sin(2*math.pi*f*k*t)*math.exp(-t*(2+k*.7))/k for k in range(1,13))*.55
  elif name=='bell':
   x=sum(math.sin(2*math.pi*f*k*t)*math.exp(-t*(1+j*.6))*a for j,(k,a) in enumerate([(1,.6),(2.01,.25),(3.98,.14),(5.43,.09)]))
  else:
   x=(sum(math.sin(2*math.pi*f*k*t)*a for k,a in [(1,.4),(2,.2),(4,.16),(7,.08)])+random.uniform(-.07,.07))*(.7+.3*math.sin(t*6))
  x*=min(1,t/.004,(2-t)/.015);data.append(struct.pack('<h',round(max(-1,min(1,x))*30000)))
 bank[name]=base64.b64encode(b''.join(data)).decode()
(Path(__file__).resolve().parent.parent/'app/src/main/assets/sample-assets.js').write_text("'use strict';\n// Original synthesized PCM, mono 24 kHz / 16 bit / 2 seconds, generated for Pocket Synth.\nwindow.FACTORY_SAMPLES="+json.dumps(bank)+";\n")
