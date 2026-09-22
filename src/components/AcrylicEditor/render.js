export const SIZE=500;
const canvas=(w=SIZE,h=w)=>{const c=document.createElement('canvas');c.width=w;c.height=h;return c};
export function loadImage(src, crossOrigin = 'anonymous'){return new Promise((resolve,reject)=>{const i=new Image();if(crossOrigin && !/^(data:|blob:)/i.test(src)) i.crossOrigin=crossOrigin;i.onload=()=>resolve(i);i.onerror=()=>reject(new Error('图片加载失败'));i.src=src})}
export function prepareArt(img){const c=canvas(img.width,img.height),x=c.getContext('2d');x.drawImage(img,0,0);const d=x.getImageData(0,0,c.width,c.height).data;let l=c.width,t=c.height,r=0,b=0,clear=0,found=false;for(let y=0;y<c.height;y++)for(let xx=0;xx<c.width;xx++){const a=d[(y*c.width+xx)*4+3];if(a<10)clear++;if(a>80){found=true;l=Math.min(l,xx);r=Math.max(r,xx);t=Math.min(t,y);b=Math.max(b,y)}}if(!found)throw Error('图片完全透明，请选择有图案的 PNG');if(clear<d.length/4*.01)throw Error('请使用透明背景 PNG；当前图片没有足够的透明区域。');return {img,box:[l,t,r-l+1,b-t+1]}}
function fillHoles(a,n){const seen=new Uint8Array(n*n),q=new Int32Array(n*n);let h=0,t=0;function add(i){if(!a[i]&&!seen[i]){seen[i]=1;q[t++]=i}}for(let i=0;i<n;i++){add(i);add((n-1)*n+i);add(i*n);add(i*n+n-1)}while(h<t){const i=q[h++],x=i%n,y=(i/n)|0;if(x)add(i-1);if(x<n-1)add(i+1);if(y)add(i-n);if(y<n-1)add(i+n)}for(let i=0;i<a.length;i++)if(!seen[i])a[i]=1;}
function expand(a,n,r){const d=new Float32Array(n*n);for(let i=0;i<d.length;i++)d[i]=a[i]?0:1e5;const diag=Math.SQRT2;for(let y=0;y<n;y++)for(let x=0;x<n;x++){const i=y*n+x;if(x)d[i]=Math.min(d[i],d[i-1]+1);if(y){d[i]=Math.min(d[i],d[i-n]+1);if(x)d[i]=Math.min(d[i],d[i-n-1]+diag);if(x<n-1)d[i]=Math.min(d[i],d[i-n+1]+diag)}}for(let y=n-1;y>=0;y--)for(let x=n-1;x>=0;x--){const i=y*n+x;if(x<n-1)d[i]=Math.min(d[i],d[i+1]+1);if(y<n-1){d[i]=Math.min(d[i],d[i+n]+1);if(x)d[i]=Math.min(d[i],d[i+n-1]+diag);if(x<n-1)d[i]=Math.min(d[i],d[i+n+1]+diag)}}return d.map(v=>v<=r?1:0)}
export function makeShape(art,o){const n=SIZE,c=canvas(),ctx=c.getContext('2d'),[sx,sy,sw,sh]=art.box;const scale=Math.min(200/sh,220/sw),w=sw*scale,h=sh*scale;const rect=[250-w/2,255,w,h];ctx.drawImage(art.img,sx,sy,sw,sh,...rect);const data=ctx.getImageData(0,0,n,n).data;let a=new Uint8Array(n*n);for(let i=0;i<a.length;i++)a[i]=data[i*4+3]>50?1:0;fillHoles(a,n);a=expand(a,n,o.border);const mask=canvas(),m=mask.getContext('2d'),md=m.createImageData(n,n);for(let i=0;i<a.length;i++){md.data[i*4]=md.data[i*4+1]=md.data[i*4+2]=255;md.data[i*4+3]=a[i]*255}m.putImageData(md,0,0);if(o.smooth>0){const temp=canvas(),tx=temp.getContext('2d');tx.filter=`blur(${o.smooth/3}px)`;tx.drawImage(mask,0,0);const td=tx.getImageData(0,0,n,n);for(let i=3;i<td.data.length;i+=4)td.data[i]=Math.round(Math.max(0,Math.min(1,(td.data[i]-75)/105))*255);m.putImageData(td,0,0)}
const hx=250+o.holeX,hy=240+o.holeY; // Connect the ear to the nearest real silhouette pixel.
let nearest=null,best=Infinity;const raw=m.getImageData(0,0,n,n).data;for(let y=0;y<n;y++)for(let x=0;x<n;x++)if(raw[(y*n+x)*4+3]>128){const dist=(x-hx)**2+(y-hy)**2;if(dist<best){best=dist;nearest=[x,y]}}
if(o.hook&&nearest){m.strokeStyle='white';m.lineWidth=22;m.lineCap='round';m.beginPath();m.moveTo(hx,hy);m.lineTo(...nearest);m.stroke();m.fillStyle='white';m.beginPath();m.arc(hx,hy,14,0,Math.PI*2);m.fill();m.globalCompositeOperation='destination-out';m.beginPath();m.arc(hx,hy,4.5,0,Math.PI*2);m.fill();m.globalCompositeOperation='source-over'}return {mask,rect,hx,hy};}
function colored(mask,color){const c=canvas(),x=c.getContext('2d');x.drawImage(mask,0,0);x.globalCompositeOperation='source-in';x.fillStyle=color;x.fillRect(0,0,SIZE,SIZE);return c}
// A directional rim, rather than a filled underlay, preserves transparency.
function rim(mask,dx,dy,color,outer=false){const c=canvas(),x=c.getContext('2d');x.drawImage(colored(mask,color),outer?dx:0,outer?dy:0);x.globalCompositeOperation='destination-out';x.drawImage(mask,outer?0:dx,outer?0:dy);return c}
function clip(layer,mask){const x=layer.getContext('2d');x.globalCompositeOperation='destination-in';x.drawImage(mask,0,0);x.globalCompositeOperation='source-over'}
function random(seed=729){return()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}}
function drawTransformed(ctx,source,o){
const scale=(o.productScale == null ? 100 : o.productScale)/100;
ctx.save();ctx.translate(SIZE/2+(o.productX||0),SIZE/2+(o.productY||0));ctx.rotate((o.productRotation||0)*Math.PI/180);ctx.scale(scale,scale);ctx.translate(-SIZE/2,-SIZE/2);ctx.drawImage(source,0,0);ctx.restore();
}
export function render(target,assets,art,o,shape){
const n=SIZE,x=target.getContext('2d'),{mask,rect,hx,hy}=shape;
const strength=(o.intensity == null ? 80 : o.intensity)/100,thickness=(o.thickness == null ? 4 : o.thickness),shine=o.shine/100;
x.setTransform(target.width/n,0,0,target.height/n,0,0);x.clearRect(0,0,n,n);
if(o.background==='scene')x.drawImage(assets.background,0,0,n,n);else if(o.background==='white'){x.fillStyle='#f7f7f5';x.fillRect(0,0,n,n)}
const product=canvas(),p=product.getContext('2d');
if(o.background!=='transparent'){
const shadow=canvas(),sh=shadow.getContext('2d');sh.globalAlpha=(o.shadowOpacity == null ? 20 : o.shadowOpacity)/100;sh.filter=`blur(${o.shadowBlur == null ? 5 : o.shadowBlur}px)`;sh.drawImage(colored(mask,'#43392c'),o.shadowX == null ? -7 : o.shadowX,o.shadowY == null ? 8 : o.shadowY);drawTransformed(x,shadow,o);
}
const sideColor=o.material==='tinted'?o.tint:o.material==='pearl'?'#8a9cab':'#7b9599';
p.save();p.globalAlpha=.5;p.drawImage(rim(mask,thickness*.6,thickness,sideColor,true),0,0);p.restore();
p.drawImage(rim(mask,thickness*.6+.5,thickness+.7,'rgba(236,251,255,.75)',true),0,0);
p.save();p.globalAlpha=.25;p.drawImage(rim(mask,thickness*.6,thickness,sideColor,true),0,0);p.restore();
const layer=canvas(),l=layer.getContext('2d');
// Scene behind the plate is slightly displaced to suggest optical refraction.
if(o.background==='scene'){l.save();l.globalAlpha=o.material==='frost'?1:.75;l.filter=o.material==='frost'?`blur(${3+strength*7}px)`:'none';l.drawImage(assets.background,-1.7,-.8,n+3.4,n+1.6);l.restore()}
const wash=l.createLinearGradient(175,240,330,455);wash.addColorStop(0,`rgba(224,246,251,${.12+strength*.12})`);wash.addColorStop(.48,'rgba(255,255,255,.025)');wash.addColorStop(1,`rgba(121,171,185,${strength*.16})`);l.fillStyle=wash;l.fillRect(0,0,n,n);
if(o.baseColor){l.save();l.globalAlpha=(o.baseOpacity == null ? 0 : o.baseOpacity)/100;l.fillStyle=o.baseColor;l.fillRect(0,0,n,n);l.restore()}
if(o.material==='frost'){
l.fillStyle=`rgba(242,248,250,${.38+strength*.38})`;l.fillRect(0,0,n,n);
const rand=random();for(let i=0;i<19000;i++){const px=rand()*n,py=rand()*n,r=.18+rand()*.45;l.fillStyle=rand()>.5?`rgba(255,255,255,${.12+strength*.3})`:`rgba(111,137,148,${strength*.13})`;l.fillRect(px,py,r,r)}
}else if(o.material==='tinted'){l.globalAlpha=.25+strength*.43;l.fillStyle=o.tint;l.fillRect(0,0,n,n);l.globalAlpha=1;
}else if(o.material==='glitter'){
// Existing foil asset plus reproducible small flakes: density is stable between renders.
l.save();l.globalAlpha=(.6+strength*.4)*((o.textureOpacity == null ? 100 : o.textureOpacity)/100);const pattern=l.createPattern(assets.glitter,'repeat');pattern.setTransform(new DOMMatrix().scale(.15*((o.textureScale||100)/100)));l.fillStyle=pattern;l.fillRect(0,0,n,n);l.restore();
const rand=random(301),colors=['#d65a43','#edb936','#279e95','#9d71bb','#faf9e9','#ef986b'];for(let i=0;i<o.density*26;i++){const px=rand()*n,py=rand()*n,r=(.5+rand()*1.3)*((o.textureScale||100)/100);l.save();l.translate(px,py);l.rotate(rand()*Math.PI);l.globalAlpha=(.55+strength*.4)*((o.textureOpacity == null ? 100 : o.textureOpacity)/100);l.fillStyle=colors[Math.floor(rand()*colors.length)];l.beginPath();l.moveTo(-r,-r*.3);l.lineTo(r*.5,-r);l.lineTo(r,r*.5);l.lineTo(-r*.4,r);l.closePath();l.fill();if(i%14===0){l.fillStyle='rgba(255,255,255,.95)';l.fillRect(-r,-.2,r*2,.4)}l.restore()}
}else if(o.material==='pearl'){
// Fine curved interference bands, not a single flat gradient.
const id=l.getImageData(0,0,n,n);for(let py=0;py<n;py++)for(let px=0;px<n;px++){
const phase=px*.047+py*.027+Math.sin(py*.045+Math.sin(px*.018))*1.9;
const wave=Math.sin(phase),rib=Math.pow(Math.max(0,Math.cos(phase*2.5)),9);
const rgb=[221+25*Math.sin(phase+.8)+rib*10,223+23*Math.sin(phase+2.6)+rib*12,230+22*Math.sin(phase+4.3)+rib*12];const i=(py*n+px)*4;const alpha=.55+strength*.38;for(let j=0;j<3;j++)id.data[i+j]=rgb[j];id.data[i+3]=alpha*255;
}l.putImageData(id,0,0)}
clip(layer,mask);p.drawImage(layer,0,0);
// A broad inside bevel and opposite dark contour make the plate thickness readable.
p.drawImage(rim(mask,1.7,1.7,'rgba(252,255,255,.75)'),0,0);
p.drawImage(rim(mask,-1.6,-1.8,'rgba(59,102,120,.55)'),0,0);
p.drawImage(rim(mask,.8,.8,'rgba(255,255,255,1)'),0,0);
p.drawImage(art.img,...art.box,...rect);
const sheen=canvas(),s=sheen.getContext('2d');const left=rect[0]-o.border,top=rect[1]-30,w=rect[2]+o.border*2,h=rect[3]+55;
s.globalAlpha=Math.min(1,shine*1.5);s.drawImage(assets.reflection,left,top,w,h);s.globalAlpha=1;
const g=s.createLinearGradient(left,top,left+w,top+h*.45);g.addColorStop(0,'rgba(255,255,255,0)');g.addColorStop(.25,`rgba(255,255,255,${shine*.12})`);g.addColorStop(.36,`rgba(255,255,255,${shine*(o.material==='frost'?.20:.60)})`);g.addColorStop(.43,`rgba(255,255,255,${shine*.08})`);g.addColorStop(.72,'rgba(255,255,255,0)');g.addColorStop(.77,`rgba(255,255,255,${shine*.22})`);g.addColorStop(.83,'rgba(255,255,255,0)');g.addColorStop(1,'rgba(255,255,255,0)');s.fillStyle=g;s.fillRect(0,0,n,n);
// Print remains opaque; reflections over the print are attenuated.
s.globalCompositeOperation='destination-out';s.globalAlpha=.72;s.drawImage(art.img,...art.box,...rect);s.globalAlpha=1;s.globalCompositeOperation='source-over';clip(sheen,mask);p.drawImage(sheen,0,0);
if(o.hook){const hh=235,hw=hh*assets.hook.width/assets.hook.height;p.drawImage(assets.hook,hx-hw/2,hy-hh*.885,hw,hh)}
drawTransformed(x,product,o);
x.setTransform(1,0,0,1,0,0);
}
