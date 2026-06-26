        <!-- Project Lock UI Injection (v13) -->
<!-- 标记携带会话ID，WS过滤跨会话串扰 -->
<script>
(function(){'use strict';
var SK;
var GRACE_MS = 3500;
var graceActive = true;
var _lockEl=null,_lockInp=null,_lockIcon=null;
var _pendingLockPath=null;

setTimeout(function(){ graceActive = false; }, GRACE_MS);

// ===== 会话维度 localStorage key =====
function getCurrentSessionKey(){
  var sel=document.querySelector('[data-chat-session-picker-option][aria-selected="true"]');
  if(sel){
    var key=sel.getAttribute('data-session-key');
    if(key) return key;
  }
  var s=location.search.match(/session=([^&]+)/)||location.hash.match(/session=([^&]+)/);
  if(s){
    try{return decodeURIComponent(s[1]);}catch(e){}
  }
  var m=location.search.match(/agent[=:]([^&]+)/)||location.hash.match(/agent[=:]([^&]+)/);
  var p=location.pathname.match(/agent\/([^/]+)/);
  return (m&&m[1])||(p&&p[1])||'main';
}
function getLocalStorageKey(){
  var key=getCurrentSessionKey();
  return 'openclaw_project_lock_'+key.replace(/[^a-zA-Z0-9_.:-]/g,'_');
}
function resetSK(){ SK = null; }
function gp(){if(!SK)SK=getLocalStorageKey();try{return localStorage.getItem(SK)||''}catch(e){return ''}}
function sp(p){if(!SK)SK=getLocalStorageKey();try{localStorage.setItem(SK,p)}catch(e){}}
function rp(){if(!SK)SK=getLocalStorageKey();try{localStorage.removeItem(SK)}catch(e){}}

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
  setTimeout(function(){
    var sb=root.querySelector('.chat-send-btn');
    if(sb&&!sb.disabled){sb.click();return;}
    ta.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
  },100);
  return true;
}

// ===== 标记解析：格式为 [TYPE: sessionKey::value] =====
// 只处理匹配当前会话的标记，防止跨 Tab 串扰
function parseMarker(text, type){
  var re=new RegExp('\\['+type+':\\s*([^\\]]+)\\]');
  var m=text.match(re);
  if(!m||!m[1]) return null;
  var inner=m[1].trim();
  // 格式: sessionKey::value  或  sessionKey (无 value)
  var sep=inner.indexOf('::');
  if(sep<0){
    // 无 :: 分隔，整个作为 sessionKey（如 [LockCleared: main]）
    return {sessionKey:inner, value:''};
  }
  return {
    sessionKey:inner.slice(0,sep).trim(),
    value:inner.slice(sep+2).trim()
  };
}

// ===== 扫描协议标记 =====
function scanForMarkers(text){
  if(graceActive) return false;
  if(!text||typeof text!=='string') return false;
  var currentSession=getCurrentSessionKey();
  var changed=false;

  // [LockConfirmed: sessionKey::/path] — Agent 确认锁定
  var lc=parseMarker(text,'LockConfirmed');
  if(lc && lc.sessionKey===currentSession && isValidPath(lc.value)){
    sp(lc.value);
    _pendingLockPath=null;
    changed=true;
    console.log('[ProjectLock] Lock confirmed for', currentSession, ':', lc.value);
  }

  // [LockCleared: sessionKey] — Agent 确认解锁
  var clr=parseMarker(text,'LockCleared');
  if(clr && clr.sessionKey===currentSession){
    rp();
    _pendingLockPath=null;
    changed=true;
    console.log('[ProjectLock] Lock cleared for', currentSession);
  }

  // [Project: sessionKey::/path] — Agent 返回检测到的路径
  var pm=parseMarker(text,'Project');
  if(pm && pm.sessionKey===currentSession && isValidPath(pm.value) && pm.value!==gp()){
    sp(pm.value);
    changed=true;
    console.log('[ProjectLock] Detected for', currentSession, ':', pm.value);
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
  // 不 null 化引用，让 tryInsert 先检查 document.contains
  setTimeout(function(){tryInsert();},300);
}
history.pushState=function(){var r=_origPushState.apply(this,arguments);onUrlChange();return r;};
history.replaceState=function(){var r=_origReplaceState.apply(this,arguments);onUrlChange();return r;};
window.addEventListener('popstate',function(){_lastHref=location.href;resetSK();refreshUI();});

// ===== UI 更新 =====
function getStatus(){
  if(_pendingLockPath) return 'pending';
  var val=gp();
  if(val) return 'locked';
  return 'unlocked';
}
function getStatusIcon(status){
  switch(status){
    case 'pending': return '\u{1F504}';
    case 'locked': return '\u{1F512}';
    default: return '\u{1F4CC}';
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
    var newKey=getLocalStorageKey();
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
    if(status==='pending') return;
    if(status==='locked'){
      _pendingLockPath='__unlocking__';
      updateUI();
      sendToAgent('[unlock]');
      return;
    }
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
        _pendingLockPath='__unlocking__';
        updateUI();
        sendToAgent('[unlock]');
      }else if(isValidPath(path)){
        _pendingLockPath=path;
        updateUI();
        sendToAgent('[lock: '+path+']');
      }else{
        sp(path);
        updateUI();
      }
      inp.blur();
    }
  };

  _lockEl=w;_lockInp=inp;
  updateUI();

  createResponseObserver(document.querySelector('openclaw-app')?.shadowRoot||document.querySelector('openclaw-app')||document.body);
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(function(){
      var app=document.querySelector('openclaw-app');
      if(app) createResponseObserver(app.shadowRoot||app);
    },500);
  });

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

// ===== 插入 UI =====
function tryInsert(){
  if(_lockEl&&document.contains(_lockEl)) return true;
  // 清理所有残留的旧组件，防止会话切换时堆积
  document.querySelectorAll('#openclaw-project-lock').forEach(function(el){el.remove();});
  _lockEl=null;_lockInp=null;_lockIcon=null;
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
  // 检查是否有残留或重复组件
  var all=document.querySelectorAll('#openclaw-project-lock');
  if(all.length>1){
    // 有重复，清理后重建
    all.forEach(function(el){el.remove();});
    _lockEl=null;_lockInp=null;_lockIcon=null;
    tryInsert();
  }else if(_lockEl&&!document.contains(_lockEl)){
    _lockEl=null;_lockInp=null;_lockIcon=null;
    tryInsert();
  }
},2000);
})();
</script>
<!-- End Project Lock UI Injection -->
