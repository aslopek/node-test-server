import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { EventEmitter } from 'events';
import {IncomingMessage, RequestListener, ServerResponse} from 'http';
import { MAX_REQUEST_BODY_SIZE_BYTES, NodeTestServer } from '../main/node-test-server';
import { NodeTestServerMgmt } from '../main/node-test-server-mgmt';
import Mock = jest.Mock;

function fakeRequest(options: { url?: string, method?: string, headers?: { [key: string]: string } } = {}) {
  const req: IncomingMessage = new EventEmitter() as unknown as IncomingMessage;
  req.url = options.url ?? '/resources';
  req.method = options.method ?? 'POST';
  req.headers = options.headers ?? {};
  req.destroy = jest.fn() as unknown as typeof req.destroy;
  return req;
}

function fakeResponse() {
  const writeHead: Mock = jest.fn();
  const write = jest.fn();
  const end = jest.fn((cb?: () => void) => cb?.());
  const res = Object.assign(new EventEmitter(), { writeHead, write, end }) as unknown as ServerResponse;
  return { res, writeHead, end };
}

describe('NodeTestServer request handling robustness', () => {
  it('should respond 400 instead of crashing when the body is not valid JSON', () => {
    const subject: NodeTestServer = new NodeTestServer();
    const requestListener: RequestListener = subject['requestListener'];
    const req: IncomingMessage = fakeRequest({ headers: { 'content-type': 'application/json' } });
    const { res, writeHead, end } = fakeResponse();

    expect((): void => {
      requestListener(req, res);
      (req as unknown as EventEmitter).emit('data', Buffer.from('{ this is not valid json'));
      (req as unknown as EventEmitter).emit('end');
    }).not.toThrow();

    expect(writeHead).toHaveBeenCalledWith(400);
    expect(end).toHaveBeenCalled();
  });

  it('should respond 400 instead of crashing when Content-Type is JSON but the body is empty', () => {
    const subject = new NodeTestServer();
    const requestListener: RequestListener = subject['requestListener'];
    const req: IncomingMessage = fakeRequest({ headers: { 'content-type': 'application/json' } });
    const { res, writeHead, end } = fakeResponse();

    requestListener(req, res);
    (req as unknown as EventEmitter).emit('end');

    expect(writeHead).toHaveBeenCalledWith(400);
    expect(end).toHaveBeenCalled();
  });

  it('should reject request bodies larger than the configured limit with 413', () => {
    const subject = new NodeTestServer();
    const requestListener = subject['requestListener'];
    const req = fakeRequest();
    const { res, writeHead, end } = fakeResponse();

    requestListener(req, res);
    (req as unknown as EventEmitter).emit('data', Buffer.alloc(MAX_REQUEST_BODY_SIZE_BYTES + 1));
    (req as unknown as EventEmitter).emit('end');

    expect(writeHead).toHaveBeenCalledWith(413);
    expect(end).toHaveBeenCalled();
    expect(req.destroy).toHaveBeenCalled();
    expect(subject['receivedRequests']).toEqual({});
  });

  it('should accept request bodies at exactly the configured limit', () => {
    const subject = new NodeTestServer();
    subject['mockResponses'] = {
      '/resources': {
        'POST': {
          mode: 'REPEAT',
          nextResponseIndex: 0,
          mockResponses: [{ status: 200 }]
        }
      }
    };
    const requestListener = subject['requestListener'];
    const req = fakeRequest();
    const { res, writeHead } = fakeResponse();

    requestListener(req, res);
    (req as unknown as EventEmitter).emit('data', Buffer.alloc(MAX_REQUEST_BODY_SIZE_BYTES));
    (req as unknown as EventEmitter).emit('end');

    expect(writeHead).toHaveBeenCalledWith(200, {});
  });

  describe('aborted connections', () => {
    let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

    beforeEach(() => {
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('should not crash when the request emits an error (e.g. client disconnects mid-upload)', () => {
      const subject: NodeTestServer = new NodeTestServer();
      const requestListener: RequestListener = subject['requestListener'];
      const req: IncomingMessage = fakeRequest();
      const { res } = fakeResponse();

      expect((): void => {
        requestListener(req, res);
        (req as unknown as EventEmitter).emit('error', new Error('socket hang up'));
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('socket hang up'));
    });

    it('should not crash when the response emits an error (e.g. client disconnects mid-download)', () => {
      const subject: NodeTestServer = new NodeTestServer();
      const requestListener: RequestListener = subject['requestListener'];
      const req: IncomingMessage = fakeRequest();
      const { res } = fakeResponse();

      expect((): void => {
        requestListener(req, res);
        (res as unknown as EventEmitter).emit('error', new Error('write EPIPE'));
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('write EPIPE'));
    });

    it('should not crash when the response emits an error while handling a management request', () => {
      const subject: NodeTestServer = new NodeTestServer();
      subject['management'] = new NodeTestServerMgmt(subject);
      const requestListener: RequestListener = subject['requestListener'];
      const req: IncomingMessage = fakeRequest({ url: '/_/heartbeat', method: 'GET' });
      const { res } = fakeResponse();

      expect((): void => {
        requestListener(req, res);
        (req as unknown as EventEmitter).emit('end');
        (res as unknown as EventEmitter).emit('error', new Error('write EPIPE'));
      }).not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('write EPIPE'));
    });
  });
});
