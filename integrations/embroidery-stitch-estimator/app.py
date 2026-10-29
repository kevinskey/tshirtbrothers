from io import BytesIO
import numpy as np, cv2
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import HTMLResponse
from pathlib import Path

app=FastAPI(title='TSB Stitch Estimator')

@app.post('/api/v1/embroidery/estimate')
async def estimate(file:UploadFile=File(...),width_in:float=Form(...),height_in:float|None=Form(None),spacing_mm:float=Form(.42)):
 if not (.25<=width_in<=20 and .25<=spacing_mm<=1.2):raise HTTPException(422,'Invalid width or spacing')
 data=await file.read(15000001)
 if len(data)>15000000:raise HTTPException(413,'PNG exceeds 15 MB')
 try:
  im=Image.open(BytesIO(data));assert im.format=='PNG';w,h=im.size;assert w*h<=12000000
  a=np.array(im.convert('RGBA'))
 except Exception:raise HTTPException(422,'Invalid PNG or image too large')
 if height_in is None:height_in=width_in*h/w
 if not .25<=height_in<=20:raise HTTPException(422,'Invalid height')
 mask=(a[:,:,3]>=128).astype('uint8') if np.any(a[:,:,3]<245) else (np.min(a[:,:,:3],axis=2)<245).astype('uint8')
 if not mask.any():raise HTTPException(422,'No visible artwork')
 sx=width_in*25.4/w;sy=height_in*25.4/h;pxmm=(sx*sy)**.5
 dist=cv2.distanceTransform(mask,cv2.DIST_L2,3)*2*pxmm
 thin=(mask>0)&(dist<=7);broad=(mask>0)&(dist>7)
 thinarea=float(thin.sum()*sx*sy);broadarea=float(broad.sum()*sx*sy)
 median=float(np.clip(np.median(dist[thin]) if thin.any() else 2,1.2,7))
 fill=round(broadarea/spacing_mm/3);satin=round(thinarea/(spacing_mm*median)*2)
 contours,_=cv2.findContours(mask,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
 running=round(sum(cv2.arcLength(c,True) for c in contours)*pxmm/2.5*.3)
 underlay=round((fill+satin+running)*.12)
 stitches=max(100,round((fill+satin+running+underlay+30)/100)*100)
 rgb=a[:,:,:3][mask.astype(bool)];q=rgb//32;_,cnt=np.unique(q,axis=0,return_counts=True)
 colors=int(min(16,max(1,(cnt>=max(8,len(rgb)*.005)).sum())))
 return dict(estimated_stitches=stitches,low_stitches=round(stitches*.7/100)*100,high_stitches=round(stitches*1.45/100)*100,color_count_estimate=colors,width_in=width_in,height_in=round(height_in,2),coverage_pct=round(float(mask.mean())*100,1),breakdown=dict(fill=fill,satin=satin,running=running,underlay=underlay),disclaimer='Heuristic only; not a digitized DST stitch count')

@app.get('/',response_class=HTMLResponse)
def home():return (Path(__file__).parent/'index.html').read_text()
