let admin = false;

fetch("/auth")
    .then(response => response.text())
    .then(data => {
        if (data == 1) {
            admin = true;
        }
    });

let numProblems = 0;

function updateLeaderboard() {
    fetch("/get_scores")
        .then(response => response.json())
        .then(data => {
            let scorearr = [];
            for (const key in data) {
                scorearr.push([key, data[key]]);
            }

            // Get number of problems from first user
            if (scorearr.length > 0) {
                numProblems = scorearr[0][1].problem_scores.length;

                // Update CSS variable for grid columns
                document.getElementById("leaderboard-container").style.setProperty('--num-problems', numProblems);
                document.getElementById("leaderboard").style.setProperty('--num-problems', numProblems);

                // Create problem headers
                let headers = "";
                for (let i = 0; i < numProblems; i++) {
                    headers += `<div class="grid-item header-row right-grid-item"><strong>P${i}</strong></div>`;
                }
                document.getElementById("problem-headers").outerHTML = headers;
            }

            // Sort by score (ascending - lower is better), then by solved (descending)
            scorearr.sort((a, b) => {
                if (a[1].score !== b[1].score) return a[1].score - b[1].score;
                return b[1].solved - a[1].solved;
            });

            let htmldata = "";
            scorearr.forEach(([username, userdata]) => {
                htmldata += `<div class="grid-item">`;
                if (admin) {
                    htmldata += `
                        <form method="POST" style="display: inline;">
                            <input type="submit" name="${username}" value="x">
                        </form>
                    `;
                }
                htmldata += `${username}</div>`;

                // Add problem scores
                userdata.problem_scores.forEach((problemData, idx) => {
                    let scoreText = problemData.score;
                    let style = "";

                    if (userdata.diamonds.includes(idx)) {
                        scoreText = `💎 ${scoreText}`;
                        style = 'style="color: #60a5fa; font-weight: bold;"';
                    } else if (userdata.golds.includes(idx)) {
                        scoreText = `🥇 ${scoreText}`;
                        style = 'style="color: #fbbf24; font-weight: bold;"';
                    }

                    htmldata += `<div class="grid-item right-grid-item" ${style}>${scoreText}</div>`;
                });

                // Add total score
                htmldata += `<div class="grid-item right-grid-item" style="font-weight: bold;">${userdata.score}</div>`;
            });

            document.getElementById("leaderboard").innerHTML = htmldata;
        });
}

updateLeaderboard();
setInterval(updateLeaderboard, 10000);