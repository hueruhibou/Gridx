const $=id=>document.getElementById(id);
let photos=[],current=0,rows=3,cols=3,xs=[],ys=[],selected=new Set(),done=new Set(),dim=.9,selectionMode=true;
const DB_NAME='gridx-local-library',DB_VERSION=1,PHOTO_STORE='photos';
let db=null,displayToken=0,selectedPhotoHashes=new Set();

const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const even=n=>Array.from({length:n-1},(_,i)=>(i+1)/n);

function openLibrary(){
  return new Promise((resolve,reject)=>{
    if(!('indexedDB' in window)){reject(new Error('IndexedDB is not available'));return;}
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=()=>{
      const database=request.result;
      if(!database.objectStoreNames.contains(PHOTO_STORE)){
        database.createObjectStore(PHOTO_STORE,{keyPath:'hash'});
      }
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Could not open local library'));
  });
}
function transactionDone(tx){
  return new Promise((resolve,reject)=>{
    tx.oncomplete=()=>resolve();
    tx.onerror=()=>reject(tx.error||new Error('Storage transaction failed'));
    tx.onabort=()=>reject(tx.error||new Error('Storage transaction aborted'));
  });
}
async function readSavedRecords(){
  const tx=db.transaction(PHOTO_STORE,'readonly');
  const finished=transactionDone(tx);
  const records=await new Promise((resolve,reject)=>{
    const request=tx.objectStore(PHOTO_STORE).getAll();
    request.onsuccess=()=>resolve(request.result||[]);
    request.onerror=()=>reject(request.error);
  });
  await finished;
  return records;
}
async function writeSavedRecord(record){
  if(!db)throw new Error('Local library is not available');
  const tx=db.transaction(PHOTO_STORE,'readwrite');
  tx.objectStore(PHOTO_STORE).put(record);
  await transactionDone(tx);
}
async function removeSavedRecord(hash){
  if(!db)return;
  const tx=db.transaction(PHOTO_STORE,'readwrite');
  tx.objectStore(PHOTO_STORE).delete(hash);
  await transactionDone(tx);
}
async function removeSavedRecords(hashes){
  if(!db)return;
  const tx=db.transaction(PHOTO_STORE,'readwrite');
  const store=tx.objectStore(PHOTO_STORE);
  hashes.forEach(hash=>store.delete(hash));
  await transactionDone(tx);
}
async function hashFile(file){
  if(window.crypto?.subtle){
    const bytes=await file.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  }
  // Conservative fallback for non-secure / older browser contexts.
  return `fallback-${file.size}-${file.lastModified||0}-${file.name||''}`;
}
function validProgress(p){
  if(!p||!Number.isInteger(p.rows)||!Number.isInteger(p.cols)||p.rows<1||p.rows>12||p.cols<1||p.cols>12)return false;
  if(!Array.isArray(p.xs)||!Array.isArray(p.ys)||p.xs.length!==p.cols+1||p.ys.length!==p.rows+1)return false;
  const validAxis=a=>a.every((v,i)=>Number.isFinite(v)&&v>=0&&v<=1&&(i===0||v>a[i-1]))&&a[0]===0&&a[a.length-1]===1;
  return validAxis(p.xs)&&validAxis(p.ys);
}
function captureProgress(){
  return {rows,cols,xs:[...xs],ys:[...ys],done:[...done],dim};
}
async function saveCurrentProgress(){
  const photo=photos[current];
  if(!photo||!photo.hash||!db)return;
  photo.progress=captureProgress();
  try{
    await writeSavedRecord({
      hash:photo.hash,blob:photo.file,name:photo.name,
      addedAt:photo.addedAt||Date.now(),progress:photo.progress
    });
    photo.saved=true;
    updateStorageInfo();
  }catch(err){
    photo.saved=false;
    updateStorageInfo();
    console.warn('練習状態の保存に失敗しました:',err);
  }
}
function formatBytes(bytes){
  if(bytes<1024)return `${bytes} B`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(1)} KB`;
  return `${(bytes/1024/1024).toFixed(1)} MB`;
}
function updateStorageInfo(){
  const saved=photos.filter(p=>p.saved);
  const bytes=saved.reduce((sum,p)=>sum+(p.file?.size||0),0);
  const info=$('storageInfo');
  if(info)info.textContent=`端末内保存 ${saved.length}枚 · ${formatBytes(bytes)}`;
}
async function restoreLibrary(){
  try{
    db=await openLibrary();
    const records=await readSavedRecords();
    records.sort((a,b)=>(a.addedAt||0)-(b.addedAt||0));
    for(const record of records){
      if(!record.blob||!record.hash)continue;
      const url=URL.createObjectURL(record.blob);
      photos.push({
        hash:record.hash,file:record.blob,url,name:record.name||'画像',
        addedAt:record.addedAt||Date.now(),progress:record.progress||null,saved:true
      });
    }
    renderGallery();
    updateStorageInfo();
    // Ask the browser to protect the local library from automatic eviction.
    try{if(navigator.storage?.persist)await navigator.storage.persist();}catch(err){}
  }catch(err){
    console.warn('端末内ライブラリを利用できません:',err);
    const info=$('storageInfo');
    if(info)info.textContent='端末保存を利用できません（今回の起動中のみ）';
    renderGallery();
  }
}
const libraryReady=restoreLibrary();

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
  await libraryReady;
  const all=Array.from(list||[]);
  if(!all.length)return;
  const seen=new Set(photos.map(p=>p.hash));
  const valid=[];
  let rejected=0,duplicates=0;
  for(const file of all){
    try{
      if(!isImageCandidate(file)){rejected++;continue;}
      const hash=await hashFile(file);
      if(seen.has(hash)){duplicates++;continue;}
      if(!(await canDecodeImage(file))){rejected++;continue;}
      seen.add(hash);
      valid.push({file,hash});
    }catch(err){
      // An iCloud placeholder or unreadable file should not stop the rest.
      rejected++;
      console.warn('このファイルをスキップしました:',file?.name,err);
    }
  }
  let added=0,notSaved=0;
  for(const item of valid){
    const file=item.file;
    try{
      const url=URL.createObjectURL(file);
      const photo={
        hash:item.hash,file,url,
        name:file.webkitRelativePath||file.relativePath||file.name,
        addedAt:Date.now(),progress:null,saved:false
      };
      photos.push(photo);
      try{
        if(!db)throw new Error('端末保存を利用できません');
        await writeSavedRecord({
          hash:photo.hash,blob:photo.file,name:photo.name,
          addedAt:photo.addedAt,progress:null
        });
        photo.saved=true;
      }catch(err){
        notSaved++;
        console.warn('写真を端末に保存できませんでした:',file.name,err);
      }
      added++;
    }catch(err){
      rejected++;
      console.error('画像の読み込みに失敗:',file.name,err);
    }
  }
  renderGallery();
  updateStorageInfo();
  if(photos.length)$('emptyGallery').classList.add('hidden');
  const messages=[];
  if(added)messages.push(`${added}枚を追加`);
  if(duplicates)messages.push(`${duplicates}枚は重複のためスキップ`);
  if(rejected)messages.push(`${rejected}個は画像以外・未ダウンロード・読み込み不可のため除外`);
  if(notSaved)messages.push(`${notSaved}枚は今回の起動中のみ利用可能（端末保存に失敗）`);
  if(messages.length)alert(messages.join('。\n')+'。');
}
function renderGallery(){
  const root=$('galleryGrid');root.replaceChildren();
  photos.forEach((p,i)=>{
    const wrap=document.createElement('div');wrap.className='photo-card-wrap';
    const b=document.createElement('button');b.className='photo-card';b.type='button';
    const thumb=document.createElement('div');thumb.className='photo-thumb';
    const im=document.createElement('img');im.src=p.url;im.alt=p.name;
    thumb.append(im);
    const label=document.createElement('span');label.textContent=p.name.split('/').pop();
    const state=document.createElement('small');state.className='photo-state';state.textContent=p.saved?'端末に保存済み':'一時利用';
    b.append(thumb,label,state);b.addEventListener('click',()=>openPhoto(i));
    const check=document.createElement('input');check.type='checkbox';check.className='photo-select';
    check.checked=selectedPhotoHashes.has(p.hash);
    check.setAttribute('aria-label',`${label.textContent}を選択`);
    check.addEventListener('click',e=>e.stopPropagation());
    check.addEventListener('change',()=>{
      if(check.checked)selectedPhotoHashes.add(p.hash);
      else selectedPhotoHashes.delete(p.hash);
      updateGalleryActions();
    });
    wrap.append(b,check);root.append(wrap);
  });
  $('photoCount').textContent=`${photos.length}枚`;
  $('emptyGallery').classList.toggle('hidden',photos.length>0);
  $('randomBtn').disabled=!photos.length;
  updateStorageInfo();
  updateGalleryActions();
}
function updateGalleryActions(){
  const count=selectedPhotoHashes.size;
  const selectedCount=$('selectedPhotoCount');
  if(selectedCount)selectedCount.textContent=`${count}枚選択中`;
  if($('deleteSelectedBtn'))$('deleteSelectedBtn').disabled=count===0;
  if($('selectAllBtn'))$('selectAllBtn').disabled=photos.length===0;
  if($('selectAllBtn'))$('selectAllBtn').textContent=count===photos.length&&photos.length?'選択解除':'すべて選択';
  if($('deleteAllBtn'))$('deleteAllBtn').disabled=photos.length===0;
}
async function deleteSelectedPhotos(){
  const targets=photos.filter(p=>selectedPhotoHashes.has(p.hash));
  if(!targets.length)return;
  if(!confirm(`選択した${targets.length}枚をGridxの端末内ライブラリから削除しますか？`))return;
  try{await removeSavedRecords(targets.map(p=>p.hash));}
  catch(err){alert('保存データを削除できませんでした。');return;}
  targets.forEach(p=>URL.revokeObjectURL(p.url));
  photos=photos.filter(p=>!selectedPhotoHashes.has(p.hash));
  selectedPhotoHashes.clear();
  renderGallery();
}
async function deleteAllPhotos(){
  if(!photos.length)return;
  if(!confirm(`Gridxに保存されている${photos.length}枚の写真をすべて削除しますか？この操作は元の写真ファイルには影響しません。`))return;
  const hashes=photos.map(p=>p.hash);
  try{await removeSavedRecords(hashes);}
  catch(err){alert('保存データを削除できませんでした。');return;}
  photos.forEach(p=>URL.revokeObjectURL(p.url));
  photos=[];
  selectedPhotoHashes.clear();
  renderGallery();
}
function fitPhotoToStage(){
  const img=$('photo'),wrap=$('stageWrap'),stage=$('stage');
  if(!img||!wrap||!stage||!img.naturalWidth||!img.naturalHeight)return;
  const availableWidth=wrap.clientWidth;
  if(!availableWidth)return;
  const mobile=window.matchMedia('(max-width: 600px)').matches;
  const maxHeight=Math.max(160,window.innerHeight*(mobile?.52:.62));
  const scale=Math.min(availableWidth/img.naturalWidth,maxHeight/img.naturalHeight,1);
  const width=Math.max(1,Math.round(img.naturalWidth*scale));
  const height=Math.max(1,Math.round(img.naturalHeight*scale));
  img.style.width=`${width}px`;
  img.style.height=`${height}px`;
  stage.style.width=`${width}px`;
  stage.style.height=`${height}px`;
}
function updateSelectionMode(){
  const button=$('selectionModeBtn');
  if(button){
    button.textContent=`選択モード：${selectionMode?'ON':'OFF'}`;
    button.setAttribute('aria-pressed',String(selectionMode));
  }
  const hint=$('selectionHint');
  if(hint)hint.textContent=selectionMode?'ON：マスをタップして選択・解除':'OFF：選択状態を固定（マス操作を停止）';
  $('cellButtons').style.pointerEvents=selectionMode?'auto':'none';
}
function showPhoto(i){
  if(!photos.length)return;
  current=((i%photos.length)+photos.length)%photos.length;
  const photo=photos[current],token=++displayToken;
  // Reset photo-specific, temporary selection immediately, not after loading.
  selected.clear();
  done.clear();
  rows=3;cols=3;xs=[];ys=[];dim=.9;
  $('galleryScreen').classList.add('hidden');$('gridScreen').classList.remove('hidden');
  $('currentName').textContent=photo.name.split('/').pop();
  $('selectionCount').textContent='0マス選択中';
  $('progressText').textContent='0 / 9 完了';
  $('progressBar').style.width='0%';
  $('stageWrap').style.visibility='hidden';
  $('brightCells').replaceChildren();$('cellButtons').replaceChildren();$('lines').replaceChildren();
  $('cols').value=3;$('rows').value=3;
  updatePhotoNavigation();
  updateSelectionMode();
  const img=$('photo');
  const initialize=()=>{
    if(token!==displayToken||img.src!==photo.url||!img.complete)return;
    if(!img.naturalWidth||!img.naturalHeight)return;
    const progress=photo.progress;
    if(validProgress(progress)){
      rows=progress.rows;cols=progress.cols;
      xs=[...progress.xs];ys=[...progress.ys];
      done=new Set((progress.done||[]).filter(n=>Number.isInteger(n)&&n>=0&&n<rows*cols));
      dim=Number.isFinite(progress.dim)?clamp(progress.dim,.7,.9):.9;
      $('cols').value=cols;$('rows').value=rows;
    }else{
      const w=img.naturalWidth,h=img.naturalHeight,cell=Math.min(w,h)/3;
      const c=Math.max(1,Math.ceil(w/cell)),r=Math.max(1,Math.ceil(h/cell));
      cols=clamp(c,1,12);rows=clamp(r,1,12);
      xs=[0,...even(cols),1];ys=[0,...even(rows),1];
      $('cols').value=cols;$('rows').value=rows;
    }
    fitPhotoToStage();
    $('stageWrap').style.visibility='visible';
    draw();
    if(!validProgress(progress))saveCurrentProgress();
  };
  img.onload=initialize;
  img.onerror=()=>{
    if(token!==displayToken||img.src!==photo.url)return;
    $('stageWrap').style.visibility='visible';
    alert('この画像を開けませんでした。iCloudからダウンロード済みか確認してください。');
  };
  if(img.src!==photo.url){img.src=photo.url;}
  else if(img.complete&&img.naturalWidth){initialize();}
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
  $('cols').value=cols;$('rows').value=rows;draw();saveCurrentProgress();
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
  const buttons=$('cellButtons');buttons.replaceChildren();buttons.style.setProperty('--cols',cols);buttons.style.pointerEvents=selectionMode?'auto':'none';
  for(let r=0;r<rows;r++)for(let c=0;c<cols;c++){
    const index=r*cols+c,b=document.createElement('button');b.type='button';b.setAttribute('aria-label',`行${r+1} 列${c+1}`);
    b.title=`${r+1}行 ${c+1}列`;
    b.style.background=selected.has(index)?'rgba(169,199,239,.07)':'transparent';
    b.addEventListener('click',()=>{
      if(!selectionMode)return;
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
      const up=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',up);saveCurrentProgress()};
      window.addEventListener('pointermove',move);window.addEventListener('pointerup',up);
    });lines.append(el);
  }
  $('selectionCount').textContent=`${selected.size}マス選択中`;
  updateSelectionMode();
  const completed=done.size,total=rows*cols;
  $('progressText').textContent=`${completed} / ${total} 完了`;
  $('progressBar').style.width=`${completed/total*100}%`;
  $('markDone').textContent=`✓ 選択した${selected.size}マスを完了`;
  updatePhotoNavigation();
  $('clearDone').disabled=!done.size;
  document.querySelectorAll('.dim-choice').forEach(b=>b.setAttribute('aria-pressed',String(1-(+b.dataset.dim/100)===dim)));
}

// Read dropped files and folders.
// Chromium / Safari commonly expose WebKitEntry; newer browsers may expose
// the File System Access handle API. Plain files fall back to getAsFile().
function attachRelativePath(file,path){
  try{Object.defineProperty(file,'relativePath',{value:path,configurable:true});}
  catch(err){try{file.relativePath=path;}catch(ignore){}}
  return file;
}
function readFileEntry(entry,path){
  return new Promise((resolve,reject)=>{
    entry.file(file=>resolve(attachRelativePath(file,path+file.name)),reject);
  });
}
function readDirectoryEntry(entry,path){
  return new Promise((resolve,reject)=>{
    const reader=entry.createReader(),files=[];
    const readBatch=()=>{
      reader.readEntries(async entries=>{
        if(!entries.length){resolve(files);return;}
        for(const child of entries){
          try{
            const found=await readEntry(child,path+entry.name+'/');
            files.push(...found);
          }catch(err){
            // One unavailable iCloud placeholder or unreadable file must not
            // abort importing the remaining files from this folder.
            console.warn('フォルダー内の項目をスキップしました:',child.name,err);
          }
        }
        readBatch();
      },reject);
    };
    readBatch();
  });
}
async function readEntry(entry,path=''){
  if(!entry)return [];
  if(entry.isFile)return [await readFileEntry(entry,path)];
  if(entry.isDirectory)return await readDirectoryEntry(entry,path);
  return [];
}
async function readHandle(handle,path=''){
  if(!handle)return [];
  if(handle.kind==='file'){
    const file=await handle.getFile();
    return [attachRelativePath(file,path+file.name)];
  }
  if(handle.kind==='directory'){
    const files=[];
    for await (const [name,child] of handle.entries()){
      files.push(...await readHandle(child,path+name+(child.kind==='directory'?'/':'')));
    }
    return files;
  }
  return [];
}
async function getDroppedFiles(dataTransfer){
  const items=Array.from(dataTransfer?.items||[]);
  const files=[];
  for(const item of items){
    if(item.kind!=='file')continue;
    let entry=null;
    try{if(typeof item.webkitGetAsEntry==='function')entry=item.webkitGetAsEntry();}catch(err){}
    if(entry){
      try{files.push(...await readEntry(entry));continue;}catch(err){console.warn('ドロップした項目を読み込めません:',err);}
    }
    if(typeof item.getAsFileSystemHandle==='function'){
      try{
        const handle=await item.getAsFileSystemHandle();
        if(handle){files.push(...await readHandle(handle));continue;}
      }catch(err){console.warn('フォルダーを読み込めません:',err);}
    }
    const file=item.getAsFile?.();
    if(file)files.push(file);
  }
  // Some browsers expose only DataTransfer.files for ordinary file drops.
  if(!files.length){
    return Array.from(dataTransfer?.files||[]);
  }
  return files;
}

$('fileInput').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value=''});
$('folderInput').addEventListener('change',e=>{addPhotos(e.target.files);e.target.value=''});
$('randomBtn').onclick=()=>{if(photos.length)openPhoto(Math.floor(Math.random()*photos.length))};
$('selectAllBtn').onclick=()=>{
  if(photos.length&&selectedPhotoHashes.size===photos.length)selectedPhotoHashes.clear();
  else photos.forEach(p=>selectedPhotoHashes.add(p.hash));
  renderGallery();
};
$('deleteSelectedBtn').onclick=deleteSelectedPhotos;
$('deleteAllBtn').onclick=deleteAllPhotos;

$('backBtn').onclick=backToGallery;
$('homeBtn').onclick=backToGallery;
$('selectionModeBtn').onclick=()=>{selectionMode=!selectionMode;updateSelectionMode()};
$('previousPhotoBtn').addEventListener('click',()=>navigatePhoto(current-1));
$('nextPhotoBtn').addEventListener('click',()=>navigatePhoto(current+1));
$('randomPhotoBtn').addEventListener('click',randomPhoto);
$('selectOne').onclick=()=>{selected=new Set([selected.values().next().value??0]);draw()};
$('applyGrid').onclick=()=>setGrid(+$('cols').value||4,+$('rows').value||4);
document.querySelectorAll('[data-preset]').forEach(b=>b.onclick=()=>setGrid(+b.dataset.preset,+b.dataset.preset));
document.querySelectorAll('[data-dim]').forEach(b=>b.onclick=()=>{dim=1-(+b.dataset.dim/100);draw();saveCurrentProgress()});
$('markDone').onclick=()=>{selected.forEach(i=>done.add(i));draw();saveCurrentProgress()};
$('clearDone').onclick=()=>{done.clear();draw();saveCurrentProgress()};

// Finder drag-and-drop into the gallery.
const dropZone=$('dropZone');
['dragenter','dragover'].forEach(type=>dropZone.addEventListener(type,e=>{
  e.preventDefault();e.stopPropagation();dropZone.classList.add('dragover');
}));
['dragleave','dragend'].forEach(type=>dropZone.addEventListener(type,e=>{
  e.preventDefault();e.stopPropagation();dropZone.classList.remove('dragover');
}));
dropZone.addEventListener('drop',async e=>{
  e.preventDefault();e.stopPropagation();dropZone.classList.remove('dragover');
  const files=await getDroppedFiles(e.dataTransfer);
  if(files.length)addPhotos(files);
  else alert('フォルダーの中身を読み取れませんでした。ブラウザーの「フォルダーを読み込む」ボタンを使ってください。');
});
document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',e=>{if(!dropZone.contains(e.target))e.preventDefault()});

window.addEventListener('resize',()=>{fitPhotoToStage();draw()});
if('serviceWorker'in navigator&&location.protocol.startsWith('http'))window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
