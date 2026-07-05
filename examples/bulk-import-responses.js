const NodeTestServer = require('../dist/main');
const bulk = require("./bulk");

async function run() {
    const server = new NodeTestServer.NodeTestServer();
    server.setMockResponsesBulk(bulk);
    server.startServer();

    let result = await fetch('http://localhost:8080/hello');
    console.log(`response body from /hello: ${await result.text()}`);

    result = await fetch('http://localhost:8080/other/endpoint');
    console.log(`response body from /other/endpoint: ${await result.text()}`);
    await server.stopServer();
}

run();
