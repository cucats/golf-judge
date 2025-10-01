let opens = {};

function dropdown(e, id) {
    opens[id] = !opens[id] ?? true;
    if (document.getElementById(id).classList.contains("hide")) {
        e.innerHTML = "Code &#9662;";
    } else {
        e.innerHTML = "Code &#9656;";
    }
    document.getElementById(id).classList.toggle("hide");
}

function updateSubmissions() {
    fetch("/get_submissions")
        .then(response => response.json())
        .then(data => {
            let dataarr = [];
            for (const key in data) {
                dataarr.push([key, data[key]]);
            }

            dataarr.sort((x, y) => y[1]["time"] - x[1]["time"]);

            let htmldata = "";
            dataarr.forEach(([id, value]) => {
                let time = new Date(1000 * value["time"]).toISOString().slice(14, 19);
                let visibility = (opens[id] ?? false) ? "" : "hide";
                let code = hljs.highlight(value["code"], {language: "python"}).value;
                htmldata += `
                    <div class="grid">
                        <div class="grid-item">
                            <span class="dropdown-toggle" onclick="dropdown(this, '${id}')">Code &#9656; </span>
                        </div>
                        <div class="grid-item right-grid-item">${value["username"]}</div>
                        <div class="grid-item right-grid-item">${value["problem"]}</div>
                        <div class="grid-item right-grid-item">${time}</div>
                        <div class="grid-item right-grid-item">${value["code_length"]} bytes</div>
                        <div class="grid-item right-grid-item">${value["verdict"]}</div>
                    </div>

                    <div class="dropdown-content ${visibility}" id="${id}">
                        <pre class="code"><code>${code}</code></pre>
                    </div>
                `;
            });
            document.getElementById("submissions").innerHTML = htmldata;
        });
}

updateSubmissions();
setInterval(updateSubmissions, 10000);
