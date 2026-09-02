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

    // Display the name in the message element
    messageElement.textContent = studentName;
});
