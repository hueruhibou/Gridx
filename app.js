const $=id=>document.getElementById(id);
let photos=[],current=0,rows=4,cols=4,xs=[],ys=[],selected=new Set([0]),done=new Set(),dim=.8;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const even=n=>Array.from({length:n-1},(_,i)=>(i+1)/n);
// Safari on macOS may return an empty or generic MIME type for local files.
// Check the filename extension as a fallback instead of rejecting those files.
const IMAGE_EXT=/\\.(jpe?g|png|gif|webp|heic|heif|avif|tiff?|bmp)$/i;
const isImage=f=>!!f && ((typeof f.type==='string' && f.type.toLowerCase().startsWith('image/')) || IMAGE_EXT.test(f.name||''));
function addPhotos(list){
  const all=Array.from(list||[]);
  const files=all.filter(isImage);
  if(!files.length){
    alert('画像を読み込めませんでした。JPEG、PNG、HEICなどの画像ファイルを選んでください。');
    return;
  }
  const added=[];
  for(const file of files){
    try{
      const url=URL.createObjectURL(file);
      photos.push({file,url,name:file.webkitRelativePath||file.name});
      added.push(file.name);
    }catch(err){
      console.error('画像の読み込みに失敗:',file.name,err);
    }
  }
  renderGallery();
  if(photos.length) $('emptyGallery').classList.add('hidden');
  if(added.length!==files.length){
    alert(`${added.length}枚を追加しました。${files.length-added.length}枚は読み込めませんでした。`);
  }
}
function renderGallery(){
  const root=$('galleryGrid');root.replaceChildren();
  photos.forEach((p,i)=>{
    const b=document.createElement('button');b.className='photo-card';b.type='button';
    const im=document.createElement('img');im.src=p.url;im.alt=p.name;
    const label=document.createElement('span');label.textContent=p.name.split('/').pop();
    b.append(im,label);b.addEventListener('click',()=>openPhoto(i));root.append(b);
  });
  $('photoCount').textContent=`${photos.length}枚`;
  $('emptyGallery').classList.toggle('hidden',photos.length>0);
  $('randomBtn').disabled=!photos.length;
}
function openPhoto(i){
  if(!photos.length)return;
  current=(i+photos.length)%photos.length;
  $('galleryScreen').classList.add('hidden');$('gridScreen').classList.remove('hidden');
  $('currentName').textContent=photos[current].name.split('/').pop();
  const img=$('photo');
  img.onload=()=>{
    const w=img.naturalWidth,h=img.naturalHeight,cell=Math.min(w,h)/4;
    const c=Math.max(1,Math.ceil(w/cell)),r=Math.max(1,Math.ceil(h/cell));
    setGrid(c,r);
  };
  img.onerror=()=>alert('この画像を開けませんでした。別の写真を選んでください。');
  img.src=photos[current].url;
}
function backToGallery(){$('gridScreen').classList.add('hidden');$('galleryScreen').classList.remove('hidden');}
function rectFor(index){
  const r=Math.floor(index/cols),c=index%cols;
  return{x:xs[c],y:ys[r],w:xs[c+1]-xs[c],h:ys[r+1]-ys[r],r,c};
}
function setGrid(c,r){
  cols=clamp(c,1,12);rows=clamp(r,1,12);
  xs=[0,...even(cols),1];ys=[0,...even(rows),1];
  selected=new Set([0]);done.clear();
  $('cols').value=cols;$('rows').value=rows;draw();
}
function draw(){
  const img=$('photo');if(!img.complete||!img.naturalWidth)return;
  const w=img.clientWidth,h=img.clientHeight;if(!w||!h)return;
  const stage=$('stage');stage.style.width=w+'px';stage.style.height=h+'px';
  $('dim').style.background=`rgba(12,14,18,${dim})`;
  const bright=$('brightCells');bright.replaceChildren();
  selected.forEach(index=>{
    const r=rectFor(index),cell=document.createElement('div');cell.className='bright-cell';
    Object.assign(cell.style,{left:r.x*100+'%',top:r.y*100+'%',width:r.w*100+'%',height:r.h*100+'%'});
    const copy=document.createElement('img');copy.src=img.src;
    Object.assign(copy.style,{width:w+'px',height:h+'px',left:-r.x*w+'px',top:-r.y*h+'px'});
    cell.append(copy);bright.append(cell);
  });
  const buttons=$('cellButtons');buttons.replaceChildren();buttons.style.setProperty('--cols',cols);
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const index=r*cols+c,b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`行${r+1} 列${c+1}`);
    b.title=`${r+1}行 ${c+1}列`;
    b.style.background=selected.has(index)?'rgba(169,199,239,.07)':'transparent';
    b.addEventListener('click',()=>{
      if(selected.has(index)){if(selected.size>1)selected.delete(index);}
      else selected.add(index);
      draw();
    });
    buttons.append(b);
  }
  const lines=$('lines');lines.replaceChildren();
  xs.slice(1,-1).forEach((v,i)=>addLine('v',v,i+1));
  ys.slice(1,-1).forEach((v,i)=>addLine('h',v,i+1));
  function addLine(axis,value,index){
    const el=document.createElement('div');el.className=axis;el.style[axis==='v'?'left':'top']=value*100+'%';
    el.addEventListener('pointerdown',ev=>{
      ev.preventDefault();const arr=axis==='v'?xs:ys,box=stage.getBoundingClientRect();
      const move=e=>{const val=axis==='v'?(e.clientX-box.left)/box.width:(e.clientY-box.top)/box.height;arr[index]=clamp(val,arr[index-1]+.025,arr[index+1]-.025);draw()};
      const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up)};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
    });lines.append(el);
  }
  $('selectionCount').textContent=`${selected.size}マス選択中`;
  const completed=done.size,total=rows*cols;
  $('progressText').textContent=`${completed} / ${total} 完了`;
  $('progressBar').style.width=`${completed/total*100}%`;
  $('markDone').textContent=`✓ 選択した${selected.size}マスを完了`;
  $('nextPhotoBtn').disabled=photos.length<2;$('randomPhotoBtn').disabled=photos.length<2;
  $('clearDone').disabled=!done.size;
  document.querySelectorAll('.dim-choice').forEach(b=>b.setAttribute('aria-pressed',String(1-(+b.dataset.dim/100)===dim)));
}
$('fileInput').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value=''});
$('folderInput').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value=''});
$('randomBtn').onclick=()=>{if(photos.length)openPhoto(Math.floor(Math.random()*photos.length))};
$('backBtn').onclick=backToGallery;
$('nextPhotoBtn').onclick=()=>openPhoto(current+1);
$('randomPhotoBtn').onclick=()=>{
  if(photos.length<2)return;
  let next;
  do{next=Math.floor(Math.random()*photos.length)}while(next===current);
  openPhoto(next);
};
$('selectOne').onclick=()=>{selected=new Set([selected.values().next().value??0]);draw()};
$('applyGrid').onclick=()=>setGrid(+$('cols').value||4,+$('rows').value||4);
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>setGrid(+b.dataset.preset,+b.dataset.preset));
document.querySelectorAll('[data-dim]').forEach(b=>b.onclick=()=>{dim=1-(+b.dataset.dim/100);draw()});
$('markDone').onclick=()=>{selected.forEach(i=>done.add(i));draw()};
$('clearDone').onclick=()=>{done.clear();draw()};

// Finder drag-and-drop into the gallery.
const dropZone=$('dropZone');
['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,e=>{
  e.preventDefault();e.stopPropagation();dropZone.classList.add('dragover');
}));
['dragleave','dragend'].forEach(type=>dropZone.addEventListener(type,e=>{
  e.preventDefault();e.stopPropagation();dropZone.classList.remove('dragover');
}));
dropZone.addEventListener('drop',e=>{
  e.preventDefault();e.stopPropagation();dropZone.classList.remove('dragover');
  const files=e.dataTransfer?.files;
  if(files&&files.length)addPhotos(files);
});
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{if(!dropZone.contains(e.target))e.preventDefault()});

window.addEventListener('resize',draw);
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
