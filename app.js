/* Bell Yung Score Library — GitHub Pages static edition, no backend. */
'use strict';
const CATALOG_URL = 'data/catalog.json';
const STORAGE_KEY = 'bell-yung-score-archive-editor-v1';
const RECORD_FIELDS = ['id','source_filename','image','thumbnail','title','composer','publisher','series','series_number','editor','opus','work_number','volume','instrumentation','work_form','item_type','review_state','related_group','publication_year','language','physical_location','box_number','condition','inscription','catalog_notes','notes','context_note','received_from','created_at','updated_at'];
const EXPORT_FIELDS = [...RECORD_FIELDS,'reference_links'];
const LINK_SCOPES = new Set(['work','collection','edition','composer']);
let publishedCatalog = {records: [], deleted_records: []};
let publishedHash = '';
let pendingEdits = false;
function hashCatalog(records) {
  const str = JSON.stringify(records);
  let h = 2166136261;
  for (let i=0;i<str.length;i++) { h ^= str.charCodeAt(i); h = Math.imul(h,16777619); }
  return (h>>>0).toString(16);
}
function safeImg(value) {
  const v = String(value || '').trim();
  if (/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) return v;
  if (/^(?:images|thumbs)\/[A-Za-z0-9_./-]+\.(?:webp|png|jpe?g)$/i.test(v) && !v.includes('..')) return v;
  return '';
}
function safeReferenceURL(value) {
  try {
    const url = new URL(String(value||'').trim());
    return url.protocol==='https:' || url.protocol==='http:' ? url.href : '';
  } catch {return '';}
}
function normalizeReferenceLinks(input) {
  if(!Array.isArray(input))return [];
  return input.slice(0,8).flatMap(link=>{
    if(!link || typeof link!=='object')return [];
    const url=safeReferenceURL(link.url);
    if(!url)return [];
    return [{label:String(link.label||new URL(url).hostname).trim().slice(0,200),url,scope:LINK_SCOPES.has(link.scope)?link.scope:'work'}];
  });
}
function parseReferenceLinks(text) {
  if(!text.trim())return [];
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  if(lines.length>8)throw new Error('Up to eight reference links are supported per record.');
  return lines.map((line,i)=>{
    const parts=line.split(' | ');
    if(parts.length<2 || parts.length>3)throw new Error(`Reference line ${i+1}: use Label | https://example.org/page | work`);
    const [label,rawUrl,scope='work']=parts.map(x=>x.trim());
    const url=safeReferenceURL(rawUrl);
    if(!label || !url || label.length>200 || !LINK_SCOPES.has(scope))throw new Error(`Reference line ${i+1}: enter a label, valid http(s) URL, and a scope: work, collection, edition, or composer.`);
    return {label,url,scope};
  });
}
function referenceLines(links) {
  return (links||[]).map(link=>`${link.label} | ${link.url} | ${link.scope||'work'}`).join('\n');
}
function isoNow() { return new Date().toISOString().replace('T',' ').slice(0,19); }
function normalizeScores(records) {
  if (!Array.isArray(records) || records.length>10000) throw new Error('Expected an array of at most 10,000 catalog records');
  const found = new Set();
  return records.map(obj => {
    if (!obj || typeof obj!=='object' || Array.isArray(obj) || !/^BY-\d{4,}$/.test(obj.id) || found.has(obj.id)) throw new Error('Catalog contains missing or duplicate archive IDs');
    found.add(obj.id);
    const record = {};
    for (const k of RECORD_FIELDS) record[k] = typeof obj[k] === 'string' ? obj[k] : (obj[k] == null ? '' : String(obj[k]));
    record.image = safeImg(record.image);
    record.thumbnail = safeImg(record.thumbnail);
    record.reference_links = normalizeReferenceLinks(obj.reference_links);
    return record;
  });
}
// Reads both the original array format and the newer versioned document format.
// Deleted records stay in the JSON trash, preserving ID history and enabling restore.
function normalizeCatalog(document) {
  const data=Array.isArray(document)?{records:document,deleted_records:[]}:document;
  if(!data || typeof data!=='object' || Array.isArray(data) || !Array.isArray(data.records) || !Array.isArray(data.deleted_records||[])) {
    throw new Error('Expected a catalog object containing records and deleted_records arrays');
  }
  const records=normalizeScores(data.records);
  const deletedRecords=normalizeScores(data.deleted_records||[]).map((rec,index)=>({
    ...rec,
    deleted_at: typeof data.deleted_records[index].deleted_at==='string' ? data.deleted_records[index].deleted_at : ''
  }));
  const ids=new Set(records.map(rec=>rec.id));
  for(const rec of deletedRecords) if(ids.has(rec.id)) throw new Error(`Duplicate active/deleted archive ID: ${rec.id}`);
  return {records,deleted_records:deletedRecords};
}
function currentCatalog() {return {records:state.scores,deleted_records:state.deleted};}
function setCatalog(document, save=true) {
  const catalog=normalizeCatalog(document);
  if(save) {
    try {localStorage.setItem(STORAGE_KEY,JSON.stringify({baseHash:publishedHash,catalog,savedAt:isoNow()}));}
    catch(err){throw new Error('Browser storage is full or disabled. Export your JSON backup before adding large images.');}
  }
  state.scores=catalog.records;
  state.deleted=catalog.deleted_records;
  pendingEdits=hashCatalog(catalog)!==publishedHash;
  updateEditIndicator();
  renderStats();renderFacets();renderCatalog();
}
function setRecords(records,save=true,deleted=state.deleted) {setCatalog({records,deleted_records:deleted},save);}

