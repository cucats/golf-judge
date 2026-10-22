import type { RequestHandler } from './$types';
import { submit } from '#lib/server/submissions.js';
export const POST = submit;
