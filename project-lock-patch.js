  <!-- Project Lock UI Injection (v11) -->
<!-- 修复: capture-phase keydown 替代 rAF+re-dispatch 消除双发bug -->
<!-- 修复: 发送按钮选择器改为 .chat-send-btn (Shadow DOM 穿透) -->
<!-- 修复: WS 劫持移至顶层，mkEl 前即生效 -->
<!-- 修复: 清理 v8/v10 重复注入 -->
<script>
(function(){'use strict';
var SK;
var GRACE_MS = 3500;
var graceActive = true;
var _lockEl=null,_lockInp=null,_lockIcon=null;

setTimeout(function(){ graceActive = false; }, GRACE_MS);

function agentKey(){
  var s=location.search.match(/session=([^&]+)/)||location.hash.match(/session=([^&]+)/);
  if(s){
    try{
      var d=decodeURIComponent(s[1]);
      return 'openclaw_project_lock_'+d.replace(/[^a-zA-Z0-9_.:-]/g,'_');
    }catch(e){}
  }
  var m=location.search.match(/agent[=:]([^&]+)/)||location.hash.match(/agent[=:]([^&]+)/);
  var p=location.pathname.match(/agent\/([^/]+)/);
  var name=(m&&m[1])||(p&&p[1])||'main';
  return 'openclaw_project_lock_'+name.replace(/[^a-zA-Z0-9_-]/g,'_');
}
function resetSK(){ SK = null; }
function gp(){if(!SK)SK=agentKey();try{return localStorage.getItem(SK)||''}catch(e){return ''}}
function sp(p){if(!SK)SK=agentKey();try{localStorage.setItem(SK,p)}catch(e){}}
var TP='\n[Project: ',TS=']';

// ===== 路径扫描（WS + DOM 共用） =====
function scanForProjectPath(text){
  if(graceActive) return false;
  if(!text||typeof text!=='string') return false;
  var mm=text.match(/\[Project:\s*([^\]]+)\]/);
  if(mm&&mm[1]){
    var pp=mm[1].trim();
    if(pp.length>5&&pp!==gp()){
      if(_lockInp){
        _lockInp.value=pp;
        sp(pp);
        ub();
      }
      console.log('[ProjectLock] Detected:', pp);
      return true;
    }
  }
  return false;
}

// ===== WS 劫持（顶层执行，不依赖 mkEl） =====
(function(){
  var _origWS=window.WebSocket;
  if(!_origWS) return;
  if(window.WebSocket._plPatched) return;
  function wrapWS(ws){
    var _origAdd=ws.addEventListener.bind(ws);
    ws.addEventListener=function(type,listener,opts){
      if(type==='message'){
        var wrapped=function(event){
          var data=typeof event.data==='string'?event.data:(event.data&&event.data.toString?event.data.toString():'');
          scanForProjectPath(data);
          return listener.call(this,event);
        };
        return _origAdd.call(ws,type,wrapped,opts);
      }
      return _origAdd.call(ws,type,listener,opts);
    };
    var _msgDesc=Object.getOwnPropertyDescriptor(_origWS.prototype,'onmessage');
    if(_msgDesc){
      Object.defineProperty(ws,'onmessage',{
        configurable:true,
        enumerable:true,
        get:function(){return ws._plOrigOnMsg||_msgDesc.get.call(ws)},
        set:function(fn){
          if(typeof fn==='function'){
            var wrapped=function(event){
              var data=typeof event.data==='string'?event.data:(event.data&&event.data.toString?event.data.toString():'');
              scanForProjectPath(data);
              return fn.call(this,event);
            };
            ws._plOrigOnMsg=wrapped;
            _msgDesc.set.call(ws,wrapped);
          }else{
            ws._plOrigOnMsg=null;
            _msgDesc.set.call(ws,fn);
          }
        }
      });
    }
    return ws;
  }
  window.WebSocket=function(url,protocols){
    var ws=protocols?new _origWS(url,protocols):new _origWS(url);
    return wrapWS(ws);
  };
  window.WebSocket.prototype=_origWS.prototype;
  window.WebSocket.CONNECTING=_origWS.CONNECTING;
  window.WebSocket.OPEN=_origWS.OPEN;
  window.WebSocket.CLOSING=_origWS.CLOSING;
  window.WebSocket.CLOSED=_origWS.CLOSED;
  window.WebSocket._plPatched=true;
})();

// ===== Monkey-patch history =====
var _origPushState = history.pushState;
var _origReplaceState = history.replaceState;
var _lastHref = location.href;

function onUrlChange(){
  if(location.href === _lastHref) return;
  _lastHref = location.href;
  resetSK();
  _plInserted = false;
  _lockEl = null; _lockInp = null; _lockIcon = null;
  setTimeout(function(){ tryInsert(); }, 300);
}
history.pushState = function(){ var ret=_origPushState.apply(this,arguments); onUrlChange(); return ret; };
history.replaceState = function(){ var ret=_origReplaceState.apply(this,arguments); onUrlChange(); return ret; };
window.addEventListener('popstate', function(){ _lastHref=location.href; resetSK(); refreshUI(); });

function refreshUI(){
  if(!_lockInp) return;
  var val = gp();
  _lockInp.value = val;
  if(_lockIcon){
    _lockIcon.textContent=val?'\u{1F512}':'\u{1F4CC}';
    _lockIcon.title=val?'\u{1F512} '+val+' — 点击解除锁定':'点击自动检测项目路径';
  }
}
function ub(){
  if(!_lockInp) return;
  if(_lockIcon){
    _lockIcon.textContent=_lockInp.value?'\u{1F512}':'\u{1F4CC}';
    _lockIcon.title=_lockInp.value?'\u{1F512} '+_lockInp.value+' — 点击解除锁定':'点击自动检测项目路径';
  }
}

// ===== 核心修复：capture-phase keydown 在 WebUI 读取前修改 value =====
// 替代 v9 的 requestAnimationFrame + re-dispatch 方案，消除双发bug
function injectTag(ta){
  var pp=gp();
  if(!pp||!ta.value) return;
  if(ta.value==='[detect-project]') return;
  var tag=TP+pp+TS;
  if(ta.value.indexOf('[Project: ')>=0){
    ta.value=ta.value.replace(/\[Project: [^\]]*\]/,tag);
  }else{
    ta.value=ta.value+tag;
  }
}

