#!/usr/bin/env node

import fs from 'fs';
import { NodeTestServer } from './node-test-server';
import { BulkRequest } from './types/bulk-request';
import { HttpsConfig, NodeTestServerConfig } from './types/node-test-server-config.type';

const TLS_CRT_ENV_VARIABLE_NAME = 'NODE_TEST_SERVER_TLS_CRT_PATH';
const TLS_KEY_ENV_VARIABLE_NAME = 'NODE_TEST_SERVER_TLS_KEY_PATH';

const PORT_ENV_VARIABLE_NAME = 'NODE_TEST_SERVER_PORT';
const MIN_PORT_NUMBER = 1;
const MAX_PORT_NUMBER = 65535;
const DEFAULT_PORT_NUMBER = 8080;

const BULK_RESPONSES_ENV_VARIABLE_NAME = 'NODE_TEST_SERVER_BULK_RESPONSES_PATH';

let port: number | undefined = undefined;
if (process.env[PORT_ENV_VARIABLE_NAME] != null && process.env[PORT_ENV_VARIABLE_NAME]!.match(/^[0-9]+$/)) {
  port = parseInt(process.env[PORT_ENV_VARIABLE_NAME]!);
  if (port < MIN_PORT_NUMBER || port > MAX_PORT_NUMBER) {
    port = DEFAULT_PORT_NUMBER;
  }
}

let httpsConfig: HttpsConfig | undefined = undefined;
if (process.env[TLS_CRT_ENV_VARIABLE_NAME] != null && process.env[TLS_KEY_ENV_VARIABLE_NAME] != null) {
  httpsConfig = {
    crt: process.env[TLS_CRT_ENV_VARIABLE_NAME],
    key: process.env[TLS_KEY_ENV_VARIABLE_NAME]
  };
}

const server: NodeTestServer = new NodeTestServer();
const config: NodeTestServerConfig = {
  port: port,
  https: httpsConfig,
  exitProcessOnStop: true
};
server.startServer(config);

if (process.env[BULK_RESPONSES_ENV_VARIABLE_NAME] != null) {
  const pathToBulkResponses: string = process.env[BULK_RESPONSES_ENV_VARIABLE_NAME];
  if (fs.existsSync(pathToBulkResponses)) {
    const bulkResponses: BulkRequest[] = require(pathToBulkResponses);
    console.log(`Importing bulk responses from ${pathToBulkResponses}`);
    server.setMockResponsesBulk(bulkResponses);
  } else {
    console.warn(`File with bulk responses ${pathToBulkResponses} not found!`);
  }
}
