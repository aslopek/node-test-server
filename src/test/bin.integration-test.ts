import {afterEach, beforeAll, beforeEach, describe, expect, it } from '@jest/globals';
import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ReceivedRequest } from '../main';
import { deleteRequest, getRequest, postRequest, wait } from './test-utils';

const pathToExecutable: string = path.join(__dirname, '..', '..', 'dist', 'main', 'bin.js');
const pathToTlsCrt: string = path.join(__dirname, '..', '..', 'tls', 'cert.pem');
const pathToTlsKey: string = path.join(__dirname, '..', '..', 'tls', 'key.pem');
const waitTimeInMs = 200;

describe.each(['http', 'https'])(`executable script integration tests using %s protocol`, (protocol) => {
  let port: number;
  let childProcess: ChildProcessWithoutNullStreams;

  beforeAll(() => {
    [pathToExecutable, pathToTlsCrt, pathToTlsKey].forEach(path => {
      if (!fs.existsSync(path)) {
        throw new Error(`File does not exist: ${path}`);
      }
    });
  });

  beforeEach(() => {
    port = 8080;
  });

  afterEach(() => {
    childProcess.kill();
  });

  it('should use the default port, when no env variable is provided', async () => {
    await startProcess();
    const url = composeUrl('/_/heartbeat');
    console.log(`GET ${url}`);
    const response: Response = await getRequest(url);
    expect(childProcess.exitCode).toBeNull();
    expect(response.status).toBe(200);
  });

  it.each(['abc', 0, 65536])('should use the default port, when env variable contains invalid value %s',
    async (value) => {
      await startProcess({ NODE_TEST_SERVER_PORT: `${value}` });
      expect(childProcess.exitCode).toBeNull();
      const response: Response = await getRequest(composeUrl('/_/heartbeat'));
      expect(response.status).toBe(200);
    });

  it('should use different port, when providing a valid value', async () => {
    port = 8090;
    await startProcess({ NODE_TEST_SERVER_PORT: `${port}` });
    expect(childProcess.exitCode).toBeNull();
    const response: Response = await getRequest(composeUrl('/_/heartbeat'));
    expect(response.status).toBe(200);
  });

  it.each(['bulk.js', 'bulk.json'])('should import bulk responses from %s', async (file) => {
    const pathToBulk = path.join(__dirname, 'fixtures', file);
    await startProcess({ 'NODE_TEST_SERVER_BULK_RESPONSES_PATH': pathToBulk });
    expect(childProcess.exitCode).toBeNull();

    let response: Response = await getRequest(composeUrl('/hello'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toEqual('text/plain');
    expect(await response.text()).toEqual('Hello, there!');

    response = await getRequest(composeUrl('/other/endpoint'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toEqual('text/plain');
    expect(await response.text()).toEqual('You\'ve reached the /other/endpoint!');
  });

  it('should process entire workflow', async () => {
    await startProcess();
    expect(childProcess.exitCode).toBeNull();

    let response: Response = await getRequest(composeUrl('/_/heartbeat'));
    expect(response.status).toBe(200);

    response = await postRequest(composeUrl('/_/mock-responses'), {
      body: {
        mockRequest: {
          path: '/resources',
          method: 'GET'
        },
        mockResponses: [
          {
            status: 200,
            headers: {
              'Content-Type': 'application/json'
            },
            body: {
              foo: 'bar',
              baz: 654
            }
          }
        ],
        mode: 'REPEAT'
      }
    });
    expect(response.status).toBe(204);

    response = await postRequest(composeUrl('/_/mock-responses'), {
      body: {
        mockRequest: {
          path: '/resources/1',
          method: 'DELETE'
        },
        mockResponses: [
          {
            status: 204
          }
        ],
        mode: 'ONCE'
      }
    });
    expect(response.status).toBe(204);

    response = await getRequest(composeUrl('/_/received-requests/count'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toEqual('text/plain');
    expect(await response.text()).toEqual('0');

    for (let i: number = 0; i < 5; i++) {
      response = await getRequest(composeUrl('/resources'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        foo: 'bar',
        baz: 654
      });
      expect(response.headers.get('Content-Type')).toEqual('application/json');
    }

    // should succeed ONCE
    response = await deleteRequest(composeUrl('/resources/1'));
    expect(response.status).toBe(204);
    response = await deleteRequest(composeUrl('/resources/1'));
    expect(response.status).toBe(500);

    // send request to some other endpoint
    response = await getRequest(composeUrl('/resources/2'));
    expect(response.status).toBe(500);

    // get the count of received requests
    response = await getRequest(composeUrl('/_/received-requests/count'));
    expect(response.status).toBe(200);
    expect(await response.text()).toEqual('8');

    // look up received requests
    response = await getRequest(composeUrl('/_/received-requests'), {
      query: {
        path: '/resources',
        method: 'GET'
      }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toEqual('application/json');
    let receivedRequests: ReceivedRequest[] = await response.json();
    expect(receivedRequests).toHaveLength(5);

    response = await getRequest(composeUrl('/_/received-requests'), {
      query: {
        path: '/resources/1',
        method: 'DELETE'
      }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toEqual('application/json');
    receivedRequests = await response.json();
    expect(receivedRequests).toHaveLength(2);

    response = await getRequest(composeUrl('/_/received-requests'), {
      query: {
        path: '/resources/2',
        method: 'GET'
      }
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toEqual('application/json');
    receivedRequests = await response.json();
    expect(receivedRequests).toHaveLength(1);

    // reset received requests
    response = await deleteRequest(composeUrl('/_/received-requests'));
    expect(response.status).toBe(204);
    response = await getRequest(composeUrl('/_/received-requests/count'));
    expect(response.status).toBe(200);
    expect(await response.text()).toEqual('0');

    // shut down
    response = await postRequest(composeUrl('/_/stop'));
    expect(response.status).toBe(202);
    expect(response.headers.get('Content-Type')).toEqual('text/plain');
    expect(await response.text()).toEqual(`${childProcess.pid}`);
    await wait(waitTimeInMs);
    expect(childProcess.exitCode).toBe(0);
  });

  async function startProcess(env?: NodeJS.ProcessEnv): Promise<void> {
    let childProcessEnv: NodeJS.ProcessEnv = {
      ...process.env,
      ...(env ?? {})
    };
    if (protocol === 'https') {
      childProcessEnv = {
        NODE_TEST_SERVER_TLS_CRT_PATH: pathToTlsCrt,
        NODE_TEST_SERVER_TLS_KEY_PATH: pathToTlsKey,
        ...childProcessEnv
      };
    }
    childProcess = spawn('node', [pathToExecutable], {
      env: childProcessEnv
    });
    return wait(waitTimeInMs);
  }

  function composeUrl(path: string): string {
    return `${protocol}://localhost:${port}${path}`;
  }
});