// capture-phase: 在 Lit 事件处理前修改 textarea.value
document.addEventListener('keydown', function(e){
  var ta=e.target;
  if(ta.tagName!=='TEXTAREA') return;
  var isSend=e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey;
  var isCtrlSend=e.key==='Enter'&&(e.ctrlKey||e.metaKey);
  if(isSend||isCtrlSend){
    injectTag(ta);
  }
}, true); // capture phase — 在 Lit 的 bubble phase handler 之前执行

// ===== 发送按钮 Shadow DOM 穿透 =====
function getShadowSendBtn(){
  var app=document.querySelector('openclaw-app');
  if(!app||!app.shadowRoot) return null;
  return app.shadowRoot.querySelector('.chat-send-btn');
}

function triggerSend(){
  var sb=getShadowSendBtn();
  if(sb&&!sb.disabled){ sb.click(); return true; }
  // fallback: 模拟 Enter
  var app=document.querySelector('openclaw-app');
  if(app&&app.shadowRoot){
    var ta=app.shadowRoot.querySelector('textarea');
    if(ta){
      ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      return true;
    }
  }
  return false;
}

// ===== 📌 按钮 =====
function mkEl(){
  var w=document.createElement('div');
  w.id='openclaw-project-lock';
  w.style.cssText='display:inline-flex;align-items:center;gap:4px;margin-left:8px;font-size:11px;opacity:0.6;transition:opacity 0.2s;flex-shrink:0;vertical-align:middle;';
  w.onmouseenter=function(){w.style.opacity='1'};
  w.onmouseleave=function(){w.style.opacity='0.6'};

  var lb=document.createElement('span');
  lb.textContent=gp()?'\u{1F512}':'\u{1F4CC}';
  lb.title=gp()?'\u{1F512} '+gp()+' — 点击解除锁定':'点击自动检测项目路径';
  lb.style.cssText='font-size:12px;cursor:pointer;flex-shrink:0;';
  _lockIcon=lb; // 必须在 ub() 前赋值

  lb.onclick=function(){
    if(gp()){inp.value='';sp('');ub();return}
    // 发送 [detect-project] 指令 — 使用 Shadow DOM 穿透
    var app=document.querySelector('openclaw-app');
    if(!app||!app.shadowRoot) return;
    var ta=app.shadowRoot.querySelector('textarea');
    if(!ta) return;
    var ns=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    ns.call(ta,'[detect-project]');
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    ta.focus();
    setTimeout(function(){ triggerSend(); }, 150);
  };

  var inp=document.createElement('input');
  inp.type='text';
  inp.placeholder='\u9879\u76EE\u8DEF\u5F84';
  inp.value=gp();
  inp.style.cssText='width:140px;min-width:60px;background:transparent;border:1px solid var(--oc-border,rgba(128,128,128,0.2));border-radius:4px;padding:2px 6px;color:inherit;font-size:11px;outline:none;flex-shrink:1;';
  inp.title='\u8F93\u5165\u9879\u76EE\u8DEF\u5F84\u540E\u6309 Enter \u9501\u5B9A\uFF0C\u6E05\u7A7A\u540E\u6309 Enter \u89E3\u9664';

  ub();
  inp.onkeydown=function(e){
    if(e.key==='Enter'){e.preventDefault();e.stopPropagation();sp(inp.value);ub();inp.blur()}
  };
  inp.onchange=function(){sp(inp.value);ub()};

  _lockEl=w; _lockInp=inp;

  // ===== Shadow DOM 穿透 + DOM MutationObserver =====
  function scanElements(root){
    var bubbles=root.querySelectorAll('.chat-bubble:not(.chat-reading-indicator)');
    var assists=root.querySelectorAll('[class*="assistant"]');
    var targets=[];
    for(var i=0;i<bubbles.length;i++) targets.push(bubbles[i]);
    for(var i=0;i<assists.length;i++) targets.push(assists[i]);
    for(var t=0;t<targets.length;t++){
      var el=targets[t];
      if(el.dataset.plDone) continue;
      var html=el.innerHTML||'';
      var raw=el.textContent||'';
      if(scanForProjectPath(html)||scanForProjectPath(raw)){
        el.dataset.plDone='1';
        return true;
      }
    }
    return false;
  }

  var scanTimer=null;
  var shadowObs=null;

  function createShadowObserver(){
    if(shadowObs) return;
    var app=document.querySelector('openclaw-app');
    if(!app||!app.shadowRoot) return false;
    console.log('[ProjectLock] Shadow DOM observer attached');
    shadowObs=new MutationObserver(function(){
      if(graceActive) return;
      if(scanTimer) return;
      scanTimer=setTimeout(function(){
        scanTimer=null;
        if(scanElements(app.shadowRoot)) return;
        var nested=app.shadowRoot.querySelectorAll('*');
        for(var i=0;i<nested.length;i++){
          if(nested[i].shadowRoot&&scanElements(nested[i].shadowRoot)) return;
        }
      },500);
    });
    shadowObs.observe(app.shadowRoot,{childList:true,subtree:true,characterData:true});
    return true;
  }

  createShadowObserver();
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){ createShadowObserver(); },500);
  });

  var replyObs=new MutationObserver(function(){
    if(graceActive) return;
    if(scanTimer) return;
    scanTimer=setTimeout(function(){
      scanTimer=null;
      var app=document.querySelector('openclaw-app');
      if(app&&app.shadowRoot){
        if(scanElements(app.shadowRoot)) return;
      }
    },500);
  });
  replyObs.observe(document.body,{childList:true,subtree:true,characterData:true});

  w.appendChild(lb);
  w.appendChild(inp);
  return w;
}

