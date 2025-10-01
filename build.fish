#!/usr/bin/env fish
docker build . -t judex
docker run -d -p 5000:5000 judex
