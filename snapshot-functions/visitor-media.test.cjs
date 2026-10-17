const {test}=require('node:test'),assert=require('node:assert/strict');
const media=require('./visitor-media');
const gif='data:image/gif;base64,'+Buffer.from('GIF89a-test-animation-bytes').toString('base64');
test('GIF is stored unchanged; admin publication and hide preserve metadata',async()=>{
 let saved,metadata,doc={};const db={collection:()=>({doc:()=>({set:async(v,o)=>{doc=o?{...doc,...v}:v;}})})};
 const bucket={file:()=>({save:async(b,m)=>{saved=b;metadata=m;}})};
 await media.save(db,bucket,{role:'ADMIN'},{action:'visitor_banner_save',image:gif,title:'특강'});
 assert.equal(saved.toString(),'GIF89a-test-animation-bytes');assert.equal(metadata.metadata.contentType,'image/gif');assert.equal(doc.enabled,true);assert.equal(doc.title,'특강');assert(media.safeImage(doc.url));
 await media.save(db,bucket,{role:'ADMIN'},{action:'visitor_banner_hide'});assert.equal(doc.enabled,false);assert(doc.url);
 for(const role of ['LOOKUP','TEACHER'])await assert.rejects(media.save(db,bucket,{role},{action:'visitor_banner_save',image:gif}),{code:'FORBIDDEN'});
});
test('invalid images and non-project URLs rejected',()=>{
 for(const value of ['data:image/svg+xml;base64,PHN2Zz4=','data:image/gif;base64,aGVsbG8=','data:image/jpeg;base64,'+Buffer.alloc(6*1024*1024).toString('base64')])assert.throws(()=>media.imageBytes(value),{code:'INVALID_IMAGE'});
 assert.equal(media.safeImage('javascript:alert(1)'),'');assert.equal(media.safeImage('https://evil.test/image.png'),'');
});
test('visitor response contains only active account portraits and banner presentation',async()=>{
 const url='https://firebasestorage.googleapis.com/v0/b/'+media.BUCKET+'/o/shared-icons%2Fportrait?alt=media';
 const assets=[{lookupKey:'user:a',category:'PERSON',displayName:'강사',imageUrl:url,status:'ACTIVE',privateNote:'secret'},{lookupKey:'user:b',imageUrl:url,status:'DISABLED'},{lookupKey:'school:a',imageUrl:url}];
 const db={collection:()=>({where:()=>({get:async()=>({docs:assets.map(a=>({data:()=>a}))})}),doc:()=>({get:async()=>({data:()=>({url,title:'특강',enabled:true,updatedBy:'private'})})})})};
 const r=await media.read(db);assert.equal(r.portraits.length,1);assert.equal(r.portraits[0].name,'강사');assert(!JSON.stringify(r).includes('secret'));assert(!JSON.stringify(r).includes('updatedBy'));
});
test('four independent banner slots preserve legacy slot and enforce bounds',async()=>{
 const docs={};const db={collection:()=>({doc:id=>({set:async(v,o)=>{docs[id]=o?{...docs[id],...v}:v;},get:async()=>({data:()=>docs[id]})}),where:()=>({get:async()=>({docs:[]})})})};const bucket={file:()=>({save:async()=>{}})};
 for(let slot=1;slot<=4;slot++)await media.save(db,bucket,{role:'ADMIN'},{slot,action:'visitor_banner_save',image:gif,title:'배너 '+slot});
 await media.save(db,bucket,{role:'ADMIN'},{slot:2,action:'visitor_banner_hide'});
 const result=await media.read(db);assert.equal(result.banners.length,4);assert.equal(result.banner.title,'배너 1');assert.equal(result.banners[1].enabled,false);assert.equal(result.banners[2].enabled,true);
 for(const slot of [0,5,1.5,'bad'])await assert.rejects(media.save(db,bucket,{role:'ADMIN'},{slot,action:'visitor_banner_hide'}),{code:'INVALID_SLOT'});
});
test('authorized managing staff can publish, ordinary staff and desk remain denied',async()=>{
 const db={collection:()=>({doc:()=>({set:async()=>{}})})},bucket={file:()=>({save:async()=>{}})};
 await media.save(db,bucket,{role:'STAFF',full:true},{action:'visitor_banner_save',image:gif});
 for(const who of [{role:'STAFF',full:false},{role:'DESK',full:true},{role:'LOOKUP',full:true},{role:'TEACHER',full:true}])await assert.rejects(media.save(db,bucket,who,{action:'visitor_banner_save',image:gif}),{code:'FORBIDDEN'});
});
