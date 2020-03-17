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
const MetricsTestHelper = require('../lib/testhelper');

const assert = require("assert");
const nock = require('nock');
const sleep = require('util').promisify(setTimeout);
const fetch = require("node-fetch");

const EVENT_TYPE = "myevent";

const FAKE_PARAMS = Object.freeze({
    newRelicEventsURL: MetricsTestHelper.MOCK_URL,
    newRelicApiKey: MetricsTestHelper.MOCK_API_KEY,
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

describe("NewRelic", function() {

    beforeEach(function() {
        process.env.__OW_ACTION_NAME = "/namespace/package/action";
        process.env.__OW_NAMESPACE = "namespace";
        process.env.__OW_ACTIVATION_ID = "activationId";
        process.env.__OW_DEADLINE = Date.now() + 60000;

        // wrap all tests with the required instrumentation
        this.currentTest.fn = NewRelic.instrument(this.currentTest.fn);
        MetricsTestHelper.beforeTest();
    });

    afterEach(function() {
        delete process.env.DISABLE_ACTION_TIMEOUT_METRIC;
        delete process.env.__OW_ACTION_NAME;
        delete process.env.__OW_NAMESPACE;
        delete process.env.__OW_ACTIVATION_ID;
        delete process.env.__OW_DEADLINE;

        MetricsTestHelper.afterTest();
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
                newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if url is null", async function() {
            const params = {
                newRelicEventsURL: null,
                newRelicApiKey: MetricsTestHelper.MOCK_API_KEY
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is blank string", async function() {
            const params = {
                newRelicEventsURL: MetricsTestHelper.MOCK_URL,
                newRelicApiKey: '\n'
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is not a string", async function() {
            const params = {
                newRelicEventsURL: MetricsTestHelper.MOCK_URL,
                newRelicApiKey: 2
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });

        it("constructor should log but not throw error if api key is undefined", async function() {
            const params = {
                newRelicEventsURL: MetricsTestHelper.MOCK_URL
            };

            const metrics = new NewRelic(params);
            assert.ok(metrics);
            await metrics.send();
        });
    });

    describe("send()", function() {

        it("sendMetrics", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            const metrics = new NewRelic(FAKE_PARAMS);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
            assert.equal(receivedMetrics.length, 1);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: EVENT_TYPE,
                test: "value"
            });
    });

        it("sendMetrics - default metrics frozen object", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            const defaultMetrics = Object.freeze({
                duration: 2000
            });
            const metrics = new NewRelic(FAKE_PARAMS, defaultMetrics);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
            assert.equal(receivedMetrics.length, 1);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: EVENT_TYPE,
                test: "value",
                duration: 2000
            });
        });

        it("sendMetrics - default metrics", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            const defaultMetrics = {
                duration: 2000
            };
            const metrics = new NewRelic(FAKE_PARAMS, defaultMetrics);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
            assert.equal(receivedMetrics.length, 1);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: EVENT_TYPE,
                test: "value",
                duration: 2000
            });
            assert.equal(Object.keys(defaultMetrics), "duration");
            assert.equal(defaultMetrics.duration, 2000);
        });

        it("sendMetrics - fail with 500 but not throw error", async function() {
            nock(MetricsTestHelper.MOCK_BASE_URL)
                .post(MetricsTestHelper.MOCK_URL_PATH)
                .reply(500)

            const metrics = new NewRelic(FAKE_PARAMS);
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
        });

        it("sendMetrics - request throws error but it is handled", async function() {
            nock(MetricsTestHelper.MOCK_BASE_URL)
                .post(MetricsTestHelper.MOCK_URL_PATH)
                .replyWithError("faked error");

            const metrics = new NewRelic({
                ...FAKE_PARAMS,
            });
            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.activationFinished();

            await MetricsTestHelper.metricsDone();
        });

        it("sendMetrics - for concurrent activations", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

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

            await MetricsTestHelper.metricsDone(500);

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
        const receivedMetrics = MetricsTestHelper.mockNewRelic();

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

        await MetricsTestHelper.metricsDone();
        assert.equal(receivedMetrics.length, 3);
        assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
        assertObjectMatches(receivedMetrics[0], {
            eventType: EVENT_TYPE,
            test: "value",
            added: "metric",
            anotherAdded: "metric"
        });
        assertObjectMatches(receivedMetrics[1], EXPECTED_METRICS);
        assertObjectMatches(receivedMetrics[1], {
            eventType: EVENT_TYPE,
            test: "value",
            added: "metric2",
            anotherAdded: "metric"
        });
        assertObjectMatches(receivedMetrics[2], EXPECTED_METRICS);
        assertObjectMatches(receivedMetrics[2], {
            eventType: EVENT_TYPE,
            added: "metric3",
            anotherAdded: "metric"
        });
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
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( FAKE_PARAMS );

            await MetricsTestHelper.metricsDone();
            assert.equal(receivedMetrics.length, 1);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: "timeout",
                duration: /\d+/
            });
        });

        it("timeout metrics with callback", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( Object.assign( {}, FAKE_PARAMS, {
                actionTimeoutMetricsCb: () => {
                    return { test: 'add_value'};
                }
            }));

            await MetricsTestHelper.metricsDone(300);
            assert.equal(receivedMetrics.length, 1);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: "timeout",
                test: 'add_value'
            });
        });

        it("timeout metrics with callback, custom eventType", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( Object.assign( {}, FAKE_PARAMS, {
                actionTimeoutMetricsCb: () => {
                    return {
                        eventType: "custom",
                        test: 'add_value'
                    };
                }
            }));

            await MetricsTestHelper.metricsDone(300);
            assert.equal(receivedMetrics.length, 1);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: "custom",
                test: 'add_value'
            });
        });

        it("timeout metrics with invalid callback", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( Object.assign( {}, FAKE_PARAMS, {
                actionTimeoutMetricsCb: { test: 'add_value'}
            }));

            await MetricsTestHelper.metricsDone(300);
            assert.equal(receivedMetrics.length, 1);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: "timeout",
                duration: /\d+/
            });
        });

        it("timeout metrics disabled with options", async function() {
            const mustNotHappen = nock(MetricsTestHelper.MOCK_BASE_URL)
                .post(MetricsTestHelper.MOCK_URL_PATH)
                .reply(200)

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic( Object.assign( {}, FAKE_PARAMS, {
                disableActionTimeout: true
            } ));
            await sleep(300);
            assert.ok(!mustNotHappen.isDone(), "timeout metrics was sent even though it should be disabled");
        });

        it("timeout metrics disabled with environment variable", async function() {
            const mustNotHappen = nock(MetricsTestHelper.MOCK_BASE_URL)
                .post(MetricsTestHelper.MOCK_URL_PATH)
                .reply(200)

            process.env.DISABLE_ACTION_TIMEOUT_METRIC = true;

            process.env.__OW_DEADLINE = Date.now() + 100;
            new NewRelic(FAKE_PARAMS);
            await sleep(300); // wait to past action timeout to make sure no timeout metrics are sent
            assert.ok(!mustNotHappen.isDone(), "timeout metrics was sent even though it should be disabled");
        });

        it("timeout metrics with add()", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            const metrics = new NewRelic( FAKE_PARAMS );
            metrics.add({added: "metric"});

            await MetricsTestHelper.metricsDone(300);
            assert.equal(receivedMetrics.length, 1);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: "timeout",
                added: "metric",
                duration: /\d+/
            });
        });

        it("send all queued metrics on timeout", async function() {
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            process.env.__OW_DEADLINE = Date.now() + 100;
            const metrics = new NewRelic( FAKE_PARAMS );

            await metrics.send(EVENT_TYPE, { test: "value" });
            await metrics.send(EVENT_TYPE, { test: "value2" });

            await MetricsTestHelper.metricsDone(300);
            assert.equal(receivedMetrics.length, 3);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[0], {
                eventType: EVENT_TYPE,
                test: "value"
            });
            assertObjectMatches(receivedMetrics[1], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[1], {
                eventType: EVENT_TYPE,
                test: "value2"
            });
            assertObjectMatches(receivedMetrics[2], EXPECTED_METRICS);
            assertObjectMatches(receivedMetrics[2], {
                eventType: "timeout",
                duration: /\d+/
            });
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
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

            const metrics = new NewRelic( FAKE_PARAMS );

            await fetch("http://example.com/test")

            await metrics.activationFinished();
            await MetricsTestHelper.metricsDone();

            assert.equal(receivedMetrics.length, 1);
            assert.equal(receivedMetrics[0].eventType, "http");
            assert.equal(receivedMetrics[0].url, "http://example.com/test");
            assert.equal(receivedMetrics[0].responseCode, 200);
            assertObjectMatches(receivedMetrics[0], EXPECTED_METRICS);
        });

        it("should send http metrics for concurrent activations", async function() {

            nock(`http://example.com`).get("/test").reply(200, {ok: true}).persist();
            const receivedMetrics = MetricsTestHelper.mockNewRelic();

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

            await MetricsTestHelper.metricsDone(500);

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