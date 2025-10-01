let admin = false;

fetch("/auth")
    .then(response => response.text())
    .then(data => {
        if (data == 1) {
            admin = true;
        }
    });

function updateLeaderboard() {
    fetch("/get_scores")
        .then(response => response.json())
        .then(data => {
            let scorearr = [];
            for (const key in data) {
                scorearr.push([key, data[key][0], data[key][1]]);
            }

            scorearr.sort((x, y) => y[2] - x[2]);

            let htmldata = "";
            scorearr.forEach(([username, problems, score]) => {
                htmldata += `
                    <div class="grid-item">
                `;
                if (admin) {
                    htmldata += `
                        <form method="POST" style="display: inline;">
                            <input type="submit" name="${username}" value="x">
                        </form>
                    `;
                }
                htmldata += `${username}
                    </div>
                    <div class="grid-item right-grid-item">
                        ${problems}
                    </div>
                    <div class="grid-item right-grid-item">
                        ${score}
                    </div>
                `;
            });

            document.getElementById("leaderboard").innerHTML = htmldata;
        });
}

updateLeaderboard();
setInterval(updateLeaderboard, 10000);