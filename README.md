# node-test-server

Node-based HTTP server for recording requests and serving responses.

Write automated tests for codebases or programs that don't support intercepting HTTP requests. For example, when testing
Node CLI applications inside a child process.

Develop your client-side applications like CLIs or web apps without depending on external HTTP APIs.

## Features

📜 MIT licensed

🚀 No dependencies besides TypeScript and others required for building and testing the node-test-server. No headaches
with large dependency trees.

🛡️ Supports TLS / HTTPS

✅ Thoroughly tested with unit and integration tests. On all Node versions that did not reach EOL.

🕹️ Control the server programmatically from your TypeScript or JavaScript code. Or control it via its HTTP management
API from any other code base.

🧩 OpenAPI 3 specification of node-test-server's HTTP management API for your convenience. Generate client-side code to
integrate seamlessly into your tests.

## Change Log

### 2.0.0

- BREAKING: Drop support for node 18.2.0 in favor of upgrading jest to version 30. Minimum
  supported node version is now 19.8.1.
- BREAKING: `POST /_/stop` no longer terminates the host process when `NodeTestServer` is used
  programmatically (as a library) - only the CLI (`npx @aslope/node-test-server`) still exits the
  process afterwards. A new, CLI-only `NodeTestServerConfig.exitProcessOnStop` flag controls this
  and defaults to `false`. Previously, hitting `/_/stop` always killed the whole host process, even
  when NodeTestServer was embedded as a library.
- BREAKING: request bodies larger than 10 MiB are now rejected with `413 Payload Too Large` instead
  of being buffered without any limit.
- Fix: a request body that isn't valid JSON (despite `Content-Type: application/json`) no longer
  crashes the server. The server now responds with `400 Bad Request` instead.
- Fix: `POST /_/mock-responses` now validates the request body and responds with `400 Bad Request`
  when `mockRequest`, `mockResponses` or `mode` are missing or malformed, instead of silently
  registering a mock response that could never match a real request (or crashing via an unhandled
  promise rejection). This was already documented in the OpenAPI spec, but not actually implemented.
- Fix: an aborted connection (e.g. the client disconnecting mid-request or mid-response) no longer
  crashes the server.
- 🎉 The project has moved from Azure DevOps to GitHub! You can now find `node-test-server` at
  [github.com/aslopek/node-test-server](https://github.com/aslopek/node-test-server)

### 1.1.0

- Use TypeScript 6 and node 24.14.1 to build
- Compilation Target: `es2015`
- Module Resolution: `NodeNext`
- Provide `exports` in package.json

## Getting started

### Examples

Check out the [examples](https://github.com/aslopek/node-test-server/tree/main/examples) directory for code snippets!

### Using npx

```shell
# start the server on port 8090
export NODE_TEST_SERVER_PORT=8090
npx @aslope/node-test-server

# define a mock response
curl --request POST \
  --url http://localhost:8090/_/mock-responses \
  --header 'Content-Type: application/json' \
  --data '{
	"mockRequest": {
		"path": "/resources",
		"method": "POST"
	},
	"mockResponses": [
		{
			"status": 201,
			"headers": {
				"Content-Type": "application/json",
				"Location": "/resources/1"
			},
			"body": {
				"hello": "world",
				"foo": "bar"
			}
		}
	],
	"mode": "REPEAT"
}'

# stop the server
curl --request POST \
  --url http://localhost:8090/_/stop
```

Enable TLS/HTTPS support:

```shell
export NODE_TEST_SERVER_TLS_CRT_PATH=path/to/cert.pem
export NODE_TEST_SERVER_TLS_KEY_PATH=path/to/key.pem
npx @aslope/node-test-server
```

### Using TypeScript

```TypeScript
import {
  DynamicMockResponse,
  MockRequest,
  MockResponse,
  NodeTestServer,
  NodeTestServerConfig,
  StaticMockResponse
} from '@aslope/node-test-server';
import { IncomingMessage, ServerResponse } from 'http';

const server: NodeTestServer = new NodeTestServer();
const config: NodeTestServerConfig = {
  port: 8090
};
server.startServer(config);

const mockRequest: MockRequest = {
  path: '/resources',
  method: 'POST'
};
const staticMockResponse: StaticMockResponse = {
  status: 201,
  headers: {
    'Content-Type': 'application/json',
    'Location': '/resources/1'
  },
  body: {
    hello: 'world',
    foo: 'bar'
  }
};
const dynamicMockResponse: DynamicMockResponse = (req: IncomingMessage, res: ServerResponse) => {
  res.writeHead(201, {
    'Location': '/resources/1'
  });
  res.end();
};

const mockResponses: MockResponse[] = [staticMockResponse, dynamicMockResponse];
server.setMockResponses(mockRequest, mockResponses, 'REPEAT');

// close after 60 seconds
setTimeout(() => server.stopServer(), 60000);
```

Enable TLS/HTTPS support:

```TypeScript
import {
  NodeTestServer,
  NodeTestServerConfig
} from '@aslope/node-test-server';

const server: NodeTestServer = new NodeTestServer();
const config: NodeTestServerConfig = {
  https: {
    crt: 'path/to/cert.pem',
    key: 'path/to/key.pem'
  }
};
server.startServer(config);
```

## Manually building and testing the application

```shell
git clone https://github.com/aslopek/node-test-server
cd node-test-server
npm ci

# Create a self-signed private key and certificate for TLS/HTTPS tests
npm run init:tls

# either build and run the application with your current node version...
npm run build
NODE_TLS_REJECT_UNAUTHORIZED=0 npm test # accept self-signed certificates for HTTPS tests

# ... or build with the lowest, supported node version and test with all node versions that did not reach EOL
./test.sh

# test the openapi file by generating client-side code from it
npm run test:api
```