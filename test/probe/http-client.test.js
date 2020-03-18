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
const { promisify } = require('util');
const sleep = promisify(setTimeout);

const fetch = require("node-fetch");
const request = require("request-promise-native");
const axios = require('axios');
const http = require('http');
const https = require('https');


const TEST_HOST = "subdomain.example.com";
const TEST_DOMAIN = "example.com";
const TEST_PATH = "/test";

const TEST_REQUEST_ID = "test-request-id";

function assertMetrics(metrics, opts) {
    opts = opts || {};
    const port = opts.port || (opts.protocol === "https" ? 443: 80);

    console.log("http metrics:", metrics);

    assert(typeof metrics === "object");
    assert.equal(metrics.host, TEST_HOST);
    assert.equal(metrics.port, port);
    assert.equal(metrics.responseCode, opts.responseCode || 200);
    assert.equal(metrics.domain, TEST_DOMAIN);
    assert.equal(metrics.method, opts.method || "GET");
    assert.equal(metrics.path, opts.path || TEST_PATH);
    assert.equal(metrics.url, `${opts.protocol || "http"}://${TEST_HOST}${opts.port ? (":" + opts.port) : ''}${opts.path || TEST_PATH}`);
    assert.equal(metrics.contentType, "application/json");
    assert.equal(metrics.serverIPAddress, "127.0.0.1");
    assert.equal(metrics.responseBodySize, opts.responseBodySize || 11);
    assert.equal(metrics.serverRequestId, TEST_REQUEST_ID);
    assert.ok(Number.isFinite(metrics.duration));
    assert.ok(metrics.duration >= 0);
    assert.ok(Number.isFinite(metrics.durationBlocked));
    assert.ok(metrics.durationBlocked >= 0);
    assert.ok(Number.isFinite(metrics.durationBlocked));
    assert.ok(metrics.durationBlocked >= 0);
    // disabling the durationDNS checks because
    // with nock it does not do any DNS resolution and its always undefined
    // assert.ok(Number.isFinite(metrics.durationDNS));
    // assert.ok(metrics.durationDNS >= 0);
    assert.ok(Number.isFinite(metrics.durationConnect));
    assert.ok(metrics.durationConnect >= 0);
    if (opts.protocol === "https") {
        assert.ok(Number.isFinite(metrics.durationSSL));
        assert.ok(metrics.durationSSL >= 0);
    }
    assert.ok(Number.isFinite(metrics.durationSend));
    // disabling the durationSend >= 0 check below because:
    // with nock the order of events is incorrect and reversed,
    // so durationSend turns out to be always negative
    // assert.ok(metrics.durationSend >= 0);

    assert.ok(Number.isFinite(metrics.durationWait));
    assert.ok(metrics.durationWait >= 0);
    assert.ok(Number.isFinite(metrics.durationReceive));
    assert.ok(metrics.durationReceive >= 0);
    assert.ok(metrics.duration >= metrics.durationReceive);
}

function assertErrorMetrics(metrics, opts) {
    opts = opts || {};
    opts.port = opts.port || (opts.protocol === "https" ? 443: 80);

    console.log("metrics:", metrics);
    assert(typeof metrics === "object");
    assert.equal(metrics.host, TEST_HOST);
    assert.equal(metrics.port, opts.port);
    assert.equal(metrics.domain, TEST_DOMAIN);
    assert.equal(metrics.method, opts.method || "GET");
    assert.equal(metrics.path, opts.path || TEST_PATH);
    assert.equal(metrics.url, `${opts.protocol || "http"}://${TEST_HOST}${opts.path || TEST_PATH}`);

    assert.equal(metrics.error, true);
    assert.equal(metrics.errorMessage, opts.errorMessage);
    assert.equal(metrics.errorCode, opts.errorCode);

    assert.ok(Number.isFinite(metrics.duration));
    assert.ok(metrics.duration >= 0);
}

