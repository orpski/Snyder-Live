// SNYDER GOLF v4.10 League Money render fix
// Runs as a Babel script after league-section.js and before app.js.
// It wraps LeagueView so the Money table is corrected after React renders.
// It never writes to Supabase and never changes payments.paid.
(function(){
  'use strict';
  if(window.__snyderMoneyFixV410)return;
  window.__snyderMoneyFixV410=true;

  const OriginalLeagueView=window.LeagueView;
  if(!OriginalLeagueView){
    console.warn('Snyder money fix v4.10: LeagueView was not ready.');
    return;
  }

  function cleanText(el){
    return String((el&&el.textContent)||'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
  }
  function directCells(row){
    return Array.prototype.slice.call((row&&row.children)||[]).filter(el=>el&&el.nodeType===1);
  }
  function moneyValue(text){
    const s=String(text||'').replace(/,/g,'').replace(/−/g,'-');
    const m=s.match(/([+\-])?\s*£\s*([0-9]+(?:\.[0-9]+)?)/);
    if(!m)return 0;
    const n=parseFloat(m[2]);
    if(!isFinite(n))return 0;
    return m[1]==='-'?-n:n;
  }
  function moneyAbs(v){
    const n=Math.round(Math.abs(Number(v)||0)*100)/100;
    return Number.isInteger(n)?String(n):n.toFixed(2);
  }
  function balanceLabel(v){
    const n=Math.round((Number(v)||0)*100)/100;
    if(n>0)return '+£'+moneyAbs(n);
    if(n<0)return '-£'+moneyAbs(n);
    return '£0';
  }
  function isHeaderRow(row){
    const c=directCells(row);
    if(c.length!==6)return false;
    const t=c.map(x=>cleanText(x).toLowerCase());
    return t[0]==='player'&&t[1]==='entry'&&t[2]==='rounds'&&t[3]==='snake'&&(t[4]==='paid'||t[4]==='paid in')&&t[5]==='balance';
  }
  function isPlayerRow(row){
    const c=directCells(row);
    if(c.length!==6)return false;
    const player=cleanText(c[0]).toLowerCase();
    if(!player||player==='player'||player.indexOf('round')===-1)return false;
    return cleanText(c[1]).indexOf('£')!==-1 && cleanText(c[4]).indexOf('£')!==-1;
  }
  function setBalanceCell(cell,balance){
    if(!cell)return;
    let value=cell.children&&cell.children[0];
    let sub=cell.children&&cell.children[1];
    if(!value){value=document.createElement('div');cell.appendChild(value);}
    if(!sub){sub=document.createElement('div');cell.appendChild(sub);}
    // Remove any extra broken repair/old patch fragments inside the balance cell.
    Array.prototype.slice.call(cell.children).forEach((child,idx)=>{if(idx>1)child.remove();});
    const b=Math.round((Number(balance)||0)*100)/100;
    cell.style.textAlign='right';
    value.textContent=balanceLabel(b);
    value.style.fontSize='18px';
    value.style.color=b>0?'#60b8f0':b<0?'#f87171':'#d4af37';
    value.style.textAlign='right';
    value.style.lineHeight='1.15';
    sub.textContent=b>0?'in credit':b<0?'owes':'settled';
    sub.style.fontSize='9px';
    sub.style.color=b>0?'#4a8a5a':b<0?'#7a3a3a':'#8ea0ad';
    sub.style.textAlign='right';
    sub.style.lineHeight='1.15';
  }
  function patchMoneyTable(){
    try{
      const all=Array.prototype.slice.call(document.querySelectorAll('div'));
      const headers=all.filter(isHeaderRow);
      let rows=0;
      headers.forEach(header=>{
        const h=directCells(header);
        h[4].textContent='Paid';
        h[5].textContent='Balance';
        header.style.gridTemplateColumns='minmax(130px,1fr) 44px 52px 52px 52px 76px';
        const table=header.parentElement;
        if(!table)return;
        table.style.overflow='hidden';
        directCells(table).forEach(row=>{
          const c=directCells(row);
          if(c.length===6 && !cleanText(c[0]) && cleanText(row).toLowerCase().indexOf('owes')!==-1){
            row.style.display='none';
            return;
          }
          if(!isPlayerRow(row))return;
          const entry=moneyValue(cleanText(c[1]))||10;
          const rounds=moneyValue(cleanText(c[2]));
          const snake=moneyValue(cleanText(c[3]));
          const paid=moneyValue(cleanText(c[4]));
          const balance=Math.round((paid-entry-rounds-snake)*100)/100;
          row.style.display='grid';
          row.style.gridTemplateColumns='minmax(130px,1fr) 44px 52px 52px 52px 76px';
          row.style.alignItems='center';
          row.style.borderLeft=balance>0?'4px solid #60b8f0':balance<0?'4px solid #ef4444':'4px solid rgba(96,184,240,0.22)';
          setBalanceCell(c[5],balance);
          row.setAttribute('data-snyder-money-v410',`paid=${paid};entry=${entry};rounds=${rounds};snake=${snake};balance=${balance}`);
          rows+=1;
        });
      });
      if(rows)window.__snyderMoneyFixV410LastRun={rows,at:new Date().toISOString()};
    }catch(e){
      console.warn('Snyder money fix v4.10 skipped safely',e);
    }
  }
  function scheduleMoneyPatch(){
    patchMoneyTable();
    setTimeout(patchMoneyTable,0);
    setTimeout(patchMoneyTable,50);
    setTimeout(patchMoneyTable,250);
    setTimeout(patchMoneyTable,1000);
  }

  window.snyderFixLeagueMoneyBalances=patchMoneyTable;
  window.snyderReloadSweepstakeBalanceAdjustments=scheduleMoneyPatch;

  window.LeagueView=function SnyderLeagueViewMoneyFixed(props){
    React.useEffect(()=>{
      scheduleMoneyPatch();
      let ticks=0;
      const interval=setInterval(()=>{patchMoneyTable();ticks+=1;if(ticks>40)clearInterval(interval);},250);
      let observer=null;
      try{
        observer=new MutationObserver(()=>scheduleMoneyPatch());
        observer.observe(document.body,{childList:true,subtree:true,characterData:true});
      }catch(e){}
      return ()=>{clearInterval(interval);if(observer)observer.disconnect();};
    });
    return <OriginalLeagueView {...props}/>;
  };
})();
