      <!-- Project Lock UI Injection (v12) -->
<!-- Agent为Source of Truth，前端通过协议命令双向同步 -->
<script>
(function(){'use strict';
var SK;
var GRACE_MS = 3500;
var graceActive = true;
var _lockEl=null,_lockInp=null,_lockIcon=null,_lockStatus=null;
var _pendingLockPath=null; // 等待 Agent 确认的路径

setTimeout(function(){ graceActive = false; }, GRACE_MS);

// ===== 会话维度 localStorage key =====
function getCurrentSessionKey(){
  var sel=document.querySelector('[data-chat-session-picker-option][aria-selected="true"]');
  if(sel){
    var key=sel.getAttribute('data-session-key');
    if(key) return 'openclaw_project_lock_'+key.replace(/[^a-zA-Z0-9_.:-]/g,'_');
  }
  var s=location.search.match(/session=([^&]+)/)||location.hash.match(/session=([^&]+)/);
  if(s){
    try{var d=decodeURIComponent(s[1]);return 'openclaw_project_lock_'+d.replace(/[^a-zA-Z0-9_.:-]/g,'_');}catch(e){}
  }
  var m=location.search.match(/agent[=:]([^&]+)/)||location.hash.match(/agent[=:]([^&]+)/);
  var p=location.pathname.match(/agent\/([^/]+)/);
  var name=(m&&m[1])||(p&&p[1])||'main';
  return 'openclaw_project_lock_'+name.replace(/[^a-zA-Z0-9_-]/g,'_');
}
function resetSK(){ SK = null; }
function gp(){if(!SK)SK=getCurrentSessionKey();try{return localStorage.getItem(SK)||''}catch(e){return ''}}
function sp(p){if(!SK)SK=getCurrentSessionKey();try{localStorage.setItem(SK,p)}catch(e){}}
function rp(){if(!SK)SK=getCurrentSessionKey();try{localStorage.removeItem(SK)}catch(e){}}

// ===== 路径校验 =====
function isValidPath(p){return /^[\/~]|[A-Za-z]:[\\\/]/.test(p)}

// ===== 发送命令到 Agent =====
function sendToAgent(text){
  var app=document.querySelector('openclaw-app');
  if(!app) return false;
  var root=app.shadowRoot||app;
  var ta=root.querySelector('textarea');
  if(!ta) return false;
  var ns=Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set;
  ns.call(ta,text);
  ta.dispatchEvent(new Event('input',{bubbles:true}));
  ta.focus();
  // 触发发送
  setTimeout(function(){
    var sb=root.querySelector('.chat-send-btn');
    if(sb&&!sb.disabled){sb.click();return;}
    ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  },100);
  return true;
}

// ===== 扫描协议标记 =====
function scanForMarkers(text){
  if(graceActive) return false;
  if(!text||typeof text!=='string') return false;
  var changed=false;

  // [LockConfirmed: /path] — Agent 确认锁定
  var lc=text.match(/\[LockConfirmed:\s*([^\]]+)\]/);
  if(lc&&lc[1]){
    var pp=lc[1].trim();
    if(isValidPath(pp)){
      sp(pp);
      _pendingLockPath=null;
      changed=true;
      console.log('[ProjectLock] Lock confirmed:', pp);
    }
  }

  // [LockCleared] — Agent 确认解锁
  if(text.indexOf('[LockCleared]')>=0){
    rp();
    _pendingLockPath=null;
    changed=true;
    console.log('[ProjectLock] Lock cleared');
  }

  // [Project: /path] — Agent 返回检测到的路径
  var pm=text.match(/\[Project:\s*([^\]]+)\]/);
  if(pm&&pm[1]){
    var pp2=pm[1].trim();
    if(pp2.length>5&&isValidPath(pp2)&&pp2!==gp()){
      sp(pp2);
      changed=true;
      console.log('[ProjectLock] Detected:', pp2);
    }
  }

  if(changed) updateUI();
  return changed;
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
          scanForMarkers(data);
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
              scanForMarkers(data);
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
  _lockEl=null;_lockInp=null;_lockIcon=null;_lockStatus=null;
  setTimeout(function(){tryInsert();},300);
}
history.pushState=function(){var r=_origPushState.apply(this,arguments);onUrlChange();return r;};
history.replaceState=function(){var r=_origReplaceState.apply(this,arguments);onUrlChange();return r;};
window.addEventListener('popstate',function(){_lastHref=location.href;resetSK();refreshUI();});

// ===== UI 更新 =====
function getStatus(){
  if(_pendingLockPath) return 'pending';  // 🔄 等待确认
  var val=gp();
  if(val) return 'locked';                // 🔒 已锁定
  return 'unlocked';                      // 📌 未锁定
}
function getStatusIcon(status){
  switch(status){
    case 'pending': return '\u{1F504}';   // 🔄
    case 'locked': return '\u{1F512}';    // 🔒
    default: return '\u{1F4CC}';          // 📌
  }
}
function getStatusTitle(status){
  var val=gp();
  switch(status){
    case 'pending': return '\u{1F504} \u7B49\u5F85 Agent \u786E\u8BA4... ('+_pendingLockPath+')';
    case 'locked': return '\u{1F512} '+val+' \u2014 \u70B9\u51FB\u89E3\u9664\u9501\u5B9A';
    default: return '\u70B9\u51FB\u81EA\u52A8\u68C0\u6D4B\u9879\u76EE\u8DEF\u5F84';
  }
}
function getStatusColor(status){
  switch(status){
    case 'pending': return 'var(--oc-warning,#f59e0b)';
    case 'locked': return 'var(--oc-success,#22c55e)';
    default: return '';
  }
}

