#!/bin/bash
# Query Cloudflare GraphQL Analytics for Durable Object metrics.
# Requires CF_ACCOUNT_ID and CF_ANALYTICS_TOKEN env vars (or set in .dev.vars).
#
# Usage:
#   source .dev.vars && ./scripts/do-metrics.sh
#   CF_ACCOUNT_ID=xxx CF_ANALYTICS_TOKEN=yyy ./scripts/do-metrics.sh

set -euo pipefail

API="https://api.cloudflare.com/client/v4/graphql"
ACCT="${CF_ACCOUNT_ID:?Set CF_ACCOUNT_ID}"
TOKEN="${CF_ANALYTICS_TOKEN:?Set CF_ANALYTICS_TOKEN}"

# Known namespace IDs (update if namespaces change)
# SyncBackendDO:    e96f6022469a4499bda090041bd03467
# LinkProcessorDO:  0cc85e49c1fe4e43bb0bb24a6e98b655
# ChatAgentDO:      check CF dashboard

gql() {
  curl -s "$API" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    --data-raw "$1" | jq
}

echo "=== rows_written per namespace per day (last 7 days, top 20) ==="
gql "{\"query\":\"{ viewer { accounts(filter: { accountTag: \\\"$ACCT\\\" }) { durableObjectsPeriodicGroups(limit: 20, filter: { date_geq: \\\"$(date -u -v-7d +%Y-%m-%d)\\\", date_leq: \\\"$(date -u +%Y-%m-%d)\\\" }, orderBy: [sum_rowsWritten_DESC]) { dimensions { namespaceId date } sum { rowsWritten rowsRead } } } } }\"}"

echo ""
echo "=== rows_written per namespace today ==="
gql "{\"query\":\"{ viewer { accounts(filter: { accountTag: \\\"$ACCT\\\" }) { durableObjectsPeriodicGroups(limit: 10, filter: { date: \\\"$(date -u +%Y-%m-%d)\\\" }, orderBy: [sum_rowsWritten_DESC]) { dimensions { namespaceId } sum { rowsWritten rowsRead storageWriteUnits } } } } }\"}"

echo ""
echo "=== hourly breakdown today (top namespace) ==="
gql "{\"query\":\"{ viewer { accounts(filter: { accountTag: \\\"$ACCT\\\" }) { durableObjectsPeriodicGroups(limit: 24, filter: { date: \\\"$(date -u +%Y-%m-%d)\\\", namespaceId: \\\"0cc85e49c1fe4e43bb0bb24a6e98b655\\\" }, orderBy: [sum_rowsWritten_DESC]) { dimensions { datetimeHour } sum { rowsWritten rowsRead } } } } }\"}"

echo ""
echo "=== WebSocket message counts per namespace today ==="
gql "{\"query\":\"{ viewer { accounts(filter: { accountTag: \\\"$ACCT\\\" }) { durableObjectsPeriodicGroups(limit: 10, filter: { date: \\\"$(date -u +%Y-%m-%d)\\\" }, orderBy: [sum_inboundWebsocketMsgCount_DESC]) { dimensions { namespaceId } sum { inboundWebsocketMsgCount outboundWebsocketMsgCount rowsWritten } } } } }\"}"

echo ""
echo "=== per-object breakdown for LinkProcessorDO today ==="
gql "{\"query\":\"{ viewer { accounts(filter: { accountTag: \\\"$ACCT\\\" }) { durableObjectsPeriodicGroups(limit: 10, filter: { date: \\\"$(date -u +%Y-%m-%d)\\\", namespaceId: \\\"0cc85e49c1fe4e43bb0bb24a6e98b655\\\" }, orderBy: [sum_rowsWritten_DESC]) { dimensions { objectId } sum { rowsWritten rowsRead cpuTime } } } } }\"}"
