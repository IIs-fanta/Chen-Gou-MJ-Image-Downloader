// ==UserScript==
// @name         陈狗MJ图片下载器
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  该脚本为 Discord 网页版中的 Midjourney 图片添加下载和复制链接功能，方便用户快速获取图片资源。
// @author       陈狗
// @match        https://discord.com/*
// @grant        GM_download
// @grant        GM_setClipboard
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 常量定义
    const PROCESSED_TARGET_MARKER = 'data-image-enhancer-target-processed';
    const BUTTON_CONTAINER_CLASS = 'custom-image-buttons-container';
    const ICON_PATH = 'c:/Users/Administrator/Desktop/midjourney-downloader/icons/logo.ico';

    // 图片父元素选择器列表
    const imageParentSelectors = [
        'div[class*="visualMediaItemContainer_"]',
        'div[class*="imageContent-"]',
        'div[class*="imageContainer-"]',
        'div[class*="imageWrapper-"]',
        'div[class*="clickableWrapper-"]',
        'div[class*="embedMedia-"]',
        'div[class*="attachmentContentContainer-"]',
        'div[class*="mediaMosaicSrc-"]',
        'div[class*="mediaAttachmentsContainer-"]',
        'div[class*="messageAttachment-"]',
        'figure[class*="imageContainer-"]'
    ];

    /**
     * 从元素中提取图片URL
     * @param {HTMLElement} element - 要提取URL的元素
     * @returns {string|null} - 提取的URL或null
     */
    function getImageUrl(element) {
        if (element.tagName === 'IMG' && element.src) {
            return element.src;
        }
        
        if (element.tagName === 'A' && element.href) {
            const imgElement = element.querySelector('img');
            if (imgElement && imgElement.src && (imgElement.src.includes('discordapp.com') || imgElement.src.includes('discordapp.net'))) {
                return imgElement.src;
            }
            if (element.href.match(/\.(jpeg|jpg|gif|png|webp|avif)(#.*)?$/i) || element.href.includes('discordapp.com') || element.href.includes('discordapp.net')) {
                return element.href;
            }
        }
        
        if (element.style && element.style.backgroundImage) {
            const bgImage = element.style.backgroundImage;
            const match = bgImage.match(/url\("?([^"]+)"?\)/);
            if (match && match[1]) {
                return match[1];
            }
        }
        
        const childImg = element.querySelector('img[src*="cdn.discordapp.com"], img[src*="media.discordapp.net"]');
        if (childImg && childImg.src) {
            return childImg.src;
        }
        
        return null;
    }

    /**
     * 获取可分享的CDN URL
     * @param {string} url - 原始URL
     * @returns {string|null} - 处理后的URL或null
     */
    function getShareableCdnUrl(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }
        
        try {
            const originalUrl = new URL(url);
            const cdnHostname = 'cdn.discordapp.com';
            let finalPathname = originalUrl.pathname;

            if (!finalPathname.startsWith('/')) {
                finalPathname = '/' + finalPathname;
            }

            let newUrlString = `https://${cdnHostname}${finalPathname}`;

            const paramsToKeep = ['ex', 'is', 'hm'];
            const newSearchParams = new URLSearchParams();
            let paramsKept = false;

            originalUrl.searchParams.forEach((value, key) => {
                if (paramsToKeep.includes(key.toLowerCase())) {
                    if (value) {
                        newSearchParams.append(key, value);
                        paramsKept = true;
                    }
                }
            });

            if (paramsKept) {
                newUrlString += '?' + newSearchParams.toString();
            }
            
            return newUrlString;

        } catch (e) {
            console.warn('[DEBUG] getShareableCdnUrl: Failed to parse or process URL:', url, e);
            return url;
        }
    }

    /**
     * 向图片包装器添加按钮
     * @param {HTMLElement} imageElementWrapper - 图片包装器元素
     * @param {string} detectedImageUrl - 检测到的图片URL
     */
    function addButtonsToImageWrapper(imageElementWrapper, detectedImageUrl) {
        if (!imageElementWrapper || !imageElementWrapper.parentNode) {
            console.error('[DEBUG] addButtonsToImageWrapper: Target wrapper or its parent is invalid.');
            return;
        }

        const shareableCdnUrl = getShareableCdnUrl(detectedImageUrl);

        if (!shareableCdnUrl) {
            console.warn('[DEBUG] addButtonsToImageWrapper: Could not derive a shareable CDN URL from:', detectedImageUrl);
            return;
        }

        // 检查是否已存在按钮容器
        let existingButtonContainer = imageElementWrapper.nextElementSibling;
        if (existingButtonContainer && existingButtonContainer.classList.contains(BUTTON_CONTAINER_CLASS) && existingButtonContainer.dataset.imageUrl === shareableCdnUrl) {
            if (!imageElementWrapper.hasAttribute(PROCESSED_TARGET_MARKER)) {
                imageElementWrapper.setAttribute(PROCESSED_TARGET_MARKER, 'true');
            }
            return;
        }
        
        if (existingButtonContainer && existingButtonContainer.classList.contains(BUTTON_CONTAINER_CLASS)) {
            existingButtonContainer.remove();
        }

        // 创建按钮容器
        let buttonContainer = document.createElement('div');
        buttonContainer.className = BUTTON_CONTAINER_CLASS;
        buttonContainer.setAttribute('data-image-url', shareableCdnUrl);

        // 创建下载按钮
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'custom-image-button custom-download-button';
        downloadBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 保存原图`;
        downloadBtn.onclick = async (e) => {
            e.stopPropagation();
            e.preventDefault();
            downloadBtn.disabled = true;
            downloadBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 保存中...`;
            
            try {
                const response = await fetch(shareableCdnUrl);
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                
                // 从URL中提取文件名或使用默认名
                const urlParts = shareableCdnUrl.split('/');
                let fileName = urlParts[urlParts.length - 1].split('?')[0];
                if (!fileName || fileName === '') {
                    fileName = 'midjourney_image.png';
                }
                
                GM_download({
                    url: objectUrl,
                    name: fileName,
                    saveAs: true
                });
                
                setTimeout(() => {
                    downloadBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 已保存!`;
                    downloadBtn.disabled = false;
                }, 2000);
                
            } catch (error) {
                console.error('下载图片失败:', error);
                downloadBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 下载失败`;
                setTimeout(() => {
                    downloadBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 保存原图`;
                    downloadBtn.disabled = false;
                }, 2000);
            }
        };

        // 创建复制链接按钮
        const copyLinkBtn = document.createElement('button');
        copyLinkBtn.className = 'custom-image-button custom-copy-link-button';
        copyLinkBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 复制链接`;
        copyLinkBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            copyLinkBtn.disabled = true;
            
            try {
                GM_setClipboard(shareableCdnUrl);
                copyLinkBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 已复制!`;
                setTimeout(() => {
                    copyLinkBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 复制链接`;
                    copyLinkBtn.disabled = false;
                }, 2000);
            } catch (error) {
                console.error('复制链接失败:', error);
                copyLinkBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 复制失败`;
                setTimeout(() => {
                    copyLinkBtn.innerHTML = `<img src="${ICON_PATH}" class="button-icon"> 复制链接`;
                    copyLinkBtn.disabled = false;
                }, 2000);
            }
        };

        // 添加按钮到容器
        buttonContainer.appendChild(downloadBtn);
        buttonContainer.appendChild(copyLinkBtn);

        // 插入到DOM中
        imageElementWrapper.parentNode.insertBefore(buttonContainer, imageElementWrapper.nextSibling);
        imageElementWrapper.setAttribute(PROCESSED_TARGET_MARKER, 'true');
    }

    /**
     * 扫描页面中的图片并添加按钮
     */
    function scanForImages() {
        const potentialWrappers = document.querySelectorAll(imageParentSelectors.join(', '));

        potentialWrappers.forEach((potentialWrapper) => {
            // 跳过已处理的元素
            if (potentialWrapper.hasAttribute(PROCESSED_TARGET_MARKER)) {
                return;
            }

            let elementForUrlExtraction = 
                potentialWrapper.querySelector('img[src*="discordapp.com"], img[src*="discordapp.net"]') ||
                potentialWrapper.querySelector('a[href*="discordapp.com"], a[href*="discordapp.net"]') ||
                potentialWrapper;

            const currentDetectedUrlInDom = getImageUrl(elementForUrlExtraction);
            if (currentDetectedUrlInDom) {
                addButtonsToImageWrapper(potentialWrapper, currentDetectedUrlInDom);
            }
        });
    }

    /**
     * 初始化并启动观察者
     */
    function startObserver() {
        // 初始扫描
        scanForImages();
        
        // 设置观察者监控DOM变化
        const observer = new MutationObserver((mutationsList) => {
            let shouldScan = false;
            for (const mutation of mutationsList) {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === Node.ELEMENT_NODE) {
                            shouldScan = true;
                            break;
                        }
                    }
                }
            }
            if (shouldScan) {
                scanForImages();
            }
        });

        // 开始观察
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    // 添加样式
    const style = document.createElement('style');
    style.innerHTML = `
        /* 自定义按钮容器 */
        .${BUTTON_CONTAINER_CLASS} {
          display: flex;
          flex-direction: row;
          gap: 8px;
          background-color: #202225;
          padding: 6px 8px;
          border-radius: 5px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
          pointer-events: auto;
          margin-top: 8px;
          margin-bottom: 8px;
          justify-self: center;
        }

        /* 通用按钮样式 */
        .custom-image-button {
          color: #FFFFFF;
          border: 1px solid rgba(0,0,0,0.2);
          padding: 8px 12px;
          border-radius: 4px;
          cursor: pointer;
          font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif;
          font-size: 13px;
          font-weight: 600;
          transition: background-color 0.15s ease, color 0.15s ease, transform 0.1s ease, border-color 0.15s ease;
          display: flex;
          align-items: center;
          justify-content: center;
          min-width: 100px;
          box-sizing: border-box;
          gap: 6px;
          line-height: 1.2;
        }

        /* 按钮图标样式 */
        .button-icon {
          width: 16px;
          height: 16px;
          vertical-align: middle;
          display: inline-block;
        }

        /* 按钮禁用状态 */
        .custom-image-button:disabled {
          background-color: #9e9e9e;
          cursor: not-allowed;
          color: #b0b0b0;
          transform: none !important;
        }

        /* 悬停效果 */
        .custom-image-button:hover:not(:disabled) {
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }

        /* 按钮点击时效果 */
        .custom-image-button:active:not(:disabled) {
          transform: translateY(0px);
          box-shadow: inset 0 1px 2px rgba(0,0,0,0.1);
        }

        /* 保存原图按钮 - 绿色 */
        .custom-download-button {
          background-color: #72b572;
          border-color: #5f985f;
        }

        .custom-download-button:hover:not(:disabled) {
          background-color: #65a565;
          border-color: #508750;
        }

        .custom-download-button:active:not(:disabled) {
          background-color: #589558;
        }

        /* 复制链接按钮 - 紫色 */
        .custom-copy-link-button {
          background-color: #9b84d7;
          border-color: #836fc0;
        }

        .custom-copy-link-button:hover:not(:disabled) {
          background-color: #8c73c6;
          border-color: #725ea9;
        }

        .custom-copy-link-button:active:not(:disabled) {
          background-color: #7d63b5;
        }
    `;
    document.head.appendChild(style);

    // 启动脚本
    startObserver();
})();