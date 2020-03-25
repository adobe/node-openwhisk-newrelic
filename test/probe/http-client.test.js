/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2020 Adobe
* All Rights Reserved.
*
* NOTICE: All information contained herein is, and remains
* the property of Adobe and its suppliers, if any. The intellectual
* and technical concepts contained herein are proprietary to Adobe
* and its suppliers and are protected by all applicable intellectual
* property laws, including trade secret and copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe.
**************************************************************************/

/* eslint-env mocha */
/* eslint-disable mocha/no-mocha-arrows */

"use strict";

const instrumentHttpClient = require("../../lib/probe/http-client");
const sendQueue = require("../../lib/queue");

const assert = require("assert");
const nock = require("nock");
const ServerMock = require("mock-http-server");
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const url = require('url');
const pem = require('pem').promisified;

const fetch = require("node-fetch");
const request = require("request-promise-native");
const axios = require('axios');
const http = require('http');
const https = require('https');
const needle = require('needle');

// for tests using mock-http-server which is a real local webserver
// that  can only run on "localhost"
const TEST_HOST = "localhost";
const TEST_DOMAIN = "localhost";

// for tests using nock which can use arbitrary domains
const TEST_HOST_NOCK = "subdomain.example.com";
const TEST_DOMAIN_NOCK = "example.com";

const TEST_REQUEST_ID = "test-request-id";

function doAssertMetrics(metrics, opts) {
    opts = opts || {};
    const host = opts.host || TEST_HOST;
    const port = opts.port || (opts.protocol === "https" ? 443: 80);
    const urlPort = ((port === 80 && (opts.protocol === undefined || opts.protocol === "http"))
                     || (port === 443 && opts.protocol === "https")) ? "" : `:${port}`;
    const path = opts.path;
    const url = `${opts.protocol || "http"}://${host}${urlPort}${path}`;

    console.log("http metrics:", metrics);

    assert(typeof metrics === "object");
    assert.strictEqual(metrics.host, host);
    assert.strictEqual(metrics.port, port);
    assert.strictEqual(metrics.responseCode, opts.responseCode || 200);
    assert.strictEqual(metrics.domain, opts.domain || TEST_DOMAIN);
    assert.strictEqual(metrics.method, opts.method || "GET");
    assert.strictEqual(metrics.path, path);
    assert.strictEqual(metrics.url, opts.url || url);
    assert.strictEqual(metrics.contentType, "application/json");
    if (!opts.ignoreServerIPAddress) {
        assert.strictEqual(metrics.serverIPAddress, "127.0.0.1");
    }
    assert.strictEqual(metrics.responseBodySize, opts.responseBodySize || 11);
    if (!opts.ignoreServerRequestId) {
        assert.strictEqual(metrics.serverRequestId, TEST_REQUEST_ID);
    }
    assert.ok(Number.isFinite(metrics.duration));
    assert.ok(metrics.duration >= 0);
    assert.ok(Number.isFinite(metrics.durationBlocked));
    assert.ok(metrics.durationBlocked >= 0);
    assert.ok(Number.isFinite(metrics.durationBlocked));
    assert.ok(metrics.durationBlocked >= 0);
    if (!opts.ignoreDNSLookup) {
        // for nock tests which don't do any DNS resolution and its always undefined
        assert.ok(Number.isFinite(metrics.durationDNS));
        assert.ok(metrics.durationDNS >= 0);
    }
    assert.ok(Number.isFinite(metrics.durationConnect));
    assert.ok(metrics.durationConnect >= 0);
    if (opts.protocol === "https") {
        assert.ok(Number.isFinite(metrics.durationSSL));
        assert.ok(metrics.durationSSL >= 0);
    }
    if (!opts.ignoreDurationSend) {
        // for nock tests where the order of some events is wrong so durationSend is always incorrect
        assert.ok(Number.isFinite(metrics.durationSend));
        assert.ok(metrics.durationSend >= 0);
    }

    assert.ok(Number.isFinite(metrics.durationWait));
    assert.ok(metrics.durationWait >= 0);
    assert.ok(Number.isFinite(metrics.durationReceive));
    assert.ok(metrics.durationReceive >= 0);
    assert.ok(metrics.duration >= metrics.durationReceive);
}

function assertMetricsNock(metrics, opts) {
    doAssertMetrics(
        metrics,
        Object.assign({
            host: TEST_HOST_NOCK,
            domain: TEST_DOMAIN_NOCK,
            ignoreDNSLookup: true,
            ignoreDurationSend: true
        }, opts)
    );
}