// ===== 工具栏插入 =====
var _plInserted=false;
function tryInsert(){
  if(_lockEl && document.contains(_lockEl)) return true;
  _plInserted = false;
  _lockEl = null; _lockInp = null; _lockIcon = null;
  var app=document.querySelector('openclaw-app');
  if(!app||!app.shadowRoot) return false;
  var tb=app.shadowRoot.querySelector('.agent-chat__toolbar');
  if(!tb){
    var nested=app.shadowRoot.querySelectorAll('*');
    for(var i=0;i<nested.length;i++){
      if(nested[i].shadowRoot){
        tb=nested[i].shadowRoot.querySelector('.agent-chat__toolbar');
        if(tb) break;
      }
    }
  }
  if(!tb) return false;
  var btns=tb.querySelectorAll('.agent-chat__input-btn');
  if(btns.length){btns[btns.length-1].after(mkEl())}
  else{tb.appendChild(mkEl())}
  _plInserted=true;
  return true;
}

function waitToolbar(){
  if(tryInsert()) return;
  var ob=new MutationObserver(function(){
    if(tryInsert()){ob.disconnect();return}
    if(_plInserted&&!document.getElementById('openclaw-project-lock')){
      _plInserted=false;
    }
  });
  ob.observe(document.body,{childList:true,subtree:true});
  setInterval(function(){
    if(_lockEl && !document.contains(_lockEl)){
      console.log('[ProjectLock] UI detached, re-inserting');
      _plInserted = false;
      _lockEl = null; _lockInp = null; _lockIcon = null;
      tryInsert();
      return;
    }
    if(!_lockEl){ tryInsert(); }
  },2000);
}

function waitApp(){
  var a=document.querySelector('openclaw-app,#root,#app');
  if(a&&a.children.length>0){waitToolbar();return}
  var ob=new MutationObserver(function(){
    var el=document.querySelector('openclaw-app,#root,#app');
    if(el&&el.children.length>0){ob.disconnect();waitToolbar()}
  });
  ob.observe(document.documentElement,{childList:true,subtree:true});
  setTimeout(function(){ob.disconnect()},15000);
}

if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',waitApp);
}else{
  waitApp();
}
})();
</script>

<!-- End Project Lock UI Injection -->
