// ==UserScript==
// @name         雨课堂刷课助手 v2.6
// @namespace    http://tampermonkey.net/
// @version      2.6
// @description  针对雨课堂视频进行自动播放，配置题库自动答题
// @author       叶屿
// @license      GPL3
// @antifeature  payment 题库答题功能需要验证码（免费）或激活码（付费），视频播放等基础功能完全免费
// @match        *://*.yuketang.cn/*
// @match        *://*.gdufemooc.cn/*
// @match        *://*exam.yuketang.cn/*
// @match        *://*-exam.yuketang.cn/*
// @run-at       document-start
// @icon         http://yuketang.cn/favicon.ico
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      qsy.iano.cn
// @connect      lyck6.cn
// @connect      cdn.jsdelivr.net
// @connect      unpkg.com
// @connect      open.bigmodel.cn
// @connect      dashscope.aliyuncs.com
// @connect      ark.cn-beijing.volces.com
// @connect      spark-api-open.xf-yun.com
// @connect      aip.baidubce.com
// @connect      api.deepseek.com
// @connect      api.moonshot.cn
// @connect      api.openai.com
// @connect      generativelanguage.googleapis.com
// @connect      api.groq.com
// @connect      api.siliconflow.cn
// @connect      api.lingyiwanwu.com
// @connect      api.minimax.chat
// @connect      api.stepfun.com
// @connect      api.baichuan-ai.com
// @connect      yuketang.cn
// @connect      gdufemooc.cn
// @require      https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
// @require      https://unpkg.com/tesseract.js@v2.1.0/dist/tesseract.min.js
// @require      https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/dist/opentype.min.js
// ==/UserScript==

/*
 * ==========================================
 * 雨课堂刷课助手 v2.6
 * ==========================================
 *
 * 【功能说明】
 * 1. 视频自动播放（支持倍速、静音、防暂停）
 * 2. 作业自动答题（OCR识别 + 题库查询）
 * 3. 考试自动答题（支持停止/继续）
 * 4. 双模式题库（免费验证码 / 付费激活码）
 *
 * 【积分购买】
 * 联系微信：C919irt
 * 价格表：50积分=2元，100积分=4元，150积分=6元，200积分=8元，500积分=18元
 * 说明：每次答题消耗1积分，积分永久有效
 *
 * 【付费声明】
 * 本脚本基础功能（视频播放、进度保存）完全免费
 * 题库答题功能需要验证码（免费24小时）或激活码（付费永久）
 * 付费仅用于题库API调用成本，不强制购买
 *
 * 【免责声明】
 * 本脚本仅供学习交流使用，请勿用于违反学校规定或作弊行为
 * 使用本脚本造成的任何后果由使用者自行承担
 *
 * 【版权信息】
 * 作者：叶屿 | 版本：v2.6 | 更新：2026-05-15
 *
 * ==========================================
 */