function updateEditIndicator() {
  const el = $('local-edit-count');
  if (!el) return;
  el.textContent = pendingEdits ? ' · Unpublished browser changes' : ' · Showing published inventory';
  el.classList.toggle('unsaved',pendingEdits);
}
function downloadFile(name, data, type) {
  const blob = new Blob([data],{type});
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),2000);
}
function downloadJSON() {
  downloadFile('catalog.json', JSON.stringify(currentCatalog(),null,2)+'\n','application/json;charset=utf-8');
  toast('catalog.json downloaded. Commit it at data/catalog.json on GitHub to publish.');
}
function downloadCSV() {
  const values = [EXPORT_FIELDS.join(',')];
  const csv = v=>'"'+String(v??'').replace(/"/g,'""')+'"';
  for (const rec of state.scores) values.push(EXPORT_FIELDS.map(k=>csv(k==='reference_links'?JSON.stringify(rec.reference_links||[]):rec[k])).join(','));
  downloadFile('bell-yung-score-catalog.csv','\ufeff'+values.join('\r\n')+'\r\n','text/csv;charset=utf-8');
  toast('Catalog CSV downloaded');
}
async function importJSON(event) {
  const file=event.target.files[0]; event.target.value=''; if(!file)return;
  try {
    if(file.size>24_000_000) throw new Error('JSON file exceeds 24 MB');
    const catalog=normalizeCatalog(JSON.parse(await file.text()));
    if(!confirm(`Replace your browser catalog with ${catalog.records.length} active records and ${catalog.deleted_records.length} deleted records from ${file.name}? This does not change your public GitHub site.`))return;
    setCatalog(catalog);closeDetails();toast(`Imported ${catalog.records.length} active records into this browser`);
  }catch(err){toast('Import failed: '+err.message);}
}
function discardBrowserEdits() {
  if(!confirm('Discard all unpublished edits saved in this browser and return to the catalog published on GitHub?'))return;
  localStorage.removeItem(STORAGE_KEY);
  setCatalog(publishedCatalog,false);closeDetails();toast('Restored the published catalog');
}

const state = {scores:[], deleted:[], search:'', composer:'All', type:'All', review:'All', sort:'id', view:'grid', selectedId:null, editing:false};
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const isScore = item => item.item_type === 'Score cover';
const labelType = type => ({'Score cover':'Music score','Publisher catalog / advertisement':'Publisher advertisement','Non-score / other':'Other material'})[type] || type;
const display = value => value && String(value).trim() ? esc(value) : '<span class="muted-value">Not recorded</span>';
let toastTimer;
function toast(message) {
  const el = $('toast'); el.textContent = message; el.classList.add('shown');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('shown'), 3200);
}
function sortByLabel(items) {return items.sort((a,b) => a[0].localeCompare(b[0]));}
function countBy(records,field){const count = new Map();for(const row of records){const k=row[field]||'Unattributed';count.set(k,(count.get(k)||0)+1);}return count;}
function renderFacets() {
  const types=[['All','All materials'],['Score cover','Music scores'],['Publisher catalog / advertisement','Publisher ads'],['Non-score / other','Other items']];
  const typeCounts=countBy(state.scores,'item_type');
  $('type-filters').innerHTML=types.map(([key,label]) => facetHTML('type',key,label,key==='All'?state.scores.length:(typeCounts.get(key)||0),state.type===key)).join('');
  const composers=[['All',state.scores.length],...sortByLabel(Array.from(countBy(state.scores,'composer').entries()).filter(([k])=>k!=='Unattributed'))];
  if(state.scores.some(s=>!s.composer)) composers.push(['Unattributed',state.scores.filter(s=>!s.composer).length]);
  $('composer-filters').innerHTML=composers.map(([key,n])=>facetHTML('composer',key,key==='All'?'All composers':key,n,state.composer===key)).join('');
  $('composer-count').textContent=`(${composers.length-1})`;
  const statusCounts=countBy(state.scores,'review_state');
  $('status-filters').innerHTML=[['All','All records'],['Cover transcribed','Cover transcribed'],['Needs review','Needs review'],['User verified','User verified']]
    .map(([key,label])=>facetHTML('review',key,label,key==='All'?state.scores.length:(statusCounts.get(key)||0),state.review===key)).join('');
  for(const element of document.querySelectorAll('[data-filter]'))element.addEventListener('click',()=>{
    state[element.dataset.filter]=element.dataset.value;renderFacets();renderCatalog();
  });
}
function facetHTML(group,key,label,count,active){return `<button type="button" class="facet ${active?'active':''}" data-filter="${esc(group)}" data-value="${esc(key)}" aria-pressed="${active}"><span>${esc(label)}</span><span>${count}</span></button>`;}
function renderStats() {
  const records=state.scores;
  $('stat-total').textContent=records.length;
  $('trash-btn').textContent=`Trash (${state.deleted.length})`;
  $('trash-btn').setAttribute('aria-label',`Open trash with ${state.deleted.length} deleted records`);
  $('stat-scores').textContent=records.filter(isScore).length;
  $('stat-composers').textContent=new Set(records.filter(isScore).map(s=>s.composer).filter(Boolean)).size;
  $('stat-attention').textContent=records.filter(s=>s.review_state==='Needs review').length;
  $('stat-cataloged').textContent=records.filter(s=>s.physical_location || s.box_number).length;
}
function filteredRecords() {
  const query=state.search.toLocaleLowerCase();
  const items=state.scores.filter(s=>{
    if(state.type!=='All'&&s.item_type!==state.type)return false;
    if(state.composer!=='All'&&(s.composer||'Unattributed')!==state.composer)return false;
    if(state.review!=='All'&&s.review_state!==state.review)return false;
    if(!query)return true;
    return ['id','title','composer','publisher','series','series_number','editor','opus','work_number','volume','instrumentation','notes','source_filename','physical_location','box_number','inscription','catalog_notes','work_form','context_note'].some(key=>String(s[key]||'').toLocaleLowerCase().includes(query));
  });
  items.sort((a,b)=>state.sort==='composer'?(a.composer||'zzz').localeCompare(b.composer||'zzz')||a.title.localeCompare(b.title):state.sort==='title'?a.title.localeCompare(b.title):state.sort==='recent'?b.updated_at.localeCompare(a.updated_at)||a.id.localeCompare(b.id):a.id.localeCompare(b.id));
  return items;
}
function renderCatalog() {
  const items=filteredRecords();
  $('results-number').textContent=`${items.length} of ${state.scores.length} entries`;
  $('footer-count').textContent=`SHOWING ${items.length} ENTRIES`;
  const grid=$('catalog-grid');
  grid.classList.toggle('list-view',state.view==='list');
  grid.innerHTML=items.map(s=>{
    const thumb=safeImg(s.thumbnail||s.image)?`<img loading="lazy" src="${esc(safeImg(s.thumbnail||s.image))}" alt="Cover photo of ${esc(s.title)}">`:'<span class="cover-placeholder" aria-hidden="true">♫</span>';
    const status=s.review_state==='Needs review'?'<span class="review-icon">◇ REVIEW</span>':s.review_state==='User verified'?'<span class="confirmed-icon">✓ VERIFIED</span>':'<span>› VIEW DETAILS</span>';
    const sub=s.volume||s.opus||s.series||s.instrumentation||'View record';
    return `<article class="score-card" tabindex="0" role="button" data-id="${esc(s.id)}" aria-label="View ${esc(s.title)} by ${esc(s.composer||'unknown composer')}, record ${esc(s.id)}"><div class="cover-wrap">${thumb}<span class="cover-id">${esc(s.id)}</span></div><div class="card-info"><p class="card-type">${esc(labelType(s.item_type))}</p><h3>${esc(s.title||'Untitled')}</h3><p class="card-composer">${esc(s.composer||'Composer not identified')}</p><div class="card-bottom"><span>${esc(sub)}</span>${status}</div></div></article>`;
  }).join('');
  $('empty-state').hidden=items.length!==0;
}
function openDetails(id,edit=false) {
  const rec=state.scores.find(s=>s.id===id);
  if(!rec)return;
  state.selectedId=id;state.editing=edit;state.trashOpen=false;
  $('dialog-backdrop').hidden=false;document.body.style.overflow='hidden';
  renderDetail(rec);$('detail-dialog').focus();
}
function closeDetails() {state.selectedId=null;state.editing=false;state.trashOpen=false;$('dialog-backdrop').hidden=true;document.body.style.overflow='';}
const fieldLabels={publisher:'Publisher / imprint',series:'Series',series_number:'Series / edition no.',editor:'Editor / arranger',opus:'Opus number',work_number:'Catalog / work number',volume:'Book / volume',instrumentation:'Instrumentation',work_form:'Work form',publication_year:'Publication year',language:'Language',related_group:'Related group',source_filename:'Original photo filename',received_from:'Received from',physical_location:'Shelf / location',box_number:'Box / folder',condition:'Condition',inscription:'Inscription / ownership marking',notes:'Cover / transcription notes',catalog_notes:'My cataloging notes',review_state:'Review state',item_type:'Material type'};
function detailRows(rec, keys) {return `<dl class="detail-rows">${keys.map(k=>`<dt>${esc(fieldLabels[k]||k)}</dt><dd>${display(rec[k])}</dd>`).join('')}</dl>`;}
function renderDetail(rec) {
  const photo=safeImg(rec.image)?`<a href="${esc(safeImg(rec.image))}" target="_blank" rel="noopener" title="Open larger cover photo"><img src="${esc(safeImg(rec.image))}" alt="Photographed cover of ${esc(rec.title)}"></a>`:'<span class="cover-placeholder">♫<br><small>No photo yet</small></span>';
  $('detail-dialog').innerHTML=`<div class="dialog-top"><div><span class="archive-id">ARCHIVE NO. ${esc(rec.id)}</span><div style="font-size:10px;color:#8b8a80;margin-top:3px">${esc(rec.source_filename)}</div></div><div class="dialog-actions">${state.editing?'<button class="dialog-btn" id="cancel-edit">Cancel</button>':'<button class="dialog-btn primary" id="edit-button">✎ Edit record</button><button class="dialog-btn danger" id="delete-record">Delete record</button>'}<button class="dialog-btn close" id="close-details" aria-label="Close details">×</button></div></div><div class="detail-body"><div class="detail-photo"><div>${photo}<div class="detail-photo-caption">Photograph ${esc(rec.source_filename)} · Click image to enlarge</div></div></div><div class="detail-text">${state.editing?editForm(rec):readOnlyDetails(rec)}</div></div>`;
  $('close-details').addEventListener('click',closeDetails);
  if(state.editing){
    $('cancel-edit').addEventListener('click',()=>{state.editing=false;renderDetail(rec)});
    $('record-form').addEventListener('submit',saveRecord);
    $('upload-image').addEventListener('change',uploadImage);
    $('delete-form').addEventListener('click',()=>deleteRecord(rec.id));
  } else {
    $('edit-button').addEventListener('click',()=>{state.editing=true;renderDetail(rec)});
    $('delete-record').addEventListener('click',()=>deleteRecord(rec.id));
  }
}
function contextSection(rec) {
  const links=rec.reference_links||[];
  if(!rec.context_note && !links.length)return '';
  const scopeLabels={work:'About the composition',collection:'Broader repertoire',edition:'About this edition',composer:'Composer background'};
  const items=links.map(link=>`<a class="reference-link" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer"><span class="reference-label">${esc(link.label)}</span><span class="reference-scope">${esc(scopeLabels[link.scope]||scopeLabels.work)} <span aria-hidden="true">↗</span></span></a>`).join('');
  return `<section class="detail-block context-block" aria-label="Music history and further reading"><h3>Learn about this music</h3>${rec.context_note?`<p class="music-context">${esc(rec.context_note)}</p>`:''}${links.length?`<div class="reference-links">${items}</div>`:''}<p class="help-note reference-disclaimer">These independent references describe the composition, wider repertoire, or edition as labeled; they may not document this specific physical copy.</p></section>`;
}
function readOnlyDetails(rec) {
  const flag=rec.review_state==='Needs review'?'Needs review':rec.review_state==='User verified'?'User verified':'Cover transcribed · not yet independently checked';
  return `<div class="detail-kicker">${esc(labelType(rec.item_type))} · ${esc(flag)}</div><h2 class="detail-title">${esc(rec.title)}</h2><p class="detail-composer">${esc(rec.composer||'Composer not identified')}</p>
    ${contextSection(rec)}
    <div class="detail-block"><h3>Bibliographic details</h3>${detailRows(rec,['publisher','series','series_number','editor','opus','work_number','volume','instrumentation','work_form','publication_year','language'])}</div>
    <div class="detail-block"><h3>Physical cataloging</h3>${detailRows(rec,['physical_location','box_number','condition','inscription','received_from'])}</div>
    <div class="detail-block"><h3>Record &amp; observations</h3>${detailRows(rec,['review_state','item_type','related_group','source_filename'])}${rec.notes?`<p class="detail-notes"><strong>From cover:</strong> ${esc(rec.notes)}</p>`:''}${rec.catalog_notes?`<p class="detail-notes"><strong>My notes:</strong> ${esc(rec.catalog_notes)}</p>`:''}</div>
    <div class="detail-block"><p class="help-note">Each photo has its own permanent archive ID. Physical copies, publication dates, and bibliographic details have not been independently verified.</p></div>`;
}
const sections=[
 {title:'Work identification',fields:[['title','Title','wide'],['composer','Composer','wide'],['publisher','Publisher / imprint','wide'],['series','Series'],['series_number','Series / edition no.'],['editor','Editor / arranger','wide'],['opus','Opus'],['work_number','Work number'],['volume','Volume / book'],['instrumentation','Instrumentation'],['work_form','Work form'],['publication_year','Publication year'],['language','Language']]},
 {title:'Physical cataloging',fields:[['physical_location','Shelf / location'],['box_number','Box / folder'],['condition','Physical condition','wide'],['inscription','Inscriptions / ownership marks','wide'],['received_from','Received from','wide']]},
 {title:'Music history & references',fields:[['context_note','Short background for visitors','wide']]},
 {title:'Review & notes',fields:[['item_type','Material type'],['review_state','Review state'],['related_group','Related group','wide'],['notes','Cover transcription notes','wide'],['catalog_notes','Cataloging notes','wide']]}
];
const textareaFields=new Set(['notes','catalog_notes','context_note','condition','inscription']);
const selectChoices={item_type:['Score cover','Publisher catalog / advertisement','Non-score / other'],review_state:['Cover transcribed','Needs review','User verified']};
function fieldHTML(rec,[key,label,width]) {
  const value=rec[key]||'';
  let control;
  if(selectChoices[key])control=`<select id="f-${key}" name="${key}">${selectChoices[key].map(item=>`<option value="${esc(item)}" ${item===value?'selected':''}>${esc(item)}</option>`).join('')}</select>`;
  else if(textareaFields.has(key))control=`<textarea id="f-${key}" name="${key}">${esc(value)}</textarea>`;
  else control=`<input id="f-${key}" name="${key}" value="${esc(value)}" maxlength="5000">`;
  return `<label class="${width==='wide'?'wide':''}" for="f-${key}">${esc(label)}${control}</label>`;
}
function editForm(rec) {
  return `<div class="detail-kicker">EDITING ${esc(rec.id)}</div><h2 class="detail-title" style="font-size:29px;margin-bottom:23px">Catalog this score</h2><form id="record-form" class="edit-form">
    ${sections.map(s=>`<h3 class="form-section-title">${esc(s.title)}</h3><div class="form-field-grid">${s.fields.map(f=>fieldHTML(rec,f)).join('')}</div>`).join('')}
    <h3 class="form-section-title">Further reading links</h3>
    <label for="reference-input">External sources — one per line<span class="help-note">Format: <code>Link label | https://example.com/article | work</code>. Scope can be <code>work</code>, <code>collection</code>, <code>edition</code>, or <code>composer</code>. Up to 8 links. These will open in a new tab.</span><textarea id="reference-input" name="reference_links_text" rows="4">${esc(referenceLines(rec.reference_links))}</textarea></label>
    <h3 class="form-section-title">Cover photo</h3>
    <div class="form-field-grid"><label class="wide" for="image-path">Image path in repository <input id="image-path" name="image_path" value="${esc(rec.image.startsWith('data:')?'':rec.image)}" placeholder="images/new-cover.webp"></label><label class="wide" for="thumb-path">Thumbnail path in repository (optional) <input id="thumb-path" name="thumb_path" value="${esc(rec.thumbnail.startsWith('data:')?'':rec.thumbnail)}" placeholder="thumbs/new-cover.webp"></label></div>
    <label for="upload-image">Or add an image from your device <span class="help-note">JPEG, PNG, or WebP, up to 15 MB. The site compresses it and embeds it in exported JSON. Large photos are better committed as separate files in <code>images/</code>.</span><input id="upload-image" type="file" accept="image/jpeg,image/png,image/webp"></label>
    <p class="help-note">Changes are saved only in this browser. Export <strong>catalog.json</strong> and replace <code>data/catalog.json</code> in your GitHub repository to publish them for everyone. The permanent archive ID stays unchanged.</p>
    <div class="form-actions"><button class="dialog-btn primary" type="submit">Save record</button><button class="dialog-btn" type="button" id="cancel-form">Cancel</button><button class="dialog-btn danger" type="button" id="delete-form">Delete record</button><span class="help-note" id="save-status"></span></div>
  </form>`;
}
function saveRecord(event) {
  event.preventDefault();
  const button=event.currentTarget.querySelector('button[type=submit]');
  button.disabled=true;
  const fields=Object.fromEntries(new FormData(event.currentTarget).entries());
  try {fields.reference_links=parseReferenceLinks(String(fields.reference_links_text||''));delete fields.reference_links_text;}
  catch(err){$('save-status').textContent=err.message;toast(err.message);button.disabled=false;return;}
  const old=state.scores.find(s=>s.id===state.selectedId);
  if(!old)return;
  const imagePath=String(fields.image_path||'').trim(), thumbPath=String(fields.thumb_path||'').trim();
  delete fields.image_path;delete fields.thumb_path;
  if(imagePath){if(!safeImg(imagePath)){toast('Use an image path like images/cover.webp');button.disabled=false;return;}fields.image=imagePath;}
  if(thumbPath){if(!safeImg(thumbPath)){toast('Use a thumbnail path like thumbs/cover.webp');button.disabled=false;return;}fields.thumbnail=thumbPath;}
  else if(imagePath && imagePath!==old.image)fields.thumbnail=imagePath;
  const next={...old,...fields,updated_at:isoNow()};
  try {replaceRecord(next);state.editing=false;renderDetail(next);toast(`${next.id} saved in this browser — export JSON to publish`);}
  catch(err){$('save-status').textContent=err.message;toast('Could not save: '+err.message);button.disabled=false;}
}
function canvasData(file, maxDimension, quality) {
  return new Promise((resolve,reject)=>{
    const input = new Image();
    const url=URL.createObjectURL(file);
    input.onload=()=>{
      URL.revokeObjectURL(url);
      try {
        const scale=Math.min(1,maxDimension/Math.max(input.naturalWidth,input.naturalHeight));
        const canvas=document.createElement('canvas');canvas.width=Math.round(input.naturalWidth*scale);canvas.height=Math.round(input.naturalHeight*scale);
        if(!canvas.width||!canvas.height)throw new Error('Empty image');
        canvas.getContext('2d').drawImage(input,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/webp',quality));
      }catch(err){reject(err);}
    };
    input.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Unable to decode image'));};
    input.src=url;
  });
}
async function uploadImage(event) {
  const file=event.currentTarget.files[0];if(!file)return;
  if(file.size>15_000_000 || !['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Select a JPEG, PNG or WebP under 15 MB');return;}
  try {
    const [image,thumbnail] = await Promise.all([canvasData(file,1400,.76),canvasData(file,480,.68)]);
    const rec=state.scores.find(s=>s.id===state.selectedId);
    const next={...rec,image,thumbnail,source_filename:rec.source_filename||file.name,updated_at:isoNow()};
    replaceRecord(next);
    // Photo upload updates immediately. Reload the form so the photo can be previewed.
    renderDetail(next);
    toast('Photo stored in this browser. Export JSON to publish it.');
  }catch(err){toast('Photo could not be saved: '+err.message);}
}
function replaceRecord(rec) {
  const next=state.scores.map(s=>s.id===rec.id ? rec : s);
  if(!next.some(s=>s.id===rec.id))next.push(rec);
  setRecords(next);
}
function resetFilters() {state.search='';state.composer='All';state.type='All';state.review='All';$('search-input').value='';renderFacets();renderCatalog();}
function newRecord() {
  if(!confirm('Create a new blank catalog record with the next permanent archive ID?'))return;
  const nextNum=Math.max(0,...[...state.scores,...state.deleted].map(s=>Number(s.id.match(/^BY-(\d+)$/)?.[1]||0)))+1;
  const id='BY-'+String(nextNum).padStart(4,'0');
  const rec=Object.fromEntries(RECORD_FIELDS.map(k=>[k,'']));
  Object.assign(rec,{id,title:'Untitled — identification pending',reference_links:[],item_type:'Score cover',review_state:'Needs review',created_at:isoNow(),updated_at:isoNow()});
  try{replaceRecord(rec);openDetails(rec.id,true);toast(`${id} created locally. Export JSON to publish.`);}
  catch(err){toast('Could not add record: '+err.message);}
}
function deleteRecord(id) {
  const record=state.scores.find(s=>s.id===id);
  if(!record)return;
  if(!confirm(`Delete ${record.id} — ${record.title || 'Untitled'}?\n\nIt will disappear from the catalog and move to Trash, where you can restore it. The original cover photo file will remain in the repository.\n\nThis change is saved only in this browser until you export catalog.json and commit it to GitHub.`))return;
  const remaining=state.scores.filter(s=>s.id!==id);
  const deleted=[...state.deleted,{...record,deleted_at:isoNow()}];
  try {
    setRecords(remaining,true,deleted);
    closeDetails();
    toast(`${id} moved to Trash. Export catalog.json to publish.`);
  }catch(err){toast('Could not delete record: '+err.message);}
}
function restoreRecord(id) {
  const record=state.deleted.find(s=>s.id===id);
  if(!record)return;
  const restored={...record};delete restored.deleted_at;
  const remaining=state.deleted.filter(s=>s.id!==id);
  try {
    setRecords([...state.scores,restored],true,remaining);
    renderTrash();toast(`${id} restored to the catalog. Export catalog.json to publish.`);
  }catch(err){toast('Could not restore record: '+err.message);}
}
function openTrash() {
  state.selectedId=null;state.editing=false;state.trashOpen=true;
  $('dialog-backdrop').hidden=false;document.body.style.overflow='hidden';
  renderTrash();$('detail-dialog').focus();
}
function renderTrash() {
  const cards=[...state.deleted].reverse().map(s=>{
    const src=safeImg(s.thumbnail||s.image);
    return `<article class="trash-item"><div class="trash-image">${src?`<img src="${esc(src)}" alt="Cover photo of ${esc(s.title)}">`:'♫'}</div><div class="trash-description"><strong>${esc(s.id)} · ${esc(s.title||'Untitled')}</strong><p>${esc(s.composer||'Composer not identified')}</p><small>Moved to Trash: ${esc(s.deleted_at||'Unknown date')}</small></div><button type="button" class="dialog-btn restore-btn" data-restore-id="${esc(s.id)}">Restore</button></article>`;
  }).join('');
  $('detail-dialog').innerHTML=`<div class="dialog-top"><div><span class="archive-id">CATALOG TRASH · ${state.deleted.length} RECORDS</span></div><div class="dialog-actions"><button class="dialog-btn close" id="close-details" aria-label="Close trash">×</button></div></div><div class="trash-content"><h2>Deleted records</h2><p>Deleted items are hidden from the gallery and CSV export, but retained in the JSON backup so they can be restored and their permanent IDs are never reused. Photo files are not removed from GitHub.</p>${cards||'<div class="trash-empty">The Trash is empty.</div>'}<p class="help-note">Restoring a record affects this browser only. Export catalog.json and commit it to GitHub to publish the change.</p></div>`;
  $('close-details').addEventListener('click',closeDetails);
  for(const button of $('detail-dialog').querySelectorAll('[data-restore-id]'))button.addEventListener('click',()=>restoreRecord(button.dataset.restoreId));
}
function bindUI() {
  $('search-input').addEventListener('input',ev=>{state.search=ev.target.value.trim();renderCatalog();});
  $('sort-select').addEventListener('change',ev=>{state.sort=ev.target.value;renderCatalog();});
  $('grid-button').addEventListener('click',()=>{state.view='grid';$('grid-button').classList.add('active');$('list-button').classList.remove('active');renderCatalog();});
  $('list-button').addEventListener('click',()=>{state.view='list';$('list-button').classList.add('active');$('grid-button').classList.remove('active');renderCatalog();});
  $('clear-filters').addEventListener('click',resetFilters);$('empty-reset').addEventListener('click',resetFilters);
  $('catalog-grid').addEventListener('click',ev=>{const card=ev.target.closest('[data-id]');if(card)openDetails(card.dataset.id);});
  $('catalog-grid').addEventListener('keydown',ev=>{if(ev.key==='Enter'||ev.key===' '){const card=ev.target.closest('[data-id]');if(card){ev.preventDefault();openDetails(card.dataset.id);}}});
  $('dialog-backdrop').addEventListener('click',ev=>{if(ev.target===$('dialog-backdrop'))closeDetails();});
  document.addEventListener('keydown',ev=>{if(ev.key==='Escape'&&!$('dialog-backdrop').hidden)closeDetails();});
  $('add-record').addEventListener('click',newRecord);
  $('trash-btn').addEventListener('click',openTrash);
  $('export-json').addEventListener('click',downloadJSON);
  $('export-csv').addEventListener('click',downloadCSV);
  $('import-json').addEventListener('click',()=>{$('import-file').click();});
  $('import-file').addEventListener('change',importJSON);
  $('reset-edits').addEventListener('click',discardBrowserEdits);
  $('export-btn').addEventListener('click',()=>{const menu=$('export-menu');menu.hidden=!menu.hidden;$('export-btn').setAttribute('aria-expanded',!menu.hidden);});
  document.addEventListener('click',ev=>{if(!ev.target.closest('#export-menu')&&!ev.target.closest('#export-btn')){$('export-menu').hidden=true;$('export-btn').setAttribute('aria-expanded','false');}});
  document.addEventListener('click',ev=>{if(ev.target.id==='cancel-form') {const rec=state.scores.find(s=>s.id===state.selectedId);state.editing=false;if(rec)renderDetail(rec);}});
}
async function main() {
  bindUI();
  try {
    const response=await fetch(CATALOG_URL,{cache:'no-cache'});
    if(!response.ok)throw new Error(`Could not load ${CATALOG_URL} (HTTP ${response.status})`);
    publishedCatalog=normalizeCatalog(await response.json());
    publishedHash=hashCatalog(publishedCatalog);
    let local;
    try {local=JSON.parse(localStorage.getItem(STORAGE_KEY));}catch{local=null;}
    if(local?.catalog || local?.scores){
      if(local.baseHash!==publishedHash && !confirm('The published catalog has changed since this browser saved edits. Keep your browser edits instead of loading the new published version?')){
        localStorage.removeItem(STORAGE_KEY);local=null;
      }
    }
    let initial=local?.catalog || (local?.scores ? {records:local.scores,deleted_records:local.deleted||[]} : publishedCatalog);
    if(local && local.baseHash!==publishedHash) {
      const liveById=new Map(publishedCatalog.records.map(rec=>[rec.id,rec]));
      // Backfill only missing reference metadata in older browser inventories.
      initial={...initial,records:initial.records.map(rec=>{
        const updated=liveById.get(rec.id);if(!updated)return rec;
        return {...rec,
          context_note:rec.context_note || updated.context_note,
          reference_links:Array.isArray(rec.reference_links)&&rec.reference_links.length ? rec.reference_links : updated.reference_links
        };
      })};
    }
    setCatalog(initial,false);
    pendingEdits=hashCatalog(currentCatalog())!==publishedHash;
    updateEditIndicator();
  }catch(err){
    $('catalog-grid').innerHTML=`<div class="empty-state" style="display:block"><h3>Catalog unavailable</h3><p>${esc(err.message)}. For local preview, run a basic static HTTP server, or publish the folder to GitHub Pages.</p></div>`;
    $('results-number').textContent='Loading error';
  }
}
document.addEventListener('DOMContentLoaded',main);