function updateUI(){
  if(!_lockInp||!_lockIcon) return;
  var status=getStatus();
  var val=gp();
  _lockInp.value=_pendingLockPath||val;
  _lockIcon.textContent=getStatusIcon(status);
  _lockIcon.title=getStatusTitle(status);
  _lockIcon.style.color=getStatusColor(status);
  if(_lockStatus) _lockStatus.textContent=status==='pending'?'\u786E\u8BA4\u4E2D...':(status==='locked'?'\u5DF2\u9501\u5B9A':'\u672A\u9501\u5B9A');
}
function refreshUI(){updateUI();}

// ===== 捕获响应中的标记（MutationObserver） =====
function createResponseObserver(root){
  var scanTimer=null;
  var obs=new MutationObserver(function(){
    if(graceActive||scanTimer) return;
    scanTimer=setTimeout(function(){
      scanTimer=null;
      var bubbles=root.querySelectorAll('.chat-bubble:not(.chat-reading-indicator)');
      for(var i=0;i<bubbles.length;i++){
        var el=bubbles[i];
        if(el.dataset.plDone) continue;
        var html=el.innerHTML||'',raw=el.textContent||'';
        if(scanForMarkers(html)||scanForMarkers(raw)){el.dataset.plDone='1';return;}
      }
    },500);
  });
  obs.observe(root,{childList:true,subtree:true,characterData:true});
}

// ===== 监听会话切换 =====
function watchSessionSwitch(root){
  var obs=new MutationObserver(function(){
    var newKey=getCurrentSessionKey();
    if(newKey!==SK){
      console.log('[ProjectLock] Session switched, new key:', newKey);
      SK=newKey;
      _pendingLockPath=null;
      updateUI();
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
  var status=getStatus();
  lb.textContent=getStatusIcon(status);
  lb.title=getStatusTitle(status);
  lb.style.cssText='font-size:12px;cursor:pointer;flex-shrink:0;';
  lb.style.color=getStatusColor(status);
  _lockIcon=lb;

  lb.onclick=function(){
    var status=getStatus();
    if(status==='pending') return; // 等待中不可操作
    if(status==='locked'){
      // 解锁：发送 [unlock] 命令
      _pendingLockPath='__unlocking__';
      updateUI();
      sendToAgent('[unlock]');
      return;
    }
    // 未锁定：发送 [detect-project]
    sendToAgent('[detect-project]');
  };

  var inp=document.createElement('input');
  inp.type='text';
  inp.placeholder='\u9879\u76EE\u8DEF\u5F84';
  inp.value=gp();
  inp.style.cssText='width:140px;min-width:60px;background:transparent;border:1px solid var(--oc-border,rgba(128,128,128,0.2));border-radius:4px;padding:2px 6px;color:inherit;font-size:11px;outline:none;flex-shrink:1;';
  inp.title='\u8F93\u5165\u9879\u76EE\u8DEF\u5F84\u540E\u6309 Enter \u53D1\u9001\u9501\u5B9A\u547D\u4EE4\uFF0C\u7B49\u5F85 Agent \u786E\u8BA4';

  inp.onkeydown=function(e){
    if(e.key==='Enter'){
      e.preventDefault();e.stopPropagation();
      var path=inp.value.trim();
      if(!path){
        // 空路径 = 解锁
        _pendingLockPath='__unlocking__';
        updateUI();
        sendToAgent('[unlock]');
      }else if(isValidPath(path)){
        // 发送锁定命令
        _pendingLockPath=path;
        updateUI();
        sendToAgent('[lock: '+path+']');
      }else{
        // 无效路径，直接存 localStorage 作为本地缓存
        sp(path);
        updateUI();
      }
      inp.blur();
    }
  };
  inp.onchange=function(){/* 不再直接存，必须通过 Agent 确认 */};

  _lockEl=w;_lockInp=inp;

  // 状态标签
  var st=document.createElement('span');
  st.style.cssText='font-size:10px;color:var(--oc-muted,#888);flex-shrink:0;';
  _lockStatus=st;
  updateUI();

  // 监听响应标记
  createResponseObserver(document.querySelector('openclaw-app')?.shadowRoot||document.querySelector('openclaw-app')||document.body);
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){
      var app=document.querySelector('openclaw-app');
      if(app) createResponseObserver(app.shadowRoot||app);
    },500);
  });

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
  w.appendChild(st);
  return w;
}

// ===== 插入 UI =====
function tryInsert(){
  if(_lockEl&&document.contains(_lockEl)) return true;
  _lockEl=null;_lockInp=null;_lockIcon=null;_lockStatus=null;
  var app=document.querySelector('openclaw-app');
  if(!app) return false;
  var root=app.shadowRoot||app;
  var tb=root.querySelector('.agent-chat__toolbar');
  if(!tb) return false;
  var btns=tb.querySelectorAll('.agent-chat__input-btn');
  if(btns.length){btns[btns.length-1].after(mkEl())}
  else{tb.appendChild(mkEl())}
  console.log('[ProjectLock] UI inserted');
  return true;
}

var _pollCount=0;
var _pollTimer=setInterval(function(){
  _pollCount++;
  if(tryInsert()){clearInterval(_pollTimer);}
  else if(_pollCount>=40){clearInterval(_pollTimer);}
},500);

var _bodyObs=new MutationObserver(function(){
  if(!_lockEl) tryInsert();
});
_bodyObs.observe(document.body,{childList:true,subtree:true});
setTimeout(function(){_bodyObs.disconnect();},20000);

setInterval(function(){
  if(_lockEl&&!document.contains(_lockEl)){
    _lockEl=null;_lockInp=null;_lockIcon=null;_lockStatus=null;
    tryInsert();
  }
},2000);
})();
</script>
<!-- End Project Lock UI Injection -->
