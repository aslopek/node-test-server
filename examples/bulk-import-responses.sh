#!/bin/sh

EXAMPLES_DIR=$(realpath $(dirname -- "$0"))

BULK_RESPONSES=${EXAMPLES_DIR}/bulk.js
NODE_TEST_SERVER_BULK_RESPONSES_PATH=$BULK_RESPONSES node ${EXAMPLES_DIR}/../dist/main/bin.js &
curl --request GET --url 'http://localhost:8080/hello'
echo
curl --request GET --url 'http://localhost:8080/other/endpoint'
echo
curl --request POST --url 'http://localhost:8080/_/stop'

echo
echo
echo

BULK_RESPONSES=${EXAMPLES_DIR}/bulk.json
NODE_TEST_SERVER_BULK_RESPONSES_PATH=$BULK_RESPONSES node ${EXAMPLES_DIR}/../dist/main/bin.js &
curl --request GET --url 'http://localhost:8080/hello'
echo
curl --request GET --url 'http://localhost:8080/other/endpoint'
echo
curl --request POST --url 'http://localhost:8080/_/stop'
