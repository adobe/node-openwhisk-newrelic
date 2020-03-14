/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
* Copyright 2019 Adobe
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

const NewRelic = require('../lib/newrelic');
const sendQueue = require('../lib/queue');

const assert = require("assert");
const nock = require('nock');
const zlib = require('zlib');
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const fetch = require("node-fetch");

const NR_FAKE_BASE_URL = "http://newrelic.com";
const NR_FAKE_EVENTS_PATH = "/events";
const NR_FAKE_API_KEY = "new-relic-api-key";
const EVENT_TYPE = "myevent";

const FAKE_PARAMS = Object.freeze({
    newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
    newRelicApiKey: NR_FAKE_API_KEY,
    sendIntervalMs: 10
});

const EXPECTED_METRICS = Object.freeze({
    actionName: "action",
    namespace: "namespace",
    activationId: "activationId",
    package: "package",
    timestamp: /\d+/
});

function assertObjectMatches(actual, expected) {
    for (const key in expected) {
        const value = expected[key];
        if (value instanceof RegExp) {
            assert(value.test(actual[key]));
        } else {
            assert.strictEqual(actual[key], value, `property '${key}' does not match`);
        }
    }
}

function gunzip(body, log=false) {
    body = Buffer.from(body, 'hex');
    body = zlib.gunzipSync(body).toString();
    if (log) {
        console.log("New Relic received:", body);
    }
    return body;
}

/**
 * @deprecated please use nockNewRelic() instead
 */
function expectNewRelicInsightsEvent(metrics, statusCode=200, defaultExpectedMetrics=true) {
    if (!Array.isArray(metrics)) {
        metrics = [metrics];
    }
    metrics = metrics.map(m => ({
        ...(defaultExpectedMetrics ? EXPECTED_METRICS : {}),
        ...m
    }));

    return nock(NR_FAKE_BASE_URL)
        .filteringRequestBody((body) => gunzip(body, true))
        .matchHeader("x-insert-key", NR_FAKE_API_KEY)
        .post(NR_FAKE_EVENTS_PATH, metrics)
        .reply(statusCode, {});
}

function nockNewRelic() {
    const receivedMetrics = [];
    nock(NR_FAKE_BASE_URL)
        .filteringRequestBody((body) => gunzip(body, false))
        .matchHeader("x-insert-key", NR_FAKE_API_KEY)
        .post(NR_FAKE_EVENTS_PATH, metrics => {
            receivedMetrics.push(...metrics);
            return true;
        })
        .reply(200, {})
        .persist();
    return receivedMetrics;
}

async function metricsDone(timeout=100) {
    await sleep(timeout);
    assert.ok(nock.isDone(), "Did not receive any metrics. Timeout too short?");
}