(() => {
  'use strict';

  let panel; // UI 面板实例后置初始化
  let isRunning = false; // 标记是否正在运行
  let stopRequested = false; // 标记是否请求停止
  let AI_PROVIDERS = {};

  // ---- 脚本配置，用户可修改 ----
  const Config = {
    version: '2.6',     // 版本号
    playbackRate: 2,      // 视频播放倍速
    pptInterval: 3000,    // ppt翻页间隔
    storageKeys: {        // 使用者勿动
      progress: '[雨课堂脚本]刷课进度信息',
      deviceId: 'ykt_device_id',
      activationCode: 'ykt_activation_code',
      answerMode: 'ykt_answer_mode', // 答题模式：free/paid
      verifyValidUntil: 'ykt_verify_valid_until', // 验证码有效期
      proClassCount: 'pro_lms_classCount',
      feature: 'ykt_feature_conf', // 是否开启题库作答/自动评论
      runState: 'ykt_run_state',
      aiApiKey: 'ykt_ai_api_key',
      aiProvider: 'ykt_ai_provider',
      aiUnlockCode: 'ykt_ai_unlock_code',
      aiUnlockUntil: 'ykt_ai_unlock_until',
      playbackRate: 'ykt_playback_rate',
      unmatchedFallback: 'ykt_unmatched_fallback'
    }
  };

  const Utils = {
    // 短暂睡眠，等待网页加载
    sleep: (ms = 1000) => new Promise(resolve => setTimeout(resolve, ms)),
    // 将一个 JSON 字符串解析为 JavaScript 对象
    safeJSONParse(value, fallback) {
      try {
        return JSON.parse(value);
      } catch (_) {
        return fallback;
      }
    },
    // 每隔一段时间检查某个条件是否满足（通过 checker 函数），如果满足就成功返回；如果超时仍未满足，就失败返回
    poll(checker, { interval = 1000, timeout = 20000 } = {}) {
      return new Promise(resolve => {
        const start = Date.now();
        const timer = setInterval(() => {
          if (checker()) {
            clearInterval(timer);
            resolve(true);
            return;
          }
          if (Date.now() - start > timeout) {
            clearInterval(timer);
            resolve(false);
          }
        }, interval);
      });
    },
    // 使用UI课程完成度来判别是否完成课程
    isProgressDone(text) {
      if (!text) return false;
      return text.includes('100%') || text.includes('99%') || text.includes('98%') || text.includes('已完成');
    },
    // 主要是规避firefox会创建多个iframe的问题
    inIframe() {
      return window.top !== window.self;
    },
    // 下滑到最底部，触发课程加载
    scrollToBottom(containerSelector) {
      const el = document.querySelector(containerSelector);
      if (el) el.scrollTop = el.scrollHeight;
    },
    async getDDL() {
      const element = document.querySelector('video') || document.querySelector('audio');

      const fallback = 180_000;
      if (!element) return fallback;

      let duration = Number(element.duration);
      if (!Number.isFinite(duration) || duration <= 0) {
        await new Promise(resolve => element.addEventListener('loadedmetadata', resolve, { once: true }));
        duration = Number(element.duration);
      }

      const elementDurationMs = duration * 1000;               // 转为秒
      const timeout = Math.max(elementDurationMs * 3, 10_000); // 至少 10 秒（防极短视频）;
      return timeout;
    }
  };

  // ---- 存储工具 ----
  const Store = {
    getProgress(url) {
      const raw = localStorage.getItem(Config.storageKeys.progress);
      const all = Utils.safeJSONParse(raw, {}) || { url: { outside: 0, inside: 0 } };
      if (!all[url]) {
        all[url] = { outside: 0, inside: 0 };
        localStorage.setItem(Config.storageKeys.progress, JSON.stringify(all));
      }
      return { all, current: all[url] };
    },
    setProgress(url, outside, inside = 0) {
      const raw = localStorage.getItem(Config.storageKeys.progress);
      const all = Utils.safeJSONParse(raw, {});
      all[url] = { outside, inside };
      localStorage.setItem(Config.storageKeys.progress, JSON.stringify(all));
    },
    removeProgress(url) {
      const raw = localStorage.getItem(Config.storageKeys.progress);
      const all = Utils.safeJSONParse(raw, {});
      delete all[url];
      localStorage.setItem(Config.storageKeys.progress, JSON.stringify(all));
    },
    getDeviceId() {
      let deviceId = localStorage.getItem(Config.storageKeys.deviceId);
      if (!deviceId) {
        deviceId = 'ykt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem(Config.storageKeys.deviceId, deviceId);
      }
      return deviceId;
    },
    getActivationCode() {
      return localStorage.getItem(Config.storageKeys.activationCode) || '';
    },
    setActivationCode(code) {
      localStorage.setItem(Config.storageKeys.activationCode, code);
    },
    getAnswerMode() {
      return localStorage.getItem(Config.storageKeys.answerMode) || 'free';
    },
    setAnswerMode(mode) {
      localStorage.setItem(Config.storageKeys.answerMode, mode);
    },
    getVerifyValidUntil() {
      return Number(localStorage.getItem(Config.storageKeys.verifyValidUntil)) || 0;
    },
    setVerifyValidUntil(timestamp) {
      localStorage.setItem(Config.storageKeys.verifyValidUntil, timestamp);
    },
    isVerifyValid() {
      const validUntil = this.getVerifyValidUntil();
      return validUntil > Date.now() / 1000;
    },
    getProClassCount() {
      const value = localStorage.getItem(Config.storageKeys.proClassCount);
      return value ? Number(value) : 1;
    },
    setProClassCount(count) {
      localStorage.setItem(Config.storageKeys.proClassCount, count);
    },
    getFeatureConf() {
      const raw = localStorage.getItem(Config.storageKeys.feature);
      const saved = Utils.safeJSONParse(raw, {}) || {};
      const conf = {
        autoAI: saved.autoAI ?? false,
        autoComment: saved.autoComment ?? false,
        commentMode: saved.commentMode ?? 'copy',  // 'copy' = 复制他人评论, 'ai' = AI生成评论
        skipLive: saved.skipLive ?? false,
      };
      localStorage.setItem(Config.storageKeys.feature, JSON.stringify(conf));
      return conf;
    },
    setFeatureConf(conf) {
      localStorage.setItem(Config.storageKeys.feature, JSON.stringify(conf));
    },
    getRunState() {
      const raw = localStorage.getItem(Config.storageKeys.runState);
      return Utils.safeJSONParse(raw, null);
    },
    setRunState(status) {
      const state = { status, lastActiveTime: Date.now() };
      localStorage.setItem(Config.storageKeys.runState, JSON.stringify(state));
    },
    clearRunState() {
      localStorage.removeItem(Config.storageKeys.runState);
    },
    touchRunState() {
      const state = this.getRunState();
      if (state && state.status === 'running') {
        state.lastActiveTime = Date.now();
        localStorage.setItem(Config.storageKeys.runState, JSON.stringify(state));
      }
    },
    getAIApiKey() {
      return localStorage.getItem(Config.storageKeys.aiApiKey) || '';
    },
    setAIApiKey(key) {
      localStorage.setItem(Config.storageKeys.aiApiKey, key);
    },
    getAIProvider() {
      return localStorage.getItem(Config.storageKeys.aiProvider) || 'zhipu';
    },
    setAIProvider(provider) {
      localStorage.setItem(Config.storageKeys.aiProvider, provider);
    },
    getAIUnlockCode() {
      return localStorage.getItem(Config.storageKeys.aiUnlockCode) || '';
    },
    setAIUnlockCode(code) {
      localStorage.setItem(Config.storageKeys.aiUnlockCode, code);
    },
    getAIUnlockUntil() {
      return Number(localStorage.getItem(Config.storageKeys.aiUnlockUntil)) || 0;
    },
    setAIUnlockUntil(timestamp) {
      localStorage.setItem(Config.storageKeys.aiUnlockUntil, timestamp);
    },
    isAIUnlocked() {
      const until = this.getAIUnlockUntil();
      return until > Date.now() / 1000;
    },
    getPlaybackRate() {
      return Number(localStorage.getItem(Config.storageKeys.playbackRate)) || 2;
    },
    setPlaybackRate(rate) {
      localStorage.setItem(Config.storageKeys.playbackRate, rate);
      Config.playbackRate = rate;
    },
    getUnmatchedFallback() {
      // 题库未匹配时的兜底策略：ai(调用AI，按题型支持多选) | skip(跳过)
      return localStorage.getItem(Config.storageKeys.unmatchedFallback) || 'ai';
    },
    setUnmatchedFallback(strategy) {
      localStorage.setItem(Config.storageKeys.unmatchedFallback, strategy);
    }
  };

  // ---- UI 面板 ----
  function createPanel() {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.top = '40px';
    iframe.style.left = '40px';
    iframe.style.width = '480px';
    iframe.style.height = '520px';
    iframe.style.zIndex = '999999';
    iframe.style.border = '1px solid #a3a3a3';
    iframe.style.borderRadius = '12px';
    iframe.style.background = '#fff';
    iframe.style.overflow = 'hidden';
    iframe.style.boxShadow = '0 10px 40px rgba(0,0,0,0.2)';
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('id', 'ykt-helper-iframe');
    iframe.setAttribute('allowtransparency', 'true');
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(`
                  <style>
              /* 全局重置 */
              html, body {
                overflow: hidden;
                margin: 0;
                padding: 0;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
                color: #333;
                background: transparent;
              }

              /* 主容器 */
              .mini-basic {
                position: absolute;
                inset: 0;
                background: #4a90e2;
                color: white;
                height: 100%;
                width: 100%;
                min-height: 50px;
                min-width: 50px;
                border-radius: 12px;
                text-align: center;
                line-height: 1;
                z-index: 1000000;
                cursor: move;
                display: none;
                align-items: center;
                justify-content: center;
                font-weight: 600;
                font-size: 16px;
                box-shadow: 0 4px 12px rgba(74, 144, 226, 0.4);
                transition: all 0.3s;
              }
              .mini-basic:hover {
                background: #5a9fe8;
                box-shadow: 0 6px 16px rgba(74, 144, 226, 0.5);
                transform: scale(1.05);
              }
              .mini-basic.show {
                display: flex;
              }

              /* 面板主容器 */
              .panel {
                width: 100%;
                height: 100%;
                background: #ffffff;
                border-radius: 12px;
                position: relative;
                overflow: hidden;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
              }

              /* 标题栏 */
              .header {
                height: 50px;
                background: #4a90e2;
                color: white;
                font-size: 16px;
                font-weight: 600;
                line-height: 50px;
                border-radius: 12px 12px 0 0;
                cursor: move;
                position: relative;
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 0 18px;
              }
              .tools ul {
                margin: 0;
                padding: 0;
                list-style: none;
                display: flex;
                gap: 10px;
              }
              .tools li {
                display: inline-block;
                cursor: pointer;
                font-size: 18px;
                padding: 0 8px;
                color: white;
                opacity: 0.9;
                transition: all 0.2s;
                font-weight: 500;
              }
              .tools li:hover {
                opacity: 1;
                transform: scale(1.1);
              }

              /* 反馈提示 */
              .feedback-tip {
                background: #fff9e6;
                border: 1px solid #ffe58f;
                border-radius: 8px;
                padding: 10px 12px;
                margin-bottom: 12px;
                font-size: 12px;
                color: #d48806;
                line-height: 1.6;
              }
              .feedback-wechat {
                display: inline-block;
                background: white;
                padding: 2px 8px;
                border-radius: 4px;
                border: 1px solid #d9d9d9;
                cursor: pointer;
                transition: all 0.2s;
                margin: 0 3px;
                font-weight: 600;
              }
              .feedback-wechat:hover {
                border-color: #4a90e2;
                color: #4a90e2;
              }

              /* 内容区 */
              .body {
                font-size: 13px;
                line-height: 1.6;
                height: calc(100% - 110px);
                overflow-y: auto;
                padding: 18px;
                box-sizing: border-box;
                background: #ffffff;
              }

              .info {
                margin: 0;
                padding: 0;
                list-style: none;
              }
              .info li {
                margin-bottom: 12px;
                padding: 12px 14px;
                background: #f5f7fa;
                border-radius: 8px;
                color: #606266;
                border-left: 3px solid #4a90e2;
                transition: all 0.2s;
                font-size: 13px;
              }
              .info li:hover {
                background: #ecf5ff;
              }

              /* 设置面板 */
              #settings {
                display: none;
                position: absolute;
                top: 50px;
                left: 0;
                width: 100%;
                height: calc(100% - 50px);
                background: #f8f9fa;
                z-index: 99;
                padding: 18px;
                box-sizing: border-box;
                overflow-y: auto;
              }

              /* 表单项 */
              .form-item {
                margin-bottom: 18px;
                background: white;
                padding: 18px;
                border-radius: 12px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.06);
                transition: all 0.2s;
              }
              .form-item:hover {
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
              }
              .form-item label {
                display: block;
                margin-bottom: 10px;
                font-size: 13px;
                color: #555;
                font-weight: 600;
              }
              .form-item input[type="text"],
              .form-item input[type="password"] {
                width: 100%;
                padding: 10px 12px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 13px;
                box-sizing: border-box;
                background: #fafafa;
                transition: all 0.2s;
              }
              .form-item input[type="text"]:focus,
              .form-item input[type="password"]:focus {
                border-color: #667eea;
                background: white;
                outline: none;
              }

              /* 复选框标签优化 */
              .form-item .checkbox-label {
                display: flex;
                align-items: center;
                gap: 10px;
                font-size: 13px;
                cursor: pointer;
                font-weight: normal;
                padding: 8px;
                border-radius: 6px;
                transition: all 0.2s;
              }
              .form-item .checkbox-label:hover {
                background: #f0f0f0;
              }
              .form-item .checkbox-label input[type="checkbox"] {
                margin: 0;
                width: 18px;
                height: 18px;
                cursor: pointer;
              }

              /* 下拉选择框 */
              .form-item select {
                width: 100%;
                padding: 10px 12px;
                border: 2px solid #e0e0e0;
                border-radius: 8px;
                font-size: 13px;
                box-sizing: border-box;
                background: #fafafa;
                transition: all 0.2s;
                cursor: pointer;
                appearance: auto;
              }
              .form-item select:focus {
                border-color: #667eea;
                background: white;
                outline: none;
              }

              /* 单选按钮样式 */
              .radio-group {
                display: flex;
                gap: 12px;
                margin-bottom: 0;
              }
              .radio-option {
                flex: 1;
                padding: 15px;
                border: 2px solid #e0e0e0;
                border-radius: 10px;
                cursor: pointer;
                transition: all 0.3s;
                background: white;
                text-align: center;
              }
              .radio-option:hover {
                border-color: #667eea;
                transform: translateY(-2px);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.2);
              }
              .radio-option.selected {
                border-color: #667eea;
                background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
                box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
              }
              .radio-option input[type="radio"] {
                display: none;
              }
              .radio-option .icon {
                font-size: 28px;
                margin-bottom: 8px;
              }
              .radio-option .title {
                font-weight: 600;
                font-size: 14px;
                color: #333;
                margin-bottom: 5px;
              }
              .radio-option .desc {
                font-size: 12px;
                color: #999;
              }

              /* 验证码区域 */
              .verify-section {
                text-align: center;
                padding: 15px;
              }
              .verify-qrcode {
                width: 150px;
                height: 150px;
                margin: 10px auto;
                display: block;
                border-radius: 10px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.1);
              }
              .verify-hint {
                font-size: 12px;
                color: #888;
                margin: 10px 0;
                line-height: 1.6;
              }
              .verify-input-group {
                display: flex;
                gap: 10px;
                margin-top: 12px;
              }
              .verify-input-group input {
                flex: 1;
              }
              .verify-btn {
                padding: 10px 20px;
                background: #4a90e2;
                color: white;
                border: none;
                border-radius: 6px;
                cursor: pointer;
                font-size: 13px;
                font-weight: 600;
                transition: all 0.2s;
                white-space: nowrap;
              }
              .verify-btn:hover {
                opacity: 0.85;
              }
              .verify-btn:disabled {
                opacity: 0.5;
                cursor: not-allowed;
              }
              .verify-status {
                margin-top: 10px;
                padding: 10px;
                border-radius: 8px;
                font-size: 13px;
                display: none;
              }
              .verify-status.success {
                background: #d4edda;
                color: #155724;
                border: 1px solid #c3e6cb;
                display: block;
              }
              .verify-status.error {
                background: #f8d7da;
                color: #721c24;
                border: 1px solid #f5c6cb;
                display: block;
              }

              /* 积分显示 */
              .credits-info {
                background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%);
                padding: 15px;
                border-radius: 10px;
                margin-bottom: 12px;
                border: 2px solid #667eea;
              }
              .credits-display {
                font-size: 24px;
                font-weight: 700;
                color: #667eea;
                text-align: center;
                margin: 10px 0;
              }
              .credits-label {
                font-size: 12px;
                color: #888;
                text-align: center;
              }

              /* 购买信息 */
              .buy-info {
                background: #fff9e6;
                padding: 12px;
                border-radius: 8px;
                border: 1px solid #ffe58f;
                margin-top: 12px;
                font-size: 12px;
                line-height: 1.6;
              }
              .buy-info-title {
                font-weight: 600;
                color: #d48806;
                margin-bottom: 8px;
                font-size: 13px;
              }
              .wechat-copy {
                display: inline-flex;
                align-items: center;
                gap: 5px;
                background: white;
                padding: 5px 10px;
                border-radius: 6px;
                border: 1px solid #d9d9d9;
                cursor: pointer;
                transition: all 0.2s;
                margin: 5px 0;
              }
              .wechat-copy:hover {
                border-color: #667eea;
                background: #f0f5ff;
              }
              .price-table {
                margin-top: 8px;
                font-size: 11px;
                color: #666;
                line-height: 1.8;
              }

              /* 底部按钮栏 */
              .footer {
                position: absolute;
                bottom: 0;
                left: 0;
                width: 100%;
                background: #f5f7fa;
                border-top: 1px solid #e4e7ed;
                display: flex;
                justify-content: space-around;
                align-items: center;
                padding: 12px 0;
                gap: 10px;
              }
              .footer button {
                border: none;
                border-radius: 6px;
                color: white;
                cursor: pointer;
                padding: 10px 18px;
                font-size: 13px;
                font-weight: 600;
                transition: all 0.2s ease;
                flex: 1;
                margin: 0 8px;
              }
              .footer button:hover {
                opacity: 0.85;
              }
              .footer button:active {
                transform: scale(0.98);
              }
              #btn-start {
                background: #4a90e2;
              }
              #btn-clear {
                background: #f56c6c;
              }
              #btn-setting {
                background: #67c23a;
              }

              /* 设置页底部按钮 */
              .settings-footer {
                text-align: center;
                margin-top: 15px;
                display: flex;
                justify-content: center;
                gap: 12px;
              }
              .settings-footer button {
                padding: 10px 24px;
                font-size: 13px;
                font-weight: 600;
                border-radius: 6px;
                border: none;
                cursor: pointer;
                transition: all 0.2s;
              }
              .settings-footer button:hover {
                opacity: 0.85;
              }
              #save_settings {
                background: #4a90e2;
                color: white;
              }
              #close_settings {
                background: #909399;
                color: white;
              }

              /* 滚动条美化 */
              .body::-webkit-scrollbar,
              #settings::-webkit-scrollbar {
                width: 6px;
              }
              .body::-webkit-scrollbar-track,
              #settings::-webkit-scrollbar-track {
                background: #f1f1f1;
                border-radius: 3px;
              }
              .body::-webkit-scrollbar-thumb,
              #settings::-webkit-scrollbar-thumb {
                background: #ccc;
                border-radius: 3px;
              }
              .body::-webkit-scrollbar-thumb:hover,
              #settings::-webkit-scrollbar-thumb:hover {
                background: #999;
              }
            </style>

            <div class="mini-basic" id="mini-basic">
              <div id="mini-status" style="text-align: center; line-height: 1.3;">
                <div id="mini-icon" style="font-size: 18px; margin-bottom: 3px;">📚</div>
                <div id="mini-text" style="font-size: 10px; font-weight: 500;">雨课堂助手</div>
              </div>
            </div>
            <div class="panel" id="panel">
              <div class="header" id="header">
                🎓 雨课堂助手
                <div class='tools'>
                  <ul>
                    <li class='minimality' id="minimality">−</li>
                    <li class='question' id="question">?</li>
                  </ul>
                </div>
              </div>
              <div class="body">
                <div class="feedback-tip">
                  ⚠️ 有BUG及时反馈需提供账号<br>
                  联系微信：<span class="feedback-wechat" id="feedback_wechat">C919irt 📋</span>
                </div>
                <ul class="info" id="info">
                  <li>✅ 脚本已加载 v2.6</li>
                  <li>📖 题库自动答题模式</li>
                  <li>⚠️ 自动答题需要配置激活</li>
                  <li>💡 点击【题库配置】开始</li>
                  <li style="border-left-color: #67c23a;">🚀 雨课堂助手已启动</li>
                </ul>
              </div>
              <div id="settings">
                <div class="form-item">
                  <label style="margin-bottom: 12px; display: block; font-weight: 600; font-size: 14px;">📚 答题模式</label>
                  <div class="radio-group">
                    <div class="radio-option" id="mode-paid">
                      <input type="radio" name="answer_mode" value="paid">
                      <div class="icon">💳</div>
                      <div class="title">付费题库</div>
                      <div class="desc">需要激活码</div>
                    </div>
                    <div class="radio-option selected" id="mode-free">
                      <input type="radio" name="answer_mode" value="free" checked>
                      <div class="icon">🆓</div>
                      <div class="title">免费题库</div>
                      <div class="desc">需要验证码</div>
                    </div>
                    <div class="radio-option" id="mode-ai">
                      <input type="radio" name="answer_mode" value="ai">
                      <div class="icon">🤖</div>
                      <div class="title">AI答题</div>
                      <div class="desc">需要API Key</div>
                    </div>
                  </div>
                </div>
                <div class="form-item" id="activation-code-section" style="display: none;">
                  <label>🔑 激活码</label>
                  <div class="credits-info">
                    <div class="credits-label">当前积分</div>
                    <div class="credits-display" id="credits_display">-- 积分</div>
                  </div>
                  <div class="verify-input-group">
                    <input type="text" id="activation_code" placeholder="请输入激活码 (YK-XXXX-XXXX-XXXX)">
                    <button class="verify-btn" id="activate_btn">激活</button>
                  </div>
                  <div class="verify-status" id="activate_status"></div>
                  <div class="buy-info">
                    <div class="buy-info-title">💰 积分购买</div>
                    <div>联系微信：<span class="wechat-copy" id="wechat_copy">C919irt 📋</span></div>
                    <div class="price-table">
                      <strong>价格表：</strong><br>
                      • 50积分 = 2元<br>
                      • 100积分 = 4元<br>
                      • 150积分 = 6元<br>
                      • 200积分 = 8元<br>
                      • 500积分 = 18元<br>
                      <span style="color: #999;">每次答题消耗1积分 | 支持定制套餐</span>
                    </div>
                  </div>
                </div>
                <div class="form-item" id="verify-code-section">
                  <label>🔐 验证码激活</label>
                  <div class="verify-section">
                    <img class="verify-qrcode" src="https://qsy.iano.cn/yzm.png" alt="扫码获取验证码">
                    <div class="verify-hint">扫码观看广告获取验证码<br>验证后免费使用24小时</div>
                  </div>
                  <div class="verify-input-group">
                    <input type="text" id="verify_code" placeholder="请输入4位验证码" maxlength="4" style="text-align: center; letter-spacing: 4px; font-size: 18px; font-weight: 600;">
                    <button class="verify-btn" id="verify_btn">验证</button>
                  </div>
                  <div class="verify-status" id="verify_status"></div>
                </div>
                <div class="form-item" id="ai-config-section" style="display: none;">
                  <label>🤖 AI答题配置</label>
                  <div style="margin-bottom: 12px;">
                    <label style="font-size: 12px; color: #666; margin-bottom: 6px; display: block;">选择AI模型：</label>
                    <select id="ai_provider" style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 13px; box-sizing: border-box; background: #fafafa; cursor: pointer;">
                      <optgroup label="── 国内免费模型 ──">
                        <option value="zhipu">智谱GLM-4-Flash (免费)</option>
                        <option value="doubao">豆包Doubao-lite (免费)</option>
                        <option value="spark">讯飞星火Spark Lite (免费)</option>
                      </optgroup>
                      <optgroup label="── 国内付费模型 ──">
                        <option value="deepseek">DeepSeek-V3 (低价推荐)</option>
                        <option value="deepseek_v4">DeepSeek-V4-Pro (最新旗舰⭐)</option>
                        <option value="qwen">通义千问Qwen-Plus</option>
                        <option value="kimi">Kimi/Moonshot</option>
                        <option value="yiwan">零一万物Yi-Lightning</option>
                        <option value="minimax">MiniMax abab6.5s</option>
                        <option value="stepfun">阶跃星辰Step-1-8K</option>
                        <option value="baichuan">百川Baichuan4</option>
                      </optgroup>
                      <optgroup label="── 国际模型 ──">
                        <option value="gpt">OpenAI GPT-4o-mini</option>
                        <option value="gemini">Google Gemini 2.0 Flash</option>
                        <option value="groq">Groq Llama3 (免费极速)</option>
                      </optgroup>
                      <optgroup label="── 聚合平台 ──">
                        <option value="siliconflow">SiliconFlow硅基流动 (多模型)</option>
                      </optgroup>
                    </select>
                  </div>
                  <div id="ai_provider_info" style="font-size: 12px; color: #888; margin-bottom: 10px; line-height: 1.8; background: #f9f9f9; padding: 10px; border-radius: 8px;"></div>
                  <div class="verify-input-group">
                    <input type="password" id="ai_api_key" placeholder="请输入API Key" style="flex: 1;">
                  </div>
                  <div style="margin-top: 12px; padding: 12px; background: linear-gradient(135deg, #e8f5e9, #e3f2fd); border-radius: 8px; border: 1px solid #c8e6c9;">
                    <div style="font-size: 13px; font-weight: 600; color: #2e7d32; margin-bottom: 8px;">🚀 AI答题限速解锁</div>
                    <div style="font-size: 12px; color: #666; margin-bottom: 8px; line-height: 1.6;">
                      默认AI答题间隔35秒（防封号），解锁后可享受与免费题库相同的速度（约1.5秒/题）
                    </div>
                    <div id="ai_unlock_status" style="font-size: 12px; margin-bottom: 8px;"></div>
                    <div style="text-align: center; margin-bottom: 8px;">
                      <img id="ai_unlock_qrcode" src="https://qsy.iano.cn/yzm.png" alt="扫码获取解锁码" style="width: 120px; height: 120px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                      <div style="font-size: 11px; color: #999; margin-top: 4px;">扫码获取解锁验证码</div>
                    </div>
                    <div class="verify-input-group">
                      <input type="text" id="ai_unlock_code" placeholder="输入4位解锁码" maxlength="4" style="text-align: center; letter-spacing: 4px; font-size: 16px; font-weight: 600; flex: 1;">
                      <button class="verify-btn" id="ai_unlock_btn">解锁</button>
                    </div>
                  </div>
                </div>
                <div class="form-item">
                  <label>⚡ 播放倍速</label>
                  <select id="playback_rate">
                    <option value="1">1x</option>
                    <option value="1.25">1.25x</option>
                    <option value="1.5">1.5x</option>
                    <option value="1.75">1.75x</option>
                    <option value="2" selected>2x</option>
                    <option value="2.5">2.5x</option>
                    <option value="3">3x</option>
                    <option value="4">4x</option>
                    <option value="5">5x</option>
                    <option value="8">8x</option>
                    <option value="16">16x</option>
                  </select>
                </div>
                <div class="form-item">
                  <label>🎲 题库未命中时的兜底策略</label>
                  <select id="unmatched_fallback" style="width: 100%; padding: 10px 12px; border: 2px solid #e0e0e0; border-radius: 8px; font-size: 13px; box-sizing: border-box; background: #fafafa; cursor: pointer;">
                    <option value="ai">🤖 调用 AI 兜底（需先配 API Key，支持多选题）</option>
                    <option value="skip">⏭️ 跳过不答</option>
                  </select>
                  <div style="font-size: 11px; color: #999; margin-top: 6px; line-height: 1.5;">题库未匹配到答案时怎么处理。盲蒙单选 A 在多选题下"少选不得分"反而拖累正确率，所以只保留 AI 兜底（按题型返回单/多选）或跳过。AI 学习空间连续跳过太多题会让"下一题"按钮被锁，建议优先 AI。</div>
                </div>
                <div class="form-item">
                  <label class="checkbox-label">
                    <input type="checkbox" id="feature_auto_ai">
                    <span>✨ 启用题库自动答题（作业/题目）</span>
                  </label>
                </div>
                <div class="form-item">
                  <label class="checkbox-label">
                    <input type="checkbox" id="feature_auto_comment">
                    <span>💬 启用批量区图文/讨论自动回复</span>
                  </label>
                  <div id="comment_mode_section" style="display: none; margin-top: 10px; padding: 12px; background: #f9f9f9; border-radius: 8px; border-left: 3px solid #667eea;">
                    <label style="font-size: 12px; color: #666; margin-bottom: 8px; display: block; font-weight: 600;">回复方式：</label>
                    <div style="display: flex; gap: 8px;">
                      <label style="flex: 1; display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: white; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; font-size: 12px; transition: all 0.2s;" class="comment-mode-option" data-mode="copy">
                        <input type="radio" name="comment_mode" value="copy" id="comment_mode_copy" style="margin: 0;">
                        <div>
                          <div style="font-weight: 600;">📋 复制首条</div>
                          <div style="color: #999; font-size: 11px;">复制第一条评论发送</div>
                        </div>
                      </label>
                      <label style="flex: 1; display: flex; align-items: center; gap: 6px; padding: 8px 10px; background: white; border: 2px solid #e0e0e0; border-radius: 8px; cursor: pointer; font-size: 12px; transition: all 0.2s;" class="comment-mode-option" data-mode="ai">
                        <input type="radio" name="comment_mode" value="ai" id="comment_mode_ai" style="margin: 0;">
                        <div>
                          <div style="font-weight: 600;">🤖 AI智能回复</div>
                          <div style="color: #999; font-size: 11px;">AI阅读内容生成回复</div>
                        </div>
                      </label>
                    </div>
                    <div id="ai_comment_hint" style="display: none; margin-top: 8px; font-size: 11px; color: #888; line-height: 1.6;">
                      💡 AI回复需先在上方AI答题配置中设置API Key，将使用相同的AI模型生成回复
                    </div>
                  </div>
                </div>
                <div class="form-item">
                  <label class="checkbox-label">
                    <input type="checkbox" id="feature_skip_live">
                    <span>🚫 跳过直播课（不刷直播课）</span>
                  </label>
                </div>
                <div class="settings-footer">
                  <button id="save_settings">💾 保存并关闭</button>
                  <button id="close_settings">❌ 取消</button>
                </div>
              </div>
              <div class="footer">
                <button id="btn-setting">⚙️ 题库配置</button>
                <button id="btn-clear">🗑️ 清除缓存</button>
                <button id="btn-start">▶️ 开始刷课</button>
              </div>
            </div>
    `);
    doc.close();

    const ui = {
      iframe,
      doc,
      panel: doc.getElementById('panel'),
      header: doc.getElementById('header'),
      info: doc.getElementById('info'),
      btnStart: doc.getElementById('btn-start'),
      btnClear: doc.getElementById('btn-clear'),
      btnSetting: doc.getElementById('btn-setting'),
      settings: doc.getElementById('settings'),
      saveSettings: doc.getElementById('save_settings'),
      closeSettings: doc.getElementById('close_settings'),
      modePaid: doc.getElementById('mode-paid'),
      modeFree: doc.getElementById('mode-free'),
      modeAI: doc.getElementById('mode-ai'),
      aiConfigSection: doc.getElementById('ai-config-section'),
      aiApiKeyInput: doc.getElementById('ai_api_key'),
      aiProviderSelect: doc.getElementById('ai_provider'),
      unmatchedFallback: doc.getElementById('unmatched_fallback'),
      aiProviderInfo: doc.getElementById('ai_provider_info'),
      aiUnlockCode: doc.getElementById('ai_unlock_code'),
      aiUnlockBtn: doc.getElementById('ai_unlock_btn'),
      aiUnlockStatus: doc.getElementById('ai_unlock_status'),
      activationCodeSection: doc.getElementById('activation-code-section'),
      activationCodeInput: doc.getElementById('activation_code'),
      activateBtn: doc.getElementById('activate_btn'),
      activateStatus: doc.getElementById('activate_status'),
      creditsDisplay: doc.getElementById('credits_display'),
      wechatCopy: doc.getElementById('wechat_copy'),
      feedbackWechat: doc.getElementById('feedback_wechat'),
      verifyCodeSection: doc.getElementById('verify-code-section'),
      verifyCodeInput: doc.getElementById('verify_code'),
      verifyBtn: doc.getElementById('verify_btn'),
      verifyStatus: doc.getElementById('verify_status'),
      featureAutoAI: doc.getElementById('feature_auto_ai'),
      featureAutoComment: doc.getElementById('feature_auto_comment'),
      commentModeCopy: doc.getElementById('comment_mode_copy'),
      commentModeAI: doc.getElementById('comment_mode_ai'),
      commentModeSection: doc.getElementById('comment_mode_section'),
      featureSkipLive: doc.getElementById('feature_skip_live'),
      playbackRate: doc.getElementById('playback_rate'),
      minimality: doc.getElementById('minimality'),
      question: doc.getElementById('question'),
      miniBasic: doc.getElementById('mini-basic'),
      miniIcon: doc.getElementById('mini-icon'),
      miniText: doc.getElementById('mini-text')
    };

    let isDragging = false;
    let startX = 0, startY = 0, startLeft = 0, startTop = 0;
    const hostWindow = window.parent || window;
    const onMove = e => {
      if (!isDragging) return;
      const deltaX = e.screenX - startX;
      const deltaY = e.screenY - startY;
      const maxLeft = Math.max(0, hostWindow.innerWidth - iframe.offsetWidth);
      const maxTop = Math.max(0, hostWindow.innerHeight - iframe.offsetHeight);
      iframe.style.left = Math.min(Math.max(0, startLeft + deltaX), maxLeft) + 'px';
      iframe.style.top = Math.min(Math.max(0, startTop + deltaY), maxTop) + 'px';
    };
    const stopDrag = () => {
      if (!isDragging) return;
      isDragging = false;
      iframe.style.transition = '';
      doc.body.style.userSelect = '';
    };

    // 标题栏拖拽
    ui.header.addEventListener('mousedown', e => {
      isDragging = true;
      startX = e.screenX;
      startY = e.screenY;
      startLeft = parseFloat(iframe.style.left) || 0;
      startTop = parseFloat(iframe.style.top) || 0;
      iframe.style.transition = 'none';
      doc.body.style.userSelect = 'none';
      e.preventDefault();
    });

    // 缩小按钮拖拽
    ui.miniBasic.addEventListener('mousedown', e => {
      isDragging = true;
      startX = e.screenX;
      startY = e.screenY;
      startLeft = parseFloat(iframe.style.left) || 0;
      startTop = parseFloat(iframe.style.top) || 0;
      iframe.style.transition = 'none';
      doc.body.style.userSelect = 'none';
      e.preventDefault();
      e.stopPropagation(); // 防止触发点击事件
    });

    doc.addEventListener('mousemove', onMove);
    hostWindow.addEventListener('mousemove', onMove);
    doc.addEventListener('mouseup', stopDrag);
    hostWindow.addEventListener('mouseup', stopDrag);
    hostWindow.addEventListener('blur', stopDrag);

    const normalSize = { width: parseFloat(iframe.style.width), height: parseFloat(iframe.style.height) };
    const miniSize = 64;
    let isMinimized = false;
    const enterMini = () => {
      if (isMinimized) return;
      isMinimized = true;
      ui.panel.style.display = 'none';
      ui.miniBasic.classList.add('show');
      iframe.style.width = '80px';
      iframe.style.height = '64px';
    };
    const exitMini = () => {
      if (!isMinimized) return;
      isMinimized = false;
      ui.panel.style.display = '';
      ui.miniBasic.classList.remove('show');
      iframe.style.width = normalSize.width + 'px';
      iframe.style.height = normalSize.height + 'px';
    };
    ui.minimality.addEventListener('click', enterMini);
    ui.miniBasic.addEventListener('click', exitMini);

    ui.question.addEventListener('click', () => {
      window.parent.alert('雨课堂助手 v2.6\n作者：叶屿\n\n功能说明：\n- 自动播放视频/音频\n- 题库自动答题\n- AI智能答题（14种大模型可选）\n- AI限速解锁（验证码24h极速答题）\n- AI智能评论/自动回复\n- 自动评论回复');
    });

    const log = message => {
      const li = doc.createElement('li');
      li.innerText = message;
      ui.info.appendChild(li);
      // 限制最多 100 条日志，防止课程内容多时爆内存
      while (ui.info.children.length > 100) {
        ui.info.removeChild(ui.info.firstChild);
      }
      if (ui.info.lastElementChild) ui.info.lastElementChild.scrollIntoView({ behavior: 'smooth', block: 'end', inline: 'nearest' });
    };

    // 查询积分
    const queryCredits = async () => {
      const deviceId = Store.getDeviceId();
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `https://qsy.iano.cn/index.php?s=/api/question_bank/credits&device_id=${deviceId}`,
          timeout: 15000,
          onload: res => {
            if (res.status === 200) {
              try {
                const json = JSON.parse(res.responseText);
                if (json.code === 1) {
                  resolve(json.data);
                } else {
                  reject(json.msg || '查询失败');
                }
              } catch (e) {
                reject('JSON 解析失败');
              }
            } else {
              reject(`请求失败: HTTP ${res.status}`);
            }
          },
          onerror: () => reject('网络错误'),
          ontimeout: () => reject('请求超时')
        });
      });
    };

    // 更新积分显示
    const updateCreditsDisplay = async () => {
      try {
        const data = await queryCredits();
        ui.creditsDisplay.textContent = `${data.remaining_credits} 积分`;
      } catch (err) {
        ui.creditsDisplay.textContent = '-- 积分';
      }
    };

    // 验证验证码
    const verifyCode = async (code) => {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: 'https://qsy.iano.cn/index.php?s=/api/code/verify',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          data: 'code=' + encodeURIComponent(code),
          timeout: 15000,
          onload: res => {
            if (res.status === 200) {
              try {
                const json = JSON.parse(res.responseText);
                if (json.code === 1 && json.data.valid) {
                  resolve(json);
                } else {
                  reject(json.msg || '验证码无效或已过期');
                }
              } catch (e) {
                reject('JSON 解析失败');
              }
            } else {
              reject(`请求失败: HTTP ${res.status}`);
            }
          },
          onerror: () => reject('网络错误'),
          ontimeout: () => reject('请求超时')
        });
      });
    };

    // 激活题库激活码
    const activateCode = async (code, deviceId) => {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: 'https://qsy.iano.cn/index.php?s=/api/question_bank/activate',
          headers: {
            'Content-Type': 'application/json'
          },
          data: JSON.stringify({
            code: code,
            device_id: deviceId
          }),
          timeout: 15000,
          onload: res => {
            if (res.status === 200) {
              try {
                const json = JSON.parse(res.responseText);
                if (json.code === 1) {
                  resolve(json);
                } else {
                  reject(json.msg || '激活失败');
                }
              } catch (e) {
                reject('JSON 解析失败');
              }
            } else {
              reject(`请求失败: HTTP ${res.status}`);
            }
          },
          onerror: () => reject('网络错误'),
          ontimeout: () => reject('请求超时')
        });
      });
    };

    // 切换答题模式
    const switchAnswerMode = (mode) => {
      Store.setAnswerMode(mode);
      ui.modePaid.classList.remove('selected');
      ui.modeFree.classList.remove('selected');
      ui.modeAI.classList.remove('selected');
      ui.activationCodeSection.style.display = 'none';
      ui.verifyCodeSection.style.display = 'none';
      ui.aiConfigSection.style.display = 'none';
      if (mode === 'paid') {
        ui.modePaid.classList.add('selected');
        ui.activationCodeSection.style.display = 'block';
        updateCreditsDisplay();
      } else if (mode === 'ai') {
        ui.modeAI.classList.add('selected');
        ui.aiConfigSection.style.display = 'block';
        ui.aiApiKeyInput.value = Store.getAIApiKey();
        ui.aiProviderSelect.value = Store.getAIProvider();
        updateAIProviderInfo();
        updateAIUnlockStatus();
      } else {
        ui.modeFree.classList.add('selected');
        ui.verifyCodeSection.style.display = 'block';
      }
    };

    // 绑定答题模式切换事件
    ui.modePaid.addEventListener('click', () => switchAnswerMode('paid'));
    ui.modeFree.addEventListener('click', () => switchAnswerMode('free'));
    ui.modeAI.addEventListener('click', () => switchAnswerMode('ai'));

    // 绑定微信号复制
    ui.wechatCopy.addEventListener('click', () => {
      const wechat = 'C919irt';
      const textarea = doc.createElement('textarea');
      textarea.value = wechat;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      doc.body.appendChild(textarea);
      textarea.select();
      try {
        doc.execCommand('copy');
        ui.wechatCopy.textContent = '✅ 已复制';
        setTimeout(() => {
          ui.wechatCopy.textContent = 'C919irt 📋';
        }, 2000);
      } catch (err) {
        console.error('复制失败', err);
      }
      doc.body.removeChild(textarea);
    });

    // 绑定反馈微信号复制
    ui.feedbackWechat.addEventListener('click', () => {
      const wechat = 'C919irt';
      const textarea = doc.createElement('textarea');
      textarea.value = wechat;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      doc.body.appendChild(textarea);
      textarea.select();
      try {
        doc.execCommand('copy');
        ui.feedbackWechat.textContent = '✅ 已复制';
        setTimeout(() => {
          ui.feedbackWechat.textContent = 'C919irt 📋';
        }, 2000);
      } catch (err) {
        console.error('复制失败', err);
      }
      doc.body.removeChild(textarea);
    });

    // 绑定激活按钮
    ui.activateBtn.addEventListener('click', async () => {
      const code = ui.activationCodeInput.value.trim();
      if (!code) {
        ui.activateStatus.className = 'verify-status error';
        ui.activateStatus.textContent = '❌ 请输入激活码';
        ui.activateStatus.style.display = 'block';
        return;
      }

      ui.activateBtn.disabled = true;
      ui.activateBtn.textContent = '激活中...';
      ui.activateStatus.style.display = 'none';

      try {
        const deviceId = Store.getDeviceId();
        const result = await activateCode(code, deviceId);
        Store.setActivationCode(code);
        ui.activateStatus.className = 'verify-status success';
        ui.activateStatus.textContent = `✅ 激活成功！获得 ${result.data.credits} 积分`;
        ui.activateStatus.style.display = 'block';
        ui.activationCodeInput.value = '';
        await updateCreditsDisplay(); // 更新积分显示
        log(`✅ 激活成功！获得 ${result.data.credits} 积分`);
      } catch (err) {
        ui.activateStatus.className = 'verify-status error';
        ui.activateStatus.textContent = `❌ ${err}`;
        ui.activateStatus.style.display = 'block';
      } finally {
        ui.activateBtn.disabled = false;
        ui.activateBtn.textContent = '激活';
      }
    });

    // 绑定验证码验证按钮
    ui.verifyBtn.addEventListener('click', async () => {
      const vcode = ui.verifyCodeInput.value.trim();
      if (!vcode || vcode.length !== 4) {
        ui.verifyStatus.className = 'verify-status error';
        ui.verifyStatus.textContent = '❌ 请输入4位验证码';
        ui.verifyStatus.style.display = 'block';
        return;
      }

      ui.verifyBtn.disabled = true;
      ui.verifyBtn.textContent = '验证中...';
      ui.verifyStatus.style.display = 'none';

      try {
        const result = await verifyCode(vcode);
        Store.setVerifyValidUntil(result.data.valid_until);
        ui.verifyStatus.className = 'verify-status success';
        ui.verifyStatus.textContent = `✅ 验证成功！有效期至 ${result.data.valid_until_str}`;
        ui.verifyStatus.style.display = 'block';
        ui.verifyCodeInput.value = '';
        ui.verifyCodeInput.disabled = true;
        log(`✅ 验证码验证成功！有效期至 ${result.data.valid_until_str}`);
      } catch (err) {
        ui.verifyStatus.className = 'verify-status error';
        ui.verifyStatus.textContent = `❌ ${err}`;
        ui.verifyStatus.style.display = 'block';
      } finally {
        ui.verifyBtn.disabled = false;
        ui.verifyBtn.textContent = '验证';
      }
    });

    // 支持回车键验证
    ui.verifyCodeInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        ui.verifyBtn.click();
      }
    });

    // ---- AI多模型 Provider 信息配置 ----
    AI_PROVIDERS = {
      zhipu: {
        name: '智谱GLM-4-Flash',
        model: 'glm-4-flash',
        url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        free: true,
        desc: '智谱AI免费模型，速度快，准确率较高',
        link: 'https://www.bigmodel.cn/invite?icode=upWK8Rq09RynLhZ8CwWAqf2gad6AKpjZefIo3dVEQyA%3D',
        linkText: '前往智谱AI开放平台注册/登录获取API Key →',
        keyHint: '进入控制台 → API Keys → 创建API Key → 复制'
      },
      deepseek: {
        name: 'DeepSeek-V3',
        model: 'deepseek-chat',
        url: 'https://api.deepseek.com/chat/completions',
        free: false,
        desc: 'DeepSeek高性价比模型，百万token仅需1元，答题准确率最高',
        link: 'https://platform.deepseek.com/',
        linkText: '前往DeepSeek开放平台注册/登录获取API Key →',
        keyHint: '登录后 → 左侧API Keys → 创建API Key → 复制'
      },
      deepseek_v4: {
        name: 'DeepSeek-V4-Pro',
        model: 'deepseek-v4-pro',
        url: 'https://api.deepseek.com/chat/completions',
        free: false,
        desc: 'DeepSeek最新旗舰模型(1.6T参数/1M上下文)，答题准确率显著高于V3，限时75折',
        link: 'https://platform.deepseek.com/',
        linkText: '前往DeepSeek开放平台注册/登录获取API Key →',
        keyHint: '登录后 → 左侧API Keys → 创建API Key → 复制（与V3共用同一Key）'
      },
      qwen: {
        name: '通义千问Qwen-Plus',
        model: 'qwen-plus',
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        free: false,
        desc: '阿里云通义千问，新用户有免费额度，知识面广',
        link: 'https://dashscope.console.aliyun.com/',
        linkText: '前往阿里云百炼平台注册/登录获取API Key →',
        keyHint: '登录后 → 右上角API-KEY → 创建API Key → 复制'
      },
      doubao: {
        name: '豆包Doubao-lite-32k',
        model: 'doubao-lite-32k',
        url: 'https://ark.cn-beijing.volces.com/api/v3/chat/completions',
        free: true,
        desc: '字节跳动豆包免费模型，速度极快',
        link: 'https://console.volcengine.com/ark/',
        linkText: '前往火山引擎Ark平台注册/登录获取API Key →',
        keyHint: '登录 → API Key管理 → 创建API Key → 复制（需先开通模型）'
      },
      spark: {
        name: '讯飞星火Spark Lite',
        model: 'spark-lite',
        url: 'https://spark-api-open.xf-yun.com/v1/chat/completions',
        free: true,
        desc: '科大讯飞星火免费模型，中文理解能力强',
        link: 'https://console.xfyun.cn/',
        linkText: '前往讯飞开放平台注册/登录获取API Key →',
        keyHint: '登录 → 控制台 → 星火大模型 → 创建应用 → 获取APIKey和APISecret'
      },
      kimi: {
        name: 'Kimi/Moonshot',
        model: 'moonshot-v1-8k',
        url: 'https://api.moonshot.cn/v1/chat/completions',
        free: false,
        desc: 'Moonshot Kimi模型，长文本理解能力强，新用户有免费额度',
        link: 'https://platform.moonshot.cn/',
        linkText: '前往Moonshot开放平台注册/登录获取API Key →',
        keyHint: '登录 → 左侧API Key管理 → 新建API Key → 复制'
      },
      gpt: {
        name: 'ChatGPT (GPT-4o-mini)',
        model: 'gpt-4o-mini',
        url: 'https://api.openai.com/v1/chat/completions',
        free: false,
        desc: 'OpenAI GPT-4o-mini，全球最流行AI，综合能力强，需科学上网',
        link: 'https://platform.openai.com/api-keys',
        linkText: '前往OpenAI平台注册/登录获取API Key →',
        keyHint: '登录 → API Keys → Create new secret key → 复制（需科学上网）'
      },
      gemini: {
        name: 'Google Gemini Flash',
        model: 'gemini-2.0-flash',
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        free: true,
        desc: 'Google Gemini 2.0 Flash免费模型，速度快，多语言能力强，需科学上网',
        link: 'https://aistudio.google.com/apikey',
        linkText: '前往Google AI Studio获取API Key →',
        keyHint: '登录Google账号 → 点击Get API Key → Create → 复制（需科学上网）'
      },
      groq: {
        name: 'Groq (Llama 3.3 70B)',
        model: 'llama-3.3-70b-versatile',
        url: 'https://api.groq.com/openai/v1/chat/completions',
        free: true,
        desc: 'Groq超快推理引擎，免费使用Llama 3.3 70B，速度全网最快，需科学上网',
        link: 'https://console.groq.com/keys',
        linkText: '前往Groq控制台注册/登录获取API Key →',
        keyHint: '登录 → API Keys → Create API Key → 复制（需科学上网）'
      },
      siliconflow: {
        name: '硅基流动 (Qwen3-8B)',
        model: 'Qwen/Qwen3-8B',
        url: 'https://api.siliconflow.cn/v1/chat/completions',
        free: true,
        desc: '硅基流动聚合平台，免费调用多种开源模型，国内直连无需科学上网',
        link: 'https://cloud.siliconflow.cn/',
        linkText: '前往硅基流动平台注册/登录获取API Key →',
        keyHint: '登录 → 左侧API密钥 → 创建API Key → 复制'
      },
      yi: {
        name: '零一万物 (Yi-Lightning)',
        model: 'yi-lightning',
        url: 'https://api.lingyiwanwu.com/v1/chat/completions',
        free: false,
        desc: '零一万物Yi系列模型，性价比高，中英文能力出色',
        link: 'https://platform.lingyiwanwu.com/',
        linkText: '前往零一万物开放平台注册/登录获取API Key →',
        keyHint: '登录 → API Key管理 → 创建API Key → 复制'
      },
      minimax: {
        name: 'MiniMax (abab6.5s)',
        model: 'abab6.5s-chat',
        url: 'https://api.minimax.chat/v1/text/chatcompletion_v2',
        free: false,
        desc: 'MiniMax大模型，新用户赠送免费额度，对话能力强',
        link: 'https://platform.minimaxi.com/',
        linkText: '前往MiniMax开放平台注册/登录获取API Key →',
        keyHint: '登录 → 接口密钥 → 创建新的密钥 → 复制'
      },
      stepfun: {
        name: '阶跃星辰 (Step-1-Flash)',
        model: 'step-1-flash',
        url: 'https://api.stepfun.com/v1/chat/completions',
        free: true,
        desc: '阶跃星辰免费模型，推理能力强，适合复杂题目',
        link: 'https://platform.stepfun.com/',
        linkText: '前往阶跃星辰开放平台注册/登录获取API Key →',
        keyHint: '登录 → API Key → 创建API Key → 复制'
      },
      baichuan: {
        name: '百川智能 (Baichuan4)',
        model: 'Baichuan4',
        url: 'https://api.baichuan-ai.com/v1/chat/completions',
        free: false,
        desc: '百川智能大模型，新用户赠送免费token，中文能力优秀',
        link: 'https://platform.baichuan-ai.com/',
        linkText: '前往百川智能开放平台注册/登录获取API Key →',
        keyHint: '登录 → API Keys → 创建API Key → 复制'
      }
    };

    // 更新AI Provider信息显示
    const updateAIProviderInfo = () => {
      const provider = ui.aiProviderSelect.value;
      const info = AI_PROVIDERS[provider];
      if (!info) return;
      const freeTag = info.free ? '<span style="background:#52c41a;color:white;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:4px;">免费</span>' : '<span style="background:#fa8c16;color:white;padding:2px 6px;border-radius:4px;font-size:11px;margin-left:4px;">低价</span>';
      ui.aiProviderInfo.innerHTML = `
        <div style="margin-bottom: 6px;">${info.desc} ${freeTag}</div>
        <a href="${info.link}" target="_blank" style="color: #4a90e2; text-decoration: none; font-weight: 600; display: inline-block; margin-bottom: 4px;">🔗 ${info.linkText}</a>
        <div style="font-size: 11px; color: #aaa;">💡 操作：${info.keyHint}</div>
      `;
    };

    // 更新AI解锁状态显示
    const updateAIUnlockStatus = () => {
      if (Store.isAIUnlocked()) {
        const until = Store.getAIUnlockUntil();
        const date = new Date(until * 1000);
        const dateStr = date.toLocaleString('zh-CN');
        ui.aiUnlockStatus.innerHTML = `<span style="color: #52c41a; font-weight: 600;">✅ 已解锁，有效期至 ${dateStr}（答题间隔≈1.5秒）</span>`;
        ui.aiUnlockCode.disabled = true;
        ui.aiUnlockBtn.disabled = true;
      } else {
        ui.aiUnlockStatus.innerHTML = `<span style="color: #fa8c16;">⏳ 未解锁，当前答题间隔35秒</span>`;
        ui.aiUnlockCode.disabled = false;
        ui.aiUnlockBtn.disabled = false;
      }
    };

    // AI Provider 切换事件
    ui.aiProviderSelect.addEventListener('change', () => {
      Store.setAIProvider(ui.aiProviderSelect.value);
      updateAIProviderInfo();
    });

    // AI 解锁按钮事件
    ui.aiUnlockBtn.addEventListener('click', async () => {
      const code = ui.aiUnlockCode.value.trim();
      if (!code || code.length !== 4) {
        ui.aiUnlockStatus.innerHTML = '<span style="color: #f5222d;">❌ 请输入4位解锁码</span>';
        return;
      }
      ui.aiUnlockBtn.disabled = true;
      ui.aiUnlockBtn.textContent = '验证中...';
      try {
        const result = await verifyCode(code);
        Store.setAIUnlockCode(code);
        Store.setAIUnlockUntil(result.data.valid_until);
        ui.aiUnlockCode.value = '';
        updateAIUnlockStatus();
        log(`🚀 AI限速已解锁！有效期至 ${result.data.valid_until_str}`);
      } catch (err) {
        ui.aiUnlockStatus.innerHTML = `<span style="color: #f5222d;">❌ ${err}</span>`;
      } finally {
        ui.aiUnlockBtn.disabled = false;
        ui.aiUnlockBtn.textContent = '解锁';
      }
    });

    // AI 解锁码回车支持
    ui.aiUnlockCode.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') ui.aiUnlockBtn.click();
    });

    // 检查验证码状态
    const checkVerifyStatus = () => {
      if (Store.isVerifyValid()) {
        const validUntil = Store.getVerifyValidUntil();
        const date = new Date(validUntil * 1000);
        const dateStr = date.toLocaleString('zh-CN');
        ui.verifyStatus.className = 'verify-status success';
        ui.verifyStatus.textContent = `✅ 已验证，有效期至 ${dateStr}`;
        ui.verifyCodeInput.disabled = true;
        ui.verifyBtn.disabled = true;
      } else {
        ui.verifyCodeInput.disabled = false;
        ui.verifyBtn.disabled = false;
        ui.verifyStatus.style.display = 'none';
      }
    };

    const loadAnswerMode = () => {
      const mode = Store.getAnswerMode();
      switchAnswerMode(mode);
      if (mode === 'free') {
        checkVerifyStatus();
      } else {
        updateCreditsDisplay(); // 付费模式加载时查询积分
      }
    };
    const loadActivationCode = () => {
      ui.activationCodeInput.value = Store.getActivationCode();
    };
    const loadFeatureConf = () => {
      const saved = Store.getFeatureConf();
      ui.featureAutoAI.checked = saved.autoAI;
      ui.featureAutoComment.checked = saved.autoComment;
      ui.featureSkipLive.checked = saved.skipLive;
      // 加载评论模式
      if (saved.autoComment) {
        ui.commentModeSection.style.display = 'block';
      } else {
        ui.commentModeSection.style.display = 'none';
      }
      const commentMode = saved.commentMode || 'copy';
      if (ui.commentModeCopy) ui.commentModeCopy.checked = (commentMode === 'copy');
      if (ui.commentModeAI) ui.commentModeAI.checked = (commentMode === 'ai');
      // 更新AI提示
      const aiHint = doc.getElementById('ai_comment_hint');
      if (aiHint) aiHint.style.display = (commentMode === 'ai') ? 'block' : 'none';
    };

    // 评论复选框切换 → 显示/隐藏回复方式选项
    ui.featureAutoComment.addEventListener('change', () => {
      ui.commentModeSection.style.display = ui.featureAutoComment.checked ? 'block' : 'none';
    });

    // 评论模式单选切换 → 显示/隐藏AI提示
    const commentModeRadios = doc.querySelectorAll('input[name="comment_mode"]');
    commentModeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        const aiHint = doc.getElementById('ai_comment_hint');
        if (aiHint) aiHint.style.display = (radio.value === 'ai' && radio.checked) ? 'block' : 'none';
      });
    });
    loadAnswerMode();
    loadActivationCode();
    loadFeatureConf();
    ui.btnSetting.onclick = () => {
      loadAnswerMode();
      loadActivationCode();
      loadFeatureConf();
      ui.playbackRate.value = String(Store.getPlaybackRate());
      if (ui.unmatchedFallback) ui.unmatchedFallback.value = Store.getUnmatchedFallback();
      ui.settings.style.display = 'block';
    };
    ui.closeSettings.onclick = () => {
      ui.settings.style.display = 'none';
    };
    ui.saveSettings.onclick = async () => {
      const mode = Store.getAnswerMode();

      // 保存兜底策略
      if (ui.unmatchedFallback) Store.setUnmatchedFallback(ui.unmatchedFallback.value);

      // 保存播放倍速
      const rate = parseFloat(ui.playbackRate.value) || 2;
      Store.setPlaybackRate(rate);

      // 保存功能配置（含评论模式）
      const commentMode = (ui.commentModeAI && ui.commentModeAI.checked) ? 'ai' : 'copy';
      const featureConf = {
        autoAI: ui.featureAutoAI.checked,
        autoComment: ui.featureAutoComment.checked,
        commentMode: commentMode,
        skipLive: ui.featureSkipLive.checked
      };
      Store.setFeatureConf(featureConf);

      // 保存AI API Key
      if (Store.getAnswerMode() === 'ai') {
        Store.setAIApiKey(ui.aiApiKeyInput.value.trim());
      }

      // 检查激活状态并给出提示
      if (featureConf.autoAI) {
        if (mode === 'paid') {
          try {
            const data = await queryCredits();
            if (data.remaining_credits <= 0) {
              log('⚠️ 积分不足，请先购买激活码充值');
            } else {
              log(`✅ 题库配置已保存 (付费模式，剩余 ${data.remaining_credits} 积分)`);
            }
          } catch (err) {
            log('⚠️ 题库配置已保存，但未检测到激活码，请先激活');
          }
        } else if (mode === 'ai') {
          if (!Store.getAIApiKey()) {
            log('⚠️ 题库配置已保存，但未填写AI API Key');
          } else {
            log('✅ 题库配置已保存 (AI答题模式)');
          }
        } else {
          // 免费模式
          if (!Store.isVerifyValid()) {
            log('⚠️ 题库配置已保存，但验证码未验证或已过期，请先验证');
          } else {
            log('✅ 题库配置已保存 (免费模式)');
          }
        }
      } else {
        log('✅ 题库配置已保存');
      }

      ui.settings.style.display = 'none';
    };

    ui.btnClear.onclick = () => {
      Store.removeProgress(window.parent.location.href);
      localStorage.removeItem(Config.storageKeys.proClassCount);
      log('已清除当前课程的刷课进度缓存');
    };

    // 获取公告
    try {
      GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://qsy.iano.cn/index.php?s=/admin/unified_manage/scriptannouncementapi',
        timeout: 5000,
        onload: function(resp) {
          try {
            var res = JSON.parse(resp.responseText);
            if (res.code === 1 && res.data && res.data.enabled) {
              var colors = { info: '#3b82f6', warning: '#f59e0b', error: '#ef4444', success: '#22c55e' };
              var bgColors = { info: '#eff6ff', warning: '#fffbeb', error: '#fef2f2', success: '#f0fdf4' };
              var color = colors[res.data.type] || '#3b82f6';
              var bgColor = bgColors[res.data.type] || '#eff6ff';
              var noticeEl = doc.createElement('div');
              noticeEl.style.cssText = 'margin:8px 0;padding:12px 14px;border-radius:10px;font-size:13px;line-height:1.7;border:2px solid '+color+';background:linear-gradient(135deg,'+bgColor+',white);color:#333;position:relative;box-shadow:0 2px 12px rgba(0,0,0,0.08);animation:noticeSlideIn 0.5s ease;';
              var styleTag = doc.createElement('style');
              styleTag.textContent = '@keyframes noticeSlideIn{from{opacity:0;transform:translateY(-10px);}to{opacity:1;transform:translateY(0);}} @keyframes noticePulse{0%,100%{transform:scale(1);}50%{transform:scale(1.15);}}';
              doc.head.appendChild(styleTag);
              noticeEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;"><div style="font-weight:700;font-size:14px;color:'+color+';display:flex;align-items:center;gap:6px;"><span style="animation:noticePulse 1.5s infinite;display:inline-block;">📢</span> '+(res.data.title||'公告')+'</div><span class="notice-close" style="cursor:pointer;font-size:18px;color:#999;line-height:1;padding:0 2px;">&times;</span></div><div style="font-size:13px;color:#444;">'+(res.data.content||'')+'</div>';
              noticeEl.querySelector('.notice-close').onclick = function(){ noticeEl.style.display='none'; };
              var infoEl = doc.getElementById('info');
              if (infoEl && infoEl.parentNode) {
                infoEl.parentNode.insertBefore(noticeEl, infoEl);
              }
            }
          } catch(e) {}
        }
      });
    } catch(e) {}

    // 后面赋值给panel
    return {
      ...ui,
      log,
      setStartHandler(fn) {
        ui.btnStart.onclick = () => {
          // 如果正在运行，点击停止
          if (isRunning) {
            stopRequested = true;
            log('⏸️ 正在停止...');
            ui.btnStart.innerText = '停止中...';
            ui.btnStart.disabled = true;
            return;
          }

          log('启动中...');
          isRunning = true;
          stopRequested = false;

          // 检查是否是考试页面
          const url = location.host;
          const path = location.pathname.split('/');
          if (url.includes('exam.yuketang.cn') || path.includes('exam') || path.includes('exercise') || path.includes('homework')) {
            ui.btnStart.innerText = '⏸️ 停止答题';
          } else {
            ui.btnStart.innerText = '⏸️ 停止刷课';
          }

          ui.btnStart.disabled = false;
          Store.setRunState('running');
          startMiniStatusUpdate(panel);
          fn && fn();
        };
      },
      resetStartButton(text = '开始刷课') {
        ui.btnStart.innerText = text;
        ui.btnStart.disabled = false;
        if (text.includes('刷完') || text.includes('完成')) {
          Store.setRunState('completed');
        } else if (text.includes('停止') || text.includes('继续')) {
          Store.setRunState('stopped');
        }
        isRunning = false;
        stopRequested = false;
      },
      updateMiniStatus(icon, text) {
        if (ui.miniIcon) ui.miniIcon.innerText = icon;
        if (ui.miniText) ui.miniText.innerText = text;
      }
    };
  }

  // ---- 播放器工具 ----
  const Player = {
    applySpeed() {
      const rate = Config.playbackRate;
      const speedBtn = document.querySelector('xt-speedlist xt-button') || document.getElementsByTagName('xt-speedlist')[0]?.firstElementChild?.firstElementChild;
      const speedWrap = document.getElementsByTagName('xt-speedbutton')[0];
      if (speedBtn && speedWrap) {
        speedBtn.setAttribute('data-speed', rate);
        speedBtn.setAttribute('keyt', `${rate}.00`);
        speedBtn.innerText = `${rate}.00X`;
        const mousemove = document.createEvent('MouseEvent');
        mousemove.initMouseEvent('mousemove', true, true, unsafeWindow, 0, 10, 10, 10, 10, 0, 0, 0, 0, 0, null);
        speedWrap.dispatchEvent(mousemove);
        speedBtn.click();
      } else if (document.querySelector('video')) {
        document.querySelector('video').playbackRate = rate;
      }
    },
    mute() {
      const muteBtn = document.querySelector('#video-box > div > xt-wrap > xt-controls > xt-inner > xt-volumebutton > xt-icon');
      if (muteBtn) muteBtn.click();
      const video = document.querySelector('video');
      if (video) video.volume = 0;
    },
    applyMediaDefault(media) {
      if (!media) return;
      media.volume = 0;
      media.playbackRate = Config.playbackRate;
      const p = media.play();
      if (p !== undefined) {
        p.catch(e => {
          if (e.name !== 'AbortError') console.warn('[雨课堂助手] applyMediaDefault play失败:', e);
          setTimeout(() => media.play().catch(() => {}), 1500);
        });
      }
    },
    observePause(video) {
      if (!video) return () => { };
      const target = document.getElementsByClassName('play-btn-tip')[0];
      if (!target) return () => { };
      let isPlayPending = false;
      // 安全播放：防止重叠的 play() 调用导致 AbortError
      const safePlay = (delay = 500) => {
        if (isPlayPending) return;
        isPlayPending = true;
        setTimeout(() => {
          if (video.paused) {
            const p = video.play();
            if (p !== undefined) {
              p.then(() => { isPlayPending = false; })
               .catch(e => {
                 isPlayPending = false;
                 if (e.name !== 'AbortError') {
                   console.warn('[雨课堂助手] 自动播放失败:', e);
                 }
                 setTimeout(() => safePlay(1500), 1500);
               });
            } else {
              isPlayPending = false;
            }
          } else {
            isPlayPending = false;
          }
        }, delay);
      };
      safePlay(1500);
      const observer = new MutationObserver(list => {
        for (const mutation of list) {
          if (mutation.type === 'childList' && target.innerText === '播放') {
            safePlay(800);
          }
        }
      });
      observer.observe(target, { childList: true });
      return () => observer.disconnect();
    },
    waitForEnd(media, timeout = 0) {
      return new Promise(resolve => {
        if (!media) return resolve();
        if (media.ended) return resolve();
        let timer;
        const onEnded = () => {
          clearTimeout(timer);
          resolve();
        };
        media.addEventListener('ended', onEnded, { once: true });
        if (timeout > 0) {
          timer = setTimeout(() => {
            media.removeEventListener('ended', onEnded);
            resolve();
          }, timeout);
        }
      });
    }
  };

  // ---- 防切屏 ----
  function preventScreenCheck() {
    const win = unsafeWindow;
    const blackList = new Set(['visibilitychange', 'blur', 'pagehide']);
    win._addEventListener = win.addEventListener;
    win.addEventListener = (...args) => blackList.has(args[0]) ? undefined : win._addEventListener(...args);
    document._addEventListener = document.addEventListener;
    document.addEventListener = (...args) => blackList.has(args[0]) ? undefined : document._addEventListener(...args);
    Object.defineProperties(document, {
      hidden: { value: false },
      visibilityState: { value: 'visible' },
      hasFocus: { value: () => true },
      onvisibilitychange: { get: () => undefined, set: () => { } },
      onblur: { get: () => undefined, set: () => { } }
    });
    Object.defineProperties(win, {
      onblur: { get: () => undefined, set: () => { } },
      onpagehide: { get: () => undefined, set: () => { } }
    });
  }

  // ---- 字体反混淆 ----
  let glyphHashMap = null; // SHA-1哈希 -> 原始Unicode码点
  let fontCharMap = null; // 混淆字符 -> 原始字符
  let glyphHashMapPromise = null; // 映射表加载Promise
  let deobfuscationPromise = null; // 反混淆进行中的Promise
  // FontFace 构造函数拦截：捕获 new FontFace(family, ArrayBuffer) 形式注入的字体
  // AI学习空间的混淆字体很可能从 JS 直接以 ArrayBuffer 注入而不走 @font-face / 网络请求
  const capturedFontBuffers = []; // [{ family, buffer }]

  function setupFontFaceHook() {
    try {
      const win = unsafeWindow;
      const OriginalFontFace = win.FontFace;
      if (!OriginalFontFace) { console.warn('[雨课堂助手] FontFace API 不可用'); return; }
      const HookedFontFace = new Proxy(OriginalFontFace, {
        construct(target, args) {
          try {
            const family = args[0];
            const source = args[1];
            if (source instanceof ArrayBuffer) {
              capturedFontBuffers.push({ family, buffer: source });
              console.log('[雨课堂助手] 🎯 拦截 FontFace(ArrayBuffer):', family, 'bytes:', source.byteLength);
            } else if (source && ArrayBuffer.isView(source)) {
              const sliced = source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength);
              capturedFontBuffers.push({ family, buffer: sliced });
              console.log('[雨课堂助手] 🎯 拦截 FontFace(TypedArray):', family, 'bytes:', source.byteLength);
            } else if (typeof source === 'string') {
              const m = source.match(/url\(["\']?([^"\')]+)["\']?\)/);
              if (m) console.log('[雨课堂助手] 🎯 拦截 FontFace(URL):', family, m[1]);
            }
          } catch (e) { console.warn('[雨课堂助手] FontFace hook 异常:', e); }
          return Reflect.construct(target, args, target);
        }
      });
      win.FontFace = HookedFontFace;
    } catch (e) {
      console.warn('[雨课堂助手] setupFontFaceHook 失败:', e);
    }
  }

  function loadGlyphHashMap() {
    glyphHashMapPromise = new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: 'https://qsy.iano.cn/original_glyph_to_uni_v2.json',
        onload: (res) => {
          try {
            glyphHashMap = JSON.parse(res.responseText);
            console.log('[雨课堂助手] 字形映射表加载成功, 共', Object.keys(glyphHashMap).length, '个字形');
            resolve(glyphHashMap);
          } catch (e) {
            console.error('[雨课堂助手] 解析字形映射表失败:', e);
            reject(e);
          }
        },
        onerror: (err) => {
          console.error('[雨课堂助手] 加载字形映射表失败:', err);
          reject(err);
        }
      });
    });
    return glyphHashMapPromise;
  }

  async function sha1Hex(str) {
    const data = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-1', data);
    return Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  async function buildFontCharMapFromBuffer(buffer, label) {
    if (!glyphHashMap) {
      console.warn('[雨课堂助手] 字形映射表未加载，跳过反混淆');
      return null;
    }
    try {
      const font = opentype.parse(buffer);
      const charMap = {};
      let matchCount = 0;
      let glyphsUsable = 0;
      for (let i = 0; i < font.glyphs.length; i++) {
        const glyph = font.glyphs.get(i);
        if (!glyph.unicode || !glyph.path || !glyph.path.commands || glyph.path.commands.length === 0) continue;
        glyphsUsable++;
        const pathStr = glyph.path.toPathData();
        if (!pathStr) continue;
        const hash = await sha1Hex(pathStr);
        const originalUnicode = glyphHashMap[hash];
        if (originalUnicode !== undefined && originalUnicode !== glyph.unicode) {
          charMap[String.fromCodePoint(glyph.unicode)] = String.fromCodePoint(originalUnicode);
          matchCount++;
        }
      }
      console.log('[雨课堂助手] 字体反混淆映射建立完成:', matchCount, '个字符需要还原 (总字形:', font.glyphs.length, '有unicode+path:', glyphsUsable, label || '', ')');
      if (matchCount > 0) fontCharMap = charMap;
      return charMap;
    } catch (e) {
      console.error('[雨课堂助手] 解析字体失败:', label, e);
      return null;
    }
  }

  async function buildFontCharMap(fontUrl) {
    if (!glyphHashMap) {
      console.warn('[雨课堂助手] 字形映射表未加载，跳过反混淆');
      return {};
    }
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: fontUrl,
        responseType: 'arraybuffer',
        onload: async (res) => {
          try {
            const charMap = await buildFontCharMapFromBuffer(res.response, 'URL: ' + fontUrl);
            if (charMap === null) { reject(new Error('font parse failed')); return; }
            resolve(charMap);
          } catch (e) {
            console.error('[雨课堂助手] 解析混淆字体失败:', e);
            reject(e);
          }
        },
        onerror: (err) => {
          console.error('[雨课堂助手] 下载混淆字体失败:', err);
          reject(err);
        }
      });
    });
  }

  // 对整段文本逐字替换（仅在拿不到 HTML 上下文时使用，例如已渲染后的 DOM innerText）
  function deobfuscateText(text) {
    if (!fontCharMap || !text) return text;
    return Array.from(text).map(ch => fontCharMap[ch] || ch).join('');
  }

  // 从页面 CSS 中发现可能的混淆字体 URL（AI学习空间等场景 JSON Hook 拿不到 fontUrl 时使用）
  function discoverEncryptedFontUrls() {
    const candidates = new Set();
    const isLikelyEncrypted = (text) => /encrypt(ed)?|xuetangx|yuketang|exam[_-]?data[_-]?decrypt|exam[_-]?font/i.test(text || '');

    // 优先扫描 styleSheets（拿到的是已解析后的 CSSRule，比较干净）
    for (const sheet of Array.from(document.styleSheets || [])) {
      let rules;
      try { rules = sheet.cssRules || sheet.rules; } catch (_) { continue; /* 跨域样式表无法读取 */ }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        // CSSRule.FONT_FACE_RULE === 5
        if (rule.type !== 5) continue;
        const family = (rule.style?.getPropertyValue?.('font-family') || '').replace(/['"]/g, '');
        const src = rule.style?.getPropertyValue?.('src') || '';
        if (!isLikelyEncrypted(family) && !isLikelyEncrypted(src)) continue;
        const re = /url\(["']?([^"')]+\.(?:woff2?|ttf|otf)[^"')]*)["']?\)/gi;
        let m;
        while ((m = re.exec(src)) !== null) candidates.add(m[1]);
      }
    }

    // 兜底：扫 <style> 文本（CORS 拦不到 styleSheets 时仍可读 textContent）
    for (const styleEl of Array.from(document.querySelectorAll('style'))) {
      const text = styleEl.textContent || '';
      const blockRe = /@font-face\s*\{([^}]+)\}/g;
      let block;
      while ((block = blockRe.exec(text)) !== null) {
        const body = block[1];
        if (!isLikelyEncrypted(body)) continue;
        const urlRe = /url\(["']?([^"')]+\.(?:woff2?|ttf|otf)[^"')]*)["']?\)/gi;
        let m;
        while ((m = urlRe.exec(body)) !== null) candidates.add(m[1]);
      }
    }

    return Array.from(candidates).map(url => {
      // 处理协议相对 URL（//xxx.com/...）
      if (/^\/\//.test(url)) return location.protocol + url;
      // 处理站内绝对路径
      if (/^\//.test(url)) return location.origin + url;
      return url;
    });
  }

  // 根据题目元素的 computed font-family 精准查找对应的 @font-face URL（最准）
  function findFontUrlsForElement(element) {
    if (!element) return [];
    try {
      const win = (element.ownerDocument && element.ownerDocument.defaultView) || window;
      const fontFamily = win.getComputedStyle(element).fontFamily || '';
      const families = fontFamily.split(',').map(f => f.trim().replace(/[\'\"]/g, '')).filter(Boolean);
      console.log('[雨课堂助手] 题目元素 computed font-family:', fontFamily, '解析为:', families);
      // 顺便列出 document.fonts 已加载的所有字体 family，方便诊断混淆字体名
      try {
        const loaded = [];
        if (document.fonts && document.fonts.forEach) {
          document.fonts.forEach(f => loaded.push(f.family + '(' + f.status + ')'));
        }
        console.log('[雨课堂助手] document.fonts 已加载字体:', loaded);
      } catch (_) {}
      if (!families.length) return [];
      const result = [];
      const ownerDoc = element.ownerDocument || document;
      for (const sheet of Array.from(ownerDoc.styleSheets || [])) {
        let rules;
        try { rules = sheet.cssRules || sheet.rules; } catch (_) { continue; }
        if (!rules) continue;
        for (const rule of Array.from(rules)) {
          if (rule.type !== 5) continue;
          const family = (rule.style?.getPropertyValue?.('font-family') || '').replace(/[\'\"]/g, '').trim();
          if (!families.includes(family)) continue;
          const src = rule.style?.getPropertyValue?.('src') || '';
          const re = /url\(["\']?([^"\')]+\.(?:woff2?|ttf|otf)[^"\')]*)["\']?\)/gi;
          let m;
          while ((m = re.exec(src)) !== null) result.push(m[1]);
        }
      }
      return result.map(u => /^\/\//.test(u) ? location.protocol + u : (/^\//.test(u) ? location.origin + u : u));
    } catch (_) { return []; }
  }

  // 用 Performance API 拿到所有真实加载过的字体（含 FontFace API 通过 URL 加载、不在 @font-face 里的）
  function discoverFontUrlsFromPerformance() {
    try {
      const entries = performance.getEntriesByType('resource') || [];
      return [...new Set(entries.map(e => e.name).filter(url => /\.(woff2?|ttf|otf)(?:[?#]|$)/i.test(url)))];
    } catch (_) { return []; }
  }

  // 确保 fontCharMap 已建立；AI学习空间等无 JSON Hook 命中时主动从 CSS 找字体 URL 建立
  let fontDiscoveryPromise = null;
  async function ensureFontCharMap(hintElement) {
    if (fontCharMap && Object.keys(fontCharMap).length > 0) return fontCharMap;
    if (deobfuscationPromise) {
      try { await deobfuscationPromise; } catch (_) { /* ignored */ }
      if (fontCharMap && Object.keys(fontCharMap).length > 0) return fontCharMap;
    }
    if (fontDiscoveryPromise) return fontDiscoveryPromise;
    fontDiscoveryPromise = (async () => {
      if (glyphHashMapPromise && !glyphHashMap) {
        try { await glyphHashMapPromise; } catch (_) { return null; }
      }
      if (!glyphHashMap) return null;
      // 等所有动态字体加载完，再开始查
      try { await document.fonts.ready; } catch (_) { /* ignore */ }

      // AI 学习空间题目渲染后才会动态注册混淆字体（如 exam-data-decrypt-font），
      // document.fonts.ready 一旦 resolve 后续注册的字体不会重置 promise，需要主动轮询
      const isEncryptedFontName = (name) => /encrypt(ed)?|xuetangx|yuketang|exam[_-]?data[_-]?decrypt|exam[_-]?font/i.test(name || '');
      const hasEncryptedFontRegistered = () => {
        try {
          if (capturedFontBuffers.some(b => isEncryptedFontName(b.family))) return true;
          if (!document.fonts || !document.fonts.forEach) return false;
          let found = false;
          document.fonts.forEach(f => { if (isEncryptedFontName(f.family)) found = true; });
          if (found) return true;
          const perfHit = (performance.getEntriesByType('resource') || [])
            .some(e => /\.(woff2?|ttf|otf)(?:[?#]|$)/i.test(e.name) && isEncryptedFontName(e.name));
          if (perfHit) return true;
          for (const sheet of Array.from(document.styleSheets || [])) {
            let rules; try { rules = sheet.cssRules || sheet.rules; } catch (_) { continue; }
            if (!rules) continue;
            for (const rule of Array.from(rules)) {
              if (rule.type !== 5) continue;
              const family = (rule.style?.getPropertyValue?.('font-family') || '').replace(/['"]/g, '');
              const src = rule.style?.getPropertyValue?.('src') || '';
              if (isEncryptedFontName(family) || isEncryptedFontName(src)) return true;
            }
          }
          return false;
        } catch (_) { return false; }
      };
      if (!hasEncryptedFontRegistered()) {
        console.log('[雨课堂助手] 暂未发现混淆字体（document.fonts 中无加密命名），等待页面动态加载…');
        for (let i = 0; i < 12; i++) { // 最多等 6 秒
          await new Promise(r => setTimeout(r, 500));
          if (hasEncryptedFontRegistered()) {
            console.log('[雨课堂助手] ✅ 检测到混淆字体已注册（轮询第 ' + (i + 1) + ' 次）');
            try { await document.fonts.ready; } catch (_) {}
            break;
          }
        }
      }

      // 0) FontFace hook 拦截到的 ArrayBuffer 字体（混淆字体最可能的形态）
      if (capturedFontBuffers.length > 0) {
        console.log('[雨课堂助手] FontFace hook 已拦截', capturedFontBuffers.length, '个 ArrayBuffer 字体，优先尝试');
        for (const { family, buffer } of capturedFontBuffers) {
          try {
            const charMap = await buildFontCharMapFromBuffer(buffer, 'family=' + family);
            if (charMap && Object.keys(charMap).length > 0) {
              console.log('[雨课堂助手] ✅ FontFace 拦截字体反混淆成功:', family, '映射条数:', Object.keys(charMap).length);
              return charMap;
            }
          } catch (e) {
            console.warn('[雨课堂助手] FontFace 拦截字体解析失败:', family, e?.message || e);
          }
        }
      }

      // 多源合并 URL 候选：
      //  1) 题目元素 computed font-family 对应的 @font-face URL（最精准）
      //  2) Performance API 拿到的实际加载字体（覆盖 FontFace API 通过 URL 加载的字体）
      //  3) CSS 全量扫描（最宽泛兜底）
      const targeted = findFontUrlsForElement(hintElement);
      const fromPerf = discoverFontUrlsFromPerformance();
      const fromCSS = discoverEncryptedFontUrls();
      const ordered = [...new Set([...targeted, ...fromPerf, ...fromCSS])];
      if (!ordered.length && capturedFontBuffers.length === 0) {
        console.warn('[雨课堂助手] 未发现任何字体（CSS/Perf API/FontFace hook 都为空）');
        return null;
      }
      if (!ordered.length) return null;
      console.log('[雨课堂助手] 字体候选源:', { targeted: targeted.length, performance: fromPerf.length, css: fromCSS.length, total: ordered.length });
      if (targeted.length) console.log('[雨课堂助手] 题目元素字体 URL（优先尝试）:', targeted);
      for (const url of ordered) {
        try {
          const charMap = await buildFontCharMap(url);
          if (charMap && Object.keys(charMap).length > 0) {
            console.log('[雨课堂助手] ✅ 已使用字体建立反混淆映射:', url, '映射条数:', Object.keys(charMap).length);
            return charMap;
          }
        } catch (e) {
          console.warn('[雨课堂助手] 字体下载/解析失败:', url, e?.message || e);
        }
      }
      console.warn('[雨课堂助手] ⚠️ 已尝试', ordered.length, '个字体均无匹配；可能字形哈希表过期或字体非雨课堂混淆字体。请把 .problem-body 元素的 computed font-family 截图发我。');
      return null;
    })();
    try { await fontDiscoveryPromise; } finally { fontDiscoveryPromise = null; }
    return fontCharMap;
  }

  // 仅对 <span class="xuetangx-com-encrypted-font">...</span> 内的字符做还原
  // 参考万能脚本 getEncryptString 的思路，避免整段替换误伤题干中与混淆字符
  // 重码的普通汉字（CJK 码点巧合时会出现）
  function deobfuscateHTML(html, charMap) {
    const map = charMap || fontCharMap;
    if (!map || !html) return html;
    return String(html).replace(
      /<span[^>]*class="[^"]*xuetangx-com-encrypted-font[^"]*"[^>]*>([\s\S]*?)<\/span>/g,
      (_, inner) => Array.from(inner).map(ch => map[ch] || ch).join('')
    );
  }

  // ---- JSON Hook：拦截雨课堂服务器返回的题目数据 ----
  let interceptedProblems = null; // 存储拦截到的题目数据

  function setupJSONParseHook() {
    const originalParse = JSON.parse;
    JSON.parse = function (...args) {
      const result = originalParse.call(this, ...args);
      try {
        if (result && result.data && result.data.problems && result.data.problems.length > 0) {
          const fontUrl = result.data.font;
          if (fontUrl) {
            deobfuscationPromise = (glyphHashMapPromise || Promise.resolve()).then(() => {
              if (!glyphHashMap) return null;
              return buildFontCharMap(fontUrl);
            }).then(charMap => {
              interceptedProblems = parseYktProblems(result.data.problems, charMap);
              console.log('[雨课堂助手] 拦截到题目数据(已反混淆):', interceptedProblems.length, '题');
            }).catch(err => {
              console.warn('[雨课堂助手] 字体反混淆失败，使用原始数据:', err);
              interceptedProblems = parseYktProblems(result.data.problems, null);
            });
          } else {
            interceptedProblems = parseYktProblems(result.data.problems, null);
            console.log('[雨课堂助手] 拦截到题目数据:', interceptedProblems.length, '题');
          }
        }
      } catch (e) {
        console.warn('[雨课堂助手] JSON Hook 解析异常:', e);
      }
      return result;
    };
  }

  // 解析雨课堂题目数据（参考官方脚本的 parseYkt）
  function parseYktProblems(problems, charMap) {
    // 仅对 <span class="xuetangx-com-encrypted-font"> 内字符反混淆，避免误伤普通汉字
    const deobfuscate = (text) => deobfuscateHTML(text, charMap);
    // 调试：打印第一道题的原始JSON结构
    if (problems.length > 0) {
      const first = problems[0];
      console.log('[雨课堂助手] 原始问题结构:', JSON.stringify({
        hasBody: !!first.Body,
        hasContentBody: !!(first.content && first.content.Body),
        bodyPreview: first.Body ? String(first.Body).substring(0, 80) : null,
        contentBodyPreview: first.content && first.content.Body ? String(first.content.Body).substring(0, 80) : null,
        hasTypeText: !!first.TypeText,
        hasContentTypeText: !!(first.content && first.content.TypeText),
        typeText: first.TypeText || (first.content && first.content.TypeText) || '',
        hasOptions: !!first.Options,
        hasContentOptions: !!(first.content && first.content.Options),
        optionsCount: (first.Options || (first.content && first.content.Options) || []).length,
        problemId: first.problem_id
      }));
    }
    return problems.map(item => {
      // 与万能脚本对齐：优先使用 item.Body（考试格式），
      // 仅在不存在时回退到 item.content.Body（作业格式）
      const body = item.Body || (item.content ? item.content.Body : '') || '';
      const typeText = item.TypeText || (item.content ? item.content.TypeText : '') || '';
      const type = getQuestionType(typeText);
      const question = formatString(deobfuscate(body));

      const optionsData = item.Options || (item.content ? item.content.Options : null);
      let options = [];
      if (type <= 1 && optionsData && optionsData.length > 0) {
        options = optionsData
          .slice()
          .sort((a, b) => (a.key || '').charCodeAt(0) - (b.key || '').charCodeAt(0))
          .map(opt => {
            let val = formatString(deobfuscate(opt.value || ''));
            // 去掉选项值前面的字母前缀（如 "A xxx" → "xxx"），与万能脚本一致
            return typeof val === 'string' ? val.replace(/^[A-G]\s/, '') : val;
          });
      } else if (type === 3) {
        // 判断题
        options = ['正确', '错误'];
      }

      // 提取已有答案（如果有的话，用于结果页面）
      let answer = [];
      const answerData = item.Answer || (item.content ? item.content.Answer : null);
      if (answerData) {
        if (Array.isArray(answerData)) {
          answer = answerData;
        } else if (typeof answerData === 'string') {
          answer = answerData.split('');
        }
      }
      // 处理用户已答的答案
      if (item.user && item.user.is_show_answer && item.user.answer) {
        if (type === 3) {
          answer = item.user.answer.map(a => a.replace('true', '正确').replace('false', '错误'));
        } else {
          answer = item.user.answer;
        }
      }

      return {
        qid: item.problem_id || '',
        question,
        options,
        type,
        answer
      };
    }).filter(i => i.question);
  }

  // 题目类型映射（参考官方脚本）
  function getQuestionType(str) {
    if (!str) return 4;
    str = str.trim().replace(/\s+/g, '');
    const TYPE = {
      '单选题': 0, '单选': 0, '单项选择题': 0, '单项选择': 0,
      '多选题': 1, '多选': 1, '多项选择题': 1, '多项选择': 1, '案例分析': 1,
      '填空题': 2, '填空': 2,
      '判断题': 3, '判断': 3, '对错题': 3, '判断正误': 3,
      '问答题': 4, '简答题': 4, '主观题': 4, '其它': 4
    };
    if (TYPE[str] !== undefined) return TYPE[str];
    for (const key of Object.keys(TYPE)) {
      if (str.includes(key)) return TYPE[key];
    }
    return 4;
  }

  // 格式化字符串（参考官方脚本的 formatString）
  function formatString(src) {
    if (!src) return '';
    src = String(src);
    // 去除所有HTML标签，提取纯文本（含img的图片题也提取文字部分用于匹配）
    const temp = document.createElement('div');
    temp.innerHTML = src;
    src = temp.innerText || temp.textContent || '';
    // 全角转半角
    src = src.replace(/[\uff01-\uff5e]/g, ch =>
      String.fromCharCode(ch.charCodeAt(0) - 65248)
    );
    return src.replace(/\s+/g, ' ')
      .replace(/[""]/g, '"')
      .replace(/['']/g, "'")
      .replace(/。/g, '.')
      .replace(/[,.?:!;]$/, '')
      .trim();
  }

  // 字符串相似度计算（编辑距离，参考官方脚本）
  function stringSimilarity(s, t) {
    if (!s || !t) return 0;
    if (s === t) return 100;
    const l = Math.max(s.length, t.length);
    const n = s.length, m = t.length;
    const d = [];
    for (let i = 0; i <= n; i++) { d[i] = []; d[i][0] = i; }
    for (let j = 0; j <= m; j++) { d[0][j] = j; }
    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = s.charAt(i - 1) === t.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      }
    }
    return (1 - d[n][m] / l) * 100;
  }

  // ---- OCR & 题库API ----
  const Solver = {
    isAiWorkspaceExercisePage() {
      // 长江雨课堂等 AI 学习空间路径，含 /ai-workspace/ 即可（兼容 lms-graph、exercise 等子路由）
      return /yuketang\.cn$/i.test(location.hostname) &&
        location.pathname.includes('/ai-workspace/');
    },

    isStructurallyVisible(el) {
      if (!el || !el.getBoundingClientRect) return false;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(el);
      return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0';
    },

    isVisibleElement(el) {
      if (!this.isStructurallyVisible(el)) return false;
      const rect = el.getBoundingClientRect();
      if (rect.bottom < 0 || rect.right < 0 || rect.top > window.innerHeight || rect.left > window.innerWidth) return false;
      return true;
    },

    getAiWorkspaceLines(element) {
      if (!element) return [];
      const pseudoParts = [];
      const pseudoTargets = [element, ...Array.from(element.querySelectorAll?.('.item-type') || [])];
      const ownerWindow = (element.ownerDocument && element.ownerDocument.defaultView) || window;
      for (const target of pseudoTargets) {
        if (!target || !this.isStructurallyVisible(target)) continue;
        for (const pseudo of ['::before', '::after']) {
          const content = ownerWindow.getComputedStyle(target, pseudo).content;
          if (!content || content === 'none' || content === 'normal') continue;
          const text = content.replace(/^["']|["']$/g, '').replace(/\\A/g, '\n').trim();
          if (text) pseudoParts.push(text);
        }
      }
      const raw = deobfuscateText([...pseudoParts, element.innerText || element.textContent || ''].join('\n'));
      return raw.split(/\n+/)
        .map(line => formatString(line).replace(/\s+/g, ' ').trim())
        .filter(Boolean);
    },

    isAiWorkspaceNoiseLine(line) {
      return /^(展开|收起|上一题|下一题|提交|确认|取消|已完成|未完成|知识点|作业)$/.test(line) ||
        /^\d+$/.test(line) ||
        /^完成度/.test(line) ||
        /^搜索/.test(line);
    },

    cleanAiWorkspaceOptionText(text) {
      return formatString(deobfuscateText(String(text || '')))
        .replace(/\s+/g, ' ')
        .replace(/^([A-Ga-g])\s*[.、．:：)）]?\s*/, '')
        .trim();
    },

    parseAiWorkspaceOptionsFromLines(lines) {
      const options = [];
      const typePattern = /^\s*(?:(?:第?\s*\d+\s*题?|\d+\s*[\/／]\s*\d+)\s*[.、．]?\s*)?[【\[\(（]?(单选题|多选题|判断题|填空题|单项选择题|多项选择题|不定项选择题)[】\]\)）]?/;
      const optionPattern = /^([A-G])(?:\s*[.、．:：)）]|\s+)(.+)$/;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (this.isAiWorkspaceNoiseLine(line) || typePattern.test(line)) continue;
        const inline = line.match(optionPattern);
        if (inline) {
          const text = this.cleanAiWorkspaceOptionText(inline[2]);
          if (text) options.push(text);
          continue;
        }
        if (/^[A-G]$/.test(line)) {
          const parts = [];
          let j = i + 1;
          for (; j < lines.length; j++) {
            const next = lines[j];
            if (/^[A-G]$/.test(next) || optionPattern.test(next) || typePattern.test(next) || this.isAiWorkspaceNoiseLine(next)) break;
            parts.push(next);
          }
          const text = this.cleanAiWorkspaceOptionText(parts.join(' '));
          if (text) options.push(text);
          i = j - 1;
        }
      }
      return [...new Set(options)];
    },

    extractAiWorkspaceOptionsFromLines(lines) {
      const parsed = this.parseAiWorkspaceOptionsFromLines(lines);
      if (parsed.length >= 2) return parsed;
      const typePattern = /^\s*(?:(?:第?\s*\d+\s*题?|\d+\s*[\/／]\s*\d+)\s*[.、．]?\s*)?[【\[\(（]?(单选题|多选题|判断题|填空题|单项选择题|多项选择题|不定项选择题)[】\]\)）]?/;
      const filtered = lines.filter(line => !this.isAiWorkspaceNoiseLine(line));
      const typeIndex = filtered.findIndex(line => typePattern.test(line));
      if (typeIndex < 0) return parsed;
      const afterType = filtered.slice(typeIndex + 1).filter(line => !typePattern.test(line));
      if (afterType.length < 3) return parsed;
      let questionEndIndex = afterType.findIndex(line => /[?？]|\(\)|（）|[：:]$/.test(line));
      if (questionEndIndex < 0) questionEndIndex = 0;
      const options = afterType.slice(questionEndIndex + 1)
        .map(line => this.cleanAiWorkspaceOptionText(line))
        .filter(line => line && line.length <= 200)
        .slice(0, 7);
      return options.length >= 2 ? [...new Set(options)] : parsed;
    },

    findAiWorkspaceOptionNodes(element) {
      const root = element || this.findAiWorkspaceQuestionArea(document);
      if (!root) return [];
      const addUnique = (arr, node) => {
        if (!node || arr.some(item => item === node)) return;
        arr.push(node);
      };
      const nodes = [];
      const preciseNodes = Array.from(root.querySelectorAll('ul.list-unstyled-radio > li, ul.list-unstyled-checkbox > li, .list-unstyled-radio li, .list-unstyled-checkbox li, label.homeworkElRadio, label.homeworkElCheckbox'));
      for (const node of preciseNodes) {
        if (!this.isVisibleElement(node)) continue;
        const label = node.querySelector?.('.el-radio__label, .el-checkbox__label') || node;
        const text = this.cleanAiWorkspaceOptionText(label.innerText || label.textContent || '');
        if (text && text.length <= 300) addUnique(nodes, node);
      }
      if (nodes.length >= 2) return nodes;

      const candidates = Array.from(root.querySelectorAll('label,[role="radio"],[role="checkbox"],.ant-radio-wrapper,.ant-checkbox-wrapper,.el-radio,.el-checkbox,[class*="option"],[class*="Option"],[class*="answer"],[class*="Answer"]'));

      for (const node of candidates) {
        if (!this.isVisibleElement(node)) continue;
        const text = (node.innerText || node.textContent || '').trim();
        if (!text || text.length > 300) continue;
        const parsed = this.parseAiWorkspaceOptionsFromLines(this.getAiWorkspaceLines(node));
        if (parsed.length === 1) addUnique(nodes, node);
      }
      if (nodes.length >= 2) return nodes;

      const letterNodes = Array.from(root.querySelectorAll('span,div,b,i')).filter(node => {
        const text = (node.innerText || node.textContent || '').trim();
        return this.isVisibleElement(node) && /^[A-G]$/.test(text);
      });

      for (const letterNode of letterNodes) {
        let cur = letterNode;
        let selected = null;
        for (let depth = 0; cur && cur !== root.parentElement && depth < 6; depth++, cur = cur.parentElement) {
          const text = (cur.innerText || cur.textContent || '').trim();
          if (!text || text.length > 300) continue;
          const parsed = this.parseAiWorkspaceOptionsFromLines(this.getAiWorkspaceLines(cur));
          if (parsed.length === 1) {
            selected = cur;
            break;
          }
        }
        addUnique(nodes, selected || letterNode);
      }
      if (nodes.length >= 2) return nodes;

      const fallbackOptions = this.extractAiWorkspaceOptionsFromLines(this.getAiWorkspaceLines(root));
      if (fallbackOptions.length >= 2) {
        const descendants = Array.from(root.querySelectorAll('label,div,span,p,li,button,[role="radio"],[role="checkbox"]'));
        for (const opt of fallbackOptions) {
          const optText = this.cleanAiWorkspaceOptionText(opt);
          const matches = descendants.filter(node => {
            if (!this.isVisibleElement(node)) return false;
            const text = this.cleanAiWorkspaceOptionText(node.innerText || node.textContent || '');
            if (!text || text.length > 300) return false;
            return text === optText || text.includes(optText);
          }).sort((a, b) => {
            const ar = a.getBoundingClientRect();
            const br = b.getBoundingClientRect();
            return (ar.width * ar.height) - (br.width * br.height);
          });
          if (matches[0]) addUnique(nodes, matches[0]);
        }
      }
      return nodes;
    },

    extractAiWorkspaceOptions(element) {
      const nodes = this.findAiWorkspaceOptionNodes(element);
      const fromNodes = nodes.map(node => {
        const parsed = this.extractAiWorkspaceOptionsFromLines(this.getAiWorkspaceLines(node));
        return parsed[0] || this.cleanAiWorkspaceOptionText(node.innerText || node.textContent || '');
      }).filter(Boolean);
      if (fromNodes.length >= 2) return [...new Set(fromNodes)];
      return this.extractAiWorkspaceOptionsFromLines(this.getAiWorkspaceLines(element));
    },

    readAiWorkspaceStructuredFromDOM(element) {
      const root = element || this.findAiWorkspaceQuestionArea(document);
      if (!root) return null;
      const subject = root.matches?.('.subject-item') ? root : (root.closest?.('.subject-item') || root.querySelector?.('.subject-item') || root);
      const problemBody = subject.querySelector?.('.problem-body') || root.querySelector?.('.problem-body');
      if (!problemBody || !this.isStructurallyVisible(problemBody)) return null;
      const question = this.getAiWorkspaceLines(problemBody)
        .filter(line => !/^[（(]\s*\d+(?:\.\d+)?\s*分\s*[)）]$/.test(line))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      const optionSelector = 'ul.list-unstyled-radio > li, ul.list-unstyled-checkbox > li, .list-unstyled-radio li, .list-unstyled-checkbox li';
      let optionNodes = Array.from(subject.querySelectorAll?.(optionSelector) || []).filter(node => this.isStructurallyVisible(node));
      if (optionNodes.length < 2) {
        optionNodes = Array.from(subject.querySelectorAll?.('label.el-radio, label.el-checkbox, .homeworkElRadio, .homeworkElCheckbox') || []).filter(node => this.isStructurallyVisible(node));
      }
      const options = optionNodes.map(node => {
        const label = node.querySelector?.('.el-radio__label, .el-checkbox__label') || node;
        return this.cleanAiWorkspaceOptionText(label.innerText || label.textContent || '');
      }).filter(Boolean);
      // 题型识别优先看选项 DOM 元素类型（最可靠）：
      //   ul.list-unstyled-checkbox / label.el-checkbox / .homeworkElCheckbox → 多选题
      //   ul.list-unstyled-radio    / label.el-radio    / .homeworkElRadio    → 单选题
      // 万一选项 DOM 不是这两类（如填空/判断），再回退用 .item-type 的文字内容
      const checkboxCount = (subject.querySelectorAll?.('ul.list-unstyled-checkbox > li, label.el-checkbox, label.homeworkElCheckbox') || []).length;
      const radioCount = (subject.querySelectorAll?.('ul.list-unstyled-radio > li, label.el-radio, label.homeworkElRadio') || []).length;
      let type;
      if (checkboxCount > 0 && checkboxCount >= radioCount) {
        type = 1; // 多选题
      } else if (radioCount > 0) {
        type = 0; // 单选题
      } else {
        const typeText = this.getAiWorkspaceLines(subject.querySelector?.('.item-type') || subject).join(' ');
        type = getQuestionType(typeText);
        if (type === 4) {
          if (/多选|多项选择/.test(typeText)) type = 1;
          else if (/判断|对错/.test(typeText)) type = 3;
          else if (options.length >= 2) type = 0;
        }
      }
      if (question.length > 3 && options.length >= 2) {
        return { question, options: [...new Set(options)], type };
      }
      return null;
    },

    collectAiWorkspaceRoots(root = document) {
      const roots = [];
      const push = (r) => {
        if (r && !roots.includes(r)) roots.push(r);
      };
      push(root);
      // 同源 iframe 兜底（AI学习空间题目可能渲染在 iframe 中）
      const frames = root === document ? Array.from(document.querySelectorAll('iframe')) : [];
      for (const frame of frames) {
        try {
          const doc = frame.contentDocument;
          if (doc && doc.body) push(doc);
        } catch (_) { /* 跨域 iframe 忽略 */ }
      }
      return roots;
    },

    findAiWorkspaceQuestionArea(root = document) {
      if (!this.isAiWorkspaceExercisePage()) return null;
      const typePattern = /^\s*(?:(?:第?\s*\d+\s*题?|\d+\s*[\/／]\s*\d+)\s*[.、．]?\s*)?[【\[\(（]?(单选题|多选题|判断题|填空题|单项选择题|多项选择题|不定项选择题)[】\]\)）]?/;
      const optionLikeLine = (line) => {
        if (!line || this.isAiWorkspaceNoiseLine(line) || typePattern.test(line)) return false;
        if (/^[A-G]$/.test(line)) return false;
        if (/^[A-G](?:\s*[.、．:：)）]|\s+).+/.test(line)) return true;
        return line.length >= 2 && line.length <= 120;
      };

      const searchRoots = this.collectAiWorkspaceRoots(root);
      const debugStats = { subjectItems: 0, problemBodies: 0, optionGroups: 0, iframes: searchRoots.length - 1 };
      for (const r of searchRoots) {
        debugStats.subjectItems += r.querySelectorAll('.subject-item, .item-body').length;
        debugStats.problemBodies += r.querySelectorAll('.problem-body').length;
        debugStats.optionGroups += r.querySelectorAll('ul.list-unstyled-radio, ul.list-unstyled-checkbox, label.homeworkElRadio, label.homeworkElCheckbox').length;
      }

      for (const r of searchRoots) {
        const subjectCandidates = Array.from(r.querySelectorAll('.subject-item, .item-body')).map(el => el.closest('.subject-item') || el);
        for (const subject of [...new Set(subjectCandidates)]) {
          if (!this.isStructurallyVisible(subject)) continue;
          const problemBody = subject.querySelector('.problem-body');
          if (!problemBody || !this.isStructurallyVisible(problemBody)) continue;
          const questionText = this.getAiWorkspaceLines(problemBody).join(' ').trim();
          const optionNodes = subject.querySelectorAll('label.el-radio, label.el-checkbox, .homeworkElRadio, .homeworkElCheckbox, .list-unstyled-radio li, .list-unstyled-checkbox li');
          if (questionText.length > 3 && optionNodes.length >= 2) return subject;
        }
      }
      console.log('[雨课堂助手] AI学习空间未命中.subject-item，DOM统计:', debugStats, 'pathname:', location.pathname);

      for (const r of searchRoots) {
        const nodes = Array.from(r.querySelectorAll('div,section,article,main,form,p,span,h1,h2,h3,h4')).filter(el => {
          if (!this.isStructurallyVisible(el)) return false;
          const lines = this.getAiWorkspaceLines(el);
          return lines.some(line => typePattern.test(line));
        });
        for (const node of nodes) {
          let cur = node;
          const stopAt = (r.body || r);
          for (let depth = 0; cur && cur !== stopAt && depth < 10; depth++, cur = cur.parentElement) {
            if (!this.isStructurallyVisible(cur)) continue;
            const rect = cur.getBoundingClientRect();
            const lines = this.getAiWorkspaceLines(cur);
            if (rect.width < 260 || rect.height < 100 || lines.length > 120) continue;
            if (!lines.some(line => typePattern.test(line))) continue;
            if (this.extractAiWorkspaceOptionsFromLines(lines).length >= 2) return cur;
            if (lines.length >= 2 && rect.width >= 500 && rect.height >= 180) return cur;
          }
        }
      }
      for (const r of searchRoots) {
        const fallback = Array.from(r.querySelectorAll('div,section,main,article')).filter(el => {
          if (!this.isStructurallyVisible(el)) return false;
          const rect = el.getBoundingClientRect();
          if (rect.width < 500 || rect.height < 180 || rect.height > window.innerHeight * 1.5) return false;
          const lines = this.getAiWorkspaceLines(el);
          if (lines.length < 3 || lines.length > 80) return false;
          const optionLikeCount = lines.filter(optionLikeLine).length;
          return lines.some(line => typePattern.test(line)) &&
            (this.extractAiWorkspaceOptionsFromLines(lines).length >= 2 || lines.some(line => /[?？]|\(\)|（）/.test(line)) || optionLikeCount >= 3);
        }).sort((a, b) => {
          const ar = a.getBoundingClientRect();
          const br = b.getBoundingClientRect();
          return (ar.width * ar.height) - (br.width * br.height);
        });
        if (fallback[0]) return fallback[0];
      }

      return null;
    },

    readAiWorkspaceFromDOM(element) {
      const root = element || this.findAiWorkspaceQuestionArea(document);
      if (!root) return { question: '', options: [], type: 4 };
      const structured = this.readAiWorkspaceStructuredFromDOM(root);
      if (structured) {
        console.log('[雨课堂助手] AI学习空间结构化DOM解析:', structured);
        return structured;
      }
      const lines = this.getAiWorkspaceLines(root);
      const typePattern = /^\s*(?:(?:第?\s*\d+\s*题?|\d+\s*[\/／]\s*\d+)\s*[.、．]?\s*)?[【\[\(（]?(单选题|多选题|判断题|填空题|单项选择题|多项选择题|不定项选择题)[】\]\)）]?\s*(?:[（(]\s*\d+(?:\.\d+)?\s*分\s*[)）])?\s*(.*)$/;
      const optionPattern = /^([A-G])(?:\s*[.、．:：)）]|\s+)(.+)$/;
      const options = this.extractAiWorkspaceOptions(root);
      const questionLines = [];
      let type = 4;
      let seenType = false;
      let seenOption = false;
      for (const line of lines) {
        if (this.isAiWorkspaceNoiseLine(line)) continue;
        const typeMatch = line.match(typePattern);
        if (typeMatch) {
          type = getQuestionType(typeMatch[1]);
          seenType = true;
          const rest = typeMatch[2].replace(/[（(]\s*\d+(\.\d+)?\s*分\s*[)）]/g, '').trim();
          if (rest) questionLines.push(rest);
          continue;
        }
        if (/^[A-G]$/.test(line) || optionPattern.test(line)) {
          seenOption = true;
          continue;
        }
        if (seenType && !seenOption) questionLines.push(line);
      }
      let question = questionLines.join(' ').replace(/\s+/g, ' ').trim();
      if (options.length >= 2 && !lines.some(line => /^[A-G]$/.test(line) || optionPattern.test(line))) {
        const filtered = lines.filter(line => !this.isAiWorkspaceNoiseLine(line));
        const typeIndex = filtered.findIndex(line => typePattern.test(line));
        if (typeIndex >= 0) {
          const typeMatch = filtered[typeIndex].match(typePattern);
          const questionParts = [];
          const rest = (typeMatch?.[2] || '').replace(/[（(]\s*\d+(\.\d+)?\s*分\s*[)）]/g, '').trim();
          if (rest) questionParts.push(rest);
          const afterType = filtered.slice(typeIndex + 1).filter(line => !typePattern.test(line));
          let questionEndIndex = afterType.findIndex(line => /[?？]|\(\)|（）|[：:]$/.test(line));
          if (questionEndIndex < 0) {
            questionEndIndex = Math.max(0, afterType.length - options.length - 1);
          }
          questionParts.push(...afterType.slice(0, questionEndIndex + 1));
          const fallbackQuestion = questionParts.join(' ').replace(/\s+/g, ' ').trim();
          if (fallbackQuestion.length > 3) question = fallbackQuestion;
        }
      }
      if (!question && options.length >= 2) {
        const firstOptionIndex = lines.findIndex(line => /^[A-G]$/.test(line) || optionPattern.test(line));
        const head = firstOptionIndex > 0 ? lines.slice(0, firstOptionIndex) : lines;
        question = head.filter(line => !this.isAiWorkspaceNoiseLine(line) && !typePattern.test(line)).pop() || '';
      }
      if (type === 4) {
        const joined = lines.join(' ');
        if (/多选|多项选择/.test(joined)) type = 1;
        else if (/判断|对错/.test(joined)) type = 3;
        else if (options.length >= 2) type = 0;
      }
      console.log('[雨课堂助手] AI学习空间DOM解析:', { question, options, type, lines });
      return { question, options, type };
    },

    // 直接从DOM读取题目（不再依赖OCR截图）
    readFromDOM(element) {
      if (!element) return { question: '', options: [], type: 4 };

      if (this.isAiWorkspaceExercisePage()) {
        const aiResult = this.readAiWorkspaceFromDOM(element);
        if (aiResult.question && aiResult.question.length > 3) return aiResult;
      }

      // 读取题目文本 - 使用官方脚本的选择器
      let questionText = '';
      const questionEl = element.querySelector('h4') ||
        element.querySelector('.problem-body') ||
        element.querySelector('span:first-child');
      if (questionEl) {
        questionText = formatString(deobfuscateText(questionEl.innerText || questionEl.textContent || ''));
      }
      if (!questionText) {
        questionText = formatString(deobfuscateText(element.innerText || element.textContent || ''));
      }
      // 清理题号和分数
      questionText = questionText
        .replace(/^\d+[、.]\s*/, '')
        .replace(/[(（](\d+(\.\d+)?分)[)）]$/, '')
        .trim();

      // 读取选项
      let options = [];
      const optionContainer = element.querySelector('ul');
      if (optionContainer) {
        const optionEls = optionContainer.querySelectorAll('li');
        options = Array.from(optionEls).map(li => {
          const text = formatString(deobfuscateText(li.innerText || li.textContent || ''));
          return text.replace(/^[A-Ga-g][.、]\s*/, '').trim();
        }).filter(t => t);
      }

      // 判断题目类型
      const typeEl = element.querySelector('.item-type') ||
        element.closest('.subject-item')?.querySelector('.item-type');
      let type = 4;
      if (typeEl) {
        type = getQuestionType(typeEl.innerText || typeEl.textContent || '');
      } else if (options.length === 2) {
        // 两个选项大概率是判断题
        const joined = options.join(',').toLowerCase();
        if (joined.includes('正确') || joined.includes('错误') ||
          joined.includes('对') || joined.includes('错') ||
          joined.includes('true') || joined.includes('false')) {
          type = 3;
        }
      } else if (options.length >= 3) {
        type = 0; // 默认单选
      }

      return { question: questionText, options, type };
    },

    // 从拦截的数据中查找匹配的题目
    findInterceptedQuestion(index) {
      if (!interceptedProblems || !interceptedProblems.length) return null;
      if (index >= 0 && index < interceptedProblems.length) {
        return interceptedProblems[index];
      }
      return null;
    },

    // 综合识别：优先用拦截数据，其次DOM读取，最后OCR
    async recognize(element, questionIndex) {
      // 等待字体反混淆完成
      if (deobfuscationPromise) {
        try { await deobfuscationPromise; } catch (e) { /* already handled */ }
        deobfuscationPromise = null;
      }

      // AI学习空间不会触发 JSON Hook（API 不返回 fontUrl），主动从 CSS 发现字体并建立映射
      if (this.isAiWorkspaceExercisePage() && (!fontCharMap || Object.keys(fontCharMap).length === 0)) {
        try {
          // 优先用 .xuetangx-com-encrypted-font 这个混淆字符所在的 span 当 hint，
          // 它的 computed font-family 第一项就是真正的混淆字体名（如 exam-data-decrypt-font），
          // 否则会拿到 .problem-body 的普通系统字体栈（Avenir, Helvetica, ... sans-serif）匹配不到 @font-face
          const hint = element?.querySelector?.('.xuetangx-com-encrypted-font')
                    || element?.querySelector?.('.problem-body')
                    || element;
          await ensureFontCharMap(hint);
        } catch (e) { console.warn('[雨课堂助手] ensureFontCharMap 失败:', e); }
      }

      // 方式1：从拦截的JSON数据中获取（最准确）
      const intercepted = this.findInterceptedQuestion(questionIndex);
      if (intercepted && intercepted.question && intercepted.question.length > 3) {
        panel.log(`📋 从服务器数据获取题目 (第${questionIndex + 1}题)`);
        return intercepted;
      }

      // 方式2：直接从DOM读取文本（快速，不需要OCR）
      // 但若 AI学习空间页面包含 .xuetangx-com-encrypted-font 且 charMap 不可用，
      // DOM 读到的是混淆字符串，必须跳过 DOM 直接走 OCR（页面渲染时会用混淆字体，截图后 OCR 即得正文）
      const hasEncryptedSpans = !!(element && element.querySelector && element.querySelector('.xuetangx-com-encrypted-font'));
      const charMapUsable = fontCharMap && Object.keys(fontCharMap).length > 0;
      const skipDomForEncryption = this.isAiWorkspaceExercisePage() && hasEncryptedSpans && !charMapUsable;
      if (skipDomForEncryption) {
        panel.log('⚠️ 检测到混淆字体且未取到字符映射，跳过 DOM 直接走 OCR');
      }
      const domResult = skipDomForEncryption ? { question: '', options: [], type: 4 } : this.readFromDOM(element);
      if (!skipDomForEncryption && domResult.question && domResult.question.length > 5) {
        panel.log(`📖 从页面DOM读取题目`);
        return domResult;
      }

      // 方式3：OCR识别（兜底方案）
      if (typeof html2canvas !== 'undefined' && typeof Tesseract !== 'undefined') {
        try {
          panel.log('📸 DOM读取失败，尝试OCR识别...');
          let canvas = await html2canvas(element, {
            useCORS: true, logging: false, scale: 2, backgroundColor: '#ffffff'
          });
          panel.log('🔍 正在OCR识别...');
          const { data: { text } } = await Tesseract.recognize(canvas, 'chi_sim');
          // 释放 canvas 内存，防止大量 OCR 时爆内存
          canvas.width = 0;
          canvas.height = 0;
          canvas = null;
          const lines = text.split('\n').map(l => l.trim()).filter(l => l);
          // 题干：选项 A. 出现之前的所有行（剔除常见噪声前缀如 "1.单选题(1分)"）；
          // 选项：[A-F] 开头的行的去前缀文本
          const optionPattern = /^([A-Fa-f])\s*[.、．:：)）]?\s*(.+)/;
          let options = [];
          const questionLines = [];
          for (const line of lines) {
            const match = line.match(optionPattern);
            if (match) {
              options.push(match[2].trim());
            } else if (options.length === 0) {
              questionLines.push(line);
            }
          }
          let questionText = questionLines.join(' ')
            .replace(/\s+/g, ' ')
            .replace(/^\d+\s*[.、]?\s*[【\[\(（]?(?:单选|多选|判断|填空|不定项|单项选择|多项选择)题?[】\]\)）]?\s*(?:[\(（]\s*\d+(?:\.\d+)?\s*分\s*[\)）])?\s*/, '')
            .trim();
          if (!questionText) questionText = text.replace(/\s+/g, ' ').trim();
          panel.log('📝 OCR 题干: ' + (questionText.length > 60 ? questionText.slice(0, 60) + '…' : questionText) + '，选项: ' + options.length);
          return { question: questionText, options, type: domResult.type };
        } catch (err) {
          panel.log(`⚠️ OCR失败: ${err.message || '未知错误'}`);
        }
      }

      return { question: '', options: [], type: 4 };
    },
    async askQuestionBank(question, options = [], type = 4, qid = null) {
      const originalQuestion = question;
      // 清理题目文本：去掉序号前缀、题型标头（不清理LaTeX，lyck6需要原始LaTeX）
      question = question
        .replace(/^[一二三四五六七八九十⼀⼆⼆⼋⼗⼗⼀⼗⼆⼗三⼗四⼗五⼗六⼗七⼗⼋⼗九⼆⼗]+[、.．]\s*/, '')
        .replace(/^判断下列[\s\S]*?[.。：:]\s*/, '')
        .replace(/^【[^】]*】\s*/, '')
        .replace(/[(（]\s*\d+(\.\d+)?\s*分\s*[)）]\s*/g, '')
        .trim();
      // 从问题中去掉内嵌的选项文本（www.yuketang.cn的Body包含选项）
      // 安全策略：只在检测到至少2个选项标记(A. xxx B.)时才截断
      if (options.length >= 2) {
        const m = question.match(/\s*[A-G][.、．]\s*[\s\S]*?[A-G][.、．]/);
        if (m) {
          const cleaned = question.substring(0, m.index).trim();
          if (cleaned.length > 3) {
            question = cleaned;
          }
        }
      }
      if (!question || question.length < 3) question = originalQuestion;
      console.log('[雨课堂助手] 发送题目:', question, '选项:', options);
      const mode = Store.getAnswerMode();
      if (mode === 'ai') {
        return this.askAI(question, options, type);
      } else if (mode === 'free') {
        if (!Store.isVerifyValid()) {
          panel.log('⚠️ 验证码未验证或已过期，请先在【题库配置】中验证');
          throw '验证码未验证或已过期';
        }
        return this.askFreeQuestionBank(question, options, type, qid);
      } else {
        return this.askPaidQuestionBank(question, options, type, qid);
      }
    },
    async askFreeQuestionBank(question, options = [], type = 4, qid = null) {
      const API_URL = 'http://lyck6.cn/scriptService/api/autoFreeAnswer';
      return new Promise((resolve, reject) => {
        panel.log('🔍 正在查询免费题库...');
        GM_xmlhttpRequest({
          method: 'POST',
          url: API_URL,
          headers: { 'Content-Type': 'application/json' },
          // 与万能脚本 formatSearchAnswer 字段对齐：plat+qid 让后端走精确匹配（命中率显著提升）
          data: JSON.stringify({
            plat: 50,
            qid: qid ? String(qid) : null,
            question: question,
            options: options,
            options_id: [],
            type: type,
            location: location.href
          }),
          timeout: 15000,
          onload: res => {
            if (res.status === 200) {
              try {
                const json = JSON.parse(res.responseText);
                if (json.code === 0 && json.result) {
                  const answers = json.result.answers || [];
                  const success = json.result.success || false;
                  let finalAnswers = [];
                  if (success && Array.isArray(answers) && answers.length > 0) {
                    if (typeof answers[0] === 'number') {
                      finalAnswers = answers.map(idx => options[idx] || String.fromCharCode(65 + idx));
                    } else {
                      finalAnswers = answers;
                    }
                  } else if (Array.isArray(answers) && answers.length > 0) {
                    finalAnswers = Array.isArray(answers[0]) ? answers[0] : answers;
                  }
                  if (!finalAnswers.length) {
                    panel.log('⚠️ 免费题库未找到匹配答案');
                    reject('未找到匹配答案');
                    return;
                  }
                  panel.log('✅ 免费题库查询成功');
                  resolve({ answers: finalAnswers, remaining: -1 });
                } else {
                  const msg = json.message || '题库查询失败';
                  panel.log(`⚠️ ${msg}`);
                  reject(msg);
                }
              } catch (e) { reject('JSON 解析失败'); }
            } else {
              const err = `请求失败: HTTP ${res.status}`;
              panel.log(err);
              reject(err);
            }
          },
          onerror: () => reject('网络错误'),
          ontimeout: () => reject('请求超时')
        });
      });
    },
    async askPaidQuestionBank(question, options = [], type = 4, qid = null) {
      const API_URL = 'https://qsy.iano.cn/index.php?s=/api/question_bank/answer';
      const deviceId = Store.getDeviceId();
      return new Promise((resolve, reject) => {
        panel.log('🔍 正在查询付费题库...');
        const params = new URLSearchParams();
        params.append('device_id', deviceId);
        params.append('plat', '50');
        if (qid) params.append('qid', String(qid));
        params.append('question', question);
        params.append('type', type);
        params.append('location', location.href);
        if (Array.isArray(options)) options.forEach((opt, i) => params.append('options[' + i + ']', opt));
        GM_xmlhttpRequest({
          method: 'POST',
          url: API_URL,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          data: params.toString(),
          timeout: 15000,
          onload: res => {
            if (res.status === 200) {
              try {
                const json = JSON.parse(res.responseText);
                if (json.code === 1 && json.data && json.data.result) {
                  const rawAnswers = json.data.result.answers || [];
                  const success = json.data.result.success;
                  const remaining = json.data.remaining_credits || 0;
                  console.log('[雨课堂助手] 付费题库原始返回:', JSON.stringify(json.data.result));
                  let finalAnswers = [];
                  if (success && Array.isArray(rawAnswers) && rawAnswers.length > 0) {
                    if (typeof rawAnswers[0] === 'number') {
                      // lyck6 success=true 时 answers 是选项索引数组，去重
                      const uniqueIndices = [...new Set(rawAnswers)];
                      finalAnswers = uniqueIndices.map(idx => options[idx] || String.fromCharCode(65 + idx));
                    } else {
                      finalAnswers = rawAnswers.map(a => String(a)).filter(a => a.trim() !== '');
                    }
                  } else if (!success && Array.isArray(rawAnswers) && rawAnswers.length > 0) {
                    // success=false: answers是二维数组，取第一个匹配
                    const first = Array.isArray(rawAnswers[0]) ? rawAnswers[0] : rawAnswers;
                    finalAnswers = first.map(a => String(a)).filter(a => a.trim() !== '');
                  }
                  if (finalAnswers.length > 0) {
                    panel.log(`✅ 付费题库查询成功，剩余积分: ${remaining}`);
                    resolve({ answers: finalAnswers, remaining });
                  } else {
                    panel.log(`⚠️ 付费题库未匹配到答案，剩余积分: ${remaining}`);
                    reject('付费题库未匹配到答案');
                  }
                } else {
                  const msg = json.msg || '题库查询失败';
                  panel.log(`⚠️ ${msg}`);
                  reject(msg);
                }
              } catch (e) {
                reject('JSON 解析失败');
              }
            } else {
              const err = `请求失败: HTTP ${res.status}`;
              panel.log(err);
              console.error('[雨课堂助手] 付费题库错误响应:', res.status);
              reject(err);
            }
          },
          onerror: (e) => { console.error('[雨课堂助手] 付费题库网络错误:', e); reject('网络错误'); },
          ontimeout: () => reject('请求超时')
        });
      });
    },
    async askAI(question, options = [], type = 4) {
      const apiKey = Store.getAIApiKey();
      if (!apiKey) {
        throw '未配置AI API Key，请在【题库配置】中填写';
      }
      const provider = Store.getAIProvider();
      const providerConf = AI_PROVIDERS[provider] || AI_PROVIDERS['zhipu'];

      // 构建题目类型描述
      const typeNames = { 0: '单选题', 1: '多选题', 2: '填空题', 3: '判断题', 4: '其他' };
      const typeName = typeNames[type] || '其他';

      // 构建选项文本
      let optionsText = '';
      if (options.length > 0) {
        optionsText = '\n选项：\n' + options.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt}`).join('\n');
      }

      const prompt = `你是一个答题助手。请直接给出答案，不要解释。

题目类型：${typeName}
题目：${question}${optionsText}

回答要求：
- 单选题：只回答一个选项的完整内容（如选项A的内容是"经济全球化"，就回答"经济全球化"）
- 多选题：回答所有正确选项的完整内容，用"||"分隔（如"经济全球化||科技进步"）
- 判断题：只回答"正确"或"错误"
- 填空题：直接给出填空内容；若有多个空，按顺序用"||"分隔每个空的答案
- 解答题/简答题/问答题：直接给出完整作答内容，不要分点编号，用连贯的文字回答
- 不要回答选项字母（A/B/C/D），要回答选项的具体内容`;

      // 统一构建请求（所有模型均兼容 OpenAI 格式）
      // Google Gemini 特殊处理：API Key 通过 URL 参数传递
      let requestUrl = providerConf.url;
      let requestHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      let requestBody = { model: providerConf.model, messages: [{ role: 'user', content: prompt }], temperature: 0.1, max_tokens: 200 };

      if (provider === 'gemini') {
        // Gemini 使用 OpenAI 兼容模式，API Key 通过 URL 参数传递
        requestUrl = `https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`;
        requestHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      } else if (provider === 'openai') {
        // OpenAI 官方 API
        requestUrl = 'https://api.openai.com/v1/chat/completions';
      }

      return new Promise((resolve, reject) => {
        panel.log(`🤖 正在使用 ${providerConf.name} 答题...`);
        GM_xmlhttpRequest({
          method: 'POST',
          url: requestUrl,
          headers: requestHeaders,
          data: JSON.stringify(requestBody),
          timeout: 30000,
          onload: res => {
            if (res.status === 200) {
              try {
                const json = JSON.parse(res.responseText);
                if (json.choices && json.choices[0] && json.choices[0].message) {
                  let aiAnswer = json.choices[0].message.content.trim();
                  // 清理AI回答中可能的多余内容
                  aiAnswer = aiAnswer.replace(/^答案[：:]\s*/i, '').replace(/^答[：:]\s*/i, '').trim();

                  let answers = [];
                  if ((type === 1 || type === 2) && aiAnswer.includes('||')) {
                    // 多选题：每个正确选项一个答案；填空题：每个空一个答案。均用 || 分隔
                    answers = aiAnswer.split('||').map(a => a.trim()).filter(a => a);
                  } else {
                    answers = [aiAnswer];
                  }

                  panel.log(`🤖 AI答案：${answers.join(', ')}`);
                  resolve({ answers, remaining: -1 });
                } else {
                  reject('AI返回格式异常');
                }
              } catch (e) {
                reject('AI响应解析失败');
              }
            } else if (res.status === 401) {
              reject('API Key无效，请检查配置');
            } else if (res.status === 429) {
              reject('请求过于频繁，请稍后重试');
            } else {
              reject(`AI请求失败: HTTP ${res.status}`);
            }
          },
          onerror: () => reject('AI网络错误'),
          ontimeout: () => reject('AI请求超时')
        });
      });
    },
    // AI 兜底（题库未命中时调用）：返回 {answers, used} 或 null
    // logger: 接收消息字符串的回调（如 panel.log.bind(panel)）
    // label: 题目标号（如 "第 3 题"）
    async aiFallback(result, logger = console.log, label = '本题') {
      if (Store.getUnmatchedFallback() !== 'ai') return null;
      if (!Store.getAIApiKey()) {
        logger(`🤖 ${label}想用 AI 兜底但未配 API Key，跳过（请到【题库配置】填写 API Key）`);
        return null;
      }
      const opts = (result?.options || []).filter(Boolean);
      // 选择题/不定项需要选项；填空题(2)、判断题(3)、解答题(4)可不需要选项（靠题干作答）
      if (!opts.length && result?.type !== 2 && result?.type !== 3 && result?.type !== 4) {
        logger(`🤖 ${label}想用 AI 兜底但选项为空，跳过`);
        return null;
      }
      try {
        const typeMap = { 0: '单选题', 1: '多选题', 2: '填空题', 3: '判断题', 4: '其他' };
        const detectedType = result.type !== undefined ? result.type : 4;
        logger(`🤖 ${label}题库未匹配，调用 AI 兜底（题型：${typeMap[detectedType] || '未知'}，选项数：${opts.length}）...`);
        const ai = await this.askAI(result.question, result.options || [], detectedType);
        const answers = (ai && ai.answers) ? ai.answers.filter(Boolean) : [];
        if (answers.length) {
          logger(`🤖 AI 返回 ${answers.length} 个答案：${answers.join(' / ')}`);
          return answers;
        }
        logger(`🤖 ${label} AI 未返回有效答案，跳过`);
        return null;
      } catch (err) {
        logger(`🤖 ${label} AI 兜底失败：${err}`);
        return null;
      }
    },
    // AI生成评论/讨论回复
    // pageContent: 页面正文内容, title: 标题, typeText: 类型（图文/讨论）, existingComments: 已有评论列表
    async generateAIComment(pageContent, title, typeText, existingComments = []) {
      const apiKey = Store.getAIApiKey();
      if (!apiKey) {
        throw '未配置AI API Key，请在【题库配置】中填写';
      }
      const provider = Store.getAIProvider();
      const providerConf = AI_PROVIDERS[provider] || AI_PROVIDERS['zhipu'];

      // 构建上下文信息
      let contextText = '';
      if (title) contextText += `标题：${title}\n`;
      if (typeText) contextText += `类型：${typeText}\n`;
      if (pageContent) {
        // 截取前500字避免超token
        const content = pageContent.length > 500 ? pageContent.substring(0, 500) + '...' : pageContent;
        contextText += `正文内容：${content}\n`;
      }
      if (existingComments.length > 0) {
        contextText += `\n其他同学的评论（参考风格但不要重复）：\n${existingComments.slice(0, 5).map((c, i) => `${i + 1}. ${c}`).join('\n')}\n`;
      }

      const prompt = `你是一名大学生，正在参与课程${typeText || '讨论'}。请根据以下内容写一段简短的评论/回复。

${contextText}
要求：
- 用自然、口语化的中文表达，像真实学生一样
- 字数控制在30-80字之间
- 不要使用"首先、其次、最后"等模板化表达
- 可以表达个人观点、感悟、补充或提问
- 内容要与主题相关且有见解，不要说空话套话
- 不要使用markdown格式，直接输出纯文本
- 不要与已有评论内容雷同
- 只输出评论内容，不要加任何前缀或说明`;

      const requestUrl = providerConf.url;
      const requestHeaders = { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` };
      const requestBody = { model: providerConf.model, messages: [{ role: 'user', content: prompt }], temperature: 0.8, max_tokens: 200 };

      return new Promise((resolve, reject) => {
        panel.log(`🤖 正在使用 ${providerConf.name} 生成评论...`);
        GM_xmlhttpRequest({
          method: 'POST',
          url: requestUrl,
          headers: requestHeaders,
          data: JSON.stringify(requestBody),
          timeout: 30000,
          onload: res => {
            if (res.status === 200) {
              try {
                const json = JSON.parse(res.responseText);
                if (json.choices && json.choices[0] && json.choices[0].message) {
                  let comment = json.choices[0].message.content.trim();
                  // 清理可能的引号包裹和前缀
                  comment = comment.replace(/^["'""]|["'""]$/g, '').replace(/^(评论|回复)[：:]\s*/i, '').trim();
                  panel.log(`🤖 AI生成评论：${comment.substring(0, 50)}${comment.length > 50 ? '...' : ''}`);
                  resolve(comment);
                } else {
                  reject('AI返回格式异常');
                }
              } catch (e) {
                reject('AI响应解析失败');
              }
            } else if (res.status === 401) {
              reject('API Key无效，请检查配置');
            } else if (res.status === 429) {
              reject('请求过于频繁，请稍后重试');
            } else {
              reject(`AI请求失败: HTTP ${res.status}`);
            }
          },
          onerror: () => reject('AI网络错误'),
          ontimeout: () => reject('AI请求超时')
        });
      });
    },
    // 填空题/解答题：将答案逐个写入输入框（兼容 Vue/React 受控组件，支持一题多个空）
    // 移植自 U校园脚本 fillBlanks，雨课堂评论框（el-textarea__inner）也验证过同一套事件序列可用
    // 返回写入成功的输入框数量
    fillBlanks(answers, rootEl) {
      if (!rootEl || !answers || !answers.length) return 0;
      const findInputs = (root) => [...root.querySelectorAll(
        'input[type="text"], input[type="number"], input:not([type]), textarea, [contenteditable="true"]'
      )].filter(e => e.offsetParent !== null && !e.disabled && !e.readOnly);
      // 在 rootEl 内找不到就向上爬最多 5 层父节点（questionArea 可能比输入框更内层）
      let inputs = findInputs(rootEl);
      let scope = rootEl;
      let climbed = 0;
      while (inputs.length === 0 && climbed < 5 && scope.parentElement) {
        scope = scope.parentElement;
        inputs = findInputs(scope);
        climbed++;
      }
      if (!inputs.length) return 0;

      // 单空多答案兜底：只有 1 个输入框但有多个答案 → 拼接后写入第 1 个框
      let fillValues;
      if (inputs.length === 1 && answers.length > 1) {
        fillValues = [answers.map(a => String(a ?? '').trim()).filter(Boolean).join(' ')];
      } else {
        fillValues = answers.map(a => String(a ?? '').trim());
      }

      const writeOne = (el, val) => {
        try { el.focus(); } catch (_) {}
        if (el.contentEditable === 'true') {
          el.textContent = val;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: val, inputType: 'insertText' }));
        } else {
          // Vue/React 受控组件：必须用原生 setter 才能绕过框架的 value 检测
          const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
          const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
          if (setter) setter.call(el, val);
          else el.value = val;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, data: val, inputType: 'insertText' }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
        }
        try { el.blur(); } catch (_) {}
      };

      let filledCount = 0;
      for (let i = 0; i < Math.min(inputs.length, fillValues.length); i++) {
        const val = fillValues[i];
        if (!val) continue;
        try {
          writeOne(inputs[i], val);
          filledCount++;
        } catch (_) {
          try { inputs[i].value = val; filledCount++; } catch (_) {}
        }
      }
      return filledCount;
    },
    async autoSelectAndSubmit(answers, itemBodyElement, decodedOptions, opts = {}) {
      const autoSubmit = opts.autoSubmit !== false; // 默认提交；考试长条模式应传 false
      const type = opts.type; // 题型：2=填空、4=解答/主观（由调用方传入，用于分支到填空写入）
      if (!answers || !answers.length) {
        panel.log('⚠️ 未获取到答案，请人工检查');
        return;
      }

      // 提交按钮查找 + 点击（选择题/填空题共用）
      const doSubmit = () => {
        if (!autoSubmit) {
          // 考试长条模式：只作答，不点提交（整卷只有一个提交按钮，避免误交卷）
          return;
        }
        const submitBtn = (() => {
          const local = itemBodyElement.parentElement.querySelectorAll('.el-button--primary');
          for (const btn of local) {
            if (btn.innerText.includes('提交')) return btn;
          }
          const global = document.querySelectorAll('.el-button.el-button--primary.el-button--medium');
          for (const btn of global) {
            if (btn.innerText.includes('提交') && btn.offsetParent !== null) return btn;
          }
          return null;
        })();
        if (submitBtn) {
          panel.log('正在提交...');
          submitBtn.click();
        } else {
          panel.log('⚠️ 未找到提交按钮，请手动提交');
        }
      };

      // 填空题(2)/解答题(4) 或 页面无选项但有输入框 → 走填空写入分支
      const isFillType = type === 2 || type === 4;
      const hasFillInputs = () => {
        const sel = 'input[type="text"], input[type="number"], input:not([type]), textarea, [contenteditable="true"]';
        const scope = itemBodyElement.closest?.('.subject-item') || itemBodyElement;
        return !!(scope && scope.querySelector && scope.querySelector(sel));
      };
      if (isFillType || hasFillInputs()) {
        const filled = this.fillBlanks(answers, itemBodyElement);
        if (filled > 0) {
          panel.log(`✏️ 已填入 ${filled} 个空：${answers.join(' | ')}`);
          await Utils.sleep(300);
          doSubmit();
          return;
        }
        // 没找到输入框：若题型明确是填空/解答则直接报错返回；否则继续走选择题逻辑（兜底）
        if (isFillType) {
          panel.log('⚠️ 填空题未找到可写入的输入框，请手动作答');
          return;
        }
      }

      // 处理答案格式，使用改进的匹配逻辑
      let targetIndices = [];
      const letterMap = { 'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6 };

      // 获取页面上的选项文本，用于相似度匹配
      // 查找选项容器：多级查找 + 验证是否为真正的选项列表
      const findOptionsList = (root) => {
        if (!root) return null;
        // 优先精确选择器
        const selectors = [
          'ul.list-inline.pt10',
          '.list-inline.list-unstyled-radio',
          '.list-unstyled.list-unstyled-radio',
          'ul.list-unstyled',
          'ul.list-inline',
          'ul.list',
          'ul'
        ];
        for (const sel of selectors) {
          const candidates = root.querySelectorAll(sel);
          for (const ul of candidates) {
            // 验证：必须有至少2个li子元素，且不是导航栏（排除只含按钮的ul）
            const lis = ul.querySelectorAll('li');
            if (lis.length >= 2) {
              const hasButton = ul.querySelector('button.el-button');
              const isNav = ul.closest('.problem-fixedbar') || ul.closest('.aside-body');
              if (!hasButton && !isNav) return ul;
            }
          }
        }
        return null;
      };
      let listContainer = findOptionsList(itemBodyElement);
      if (!listContainer) {
        const parent = itemBodyElement.closest('.subject-item') || itemBodyElement.parentElement;
        listContainer = findOptionsList(parent);
      }
      if (!listContainer) {
        const mainArea = document.querySelector('.container-problem') || document.querySelector('.exam-main--body') || document.querySelector('.container-body');
        listContainer = findOptionsList(mainArea);
      }
      let aiOptionNodes = [];
      if (!listContainer && this.isAiWorkspaceExercisePage()) {
        const aiRoot = itemBodyElement || this.findAiWorkspaceQuestionArea(document);
        aiOptionNodes = this.findAiWorkspaceOptionNodes(aiRoot);
      }
      const optionEls = listContainer ? Array.from(listContainer.querySelectorAll('li')) : aiOptionNodes;
      let pageOptions = Array.from(optionEls).map(li =>
        formatString(li.innerText || li.textContent || '').replace(/^[A-Ga-g][.、\s]\s*/, '').trim().toLowerCase()
      );
      // 如果有解码后的选项数据，优先使用（因为DOM文本可能是字体混淆的）
      if (Array.isArray(decodedOptions) && decodedOptions.length > 0) {
        pageOptions = decodedOptions.map(opt => String(opt).replace(/^[A-Ga-g][.、\s]\s*/, '').trim().toLowerCase());
        console.log('[雨课堂助手] 使用解码选项:', pageOptions);
      } else if (optionEls.length > 0) {
        console.log('[雨课堂助手] 使用DOM选项:', pageOptions);
      } else {
        console.log('[雨课堂助手] 未找到选项容器');
      }

      for (const answer of answers) {
        const answerStr = String(answer).trim();
        const answerUpper = answerStr.toUpperCase();
        const answerLower = answerStr.toLowerCase().replace(/\s/g, '');

        // 1. 判断题处理
        if (/^(对|正确|√|T|ri|true|是)$/i.test(answerStr)) {
          targetIndices = [0];
          break;
        }
        if (/^(错|错误|×|F|不是|wr|false|否)$/i.test(answerStr)) {
          targetIndices = [1];
          break;
        }

        // 1.5 纯数字答案（0-based索引，如 0=A, 1=B, 2=C）
        if (/^\d+$/.test(answerStr)) {
          const idx = parseInt(answerStr, 10);
          if (idx >= 0 && idx <= 9 && !targetIndices.includes(idx)) {
            targetIndices.push(idx);
            continue;
          }
        }

        // 1.8 带前缀的字母答案（如 "E. 机体作为..." → E，"A、没有疾病" → A）
        const letterPrefixMatch = answerStr.match(/^([A-Ga-g])\s*[.、．:：)）]/);

        if (letterPrefixMatch) {
          const ch = letterPrefixMatch[1].toUpperCase();
          if (letterMap[ch] !== undefined && !targetIndices.includes(letterMap[ch])) {
            targetIndices.push(letterMap[ch]);
            continue;
          }
        }

        // 2. 纯字母答案（如 "A", "AC", "BCD"）
        if (/^[A-G]+$/.test(answerUpper) && answerUpper.length <= 7) {
          let isOrdered = true;
          for (let i = 1; i < answerUpper.length; i++) {
            if (answerUpper.charCodeAt(i) <= answerUpper.charCodeAt(i - 1)) {
              isOrdered = false;
              break;
            }
          }
          if (isOrdered) {
            for (const ch of answerUpper) {
              if (letterMap[ch] !== undefined && !targetIndices.includes(letterMap[ch])) {
                targetIndices.push(letterMap[ch]);
              }
            }
            continue;
          }
        }

        // 3. 精确匹配选项文本
        const exactIdx = pageOptions.indexOf(answerLower);
        if (exactIdx >= 0 && !targetIndices.includes(exactIdx)) {
          targetIndices.push(exactIdx);
          continue;
        }

        // 4. 包含匹配（答案文本是选项的子串或选项包含答案）
        if (answerLower.length >= 2 && pageOptions.length > 0) {
          const containIdx = pageOptions.findIndex(opt => opt.includes(answerLower) || answerLower.includes(opt));
          if (containIdx >= 0 && !targetIndices.includes(containIdx)) {
            targetIndices.push(containIdx);
            continue;
          }
        }

        // 5. 相似度匹配
        if (answerLower.length >= 2 && pageOptions.length > 0) {
          const ratings = pageOptions.map(opt => stringSimilarity(answerLower, opt));
          const maxScore = Math.max(...ratings);
          if (maxScore > 60) {
            const bestIdx = ratings.indexOf(maxScore);
            if (!targetIndices.includes(bestIdx)) {
              targetIndices.push(bestIdx);
            }
          }
        }
      }

      if (!targetIndices.length) {
        panel.log(`⚠️ 无法解析答案: ${answers.join(', ')}`);
        return;
      }

      panel.log(`✅ 题库答案：${answers.join(', ')} → 选择第 ${targetIndices.map(i => String.fromCharCode(65 + i)).join('')} 项`);

      if (!listContainer && optionEls.length === 0) {
        panel.log('⚠️ 未找到选项容器');
        return;
      }
      const options = optionEls;
      for (const idx of targetIndices) {
        if (!options[idx]) continue;
        const clickable = options[idx].querySelector('label.el-radio') ||
          options[idx].querySelector('label.el-checkbox') ||
          options[idx].querySelector('.ant-radio-wrapper') ||
          options[idx].querySelector('.ant-checkbox-wrapper') ||
          options[idx].querySelector('[role="radio"]') ||
          options[idx].querySelector('[role="checkbox"]') ||
          options[idx].querySelector('.el-radio__label') ||
          options[idx].querySelector('.el-checkbox__label') ||
          options[idx].querySelector('input') ||
          options[idx];
        clickable.click();
        await Utils.sleep(300);
      }
      doSubmit();
    }
  };

  // ---- v2 逻辑 ----
  class V2Runner {
    constructor(panel) {
      this.panel = panel;
      this.baseUrl = location.href;
      const { current } = Store.getProgress(this.baseUrl);
      this.outside = current.outside;
      this.inside = current.inside;
    }

    updateProgress(outside, inside = 0) {
      this.outside = outside;
      this.inside = inside;
      Store.setProgress(this.baseUrl, outside, inside);
    }

    // 查找课程列表项：优先 .logs-list，然后尝试备选选择器
    // 在指定文档中搜索列表（复用逻辑）
    _searchListInDoc(doc) {
      if (!doc) return null;
      // a) .logs-list（用 children 排除文本节点）
      const logsList = doc.querySelector('.logs-list');
      if (logsList && logsList.children.length) {
        console.log(`[雨课堂助手] 匹配: .logs-list (${logsList.children.length} items)`);
        return { container: logsList, items: logsList.children };
      }
      // b) .el-timeline
      const timeline = doc.querySelector('.el-timeline');
      if (timeline) {
        const items = timeline.querySelectorAll(':scope > .el-timeline-item');
        if (items.length) return { container: timeline, items };
      }
      // c) 在各种可能的容器内查找 .logs-list（深层嵌套）
      for (const rootSel of ['.section-fr', '.section-f1', '#chapter-section', '.viewContainer', '.studentLog_view']) {
        const root = doc.querySelector(rootSel);
        if (!root) continue;
        const deepLogs = root.querySelector('.logs-list');
        if (deepLogs && deepLogs.children.length) {
          console.log(`[雨课堂助手] 匹配: ${rootSel} > .logs-list (${deepLogs.children.length} items)`);
          return { container: deepLogs, items: deepLogs.children };
        }
      }
      // d) .section-fr 内 .leaf-detail（iframe 新版 v2 结构：每个 leaf-detail 是一个视频/作业等）
      const sectionFr = doc.querySelector('.section-fr');
      if (sectionFr) {
        const leafItems = sectionFr.querySelectorAll('.leaf-detail');
        if (leafItems.length) {
          console.log(`[雨课堂助手] 匹配: .section-fr .leaf-detail (${leafItems.length} items)`);
          return { container: sectionFr, items: leafItems, leafMode: true };
        }
      }
      // d) 常见列表容器选择器
      const vc = doc.querySelector('.viewContainer') || doc.querySelector('.studentLog_view') || doc.querySelector('.section-fr') || doc.body;
      if (vc) {
        for (const sel of ['.timeline', '.cell_list', '.course-activity', '.student-log-list', '.learning-activity']) {
          const sub = vc.querySelector(sel);
          if (sub && sub.children.length) return { container: sub, items: sub.children };
        }
        // 只匹配 div > .content-box（不再匹配裸 section，避免误中布局面板）
        const boxItems = vc.querySelectorAll('div:has(> .content-box)');
        if (boxItems.length > 1) {
          console.log(`[雨课堂助手] 匹配: content-box 兜底 (${boxItems.length} items)`);
          return { container: boxItems[0].parentElement, items: boxItems };
        }
      }
      return null;
    }

    _findCourseListItems() {
      // 1) 主文档搜索
      const mainResult = this._searchListInDoc(document);
      if (mainResult) return mainResult;

      // 2) iframe 内搜索（新版雨课堂某些课程把内容放在 iframe 内）
      try {
        const iframes = document.querySelectorAll('iframe.tab-pane-content-iframe, iframe[src*="studentLog"], iframe[src*="course"]');
        for (const iframe of iframes) {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (!iframeDoc) continue;
          const iframeResult = this._searchListInDoc(iframeDoc);
          if (iframeResult) {
            console.log('[雨课堂助手] 在 iframe 中找到课程列表');
            return iframeResult;
          }
        }
        // 诊断（仅一次）：输出 iframe 内 .section-fr 结构
        if (!this._iframeDiagDone) {
          this._iframeDiagDone = true;
          for (const iframe of iframes) {
            try {
              const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
              if (!iDoc) continue;
              const sectionFr = iDoc.querySelector('.section-fr');
              if (sectionFr) {
                const frChildren = Array.from(sectionFr.querySelectorAll('*')).slice(0, 100);
                const frClasses = [...new Set(frChildren.map(t => typeof t.className === 'string' ? t.className : '').filter(Boolean))].slice(0, 30);
                console.log(`[雨课堂助手] iframe .section-fr 内部 class(前30): ${frClasses.join(' | ')}`);
                console.log(`[雨课堂助手] iframe .section-fr children=${sectionFr.children.length}, innerHTML前500:`, (sectionFr.innerHTML || '').slice(0, 500));
                break;
              }
            } catch (_) {}
          }
        }
      } catch (e) {
        console.log('[雨课堂助手] iframe 访问失败(可能跨域):', e.message);
      }

      // 3) .el-tabs__content 内的 tab pane 搜索
      const tabContent = document.querySelector('.el-tabs__content');
      if (tabContent) {
        for (const pane of tabContent.children) {
          const paneResult = this._searchListInDoc({ querySelector: s => pane.querySelector(s), querySelectorAll: s => pane.querySelectorAll(s), body: pane });
          if (paneResult) return paneResult;
        }
      }

      return null;
    }

    async run() {
      preventScreenCheck();
      this.panel.log(`检测到已播放到第 ${this.outside} 集，继续刷课...`);
      let diagLogged = false;
      while (true) {
        // 检查是否请求停止
        if (stopRequested) {
          this.panel.log('⏸️ 已停止刷课');
          this.panel.resetStartButton('继续刷课');
          return;
        }

        await this.autoSlide();
        const found = this._findCourseListItems();
        const list = found?.items;
        if (!list || !list.length) {
          if (!diagLogged) {
            diagLogged = true;
            // 诊断：输出 DOM 结构帮助排查（深度3层）
            const descTag = (el) => `${el.tagName}.${(el.className || '').split(' ').slice(0, 3).join('.')}`;
            const dumpTree = (root, depth = 0) => {
              if (!root || depth > 3) return [];
              const lines = [];
              Array.from(root.children).slice(0, 8).forEach(c => {
                lines.push('  '.repeat(depth) + descTag(c) + ` [${c.children.length}ch]`);
                if (c.children.length <= 5) lines.push(...dumpTree(c, depth + 1));
              });
              return lines;
            };
            const vc = document.querySelector('.viewContainer');
            if (vc) {
              const tree = dumpTree(vc);
              console.log('[雨课堂助手] viewContainer DOM 树:\n' + tree.join('\n'));
              this.panel.log(`未找到课程列表，DOM 诊断已输出到控制台(F12)`);
            } else {
              console.log('[雨课堂助手] .viewContainer 未找到');
              this.panel.log('未找到课程列表容器，稍后重试');
            }
          } else {
            this.panel.log('未找到课程列表，稍后重试');
          }
          await Utils.sleep(2000);
          continue;
        }
        console.log(`当前集数:${this.outside}/全部集数${list.length}`);
        if (this.outside >= list.length) {
          this.panel.log('课程刷完啦 🎉');
          this.panel.resetStartButton('刷完啦~');
          Store.removeProgress(this.baseUrl);
          break;
        }
        let course, type;
        const listItem = list[this.outside];
        if (found.leafMode) {
          // iframe 新版 v2 结构：.leaf-detail 就是可点击项
          course = listItem;
          const iconCls = listItem?.querySelector('.iconfont')?.className || '';
          if (iconCls.includes('icon--shipin')) type = 'shipin';
          else if (iconCls.includes('icon--zuoye')) type = 'piliang';
          else if (iconCls.includes('icon--tuwen')) type = 'kejian';
          else if (iconCls.includes('icon--kaoshi')) type = 'kaoshi';
          else type = 'piliang';
        } else {
          course = listItem?.querySelector('.content-box')?.querySelector('section');
          type = course?.querySelector('.tag')?.querySelector('use')?.getAttribute('xlink:href') || 'piliang';
        }
        if (!course) {
          this.panel.log('未找到当前课程节点，跳过');
          this.updateProgress(this.outside + 1, 0);
          continue;
        }
        // Check if course is already completed
        const itemText = listItem?.innerText || '';
        if (itemText.includes('100%') || itemText.includes('\u5df2\u5b8c\u6210')) {
          this.panel.log(`\u7b2c ${this.outside + 1} \u4e2a\u5df2\u5b8c\u6210\uff0c\u8df3\u8fc7`);
          this.updateProgress(this.outside + 1, 0);
          continue;
        }
        // 每次进入新课程前清空拦截数据，防止跨课程数据残留导致内存泄漏
        interceptedProblems = null;
        this.panel.log(`刷课状态：第 ${this.outside + 1}/${list.length} 个，类型 ${type}`);
        if (type.includes('shipin')) {
          await this.handleVideo(course);
        } else if (type.includes('piliang')) {
          await this.handleBatch(course, list);
        } else if (type.includes('ketang')) {
          const featureFlags = Store.getFeatureConf();
          if (featureFlags.skipLive) {
            this.panel.log(`第 ${this.outside + 1} 个为直播课/课堂，已设置跳过`);
            this.updateProgress(this.outside + 1, 0);
          } else {
            await this.handleClassroom(course);
          }
        } else if (type.includes('kejian')) {
          await this.handleCourseware(course);
        } else if (type.includes('kaoshi')) {
          this.panel.log('考试区域脚本会被屏蔽，已跳过');
          this.updateProgress(this.outside + 1, 0);
        } else {
          this.panel.log('非视频/批量/课件/考试，已跳过');
          this.updateProgress(this.outside + 1, 0);
        }
      }
    }

    async autoSlide() {
      const frequency = Math.floor((this.outside + 1) / 20) + 1;
      for (let i = 0; i < frequency; i++) {
        Utils.scrollToBottom('.viewContainer');
        await Utils.sleep(800);
      }
    }

    async handleVideo(course) {
      course.click();
      await Utils.sleep(3000);
      const progressNode = document.querySelector('.progress-wrap')?.querySelector('.text');
      const title = document.querySelector('.title')?.innerText || '视频';
      const isDeadline = document.querySelector('.box')?.innerText.includes('已过考核截止时间');
      if (isDeadline) this.panel.log(`${title} 已过截止，进度不再增加，将直接跳过`);
      let video = document.querySelector('video');
      let waitCount = 0;
      while (!video && waitCount < 15) {
        await Utils.sleep(1000);
        video = document.querySelector('video');
        waitCount++;
      }
      if (video) {
        video.volume = 0;
        await Utils.sleep(1500);
        await video.play().catch(() => {});
      }
      Player.applySpeed();
      Player.mute();
      const stopObserve = Player.observePause(video);
      await Utils.poll(() => isDeadline || Utils.isProgressDone(progressNode?.innerHTML), { interval: 5000, timeout: await Utils.getDDL() });
      stopObserve();
      // If progress not complete, replay at 1x speed
      if (!isDeadline && !Utils.isProgressDone(progressNode?.innerHTML) && video) {
        this.panel.log('\u8fdb\u5ea6\u672a\u6ee1\uff0c\u4ee51x\u901f\u5ea6\u91cd\u64ad...');
        video.playbackRate = 1;
        video.currentTime = 0;
        await Utils.sleep(1000);
        await video.play().catch(() => {});
        const stopObserve2 = Player.observePause(video);
        await Utils.poll(() => Utils.isProgressDone(progressNode?.innerHTML), { interval: 5000, timeout: await Utils.getDDL() });
        stopObserve2();
      }
      this.updateProgress(this.outside + 1, 0);
      history.back();
      await Utils.sleep(1200);
    }

    async handleBatch(course, list) {
      const expandBtn = course.querySelector('.sub-info')?.querySelector('.gray')?.querySelector('span');
      if (!expandBtn) {
        this.panel.log('未找到批量展开按钮，跳过');
        this.updateProgress(this.outside + 1, 0);
        return;
      }
      expandBtn.click();
      await Utils.sleep(1200);
      const activities = list[this.outside]?.querySelector('.leaf_list__wrap')?.querySelectorAll('.activity__wrap') || [];
      let idx = this.inside;
      this.panel.log(`进入批量区，内部进度 ${idx}/${activities.length}`);
      while (idx < activities.length) {
        const item = activities[idx];
        if (!item) break;
        const tagText = item.querySelector('.tag')?.innerText || '';
        const tagHref = item.querySelector('.tag')?.querySelector('use')?.getAttribute('xlink:href') || '';
        const title = item.querySelector('h2')?.innerText || `第${idx + 1}项`;
        if (tagText === '音频') {
          idx = await this.playAudioItem(item, title, idx);
        } else if (tagHref.includes('shipin')) {
          idx = await this.playVideoItem(item, title, idx);
        } else if (tagHref.includes('tuwen') || tagHref.includes('taolun')) {
          idx = await this.autoCommentItem(item, tagHref.includes('tuwen') ? '图文' : '讨论', idx);
        } else if (tagHref.includes('zuoye')) {
          idx = await this.handleHomework(item, idx);
        } else {
          this.panel.log(`类型未知，已跳过：${title}`);
          idx++;
          this.updateProgress(this.outside, idx);
        }
      }
      this.updateProgress(this.outside + 1, 0);
      await Utils.sleep(1000);
    }

    async playAudioItem(item, title, idx) {
      this.panel.log(`开始播放音频：${title}`);
      item.click();
      await Utils.sleep(2500);
      let audio = document.querySelector('audio');
      let waitCount = 0;
      while (!audio && waitCount < 15) {
        await Utils.sleep(1000);
        audio = document.querySelector('audio');
        waitCount++;
      }
      Player.applyMediaDefault(audio);
      const progressNode = document.querySelector('.progress-wrap')?.querySelector('.text');
      await Utils.poll(() => Utils.isProgressDone(progressNode?.innerHTML), { interval: 3000, timeout: await Utils.getDDL() });
      this.panel.log(`${title} 播放完成`);
      idx++;
      this.updateProgress(this.outside, idx);
      history.back();
      await Utils.sleep(1500);
      return idx;
    }

    async playVideoItem(item, title, idx) {
      this.panel.log(`开始播放视频：${title}`);
      item.click();
      await Utils.sleep(2500);
      let video = document.querySelector('video');
      let waitCount = 0;
      while (!video && waitCount < 15) {
        await Utils.sleep(1000);
        video = document.querySelector('video');
        waitCount++;
      }
      if (video) {
        video.volume = 0;
        await Utils.sleep(1500);
        await video.play().catch(() => {});
      }
      Player.applySpeed();
      Player.mute();
      const stopObserve = Player.observePause(video);
      const progressNode = document.querySelector('.progress-wrap')?.querySelector('.text');
      await Utils.poll(() => Utils.isProgressDone(progressNode?.innerHTML), { interval: 3000, timeout: await Utils.getDDL() });
      stopObserve();
      // If progress not complete, replay at 1x speed
      if (!Utils.isProgressDone(progressNode?.innerHTML) && video) {
        this.panel.log('\u8fdb\u5ea6\u672a\u6ee1\uff0c\u4ee51x\u901f\u5ea6\u91cd\u64ad...');
        video.playbackRate = 1;
        video.currentTime = 0;
        await Utils.sleep(1000);
        await video.play().catch(() => {});
        const stopObserve2 = Player.observePause(video);
        await Utils.poll(() => Utils.isProgressDone(progressNode?.innerHTML), { interval: 3000, timeout: await Utils.getDDL() });
        stopObserve2();
      }
      this.panel.log(`${title} 播放完成`);
      idx++;
      this.updateProgress(this.outside, idx);
      history.back();
      await Utils.sleep(1500);
      return idx;
    }

    async autoCommentItem(item, typeText, idx) {
      const featureFlags = Store.getFeatureConf();
      if (!featureFlags.autoComment) {
        this.panel.log('已关闭自动回复评论，跳过该项');
        idx++;
        this.updateProgress(this.outside, idx);
        return idx;
      }
      const commentMode = featureFlags.commentMode || 'copy';
      const title = item.querySelector('h2')?.innerText || '';
      this.panel.log(`开始处理${typeText}：${title}`);
      item.click();
      await Utils.sleep(1200);
      window.scrollTo(0, document.body.scrollHeight);
      await Utils.sleep(800);
      window.scrollTo(0, 0);

      // ---- 收集页面内容信息 ----
      // 1. 获取主题/标题内容（图文正文或讨论话题）
      const contentSelectors = [
        '.article-content', '.rich-text', '.post-content',
        '.detail-content', '.topic-content', '.content-detail',
        '.discuss-content', '.tuwen-content',
        '.el-card__body', '.content-box'
      ];
      let pageContent = '';
      for (const sel of contentSelectors) {
        const el = document.querySelector(sel);
        if (el && el.innerText?.trim().length > 10) {
          pageContent = el.innerText.trim();
          break;
        }
      }
      // 如果没找到专用内容区，尝试获取页面主体文字
      if (!pageContent) {
        const mainBody = document.querySelector('.container-body') || document.querySelector('.main-content') || document.querySelector('.app-body');
        if (mainBody) pageContent = mainBody.innerText?.trim().substring(0, 800) || '';
      }

      // 2. 获取其他人的评论列表（用于参考）
      const commentSelectors = ['#new_discuss .new_discuss_list .cont_detail', '.new_discuss_list dd .cont_detail', '.cont_detail.word-break'];
      let existingComments = [];
      let firstComment = '';
      for (let retry = 0; retry < 30; retry++) {
        for (const sel of commentSelectors) {
          const list = document.querySelectorAll(sel);
          for (const node of list) {
            const text = node?.innerText?.trim();
            if (text && text.length > 0) {
              existingComments.push(text);
              if (!firstComment) firstComment = text;
            }
          }
          if (existingComments.length > 0) break;
        }
        if (existingComments.length > 0) break;
        await Utils.sleep(500);
      }

      // ---- 根据模式生成评论 ----
      let commentText = '';

      if (commentMode === 'ai') {
        // AI 智能回复模式
        const apiKey = Store.getAIApiKey();
        if (!apiKey) {
          this.panel.log('⚠️ AI评论需要API Key，自动切换为复制模式');
          commentText = firstComment;
        } else {
          try {
            commentText = await Solver.generateAIComment(pageContent, title, typeText, existingComments);
            this.panel.log(`🤖 AI生成评论：${commentText.substring(0, 50)}${commentText.length > 50 ? '...' : ''}`);
          } catch (err) {
            this.panel.log(`⚠️ AI生成评论失败：${err}，尝试复制模式`);
            commentText = firstComment;
          }
        }
      } else {
        // 复制首条评论模式
        commentText = firstComment;
      }

      if (!commentText) {
        this.panel.log('未找到评论内容且AI生成失败，跳过该项');
      } else {
        const input = document.querySelector('.el-textarea__inner');
        if (input) {
          // 使用 nativeInputValueSetter 确保 Vue/React 能检测到值变化
          const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
          if (nativeSetter) {
            nativeSetter.call(input, commentText);
          } else {
            input.value = commentText;
          }
          input.dispatchEvent(new Event('input', { bubbles: true }));
          input.dispatchEvent(new Event('change', { bubbles: true }));
          await Utils.sleep(800);
          const sendBtn = document.querySelector('.el-button.submitComment') ||
            document.querySelector('.publish_discuss .postBtn button') ||
            document.querySelector('.el-button--primary');
          if (sendBtn && !sendBtn.disabled && !sendBtn.classList.contains('is-disabled')) {
            sendBtn.click();
            const modeLabel = commentMode === 'ai' ? '(AI生成)' : '(复制)';
            this.panel.log(`已在${typeText}区发表评论 ${modeLabel}`);
          } else {
            this.panel.log('发送按钮不可用或不存在');
          }
        } else {
          this.panel.log('未找到评论输入框，跳过');
        }
      }
      idx++;
      this.updateProgress(this.outside, idx);
      history.back();
      await Utils.sleep(1000);
      return idx;
    }

    async handleHomework(item, idx) {
      const featureFlags = Store.getFeatureConf();
      if (!featureFlags.autoAI) {
        this.panel.log('已关闭题库自动答题，跳过该项');
        idx++;
        this.updateProgress(this.outside, idx);
        return idx;
      }
      // 检查答题模式的有效性
      const answerMode = Store.getAnswerMode();
      if (answerMode === 'ai' && !Store.getAIApiKey()) {
        this.panel.log('⚠️ 未配置AI API Key，跳过自动答题');
        this.panel.log('💡 请在【题库配置】中填写API Key');
        idx++;
        this.updateProgress(this.outside, idx);
        return idx;
      }
      if (answerMode === 'free' && !Store.isVerifyValid()) {
        this.panel.log('⚠️ 验证码未验证或已过期，跳过自动答题');
        this.panel.log('💡 请在【题库配置】中验证后重试');
        idx++;
        this.updateProgress(this.outside, idx);
        return idx;
      }
      this.panel.log('进入作业，启动题库查询');
      // 清空上一个作业/课程的拦截数据，等待本作业的 JSON 被重新拦截解密
      // 否则会复用上一批作业的问题&字体映射，导致题目乱码/答错
      interceptedProblems = null;
      deobfuscationPromise = null;
      fontCharMap = null;
      item.click();
      await Utils.sleep(2000);

      // 付费模式下预先查询积分，确保服务端设备已初始化
      if (answerMode === 'paid') {
        try {
          const data = await queryCredits();
          this.panel.log(`💰 当前积分: ${data.remaining_credits}`);
          if (data.remaining_credits <= 0) {
            this.panel.log('⚠️ 积分不足，跳过自动答题');
            idx++;
            this.updateProgress(this.outside, idx);
            history.back();
            await Utils.sleep(1200);
            return idx;
          }
        } catch (err) {
          this.panel.log(`⚠️ 积分查询失败: ${err}，继续尝试答题`);
        }
        await Utils.sleep(500);
      }

      // 等待拦截数据加载
      await Utils.sleep(1000);

      let i = 0;
      while (true) {
        const items = document.querySelectorAll('.subject-item.J_order, .subject-item');
        if (i >= items.length) {
          this.panel.log(`所有题目处理完毕，共 ${items.length} 题，准备交卷`);
          break;
        }
        const listItem = items[i];
        listItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
        listItem.click();
        await Utils.sleep(1500);

        // 检查是否已答
        const disabled = document.querySelectorAll('.el-button.el-button--info.is-disabled.is-plain');
        if (disabled.length > 0) {
          this.panel.log(`第 ${i + 1} 题已完成，跳过`);
          i++;
          continue;
        }

        const targetEl = document.querySelector('.item-type')?.parentElement ||
          document.querySelector('.item-body') ||
          document.querySelector('.problem-body')?.parentElement;

        try {
          // 使用新的综合识别
          const result = await Solver.recognize(targetEl, i);
          if (result && result.question && result.question.length > 3) {
            // 查询题库（带重试，与ExamRunner一致）
            let answers;
            try {
              const bankResult = await Solver.askQuestionBank(
                result.question,
                result.options,
                result.type !== undefined ? result.type : 4,
                result.qid
              );
              answers = bankResult.answers;
            } catch (firstErr) {
              this.panel.log(`⚠️ 首次查询失败，2秒后重试...`);
              await Utils.sleep(2000);
              try {
                const retryResult = await Solver.askQuestionBank(
                  result.question,
                  result.options,
                  result.type !== undefined ? result.type : 4,
                  result.qid
                );
                answers = retryResult.answers;
              } catch (retryErr) {
                this.panel.log(`第 ${i + 1} 题查询失败：${retryErr}`);
                i++;
                continue;
              }
            }
            // AI 兜底：题库未命中时调用 AI
            let usedAIHere = false;
            if (!answers || answers.length === 0) {
              const aiAnswers = await Solver.aiFallback(result, this.panel.log.bind(this.panel), `第 ${i + 1} 题 `);
              if (aiAnswers && aiAnswers.length > 0) {
                answers = aiAnswers;
                usedAIHere = true;
              }
            }
            if (answers && answers.length > 0) {
              await Solver.autoSelectAndSubmit(answers, targetEl, result.options, { type: result.type });
            } else {
              this.panel.log(`第 ${i + 1} 题无答案，跳过`);
            }
            // 题间延迟（用过 AI 的题需要 AI 限速冷却）
            const _useAICooldown = Store.getAnswerMode() === 'ai' || usedAIHere;
            const _aiUnlocked = Store.isAIUnlocked();
            const _aiDelay = _useAICooldown ? (_aiUnlocked ? 1500 + Math.random() * 500 : 35000 + Math.random() * 2000) : 1500;
            if (_useAICooldown && !_aiUnlocked) this.panel.log(`AI限速冷却中，${Math.round(_aiDelay/1000)}秒后继续（解锁后可加速）...`);
            await Utils.sleep(_aiDelay);
          } else {
            this.panel.log(`第 ${i + 1} 题识别失败`);
            await Utils.sleep(1500);
          }
        } catch (err) {
          this.panel.log(`题库查询失败：${err}`);
          await Utils.sleep(1500);
        }
        i++;
      }
      idx++;
      this.updateProgress(this.outside, idx);
      history.back();
      await Utils.sleep(1200);
      return idx;
    }

    async handleClassroom(course) {
      this.panel.log('进入课堂模式...');
      course.click();
      await Utils.sleep(5000);
      const iframe = document.querySelector('iframe.lesson-report-mobile');
      if (!iframe || !iframe.contentDocument) {
        this.panel.log('未找到课堂 iframe，跳过');
        this.updateProgress(this.outside + 1, 0);
        return;
      }
      const video = iframe.contentDocument.querySelector('video');
      const audio = iframe.contentDocument.querySelector('audio');
      if (video) {
        Player.applyMediaDefault(video);
        await Player.waitForEnd(video);
      }
      if (audio) {
        Player.applyMediaDefault(audio);
        await Player.waitForEnd(audio);
      }
      this.updateProgress(this.outside + 1, 0);
      history.go(-1);
      await Utils.sleep(1200);
    }

    async handleCourseware(course) {
      const tableData = course.parentNode?.parentNode?.parentNode?.__vue__?.tableData;
      const deadlinePassed = (tableData?.deadline || tableData?.end) ? (tableData.deadline < Date.now() || tableData.end < Date.now()) : false;
      if (deadlinePassed) {
        this.panel.log(`${course.querySelector('h2')?.innerText || '课件'} 已结课，跳过`);
        this.updateProgress(this.outside + 1, 0);
        return;
      }
      course.click();
      await Utils.sleep(3000);
      const classType = document.querySelector('.el-card__header')?.innerText || '';
      const className = document.querySelector('.dialog-header')?.firstElementChild?.innerText || '课件';
      if (classType.includes('PPT')) {
        const slides = document.querySelector('.swiper-wrapper')?.children || [];
        this.panel.log(`开始播放 PPT：${className}`);
        for (let i = 0; i < slides.length; i++) {
          slides[i].click();
          this.panel.log(`${className}：第 ${i + 1} 张`);
          await Utils.sleep(Config.pptInterval);
        }
        await Utils.sleep(Config.pptInterval);
        const videoBoxes = document.querySelectorAll('.video-box');
        if (videoBoxes?.length) {
          this.panel.log('PPT 中有视频，继续播放');
          for (let i = 0; i < videoBoxes.length; i++) {
            if (videoBoxes[i].innerText === '已完成') {
              this.panel.log(`第 ${i + 1} 个视频已完成，跳过`);
              continue;
            }
            videoBoxes[i].click();
            await Utils.sleep(2000);
            Player.applySpeed();
            const muteBtn = document.querySelector('.xt_video_player_common_icon');
            muteBtn && muteBtn.click();
            const stopObserve = Player.observePause(document.querySelector('video'));
            await Utils.poll(() => {
              const allTime = document.querySelector('.xt_video_player_current_time_display')?.innerText || '';
              const [nowTime, totalTime] = allTime.split(' / ');
              return nowTime && totalTime && nowTime === totalTime;
            }, { interval: 800, timeout: await Utils.getDDL() });
            stopObserve();
          }
        }
        this.panel.log(`${className} 已播放完毕`);
      } else {
        const videoBox = document.querySelector('.video-box');
        if (videoBox) {
          videoBox.click();
          await Utils.sleep(1800);
          Player.applySpeed();
          const muteBtn = document.querySelector('.xt_video_player_common_icon');
          muteBtn && muteBtn.click();
          await Utils.poll(() => {
            const times = document.querySelector('.xt_video_player_current_time_display')?.innerText || '';
            const [nowTime, totalTime] = times.split(' / ');
            return nowTime && totalTime && nowTime === totalTime;
          }, { interval: 800, timeout: await Utils.getDDL() });
          this.panel.log(`${className} 视频播放完毕`);
        }
      }
      this.updateProgress(this.outside + 1, 0);
      history.back();
  }
}

  // ---- 考试答题 Runner ----
  class ExamRunner {
    constructor(panel) {
      this.panel = panel;
    }

    async _aiWorkspaceFallbackAnswers(result) {
      if (Store.getUnmatchedFallback() !== 'ai') {
        this.panel.log('⏭️ 题库未匹配，按设置跳过不答（注意：连续跳过会被平台锁死下一题按钮）');
        return null;
      }
      return await Solver.aiFallback(result, this.panel.log.bind(this.panel), '');
    }

    findAiWorkspaceClickableButton(textOptions, opts) {
      opts = opts || {};
      const wanted = new Set(textOptions);
      // wanted 关键字命中："文本完全等于" 或 "按钮内 <span> 文本等于" 或 "包含该关键字"
      const matchText = (raw) => {
        const t = (raw || '').replace(/\s+/g, '').trim();
        if (!t) return false;
        if (wanted.has(t)) return true;
        for (const w of wanted) { if (t.includes(w)) return true; }
        return false;
      };
      // AI 工作空间是嵌套 iframe（lms-graph 外壳 + exercise 内层），按钮通常在 iframe 内，
      // 必须跨同源 iframe 收集所有 button，否则顶层 document.querySelectorAll 会查不到任何按钮
      const roots = (typeof Solver.collectAiWorkspaceRoots === 'function')
        ? Solver.collectAiWorkspaceRoots(document)
        : [document];
      const buttons = [];
      for (const r of roots) {
        try {
          buttons.push(...Array.from(r.querySelectorAll('button,a[role="button"],[role="button"],.el-button,.ant-btn')));
        } catch (_) { /* cross-origin */ }
      }
      const visible = buttons.filter(b => Solver.isStructurallyVisible(b));
      const matched = visible.filter(btn => {
        const text = btn.innerText || btn.textContent || '';
        const aria = btn.getAttribute('aria-label') || '';
        if (!matchText(text) && !matchText(aria)) return false;
        const className = String(btn.className || '');
        if (btn.disabled) return false;
        if (btn.getAttribute('aria-disabled') === 'true') return false;
        if (/\bis-disabled\b/.test(className)) return false;
        return true;
      });
      if (matched.length) return matched[0];
      // 兜底诊断：把可见按钮文本列表同时打到 F12 和面板，方便不开 F12 也能定位
      try {
        const summary = visible.slice(0, 20).map(b => {
          const t = (b.innerText || b.textContent || '').replace(/\s+/g, '').trim() || '(空文本)';
          const cls = String(b.className || '');
          const dis = b.disabled || b.getAttribute('aria-disabled') === 'true' || /\bis-disabled\b/.test(cls);
          return `${t}${dis ? '[禁]' : ''}`;
        }).join(' / ');
        console.log('[雨课堂助手] 未找到目标按钮', Array.from(wanted), '；可见按钮:', summary);
        if (this.panel && opts.logToPanel) {
          this.panel.log(`🔎 没匹配到「${Array.from(wanted).join('/')}」按钮，可见按钮：${summary || '(无)'}`);
        }
      } catch (_) {}
      return null;
    }

    findAiWorkspaceNextButton(logToPanel) {
      return this.findAiWorkspaceClickableButton(['下一题', '下一道', '下一个'], { logToPanel: !!logToPanel });
    }

    findAiWorkspaceSubmitButton(logToPanel) {
      return this.findAiWorkspaceClickableButton(['提交', '提交答案', '确认提交', '保存并继续'], { logToPanel: !!logToPanel });
    }

    // 检测当前题是否已经作答：
    // - 平台对已答题会把「提交」按钮替换成「已提交 / 已作答」并禁用
    // - 用户点「上一题」回看历史题目时同样是这种状态
    // 这种情况下不应该再走识别 + 查库 + 选项点击，会白扣积分而且把答案改坏
    isAiWorkspaceQuestionAnswered() {
      const roots = (typeof Solver.collectAiWorkspaceRoots === 'function')
        ? Solver.collectAiWorkspaceRoots(document)
        : [document];
      const keywords = ['已提交', '已作答', '已完成', '已答'];
      for (const r of roots) {
        let buttons = [];
        try {
          buttons = Array.from(r.querySelectorAll('button,a[role="button"],[role="button"],.el-button,.ant-btn'));
        } catch (_) { continue; }
        for (const btn of buttons) {
          if (!Solver.isStructurallyVisible(btn)) continue;
          const text = (btn.innerText || btn.textContent || '').replace(/\s+/g, '').trim();
          if (!text) continue;
          for (const kw of keywords) {
            if (text.includes(kw)) return true;
          }
        }
      }
      return false;
    }

    async waitForAiWorkspaceQuestionChange(prevQuestion) {
      return Utils.poll(() => {
        const area = Solver.findAiWorkspaceQuestionArea(document);
        const fresh = Solver.readAiWorkspaceFromDOM(area);
        return !!(fresh.question && fresh.question !== prevQuestion);
      }, { interval: 500, timeout: 8000 });
    }

    async runAiWorkspaceExercise() {
      this.panel.log('检测到AI学习空间章节测试，使用兼容模式答题');
      for (let i = 0; i < 100; i++) {
        if (stopRequested) {
          this.panel.log('⏸️ 已停止答题');
          this.panel.resetStartButton('继续答题');
          return;
        }

        let questionArea = null;
        let retryCount = 0;
        while (!questionArea && retryCount < 5) {
          questionArea = Solver.findAiWorkspaceQuestionArea(document);
          if (questionArea) break;
          retryCount++;
          this.panel.log(`未找到题目，等待页面加载... (${retryCount}/5)`);
          await Utils.sleep(1500);
        }
        if (!questionArea) {
          // 把 DOM 统计直接打到面板，便于在没有 F12 的情况下排查
          const stats = {
            subjectItem: document.querySelectorAll('.subject-item').length,
            itemBody: document.querySelectorAll('.item-body').length,
            problemBody: document.querySelectorAll('.problem-body').length,
            elRadio: document.querySelectorAll('label.el-radio, .homeworkElRadio').length,
            elCheckbox: document.querySelectorAll('label.el-checkbox, .homeworkElCheckbox').length,
            iframes: document.querySelectorAll('iframe').length
          };
          this.panel.log(`❌ 未找到题目（DOM subject-item=${stats.subjectItem} item-body=${stats.itemBody} problem-body=${stats.problemBody} radio=${stats.elRadio} checkbox=${stats.elCheckbox} iframe=${stats.iframes}）`);
          this.panel.log('💡 请确认题目已渲染。若 iframe>0 可能是跨域 iframe，请把里面的子域加到油猴头部 @match');
          this.panel.resetStartButton('开始答题');
          return;
        }

        this.panel.log(`📝 正在处理第 ${i + 1} 题...`);

        // 已答题检测：进入页面时若「提交」按钮已变成「已提交」，说明本题已作答（含用户回看上一题场景）
        // 直接点「下一题」推进，不查库不重选，避免白扣积分 / 把已对的答案改错
        if (this.isAiWorkspaceQuestionAnswered()) {
          const prevSnapshot = Solver.readAiWorkspaceFromDOM(questionArea);
          const prevQuestion = prevSnapshot.question || '';
          this.panel.log(`⏭️ 第 ${i + 1} 题已作答，跳过本题（不查库、不重选）`);
          const checkChanged = (timeoutMs) => Utils.poll(() => {
            const area = Solver.findAiWorkspaceQuestionArea(document);
            if (!area) return false;
            const f = Solver.readAiWorkspaceFromDOM(area);
            return !!(f.question && f.question !== prevQuestion);
          }, { interval: 300, timeout: timeoutMs });
          const nextReady = await Utils.poll(() => !!this.findAiWorkspaceNextButton(false), { interval: 400, timeout: 4000 });
          if (!nextReady) {
            this.findAiWorkspaceNextButton(true);
            this.panel.log('未找到可点击的「下一题」按钮，可能已是最后一题');
            break;
          }
          this.findAiWorkspaceNextButton(false).click();
          const advanced = await checkChanged(6000);
          if (!advanced) {
            this.panel.log('已作答态下点「下一题」未触发翻页，停止避免死循环');
            break;
          }
          await Utils.sleep(500);
          continue;
        }

        let currentQuestion = '';
        let usedAI = false; // 标记本题是否调用过 AI（用于决定题间延迟走 AI 限速还是普通短延迟）
        try {
          const result = await Solver.recognize(questionArea, i);
          currentQuestion = result?.question || '';
          if (result && result.question && result.question.length > 3) {
            let chosenAnswers = null;
            try {
              const bankResult = await Solver.askQuestionBank(
                result.question,
                result.options,
                result.type !== undefined ? result.type : 4,
                result.qid
              );
              if (Store.getAnswerMode() === 'ai') usedAI = true; // 用户选 AI 模式：askQuestionBank 内部直接调 AI
              if (bankResult && bankResult.answers && bankResult.answers.length > 0) {
                chosenAnswers = bankResult.answers;
              }
            } catch (bankErr) {
              this.panel.log(`题库查询出错：${bankErr}`);
            }
            if (!chosenAnswers || chosenAnswers.length === 0) {
              chosenAnswers = await this._aiWorkspaceFallbackAnswers(result);
              if (Store.getUnmatchedFallback() === 'ai' && chosenAnswers && chosenAnswers.length > 0) {
                usedAI = true; // 题库未命中走 AI 兜底，同样需要限速
              }
            }
            if (chosenAnswers && chosenAnswers.length > 0) {
              await Solver.autoSelectAndSubmit(chosenAnswers, questionArea, result.options, { autoSubmit: false, type: result.type });
            }
          } else {
            this.panel.log(`第 ${i + 1} 题识别失败，跳过`);
          }
        } catch (err) {
          this.panel.log(`第 ${i + 1} 题处理失败：${err}`);
        }

        // 推进到下一题：依次尝试「选项点击触发的自动提交」→「点提交按钮」→「点下一题按钮」，
        // 每一步后都检测题目文本是否变化，已变化就跳过后续点击，避免双重前进导致漏题。
        const checkAdvanced = (timeoutMs) => Utils.poll(() => {
          const area = Solver.findAiWorkspaceQuestionArea(document);
          if (!area) return false;
          const fresh = Solver.readAiWorkspaceFromDOM(area);
          return !!(fresh.question && fresh.question !== currentQuestion);
        }, { interval: 300, timeout: timeoutMs });

        await Utils.sleep(500);

        // Step 1: 选项点击是否已让平台自动提交并自动翻页？短轮询 1.5s
        let advanced = await checkAdvanced(1500);

        // Step 2: 没有自动翻页时尝试点「提交」（可能需要手动提交才进下一题）
        if (!advanced) {
          const submitBtn = this.findAiWorkspaceSubmitButton(true);
          if (submitBtn) {
            this.panel.log('✅ 点击提交保存本题答案');
            submitBtn.click();
            // 提交后页面有些场景会直接跳下一题（提交即翻页），有些只是锁定本题留给手动「下一题」。
            // 给 2.5s 让它如果会自己翻页就翻完，避免我们再点「下一题」造成多翻一题
            advanced = await checkAdvanced(2500);
          } else {
            this.panel.log('⚠️ 未匹配到「提交」按钮，尝试直接点下一题');
          }
        }

        // Step 3: 仍然停在原题就主动点「下一题」
        if (!advanced) {
          const nextReady = await Utils.poll(() => !!this.findAiWorkspaceNextButton(false), { interval: 400, timeout: 6000 });
          if (!nextReady) {
            this.findAiWorkspaceNextButton(true); // 失败时再调一次，把可见按钮列表打到面板
            this.panel.log('未找到可点击的「下一题」按钮，可能已是最后一题');
            break;
          }
          const nextBtn = this.findAiWorkspaceNextButton(false);
          nextBtn.click();
          advanced = await checkAdvanced(6000);
        }

        if (!advanced) {
          this.panel.log('未检测到题目变化，停止继续点击');
          break;
        }
        // 题间延迟：用过 AI 的题走 AI 限速防封号（解锁后 1.5s，未解锁 20s），其它仅 700ms 短延迟
        if (usedAI) {
          const aiUnlocked = Store.isAIUnlocked();
          const sleepMs = aiUnlocked ? (1500 + Math.random() * 500) : (35000 + Math.random() * 2000);
          if (!aiUnlocked) this.panel.log(`🤖 AI 限速冷却中，${Math.round(sleepMs/1000)} 秒后继续（解锁后可加速）...`);
          await Utils.sleep(sleepMs);
        } else {
          await Utils.sleep(700);
        }
      }
      this.panel.log('🎉 AI学习空间答题完成！请检查并手动提交');
      this.panel.resetStartButton('答题完成');
    }

    // AI workspace 视频/音频自动播放
    async _tryAiWorkspaceMedia() {
      const roots = (typeof Solver.collectAiWorkspaceRoots === 'function')
        ? Solver.collectAiWorkspaceRoots(document) : [document];

      // 搜索辅助函数
      const findMedia = () => {
        for (const r of roots) {
          try {
            const video = r.querySelector('video');
            if (video && (video.src || video.querySelector('source'))) {
              return { media: video, mediaType: '视频' };
            }
            const audio = r.querySelector('audio');
            if (audio && (audio.src || audio.querySelector('source'))) {
              return { media: audio, mediaType: '音频' };
            }
          } catch (_) { /* 跨域 iframe 可能抛错 */ }
        }
        // 再查雨课堂自定义播放器
        for (const r of roots) {
          try {
            const xtPlayer = r.querySelector('xt-video-player, .xt_video_player, [class*="video-player"], .video-box');
            if (xtPlayer) {
              const innerVideo = xtPlayer.querySelector('video');
              if (innerVideo) return { media: innerVideo, mediaType: '视频' };
            }
          } catch (_) {}
        }
        return null;
      };

      // 答题页面快速识别：有 .subject-item / .problem-body / 选项 → 直接判定为答题页
      const hasExerciseContent = () => {
        for (const r of roots) {
          try {
            if (r.querySelector('.subject-item, .problem-body, .item-body, .container-problem')) return true;
          } catch (_) {}
        }
        return false;
      };

      // 第一次检查
      let result = findMedia();
      let media = result?.media, mediaType = result?.mediaType;

      // 没找到媒体且也没有答题内容 → 等几秒（页面可能还在加载）
      if (!media && !hasExerciseContent()) {
        await Utils.sleep(3000);
        result = findMedia();
        media = result?.media;
        mediaType = result?.mediaType;
      }

      if (!media) return false; // 无媒体元素，回退到答题模式

      this.panel.log(`🎬 检测到AI学习空间${mediaType}，开始自动播放...`);
      preventScreenCheck();

      // 设置倍速 + 静音 + 自动播放
      Player.applyMediaDefault(media);
      this.panel.log(`⏩ 播放倍速: ${Config.playbackRate}x`);

      // 防暂停：监听 pause 事件自动恢复
      let stopObserve = null;
      const autoContinue = () => {
        if (stopRequested) return;
        if (media.paused && !media.ended) {
          setTimeout(() => {
            if (media.paused && !media.ended) {
              media.play().catch(() => {});
            }
          }, 800);
        }
      };
      media.addEventListener('pause', autoContinue);
      stopObserve = () => media.removeEventListener('pause', autoContinue);

      // 也尝试标准播放器的 observePause
      const playBtnTip = media.ownerDocument?.querySelector('.play-btn-tip');
      let stopObserve2 = null;
      if (playBtnTip) {
        stopObserve2 = Player.observePause(media);
      }

      // 等待播放完毕
      const maxWait = 4 * 60 * 60 * 1000; // 最长4小时
      try {
        await Utils.poll(() => {
          if (stopRequested) return true;
          if (media.ended) return true;
          // 检查进度条文本
          for (const r of roots) {
            const timeDisplay = r.querySelector('.xt_video_player_current_time_display, .video-time, .time-display');
            if (timeDisplay) {
              const times = timeDisplay.innerText || '';
              const [nowTime, totalTime] = times.split(' / ').map(t => t?.trim());
              if (nowTime && totalTime && nowTime === totalTime && totalTime !== '00:00') return true;
            }
          }
          // 检查进度百分比
          for (const r of roots) {
            const progressText = r.querySelector('.progress-wrap .text, .progress-text');
            if (progressText && Utils.isProgressDone(progressText.innerHTML)) return true;
          }
          // duration 对比
          if (media.duration > 0 && media.currentTime >= media.duration - 0.5) return true;
          return false;
        }, { interval: 2000, timeout: maxWait });
      } catch (e) {
        this.panel.log(`⚠️ ${mediaType}播放超时或异常`);
      }

      // 清理
      if (stopObserve) stopObserve();
      if (stopObserve2) stopObserve2();

      if (stopRequested) {
        this.panel.log('⏸️ 已停止');
        this.panel.resetStartButton('继续');
        return true;
      }

      this.panel.log(`✅ ${mediaType}播放完毕`);

      // 尝试点击"下一个"按钮
      await Utils.sleep(1500);
      const nextBtn = this.findAiWorkspaceClickableButton(['下一个', '下一节', '下一课', '下一题', '继续学习', '完成'], {});
      if (nextBtn) {
        this.panel.log('➡️ 点击下一节...');
        nextBtn.click();
        await Utils.sleep(2000);
      } else {
        this.panel.log('💡 未找到"下一节"按钮，请手动导航到下一课');
      }

      this.panel.resetStartButton('播放完成');
      return true;
    }

    async run() {
      this.panel.log('🎯 开始自动答题...');
      await Utils.sleep(2000);

      if (Solver.isAiWorkspaceExercisePage()) {
        // 先检测是否有视频/音频可播放（AI workspace 视频课也在 /ai-workspace/ 下）
        const mediaResult = await this._tryAiWorkspaceMedia();
        if (mediaResult) return; // 视频播放完成，不走答题
        // 没有检测到媒体 → 走答题流程
        await this.runAiWorkspaceExercise();
        return;
      }

      const totalFromData = interceptedProblems ? interceptedProblems.length : 0;
      const isInSidebar = (el) => !!(
        el.closest('.aside-body') || el.closest('.exam-aside') ||
        el.closest('.answer-sheet') || el.closest('.sheet-box') ||
        el.closest('.sheet-list') || el.closest('.problem-fixedbar')
      );
      const collectMainItems = () => {
        const containers = ['.container-problem', '.exam-main--body', '.exam-main', '.container-body'];
        for (const sel of containers) {
          const container = document.querySelector(sel);
          if (!container) continue;
          const items = Array.from(container.querySelectorAll('.subject-item')).filter(el => !isInSidebar(el));
          if (items.length > 0) return items;
        }
        return Array.from(document.querySelectorAll('.subject-item')).filter(el => !isInSidebar(el));
      };

      let navButtons = null;
      const navSelectors = [
        '.aside-body .subject-item',
        '.aside-body li',
        '.exam-aside .subject-item',
        '.sheet-box .item', '.sheet-list .item',
        '.answer-sheet .item'
      ];
      for (const sel of navSelectors) {
        const found = document.querySelectorAll(sel);
        if (found && found.length > 1) { navButtons = found; break; }
      }
      if (!navButtons || navButtons.length <= 1) {
        const allBtns = document.querySelectorAll('button, div[data-order]');
        const numBtns = Array.from(allBtns).filter(b => {
          const t = b.textContent.trim();
          return /^\d+$/.test(t) && parseInt(t) >= 1 && parseInt(t) <= 50;
        });
        if (numBtns.length >= 5) navButtons = numBtns;
      }

      let allItems = [];
      let retryCount = 0;
      while (retryCount < 5) {
        allItems = collectMainItems();
        if (allItems.length > 0 || (navButtons && navButtons.length > 1)) break;
        retryCount++;
        this.panel.log(`未找到题目，等待页面加载... (${retryCount}/5)`);
        await Utils.sleep(3000);
      }

      const hasNav = navButtons && navButtons.length > 1;
      const isPaginated = !!(hasNav && allItems.length <= 1);
      let totalQuestions = isPaginated ? navButtons.length : allItems.length;

      if (totalQuestions === 0 && totalFromData > 0) {
        totalQuestions = totalFromData;
      }

      if (totalQuestions === 0) {
        this.panel.log('❌ 未找到题目，请确认页面已加载完成');
        this.panel.resetStartButton('开始答题');
        return;
      }

      this.panel.log(`找到 ${totalQuestions} 道题目${isPaginated ? '（分页模式）' : '（长条模式）'}，开始答题`);

      for (let i = 0; i < totalQuestions; i++) {
        if (stopRequested) {
          this.panel.log('⏸️ 已停止答题');
          this.panel.resetStartButton('继续答题');
          return;
        }

        this.panel.log(`📝 正在处理第 ${i + 1}/${totalQuestions} 题...`);

        if (isPaginated && navButtons[i]) {
          navButtons[i].click();
          await Utils.sleep(1200);
        }

        let subjectItem, questionArea;
        if (isPaginated) {
          const freshItems = collectMainItems();
          subjectItem = freshItems[0] || null;
          if (!subjectItem) {
            const ib = document.querySelector('.container-problem .item-body') ||
                       document.querySelector('.exam-main--body .item-body') ||
                       document.querySelector('.container-body .item-body');
            if (ib) {
              questionArea = ib;
              subjectItem = ib.closest('.subject-item') || ib.parentElement || ib;
            }
          } else {
            questionArea = subjectItem.querySelector('.item-body') || subjectItem;
          }
        } else {
          subjectItem = allItems[i];
          questionArea = subjectItem ? (subjectItem.querySelector('.item-body') || subjectItem) : null;
          if (subjectItem) {
            subjectItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await Utils.sleep(800);
          }
        }

        if (!questionArea) {
          this.panel.log(`第 ${i + 1} 题未找到题目区域，跳过`);
          continue;
        }

        const checkEl = subjectItem || questionArea;
        if (checkEl && checkEl.querySelector(
          '.is-checked, .el-radio.is-checked, .el-checkbox.is-checked, .el-radio__input.is-checked, .el-checkbox__input.is-checked, input:checked'
        )) {
          this.panel.log(`第 ${i + 1} 题已作答，跳过`);
          continue;
        }

        try {
          const result = await Solver.recognize(questionArea, i);

          if (result && result.question && result.question.length > 3) {
            let answers;
            try {
              const bankResult = await Solver.askQuestionBank(
                result.question, result.options, result.type !== undefined ? result.type : 4, result.qid
              );
              answers = bankResult.answers;
            } catch (firstErr) {
              const errStr = String(firstErr);
              const isNotFound = errStr.includes('未匹配') || errStr.includes('未找到');
              if (!isNotFound) {
                this.panel.log('⚠️ 查询异常，2秒后重试...');
                await Utils.sleep(2000);
                try {
                  const retryResult = await Solver.askQuestionBank(
                    result.question, result.options, result.type !== undefined ? result.type : 4, result.qid
                  );
                  answers = retryResult.answers;
                } catch (retryErr) {
                  throw retryErr;
                }
              } else {
                throw firstErr;
              }
            }
            // AI 兜底：题库未命中时调用 AI
            let usedAIHere = false;
            if (!answers || answers.length === 0) {
              const aiAnswers = await Solver.aiFallback(result, this.panel.log.bind(this.panel), `第 ${i + 1} 题 `);
              if (aiAnswers && aiAnswers.length > 0) {
                answers = aiAnswers;
                usedAIHere = true;
              }
            }
            if (answers && answers.length > 0) {
              await Solver.autoSelectAndSubmit(answers, subjectItem || questionArea, result.options, { autoSubmit: isPaginated, type: result.type });
            } else {
              this.panel.log(`第 ${i + 1} 题无答案，跳过`);
            }
            await Utils.sleep(1500);
            // 题间延迟：用过 AI 走 AI 限速冷却
            const _useAICooldown = Store.getAnswerMode() === 'ai' || usedAIHere;
            if (_useAICooldown) {
              const _aiUnlocked = Store.isAIUnlocked();
              const _aiDelay2 = _aiUnlocked ? (1500 + Math.random() * 500) : (35000 + Math.random() * 2000);
              if (!_aiUnlocked) this.panel.log(`AI限速冷却中，${Math.round(_aiDelay2/1000)}秒后继续（解锁后可加速）...`);
              await Utils.sleep(_aiDelay2);
            } else {
              await Utils.sleep(1000);
            }
          } else {
            this.panel.log(`第 ${i + 1} 题识别失败，跳过`);
            await Utils.sleep(1000);
          }
        } catch (err) {
          this.panel.log(`第 ${i + 1} 题查询失败：${err}`);
          await Utils.sleep(1000);
        }
      }

      this.panel.log('🎉 答题完成！请检查并提交');
      this.panel.resetStartButton('答题完成');
    }
  }

  // ---- pro/lms 旧版（仅做转发） ----
  class ProOldRunner {
    constructor(panel) {
      this.panel = panel;
    }
    run() {
      this.panel.log('准备打开新标签页...');
      const leafDetail = document.querySelectorAll('.leaf-detail');
      let classCount = Store.getProClassCount() - 1;
      while (leafDetail[classCount] && !leafDetail[classCount].firstChild.querySelector('i').className.includes('shipin')) {
        classCount++;
        Store.setProClassCount(classCount + 1);
        this.panel.log('课程不属于视频，已跳过');
      }
      Store.touchRunState();
      leafDetail[classCount]?.click();
    }
  }
  // ---- pro/lms 新版（主要逻辑） ----
  class ProNewRunner {
    constructor(panel) {
      this.panel = panel;
    }
    async run() {
      preventScreenCheck();
      let classCount = Store.getProClassCount();
      while (true) {
        // 检查是否请求停止
        if (stopRequested) {
          this.panel.log('⏸️ 已停止刷课');
          this.panel.resetStartButton('继续刷课');
          return;
        }

        this.panel.log(`准备播放第 ${classCount} 集...`);
        await Utils.sleep(2000);
        const className = document.querySelector('.header-bar')?.firstElementChild?.innerText || '';
        const classType = document.querySelector('.header-bar')?.firstElementChild?.firstElementChild?.getAttribute('class') || '';
        const classStatus = document.querySelector('#app > div.app_index-wrapper > div.wrap > div.viewContainer.heightAbsolutely > div > div > div > div > section.title')?.lastElementChild?.innerText || '';
        if (classType.includes('tuwen') && !classStatus.includes('已读')) {
          this.panel.log(`正在阅读：${className}`);
          await Utils.sleep(2000);
        } else if (classType.includes('taolun')) {
          this.panel.log(`讨论区暂不自动发帖，${className}`);
          await Utils.sleep(2000);
        } else if (classType.includes('shipin') && !classStatus.includes('100%')) {
          this.panel.log(`2s 后开始播放：${className}`);
          await Utils.sleep(2000);
          let statusTimer;
          let videoTimer;
          let stopVideoObserve = null;
          try {
            statusTimer = setInterval(() => {
              const status = document.querySelector('#app > div.app_index-wrapper > div.wrap > div.viewContainer.heightAbsolutely > div > div > div > div > section.title')?.lastElementChild?.innerText || '';
              if (status.includes('100%') || status.includes('99%') || status.includes('98%') || status.includes('已完成')) {
                this.panel.log(`${className} 播放完毕`);
                clearInterval(statusTimer);
                statusTimer = null;
              }
            }, 200);

            const videoWaitStart = Date.now();
            videoTimer = setInterval(() => {
              const video = document.querySelector('video');
              if (video) {
                setTimeout(() => {
                  Player.applySpeed();
                  Player.mute();
                  stopVideoObserve = Player.observePause(video);
                }, 2000);
                clearInterval(videoTimer);
                videoTimer = null;
              } else if (Date.now() - videoWaitStart > 20000) {
                location.reload();
              }
            }, 5000);

            await Utils.sleep(8000);
            await Utils.poll(() => {
              const status = document.querySelector('#app > div.app_index-wrapper > div.wrap > div.viewContainer.heightAbsolutely > div > div > div > div > section.title')?.lastElementChild?.innerText || '';
              return status.includes('100%') || status.includes('99%') || status.includes('98%') || status.includes('已完成');
            }, { interval: 1000, timeout: await Utils.getDDL() });
          } finally {
            if (statusTimer) clearInterval(statusTimer);
            if (videoTimer) clearInterval(videoTimer);
            if (stopVideoObserve) stopVideoObserve();
          }
        } else if (classType.includes('zuoye')) {
          this.panel.log(`进入作业：${className}（暂无自动答题）`);
          await Utils.sleep(2000);
        } else if (classType.includes('kaoshi')) {
          this.panel.log(`进入考试：${className}（不会自动答题）`);
          await Utils.sleep(2000);
        } else if (classType.includes('ketang')) {
          const featureFlags = Store.getFeatureConf();
          if (featureFlags.skipLive) {
            this.panel.log(`直播课/课堂：${className}，已设置跳过`);
          } else {
            this.panel.log(`进入课堂：${className}（暂无自动功能）`);
          }
          await Utils.sleep(2000);
        } else {
          this.panel.log(`已看过：${className}`);
          await Utils.sleep(2000);
        }
        this.panel.log(`第 ${classCount} 集播放完毕`);
        classCount++;
        Store.setProClassCount(classCount);
        const nextBtn = document.querySelector('.btn-next');
        if (nextBtn) {
          const event1 = new Event('mousemove', { bubbles: true });
          event1.clientX = 9999;
          event1.clientY = 9999;
          nextBtn.dispatchEvent(event1);
          Store.touchRunState();
          nextBtn.dispatchEvent(new Event('click'));
        } else {
          localStorage.removeItem(Config.storageKeys.proClassCount);
          Store.setRunState('completed');
          this.panel.log('课程播放完毕 🎉');
          this.panel.resetStartButton('刷完啦~');
          break;
        }
      }
    }
  }

  // ---- 最小化面板状态更新 ----
  let miniTimer = null;
  function startMiniStatusUpdate(p) {
    if (miniTimer) return;
    miniTimer = setInterval(() => {
      if (!isRunning) {
        p.updateMiniStatus('📚', '雨课堂助手');
        clearInterval(miniTimer);
        miniTimer = null;
        return;
      }
      const video = document.querySelector('video');
      if (video && !video.paused && video.duration) {
        const remaining = video.duration - video.currentTime;
        const min = Math.floor(remaining / 60).toString().padStart(2, '0');
        const sec = Math.floor(remaining % 60).toString().padStart(2, '0');
        p.updateMiniStatus('▶️', `${min}:${sec}`);
      } else {
        p.updateMiniStatus('⏳', '下一节...');
      }
    }, 1000);
  }

  // ---- 自动恢复判断 ----
  function shouldAutoResume(state, url, running, now) {
    if (!state) return false;
    if (state.status !== 'running') return false;
    if (now - state.lastActiveTime > 1800000) return 'expired';
    if (!url.includes('pro/lms')) return false;
    if (running) return false;
    return true;
  }

  function waitForDOMReady(p, timeout = 15000) {
    const selectors = ['.btn-next', '.header-bar', '.leaf-detail'];
    return new Promise(resolve => {
      if (selectors.some(s => document.querySelector(s))) { resolve(); return; }
      p.log('等待页面加载中...');
      const start = Date.now();
      const timer = setInterval(() => {
        if (selectors.some(s => document.querySelector(s)) || Date.now() - start > timeout) {
          clearInterval(timer);
          resolve();
        }
      }, 500);
    });
  }

  function setupRouteListener(p) {
    let lastUrl = location.href;
    let debounceTimer = null;
    const onRouteChange = () => {
      const currentUrl = location.href;
      if (currentUrl === lastUrl) return;
      lastUrl = currentUrl;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(async () => {
        const result = shouldAutoResume(Store.getRunState(), currentUrl, isRunning, Date.now());
        if (result === true) {
          p.log('检测到路由变化，自动恢复刷课中...');
          await waitForDOMReady(p);
          if (!isRunning) {
            isRunning = true;
            stopRequested = false;
            p.btnStart.innerText = '⏸️ 停止刷课';
            p.log('自动恢复刷课中...');
            startMiniStatusUpdate(p);
            start();
          }
        }
      }, 1000);
    };
    window.addEventListener('popstate', onRouteChange);
    const origPush = history.pushState;
    const origReplace = history.replaceState;
    history.pushState = function(...args) { origPush.apply(this, args); onRouteChange(); };
    history.replaceState = function(...args) { origReplace.apply(this, args); onRouteChange(); };
  }

  // ---- 路由 ----
  async function start() {
    const url = location.host;
    const path = location.pathname.split('/');
    const matchURL = `${url}${path[0]}/${path[1]}/${path[2]}`;
    panel.log(`正在匹配处理逻辑：${matchURL}`);

    // 检查是否是考试页面（含 AI 学习空间 lms-graph/exercise 等子路由）
    if (url.includes('exam.yuketang.cn') || path.includes('exam') || path.includes('exercise') || path.includes('homework') || path.includes('ai-workspace')) {
      // 检查是否是结果页面
      if (location.pathname.includes('/result/')) {
        panel.log('检测到考试结果页面，无法答题');
        panel.log('💡 提示：此页面为已完成的考试结果，无法修改答案');
        panel.resetStartButton('查看结果');
        return;
      }

      const isAiWs = location.pathname.includes('/ai-workspace/');
      panel.log(isAiWs ? '检测到AI学习空间，准备启动（支持视频播放+自动答题）' : '检测到考试页面，准备启动自动答题功能');

      // AI workspace 直接启动（视频播放不需要题库配置，答题时内部会检查）
      if (isAiWs) {
        new ExamRunner(panel).run();
        return;
      }

      // 检查是否启用自动答题
      const featureFlags = Store.getFeatureConf();
      if (!featureFlags.autoAI) {
        panel.log('⚠️ 请先在【题库配置】中启用自动答题功能');
        panel.resetStartButton('开始答题');
        return;
      }

      // 检查验证/激活状态
      const mode = Store.getAnswerMode();
      if (mode === 'ai') {
        if (!Store.getAIApiKey()) {
          panel.log('⚠️ 未配置AI API Key，请先在【题库配置】中填写');
          panel.resetStartButton('开始答题');
          return;
        }
        panel.log('✅ AI答题模式，启动自动答题');
      } else if (mode === 'free') {
        // 免费模式，检查验证码
        if (!Store.isVerifyValid()) {
          panel.log('⚠️ 验证码未验证或已过期，请先在【题库配置】中验证');
          panel.resetStartButton('开始答题');
          return;
        }
        panel.log('✅ 验证码有效，启动自动答题');
      } else {
        // 付费模式，检查积分（不阻止启动，只提示）
        panel.log('✅ 付费模式，启动自动答题');
      }

      // 启动考试答题
      new ExamRunner(panel).run();
      return;
    }

    if (matchURL.includes('yuketang.cn/v2/web') || matchURL.includes('gdufemooc.cn/v2/web')) {
      new V2Runner(panel).run();
    } else if (matchURL.includes('yuketang.cn/pro/lms') || matchURL.includes('gdufemooc.cn/pro/lms')) {
      // 视频播放页：.btn-next 可能异步加载，需要等待
      if (location.pathname.includes('/video/')) {
        const found = await Utils.poll(() => document.querySelector('.btn-next'), { interval: 500, timeout: 10000 });
        if (found) {
          new ProNewRunner(panel).run();
        } else {
          panel.log('⚠️ 未找到播放控件，尝试刷新页面');
          location.reload();
        }
      } else if (document.querySelector('.btn-next')) {
        new ProNewRunner(panel).run();
      } else {
        new ProOldRunner(panel).run();
      }
    } else {
      panel.resetStartButton('开始刷课');
      panel.log('当前页面非刷课页面，应匹配 */v2/web/* 或 */pro/lms/*');
      panel.log('考试页面请点击【开始答题】启动自动答题');
    }
  }

  // ---- 启动 ----
  if (Utils.inIframe()) return;

  // 尽早设置 JSON Hook（在 document-start 阶段拦截数据）
  setupFontFaceHook(); // FontFace 构造函数 hook 必须最早，捕获 ArrayBuffer 字体
  setupJSONParseHook();
  loadGlyphHashMap(); // 预加载字形映射表

  // 等待 document.body 加载完成
  const waitForBody = () => {
    return new Promise(resolve => {
      if (document.body) {
        resolve();
      } else {
        const observer = new MutationObserver(() => {
          if (document.body) {
            observer.disconnect();
            resolve();
          }
        });
        observer.observe(document.documentElement, { childList: true });
      }
    });
  };

  // 初始化面板
  (async () => {
    await waitForBody();
    panel = createPanel();
    // 从存储恢复播放倍速
    Config.playbackRate = Store.getPlaybackRate();
    // 初始信息已在HTML中显示，不需要额外log
    panel.setStartHandler(start);

    // 自动恢复检测
    const runState = Store.getRunState();
    const resumeResult = shouldAutoResume(runState, location.href, isRunning, Date.now());
    if (resumeResult === 'expired') {
      Store.clearRunState();
      panel.log('⏰ 刷课状态已过期，请重新开始');
    } else if (resumeResult === true) {
      panel.log('🔄 检测到未完成的刷课任务...');
      await waitForDOMReady(panel);
      panel.log('🔄 自动恢复刷课中...');
      isRunning = true;
      stopRequested = false;
      panel.btnStart.innerText = '⏸️ 停止刷课';
      startMiniStatusUpdate(panel);
      start();
    }

    // 启动 SPA 路由监听
    setupRouteListener(panel);
  })();

})();