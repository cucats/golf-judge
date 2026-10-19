#!/usr/bin/env bash
# Push main and redeploy the golf stack on cucats through Portainer, then
# wait for the new container and show its logs.
#   PORTAINER_URL / PORTAINER_TOKEN must be set; SSH as ap2555@cucats.orgset -euo pipefail

STACK=40 ENDPOINT=3 HOST=ap2555@cucats.org CONTAINER=golf-app-1
: "${PORTAINER_URL:?}" "${PORTAINER_TOKEN:?}"
api() { curl -fsS -H "X-API-Key: $PORTAINER_TOKEN" "$@"; }

[[ $(git branch --show-current) == main ]] || { echo "not on main" >&2; exit 1; }
git diff --quiet HEAD || { echo "uncommitted changes" >&2; exit 1; }
git push origin main

before=$(ssh $HOST "docker inspect -f '{{.Created}}' $CONTAINER")
env=$(api "$PORTAINER_URL/api/stacks/$STACK" | jq '.Env // []')

echo "redeploying $(git rev-parse --short HEAD)…"
# Portainer builds synchronously; a proxy timeout here doesn't stop the build
jq -n --argjson env "$env" \
    '{env: $env, prune: false, pullImage: false, repositoryReferenceName: "refs/heads/main"}' |
    api --max-time 900 -X PUT -H 'Content-Type: application/json' -d @- \
        "$PORTAINER_URL/api/stacks/$STACK/git/redeploy?endpointId=$ENDPOINT" >/dev/null ||
    echo "redeploy request ended early; waiting for the container anyway"

for _ in $(seq 180); do
    now=$(ssh $HOST "docker inspect -f '{{.Created}}' $CONTAINER 2>/dev/null" || true)
    [[ -n $now && $now != "$before" ]] && break
    sleep 5
done
[[ $now != "$before" ]] || { echo "container was not recreated" >&2; exit 1; }

sleep 3
ssh $HOST "docker logs --tail 20 $CONTAINER 2>&1"