describe("NewRelic", function() {

    beforeEach(function() {
        process.env.__OW_ACTION_NAME = "/namespace/package/action";
        process.env.__OW_NAMESPACE = "namespace";
        process.env.__OW_ACTIVATION_ID = "activationId";
        process.env.__OW_DEADLINE = Date.now() + 60000;

        // wrap all tests with the required instrumentation
        this.currentTest.fn = NewRelic.instrument(this.currentTest.fn);
    });

    afterEach(function() {
        delete process.env.DISABLE_ACTION_TIMEOUT_METRIC;
        delete process.env.__OW_ACTION_NAME;
        delete process.env.__OW_NAMESPACE;
        delete process.env.__OW_ACTIVATION_ID;
        delete process.env.__OW_DEADLINE;

        NewRelic.stopInstrument();
        sendQueue.stop();
        nock.cleanAll();
    });

    describe("constructor", function() {

        it("constructor should log but not throw error if no url or api key", async function() {
            const metrics = new NewRelic();
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if url is blank string", async function() {
            const params = {
                newRelicEventsURL: '\n',
                newRelicApiKey: NR_FAKE_API_KEY,
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if url is null", async function() {
            const params = {
                newRelicEventsURL: null,
                newRelicApiKey: NR_FAKE_API_KEY,
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is blank string", async function() {
            const params = {
                newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
                newRelicApiKey: '\n'
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is not a string", async function() {
            const params = {
                newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
                newRelicApiKey: 2
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is undefined", async function() {
            const params = {
                newRelicEventsURL: `${NR_FAKE_BASE_URL}${NR_FAKE_EVENTS_PATH}`,
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });
    });

    describe("send()", function() {

        it("sendMetrics", async function() {
            const nockSendEvent = expectNewRelicInsightsEvent({
                eventType: EVENT_TYPE,
                test: "value"
            });
            const metrics = new NewRelic(FAKE_PARAMS);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();
            await sleep(100);
            assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
        });

        it("sendMetrics - default metrics frozen object", async function() {
            expectNewRelicInsightsEvent({
                eventType: EVENT_TYPE,
                test: "value",
                duration:2000
            });
            const defaultMetrics = Object.freeze({
                duration:2000
            });
            const metrics = new NewRelic(FAKE_PARAMS, defaultMetrics);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();
            await metricsDone();
        });

        it("sendMetrics - default metrics", async function() {
            expectNewRelicInsightsEvent({
                eventType: EVENT_TYPE,
                test: "value",
                duration:2000
            });
            const defaultMetrics = {
                duration: 2000
            };
            const metrics = new NewRelic(FAKE_PARAMS, defaultMetrics);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();
            await metricsDone();
            assert.equal(Object.keys(defaultMetrics), "duration");
            assert.equal(defaultMetrics.duration, 2000);
        });

        it("sendMetrics - fail with 500 but not throw error", async function() {
            expectNewRelicInsightsEvent({
                eventType: EVENT_TYPE,
                test: "value"
            }, 500);
            const metrics = new NewRelic(FAKE_PARAMS);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();
            await metricsDone();
        });

        it("sendMetrics - request throws error but it is handled", async function() {
            nock(NR_FAKE_BASE_URL)
                .filteringRequestBody(gunzip)
                .matchHeader("x-insert-key", NR_FAKE_API_KEY)
                .post(NR_FAKE_EVENTS_PATH, [{
                    ...EXPECTED_METRICS,
                    eventType: EVENT_TYPE,
                    test: "value"
                }])
                .replyWithError("faked error");

            const metrics = new NewRelic({
                ...FAKE_PARAMS,
            });
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();
            await metricsDone();
        });

        it("sendMetrics - for concurrent activations", async function() {
            const receivedMetrics = nockNewRelic();

            // simulate a bunch of concurrent activations
            const ACTIVATION_COUNT = 200;

            const activations = [];
            for (let i = 0; i < ACTIVATION_COUNT; i++) {
                activations[i] = NewRelic.instrument(async () => {
                    // add some random separation of the different activations
                    await sleep(Math.random() * 10);

                    const metrics = new NewRelic({
                        ...FAKE_PARAMS,
                        sendIntervalMs: 500
                    });
                    metrics.add({
                        activationId: i
                    });

                    await metrics.send(EVENT_TYPE, { test: "value" });
                    await metrics.activationFinished();
                })();
            }
            await Promise.all(activations);

            await metricsDone(500);

            assert.equal(receivedMetrics.length, ACTIVATION_COUNT);
            receivedMetrics.forEach(m => {
                assert.equal(m.eventType, EVENT_TYPE);
                // assert.equal(m.url, "http://example.com/test");
                // assert.equal(m.responseCode, 200);
                assertObjectMatches(m, {
                    actionName: "action",
                    namespace: "namespace",
                    package: "package",
                    timestamp: /\d+/
                });
            });
            // make sure all activation ids are found, but could be any order
            for (let i = 0; i < ACTIVATION_COUNT; i++) {
                assert(receivedMetrics.some(m => m.activationId === i), `did not find activation id ${i}`);
            }
        });
    });

    it("add()", async function() {
        expectNewRelicInsightsEvent([{
            eventType: EVENT_TYPE,
            test: "value",
            added: "metric",
            anotherAdded: "metric"
        },{
            eventType: EVENT_TYPE,
            test: "value",
            added: "metric2",
            anotherAdded: "metric"
        },{
            eventType: EVENT_TYPE,
            added: "metric3",
            anotherAdded: "metric"
        }]);

        const metrics = new NewRelic(FAKE_PARAMS);
        // add metrics
        metrics.add({
            added: "metric",
            anotherAdded: "metric"
        });
        await metrics.send(EVENT_TYPE, { test: "value" });

        // overwrite previously added metrics with newly added metrics
        metrics.add({added: "metric2"});
        await metrics.send(EVENT_TYPE, { test: "value" });

        // overwrite previously added metrics via send() metrics
        await metrics.send(EVENT_TYPE, {added: "metric3"});

        await metrics.activationFinished();
        await metricsDone();
    });

    it("get()", async function() {

        const metrics = new NewRelic({...FAKE_PARAMS, disableActionTimeout: true });
        // add metrics
        metrics.add({
            added: "metric",
            anotherAdded: "metric"
        });

        const m = metrics.get();
        assert.equal(m.added, "metric");
        assert.equal(m.anotherAdded, "metric");
    });

    describe("timeout metrics", function() {

        it("timeout metrics", async function() {
            expectNewRelicInsightsEvent({
                eventType: "timeout",
                duration: /\d+/
            });

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( FAKE_PARAMS );
            await metricsDone();
        });

        it("timeout metrics with callback", async function() {
            const nockSendEvent = expectNewRelicInsightsEvent({
                eventType: "timeout",
                test: 'add_value'
            });

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( Object.assign( {}, FAKE_PARAMS, {
                actionTimeoutMetricsCb: () => {
                    return { test: 'add_value'};
                }
            }));
            await sleep(300);
            assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
        });

        it("timeout metrics with callback, custom eventType", async function() {
            const nockSendEvent = expectNewRelicInsightsEvent({
                eventType: "custom",
                test: 'add_value'
            });

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( Object.assign( {}, FAKE_PARAMS, {
                actionTimeoutMetricsCb: () => {
                    return {
                        eventType: "custom",
                        test: 'add_value'
                    };
                }
            }));
            await sleep(300);
            assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
        });

        it("timeout metrics with invalid callback", async function() {
            const nockSendEvent = expectNewRelicInsightsEvent({
                eventType: "timeout",
                duration: /\d+/
            });

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( Object.assign( {}, FAKE_PARAMS, {
                actionTimeoutMetricsCb: { test: 'add_value'}
            }));
            await sleep(300);
            assert.ok(nockSendEvent.isDone(), "metrics not properly sent");
        });

        it("timeout metrics disabled with options", async function() {
            const mustNotHappen = expectNewRelicInsightsEvent({
                eventType: "timeout",
                duration: /\d+/
            });
            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( Object.assign( {}, FAKE_PARAMS, {
                disableActionTimeout: true
            } ));
            await sleep(300);
            assert.ok(!mustNotHappen.isDone(), "timeout metrics was sent even though it should be disabled");
        });

        it("timeout metrics disabled with environment variable", async function() {
            const mustNotHappen = expectNewRelicInsightsEvent({
                eventType: "timeout",
                duration: /\d+/
            });

            process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic(FAKE_PARAMS);
            await sleep(300); // wait to past action timeout to make sure no timeout metrics are sent
            assert.ok(!mustNotHappen.isDone(), "timeout metrics was sent even though it should be disabled");
        });

        it("timeout metrics with add()", async function() {
            expectNewRelicInsightsEvent({
                eventType: "timeout",
                added: "metric",
                duration: /\d+/
            });

            process.env.__OW_DEADLINE = Date.now() + 100;
            const metrics = new NewRelic( FAKE_PARAMS );
            metrics.add({added: "metric"});
            await sleep(300);
            assert.ok(nock.isDone(), "metrics not properly sent");
        });

        it("send all queued metrics on timeout", async function() {
            expectNewRelicInsightsEvent([{
                eventType: EVENT_TYPE,
                test: "value"
            },{
                eventType: EVENT_TYPE,
                test: "value2"
            },{
                eventType: "timeout",
                duration: /\d+/
            }]);

            process.env.__OW_DEADLINE = Date.now() + 100;
            const metrics = new NewRelic( FAKE_PARAMS );

            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.send(EVENT_TYPE, { test: "value2" });

            await metricsDone(300);
        });
    });

    describe("instrument", function() {
        it("instrument() should wrap action main", async function() {

            function main(params) {
                assert.equal(typeof params, "object");

                // passed in params
                assert.equal(params.key, "value");

                return { ok: true};
            }

            const wrappedMain = NewRelic.instrument(main);

            const result = await wrappedMain({
                key: "value"
            });
            assert.equal(result.ok, true)
        });
    });

    describe("http metrics", function() {
        it("should send metric for http requests", async function() {
            nock(`http://example.com`).get("/test").reply(200, {ok: true});
            const receivedMetrics = nockNewRelic();

            const metrics = new NewRelic( FAKE_PARAMS );

            await fetch("http://example.com/test")

            await metrics.activationFinished();
            await metricsDone();

            assert.equal(receivedMetrics.length, 1);
            assert.equal(receivedMetrics[0].eventType, "http");
            assert.equal(receivedMetrics[0].url, "http://example.com/test");
            assert.equal(receivedMetrics[0].responseCode, 200);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
        });

        it("should send http metrics for concurrent activations", async function() {

            nock(`http://example.com`).get("/test").reply(200, {ok: true}).persist();
            const receivedMetrics = nockNewRelic();

            // simulate a bunch of concurrent activations
            const ACTIVATION_COUNT = 200;

            const activations = [];
            for (let i = 0; i < ACTIVATION_COUNT; i++) {
                activations[i] = NewRelic.instrument(async () => {
                    // add some random separation of the different activations
                    await sleep(Math.random() * 10);

                    const metrics = new NewRelic({
                        ...FAKE_PARAMS,
                        sendIntervalMs: 500
                    });
                    metrics.add({
                        activationId: i
                    });

                    // each makes a http request
                    await fetch("http://example.com/test");
                    await fetch("http://example.com/test");
                    await fetch("http://example.com/test");
                    await fetch("http://example.com/test");

                    await metrics.activationFinished();
                })();
            }
            await Promise.all(activations);

            await metricsDone(500);

            assert.equal(receivedMetrics.length, ACTIVATION_COUNT * 4);
            receivedMetrics.forEach(m => {
                assert.equal(m.eventType, "http");
                assert.equal(m.url, "http://example.com/test");
                assert.equal(m.responseCode, 200);
                assertObjectMatches(m, {
                    actionName: "action",
                    namespace: "namespace",
                    package: "package",
                    timestamp: /\d+/
                });
            });
            // make sure all activation ids are found, but could be any order
            for (let i = 0; i < ACTIVATION_COUNT; i++) {
                assert(receivedMetrics.some(m => m.activationId === i), `did not find activation id ${i}`);
            }
        });
    });
});