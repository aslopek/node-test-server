import { MockRequest } from './mock-request.type';
import { MockResponse } from './mock-response.type';
import { ResponseMode } from './response-mode.type';

export type BulkRequest = [MockRequest, MockResponse[], ResponseMode];