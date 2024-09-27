const SECRET_PASSCODE = "129875"; // Set your secret passcode here

function checkPasscode() {
    const inputPasscode = document.getElementById('passcode-input').value;
    const errorMessage = document.getElementById('error-message');

    if (inputPasscode === SECRET_PASSCODE) {
        // Store the passcode in local storage
        localStorage.setItem('userPasscode', inputPasscode);

        // Redirect to the main site
        window.location.href = "index.html";
    } else {
        // Show an error message
        errorMessage.style.display = "block";
    }
}

function verifyAccess() {
    const storedPasscode = localStorage.getItem('userPasscode');

    if (storedPasscode !== SECRET_PASSCODE) {
        window.location.href = "passcode.html";
    }
}

verifyAccess();
