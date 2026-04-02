/**
 * Lovable Chat Widget v1.0
 * Embeddable chat widget for websites
 * 
 * Usage:
 * <script src="https://your-domain.com/chat-widget.js" data-empresa="your-empresa-slug"></script>
 */
(function() {
  'use strict';

  // Configuration
  const WIDGET_ID = 'lovable-chat-widget';
  const IFRAME_ID = 'lovable-chat-iframe';
  const BUTTON_ID = 'lovable-chat-button';
  
  // Get configuration from script tag
  const scriptTag = document.currentScript || (function() {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].src.includes('chat-widget.js')) {
        return scripts[i];
      }
    }
    return null;
  })();

  if (!scriptTag) {
    console.error('[Lovable Chat] Could not find script tag');
    return;
  }

  const empresaSlug = scriptTag.getAttribute('data-empresa');
  const position = scriptTag.getAttribute('data-position') || 'right'; // 'left' or 'right'
  const primaryColor = scriptTag.getAttribute('data-color') || '#6366f1';
  const buttonSize = scriptTag.getAttribute('data-size') || '60';

  if (!empresaSlug) {
    console.error('[Lovable Chat] Missing data-empresa attribute');
    return;
  }

  // Determine base URL from script source
  const scriptSrc = scriptTag.src;
  const baseUrl = scriptSrc.substring(0, scriptSrc.lastIndexOf('/'));
  const chatUrl = `${baseUrl.replace('/chat-widget.js', '')}/chat/${empresaSlug}?embed=true`;

  // Styles
  const styles = `
    #${WIDGET_ID} {
      position: fixed;
      bottom: 20px;
      ${position === 'left' ? 'left: 20px;' : 'right: 20px;'}
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    #${BUTTON_ID} {
      width: ${buttonSize}px;
      height: ${buttonSize}px;
      border-radius: 50%;
      background: ${primaryColor};
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
    }

    #${BUTTON_ID}:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }

    #${BUTTON_ID}:active {
      transform: scale(0.95);
    }

    #${BUTTON_ID} svg {
      width: 28px;
      height: 28px;
      fill: white;
    }

    #${BUTTON_ID}.open svg.chat-icon {
      display: none;
    }

    #${BUTTON_ID}.open svg.close-icon {
      display: block;
    }

    #${BUTTON_ID}:not(.open) svg.chat-icon {
      display: block;
    }

    #${BUTTON_ID}:not(.open) svg.close-icon {
      display: none;
    }

    #${IFRAME_ID}-container {
      position: fixed;
      bottom: 90px;
      ${position === 'left' ? 'left: 20px;' : 'right: 20px;'}
      width: 380px;
      height: 600px;
      max-height: calc(100vh - 120px);
      max-width: calc(100vw - 40px);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
      opacity: 0;
      visibility: hidden;
      transform: translateY(20px) scale(0.95);
      transition: opacity 0.3s ease, transform 0.3s ease, visibility 0.3s;
      z-index: 999998;
    }

    #${IFRAME_ID}-container.open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }

    #${IFRAME_ID} {
      width: 100%;
      height: 100%;
      border: none;
      background: white;
    }

    @media (max-width: 480px) {
      #${IFRAME_ID}-container {
        bottom: 0;
        left: 0;
        right: 0;
        width: 100%;
        height: 100%;
        max-height: 100vh;
        max-width: 100vw;
        border-radius: 0;
      }

      #${WIDGET_ID} {
        bottom: 16px;
        ${position === 'left' ? 'left: 16px;' : 'right: 16px;'}
      }
    }

    /* Notification badge */
    #${BUTTON_ID} .notification-badge {
      position: absolute;
      top: -4px;
      right: -4px;
      width: 20px;
      height: 20px;
      background: #ef4444;
      border-radius: 50%;
      color: white;
      font-size: 12px;
      font-weight: 600;
      display: none;
      align-items: center;
      justify-content: center;
      border: 2px solid white;
    }

    #${BUTTON_ID}.has-notification .notification-badge {
      display: flex;
    }
  `;

  // Chat icon SVG
  const chatIconSvg = `
    <svg class="chat-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/>
    </svg>
  `;

  // Close icon SVG
  const closeIconSvg = `
    <svg class="close-icon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
    </svg>
  `;

  // Create widget elements
  function createWidget() {
    // Add styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = styles;
    document.head.appendChild(styleSheet);

    // Create container
    const container = document.createElement('div');
    container.id = WIDGET_ID;

    // Create iframe container
    const iframeContainer = document.createElement('div');
    iframeContainer.id = `${IFRAME_ID}-container`;

    // Create iframe
    const iframe = document.createElement('iframe');
    iframe.id = IFRAME_ID;
    iframe.title = 'Chat';
    iframe.setAttribute('loading', 'lazy');
    
    iframeContainer.appendChild(iframe);

    // Create button
    const button = document.createElement('button');
    button.id = BUTTON_ID;
    button.setAttribute('aria-label', 'Open chat');
    button.innerHTML = `
      ${chatIconSvg}
      ${closeIconSvg}
      <span class="notification-badge">1</span>
    `;

    container.appendChild(iframeContainer);
    container.appendChild(button);
    document.body.appendChild(container);

    // State
    let isOpen = false;
    let iframeLoaded = false;

    // Toggle chat
    function toggleChat() {
      isOpen = !isOpen;
      
      if (isOpen) {
        button.classList.add('open');
        iframeContainer.classList.add('open');
        button.setAttribute('aria-label', 'Close chat');
        
        // Load iframe on first open
        if (!iframeLoaded) {
          iframe.src = chatUrl;
          iframeLoaded = true;
        }
      } else {
        button.classList.remove('open');
        iframeContainer.classList.remove('open');
        button.setAttribute('aria-label', 'Open chat');
      }
    }

    button.addEventListener('click', toggleChat);

    // Listen for messages from iframe
    window.addEventListener('message', function(event) {
      // Verify origin for security
      if (!event.origin.includes(new URL(chatUrl).hostname)) {
        return;
      }

      const data = event.data;
      
      if (data.type === 'lovable-chat-close') {
        if (isOpen) {
          toggleChat();
        }
      }
      
      if (data.type === 'lovable-chat-notification') {
        button.classList.add('has-notification');
      }
    });

    // Clear notification when opening
    button.addEventListener('click', function() {
      button.classList.remove('has-notification');
    });

    // Expose API
    window.LovableChat = {
      open: function() {
        if (!isOpen) toggleChat();
      },
      close: function() {
        if (isOpen) toggleChat();
      },
      toggle: toggleChat,
      isOpen: function() {
        return isOpen;
      }
    };

    console.log('[Lovable Chat] Widget initialized for:', empresaSlug);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createWidget);
  } else {
    createWidget();
  }
})();
