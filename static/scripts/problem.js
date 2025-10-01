let curr_time;

function checkValidity() {
    fetch("/get_valid_username")
        .then(response => response.text())
        .then(data => {
            switch (data) {
                case "1":
                    window.location.replace(homepageURL);
                    break;
                case "2":
                    window.location.replace(leaderboardURL);
            }
        });
}

function pad(n) {
    return (n < 10) ? ("0" + n) : n;
}

function updateTimer() {
    let minutes = Math.floor((curr_time % 3600) / 60);
    let seconds = curr_time % 60;
    document.getElementById('timer').textContent = pad(minutes) + ":" + pad(seconds);
    curr_time--;
}

let editor = ace.edit("editor", {
    theme: "ace/theme/cobalt",
    mode: "ace/mode/python",
    minLines: 20,
    maxLines: 30
});

let dummyeditor = document.getElementById("editor-dummy");

// Get initial time
fetch("/get_time")
    .then(response => response.text())
    .then(data => {
        curr_time = parseInt(data);
        updateTimer();
        setInterval(updateTimer, 1000);
    });

dummyeditor.value = editor.getValue();
editor.getSession().on("change", function () {
    dummyeditor.value = editor.getValue();
});

document.addEventListener('keydown', function (event) {
    if (event.ctrlKey && event.key === 'Enter') {
        document.getElementById('submit').click();
    }
});

checkValidity();
setInterval(checkValidity, 10000);
