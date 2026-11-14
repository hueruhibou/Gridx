const $=id=>document.getElementById(id);
let photos=[],current=0,rows=3,cols=3,xs=[],ys=[],selected=new Set(),done=new Set(),dim=.9;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const even=n=>Array.from({length:n-1},(_,i)=>(i+1)/n);
// Safari on macOS may return an empty or generic MIME type for local files.
// Use MIME type / extension as a first filter, then ask the browser to decode
// the file as an image. This rejects non-image files renamed with .jpg, etc.
const IMAGE_EXT=/\.(jpe?g|png|gif|webp|heic|heif|avif|svg|tiff?|bmp)$/i;
const isImageCandidate=f=>!!f && ((typeof f.type==='string' && f.type.toLowerCase().startsWith('image/')) || IMAGE_EXT.test(f.name||''));
async function canDecodeImage(file){
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    img.src=url;
    if(typeof img.decode==='function') await img.decode();
    else await new Promise((resolve,reject)=>{
      img.onload=resolve;
      img.onerror=()=>reject(new Error('Not a decodable image'));
    });
    return img.naturalWidth>0 && img.naturalHeight>0;
  }catch(err){
    return false;
  }finally{
    URL.revokeObjectURL(url);
  }
}
async function addPhotos(list){
  const all=Array.from(list||[]);
  if(!all.length)return;
  const valid=[];
  let rejected=0;
  for(const file of all){
    if(!isImageCandidate(file) || !(await canDecodeImage(file))){
      rejected++;
      continue;
    }
    valid.push(file);
  }
  if(!valid.length){
    alert('画像ファイルとして読み込めるファイルがありませんでした。JPEG、PNG、HEICなどの画像を選んでください。');
    return;
  }
  let added=0;
  for(const file of valid){
    try{
      const url=URL.createObjectURL(file);
      photos.push({file,url,name:file.webkitRelativePath||file.name});
      added++;
    }catch(err){
      rejected++;
      console.error('画像の読み込みに失敗:',file.name,err);
    }
  }
  renderGallery();
  if(photos.length)$('emptyGallery').classList.add('hidden');
  if(rejected>0){
    alert(`${added}枚の画像を追加しました。画像以外、または読み込めないファイル${rejected}個は除外しました。`);
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
function showPhoto(i){
  if(!photos.length)return;
  current=(i+photos.length)%photos.length;
  $('galleryScreen').classList.add('hidden');$('gridScreen').classList.remove('hidden');
  $('currentName').textContent=photos[current].name.split('/').pop();
  updatePhotoNavigation();
  const img=$('photo');
  img.onload=()=>{
    const w=img.naturalWidth,h=img.naturalHeight,cell=Math.min(w,h)/3;
    const c=Math.max(1,Math.ceil(w/cell)),r=Math.max(1,Math.ceil(h/cell));
    setGrid(c,r);
  };
  img.onerror=()=>alert('この画像を開けませんでした。別の写真を選んでください。');
  img.src=photos[current].url;
}
function openPhoto(i){
  if(!photos.length)return;
  showPhoto(i);
}
function navigatePhoto(i){
  if(!photos.length)return;
  showPhoto((i+photos.length)%photos.length);
}
function randomPhoto(){
  if(photos.length<2)return;
  const candidates=photos.map((_,i)=>i).filter(i=>i!==current);
  const next=candidates[Math.floor(Math.random()*candidates.length)];
  navigatePhoto(next);
}
function updatePhotoNavigation(){
  const hasAlternatives=photos.length>1;
  $('previousPhotoBtn').disabled=!hasAlternatives;
  $('nextPhotoBtn').disabled=!hasAlternatives;
  $('randomPhotoBtn').disabled=!hasAlternatives;
}
function backToGallery(){$('gridScreen').classList.add('hidden');$('galleryScreen').classList.remove('hidden');}
function rectFor(index){
  const r=Math.floor(index/cols),c=index%cols;
  return{x:xs[c],y:ys[r],w:xs[c+1]-xs[c],h:ys[r+1]-ys[r],r,c};
}
function setGrid(c,r){
  cols=clamp(c,1,12);rows=clamp(r,1,12);
  xs=[0,...even(cols),1];ys=[0,...even(rows),1];
  selected=new Set();done.clear();
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
      if(selected.has(index))selected.delete(index);
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
  updatePhotoNavigation();
  $('clearDone').disabled=!done.size;
  document.querySelectorAll('.dim-choice').forEach(b=>b.setAttribute('aria-pressed',String(1-(+b.dataset.dim/100)===dim)));
}
$('fileInput').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value=''});
$('folderInput').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value=''});
$('randomBtn').onclick=()=>{if(photos.length)openPhoto(Math.floor(Math.random()*photos.length))};
$('backBtn').onclick=backToGallery;
$('previousPhotoBtn').addEventListener('click',()=>navigatePhoto(current-1));
$('nextPhotoBtn').addEventListener('click',()=>navigatePhoto(current+1));
$('randomPhotoBtn').addEventListener('click',randomPhoto);
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
