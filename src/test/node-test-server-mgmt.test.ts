import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals';
import {ServerResponse} from 'http';
import {NodeTestServer, ReceivedRequest} from '../main';
import {NodeTestServerMgmt} from '../main/node-test-server-mgmt';

function fakeResponse() {
  const writeHead = jest.fn();
  const end = jest.fn((cb?: () => void) => cb?.());
  const res = {writeHead, write: jest.fn(), end} as unknown as ServerResponse;
  return {res, writeHead, end};
}

function postMockResponsesRequest(body: unknown): ReceivedRequest {
  return {
    method: 'POST',
    path: '/_/mock-responses',
    headers: {},
    queryParameters: {},
    body
  };
}

describe('NodeTestServerMgmt', () => {
  describe('POST /_/mock-responses body validation', () => {
    const validBody = {
      mockRequest: {path: '/resources', method: 'GET'},
      mockResponses: [{status: 200}],
      mode: 'REPEAT'
    };

    it.each([
      ['body is undefined', undefined],
      ['body is a string (non-JSON content type)', 'not an object'],
      ['mockRequest is missing', {...validBody, mockRequest: undefined}],
      ['mockRequest.path is missing', {...validBody, mockRequest: {method: 'GET'}}],
      ['mockRequest.path is empty', {...validBody, mockRequest: {path: '', method: 'GET'}}],
      ['mockRequest.method is invalid', {...validBody, mockRequest: {path: '/resources', method: 'FOO'}}],
      ['mockResponses is missing', {...validBody, mockResponses: undefined}],
      ['mockResponses is empty', {...validBody, mockResponses: []}],
      ['a mockResponse has no numeric status', {...validBody, mockResponses: [{status: '200'}]}],
      ['mode is missing', {...validBody, mode: undefined}],
      ['mode is invalid', {...validBody, mode: 'SOMETIMES'}]
    ])('should respond 400 when %s', async (_description, body) => {
      const subject: NodeTestServerMgmt = new NodeTestServerMgmt(new NodeTestServer());
      const {res, writeHead, end} = fakeResponse();

      await subject.handleMgmtRequest(postMockResponsesRequest(body), res);

      expect(writeHead).toHaveBeenCalledWith(400, expect.objectContaining({
        'Access-Control-Allow-Origin': '*'
      }));
      expect(end).toHaveBeenCalled();
    });
  });

  describe('POST /_/stop process lifecycle', () => {
    const stopRequest: ReceivedRequest = {
      method: 'POST',
      path: '/_/stop',
      headers: {},
      queryParameters: {},
      body: undefined
    };

    let exitSpy: jest.SpiedFunction<typeof process.exit>;

    beforeEach(() => {
      exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    function nodeTestServerWithFakeServer() {
      const nodeTestServer: NodeTestServer = new NodeTestServer();
      const closeAllConnections = jest.fn();
      const close = jest.fn((cb: () => void) => cb());
      nodeTestServer['server'] = {closeAllConnections, close} as never;
      return {nodeTestServer, closeAllConnections, close};
    }

    it('should not exit the process when exitProcessOnStop is not enabled (library usage)', async () => {
      const {nodeTestServer, closeAllConnections} = nodeTestServerWithFakeServer();
      nodeTestServer['exitProcessOnStop'] = false;
      const subject: NodeTestServerMgmt = new NodeTestServerMgmt(nodeTestServer);
      const {res, writeHead} = fakeResponse();

      await subject.handleMgmtRequest(stopRequest, res);

      expect(writeHead).toHaveBeenCalledWith(202, expect.objectContaining({
        'Access-Control-Allow-Origin': '*'
      }));
      expect(closeAllConnections).toHaveBeenCalled();
      expect(nodeTestServer['server']).toBeNull();
      expect(exitSpy).not.toHaveBeenCalled();
    });

    it('should exit the process when exitProcessOnStop is enabled (CLI usage)', async () => {
      const {nodeTestServer, closeAllConnections} = nodeTestServerWithFakeServer();
      nodeTestServer['exitProcessOnStop'] = true;
      const subject: NodeTestServerMgmt = new NodeTestServerMgmt(nodeTestServer);
      const {res} = fakeResponse();

      await subject.handleMgmtRequest(stopRequest, res);

      expect(closeAllConnections).toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });

    it('should still exit the process when force=true, even though the server is not stopped gracefully', async () => {
      const {nodeTestServer, closeAllConnections} = nodeTestServerWithFakeServer();
      nodeTestServer['exitProcessOnStop'] = true;
      const subject: NodeTestServerMgmt = new NodeTestServerMgmt(nodeTestServer);
      const {res} = fakeResponse();

      await subject.handleMgmtRequest({...stopRequest, queryParameters: {force: 'true'}}, res);

      expect(closeAllConnections).not.toHaveBeenCalled();
      expect(exitSpy).toHaveBeenCalledWith(0);
    });
  });
});
