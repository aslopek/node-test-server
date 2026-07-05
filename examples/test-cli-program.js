const NodeTestServer = require("../dist/main");
const child_process = require("child_process");

/*
 * This example shows how the NodeTestServer can be used to verify a CLI program's HTTP communication is implemented
 * correctly from a JavaScript based test.
 */

// test setup
const server = new NodeTestServer.NodeTestServer();
server.startServer();

// arrange
/** @type MockRequest */
let mockRequest = {
    method: 'GET',
    path: '/hello/world'
};

/** @type StaticMockResponse */
let mockResponse = {
    status: 200,
    headers: {
        'content-type': 'text/plain'
    },
    body: 'fooBar 123!'
};

server.setMockResponses(mockRequest, [mockResponse], 'ONCE');

// act
console.log('start');
const child = child_process.spawn('curl', ['--request', 'GET', '--url', 'http://localhost:8080/hello/world?foo=bar&baz=123'], {env: process.env});
let stdout = '';
child.stdout.on('data', (data) => {
    stdout += data;
});
child.on('exit', () => {
    assert();
})

// assert
function assert() {
    // cURL printed the response body correctly
    if (stdout !== mockResponse.body) {
        throw new Error(`Expected <${stdout}> to equal <${mockResponse.body}>`);
    }

    // cURL sent exactly one request
    if (server.getNumberOfReceivedRequests() !== 1) {
        throw new Error(`Expected server to have received one request, but received ${server.getNumberOfReceivedRequests()}`);
    }

    const receivedRequests = server.getReceivedRequests('/hello/world', 'GET');
    if (receivedRequests.length !== 1) {
        throw new Error(`Expected receivedRequests to have length 1, but has length ${receivedRequests.length}`);
    }

    // cURL sent the query parameters correctly
    const queryParams = receivedRequests[0].queryParameters;
    if (queryParams.foo !== 'bar') {
        throw new Error(`Expected query param foo to have value 'bar', but has '${queryParams.foo}'`);
    }

    if (queryParams.baz !== '123') {
        throw new Error(`Expected query param baz to have value '123', but has '${queryParams.baz}'`);

    }

    // cURL automatically attached the correct user-agent
    const userAgent = receivedRequests[0].headers['user-agent'];
    if (!userAgent.startsWith('curl/')) {
        throw new Error(`Expected user-agent header to start with 'curl/', but the user-agent header was ${userAgent}`);
    }

    // print the received request
    console.log(JSON.stringify(receivedRequests[0], null, 2));
    server.stopServer();
}
