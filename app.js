const $=id=>document.getElementById(id);
let photos=[], current=0, rows=4, cols=4, xs=[], ys=[], sel=0, done=new Set(), dim=.8;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const even=n=>Array.from({length:n-1},(_,i)=>(i+1)/n);
function setPhoto(i){
  if(!photos.length)return;
  current=(i+photos.length)%photos.length;
  $('photo').onload=()=>{
    $('empty').classList.add('hidden');$('work').classList.remove('hidden');$('galleryPanel').classList.remove('hidden');$('reset').disabled=false;
    const w=$('photo').naturalWidth,h=$('photo').naturalHeight;
    // Start with near-square cells. Edge cells may be partial to keep the whole image visible.
    const shortSide=Math.min(w,h), cell=shortSide/4;
    const c=Math.max(1,Math.ceil(w/cell)), r=Math.max(1,Math.ceil(h/cell));
    grid(c,r);
    renderGallery();
  };
  $('photo').src=photos[current].url;
  renderGallery();
}
function addFiles(fileList){
  const files=[...fileList].filter(f=>f.type.startsWith('image/'));
  if(!files.length)return;
  for(const f of files)photos.push({file:f,url:URL.createObjectURL(f),name:f.webkitRelativePath||f.name});
  if(photos.length===files.length)setPhoto(0);else renderGallery();
}
function renderGallery(){
  $('gallery').innerHTML='';
  photos.forEach((p,i)=>{
    const img=document.createElement('img');img.className='thumb'+(i===current?' selected':'');img.src=p.url;img.alt=p.name;img.title=p.name;
    img.onclick=()=>setPhoto(i);$('gallery').append(img);
  });
  $('galleryCount').textContent=`${photos.length}枚`;
}
function grid(c,r){cols=c;rows=r;xs=[0,...even(c),1];ys=[0,...even(r),1];sel=0;done.clear();$('cols').value=c;$('rows').value=r;draw()}
function geom(){let r=Math.floor(sel/cols),c=sel%cols;return{x:xs[c],y:ys[r],w:xs[c+1]-xs[c],h:ys[r+1]-ys[r],r,c}}
function draw(){
  if(!$('photo').src)return;
  let w=$('photo').clientWidth,h=$('photo').clientHeight;if(!w||!h)return;
  $('stage').style.width=w+'px';$('stage').style.height=h+'px';
  let g=geom(),a=$('active'),ap=$('activePhoto');
  Object.assign(a.style,{left:g.x*100+'%',top:g.y*100+'%',width:g.w*100+'%',height:g.h*100+'%'});
  ap.src=$('photo').src;Object.assign(ap.style,{width:w+'px',height:h+'px',left:-g.x*w+'px',top:-g.y*h+'px'});
  $('dim').style.background=`rgba(12,14,18,${dim})`;
  let hits=$('hits');hits.innerHTML='';
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    let d=document.createElement('div');d.className='hit';
    Object.assign(d.style,{left:xs[c]*100+'%',top:ys[r]*100+'%',width:(xs[c+1]-xs[c])*100+'%',height:(ys[r+1]-ys[r])*100+'%',zIndex:2});
    d.onclick=()=>{sel=r*cols+c;draw()};hits.append(d);
  }
  let l=$('lines');l.innerHTML='';
  xs.slice(1,-1).forEach((v,i)=>line('v',v,i+1));ys.slice(1,-1).forEach((v,i)=>line('h',v,i+1));
  function line(cls,v,i){
    let e=document.createElement('div');e.className=cls;e.style[cls==='v'?'left':'top']=v*100+'%';e.style.zIndex=5;
    e.onpointerdown=ev=>{
      ev.preventDefault();let axis=cls==='v'?'x':'y',arr=axis==='x'?xs:ys,rect=$('stage').getBoundingClientRect();
      let move=m=>{let val=axis==='x'?(m.clientX-rect.left)/rect.width:(m.clientY-rect.top)/rect.height;arr[i]=clamp(val,arr[i-1]+.025,arr[i+1]-.025);draw()};
      let end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end)};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
    };
    l.append(e);
  }
  $('cellLabel').textContent=`区画 ${g.r+1}-${g.c+1}`;
  $('prog').textContent=`${done.size} / ${rows*cols} 完了`;
  $('bar').style.width=done.size/(rows*cols)*100+'%';
  $('done').textContent=done.has(sel)?'✓ 完了済み（取り消す）':'✓ このマスを完了';
  $('prev').disabled=sel===0;$('next').disabled=sel===rows*cols-1;
  document.querySelectorAll('.thumb').forEach((t,i)=>t.classList.toggle('selected',i===current));
}
$('file').onchange=e=>addFiles(e.target.files);
$('folder').onchange=e=>addFiles(e.target.files);
$('reset').onclick=()=>{
  photos.forEach(p=>URL.revokeObjectURL(p.url));photos=[];current=0;
  $('photo').removeAttribute('src');$('file').value='';$('folder').value='';
  $('work').classList.add('hidden');$('galleryPanel').classList.add('hidden');$('empty').classList.remove('hidden');$('reset').disabled=true;
};
$('shuffle').onclick=()=>{if(photos.length>1){let i;do{i=Math.floor(Math.random()*photos.length)}while(i===current);setPhoto(i)}};
$('apply').onclick=()=>grid(clamp(+$('cols').value||4,1,12),clamp(+$('rows').value||4,1,12));
document.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>grid(+b.dataset.n,+b.dataset.n));
document.querySelectorAll('[data-dim]').forEach(b=>b.onclick=()=>{dim=1-(+b.dataset.dim/100);document.querySelectorAll('[data-dim]').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));draw()});
$('done').onclick=()=>{done.has(sel)?done.delete(sel):done.add(sel);draw()};
$('prev').onclick=()=>{sel=Math.max(0,sel-1);draw()};
$('next').onclick=()=>{sel=Math.min(rows*cols-1,sel+1);draw()};
$('clear').onclick=()=>{done.clear();draw()};
window.addEventListener('resize',draw);
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
