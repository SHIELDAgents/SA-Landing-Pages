/**
 * SHIELD Camera Capture Module (Feature Flagged)
 * To enable, set window.SHIELD_CONFIG = { enableCamera: true } before initialization
 * or trigger ShieldCamera.init() when feature flag is active.
 */

window.ShieldCamera = (() => {
    let stream = null;
    let videoElement = null;
    let containerElement = null;

    const isEnabled = () => {
        return window.SHIELD_CONFIG && window.SHIELD_CONFIG.enableCamera === true;
    };

    const init = async (targetContainerId) => {
        if (!isEnabled()) {
            console.log('[SHIELD] Camera module is disabled by feature flag.');
            return false;
        }

        try {
            containerElement = document.getElementById(targetContainerId) || document.body;
            
            videoElement = document.createElement('video');
            videoElement.setAttribute('playsinline', '');
            videoElement.setAttribute('autoplay', '');
            videoElement.style.width = '100%';
            videoElement.style.maxWidth = '400px';
            videoElement.style.border = '1px solid #00ff66';
            containerElement.appendChild(videoElement);

            stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'user' }, 
                audio: false 
            });
            videoElement.srcObject = stream;
            
            console.log('[SHIELD] Camera initialized successfully.');
            return true;
        } catch (error) {
            console.error('[SHIELD] Failed to initialize camera:', error);
            return false;
        }
    };

    const capturePhoto = () => {
        if (!isEnabled() || !videoElement) {
            console.warn('[SHIELD] Camera not active or feature flag disabled.');
            return null;
        }

        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth || 640;
        canvas.height = videoElement.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        return canvas.toDataURL('image/jpeg', 0.85);
    };

    const stop = () => {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
        }
        if (videoElement && videoElement.parentNode) {
            videoElement.parentNode.removeChild(videoElement);
            videoElement = null;
        }
        console.log('[SHIELD] Camera stopped.');
    };

    return {
        isEnabled,
        init,
        capturePhoto,
        stop
    };
})();
