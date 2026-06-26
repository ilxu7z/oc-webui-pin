    <!-- Project Lock UI Injection (v11.4) -->
<!-- 改为会话维度: localStorage key 基于当前 sessionKey，监听会话切换自动更新 -->
<script>
(function(){'use strict';
var SK;
var GRACE_MS = 3500;
var graceActive = true;
var _lockEl=null,_lockInp=null,_lockIcon=null;

setTimeout(function(){ graceActive = false; }, GRACE_MS);

// ===== 会话维度 localStorage key =====
// 优先从 DOM 获取当前选中的 sessionKey（支持会话切换后自动更新）
// 回退到 URL session 参数 → agent 参数 → 'main'
function getCurrentSessionKey(){
  // 1. 从 session picker 的选中项获取（最准确，会话切换后立即生效）
  var sel=document.querySelector('[data-chat-session-picker-option][aria-selected="true"]');
  if(sel){
    var key=sel.getAttribute('data-session-key');
    if(key) return 'openclaw_project_lock_'+key.replace(/[^a-zA-Z0-9_.:-]/g,'_');
  }
  // 2. 从 URL session 参数获取
  var s=location.search.match(/session=([^&]+)/)||location.hash.match(/session=([^&]+)/);
  if(s){
    try{
      var d=decodeURIComponent(s[1]);
      return 'openclaw_project_lock_'+d.replace(/[^a-zA-Z0-9_.:-]/g,'_');
    }catch(e){}
  }
  // 3. 回退到 agent 维度
  var m=location.search.match(/agent[=:]([^&]+)/)||location.hash.match(/agent[=:]([^&]+)/);
  var p=location.pathname.match(/agent\/([^/]+)/);
  var name=(m&&m[1])||(p&&p[1])||'main';
  return 'openclaw_project_lock_'+name.replace(/[^a-zA-Z0-9_-]/g,'_');
}
function resetSK(){ SK = null; }
function gp(){if(!SK)SK=getCurrentSessionKey();try{return localStorage.getItem(SK)||''}catch(e){return ''}}
function sp(p){if(!SK)SK=getCurrentSessionKey();try{localStorage.setItem(SK,p)}catch(e){}}
var TP='\n[Project: ',TS=']';

// ===== 路径扫描 =====
function isValidPath(p){return /^[\/~]|[A-Za-z]:[\\\/]/.test(p)}
function scanForProjectPath(text){
  if(graceActive) return false;
  if(!text||typeof text!=='string') return false;
  var mm=text.match(/\[Project:\s*([^\]]+)\]/);
  if(mm&&mm[1]){
    var pp=mm[1].trim();
    if(pp.length>5&&isValidPath(pp)&&pp!==gp()){
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

// ===== WS 劫持 =====
(function(){
  var _origWS=window.WebSocket;
  if(!_origWS||window.WebSocket._plPatched) return;
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
        configurable:true,enumerable:true,
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

// ===== history monkey-patch =====
var _origPushState=history.pushState,_origReplaceState=history.replaceState;
var _lastHref=location.href;
function onUrlChange(){
  if(location.href===_lastHref) return;
  _lastHref=location.href; resetSK();
  _lockEl=null;_lockInp=null;_lockIcon=null;
  setTimeout(function(){tryInsert();},300);
}
history.pushState=function(){var r=_origPushState.apply(this,arguments);onUrlChange();return r;};
history.replaceState=function(){var r=_origReplaceState.apply(this,arguments);onUrlChange();return r;};
window.addEventListener('popstate',function(){_lastHref=location.href;resetSK();refreshUI();});

function refreshUI(){
  if(!_lockInp) return;
  var val=gp();
  _lockInp.value=val;
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

// ===== capture-phase keydown =====
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
document.addEventListener('keydown',function(e){
  var ta=e.target;
  if(ta.tagName!=='TEXTAREA') return;
  var isSend=e.key==='Enter'&&!e.shiftKey&&!e.ctrlKey&&!e.metaKey;
  var isCtrlSend=e.key==='Enter'&&(e.ctrlKey||e.metaKey);
  if(isSend||isCtrlSend) injectTag(ta);
},true);

// ===== 发送按钮 Light DOM 穿透 =====
function getLightSendBtn(){
  var app=document.querySelector('openclaw-app');
  if(!app) return null;
  var root=app.shadowRoot||app;
  return root.querySelector('.chat-send-btn');
}
function triggerSend(){
  var sb=getLightSendBtn();
  if(sb&&!sb.disabled){sb.click();return true;}
  var app=document.querySelector('openclaw-app');
  if(app){
    var root=app.shadowRoot||app;
    var ta=root.querySelector('textarea');
    if(ta){ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));return true;}
  }
  return false;
}

// ===== 监听会话切换 =====
// 当用户通过 picker 切换会话时，自动更新 localStorage key 和 UI
function watchSessionSwitch(root){
  var obs=new MutationObserver(function(){
    var newKey=getCurrentSessionKey();
    if(newKey!==SK){
      console.log('[ProjectLock] Session switched, new key:', newKey);
      SK=newKey;
      refreshUI();
    }
  });
  obs.observe(root,{childList:true,subtree:true,attributes:true,attributeFilter:['aria-selected']});
}

// ===== 📌 UI =====
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
  _lockIcon=lb;

  lb.onclick=function(){
    if(gp()){inp.value='';sp('');ub();return}
    var app=document.querySelector('openclaw-app');
    if(!app) return;
    var root=app.shadowRoot||app;
    var ta=root.querySelector('textarea');
    if(!ta) return;
    var ns=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
    ns.call(ta,'[detect-project]');
    ta.dispatchEvent(new Event('input',{bubbles:true}));
    ta.focus();
    setTimeout(function(){triggerSend();},150);
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

  _lockEl=w;_lockInp=inp;

  // 监听响应中的 [Project: ...] 标记
  var scanTimer=null;
  function createResponseObserver(){
    var app=document.querySelector('openclaw-app');
    if(!app) return false;
    var root=app.shadowRoot||app;
    console.log('[ProjectLock] response observer attached');
    var obs=new MutationObserver(function(){
      if(graceActive||scanTimer) return;
      scanTimer=setTimeout(function(){
        scanTimer=null;
        var bubbles=root.querySelectorAll('.chat-bubble:not(.chat-reading-indicator)');
        for(var i=0;i<bubbles.length;i++){
          var el=bubbles[i];
          if(el.dataset.plDone) continue;
          var html=el.innerHTML||'',raw=el.textContent||'';
          if(scanForProjectPath(html)||scanForProjectPath(raw)){el.dataset.plDone='1';return;}
        }
      },500);
    });
    obs.observe(root,{childList:true,subtree:true,characterData:true});
    return true;
  }
  createResponseObserver();
  document.addEventListener('DOMContentLoaded',function(){setTimeout(createResponseObserver,500);});

  // 监听会话切换
  (function(){
    var app=document.querySelector('openclaw-app');
    if(app){
      var root=app.shadowRoot||app;
      watchSessionSwitch(root);
    }
  })();

  w.appendChild(lb);
  w.appendChild(inp);
  return w;
}

// ===== 简化插入逻辑：直接轮询 =====
function tryInsert(){
  if(_lockEl&&document.contains(_lockEl)) return true;
  _lockEl=null;_lockInp=null;_lockIcon=null;
  var app=document.querySelector('openclaw-app');
  if(!app){
    console.log('[ProjectLock] tryInsert: openclaw-app NOT FOUND');
    return false;
  }
  var root=app.shadowRoot||app;
  var tb=root.querySelector('.agent-chat__toolbar');
  if(!tb){
    console.log('[ProjectLock] tryInsert: toolbar not found');
    return false;
  }
  var btns=tb.querySelectorAll('.agent-chat__input-btn');
  if(btns.length){btns[btns.length-1].after(mkEl())}
  else{tb.appendChild(mkEl())}
  console.log('[ProjectLock] UI inserted successfully');
  return true;
}

// 启动轮询
var _pollCount=0;
var _pollTimer=setInterval(function(){
  _pollCount++;
  if(tryInsert()){
    clearInterval(_pollTimer);
    console.log('[ProjectLock] inserted after '+_pollCount+' polls');
  }else if(_pollCount>=40){
    clearInterval(_pollTimer);
    console.log('[ProjectLock] poll timeout (20s)');
  }
},500);

var _bodyObs=new MutationObserver(function(){
  if(!_lockEl) tryInsert();
});
_bodyObs.observe(document.body,{childList:true,subtree:true});
setTimeout(function(){_bodyObs.disconnect();},20000);

setInterval(function(){
  if(_lockEl&&!document.contains(_lockEl)){
    console.log('[ProjectLock] UI detached, re-inserting');
    _lockEl=null;_lockInp=null;_lockIcon=null;
    tryInsert();
  }
},2000);
})();
</script>
<!-- End Project Lock UI Injection -->
