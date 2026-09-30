const SECRET_PASSCODE = "123456"; // Set your secret passcode here

function checkPasscode() {
    const inputPasscode = document.getElementById('passcode-input').value;
    const errorMessage = document.getElementById('error-message');

    if (inputPasscode === SECRET_PASSCODE) {
        // Store the passcode in local storage
        localStorage.setItem('userPasscode', inputPasscode);

        // Redirect to the main site
        const next = new URLSearchParams(location.search).get('next');
        const target = new URL(next || '/index.html', location.origin);
        window.location.href = target.origin === location.origin && /^\/(index|movie|tvshow|saved)\.html$/.test(target.pathname) ? target.href : '/index.html';
    } else {
        // Show an error message
        errorMessage.classList.remove('is-visible');
        void errorMessage.offsetWidth;
        errorMessage.classList.add('is-visible');
        document.getElementById('passcode-input').select();
    }
}

function verifyAccess() {
    const storedPasscode = localStorage.getItem('userPasscode');

    if (storedPasscode !== SECRET_PASSCODE) {
        window.location.replace('passcode.html?next=' + encodeURIComponent(location.pathname + location.search));
    }
}

// Only call verifyAccess() on protected pages
if (!window.location.pathname.endsWith('passcode.html')) {
    verifyAccess();
}

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('passcode-form');
    if (!form) return;

    form.addEventListener('submit', (event) => {
        event.preventDefault();
        checkPasscode();
    });
});
