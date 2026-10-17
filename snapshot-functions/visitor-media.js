'use strict';
const crypto=require('node:crypto');
const BUCKET='fir-lms-prod.firebasestorage.app';
const fail=code=>{throw Object.assign(new Error(code),{code});};
function imageBytes(value){
 const m=String(value||'').match(/^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/);
 if(!m||m[2].length>7*1024*1024)fail('INVALID_IMAGE');
 const bytes=Buffer.from(m[2],'base64');
 if(!bytes.length||bytes.length>5*1024*1024)fail('INVALID_IMAGE');
 const valid={'image/png':bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])), 'image/jpeg':bytes[0]===255&&bytes[1]===216&&bytes[2]===255,
 'image/gif':/^GIF8[79]a$/.test(bytes.subarray(0,6).toString()),'image/webp':bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP'};
 if(!valid[m[1]])fail('INVALID_IMAGE');
 return {bytes,type:m[1]};
}
function safeImage(url){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='firebasestorage.googleapis.com'&&u.pathname.startsWith('/v0/b/'+BUCKET+'/o/')?u.href:'';}catch{return '';}}
async function read(db){
 const [assets,banner]=await Promise.all([db.collection('sharedIconAssets').where('category','==','PERSON').get(),db.collection('liveTimetableVisitorMedia').doc('banner').get()]);
 const portraits=[];
 for(const doc of assets.docs){const a=doc.data()||{},url=safeImage(a.imageUrl||a.downloadURL);if((a.status||'ACTIVE')!=='ACTIVE'||!/^user:/.test(a.lookupKey||'')||!url)continue;
  portraits.push({name:String(a.displayName||'').slice(0,80),aliases:Array.isArray(a.aliases)?a.aliases.filter(n=>typeof n==='string').slice(0,10):[],url,owner:crypto.createHash('sha256').update(a.lookupKey).digest('hex')});
 }
 const extra=await Promise.all([2,3,4].map(n=>db.collection('liveTimetableVisitorMedia').doc('banner'+n).get()));
 const banners=[banner,...extra].map((doc,i)=>{const b=doc.data()||{};return safeImage(b.url)?{slot:i+1,url:b.url,title:String(b.title||'학원 소식'),enabled:b.enabled!==false}:null;});
 return {portraits,banner:banners[0],banners};
}
async function save(db,bucket,who,input){
 if(!(who.role==='ADMIN'||(who.role==='STAFF'&&who.full===true)))fail('FORBIDDEN');
 const slot=input.slot===undefined?1:Number(input.slot);if(!Number.isInteger(slot)||slot<1||slot>4)fail('INVALID_SLOT');
 const ref=db.collection('liveTimetableVisitorMedia').doc(slot===1?'banner':'banner'+slot);
 if(input.action==='visitor_banner_hide'){await ref.set({enabled:false},{merge:true});return;}
 const image=imageBytes(input.image),token=crypto.randomUUID(),path='live-timetable/visitor-banners/'+crypto.randomUUID();
 await bucket.file(path).save(image.bytes,{resumable:false,metadata:{contentType:image.type,cacheControl:'public,max-age=31536000,immutable',metadata:{firebaseStorageDownloadTokens:token}}});
 const url='https://firebasestorage.googleapis.com/v0/b/'+BUCKET+'/o/'+encodeURIComponent(path)+'?alt=media&token='+token;
 await ref.set({url,title:String(input.title||'학원 소식').trim().slice(0,100),enabled:true,updatedAt:Date.now()});
}
module.exports={BUCKET,imageBytes,safeImage,read,save};
