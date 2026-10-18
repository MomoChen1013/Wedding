/* ============================================================
   samples/analytics.js — PostHog（只在 /samples 總覽頁與示範網站載入）
   ------------------------------------------------------------
   config.js 的 POSTHOG_KEY／POSTHOG_HOST 沒填就什麼都不做，
   回傳的 track() 也只是空函式，呼叫端不必另外判斷。

   正式婚禮網站不會走到這裡：總覽頁自己 import，
   示範網站由 samples/demo-extras.js import（js/site-context.js 只在示範模式載入它）。

     autocapture、heatmaps 開著；UTM 參數 PostHog 會自己記在第一次造訪上
     pageview：預覽 popup 裡的 iframe 不載入這一支，所以不會重複計算
============================================================ */
import { POSTHOG_KEY, POSTHOG_HOST } from './config.js';

const noop = () => {};

export function initAnalytics({ props } = {}) {
  if (!POSTHOG_KEY || !POSTHOG_HOST) return noop;
  try {
    /* PostHog 官方的載入片段：先放一個會排隊的 stub，array.js 載完再把排隊的呼叫補送出去 */
    !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.crossOrigin="anonymous",p.async=!0,p.src=s.api_host.replace(".i.posthog.com","-assets.i.posthog.com")+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagPayload isFeatureEnabled reloadFeatureFlags on onFeatureFlags onSessionId identify setPersonProperties group resetGroups reset get_distinct_id getGroups get_session_id alias set_config startSessionRecording stopSessionRecording captureException get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing debug".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
    window.posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: true,
      enable_heatmaps: true,
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: 'identified_only',
    });
    if (props) window.posthog.register(props);
    return (event, properties) => {
      try { window.posthog.capture(event, properties || {}); } catch { /* 分析壞掉不影響頁面 */ }
    };
  } catch {
    return noop;
  }
}