function assertErrorMetricsNock(metrics, opts) {
    opts = opts || {};
    opts.port = opts.port || (opts.protocol === "https" ? 443: 80);

    console.log("error metrics:", metrics);

    assert(typeof metrics === "object");
    assert.strictEqual(metrics.host, TEST_HOST_NOCK);
    assert.strictEqual(metrics.port, opts.port);
    assert.strictEqual(metrics.domain, TEST_DOMAIN_NOCK);
    assert.strictEqual(metrics.method, opts.method || "GET");
    assert.strictEqual(metrics.path, opts.path);
    assert.strictEqual(metrics.url, `${opts.protocol || "http"}://${TEST_HOST_NOCK}${opts.path}`);

    assert.strictEqual(metrics.error, true);
    assert.strictEqual(metrics.errorMessage, opts.errorMessage);
    assert.strictEqual(metrics.errorCode, opts.errorCode);

    assert.ok(Number.isFinite(metrics.duration));
    assert.ok(metrics.duration >= 0);
}

describe("probe http-client", function() {

    let server;

    before(async function() {
        // dynamically create self-signed certificate for mock server
        const SSL_KEYS = await pem.createCertificate({ days: 1, selfSigned: true });
        // make client requests not validate self-signed server certificate
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

        server = new ServerMock({
            host: "localhost"
        }, {
            host: "localhost",
            key: SSL_KEYS.serviceKey,
            cert: SSL_KEYS.certificate
        });
    });

    function getHost() {
        return `${TEST_HOST}:${server.getHttpPort()}`;
    }

    function getHttpsHost() {
        return `${TEST_HOST}:${server.getHttpsPort()}`;
    }

    function assertMetrics(metrics, opts={}) {
        doAssertMetrics(
            metrics,
            Object.assign({
                port: opts.protocol === "https" ? server.getHttpsPort() : server.getHttpPort()
            }, opts)
        );
    }

    beforeEach(function(done) {
        server.start(done);

        delete this.metrics;
        instrumentHttpClient.stop();
        instrumentHttpClient.start((metrics) => {
            this.metrics = metrics;
        });
    });

    afterEach(function(done) {
        instrumentHttpClient.stop();

        server.stop(done);
    });

    function mockServer(method, path) {
        server.on({
            method: method,
            path: path,
            reply: {
                status:  200,
                headers: {"x-request-id": TEST_REQUEST_ID},
                body:    JSON.stringify({ok: true})
            }
        });
    }

    describe("fetch", function() {

        async function assertFetchResponse(response) {
            assert.strictEqual(response.status, 200, `expected http response code 200 but got: ${response.status} ${response.statusText}`);
            const json = await response.json();
            assert.deepStrictEqual(json, { ok: true });
        }

        it("fetch http GET plain", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            const response = await fetch(`http://${getHost()}${TEST_PATH}`);
            await assertFetchResponse(response);

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });

        it("fetch http GET - without reading response", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            const response = await fetch(`http://${getHost()}${TEST_PATH}`);
            assert.strictEqual(response.status, 200);

            await sleep(100);

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });

        it("fetch http GET - parse domain", async function() {
            const TEST_PATH = "/test";
            nock(`http://${TEST_HOST_NOCK}`).get(TEST_PATH).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});

            const response = await fetch(`http://${TEST_HOST_NOCK}${TEST_PATH}`);
            await assertFetchResponse(response);

            assertMetricsNock(this.metrics, {
                path: TEST_PATH
            });
        });

        it("fetch https GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            const response = await fetch(`https://${getHttpsHost()}${TEST_PATH}`);
            await assertFetchResponse(response);

            assertMetrics(this.metrics, {
                protocol: "https",
                path: TEST_PATH
            });
        });

        it("fetch http GET with query params", async function() {
            const TEST_PATH_PARAMS = "/params";
            server.on({
                method: "GET",
                path: `${TEST_PATH_PARAMS}`,
                filter: function (req) {
                    // check for ?key=value
                    const params = url.parse(req.url,true).query;
                    return (params.key === "value" && Object.keys(params).length === 1);
                },
                reply: {
                    status: 200,
                    headers: { "x-request-id": TEST_REQUEST_ID },
                    body: JSON.stringify({ ok: true })
                }
            });

            const response = await fetch(`http://${getHost()}${TEST_PATH_PARAMS}?key=value`);
            await assertFetchResponse(response);

            assertMetrics(this.metrics, {
                path: `${TEST_PATH_PARAMS}?key=value`
            });
        });

        it("fetch http GET with default port", async function() {
            const TEST_PATH = "/test";
            nock(`http://${TEST_HOST_NOCK}`).get(TEST_PATH).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});

            const response = await fetch(`http://${TEST_HOST_NOCK}${TEST_PATH}`);
            await assertFetchResponse(response);

            assertMetricsNock(this.metrics, {
                path: TEST_PATH
            });
        });

        it("fetch https GET with default port", async function() {
            const TEST_PATH = "/test";
            nock(`https://${TEST_HOST_NOCK}`).get(TEST_PATH).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});

            const response = await fetch(`https://${TEST_HOST_NOCK}${TEST_PATH}`);
            await assertFetchResponse(response);

            assertMetricsNock(this.metrics, {
                protocol: "https",
                path: TEST_PATH
            });
        });

        it("fetch http GET no content-length header", async function() {
            const TEST_PATH_NO_CONTENT_LENGTH = "/nocontentlength";
            server.on({
                method: "GET",
                path: TEST_PATH_NO_CONTENT_LENGTH,
                reply: {
                    status:  200,
                    headers: { "x-request-id": TEST_REQUEST_ID },
                    headersOverrides: { "content-length": undefined },
                    body:    JSON.stringify({ok: true})
                }
            });

            const response = await fetch(`http://${getHost()}${TEST_PATH_NO_CONTENT_LENGTH}`);
            await assertFetchResponse(response);

            assertMetrics(this.metrics, {
                path: TEST_PATH_NO_CONTENT_LENGTH
            });
        });

        it("fetch http status 500", async function() {
            const FAIL_500_PATH = "/fail500";
            server.on({
                method: "GET",
                path: FAIL_500_PATH,
                reply: {
                    status:  500,
                    headers: {"x-request-id": TEST_REQUEST_ID},
                    body:    JSON.stringify({ok: false})
                }
            });

            await fetch(`http://${getHost()}${FAIL_500_PATH}`);

            // wait for async response event
            await sleep(50);

            assertMetrics(this.metrics, {
                responseCode: 500,
                path: FAIL_500_PATH,
                responseBodySize: 12
            });
        });

        it("fetch http fail with connect error", async function() {
            const FAIL_CONNECT_PATH = "/fail-connect";
            const FAIL_CONNECT_ERROR = "connect error";
            const FAIL_CONNECT_CODE = 1234;
            const err = new Error(FAIL_CONNECT_ERROR);
            err.code = FAIL_CONNECT_CODE;
            nock(`http://${TEST_HOST_NOCK}`).get(FAIL_CONNECT_PATH).replyWithError(err);

            try {
                await fetch(`http://${TEST_HOST_NOCK}${FAIL_CONNECT_PATH}`, {
                    timeout: 100
                });
            } catch (e) {
                assert.strictEqual(e.message, "request to http://subdomain.example.com/fail-connect failed, reason: connect error");
                console.error(e);
            }

            // wait for next ticks
            await sleep(10);

            assertErrorMetricsNock(this.metrics, {
                errorMessage: FAIL_CONNECT_ERROR,
                errorCode: FAIL_CONNECT_CODE,
                path: FAIL_CONNECT_PATH
            });
        });

        it("fetch http POST", async function() {
            const TEST_PATH = "/post";
            mockServer("POST", TEST_PATH);

            const response = await fetch(`http://${getHost()}${TEST_PATH}`, {
                method: "POST",
                body: "some text"
            });
            await assertFetchResponse(response);

            assertMetrics(this.metrics, {
                method: "POST",
                path: TEST_PATH
            });
            assert.strictEqual(this.metrics.requestBodySize, "some text".length);
        });

        it("fetch http PUT", async function() {
            const TEST_PUT_PATH = "/put";
            mockServer("PUT", TEST_PUT_PATH);

            const requestBody = new Array(100000).join("x");

            const response = await fetch(`http://${getHost()}${TEST_PUT_PATH}`, {
                method: "PUT",
                body: requestBody
            });
            await assertFetchResponse(response);

            assertMetrics(this.metrics, {
                method: "PUT",
                path: TEST_PUT_PATH
            });
            assert.strictEqual(this.metrics.requestBodySize, requestBody.length);
        });

        // TODO: fix fetch http stream - not measuring request size: try read request content-length
        it.skip("fetch http stream PUT", async function() {
            const TEST_PUT_PATH = "/put";
            mockServer("PUT", TEST_PUT_PATH);

            const { Readable } = require('stream');

            function readableFromBuffer(buffer) {
                const readable = new Readable();
                readable._read = () => {}; // _read is required but you can noop it
                readable.push(buffer);
                readable.push(null);
            }

            const UPLOAD_SIZE = 1000000;
            const requestBody = readableFromBuffer(Buffer.alloc(UPLOAD_SIZE, "x"));

            const response = await fetch(`http://${getHost()}${TEST_PUT_PATH}`, {
                method: "PUT",
                body: requestBody
            });
            await assertFetchResponse(response);

            assertMetrics(this.metrics, {
                method: "PUT",
                path: TEST_PUT_PATH
            });
            assert.strictEqual(this.metrics.requestBodySize, UPLOAD_SIZE);
        });

        it("fetch http delay", async function() {
            const TEST_DELAY_PATH = "/delay";
            server.on({
                method: "GET",
                path: TEST_DELAY_PATH,
                reply: {
                    status:  200,
                    headers: {"x-request-id": TEST_REQUEST_ID},
                    body:    JSON.stringify({ok: true})
                },
                delay: 300
            });

            const response = await fetch(`http://${getHost()}${TEST_DELAY_PATH}`);
            await assertFetchResponse(response);

            assertMetrics(this.metrics, {
                path: TEST_DELAY_PATH
            });
            assert.ok(
                // allow 10% deviation = * 0.9
                this.metrics.durationWait >= 300 * 0.9,
                `durationWait is not >= 300 (with 10% margin): ${this.metrics.durationWait}`
            );
        });

        it.skip("fetch http - httpbin playground", async function() {
            this.timeout(20000);

            const requestBody = new Array(5000000).join("x");

            // using this to test durationWait time
            const response = await fetch(`https://httpbin.org/anything`, {
                method: "POST",
                body: requestBody
            });
            await response.text();

            assertMetricsNock(this.metrics, {
                protocol: "https",
                method: "POST",
                host: "httpbin.org",
                domain: "httpbin.org",
                path: "/anything",
                url: "https://httpbin.org/anything",
                ignoreServerIPAddress: true,
                responseBodySize: 5000510,
                ignoreServerRequestId: true
            });
            assert.strictEqual(this.metrics.requestBodySize, requestBody.length);
        });
    });

    describe("request", function() {
        it("request http GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await request(`http://${getHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });

        it("request https GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await request(`https://${getHttpsHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                protocol: "https",
                path: TEST_PATH
            });
        });
    });

    describe("axios", function() {
        it("axios http GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await axios(`http://${getHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });

        it("request https GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await axios(`https://${getHttpsHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                protocol: "https",
                path: TEST_PATH
            });
        });
    });

    describe("node http", function() {

        function httpRequest(http, options, opts) {
            return new Promise((resolve, reject) => {
                const req = http.request(options, (res) => {

                    if (opts && opts.noResponseListener) {
                        resolve();
                    } else {
                        let responseBody = '';

                        res.setEncoding('utf8');
                        res.on('data', (chunk) => {
                            responseBody += chunk;
                        });

                        res.on('end', () => {
                            let body = {};
                            try {
                                body = JSON.parse(responseBody);
                            } catch(e) {
                                console.log("Ignoring error:", e);
                            }
                            resolve(body);
                        });
                    }
                });

                req.on('error', (err) => {
                    reject(err);
                });

                req.setTimeout(1000, () => {
                });

                if (opts && opts.data) {
                    req.write(opts.data);
                }
                req.end();
            });
        }

        it("node http GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await httpRequest(http, `http://${getHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });

        it("node http GET with URL", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await httpRequest(http, new URL(`http://${getHost()}${TEST_PATH}`));

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });

        // TODO: fix missing metrics if response is not read
        it.skip("node http GET without reading response", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await httpRequest(http, `http://${getHost()}${TEST_PATH}`, {noResponseListener: true});

            // wait for next ticks
            await sleep(10);

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });

        it("node https GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await httpRequest(https, `https://${getHttpsHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                protocol: "https",
                path: TEST_PATH
            });
        });

        it("node http timeout", async function() {
            const FAIL_TIMEOUT_PATH = "/timeout";
            nock(`http://${TEST_HOST_NOCK}`).get(FAIL_TIMEOUT_PATH).socketDelay(2000).reply(200);

            await httpRequest(http, `http://${TEST_HOST_NOCK}${FAIL_TIMEOUT_PATH}`);

            assertErrorMetricsNock(this.metrics, {
                path: FAIL_TIMEOUT_PATH,
                errorMessage: "Connection timed out",
                errorCode: 110
            });
        });

        it("node http GET with username and password", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await httpRequest(http, `http://user:pwd@${getHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });
    });

    // used by npm openwhisk library (action invocations)
    describe("needle", function() {
        it("needle http GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await needle("get", `http://${getHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                path: TEST_PATH
            });
        });

        it("needle https GET", async function() {
            const TEST_PATH = "/test";
            mockServer("GET", TEST_PATH);

            await needle("get", `https://${getHttpsHost()}${TEST_PATH}`);

            assertMetrics(this.metrics, {
                protocol: "https",
                path: TEST_PATH
            });
        });
    });

    describe("misc", function() {
        it("should ignore our own newrelic requests", async function() {
            nock("https://insights-collector.newrelic.com")
                .post("/v1/accounts/123456/events")
                .reply(200, {});

            const response = await fetch("https://insights-collector.newrelic.com/v1/accounts/123456/events", {
                method: "POST",
                headers: {
                    "User-Agent": sendQueue.USER_AGENT,
                    "X-Insert-Key": "1234567"
                }
            });
            await response.json();

            assert.strictEqual(this.metrics, undefined);
        });
    });
});