// Get the button element
const addButton = document.getElementById('addButton');

// Get the input element
const studentNameInput = document.getElementById('studentName');

// Get the message element
const messageElement = document.getElementById('message');

// Add click event listener to the button
addButton.addEventListener('click', function() {
    // Read the student's name from the input
    const studentName = studentNameInput.value;

    // Send POST request to the backend
    fetch('/api/students', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            name: studentName
        })
    })
    .then(response => response.json())
    .then(data => {
        // Display the response message
        messageElement.textContent = data.message;
    });
});
