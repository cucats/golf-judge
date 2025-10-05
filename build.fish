#!/usr/bin/env fish
docker build . -t golf-judge
docker run -d -p 5000:5000 golf-judge
