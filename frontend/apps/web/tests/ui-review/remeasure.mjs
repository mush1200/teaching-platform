import { chromium } from "@playwright/test";
import fs from "node:fs";
const BASE="http://localhost:3110";
const pw = fs.readFileSync(new URL("../../../../../Backend/.ui-review-credentials.txt", import.meta.url),"utf8").match(/^password:\s*(\S+)/m)[1];
const acct={buyer:"buyer@ui-review.local",creator:"creator@ui-review.local",admin:"admin@ui-review.local"};
const tok={};
for(const [k,e] of Object.entries(acct)){const r=await fetch("http://localhost:3100/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:e,password:pw})});const d=await r.json();tok[k]={token:d.token,role:d.user.role};}
const ROUTES=[
 [null,"/materials"],[null,"/materials/uir_mat_baseline"],[null,"/materials/uir_mat_long_title_zh"],[null,"/terms"],[null,"/403"],
 ["buyer","/dashboard"],["buyer","/explore"],["buyer","/checkout"],["buyer","/me/orders"],["buyer","/me/materials"],["buyer","/downloads"],["buyer","/favorites"],["buyer","/cart"],["buyer","/my-reviews"],
 ["creator","/creator/materials"],["creator","/creator/sales"],["admin","/admin"],["admin","/admin/materials"],["admin","/admin/orders"],
];
const VPS=[{n:"1440",w:1440,h:900},{n:"768",w:768,h:1024},{n:"390",w:390,h:844}];
const M=()=>{const side=[...document.querySelectorAll('aside')].find(a=>{const b=a.getBoundingClientRect();return b.width>0&&b.height>0&&b.left<=1;});
const main=document.querySelector('main');const h1=document.querySelector('h1');
const rr=el=>{if(!el)return null;const b=el.getBoundingClientRect();return{l:Math.round(b.left),r:Math.round(b.right)};};
const chain=[];if(h1&&main){let n=h1;while(n){const pl=parseFloat(getComputedStyle(n).paddingLeft)||0;if(pl>0)chain.push({tag:n.tagName.toLowerCase(),cls:String(n.className||'').slice(0,40),pl});if(n===main)break;n=n.parentElement;}}
const sideR=side?rr(side).r:0;
const first=main?[...main.querySelectorAll('section,article,div')].find(el=>{const b=el.getBoundingClientRect();const cs=getComputedStyle(el);return b.width>160&&b.height>60&&b.top<1000&&(cs.borderLeftWidth!=='0px'||cs.backgroundColor!=='rgba(0, 0, 0, 0)'||cs.boxShadow!=='none');}):null;
return{h1Text:h1?h1.textContent.trim().slice(0,30):null,hasH1:!!h1,sidebarR:sideR,mainL:main?rr(main).l:null,h1L:h1?rr(h1).l:null,
gapToH1:h1?rr(h1).l-sideR:null,gapToBlock:first?rr(first).l-sideR:null,
layers:chain.length,px:chain.reduce((s,x)=>s+x.pl,0),chain,ovf:document.documentElement.scrollWidth-document.documentElement.clientWidth};};
const b=await chromium.launch();const out=[];
for(const vp of VPS){const ctx=await b.newContext({viewport:{width:vp.w,height:vp.h}});
 for(const [role,path] of ROUTES){const p=await ctx.newPage();
  try{ if(role){const{token,role:rl}=tok[role];await ctx.addCookies([{name:"tp_token",value:token,url:BASE},{name:"tp_role",value:rl,url:BASE}]);
    await p.addInitScript(({t,r})=>{localStorage.setItem("tp_token",t);localStorage.setItem("tp_role",r);},{t:token,r:rl});}
   await p.goto(BASE+path,{waitUntil:"domcontentloaded",timeout:90000});
   // 等到真的渲染出 h1，最多 20 秒；沒有 h1 的頁面照樣往下量，但會標記
   try{ await p.waitForSelector("h1",{timeout:20000}); }catch{}
   await p.waitForLoadState("networkidle",{timeout:20000}).catch(()=>{});
   await p.waitForTimeout(600);
   out.push({vp:vp.n,role:role||"public",path,...await p.evaluate(M)});process.stdout.write(".");
  }catch(e){out.push({vp:vp.n,role:role||"public",path,err:String(e.message).slice(0,80)});process.stdout.write("x");}
  finally{await p.close();}}
 await ctx.close();console.log(" "+vp.n);}
await b.close();
fs.writeFileSync("tests/ui-review/out/remeasure.json",JSON.stringify(out,null,2));
console.log("done",out.length);
