/* CSFART catalog search V1. Enhanced Measurement owns view_search_results. */
(function(){
"use strict";
const PREVIEW=document.documentElement.dataset.preview==="true";
const CHOSEONG=["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
const WORDS=[["풍란","부귀란","풍난"],["루비근","분홍 뿌리","분홍뿌리","핑크근"],["복륜","테두리 무늬","테두리무늬"]];
const basic=(s)=>String(s||"").normalize("NFC").toLowerCase().replace(/[\s·()\[\]_,.]/g,"");
function initials(s){return [...String(s||"").normalize("NFC")].map(c=>{const n=c.charCodeAt(0)-0xAC00;return n>=0&&n<11172?CHOSEONG[Math.floor(n/588)]:c}).join("");}
const aliases=(term)=>{const out=[term];const normalized=basic(term);for(const g of WORDS){if(g.some(w=>basic(w)===normalized))out.push(...g);}return [...new Set(out)];};
function score(p,q){
 const words=[p.name,p.model,p.category,p.public_code,...p.traits,p.description];
 const text=basic(words.filter(Boolean).join(" "));

 const name=basic(p.name),nameinitial=initials(p.name);
 let points=0;
 for(const query of aliases(q)){
  const x=basic(query);
  if(!x)continue;
  if(name===x||basic(p.model)===x)points=Math.max(points,110);
  else if(name.startsWith(x))points=Math.max(points,90);
  else if(name.includes(x))points=Math.max(points,70);
  else if(basic(p.category)===x)points=Math.max(points,60);
  else if(text.includes(x))points=Math.max(points,37);
  if(nameinitial.includes(x))points=Math.max(points,75);
  /* Match initials against product names only, not full descriptions. */
 }
 return points;
}
function card(p){
 const a=document.createElement("a");a.className="search-hit";
 // Preview cards open the existing public product. Production cards remain in the local catalog.
 a.href=PREVIEW?"https://gomire-csfart.github.io/csfart-catalog/"+p.url:p.url;
 const im=document.createElement("img");im.loading="lazy";im.decoding="async";im.src=p.image;im.alt=p.name+" 대표 실물사진";
 const box=document.createElement("div");box.className="search-copy";
 const name=document.createElement("strong");name.textContent=p.name;
 const cat=document.createElement("span");cat.className="search-meta";cat.textContent=p.category+(p.price?" · "+p.price:"");
 const tr=document.createElement("p");tr.className="search-traits";tr.textContent=p.traits.slice(0,3).join(" · ");
 box.append(name,cat,tr);a.append(im,box);return a;
}
function piiguard(q){
 // Do not send an accidental e-mail, phone number or an order number to analytics.
 return q.length<=45&&!/@/.test(q)&&!/(?:\d[\s.-]?){7,}/.test(q);
}
async function results(){
 const host=document.getElementById("search-results");if(!host)return;
 const params=new URLSearchParams(location.search);
 const q=(params.get("q")||"").trim().slice(0,45);
 const input=document.querySelector(".catalog-search-form input");
 if(input)input.value=q;
 const info=document.getElementById("search-summary");
 if(!q){info.textContent="찾고 싶은 품종명, 초성 또는 분류를 입력해 보세요.";return;}
 try{
  const response=await fetch("products.json",{cache:"no-store"});
  if(!response.ok)throw Error("INDEX_FETCH_FAILED");
  const data=await response.json();
  if(!Array.isArray(data.products))throw Error("INDEX_FORMAT");
  const found=data.products.map(p=>({p,rank:score(p,q)})).filter(x=>x.rank>0).sort((a,b)=>b.rank-a.rank||a.p.name.localeCompare(b.p.name,"ko"));
  info.textContent="‘"+q+"’ 검색결과 "+found.length+"개";
  const fragment=document.createDocumentFragment();
  found.forEach(x=>fragment.appendChild(card(x.p)));
  host.replaceChildren(fragment);
  const empty=document.getElementById("search-no-results");
  if(empty)empty.hidden=found.length!==0;
  // Site search event view_search_results is collected by GA4 Enhanced Measurement
  // from ?q= when it is enabled. NEVER send a duplicate manual event.
  // For a zero-result query only, add the custom GA4 event, once per actual page view.
  if(!PREVIEW && found.length===0 && piiguard(q) && typeof window.gtag==="function"){
    window.gtag("event","search_no_result",{search_term:q,results_count:0});
  }
 }catch(e){
  info.textContent="검색 목록을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.";
 }
}
function boot(){
 const wrap=document.querySelector(".catalog-search-shell");
 const toggle=document.querySelector(".catalog-search-toggle");
 const form=document.querySelector(".catalog-search-form");
 if(toggle&&wrap){toggle.addEventListener("click",()=>{
  const isOpen=wrap.classList.toggle("is-open");
  toggle.setAttribute("aria-expanded",String(isOpen));
  if(isOpen){const inp=form&&form.querySelector("input");if(inp)inp.focus();}
 });}
 if(form)form.addEventListener("submit",ev=>{
  const i=form.querySelector("input");
  if(!i||!i.value.trim()){ev.preventDefault();if(i)i.focus();return;}
  if(!piiguard(i.value.trim())){ev.preventDefault();i.setCustomValidity("검색어에 이메일·전화번호·주문번호는 입력하지 마세요.");i.reportValidity();return;}
  i.setCustomValidity("");
 });
 results();
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",boot,{once:true});else boot();
window.CSFARTSearchTest={basic,initials,aliases,score};
})();
