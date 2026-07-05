import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MAX_REQUEST_BODY_SIZE_BYTES, NodeTestServer } from '../main';
import { postRequest, wait } from './test-utils';

const host = 'http://localhost:8099';
const waitTimeInMs = 200;

describe('node-test-server hardening integration test', () => {
  let subject: NodeTestServer;

  beforeEach((): void => {
    subject = new NodeTestServer();
    subject.startServer({ port: 8099 });
  });

  afterEach(async (): Promise<void> => {
    await subject.stopServer();
    await wait(waitTimeInMs);
  });

  describe('malformed request bodies', () => {
    it('should respond 400 (and stay alive) when the body is not valid JSON', async () => {
      const response: Response = await fetch(`${host}/resources`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ this is not valid json'
      });
      expect(response.status).toBe(400);

      // server must still be responsive after a malformed request
      const heartbeat = await fetch(`${host}/_/heartbeat`);
      expect(heartbeat.status).toBe(200);
    });

    it('should respond 413 (and stay alive) when the body exceeds the configured size limit', async () => {
      const response: Response = await fetch(`${host}/resources`, {
        method: 'POST',
        body: Buffer.alloc(MAX_REQUEST_BODY_SIZE_BYTES + 1)
      });
      expect(response.status).toBe(413);

      const heartbeat = await fetch(`${host}/_/heartbeat`);
      expect(heartbeat.status).toBe(200);
    }, 30000);
  });

  describe('POST /_/mock-responses validation', () => {
    it('should respond 400 and not register anything when the request body is invalid', async () => {
      const response: Response = await postRequest(`${host}/_/mock-responses`, {
        body: {
          mockRequest: { path: '/resources' }, // missing method
          mockResponses: [{ status: 200 }],
          mode: 'REPEAT'
        }
      });
      expect(response.status).toBe(400);
      expect(subject['mockResponses']).toEqual({});
    });
  });

  describe('POST /_/stop in library mode', () => {
    let exitSpy: jest.SpiedFunction<typeof process.exit>;

    beforeEach(() => {
      exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    });

    afterEach(() => {
      exitSpy.mockRestore();
    });

    it('should stop the server without exiting the current (host) process', async () => {
      const response: Response = await postRequest(`${host}/_/stop`);
      expect(response.status).toBe(202);
      await wait(waitTimeInMs);

      expect(exitSpy).not.toHaveBeenCalled();
      // the underlying HTTP server is really gone now
      await expect(fetch(`${host}/_/heartbeat`)).rejects.toThrow();
    });
  });
});
