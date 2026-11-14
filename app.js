const $=id=>document.getElementById(id);
let photos=[],current=0,rows=4,cols=4,xs=[],ys=[],sel=0,done=new Set(),dim=.8;
let multiMode=false,selectedCells=new Set([0]);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const even=n=>Array.from({length:n-1},(_,i)=>(i+1)/n);
function grid(c,r){
  cols=c;rows=r;xs=[0,...even(c),1];ys=[0,...even(r),1];
  sel=0;selectedCells=new Set([0]);done.clear();
  $('cols').value=c;$('rows').value=r;draw();
}
function cellRect(index){
  const r=Math.floor(index/cols),c=index%cols;
  return {x:xs[c],y:ys[r],w:xs[c+1]-xs[c],h:ys[r+1]-ys[r],r,c};
}
function setPhoto(i){
  if(!photos.length)return;
  current=(i+photos.length)%photos.length;
  const image=$('photo');
  image.onload=()=>{
    $('empty').classList.add('hidden');$('work').classList.remove('hidden');
    $('galleryPanel').classList.remove('hidden');$('reset').disabled=false;
    const w=image.naturalWidth,h=image.naturalHeight,cell=Math.min(w,h)/4;
    grid(Math.max(1,Math.ceil(w/cell)),Math.max(1,Math.ceil(h/cell)));
    renderGallery();
  };
  image.onerror=()=>showMessage('この画像は読み込めませんでした。別の画像を選んでください。');
  image.src=photos[current].url;
  renderGallery();
}
function showMessage(message){
  let el=$('loadMessage');
  if(!el){el=document.createElement('p');el.id='loadMessage';el.className='note';$('toolbarMessage')?.append(el);}
  if(el)el.textContent=message;
}
function addFiles(list){
  const files=Array.from(list||[]).filter(f=>f.type.startsWith('image/'));
  if(!files.length){showMessage('画像ファイルが見つかりませんでした。');return;}
  const start=photos.length;
  files.forEach(file=>photos.push({file,url:URL.createObjectURL(file),name:file.webkitRelativePath||file.name}));
  renderGallery();
  showMessage(`${files.length}枚を読み込みました。合計 ${photos.length}枚です。`);
  if(start===0)setPhoto(0);
  else if(!$('work').classList.contains('hidden'))renderGallery();
}
function renderGallery(){
  const gallery=$('gallery');gallery.replaceChildren();
  photos.forEach((p,i)=>{
    const img=document.createElement('img');
    img.className='thumb'+(i===current?' selected':'');
    img.src=p.url;img.alt=p.name;img.title=p.name;
    img.addEventListener('click',()=>setPhoto(i));
    gallery.append(img);
  });
  $('galleryCount').textContent=`${photos.length}枚`;
}
function draw(){
  const image=$('photo');
  if(!image.complete||!image.naturalWidth)return;
  const w=image.clientWidth,h=image.clientHeight;if(!w||!h)return;
  $('stage').style.width=w+'px';$('stage').style.height=h+'px';
  $('dim').style.background=`rgba(12,14,18,${dim})`;
  const active=$('active'),activePhoto=$('activePhoto');
  const focus=cellRect(sel);
  Object.assign(active.style,{left:focus.x*100+'%',top:focus.y*100+'%',width:focus.w*100+'%',height:focus.h*100+'%'});
  activePhoto.src=image.src;
  Object.assign(activePhoto.style,{width:w+'px',height:h+'px',left:-focus.x*w+'px',top:-focus.y*h+'px'});
  const hits=$('hits');hits.replaceChildren();
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const index=r*cols+c,rect=cellRect(index),hit=document.createElement('div');
    hit.className='hit';
    Object.assign(hit.style,{left:rect.x*100+'%',top:rect.y*100+'%',width:rect.w*100+'%',height:rect.h*100+'%',zIndex:2});
    hit.addEventListener('click',()=>{
      if(multiMode){
        if(selectedCells.has(index)){if(selectedCells.size>1)selectedCells.delete(index);}
        else selectedCells.add(index);
        sel=index;
      }else{sel=index;selectedCells=new Set([index]);}
      draw();
    });
    hits.append(hit);
  }
  const lines=$('lines');lines.replaceChildren();
  xs.slice(1,-1).forEach((v,i)=>addLine('v',v,i+1));
  ys.slice(1,-1).forEach((v,i)=>addLine('h',v,i+1));
  function addLine(axis,value,index){
    const line=document.createElement('div');line.className=axis;
    line.style[axis==='v'?'left':'top']=value*100+'%';line.style.zIndex=5;
    line.addEventListener('pointerdown',ev=>{
      ev.preventDefault();
      const arr=axis==='v'?xs:ys,rect=$('stage').getBoundingClientRect();
      const move=e=>{
        const v=axis==='v'?(e.clientX-rect.left)/rect.width:(e.clientY-rect.top)/rect.height;
        arr[index]=clamp(v,arr[index-1]+.025,arr[index+1]-.025);draw();
      };
      const end=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end)};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',end);
    });
    lines.append(line);
  }
  // Outline every selected cell so multi-selection is visible.
  selectedCells.forEach(index=>{
    const rect=cellRect(index),outline=document.createElement('div');
    Object.assign(outline.style,{position:'absolute',left:rect.x*100+'%',top:rect.y*100+'%',width:rect.w*100+'%',height:rect.h*100+'%',border:'2px solid #a9c7ef',boxSizing:'border-box',pointerEvents:'none',zIndex:4});
    hits.append(outline);
  });
  $('cellLabel').textContent=`注目：${focus.r+1}-${focus.c+1}`;
  $('selectionInfo').textContent=`選択中：${selectedCells.size}マス`;
  $('prog').textContent=`${done.size} / ${rows*cols} 完了`;
  $('bar').style.width=(done.size/(rows*cols)*100)+'%';
  $('done').textContent=selectedCells.size>1?`✓ 選択した${selectedCells.size}マスを完了`:(done.has(sel)?'✓ 完了済み（取り消す）':'✓ このマスを完了');
  $('prev').disabled=sel===0;$('next').disabled=sel===rows*cols-1;
  document.querySelectorAll('.thumb').forEach((t,i)=>t.classList.toggle('selected',i===current));
}
$('file').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
$('folder').addEventListener('change',e=>{addFiles(e.target.files);e.target.value='';});
$('reset').onclick=()=>{
  photos.forEach(p=>URL.revokeObjectURL(p.url));photos=[];current=0;
  $('photo').removeAttribute('src');$('file').value='';$('folder').value='';
  $('work').classList.add('hidden');$('galleryPanel').classList.add('hidden');$('empty').classList.remove('hidden');$('reset').disabled=true;
  renderGallery();showMessage('');
};
$('shuffle').onclick=()=>{if(photos.length>1){let i;do{i=Math.floor(Math.random()*photos.length)}while(i===current);setPhoto(i);}};
$('apply').onclick=()=>grid(clamp(+$('cols').value||4,1,12),clamp(+$('rows').value||4,1,12));
document.querySelectorAll('[data-n]').forEach(b=>b.onclick=()=>grid(+b.dataset.n,+b.dataset.n));
document.querySelectorAll('[data-dim]').forEach(b=>b.onclick=()=>{
  dim=1-(+b.dataset.dim/100);
  document.querySelectorAll('[data-dim]').forEach(x=>x.setAttribute('aria-pressed',x===b?'true':'false'));draw();
});
$('multiMode').onclick=()=>{
  multiMode=!multiMode;
  $('multiMode').textContent=`複数選択：${multiMode?'ON':'OFF'}`;
  $('multiMode').setAttribute('aria-pressed',String(multiMode));
  if(!multiMode)selectedCells=new Set([sel]);
  draw();
};
$('done').onclick=()=>{
  selectedCells.forEach(index=>done.has(index)?done.delete(index):done.add(index));
  draw();
};
$('prev').onclick=()=>{sel=Math.max(0,sel-1);selectedCells=new Set([sel]);draw();};
$('next').onclick=()=>{sel=Math.min(rows*cols-1,sel+1);selectedCells=new Set([sel]);draw();};
$('clear').onclick=()=>{done.clear();draw();};
window.addEventListener('resize',draw);
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
