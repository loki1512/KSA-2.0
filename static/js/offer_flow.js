/**
 * Offer Flow JavaScript
 * Handles multi-step offer landing page flow
 */

document.addEventListener('DOMContentLoaded', function() {
    // Session expiry check
    checkSessionValidity();
    
    // Session timeout: 30 minutes
    const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 minutes in milliseconds
    
    // Reset session timeout on any user activity
    document.addEventListener('click', resetSessionTimeout);
    document.addEventListener('keypress', resetSessionTimeout);
    
    function resetSessionTimeout() {
        sessionStorage.setItem('lastActivity', Date.now());
    }
    
    function checkSessionValidity() {
        // Check if session has expired
        const lastActivity = sessionStorage.getItem('lastActivity');
        if (lastActivity) {
            const timeSinceActivity = Date.now() - parseInt(lastActivity);
            if (timeSinceActivity > SESSION_TIMEOUT) {
                // Session expired
                sessionStorage.clear();
                // Page will redirect to phone entry on next page load
            }
        }
        sessionStorage.setItem('lastActivity', Date.now());
    }
});

/**
 * Utility function to format phone number
 */
function formatPhoneNumber(phone) {
    // Remove all non-digit characters
    const cleaned = phone.replace(/\D/g, '');
    
    // Format as needed (e.g., for Indian numbers: 98765-43210)
    if (cleaned.length === 10) {
        return cleaned.replace(/(\d{5})(\d{5})/, '$1-$2');
    }
    return cleaned;
}

/**
 * Validate phone number format
 */
function isValidPhoneNumber(phone) {
    const cleaned = phone.replace(/\D/g, '');
    // Basic validation: 10 digits (can be adjusted for different countries)
    return cleaned.length >= 10 && cleaned.length <= 15;
}

/**
 * Handle API errors
 */
function handleApiError(error, defaultMessage = 'An error occurred') {
    console.error('API Error:', error);
    if (typeof error === 'string') {
        return error;
    }
    if (error.error) {
        return error.error;
    }
    return defaultMessage;
}

/**
 * Show notification
 */
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 5px;
        z-index: 9999;
        animation: slideIn 0.3s ease-in;
    `;
    
    const bgColor = type === 'error' ? '#f44336' : 
                   type === 'success' ? '#4caf50' : 
                   '#2196f3';
    notification.style.backgroundColor = bgColor;
    notification.style.color = 'white';
    
    document.body.appendChild(notification);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

/**
 * Loading state management
 */
function setLoadingState(element, isLoading = true) {
    if (isLoading) {
        element.disabled = true;
        element.dataset.originalText = element.textContent;
        element.innerHTML = '<span class="spinner"></span> Processing...';
    } else {
        element.disabled = false;
        element.textContent = element.dataset.originalText || 'Submit';
    }
}

/**
 * Clear form errors
 */
function clearFormErrors(formElement) {
    const errorMessages = formElement.querySelectorAll('.error-message');
    errorMessages.forEach(error => {
        error.textContent = '';
    });
}

/**
 * Display form field error
 */
function displayFieldError(fieldId, errorMessage) {
    const field = document.getElementById(fieldId);
    const errorElement = field?.nextElementSibling;
    
    if (errorElement && errorElement.classList.contains('error-message')) {
        errorElement.textContent = errorMessage;
        field.classList.add('error');
    }
}

/**
 * Clear field error
 */
function clearFieldError(fieldId) {
    const field = document.getElementById(fieldId);
    const errorElement = field?.nextElementSibling;
    
    if (errorElement && errorElement.classList.contains('error-message')) {
        errorElement.textContent = '';
        field.classList.remove('error');
    }
}

// CSS animations for notifications
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
    
    .offer-form input.error {
        border-color: #f44336;
        background-color: #ffebee;
    }
`;
document.head.appendChild(style);