describe("probe http-client", function() {
    beforeEach(function() {
        nock(`http://${TEST_HOST}`).get(TEST_PATH).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});
        nock(`https://${TEST_HOST}`).get(TEST_PATH).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});
        nock(`http://${TEST_HOST}`).post(TEST_PATH).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});

        delete this.metrics;
        instrumentHttpClient.stop();
        instrumentHttpClient.start((metrics) => {
            this.metrics = metrics;
        });
    });

    this.afterEach((function() {
        instrumentHttpClient.stop();
    }));

    describe("fetch", function() {

        it("fetch http GET plain", async function() {
            const response = await fetch(`http://${TEST_HOST}${TEST_PATH}`);
            const json = await response.json();

            assert.equal(response.status, 200);
            assert.deepStrictEqual(json, { ok: true });

            assertMetrics(this.metrics);
        });

        it("fetch http GET - without reading response", async function() {
            const response = await fetch(`http://${TEST_HOST}${TEST_PATH}`);
            assert.equal(response.status, 200);

            await sleep(100);

            assertMetrics(this.metrics);
        });

        it("fetch https GET", async function() {
            const response = await fetch(`https://${TEST_HOST}${TEST_PATH}`);
            const json = await response.json();

            assert.equal(response.status, 200);
            assert.deepStrictEqual(json, { ok: true });

            assertMetrics(this.metrics, { protocol: "https" });
        });

        it("fetch http GET with query params", async function() {
            nock(`http://${TEST_HOST}`).get(`${TEST_PATH}?key=value`).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});
            const response = await fetch(`http://${TEST_HOST}${TEST_PATH}?key=value`);
            const json = await response.json();

            assert.equal(response.status, 200);
            assert.deepStrictEqual(json, { ok: true });

            assertMetrics(this.metrics, {
                path: `${TEST_PATH}?key=value`
            });
        });

        it("fetch http GET with port", async function() {
            nock(`http://${TEST_HOST}:1234`).get(TEST_PATH).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});
            const response = await fetch(`http://${TEST_HOST}:1234${TEST_PATH}`);
            const json = await response.json();

            assert.equal(response.status, 200);
            assert.deepStrictEqual(json, { ok: true });

            assertMetrics(this.metrics, {
                port: 1234
            });
        });

        it("fetch http GET no content-length header", async function() {
            nock.cleanAll();
            nock(`http://${TEST_HOST}`).get(TEST_PATH).reply(200, {ok: true}, {"content-length": undefined, "x-request-id": TEST_REQUEST_ID});

            const response = await fetch(`http://${TEST_HOST}${TEST_PATH}`);
            const json = await response.json();

            assert.equal(response.status, 200);
            assert.deepStrictEqual(json, { ok: true });

            assertMetrics(this.metrics);
        });

        it("fetch http status 500", async function() {
            const FAIL_500_PATH = "/fail500";
            nock(`http://${TEST_HOST}`).get(FAIL_500_PATH).reply(500, {ok: false}, {"x-request-id": TEST_REQUEST_ID});

            await fetch(`http://${TEST_HOST}${FAIL_500_PATH}`);

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
            nock(`http://${TEST_HOST}`).get(FAIL_CONNECT_PATH).replyWithError(err);

            try {
                await fetch(`http://${TEST_HOST}${FAIL_CONNECT_PATH}`, {
                    timeout: 100
                });
            } catch (e) {
                assert.equal(e.message, "request to http://subdomain.example.com/fail-connect failed, reason: connect error");
                console.error(e);
            }

            // wait for next ticks
            await sleep(10);

            assertErrorMetrics(this.metrics, {
                errorMessage: FAIL_CONNECT_ERROR,
                errorCode: FAIL_CONNECT_CODE,
                path: FAIL_CONNECT_PATH
            });
        });

        it("fetch http POST", async function() {
            const response = await fetch(`http://${TEST_HOST}${TEST_PATH}`, {
                method: "POST",
                body: "some text"
            });
            const json = await response.json();

            assert.equal(response.status, 200);
            assert.deepStrictEqual(json, { ok: true });

            assertMetrics(this.metrics, {
                method: "POST"
            });
            assert.equal(this.metrics.requestBodySize, "some text".length);
        });

        it("fetch http delay", async function() {
            const TEST_DELAY_PATH = "/delay";
            nock(`http://${TEST_HOST}`).get(TEST_DELAY_PATH).delayBody(300).reply(200, {ok: true}, {"x-request-id": TEST_REQUEST_ID});

            const response = await fetch(`http://${TEST_HOST}${TEST_DELAY_PATH}`);
            const json = await response.json();

            assert.equal(response.status, 200);
            assert.deepStrictEqual(json, { ok: true });

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

            // using this to test durationWait time
            const response = await fetch(`https://httpbin.org/anything`, {
                method: "POST",
                body: new Array(500000).join("x")
            });
            await response.text();

            assertMetrics(this.metrics, {
                method: "POST"
            });
            assert.equal(this.metrics.requestBodySize, "some text".length);
        });
    });

    describe("request", function() {
        it("request http GET", async function() {
            await request(`http://${TEST_HOST}${TEST_PATH}`);

            assertMetrics(this.metrics);
        });

        it("request https GET", async function() {
            await request(`https://${TEST_HOST}${TEST_PATH}`);

            assertMetrics(this.metrics, { protocol: "https" });
        });
    });

    describe("axios", function() {
        it("axios http GET", async function() {
            await axios(`http://${TEST_HOST}${TEST_PATH}`);

            assertMetrics(this.metrics);
        });

        it("request https GET", async function() {
            await axios(`https://${TEST_HOST}${TEST_PATH}`);

            assertMetrics(this.metrics, { protocol: "https" });
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
            await httpRequest(http, `http://${TEST_HOST}${TEST_PATH}`);

            assertMetrics(this.metrics);
        });

        it("node http GET with URL", async function() {
            await httpRequest(http, new URL(`http://${TEST_HOST}${TEST_PATH}`));

            assertMetrics(this.metrics);
        });

        it("node http GET without reading response", async function() {
            await httpRequest(http, `http://${TEST_HOST}${TEST_PATH}`, {noResponseListener: true});

            // wait for next ticks
            await sleep(10);

            assertMetrics(this.metrics);
        });

        it("node https GET", async function() {
            await httpRequest(https, `https://${TEST_HOST}${TEST_PATH}`);

            assertMetrics(this.metrics, { protocol: "https" });
        });

        it("node http timeout", async function() {
            const FAIL_TIMEOUT_PATH = "/timeout";
            nock(`http://${TEST_HOST}`).get(FAIL_TIMEOUT_PATH).socketDelay(2000).reply(200);

            await httpRequest(http, `http://${TEST_HOST}${FAIL_TIMEOUT_PATH}`);

            assertErrorMetrics(this.metrics, {
                path: FAIL_TIMEOUT_PATH,
                errorMessage: "Connection timed out",
                errorCode: 110
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

            assert.equal(this.metrics, undefined);
        });
    });
});
