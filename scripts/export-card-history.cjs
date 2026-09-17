// Explicit read-only source export; never modifies Sheets or Firestore.
const fs = require('node:fs');
const path = require('node:path');
async function main(args) {
  const arg = name => { const i=args.indexOf(name); return i<0?undefined:args[i+1]; };
  const id=arg('--spreadsheet'), output=arg('--output');
  if (!/^[A-Za-z0-9_-]{10,200}$/.test(id || '') || !output) throw Error('Use --spreadsheet SOURCE_ID --output NEW_PRIVATE_FILE.json');
  if (fs.existsSync(output)) throw Error('Refusing to overwrite an existing export');
  const modulePath=process.env.GOOGLE_AUTH_MODULE;
  if (!modulePath || !path.isAbsolute(modulePath)) throw Error('Set GOOGLE_AUTH_MODULE to an installed google-auth-library absolute path');
  const {GoogleAuth}=require(modulePath);
  const auth=new GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
  const client=await auth.getClient();
  const range=encodeURIComponent("'학생카드발송로그'!A:F");
  const response=await client.request({url:`https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${range}`,params:{majorDimension:'ROWS',valueRenderOption:'FORMATTED_VALUE'},timeout:45000});
  const rows=(response.data.values || []).map(row=>Array.from({length:6},(_,i)=>String(row[i] ?? '')));
  if (!rows.length || rows[0][0]!=='일자시트' || rows[0][1]!=='학생명') throw Error('Expected card history header; no export written');
  const snapshot={sourceSpreadsheetId:id,exportedAt:new Date().toISOString(),rows};
  fs.writeFileSync(output,JSON.stringify(snapshot,null,2),{flag:'wx',mode:0o600});
  console.log(JSON.stringify({exported:true,rowCount:rows.length,writesToProduction:false}));
}
if(require.main===module)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
