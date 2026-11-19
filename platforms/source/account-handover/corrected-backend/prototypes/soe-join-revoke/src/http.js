import {MESSAGE_WRITES,MAX_MESSAGE_BYTES} from './messages.js';
import {DISCUSSION_WRITES} from './discussion.js';
import { createServer } from "node:http";
import { MAX_REPORT_REQUEST_BYTES } from "./reports.js";
import { OPS_WRITES } from './synthetic-ops.js';
import { QUEUE_WRITES } from './privacy-queue.js';
import {RECOVERY_PREFIX,MAX_RECOVERY_BYTES,dispatchRecovery} from './recovery-interface.js';
const OPERATOR_WRITES = new Set([...OPS_WRITES, ...QUEUE_WRITES]);
const TOO_LARGE = Symbol("request-too-large");
const REPORT_REQUEST = Symbol("report-request");

function send(res, status, body, headers={}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...headers,
  });
  res.end(payload);
}

function readBody(req, limit = Infinity) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let bytes = 0, oversized = false;
    req.on("data", chunk => {
      bytes += chunk.length;
      if (bytes > limit) { oversized = true; chunks.length = 0; resolve(TOO_LARGE); }
      else if (!oversized) chunks.push(chunk);
    });
    req.on("end", () => {
      if (oversized) return;
      let raw;
      try { const bytes = Buffer.concat(chunks); raw = Number.isFinite(limit) ? new TextDecoder("utf-8", { fatal: true }).decode(bytes) : bytes.toString("utf8"); }
      catch { return resolve(null); }
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+([A-Za-z0-9]+)$/.exec(header);
  return match ? match[1] : "";
}

function httpStatus(body) {
  switch (body?.status) {
    case "ok":
    case "committed":
    case "absent":
    case "recorded":
      return 200;
    case "rejected":
      return ["report-limit","message-limit"].includes(body.code) ? 429 : 403;
    case "conflict":
      return 409;
    case "expired-session":
      return 401;
    case "ambiguous":
      return 202;
    case "unavailable":
      return 404;
    default:
      return 500;
  }
}

const WRITES = new Set(["join", "leave", "accept", "grant", "revoke", "delete-account", "block", "report", ...OPERATOR_WRITES, ...MESSAGE_WRITES, ...DISCUSSION_WRITES]);

export async function route(world, req) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  const path = url.pathname;
  const method = req.method || "GET";
  if(path.startsWith(RECOVERY_PREFIX)){
    req[REPORT_REQUEST]=true;
    if(!world.localRecoveryContract)return dispatchRecovery(world,{method,path:path+url.search});
    let body;
    if(method==='POST'){
      body=await readBody(req,MAX_RECOVERY_BYTES);
      if(body===TOO_LARGE)return {status:413,headers:{'cache-control':'no-store','vary':'Authorization'},body:{status:'rejected',error:'recovery_too_large'}};
      if(body===null)return {status:400,headers:{'cache-control':'no-store','vary':'Authorization'},body:{status:'rejected',error:'invalid_recovery_body'}};
    }
    return dispatchRecovery(world,{method,path:path+url.search,authorization:req.headers.authorization,body});
  }
  if (method === "GET" && path === "/api/health") {
    return { status: 200, body: { status: "ok", prototype: true } };
  }
  if (method === "POST" && path === "/api/session") {
    const body = await readBody(req);
    if (body == null) return { status: 400, body: { status: "rejected", error: "The body is not JSON." } };
    const result = await world.signIn(body.magicName, body.passcode);
    return { status: httpStatus(result), body: result };
  }

  const token = bearer(req);
  const discussionPath=/^\/api\/plans\/([^/]+)\/discussion$/.exec(path);
  if(method==='GET'&&discussionPath){
    req[REPORT_REQUEST]=true;
    if(!world.discussionContract)return {status:404,body:{status:'unavailable',blocker:'Discussion disabled.'}};
    const keys=[...url.searchParams.keys()];
    if(keys.length>1||keys.some(k=>k!=='view')||!['feed','queue','notices'].includes(url.searchParams.get('view')??'feed'))return {status:400,body:{status:'rejected',error:'invalid_discussion_query'}};
    const result=await world.discussion(token,decodeURIComponent(discussionPath[1]),url.searchParams.get('view')??'feed');
    return {status:httpStatus(result),body:result};
  }
  if (method === 'GET' && ['/api/ops/triage', '/api/ops/recipient'].includes(path)) {
    req[REPORT_REQUEST] = true;
    const result = await world.privateOpsState(token, url.searchParams.get('planId'), path.endsWith('triage') ? 'triage' : 'recipient');
    return { status: httpStatus(result), body: result };
  }
  if (method === 'GET' && path === '/api/ops/state') {
    req[REPORT_REQUEST] = true; // Operator failures also omit exception contents.
    const result = await world.opsState(token, url.searchParams.get('planId'));
    return { status: httpStatus(result), body: result };
  }
  if (method === "GET" && path === "/api/plans") {
    const result = await world.discover(token);
    return { status: httpStatus(result), body: result };
  }
  const messagePath=/^\/api\/plans\/([^/]+)\/(messaging-context|messages)$/.exec(path);
  if(method==='GET'&&messagePath){
    req[REPORT_REQUEST]=true;
    if(!world.messagingContract)return {status:404,body:{status:'unavailable',blocker:'Messaging disabled.'}};
    const allowed=messagePath[2]==='messaging-context'?['invitationId']:['instanceId','invitationId','messagingEpoch','afterSeq','limit'];
    const keys=[...url.searchParams.keys()];if(new Set(keys).size!==keys.length||keys.some(k=>!allowed.includes(k))||!url.searchParams.has('invitationId')||(messagePath[2]==='messages'&&['instanceId','messagingEpoch'].some(k=>!url.searchParams.has(k))))return {status:400,body:{status:'rejected',error:'invalid_message_query'}};
    const planId=decodeURIComponent(messagePath[1]),invitationId=url.searchParams.get('invitationId');
    const result=messagePath[2]==='messaging-context'?await world.messagingContext(token,planId,invitationId):await world.messages(token,{instanceId:url.searchParams.get('instanceId'),planId,invitationId,messagingEpoch:Number(url.searchParams.get('messagingEpoch')),afterSeq:Number(url.searchParams.get('afterSeq')??0),limit:Number(url.searchParams.get('limit')??50)});
    return {status:httpStatus(result),body:result};
  }
  const membership = /^\/api\/membership\/([^/]+)$/.exec(path);
  if (method === "GET" && membership) {
    const result = await world.membership(token, decodeURIComponent(membership[1]));
    return { status: httpStatus(result), body: result };
  }
  const visibility = /^\/api\/plans\/([^/]+)\/visibility$/.exec(path);
  if (method === "GET" && visibility) {
    const result = await world.visibility(token, decodeURIComponent(visibility[1]));
    return { status: httpStatus(result), body: result };
  }
  const plan = /^\/api\/plans\/([^/]+)$/.exec(path);
  if (method === "GET" && plan) {
    const result = await world.plan(token, decodeURIComponent(plan[1]));
    return { status: httpStatus(result), body: result };
  }
  const write = /^\/api\/writes\/([^/]+)$/.exec(path);
  if (method === "POST" && write) {
    const endpoint = decodeURIComponent(write[1]);
    if(DISCUSSION_WRITES.has(endpoint)&&!world.discussionContract)return {status:404,body:{status:'unavailable',blocker:'Discussion disabled.'}};
    if (QUEUE_WRITES.has(endpoint) && !world.privacyQueueContract) return { status: 404, body: { status: 'unavailable', blocker: 'Privacy queue disabled.' } };
    if(MESSAGE_WRITES.has(endpoint)&&!world.messagingContract)return {status:404,body:{status:'unavailable',blocker:'Messaging disabled.'}};
    if (!WRITES.has(endpoint)) {
      return { status: 404, body: { status: "unavailable", blocker: "That route is not in this prototype." } };
    }
    if (endpoint === "report" || OPERATOR_WRITES.has(endpoint) || MESSAGE_WRITES.has(endpoint) || DISCUSSION_WRITES.has(endpoint)) req[REPORT_REQUEST] = true;
    const body = await readBody(req, DISCUSSION_WRITES.has(endpoint)?8192:endpoint === "report" || OPERATOR_WRITES.has(endpoint) || MESSAGE_WRITES.has(endpoint) ? MAX_REPORT_REQUEST_BYTES : Infinity);
    if (body === TOO_LARGE) return { status: 413, body: { status: "rejected", error: "The report request is too large." } };
    if (body == null) return { status: 400, body: { status: "rejected", error: "The body is not JSON." } };
    const faultHeader = String(req.headers["x-soe-fault"] || "");
    const fault = world.allowFaults && !OPERATOR_WRITES.has(endpoint) && (faultHeader === "drop-before" || faultHeader === "drop-after") ? faultHeader : "";
    const result = await world.write(token, endpoint, body, fault);
    return { status: httpStatus(result), body: result };
  }
  if (method === "POST" && path === "/api/lookup") {
    if(world.messagingContract||world.discussionContract)req[REPORT_REQUEST]=true;
    const body = await readBody(req, world.discussionContract?8192:world.messagingContract?MAX_MESSAGE_BYTES:Infinity);
    if (body === TOO_LARGE) return {status:413,body:{status:"rejected",error:"lookup_too_large"}};
    if (body == null) return { status: 400, body: { status: "rejected", error: "The body is not JSON." } };
    if (body.endpoint === "report" || OPERATOR_WRITES.has(body.endpoint) || MESSAGE_WRITES.has(body.endpoint)) req[REPORT_REQUEST] = true;
    const result = await world.lookup(token, body);
    return { status: httpStatus(result), body: result };
  }
  return { status: 404, body: { status: "unavailable", blocker: "That route is not in this prototype." } };
}

export function createHttp(world) {
  const server = createServer(async (req, res) => {
    try {
      const result = await route(world, req);
      send(res, result.status, result.body, result.headers);
    } catch (error) {
      const reportRequest = req[REPORT_REQUEST] === true;
      const blocker = !reportRequest && world.allowFaults && error instanceof Error ? error.message : "The prototype hit an unexpected error.";
      send(res, 500, { status: "unavailable", blocker });
    }
  });
  return {
    listen(port = 0) {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            reject(new Error("Expected a TCP port."));
            return;
          }
          resolve({ url: `http://127.0.0.1:${address.port}` });
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}
